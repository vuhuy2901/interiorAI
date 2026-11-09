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
from app.services.asset_pipeline import get_asset_metadata  # noqa: E402
from app.services.material_system import (  # noqa: E402
    get_material,
    inspect_glb_material_structure,
    resolve_material,
)
from app.models.contracts import MaterialOverride  # noqa: E402


def _make_project():
    project = build_default_demo_project()
    project.project_id = f"proj_g2_{uuid.uuid4().hex[:8]}"
    project.name = "G2 material test"
    metadata = get_asset_metadata("asset_ph_sofa_01_1k")
    assert metadata is not None
    sofa = next(item for item in project.furniture_instances if item.id == "furn_sofa_main")
    sofa.asset_id = metadata.asset_id
    sofa.asset_version = metadata.asset_version
    sofa.geometry_hash = metadata.geometry_hash
    sofa.normalized_glb = metadata.normalized_glb
    sofa.material_slots = metadata.material_slots
    save_project(project, author="G2 test", reason="fixture", bump_revision=False)
    return project


def _cleanup(project_id: str):
    conn = get_conn()
    conn.execute("DELETE FROM proposals WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM scene_revisions WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()


def test_t1_real_sofa_slot_audit_is_truthful():
    path = ROOT / "data" / "assets" / "library" / "asset_ph_sofa_01_1k" / "normalized.glb"
    audit = inspect_glb_material_structure(path)
    assert audit["node_count"] == 1
    assert audit["mesh_count"] == 1
    assert audit["primitive_count"] == 1
    assert audit["material_count"] == 1
    assert audit["slots"][0]["source_material_name"] == "Sofa_01"
    assert audit["independent_part_editing"] is False
    assert audit["semantic_mapping_status"] == "WHOLE_ASSET_ONLY"


def test_t4_t5_t8_registry_is_renderer_neutral_and_world_scaled():
    moss = get_material("mat_fabric_moss")
    tile = get_material("mat_tile_sand_800")
    assert moss and tile
    resolved = resolve_material(
        MaterialOverride(
            material_id=moss.material_id,
            material_version=moss.version,
            tint="#556B4E",
            pbr={"roughness": 0.9},
        )
    )
    serialized = str(resolved).lower()
    assert "three" not in serialized and "blender" not in serialized
    assert resolved["tint"] == "#556B4E"
    assert resolved["pbr"]["roughness"] == 0.9
    assert tile.physical_scale.width_mm == 800
    assert tile.physical_scale.height_mm == 800
    assert tile.physical_scale.grout_width_mm == 3


def test_t2_t6_t7_t9_proposal_persists_only_on_approval_and_isolated():
    project = _make_project()
    try:
        with TestClient(app) as client:
            sofa_before = next(item for item in project.furniture_instances if item.id == "furn_sofa_main")
            slot_id = sofa_before.material_slots[0].slot_id
            count_before = len(project.furniture_instances)
            response = client.post(
                f"/api/v1/projects/{project.project_id}/furniture/furn_sofa_main/material-proposals",
                json={
                    "slot_id": slot_id,
                    "material_id": "mat_fabric_moss",
                    "material_version": 1,
                    "tint": "#556B4E",
                    "pbr": {"roughness": 0.88, "sheen": 0.3},
                },
            )
            assert response.status_code == 200
            proposal = response.json()["proposal"]
            assert response.json()["persisted"] is False
            unchanged = get_project(project.project_id)
            assert unchanged is not None
            assert unchanged.revision == project.revision
            assert slot_id not in next(
                item for item in unchanged.furniture_instances if item.id == "furn_sofa_main"
            ).material_overrides

            approved = client.post(f"/api/v1/proposals/{proposal['proposal_id']}/approve", json={})
            assert approved.status_code == 200
            assert approved.json()["ok"] is True
            persisted = get_project(project.project_id)
            assert persisted is not None
            assert persisted.revision == project.revision + 1
            assert len(persisted.furniture_instances) == count_before
            sofa = next(item for item in persisted.furniture_instances if item.id == "furn_sofa_main")
            table = next(item for item in persisted.furniture_instances if item.id == "furn_table_main")
            assert sofa.material_overrides[slot_id].tint == "#556B4E"
            assert table.material_overrides == {}

            reloaded = client.get(f"/api/v1/projects/{project.project_id}")
            reloaded_sofa = next(
                item for item in reloaded.json()["furniture_instances"] if item["id"] == "furn_sofa_main"
            )
            assert reloaded_sofa["material_overrides"][slot_id]["tint"] == "#556B4E"

            stale = client.post(
                f"/api/v1/projects/{project.project_id}/furniture/furn_sofa_main/material-proposals",
                json={"slot_id": slot_id, "material_id": "mat_fabric_sand", "material_version": 1},
            ).json()["proposal"]
            bumped = get_project(project.project_id)
            assert bumped is not None
            bumped.description = "Concurrent approved edit"
            save_project(bumped, author="G2 test", reason="concurrent edit", bump_revision=True)
            conflict = client.post(f"/api/v1/proposals/{stale['proposal_id']}/approve", json={})
            assert conflict.json()["ok"] is False
            assert conflict.json()["status"] == "REVISION_CONFLICT"
            after_conflict = get_project(project.project_id)
            conflict_sofa = next(
                item for item in after_conflict.furniture_instances if item.id == "furn_sofa_main"
            )
            assert conflict_sofa.material_overrides[slot_id].tint == "#556B4E"
    finally:
        _cleanup(project.project_id)
