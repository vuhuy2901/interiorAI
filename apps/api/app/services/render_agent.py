"""Production render-agent orchestration around the canonical scene.

This module deliberately does not mutate ``CanonicalProject`` and does not use an
image model as a substitute for geometry.  It plans from the current revision,
delegates the actual render to the existing Cycles queue, then runs deterministic
file QA before publishing the result.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import get_project
from app.models.contracts import CanonicalProject
from app.services.blender_mcp import (
    _compute_camera_spec,
    _save_render_job,
    cancel_render_job,
    compute_project_material_hash,
    enqueue_render_job,
    get_render_job,
)
from app.services.geometry import analyze_scene_spatial_quality, get_room_bounds_mm

router = APIRouter()

CAMERA_PRESETS = {
    "hero": "eye_level",
    "wide": "wide",
    "corner": "corner",
    "detail": "detail_sofa",
    "top_down": "top",
    "isometric": "orbit",
}

LIGHTING_PRESETS = {
    "daylight": {"time_of_day": "day", "label": "Natural Daylight"},
    "evening": {"time_of_day": "sunset", "label": "Warm Evening"},
    "luxury": {"time_of_day": "sunset", "label": "Luxury Interior"},
    "studio": {"time_of_day": "day", "label": "Studio Architectural"},
    "soft_minimalist": {"time_of_day": "day", "label": "Soft Minimalist"},
}

QUALITY_PRESETS = {
    "draft": {"mode": "preview", "width_px": 960, "height_px": 540, "samples": 24},
    "standard": {"mode": "final", "width_px": 1920, "height_px": 1080, "samples": 64},
    "high": {"mode": "final", "width_px": 2560, "height_px": 1440, "samples": 96},
    "ultra": {"mode": "final", "width_px": 3840, "height_px": 2160, "samples": 128},
}


class RenderAgentRequest(BaseModel):
    camera_preset: str = "hero"
    lighting_preset: str = "daylight"
    quality_preset: str = "standard"
    seed: int = Field(1234, ge=0, le=2_147_483_647)
    force: bool = False


def _normalise_request(body: RenderAgentRequest) -> Dict[str, Any]:
    camera_preset = body.camera_preset.strip().lower()
    lighting_preset = body.lighting_preset.strip().lower()
    quality_preset = body.quality_preset.strip().lower()
    if camera_preset not in CAMERA_PRESETS:
        raise ValueError(f"camera_preset không hợp lệ: {camera_preset}")
    if lighting_preset not in LIGHTING_PRESETS:
        raise ValueError(f"lighting_preset không hợp lệ: {lighting_preset}")
    if quality_preset not in QUALITY_PRESETS:
        raise ValueError(f"quality_preset không hợp lệ: {quality_preset}")
    return {
        "camera_preset": camera_preset,
        "camera_id": CAMERA_PRESETS[camera_preset],
        "lighting_preset": lighting_preset,
        "quality_preset": quality_preset,
        "seed": int(body.seed),
        "force": bool(body.force),
    }


def _room_summary(project: CanonicalProject) -> list[Dict[str, Any]]:
    return [
        {
            "id": room.id,
            "name": room.name,
            "room_type": room.room_type,
            "ceiling_height_mm": room.ceiling_height_mm,
            "polygon_vertex_count": len(room.polygon_mm),
            "floor_material_id": room.floor_material_id,
            "wall_material_id": room.wall_base_material_id,
            "ceiling_material_id": room.ceiling_material_id,
        }
        for room in project.rooms
    ]


def inspect_scene(project: CanonicalProject) -> Dict[str, Any]:
    """Return a traceable, read-only SceneAnalysis for the current revision."""
    spatial = analyze_scene_spatial_quality(project)
    room_bounds = get_room_bounds_mm(project)
    geometry_issues = list(spatial.get("warnings") or [])
    if not project.rooms:
        geometry_issues.insert(0, "Canonical scene chưa có room polygon.")
    if not project.walls:
        geometry_issues.insert(0, "Canonical scene chưa có wall segments.")
    object_ids = [f.id for f in project.furniture_instances]
    duplicate_ids = sorted({item for item in object_ids if object_ids.count(item) > 1})
    if duplicate_ids:
        geometry_issues.append("Object ID trùng: " + ", ".join(duplicate_ids))
    material_ids = sorted({
        value
        for room in project.rooms
        for value in (room.floor_material_id, room.wall_base_material_id, room.ceiling_material_id)
        if value
    } | {
        value
        for wall in project.walls
        for value in (wall.face_a_material_id, wall.face_b_material_id)
        if value
    } | {
        value
        for furniture in project.furniture_instances
        for value in ((furniture.part_materials or {}).values())
        if value
    })
    return {
        "scene_id": project.project_id,
        "revision": project.revision,
        "source": "CanonicalProject",
        "units": project.units,
        "scale_calibrated": project.scale_calibrated,
        "room_bounds_mm": list(room_bounds),
        "rooms": _room_summary(project),
        "counts": {
            "rooms": len(project.rooms),
            "walls": len(project.walls),
            "doors": len(project.openings),
            "windows": len(project.windows),
            "furniture": len(project.furniture_instances),
            "materials": len(material_ids),
        },
        "object_ids": object_ids,
        "material_ids": material_ids,
        "spatial_validation": spatial,
        "geometry_issues": geometry_issues,
        "geometry_valid": not geometry_issues,
        "material_hash": compute_project_material_hash(project),
        "integrity_policy": {
            "mutates_scene": False,
            "preserves_object_ids": True,
            "requires_current_revision": True,
        },
    }


def build_render_plan(project: CanonicalProject, body: RenderAgentRequest) -> Dict[str, Any]:
    request = _normalise_request(body)
    scene = inspect_scene(project)
    quality = QUALITY_PRESETS[request["quality_preset"]]
    lighting = LIGHTING_PRESETS[request["lighting_preset"]]
    camera = _compute_camera_spec(project, request["camera_id"])
    plan_payload = {
        "scene_id": project.project_id,
        "revision": project.revision,
        "camera": camera,
        "lighting": {**lighting, "preset": request["lighting_preset"]},
        "quality": {"preset": request["quality_preset"], **quality},
        "material_hash": scene["material_hash"],
        "geometry_valid": scene["geometry_valid"],
    }
    plan_hash = hashlib.sha256(json.dumps(plan_payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return {
        "plan_id": f"rplan_{project.project_id}_{project.revision}_{plan_hash}",
        "agent": "architectural_visualization_rendering_agent",
        "scene_analysis": scene,
        "plan": plan_payload,
        "plan_hash": plan_hash,
        "status": "READY" if scene["geometry_valid"] else "NEEDS_REVIEW",
        "blocking_issues": scene["geometry_issues"],
    }


def inspect_render_output(path: Optional[str], expected: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic output QA; missing/blank files never become a success."""
    report: Dict[str, Any] = {
        "passed": False,
        "path": path,
        "checks": {},
        "issues": [],
        "renderer_truth": "BLENDER_CYCLES_OUTPUT",
    }
    if not path or not Path(path).is_file():
        report["issues"].append("Không có file render đầu ra.")
        return report
    output = Path(path)
    report["checks"]["file_exists"] = True
    report["checks"]["file_size"] = output.stat().st_size >= 1000
    try:
        from PIL import Image, ImageStat

        with Image.open(output) as image:
            image.load()
            report["width_px"], report["height_px"] = image.size
            stats = ImageStat.Stat(image.convert("RGB").resize((96, 54)))
            mean = round(sum(stats.mean) / 3.0, 2)
            stddev = round(sum(stats.stddev) / 3.0, 2)
            report["mean_luma"] = mean
            report["stddev"] = stddev
            report["metadata_keys"] = sorted(str(key) for key in image.info.keys())
        report["checks"]["resolution"] = [report["width_px"], report["height_px"]] == [expected["width_px"], expected["height_px"]]
        report["checks"]["not_blank"] = stddev >= 2.0
        report["checks"]["not_black"] = mean >= 4.0
        report["checks"]["not_clipped_white"] = mean <= 252.0
    except Exception as exc:
        report["issues"].append(f"Không đọc được ảnh để QA: {exc}")
    for key, passed in report["checks"].items():
        if passed is False:
            report["issues"].append(f"QA fail: {key}")
    report["passed"] = bool(report["checks"]) and not report["issues"] and all(
        value is True or isinstance(value, list) for value in report["checks"].values()
    )
    return report


