"""Generate reproducible G0 evidence without claiming 2D output is photorealistic."""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import build_default_demo_project  # noqa: E402
from app.services.asset_pipeline import (  # noqa: E402
    asset_license_report,
    get_asset_metadata,
    validate_glb,
)
from app.services.blender_mcp import is_blender_available  # noqa: E402
from app.services.house_plan_designer import (  # noqa: E402
    build_default_multiroom_floorspec,
    convert_floorspec_to_canonical_project,
)
from app.services.render_engine import render_scene_visual  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    evidence = ROOT / "docs" / "build" / "EVIDENCE" / "G0_2026-11-10"
    baseline = evidence / "baseline"
    baseline.mkdir(parents=True, exist_ok=True)
    cameras = ["front", "corner", "wide", "top", "detail"]
    scenes = {
        "demo_4x5m": build_default_demo_project(),
        "multiroom": convert_floorspec_to_canonical_project(
            build_default_multiroom_floorspec(scale_confirmed=True, reference_length_mm=4000),
            project_id="audit_multiroom",
            project_name="G0 Multiroom Audit",
        ),
    }

    render_records = []
    for scene_name, project in scenes.items():
        for camera in cameras:
            output = baseline / f"{scene_name}_{camera}.png"
            result = render_scene_visual(project, output, camera=camera, width_px=960, height_px=640)
            render_records.append(
                {
                    "scene": scene_name,
                    "camera_requested": camera,
                    "path": str(output.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": sha256(output),
                    "bytes": output.stat().st_size,
                    "renderer": result["renderer"],
                    "render_kind": result["render_kind"],
                    "photorealistic": result["photorealistic"],
                    "camera_applied": result["camera_applied"],
                }
            )

    per_scene_hashes = {
        scene: sorted({item["sha256"] for item in render_records if item["scene"] == scene})
        for scene in scenes
    }
    blender_available, blender_message = is_blender_available()
    asset_id = "asset_ph_sofa_01_1k"
    asset = get_asset_metadata(asset_id)
    asset_path = ROOT / "data" / "assets" / "library" / asset_id / "normalized.glb"
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "G0 baseline + G1 vertical-slice evidence",
        "renders": render_records,
        "camera_hash_summary": per_scene_hashes,
        "camera_behavior": "FAIL: camera ignored" if any(len(v) == 1 for v in per_scene_hashes.values()) else "PASS",
        "blender": {
            "available": blender_available,
            "status": "AVAILABLE" if blender_available else "BLOCKED",
            "message": blender_message,
        },
        "asset": {
            "metadata": asset.model_dump() if asset else None,
            "glb_validation": validate_glb(asset_path) if asset_path.is_file() else None,
            "glb_sha256": sha256(asset_path) if asset_path.is_file() else None,
        },
        "license_report": asset_license_report(),
    }
    (evidence / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"evidence": str(evidence), "camera_behavior": manifest["camera_behavior"]}))


if __name__ == "__main__":
    main()
