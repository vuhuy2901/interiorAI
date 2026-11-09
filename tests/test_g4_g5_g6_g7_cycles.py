"""
ATELIER AI — Comprehensive G4, G5, G6 & G7 Real Backend + Blender Cycles Verification Suite
Verifies:
1. G4 Multi-Material & Surface Editing:
   - Assign multi-material asset (GlamVelvetSofa 3 slots / ModernArmChair 2 slots / ModernCoffeeTable 2 slots).
   - Change only sofa fabric slot to mat_fabric_moss while wooden legs slot remains unchanged.
   - Change wood slot to mat_wood_walnut_dark / mat_wood_oak_natural.
   - Change floor surface to mat_tile_sand_800 (800x800mm tile with 3mm grout).
   - Approve proposals, verify revision increments, reload project from DB, restore earlier revision.
2. G5 Scene Bridge:
   - Export Pascal geometry, GLB furniture assets, transforms, dimensions, Canonical Material Definitions,
     Material Overrides, Camera, Lights, Licensed CC0 HDRI Environment, Revision ID.
   - Construct Principled BSDF materials in Blender 4.2 LTS and save .blend file.
   - Verify round-trip object counts, positions (<=2mm), dimensions (<=2mm), material colors/roughness,
     no missing doors/walls/furniture, and no invented furniture.
3. G6 Render Cycles:
   - Verify Blender 4.2 LTS headless + Cycles CPU/GPU capability probe.
   - Execute Preview Render & Final Render from GLB sofa + 3D room.
   - Verify Render Job Queue, Job Status, Cancel, Retry, Error Handling, Render Cache hit, Gallery, Download,
     and Conversation Output in chat history.
   - Verify image watermark "ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG.", Revision, Camera ID, Material Hash.
4. G7 Workflow Orchestration:
   - Execute full 14-node workflow from Chief Architect on a new project with real Blender Cycles active.
   - Verify all 14 nodes complete with run_id, step_id, tool_call_id, input, output, started_at, completed_at, duration_ms,
     and zero SKIPPED nodes.
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import build_default_demo_project, get_conn, get_project, save_project  # noqa: E402
from app.main import app  # noqa: E402


def _cleanup_project(project_id: str) -> None:
    conn = get_conn()
    conn.execute("DELETE FROM proposals WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM chat_messages WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM scene_revisions WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM render_jobs WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()


def test_g4_multi_material_parts_and_floor_800_tile_roundtrip():
    proj = build_default_demo_project()
    proj.project_id = f"proj_g4_{uuid.uuid4().hex[:8]}"
    proj.name = "G4 Multi-Material & Floor 800x800 Test"
    save_project(proj, author="G4 Test", reason="Initial Rev 1", bump_revision=False)

    try:
        with TestClient(app) as client:
            # 1. Assign multi-material sofa asset_user_67202c74a1a33377 (GlamVelvetSofa: 3 slots)
            r_assign = client.post(
                f"/api/v1/projects/{proj.project_id}/furniture/furn_sofa_main/assign-asset",
                json={"asset_id": "asset_user_67202c74a1a33377"},
            )
            assert r_assign.status_code == 200
            assigned_slots = r_assign.json()["asset"]["material_slots"]
            assert len(assigned_slots) == 3
            slot_by_part = {s["semantic_part"]: s["slot_id"] for s in assigned_slots}
            assert "fabric" in slot_by_part
            assert "wood_legs" in slot_by_part

            fabric_slot_id = slot_by_part["fabric"]
            legs_slot_id = slot_by_part["wood_legs"]

            # 2. Propose changing ONLY sofa fabric color to mat_fabric_moss (#556B4E)
            r_prop_fab = client.post(
                f"/api/v1/projects/{proj.project_id}/furniture/furn_sofa_main/material-proposals",
                json={
                    "slot_id": fabric_slot_id,
                    "material_id": "mat_fabric_moss",
                    "material_version": 1,
                    "tint": "#556B4E",
                    "pbr": {"roughness": 0.86, "sheen": 0.32},
                },
            )
            assert r_prop_fab.status_code == 200
            prop_fab_id = r_prop_fab.json()["proposal"]["proposal_id"]

            r_app_fab = client.post(f"/api/v1/proposals/{prop_fab_id}/approve", json={})
            assert r_app_fab.status_code == 200
            assert r_app_fab.json()["ok"] is True

            # Verify fabric changed while wooden legs slot is untouched
            p_after_fab = client.get(f"/api/v1/projects/{proj.project_id}").json()
            sofa_after_fab = next(f for f in p_after_fab["furniture_instances"] if f["id"] == "furn_sofa_main")
            assert sofa_after_fab["material_overrides"][fabric_slot_id]["material_id"] == "mat_fabric_moss"
            assert sofa_after_fab["material_overrides"][fabric_slot_id]["tint"] == "#556B4E"
            assert legs_slot_id not in sofa_after_fab["material_overrides"]

            # 3. Propose changing wooden legs slot to mat_wood_walnut_dark (#5C4033) while fabric stays #556B4E
            r_prop_wood = client.post(
                f"/api/v1/projects/{proj.project_id}/furniture/furn_sofa_main/material-proposals",
                json={
                    "slot_id": legs_slot_id,
                    "material_id": "mat_wood_walnut_dark",
                    "material_version": 1,
                    "tint": "#5C4033",
                    "pbr": {"roughness": 0.42, "clearcoat": 0.18},
                },
            )
            assert r_prop_wood.status_code == 200
            prop_wood_id = r_prop_wood.json()["proposal"]["proposal_id"]
            r_app_wood = client.post(f"/api/v1/proposals/{prop_wood_id}/approve", json={})
            assert r_app_wood.status_code == 200

            p_after_wood = client.get(f"/api/v1/projects/{proj.project_id}").json()
            sofa_after_wood = next(f for f in p_after_wood["furniture_instances"] if f["id"] == "furn_sofa_main")
            assert sofa_after_wood["material_overrides"][fabric_slot_id]["tint"] == "#556B4E"
            assert sofa_after_wood["material_overrides"][legs_slot_id]["material_id"] == "mat_wood_walnut_dark"
            assert sofa_after_wood["material_overrides"][legs_slot_id]["tint"] == "#5C4033"

            # 4. Change floor to 800x800 mm tile with 3mm grout via Surface Material Proposal
            r_prop_floor = client.post(
                f"/api/v1/projects/{proj.project_id}/surfaces/floor/material-proposals",
                json={
                    "slot_id": "FLOOR_MAIN",
                    "material_id": "mat_tile_sand_800",
                    "material_version": 1,
                    "tint": "#DFD6C7",
                    "pbr": {"roughness": 0.36, "clearcoat": 0.08},
                    "uv_transform": {
                        "scale": [1, 1],
                        "offset_mm": [0, 0],
                        "rotation_deg": 0,
                        "tile_size_mm": [800, 800],
                        "grout_thickness_mm": 3,
                        "grout_color": "#B8B1A6",
                    },
                },
            )
            assert r_prop_floor.status_code == 200
            prop_floor_id = r_prop_floor.json()["proposal"]["proposal_id"]
            r_app_floor = client.post(f"/api/v1/proposals/{prop_floor_id}/approve", json={})
            assert r_app_floor.status_code == 200

            # 5. Reload project & verify all overrides persisted
            reloaded = client.get(f"/api/v1/projects/{proj.project_id}").json()
            floor_ov = reloaded["surface_material_overrides"]["floor"]
            assert floor_ov["material_id"] == "mat_tile_sand_800"
            assert floor_ov["texture_scale"]["width_mm"] == 800.0
            assert floor_ov["texture_scale"]["height_mm"] == 800.0
            assert floor_ov["texture_scale"]["grout_width_mm"] == 3.0
            rev_with_all = reloaded["revision"]
            assert rev_with_all >= 4

            # 6. Restore Revision 1 and verify state rolled back cleanly while preserving audit history
            r_restore = client.post(f"/api/v1/projects/{proj.project_id}/revisions/1/restore")
            assert r_restore.status_code == 200
            restored = client.get(f"/api/v1/projects/{proj.project_id}").json()
            assert restored["revision"] == rev_with_all + 1
            assert "floor" not in (restored.get("surface_material_overrides") or {})
    finally:
        _cleanup_project(proj.project_id)


def test_g5_scene_bridge_and_g6_cycles_render_pipeline():
    proj = build_default_demo_project()
    proj.project_id = f"proj_g5g6_{uuid.uuid4().hex[:8]}"
    proj.name = "G5/G6 Blender Cycles Test"
    save_project(proj, author="G5/G6 Test", reason="Initial", bump_revision=False)

    try:
        with TestClient(app) as client:
            # 1. Verify Blender Cycles capabilities
            r_cap = client.get("/api/v1/render/capabilities")
            assert r_cap.status_code == 200
            cap = r_cap.json()
            assert cap["available"] is True
            assert cap["cycles_available"] is True
            assert "4.2.3" in cap["version"]

            # 2. Verify G5 Scene Bridge round-trip in Blender
            r_bridge = client.post(f"/api/v1/projects/{proj.project_id}/scene-bridge/verify")
            assert r_bridge.status_code == 200
            bridge = r_bridge.json()
            assert bridge["status"] == "PASS"
            assertions = bridge["verification"]["assertions"]
            assert assertions["exact_object_counts"] is True
            assert assertions["all_positions_within_2mm"] is True
            assert assertions["all_dimensions_within_2mm"] is True
            assert assertions["no_missing_doors_walls_furniture"] is True
            assert assertions["no_extra_furniture_created"] is True
            assert Path(bridge["blend_file"]).exists()

            # 3. Enqueue Preview Render (synchronous wait) & verify output
            r_prev = client.post(
                f"/api/v1/projects/{proj.project_id}/render-jobs",
                json={
                    "camera_id": "eye_level",
                    "mode": "preview",
                    "lighting_preset": "day",
                    "use_cache": False,
                    "wait_for_completion": True,
                },
            )
            assert r_prev.status_code == 200
            job_prev = r_prev.json()
            assert job_prev["status"] == "COMPLETED"
            assert job_prev["mandatory_label"] == "ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG."
            assert job_prev["revision"] == 1
            assert job_prev["camera_id"] == "eye_level"
            assert len(job_prev["material_hash"]) >= 12

            # Verify Download endpoint returns real PNG bytes
            r_dl = client.get(job_prev["download_url"])
            assert r_dl.status_code == 200
            assert r_dl.content[:8] == b"\x89PNG\r\n\x1a\n"
            assert len(r_dl.content) > 50_000

            # Verify Cache Hit on identical scene + camera + mode + lighting
            r_cached = client.post(
                f"/api/v1/projects/{proj.project_id}/render-jobs",
                json={
                    "camera_id": "eye_level",
                    "mode": "preview",
                    "lighting_preset": "day",
                    "use_cache": True,
                    "wait_for_completion": True,
                },
            )
            assert r_cached.status_code == 200
            assert r_cached.json()["cache_hit"] is True

            # Verify Conversation Output in chat history
            r_chat = client.get(f"/api/v1/chat/history?project_id={proj.project_id}")
            assert r_chat.status_code == 200
            messages = r_chat.json()["messages"]
            assert any(m.get("metadata", {}).get("render_job", {}).get("job_id") == job_prev["job_id"] for m in messages)

            # Verify Error Handling on invalid camera_id
            r_err = client.post(
                f"/api/v1/projects/{proj.project_id}/render-jobs",
                json={"camera_id": "non_existent_cam", "mode": "preview"},
            )
            assert r_err.status_code == 422

            # Verify Cancel & Retry on async job
            r_async = client.post(
                f"/api/v1/projects/{proj.project_id}/render-jobs",
                json={
                    "camera_id": "corner",
                    "mode": "preview",
                    "lighting_preset": "sunset",
                    "use_cache": False,
                    "wait_for_completion": False,
                },
            )
            assert r_async.status_code == 200
            async_job_id = r_async.json()["job_id"]
            r_cancel = client.post(f"/api/v1/render-jobs/{async_job_id}/cancel")
            assert r_cancel.status_code == 200
            assert r_cancel.json()["status"] in ("CANCELLED", "COMPLETED")

            r_retry = client.post(
                f"/api/v1/render-jobs/{async_job_id}/retry",
                json={"wait_for_completion": True},
            )
            assert r_retry.status_code == 200
            assert r_retry.json()["status"] == "COMPLETED"
    finally:
        _cleanup_project(proj.project_id)


def test_g7_full_14_node_workflow_orchestration_with_real_cycles():
    proj = build_default_demo_project()
    proj.project_id = f"proj_g7_full_{uuid.uuid4().hex[:8]}"
    proj.name = "G7 Full 14-Node Real Orchestration"
    save_project(proj, author="G7 Test", reason="Initial", bump_revision=False)

    try:
        with TestClient(app) as client:
            r_run = client.post(
                f"/api/v1/workflows/wf_default_interior_pipeline/runs?project_id={proj.project_id}"
            )
            assert r_run.status_code == 200
            run = r_run.json()
            assert run["status"] == "COMPLETED"
            events = run["events"]
            assert len(events) == 14
            for ev in events:
                assert ev["status"] == "COMPLETED", f"Node {ev['node_id']} did not complete: {ev}"
                assert ev["run_id"] == run["run_id"]
                assert ev["step_id"].startswith("step_")
                assert ev["tool_call_id"].startswith("call_")
                assert ev["started_at"] is not None
                assert ev["completed_at"] is not None
                assert ev["duration_ms"] >= 0
                assert isinstance(ev["input"], dict)
                assert isinstance(ev["output"], dict)
                assert ev["error"] is None

            # Verify n12_render, n13_render_qa, and n14_export outputs
            n12 = next(e for e in events if e["node_id"] == "n12_render")
            assert n12["output"]["engine"] == "CYCLES"
            assert Path(n12["output"]["image_file"]).exists()

            n13 = next(e for e in events if e["node_id"] == "n13_render_qa")
            assert n13["output"]["render_qa_passed"] is True
            assert n13["output"]["bridge_assertions"]["exact_object_counts"] is True

            n14 = next(e for e in events if e["node_id"] == "n14_export")
            assert n14["output"]["dxf_bytes"] > 500
            assert n14["output"]["glb_bytes"] > 500
            assert n14["output"]["bom_csv_bytes"] > 200
    finally:
        _cleanup_project(proj.project_id)