def _attach_agent_metadata(job: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
    job["render_agent"] = "architectural_visualization_rendering_agent"
    job["render_agent_plan"] = plan
    job["scene_id"] = plan["scene_analysis"]["scene_id"]
    job["scene_revision"] = plan["scene_analysis"]["revision"]
    job["plan_hash"] = plan["plan_hash"]
    return _save_render_job(job)


def start_render_agent(project_id: str, body: RenderAgentRequest, synchronous: bool = False) -> Dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Không tìm thấy dự án {project_id}")
    plan = build_render_plan(project, body)
    if plan["status"] != "READY":
        raise ValueError("Render bị chặn bởi geometry QA: " + " | ".join(plan["blocking_issues"][:3]))
    request = _normalise_request(body)
    quality = QUALITY_PRESETS[request["quality_preset"]]
    lighting = LIGHTING_PRESETS[request["lighting_preset"]]
    key = f"agent:{project_id}:rev{project.revision}:{plan['plan_hash']}"
    job = enqueue_render_job(
        project_id,
        idempotency_key=key,
        mode=quality["mode"],
        camera=request["camera_id"],
        time_of_day=lighting["time_of_day"],
        seed=request["seed"],
        width_px=quality["width_px"],
        height_px=quality["height_px"],
        samples=quality["samples"],
        use_cache=True,
        async_exec=not synchronous,
    )
    return _attach_agent_metadata(job, plan)


def public_agent_job(job: Dict[str, Any]) -> Dict[str, Any]:
    plan = job.get("render_agent_plan") or {}
    quality = (plan.get("plan") or {}).get("quality") or {}
    report = job.get("quality_report")
    if job.get("status") == "COMPLETED" and not report:
        report = inspect_render_output(job.get("out_path"), quality)
        job["quality_report"] = report
        _save_render_job(job)
    return {
        "job_id": job.get("job_id"),
        "agent": job.get("render_agent") or "architectural_visualization_rendering_agent",
        "project_id": job.get("project_id"),
        "scene_id": job.get("scene_id") or job.get("project_id"),
        "revision": job.get("scene_revision") or job.get("revision"),
        "status": job.get("status"),
        "stage": "quality_inspection" if report else ("rendering" if job.get("status") == "RUNNING" else "queued"),
        "render_url": job.get("render_url"),
        "download_url": job.get("download_url"),
        "metadata_url": job.get("metadata_url"),
        "plan": plan.get("plan"),
        "plan_hash": job.get("plan_hash"),
        "quality_report": report,
        "error": job.get("error_message"),
        "elapsed_s": round(max(0.0, (time.time() - time.mktime(time.strptime(job["created_at"][:19], "%Y-%m-%dT%H:%M:%S")))) if job.get("created_at") else 0.0, 1),
    }


@router.get("/api/v1/projects/{project_id}/render/agent/capabilities")
def api_render_agent_capabilities(project_id: str):
    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return {
        "agent": "architectural_visualization_rendering_agent",
        "cameras": sorted(CAMERA_PRESETS),
        "lighting": sorted(LIGHTING_PRESETS),
        "quality": sorted(QUALITY_PRESETS),
        "renderer": "BLENDER_CYCLES",
        "ai_is_not_geometry_source": True,
    }


@router.post("/api/v1/projects/{project_id}/render/agent/plan")
def api_render_agent_plan(project_id: str, body: RenderAgentRequest = RenderAgentRequest()):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    try:
        return build_render_plan(project, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/v1/projects/{project_id}/render/agent")
def api_start_render_agent(project_id: str, body: RenderAgentRequest = RenderAgentRequest()):
    try:
        return public_agent_job(start_render_agent(project_id, body))
    except ValueError as exc:
        status = 404 if "Không tìm thấy dự án" in str(exc) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.get("/api/v1/render/agent/{job_id}")
def api_get_render_agent(job_id: str):
    job = get_render_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy render-agent job")
    return public_agent_job(job)


@router.post("/api/v1/render/agent/{job_id}/cancel")
def api_cancel_render_agent(job_id: str):
    try:
        return public_agent_job(cancel_render_job(job_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
