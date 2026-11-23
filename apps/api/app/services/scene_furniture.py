"""Add-only canonical scene writes: MCP first, then an atomic SQLite CAS/receipt."""
from __future__ import annotations

import asyncio
import hashlib
import json
import math

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import db
from app.models.contracts import CanonicalProject, FurnitureInstance
from app.services.cost_engine import calculate_project_estimate
from app.services.geometry import analyze_scene_spatial_quality
from app.services.mcp_gateway import sync_canonical_to_pascal
from app.services.smart_fit import oriented_corners, point_in_polygon, polygons_overlap_sat
from app.services.pascal_scene_asset_bridge import (
    PascalFurnitureAssetReference,
    build_scene_furniture_payload,
    validate_pascal_asset_reference,
)

router = APIRouter()
_locks: dict[str, asyncio.Lock] = {}


class FurnitureAddition(FurnitureInstance):
    # Do not inherit illustrative catalog pricing or geometry for a new object.
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=200)
    room_id: str = Field(min_length=1)
    category: str = Field(min_length=1)
    x_mm: float
    y_mm: float
    z_mm: float = Field(default=0, ge=0)
    width_mm: float = Field(gt=0)
    depth_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)
    price_vnd: float = Field(ge=0)
    pascal_asset_id: str = Field(min_length=1)


class AddFurnitureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_revision: int = Field(strict=True, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=200)
    item: FurnitureAddition

    @model_validator(mode="after")
    def nonblank_identity(self):
        if not self.idempotency_key.strip() or not self.item.id.strip():
            raise ValueError("idempotency_key and item.id must not be blank")
        return self


class FurniMeshSceneAdditionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=1, max_length=200)
    reference: PascalFurnitureAssetReference
    room_id: str = Field(min_length=1)
    category: str = Field(min_length=1)
    name: str = Field(min_length=1)
    price_vnd: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def nonblank_identity(self):
        if not self.idempotency_key.strip():
            raise ValueError("idempotency_key must not be blank")
        return self


class FurnitureTransform(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=200)
    x_mm: float
    y_mm: float
    rotation_deg: float = 0


class ApplyFurnitureLayoutRequest(BaseModel):
    """Move existing objects only; dimensions, identity and object count are immutable."""
    model_config = ConfigDict(extra="forbid")
    base_revision: int = Field(strict=True, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=200)
    moves: list[FurnitureTransform] = Field(min_length=1)
    minimum_clearance_mm: float | None = Field(default=None, ge=0)
    approval_evidence: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def unique_nonblank_ids(self):
        ids = [move.id.strip() for move in self.moves]
        if not self.idempotency_key.strip() or not self.approval_evidence.strip() or any(not item_id for item_id in ids):
            raise ValueError("idempotency_key, approval_evidence and move ids must not be blank")
        if len(ids) != len(set(ids)):
            raise ValueError("moves must contain unique furniture ids")
        return self


def _receipt(body: AddFurnitureRequest) -> tuple[str, str]:
    key = hashlib.sha256(body.idempotency_key.encode()).hexdigest()
    # Revision is part of the request: retries must reuse the original envelope.
    payload = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    prefix = f"furniture.add:{key}:"
    return prefix, prefix + fingerprint


def _layout_receipt(body: ApplyFurnitureLayoutRequest) -> tuple[str, str]:
    key = hashlib.sha256(body.idempotency_key.encode()).hexdigest()
    payload = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    prefix = f"furniture.layout:{key}:"
    return prefix, prefix + fingerprint


def _replay(conn, project_id: str, prefix: str, receipt: str):
    row = conn.execute(
        "SELECT reason, payload_json FROM scene_revisions WHERE project_id = ? AND substr(reason, 1, ?) = ? ORDER BY id LIMIT 1",
        (project_id, len(prefix), prefix),
    ).fetchone()
    if row is None:
        return None
    if row["reason"] != receipt:
        raise HTTPException(409, detail={"reason": "idempotency_key_payload_mismatch"})
    return CanonicalProject.model_validate_json(row["payload_json"])


def _result(project: CanonicalProject, replayed: bool):
    evidence = project.pascal_scene_json.get("atelier_addition", {})
    return {
        "ok": True, "operation": "scene.apply", "project_id": project.project_id,
        "revision": project.revision, "replayed": replayed,
        "project": project.model_dump(), "spatial_qa": analyze_scene_spatial_quality(project),
        "validation": evidence,
        "price_status": evidence.get("price_status", "unknown"),
    }


