from __future__ import annotations

import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import init_db, list_projects
from app.services.blender_cycles_renderer import (
    UI_PUBLIC_DIR,
    build_project_credits_report,
    get_named_parts_for_furniture_py,
    load_sh3d_catalog,
    resolve_asset_pack_id,
    resolve_furniture_asset_for_blender,
)


def test_specific_keywords_override_generic_category() -> None:
    """Specific subtypes must beat generic aliases like bed, table, chair, cabinet."""
    cases = [
        # (furn dict, expected_kind, expected_slug_or_parametric)
        (
            {"id": "f1", "category": "bed", "name": "Giường Tầng Thông Minh Trẻ Em Có Cầu Thang Hộp", "width_mm": 1200, "depth_mm": 2000},
            "glb",
            "bed_bunk",
        ),
        (
            {"id": "f2", "category": "coffee_table", "name": "Bàn Trà Tròn Mặt Đá Ceramic", "width_mm": 800, "depth_mm": 800},
            "glb",
            "coffee_table",
        ),
        (
            {"id": "f3", "category": "tv_cabinet", "asset_id": "asset_ph_chinese_console_table_1k", "name": "Hệ Kệ Tivi Gỗ Sồi Tự Nhiên", "width_mm": 1800, "depth_mm": 400},
            "glb",
            "tv_stand",
        ),
        (
            {"id": "f4", "category": "table", "name": "Bàn học gỗ sồi", "width_mm": 1200, "depth_mm": 600},
            "glb",
            "desk",
        ),
        (
            {"id": "f5", "category": "chair", "name": "Ghế bành thư giãn đọc sách", "width_mm": 800, "depth_mm": 850},
            "glb",
            "armchair",
        ),
        (
            {"id": "f6", "category": "chair", "name": "Ghế băng dài phòng khách", "width_mm": 1500, "depth_mm": 450},
            "glb",
            "bench",
        ),
        (
            {"id": "f7", "category": "chair", "name": "Đôn sofa bọc nỉ", "width_mm": 550, "depth_mm": 550},
            "glb",
            "ottoman",
        ),
        (
            {"id": "f8", "category": "kitchen", "name": "Máy hút mùi áp tường", "width_mm": 600, "depth_mm": 450},
            "glb",
            "kitchen_hood",
        ),
        (
            {"id": "f9", "category": "bed", "name": "Giường ngủ đơn", "width_mm": 1050, "depth_mm": 2000},
            "glb",
            "bed_single",
        ),
        (
            {"id": "f10", "category": "table", "name": "Bàn console khung mảnh mặt đá", "width_mm": 1200, "depth_mm": 380},
            "parametric",
            "console_table",
        ),
    ]
    for furn, expected_kind, expected_id in cases:
        res = resolve_furniture_asset_for_blender(furn, pack_id="sh3d-japandi")
        assert res["kind"] == expected_kind, f"Failed kind for {furn}: got {res}"
        if expected_kind == "glb":
            assert res["catalog_entry"]["slug"] == expected_id, f"Failed slug for {furn}: got {res['catalog_entry']['slug']}"
        else:
            assert res["parametric_type"] == expected_id, f"Failed parametric for {furn}: got {res['parametric_type']}"


def test_console_table_named_parts() -> None:
    parts = get_named_parts_for_furniture_py({"id": "c1", "category": "console_table", "name": "Bàn console"})
    part_ids = [p["partId"] for p in parts]
    assert part_ids == ["countertop", "frame", "legs"]
    assert parts[0]["surfaceType"] == "stone"
    assert parts[1]["surfaceType"] == "metal"


def test_style_preset_switches_asset_pack_without_deleting_classic() -> None:
    assert resolve_asset_pack_id("japandi") == "sh3d-japandi"
    # Mặc định đổi sang Hiện đại (FEAT-2026-128): chỉ Japandi dùng pack japandi, còn lại dùng classic.
    assert resolve_asset_pack_id("minimalist") == "sh3d-classic"
    assert resolve_asset_pack_id(None) == "sh3d-classic"
    assert resolve_asset_pack_id(None, brief_style="Modern") == "sh3d-classic"
    assert resolve_asset_pack_id(None, brief_style="Japandi") == "sh3d-japandi"
    assert resolve_asset_pack_id("warm_classic") == "sh3d-classic"
    assert resolve_asset_pack_id(None, brief_style="Cổ điển sang trọng") == "sh3d-classic"

    japandi_items = load_sh3d_catalog("sh3d-japandi")
    classic_items = load_sh3d_catalog("sh3d-classic")
    assert len(japandi_items) == 42
    assert len(classic_items) == 36


def test_japandi_pack_licensing_and_bounds() -> None:
    items = load_sh3d_catalog("sh3d-japandi")
    for it in items:
        assert it["face_count"] <= 25000, f"{it['slug']} exceeds 25k faces: {it['face_count']}"
        assert it["license"] in {"CC-0", "CC-BY"}
        src_lower = it["source"].lower()
        assert "contributions" not in src_lower
        assert "free art" not in src_lower
        assert "furniture.jar" not in src_lower
        assert "gpl" not in it["license"].lower()
        glb_disk = UI_PUBLIC_DIR / it["glb_url"].lstrip("/")
        assert glb_disk.is_file(), f"Missing GLB file on disk: {glb_disk}"


def test_credits_report_uses_dynamic_counts() -> None:
    init_db()
    projects = list_projects()
    assert projects, "Expected seeded projects"
    proj = projects[0]

    proj.active_style_preset = "japandi"
    rep_j = build_project_credits_report(proj)
    assert rep_j["ok"] is True
    md_j = rep_j["markdown"]
    assert "25/36" not in md_j
    assert "sh3d-japandi" in md_j
    assert "(13/42 model)" in md_j

    proj.active_style_preset = "warm_classic"
    rep_c = build_project_credits_report(proj)
    md_c = rep_c["markdown"]
    assert "sh3d-classic" in md_c
    assert f"({len([i for i in load_sh3d_catalog('sh3d-classic') if i['license'] == 'CC-BY'])}/36 model)" in md_c
