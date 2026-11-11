"""
Unit & Integration Tests for Japandi Master Bedroom Project Setup (FEAT-2026-017)
Verifies:
1. Canonical Project structure (4190 x 4040 mm room, 4 walls, door, window).
2. Furniture instances: Japandi linen bed, 2 floating tabs, vanity desk, wardrobe, tv console, rug.
3. Deterministic BOQ cost calculation within budget (75M - 120M VND).
4. Persistence and retrieval from SQLite WAL.
"""
import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import (
    build_japandi_master_bedroom_project,
    get_project,
    init_db,
    save_project,
)


def test_japandi_master_bedroom_model_geometry():
    proj = build_japandi_master_bedroom_project()
    assert proj.project_id == "proj_bedroom_japandi_4x4m"
    assert "Japandi" in proj.name
    assert proj.units == "mm"
    assert proj.scale_calibrated is True

    # Room checks
    assert len(proj.rooms) == 1
    room = proj.rooms[0]
    assert room.room_type == "bedroom"
    assert room.ceiling_height_mm == 2800.0

    # Dimension checks (4.19m x 4.04m)
    xs = [pt[0] for pt in room.polygon_mm]
    ys = [pt[1] for pt in room.polygon_mm]
    width_mm = max(xs) - min(xs)
    depth_mm = max(ys) - min(ys)
    assert width_mm == 4190.0
    assert depth_mm == 4040.0

    # Walls check (4 walls)
    assert len(proj.walls) == 4
    headboard_wall = next(w for w in proj.walls if w.id == "wall_north_headboard")
    assert headboard_wall.is_accent_wall is True
    assert headboard_wall.face_a_material_id == "veneer_oak_natural_slats"


def test_japandi_master_bedroom_furniture_and_materials():
    proj = build_japandi_master_bedroom_project()
    assert len(proj.furniture_instances) == 7

    skus = [f.sku for f in proj.furniture_instances]
    assert "BED-JAP-LINEN-180" in skus
    assert "TAB-OAK-40-L" in skus
    assert "TAB-OAK-40-R" in skus
    assert "DESK-VANITY-OAK-90" in skus
    assert "WARDROBE-JAP-FLUTED-320" in skus
    assert "TV-CONSOLE-WALL-180" in skus
    assert "RUG-OATMEAL-200X240" in skus

    # Verify bed dimensions
    bed = next(f for f in proj.furniture_instances if f.sku == "BED-JAP-LINEN-180")
    assert bed.width_mm == 1800.0
    assert bed.depth_mm == 2000.0


def test_japandi_master_bedroom_boq_budget_range():
    proj = build_japandi_master_bedroom_project()
    assert proj.estimate_snapshot is not None
    total_cost = proj.estimate_snapshot.total_vnd

    # Budget range from client request: 75M to 120M VND
    min_budget = 75_000_000.0
    max_budget = 120_000_000.0
    assert min_budget <= total_cost <= max_budget, f"Cost {total_cost} is outside [{min_budget}, {max_budget}]"


def test_japandi_master_bedroom_persistence_sqlite():
    init_db()
    proj = build_japandi_master_bedroom_project()
    save_project(proj)

    loaded = get_project("proj_bedroom_japandi_4x4m")
    assert loaded is not None
    assert loaded.project_id == "proj_bedroom_japandi_4x4m"
    assert len(loaded.furniture_instances) == 7
    assert loaded.estimate_snapshot.total_vnd == proj.estimate_snapshot.total_vnd