def _layout_result(project: CanonicalProject, replayed: bool):
    evidence = project.pascal_scene_json.get("atelier_layout", {})
    return {
        "ok": True,
        "operation": "scene.layout.apply",
        "project_id": project.project_id,
        "revision": project.revision,
        "replayed": replayed,
        "moved_ids": evidence.get("moved_ids", []),
        "spatial_qa": evidence.get("after", analyze_scene_spatial_quality(project)),
        "pascal_verification": evidence.get("pascal_verification"),
        "estimate": project.estimate_snapshot.model_dump() if project.estimate_snapshot else None,
        "project": project.model_dump(),
    }


def _point_segment_distance(point, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    denominator = dx * dx + dy * dy
    t = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denominator)) if denominator else 0
    return math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy)


def validate_addition(project: CanonicalProject, item: FurnitureInstance) -> dict:
    """Only the new solid is gated. Access-route judgments remain explicit QA."""
    room = next((room for room in project.rooms if room.id == item.room_id), None)
    if room is None or len(room.polygon_mm) < 3:
        raise HTTPException(422, detail="item.room_id must identify a room with canonical geometry")
    footprint = oriented_corners(item.x_mm, item.y_mm, item.width_mm, item.depth_mm, item.rotation_deg)
    edges = list(zip(room.polygon_mm, room.polygon_mm[1:] + room.polygon_mm[:1]))
    own_edges = list(zip(footprint, footprint[1:] + footprint[:1]))
    def inside(point):
        return point_in_polygon(point, room.polygon_mm) or any(_point_segment_distance(point, a, b) < 1e-6 for a, b in edges)
    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    crossing = any(cross(a, b, c) * cross(a, b, d) < -1e-6 and cross(c, d, a) * cross(c, d, b) < -1e-6
                   for a, b in own_edges for c, d in edges)
    within_room = (all(inside(p) for p in footprint) and not crossing
                   and all(inside(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) for a, b in own_edges))
    collisions, clearances, supported_by = [], {}, []
    for other in project.furniture_instances:
        if other.room_id != item.room_id:
            continue
        if other.category.lower() in {"rug", "carpet"} and other.height_mm <= 50 and other.z_mm <= 50:
            supported_by.append(other.id)
            continue
        if min(item.z_mm + item.height_mm, other.z_mm + other.height_mm) <= max(item.z_mm, other.z_mm):
            continue
        other_points = oriented_corners(other.x_mm, other.y_mm, other.width_mm, other.depth_mm, other.rotation_deg)
        if polygons_overlap_sat(footprint, other_points):
            collisions.append(other.id)
        else:
            other_edges = list(zip(other_points, other_points[1:] + other_points[:1]))
            clearances[other.id] = round(min(
                [_point_segment_distance(p, a, b) for p in footprint for a, b in other_edges]
                + [_point_segment_distance(p, a, b) for p in other_points for a, b in own_edges]
            ), 3)
    result = {"inside_room": within_room, "below_ceiling": item.z_mm + item.height_mm <= room.ceiling_height_mm,
              "collision_ids": collisions, "solid_clearances_mm": clearances, "excluded_floor_coverings": supported_by,
              "access_route_validated": False, "method": "new_object_polygon_containment_and_vertical_sat",
              "limitation": "Measured solid gaps do not establish passage use or door swing; task QA must assess those separately."}
    result["valid"] = within_room and result["below_ceiling"] and not collisions
    return result


