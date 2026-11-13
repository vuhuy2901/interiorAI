import json
from pathlib import Path
import pytest
import sys

# Ensure apps/api is in sys.path
API_DIR = Path(__file__).resolve().parent.parent / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import (
    get_conn,
    get_project,
    get_project_revisions,
    get_native_project_workspace,
    save_project,
    restore_project_revision,
)


COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
NATIVE_PROJECT_STUDIO_ID = "8b2fe984-4bc2-4af2-a65f-7dfe64fb2274"
NATIVE_PROJECT_BEDROOM_ID = "e20d2696-5794-4cdb-ba5d-47fac2fc4f0d"
SCENE_STUDIO_ID = "proj_demo_4x5m"
SCENE_BEDROOM_ID = "proj_bedroom_japandi_4x4m"


def test_p0_p1_native_project_scene_binding_and_isolation():
    """AC-02 & AC-04: Verify native projects bind to their respective scenes with zero cross-leakage."""
    ws_studio = get_native_project_workspace(NATIVE_PROJECT_STUDIO_ID)
    assert ws_studio is not None, "Studio workspace must exist"
    assert ws_studio.native_project_id == NATIVE_PROJECT_STUDIO_ID
    assert ws_studio.company_id == COMPANY_ID
    studio_scenes = [s.scene_id for s in ws_studio.scenes]
    assert SCENE_STUDIO_ID in studio_scenes
    assert SCENE_BEDROOM_ID not in studio_scenes

    ws_bedroom = get_native_project_workspace(NATIVE_PROJECT_BEDROOM_ID)
    assert ws_bedroom is not None, "Bedroom workspace must exist"
    assert ws_bedroom.native_project_id == NATIVE_PROJECT_BEDROOM_ID
    assert ws_bedroom.company_id == COMPANY_ID
    bedroom_scenes = [s.scene_id for s in ws_bedroom.scenes]
    assert SCENE_BEDROOM_ID in bedroom_scenes
    assert SCENE_STUDIO_ID not in bedroom_scenes


def test_p1_project_design_data_structure():
    """P1: Verify structured design data: dimensions, walls, windows, furniture instances with stable IDs."""
    studio = get_project(SCENE_STUDIO_ID)
    assert studio is not None
    assert len(studio.rooms) > 0
    room = studio.rooms[0]
    assert len(room.polygon_mm) >= 3
    assert room.ceiling_height_mm > 0
    assert len(studio.walls) > 0
    assert len(studio.furniture_instances) > 0

    for item in studio.furniture_instances:
        assert item.id
        assert item.name
        assert item.x_mm is not None
        assert item.y_mm is not None
        assert item.width_mm > 0
        assert item.depth_mm > 0
        assert item.height_mm > 0

    bedroom = get_project(SCENE_BEDROOM_ID)
    assert bedroom is not None
    assert len(bedroom.rooms) > 0
    assert len(bedroom.furniture_instances) > 0


def test_p3_material_and_color_inspection():
    """P3: Verify surface materials and color updates apply cleanly."""
    proj_before = get_project(SCENE_STUDIO_ID)
    assert proj_before is not None
    rev_before = proj_before.revision

    # Update surface materials on room
    if proj_before.rooms:
        proj_before.rooms[0].wall_base_material_id = "mat_paint_dulux_pure_white"
        proj_before.rooms[0].floor_material_id = "mat_wood_an_cuong_oak_rustic"

    updated = save_project(
        proj_before,
        author="Tester P3",
        reason="Verification of Material System sync",
        bump_revision=True,
    )
    assert updated is not None
    assert updated.revision > rev_before

    proj_after = get_project(SCENE_STUDIO_ID)
    assert proj_after.rooms[0].wall_base_material_id == "mat_paint_dulux_pure_white"
    assert proj_after.rooms[0].floor_material_id == "mat_wood_an_cuong_oak_rustic"


def test_p4_revision_history_and_undo():
    """P4: Verify revision history logging and undo capability."""
    revisions = get_project_revisions(SCENE_STUDIO_ID)
    assert len(revisions) >= 1
    latest_rev = revisions[0]
    assert "revision" in latest_rev
    assert "created_at" in latest_rev

    # Verify restore function does not crash
    proj = get_project(SCENE_STUDIO_ID)
    cur_rev = proj.revision
    if cur_rev > 1:
        restored = restore_project_revision(SCENE_STUDIO_ID, cur_rev - 1)
        assert restored is not None
        assert restored.revision > cur_rev


def test_ui_components_contract_compliance():
    """Verify UI files properly expose 3D Studio tab and viewport navigation controls."""
    ui_project_detail = Path("paperclip/ui/src/pages/ProjectDetail.tsx").read_text(encoding="utf-8")
    assert '"3d-studio"' in ui_project_detail
    assert "Project3DStudioTab" in ui_project_detail
    assert 'label: "3D Studio"' in ui_project_detail

    ui_3d_tab = Path("paperclip/ui/src/features/atelier/Project3DStudioTab.tsx").read_text(encoding="utf-8")
    # P0 navigation controls
    for control in ["Orbit", "Top", "Walk", "Cutaway", "Fit Room", "Focus", "Reset"]:
        assert control in ui_3d_tab, f"Missing camera control: {control}"

    # P3 inspector and AI assistant
    assert "ObjectInspector" in ui_3d_tab
    assert "AIDesignAssistant" in ui_3d_tab
    assert "RevisionHistoryDrawer" in ui_3d_tab

    # View modes and lighting
    assert "split" in ui_3d_tab
    assert "lightingPreset" in ui_3d_tab
