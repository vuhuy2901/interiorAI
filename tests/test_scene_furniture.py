"""Furniture CAS tests use only a temporary SQLite database, never live state."""
import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from app import db
from app.models.contracts import FurnitureInstance
from app.services import scene_furniture as service
from app.services.geometry import analyze_scene_spatial_quality


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "scene-test.db")
    conn = db.get_conn()
    conn.executescript("""
        CREATE TABLE projects(project_id TEXT PRIMARY KEY, name TEXT, revision INTEGER, payload_json TEXT, updated_at TEXT);
        CREATE TABLE scene_revisions(id INTEGER PRIMARY KEY, project_id TEXT, revision INTEGER, author TEXT, reason TEXT, payload_json TEXT, created_at TEXT);
    """)
    conn.close()
    project = db.build_japandi_master_bedroom_project()
    db.save_project(project, bump_revision=False)
    service._locks.clear()
    return project


def request(project):
    return service.AddFurnitureRequest(base_revision=project.revision, idempotency_key="bench-request-1", item={
        "id": "bench_foot_v1", "sku": "CUSTOM-BENCH", "name": "Bedroom bench", "category": "bench",
        "room_id": project.rooms[0].id, "x_mm": 2095, "y_mm": 2450, "z_mm": 0,
        "width_mm": 1200, "depth_mm": 400, "height_mm": 450, "price_vnd": 0,
        "pascal_asset_id": "custom-authored-bench",
    })


def layout_request(project, *, base_revision=None, minimum_clearance_mm=None):
    item = project.furniture_instances[1]
    return service.ApplyFurnitureLayoutRequest(
        base_revision=project.revision if base_revision is None else base_revision,
        idempotency_key="layout-request-1",
        approval_evidence="User approved this placement in task ATL-test",
        minimum_clearance_mm=minimum_clearance_mm,
        moves=[{
            "id": item.id,
            "x_mm": item.x_mm - 150,
            "y_mm": item.y_mm,
            "rotation_deg": item.rotation_deg,
        }],
    )


def sync_result(project):
    ids = {item.id: f"item_{index}" for index, item in enumerate(project.furniture_instances)}
    return {"ok": True, "verification": {"valid": True}, "scene": {"nodes": {node_id: {"id": node_id} for node_id in ids.values()}}, "furnitureNodeIds": ids}


@pytest.fixture
def sync(monkeypatch):
    calls = []
    async def fake_sync(project):
        calls.append(project.model_copy(deep=True))
        return sync_result(project)
    monkeypatch.setattr(service, "sync_canonical_to_pascal", fake_sync)
    return calls


def test_add_retry_preserves_furniture_and_receipt(store, sync):
    body = request(store)
    first = asyncio.run(service.add_furniture(store.project_id, body))
    second = asyncio.run(service.add_furniture(store.project_id, body))
    saved = db.get_project(store.project_id)
    assert first["revision"] == saved.revision == store.revision + 1
    assert first["replayed"] is False and second["replayed"] is True
    assert len(sync) == 1 and len(saved.furniture_instances) == 8
    assert [f.model_dump(exclude={"pascal_node_id"}) for f in saved.furniture_instances[:-1]] == [f.model_dump(exclude={"pascal_node_id"}) for f in store.furniture_instances]
    assert [f.pascal_node_id for f in saved.furniture_instances] == [f"item_{index}" for index in range(8)]
    assert saved.furniture_instances[-1].pascal_node_id == "item_7"
    assert saved.estimate_snapshot is None and first["price_status"] == "unknown"
    assert first["validation"]["addition"]["solid_clearances_mm"]["wardrobe_full_height"] == 790
    assert first["validation"]["addition"]["access_route_validated"] is False
    assert first["validation"]["baseline"]["warnings"]  # existing warnings do not block this addition
    assert len(db.get_project_revisions(store.project_id)) == 2


@pytest.mark.parametrize("change", ["key_payload", "duplicate_id", "stale_revision"])
def test_conflicts_do_not_sync_or_change_scene(store, sync, change):
    body = request(store)
    asyncio.run(service.add_furniture(store.project_id, body))
    if change == "key_payload":
        body.item.width_mm = 1100
    elif change == "duplicate_id":
        body.idempotency_key = "different-key"
        body.base_revision += 1
    else:
        body.idempotency_key = "different-key"
        body.item.id = "another-bench"
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.add_furniture(store.project_id, body))
    assert error.value.status_code == 409 and len(sync) == 1
    assert db.get_project(store.project_id).revision == store.revision + 1


@pytest.mark.parametrize("failure", ["error", "empty", "exception", "invalid_verification", "missing_verification"])
def test_sync_failure_has_no_write(store, monkeypatch, failure):
    async def failing(project):
        if failure == "exception":
            raise RuntimeError("gateway unavailable SECRET_SHOULD_NOT_LEAK")
        if failure in {"invalid_verification", "missing_verification"}:
            result = sync_result(project)
            result["verification"] = {"valid": False} if failure == "invalid_verification" else {}
            return result
        return {"ok": failure == "empty", "scene": {}}
    monkeypatch.setattr(service, "sync_canonical_to_pascal", failing)
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.add_furniture(store.project_id, request(store)))
    assert error.value.status_code == 502
    assert "SECRET_SHOULD_NOT_LEAK" not in str(error.value.detail)
    assert db.get_project(store.project_id).revision == store.revision
    assert len(db.get_project_revisions(store.project_id)) == 1