@router.post("/api/v1/projects/{project_id}/furniture")
async def add_furniture(project_id: str, body: AddFurnitureRequest):
    # No lease expiry: a slow MCP operation retains ownership until completion.
    lock = _locks.setdefault(project_id, asyncio.Lock())
    async with lock:
        prefix, receipt = _receipt(body)
        conn = db.get_conn()
        try:
            row = conn.execute("SELECT revision, payload_json FROM projects WHERE project_id = ?", (project_id,)).fetchone()
            if row is None:
                raise HTTPException(404, detail="Project not found")
            replay = _replay(conn, project_id, prefix, receipt)
            if replay is not None:
                return _result(replay, True)
        finally:
            conn.close()
        if row["revision"] != body.base_revision:
            raise HTTPException(409, detail={"reason": "revision_mismatch", "current_revision": row["revision"]})
        project = CanonicalProject.model_validate_json(row["payload_json"])
        baseline_qa = analyze_scene_spatial_quality(project)
        if any(item.id == body.item.id for item in project.furniture_instances):
            raise HTTPException(409, detail={"reason": "furniture_id_exists", "object_id": body.item.id})
        addition_qa = validate_addition(project, body.item)
        if not addition_qa["valid"]:
            raise HTTPException(422, detail={"reason": "invalid_furniture_addition", "validation": addition_qa})
        project.furniture_instances.append(FurnitureInstance.model_validate(body.item.model_dump()))
        project.revision = body.base_revision + 1
        project.updated_at = db.now_iso()
        # An old price estimate must not masquerade as an estimate of the new scene.
        project.estimate_snapshot = None

        # Gateway builds an isolated exported scene. Never hold SQLite locks over IO.
        try:
            sync = await sync_canonical_to_pascal(project)
        except Exception as exc:
            raise HTTPException(502, detail={"reason": "pascal_sync_failed"}) from exc
        scene = sync.get("scene")
        node_ids = sync.get("furnitureNodeIds", {})
        if (sync.get("ok") is not True or sync.get("verification", {}).get("valid") is not True
                or not isinstance(scene, dict) or not scene.get("nodes")
                or any(not node_ids.get(item.id) or node_ids[item.id] not in scene["nodes"] for item in project.furniture_instances)):
            raise HTTPException(502, detail={"reason": "pascal_sync_failed_or_invalid_scene"})
        project.pascal_scene_json = scene
        for item in project.furniture_instances:
            item.pascal_node_id = node_ids[item.id]
        current_qa = analyze_scene_spatial_quality(project)
        project.pascal_scene_json["atelier_addition"] = {
            "object_id": body.item.id, "baseline_revision": body.base_revision,
            "baseline": baseline_qa, "after": current_qa,
            "addition": addition_qa,
            "introduced_warnings": [warning for warning in current_qa["warnings"] if warning not in baseline_qa["warnings"]],
            "price_status": "unknown" if body.item.price_vnd == 0 else "provided_unverified",
            "pascal_verification": sync.get("verification"), "pascal_collisions": sync.get("collisions"),
            "geometry_representation": sync.get("geometryRepresentation"),
        }
        payload = project.model_dump_json()

        conn = db.get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            # Also cover another process completing the same request during MCP IO.
            replay = _replay(conn, project_id, prefix, receipt)
            if replay is not None:
                return _result(replay, True)
            changed = conn.execute(
                "UPDATE projects SET revision = ?, payload_json = ?, updated_at = ? WHERE project_id = ? AND revision = ? AND payload_json = ?",
                (project.revision, payload, project.updated_at, project_id, body.base_revision, row["payload_json"]),
            ).rowcount
            if changed != 1:
                raise HTTPException(409, detail={"reason": "revision_mismatch", "message": "Scene changed during Pascal sync; read it again"})
            conn.execute(
                "INSERT INTO scene_revisions (project_id, revision, author, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, project.revision, "Pascal Scene Adapter", receipt, payload, project.updated_at),
            )
            conn.commit()
        finally:
            # A rejected CAS or receipt conflict rolls back both scene and history.
            conn.close()
        return _result(project, False)


@router.post("/api/v1/projects/{project_id}/furniture/from-furnimesh")
async def add_furnimesh_furniture(project_id: str, body: FurniMeshSceneAdditionRequest):
    """Convert a reviewed FurniMesh reference into the existing CAS write envelope."""
    if body.reference.scene_id != project_id:
        raise HTTPException(status_code=409, detail={"reason": "scene_id_mismatch"})
    conn = db.get_conn()
    try:
        row = conn.execute("SELECT revision FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        validate_pascal_asset_reference(
            body.reference,
            active_scene_id=project_id,
            active_revision=row["revision"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"reason": "scene_asset_reference_invalid", "message": str(exc)}) from exc
    payload = build_scene_furniture_payload(
        body.reference,
        room_id=body.room_id,
        category=body.category,
        name=body.name,
        price_vnd=body.price_vnd,
    )
    return await add_furniture(
        project_id,
        AddFurnitureRequest(
            base_revision=body.reference.expected_revision,
            idempotency_key=body.idempotency_key,
            item=FurnitureAddition.model_validate(payload),
        ),
    )


