from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import build_default_demo_project, build_japandi_master_bedroom_project  # noqa: E402
from app.services.blender_mcp import (  # noqa: E402
    _compute_camera_spec,
    _generate_blender_runner_script,
    build_scene_bridge_manifest,
)


def _compact_bedroom():
    project = build_default_demo_project()
    project.rooms[0].polygon_mm = [[0, 0], [3100, 0], [3100, 4000], [0, 4000]]
    project.walls[0].start_mm, project.walls[0].end_mm = [0, 0], [3100, 0]
    project.walls[1].start_mm, project.walls[1].end_mm = [3100, 0], [3100, 4000]
    project.walls[2].start_mm, project.walls[2].end_mm = [3100, 4000], [0, 4000]
    project.walls[3].start_mm, project.walls[3].end_mm = [0, 4000], [0, 0]
    project.furniture_instances[0].x_mm = 2115
    project.furniture_instances[0].y_mm = 1015
    project.furniture_instances[0].width_mm = 1970
    project.furniture_instances[0].depth_mm = 1230
    return project


def test_corner_camera_stays_outside_compact_room_and_targets_room_center():
    camera = _compute_camera_spec(_compact_bedroom(), "corner")
    assert camera["eye_m"][0] < 0
    assert camera["eye_m"][1] < 0
    assert camera["target_m"][:2] == [1.55, 2.0]


def test_top_camera_uses_orthographic_projection_with_full_room_margin():
    camera = _compute_camera_spec(_compact_bedroom(), "top")
    assert camera["projection"] == "ORTHO"
    assert camera["ortho_scale"] >= 8.0
    assert camera["eye_m"][2] > 4.0


def test_blender_fallback_builds_semantic_furniture_instead_of_one_box():
    script = _generate_blender_runner_script()
    assert 'category in {"bed", "double_bed"}' in script
    assert 'category in {"nightstand", "bedside_table"}' in script
    assert 'category in {"rug", "round_rug", "rug_round"}' in script
    assert 'category in {"tv_cabinet", "tv_console"}' in script
    assert 'category in {"bunk_bed", "bunkbed"}' in script
    assert 'category == "wardrobe"' in script
    assert 'category in {"stair", "staircase", "bunk_stair"}' in script


def test_pascal_gateway_and_studio_cover_master_bedroom_categories():
    gateway = (ROOT_DIR / "packages" / "pascal-adapter" / "gateway.mjs").read_text(encoding="utf-8")
    studio = (
        ROOT_DIR
        / "paperclip"
        / "ui"
        / "src"
        / "features"
        / "atelier"
        / "StudioViewport.tsx"
    ).read_text(encoding="utf-8")
    for category in ("bed", "nightstand", "rug", "tv_cabinet", "chair"):
        assert f"category === '{category}'" in gateway
        assert f"f.category === '{category}'" in studio


def test_legacy_oak_floor_alias_keeps_wood_plank_texture(tmp_path):
    manifest = build_scene_bridge_manifest(
        build_japandi_master_bedroom_project(),
        camera="corner",
        time_of_day="day",
        out_dir=tmp_path,
    )
    assert manifest["tile_textures"]["width_mm"] == 1200.0
    assert manifest["tile_textures"]["height_mm"] == 180.0