@pytest.mark.parametrize("bump_revision", [True, False])
def test_sqlite_cas_detects_intervening_writer(store, monkeypatch, bump_revision):
    async def racing(project):
        newer = db.get_project(store.project_id)
        newer.description = "Concurrent user change"
        db.save_project(newer, bump_revision=bump_revision)
        return sync_result(project)
    monkeypatch.setattr(service, "sync_canonical_to_pascal", racing)
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.add_furniture(store.project_id, request(store)))
    assert error.value.status_code == 409
    saved = db.get_project(store.project_id)
    assert saved.description == "Concurrent user change" and len(saved.furniture_instances) == 7


def test_concurrent_retry_one_write(store, sync):
    async def run():
        return await asyncio.gather(*(service.add_furniture(store.project_id, request(store)) for _ in range(2)))
    results = asyncio.run(run())
    assert sorted(r["replayed"] for r in results) == [False, True]
    assert len(sync) == 1


@pytest.mark.parametrize("field,value", [("x_mm", -100), ("y_mm", 1200), ("height_mm", 4000)])
def test_new_invalid_geometry_rejected_before_sync(store, sync, field, value):
    body = request(store)
    setattr(body.item, field, value)
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.add_furniture(store.project_id, body))
    assert error.value.status_code == 422 and sync == []


def test_schema_requires_revision_key_dimensions_and_explicit_price(store, sync):
    app = FastAPI()
    app.include_router(service.router)
    client = TestClient(app)
    payload = request(store).model_dump()
    for field in ["base_revision", "idempotency_key"]:
        bad = dict(payload)
        del bad[field]
        assert client.post(f"/api/v1/projects/{store.project_id}/furniture", json=bad).status_code == 422
    for field in ["price_vnd", "width_mm", "room_id"]:
        bad = {**payload, "item": {k: v for k, v in payload["item"].items() if k != field}}
        assert client.post(f"/api/v1/projects/{store.project_id}/furniture", json=bad).status_code == 422
    result = client.post(f"/api/v1/projects/{store.project_id}/furniture", json=payload)
    assert result.status_code == 200 and result.json()["ok"] is True


def test_spatial_qa_real_collision_rug_vertical_and_unknown_clearance(store):
    item = request(store).item
    store.openings = []
    store.furniture_instances = [FurnitureInstance.model_validate(item.model_dump())]
    qa = analyze_scene_spatial_quality(store)
    assert qa["min_walkway_mm"] is None and qa["walkway_ok"] is None
    duplicate = store.furniture_instances[0].model_copy(update={"id": "overlap"})
    store.furniture_instances.append(duplicate)
    assert analyze_scene_spatial_quality(store)["collision_count"] == 1
    duplicate.z_mm = 450
    assert analyze_scene_spatial_quality(store)["collision_count"] == 0
    duplicate.z_mm, duplicate.height_mm, duplicate.category = 0, 20, "rug"
    assert analyze_scene_spatial_quality(store)["collision_count"] == 0


def test_real_mcp_sync_bedroom_and_bench_without_database_write(store):
    from app.services.mcp_gateway import sync_canonical_to_pascal, call_pascal_mcp_tool
    store.furniture_instances.append(FurnitureInstance.model_validate(request(store).item.model_dump()))
    result = asyncio.run(sync_canonical_to_pascal(store))
    assert result["ok"] is True, result
    assert result["sceneJson"] == result["scene"]
    assert result["verification"]["valid"] is True
    assert len(result["furnitureNodeIds"]) == 8
    scene = result["scene"]
    assert scene["atelier_artifacts"]
    bench_id = result["furnitureNodeIds"]["bench_foot_v1"]
    bench_call = next(call for call in result["executedCalls"] if call.get("canonicalId") == "bench_foot_v1")
    assert bench_call["result"]["size"] == [1.2, 0.45, 0.4]
    assert bench_call["result"]["triangles"] == 60
    assert bench_id in scene["nodes"]
    reopened = asyncio.run(call_pascal_mcp_tool("verify_scene", {}, scene_json=scene))
    assert reopened["ok"] is True
    assert reopened["result"]["valid"] is True
    assert bench_id in reopened["scene"]["nodes"]
    assert reopened["scene"]["atelier_artifacts"] == scene["atelier_artifacts"]
    assert reopened["scene"]["atelier_canonical_node_ids"] == result["furnitureNodeIds"]
    assert db.get_project(store.project_id).revision == store.revision


def test_invalid_mcp_snapshot_cannot_fall_back_to_demo():
    from app.services.mcp_gateway import call_pascal_mcp_tool
    result = asyncio.run(call_pascal_mcp_tool("verify_scene", {}, scene_json={"nodes": {}}))
    assert result["ok"] is False
    assert "SceneSnapshotEmpty" in result["error"]