@router.patch("/api/v1/projects/{project_id}/furniture/layout")
async def apply_furniture_layout(project_id: str, body: ApplyFurnitureLayoutRequest):
    """Atomically persist approved transforms and regenerate the canonical Pascal scene."""
    lock = _locks.setdefault(project_id, asyncio.Lock())
    async with lock:
        prefix, receipt = _layout_receipt(body)
        conn = db.get_conn()
        try:
            row = conn.execute(
                "SELECT revision, payload_json FROM projects WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(404, detail="Project not found")
            replay = _replay(conn, project_id, prefix, receipt)
            if replay is not None:
                return _layout_result(replay, True)
        finally:
            conn.close()
        if row["revision"] != body.base_revision:
            raise HTTPException(409, detail={"reason": "revision_mismatch", "current_revision": row["revision"]})

        project = CanonicalProject.model_validate_json(row["payload_json"])
        baseline_qa = analyze_scene_spatial_quality(project)
        furniture_by_id = {item.id: item for item in project.furniture_instances}
        missing = [move.id for move in body.moves if move.id not in furniture_by_id]
        if missing:
            raise HTTPException(404, detail={"reason": "furniture_not_found", "object_ids": missing})
        for move in body.moves:
            item = furniture_by_id[move.id]
            item.x_mm = move.x_mm
            item.y_mm = move.y_mm
            item.rotation_deg = move.rotation_deg % 360

        current_qa = analyze_scene_spatial_quality(project)
        hard_failures = (
            current_qa["collision_count"]
            + current_qa["boundary_violation_count"]
            + current_qa["door_swing_warning_count"]
        )
        if hard_failures:
            raise HTTPException(422, detail={"reason": "invalid_furniture_layout", "spatial_qa": current_qa})
        if (body.minimum_clearance_mm is not None and current_qa["min_walkway_mm"] is not None
                and current_qa["min_walkway_mm"] < body.minimum_clearance_mm):
            raise HTTPException(422, detail={
                "reason": "minimum_clearance_not_met",
                "required_mm": body.minimum_clearance_mm,
                "actual_mm": current_qa["min_walkway_mm"],
                "spatial_qa": current_qa,
            })

        project.revision = body.base_revision + 1
        project.updated_at = db.now_iso()
        project.estimate_snapshot = calculate_project_estimate(project)
        try:
            sync = await sync_canonical_to_pascal(project)
        except Exception as exc:
            raise HTTPException(502, detail={"reason": "pascal_sync_failed"}) from exc
        scene = sync.get("sceneJson") or sync.get("scene")
        node_ids = sync.get("furnitureNodeIds", {})
        if (sync.get("ok") is not True or sync.get("verification", {}).get("valid") is not True
                or not isinstance(scene, dict) or not scene.get("nodes")
                or any(not node_ids.get(item.id) or node_ids[item.id] not in scene["nodes"] for item in project.furniture_instances)):
            raise HTTPException(502, detail={"reason": "pascal_sync_failed_or_invalid_scene"})
        project.pascal_scene_json = scene
        for item in project.furniture_instances:
            item.pascal_node_id = node_ids[item.id]
        project.pascal_scene_json["atelier_layout"] = {
            "moved_ids": [move.id for move in body.moves],
            "baseline_revision": body.base_revision,
            "baseline": baseline_qa,
            "after": current_qa,
            "minimum_clearance_mm": body.minimum_clearance_mm,
            "approval_evidence": body.approval_evidence,
            "pascal_verification": sync.get("verification"),
            "pascal_collisions": sync.get("collisions"),
        }
        payload = project.model_dump_json()

        conn = db.get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            replay = _replay(conn, project_id, prefix, receipt)
            if replay is not None:
                return _layout_result(replay, True)
            changed = conn.execute(
                "UPDATE projects SET revision = ?, payload_json = ?, updated_at = ? "
                "WHERE project_id = ? AND revision = ? AND payload_json = ?",
                (project.revision, payload, project.updated_at, project_id, body.base_revision, row["payload_json"]),
            ).rowcount
            if changed != 1:
                raise HTTPException(409, detail={
                    "reason": "revision_mismatch",
                    "message": "Scene changed during Pascal sync; read it again",
                })
            conn.execute(
                "INSERT INTO scene_revisions (project_id, revision, author, reason, payload_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, project.revision, "Approved Furniture Layout", receipt, payload, project.updated_at),
            )
            conn.commit()
        finally:
            conn.close()
        return _layout_result(project, False)