def test_missing_mcp_snapshot_cannot_open_default_scaffold():
    from app.services.mcp_gateway import call_pascal_mcp_tool
    result = asyncio.run(call_pascal_mcp_tool("verify_scene", {}))
    assert result["ok"] is False
    assert "SceneContextRequired" in result["error"]


def test_api_mcp_call_binds_persisted_project_snapshot(store, monkeypatch):
    from app import main
    store.pascal_scene_json = {"nodes": {"canonical-room": {"id": "canonical-room"}}}
    observed = {}

    async def fake_call(tool_name, arguments, allowed_tools=None, scene_json=None):
        observed.update({
            "tool_name": tool_name,
            "arguments": arguments,
            "allowed_tools": allowed_tools,
            "scene_json": scene_json,
        })
        return {"ok": True, "result": {"valid": True}}

    monkeypatch.setattr(main, "get_project", lambda project_id: store if project_id == store.project_id else None)
    monkeypatch.setattr(main, "call_pascal_mcp_tool", fake_call)
    result = asyncio.run(main.api_mcp_call_tool(main.McpCallPayload(
        tool_name="verify_scene",
        project_id=store.project_id,
        expected_revision=store.revision,
    )))

    assert result["ok"] is True
    assert result["project_id"] == store.project_id
    assert result["revision"] == store.revision
    assert result["scene_source"] == "persisted_canonical_project"
    assert observed["scene_json"] == store.pascal_scene_json


def test_api_mcp_call_rejects_stale_revision_before_gateway(store, monkeypatch):
    from app import main
    monkeypatch.setattr(main, "get_project", lambda _project_id: store)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.api_mcp_call_tool(main.McpCallPayload(
            tool_name="verify_scene",
            project_id=store.project_id,
            expected_revision=store.revision - 1,
        )))
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "REVISION_MISMATCH"


def test_layout_write_persists_transforms_scene_qa_and_estimate(store, sync):
    store.openings = []
    db.save_project(store, bump_revision=False)
    body = layout_request(store)
    first = asyncio.run(service.apply_furniture_layout(store.project_id, body))
    second = asyncio.run(service.apply_furniture_layout(store.project_id, body))
    saved = db.get_project(store.project_id)
    moved = next(item for item in saved.furniture_instances if item.id == body.moves[0].id)
    assert first["revision"] == saved.revision == store.revision + 1
    assert first["replayed"] is False and second["replayed"] is True
    assert first["moved_ids"] == [moved.id]
    assert moved.x_mm == body.moves[0].x_mm
    assert saved.estimate_snapshot is not None
    assert saved.pascal_scene_json["atelier_layout"]["approval_evidence"] == body.approval_evidence
    assert len(sync) == 1


def test_layout_write_rejects_stale_missing_and_invalid_clearance_without_sync(store, sync):
    stale = layout_request(store, base_revision=store.revision + 1)
    with pytest.raises(HTTPException) as stale_error:
        asyncio.run(service.apply_furniture_layout(store.project_id, stale))
    assert stale_error.value.status_code == 409

    missing = layout_request(store)
    missing.idempotency_key = "missing-layout"
    missing.moves[0].id = "missing-object"
    with pytest.raises(HTTPException) as missing_error:
        asyncio.run(service.apply_furniture_layout(store.project_id, missing))
    assert missing_error.value.status_code == 404

    store.openings = []
    db.save_project(store, bump_revision=False)
    clearance = layout_request(store, minimum_clearance_mm=5000)
    clearance.idempotency_key = "clearance-layout"
    with pytest.raises(HTTPException) as clearance_error:
        asyncio.run(service.apply_furniture_layout(store.project_id, clearance))
    assert clearance_error.value.status_code == 422
    assert clearance_error.value.detail["reason"] == "minimum_clearance_not_met"
    assert sync == []


def test_legacy_agent_tool_names_migrate_to_installed_registry_names():
    tools = db.normalize_mcp_tool_allowlist([
        "get_scene_info", "list_nodes_by_type", "update_node", "delete_nodes",
        "move_items", "swap_item", "set_zone_material", "apply_preset_material",
    ])
    assert "get_scene" in tools and "find_by_type" in tools
    assert "move_node" in tools and "delete_node" in tools and "place_items" in tools
    assert "paint" in tools
    assert not ({"get_scene_info", "update_node", "move_items", "swap_item"} & set(tools))


def test_unavailable_tool_is_rejected_before_gateway(monkeypatch):
    from app.services import mcp_gateway

    async def registry(force_refresh=False):
        return {"ok": True, "tools": [{"name": "verify_scene"}]}

    monkeypatch.setattr(mcp_gateway, "list_pascal_mcp_tools", registry)
    result = asyncio.run(mcp_gateway.call_pascal_mcp_tool(
        "update_node",
        {"id": "anything"},
        scene_json={"nodes": {"anything": {"id": "anything"}}},
    ))
    assert result["ok"] is False
    assert result["error"].startswith("ToolUnavailable:")
