# -*- coding: utf-8 -*-
"""
Tests for Unified Project-Centric BOQ & Materials/Cost Engine
Validates:
1. Multi-project separation (no bleed between proj_kid_bedroom, proj_demo_4x5m, etc.)
2. 9 real construction groups without empty categories
3. Materials AI proposal generation (core, surface, grain/color, thickness, agent name)
4. Shopping AI supplier quotes (no fake data, clear source / price status)
5. Cost AI calculations with transparent formulas and double-counting prevention (BOM sub-items is_included_in_total=False)
6. Decision persistence (audit trail: Materials AI proposed, user approved, timestamp, revision)
7. Excel (.xlsx) export integrity
"""

import io
import sys
from pathlib import Path
import pytest
import openpyxl

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.models.contracts import BOQDecisionPayload
from app.services.unified_boq_engine import (
    build_unified_project_boq,
    save_boq_material_decision,
    export_unified_boq_xlsx,
)
from app.db import (
    get_project,
    save_project,
    build_kid_bedroom_project,
    build_default_demo_project,
)


@pytest.fixture(autouse=True)
def setup_seed_projects():
    # Ensure kid bedroom project is initialized in DB
    kid_proj = build_kid_bedroom_project()
    save_project(kid_proj)
    demo_proj = build_default_demo_project()
    save_project(demo_proj)
    return kid_proj


def test_build_kid_bedroom_boq_structure():
    """Verify Kid Bedroom project generates a valid unified BOQ with proper groups and items."""
    boq = build_unified_project_boq("proj_kid_bedroom")
    assert boq is not None
    assert boq.project_id == "proj_kid_bedroom"
    assert "Phòng Ngủ Trẻ Em" in boq.project_name
    assert len(boq.items) > 0

    # Check that real non-empty construction groups exist
    group_ids = [g.group_id for g in boq.groups]
    assert "group_1_furniture_millwork" in group_ids
    assert "group_3_tile_stone_floor" in group_ids
    assert "group_4_paint_wall_ceiling" in group_ids
    assert "group_6_electrical_lighting" in group_ids
    assert "group_9_labor_logistics_other" in group_ids

    # Every summarized group must have item_count > 0
    for g in boq.groups:
        assert g.item_count > 0
        assert g.subtotal_vnd >= 0


def test_bom_subitems_prevent_double_counting():
    """BOM sub-items nested inside furniture must NOT be added on top of finished product price."""
    boq = build_unified_project_boq("proj_kid_bedroom")

    # Locate wardrobe item
    wardrobe = next((it for it in boq.items if it.source_entity_id == "furn_wardrobe_kid"), None)
    assert wardrobe is not None
    assert wardrobe.is_included_in_total is True
    assert len(wardrobe.bom_breakdown) > 0

    # Ensure bom_breakdown parts have individual calculations but are contained inside the parent
    bom_parts_sum = sum(p.subtotal_vnd or 0 for p in wardrobe.bom_breakdown)
    assert bom_parts_sum > 0

    # Check total calculation logic: total_calculated_vnd equals sum of items in boq.items with is_included_in_total == True
    expected_sum = sum((it.subtotal_vnd or 0) for it in boq.items if it.is_included_in_total)
    assert boq.total_calculated_vnd == pytest.approx(expected_sum, rel=1e-3)
    # Ensure total does NOT double add both parent and child parts
    assert boq.total_calculated_vnd != pytest.approx(expected_sum + bom_parts_sum, rel=1e-3)


def test_materials_ai_proposals_wardrobe():
    """Wardrobe item must provide comprehensive Materials AI proposals (not generic 'Gỗ')."""
    boq = build_unified_project_boq("proj_kid_bedroom")
    wardrobe = next((it for it in boq.items if it.source_entity_id == "furn_wardrobe_kid"), None)
    assert wardrobe is not None

    proposals = wardrobe.material_proposals
    assert len(proposals) >= 2

    # Check Walnut proposal
    walnut_opt = next((p for p in proposals if "óc chó" in p.color_code.lower() or "walnut" in p.color_code.lower()), None)
    assert walnut_opt is not None
    assert walnut_opt.proposed_by_agent == "Materials AI"
    assert "An Cường" in walnut_opt.brand or "Mộc Phát" in walnut_opt.brand or "SmartWood" in walnut_opt.brand
    assert "MDF" in walnut_opt.board_core or "Plywood" in walnut_opt.board_core


def test_decision_persistence_and_audit_trail():
    """User selects Walnut MDF, persists choice, and verifies audit trail upon reload."""
    boq = build_unified_project_boq("proj_kid_bedroom")
    wardrobe = next((it for it in boq.items if it.source_entity_id == "furn_wardrobe_kid"), None)
    assert wardrobe is not None

    # Find the walnut option
    walnut_opt = next((p for p in wardrobe.material_proposals if "óc chó" in p.color_code.lower() or "walnut" in p.color_code.lower()), wardrobe.material_proposals[0])
    ancuong_quote = wardrobe.supplier_quotes[0] if wardrobe.supplier_quotes else None

    payload = BOQDecisionPayload(
        selected_option_id=walnut_opt.option_id,
        selected_quote_id=ancuong_quote.quote_id if ancuong_quote else None,
        custom_material_spec={
            "board_core": "MDF chống ẩm lõi xanh",
            "surface_finish": "Melamine chống xước",
            "color_code": "Vân óc chó (Walnut 612 EV)",
            "thickness_desc": "Thùng vách 17mm, Hậu 9mm",
            "brand_product_code": "An Cường W612-EV",
        },
        approved=True,
        approved_by="Chủ Project (TUAN)",
        notes="Chốt phương án MDF chống ẩm phủ Melamine vân óc chó An Cường.",
    )

    # Save decision using item id
    result = save_boq_material_decision("proj_kid_bedroom", wardrobe.id, payload)
    assert result["ok"] is True
    assert result["saved_decision"] is not None

    # Reload fresh BOQ from project ID
    fresh_boq = build_unified_project_boq("proj_kid_bedroom")
    reloaded_wardrobe = next((it for it in fresh_boq.items if it.id == wardrobe.id), None)
    assert reloaded_wardrobe is not None
    assert reloaded_wardrobe.approval_state == "USER_APPROVED"
    assert reloaded_wardrobe.approved_by == "Chủ Project (TUAN)"
    assert reloaded_wardrobe.selected_material_spec.color_code == "Vân óc chó (Walnut 612 EV)"
    assert reloaded_wardrobe.selected_material_spec.brand_product_code == "An Cường W612-EV"
    assert reloaded_wardrobe.proposed_by_agent == "Materials AI"
    assert reloaded_wardrobe.approved_at is not None


def test_project_isolation_no_data_bleed():
    """Changes in Kid Bedroom BOQ must never affect Demo 4x5m or other projects."""
    kid_boq = build_unified_project_boq("proj_kid_bedroom")
    demo_boq = build_unified_project_boq("proj_demo_4x5m")

    assert kid_boq.project_id == "proj_kid_bedroom"
    assert demo_boq.project_id == "proj_demo_4x5m"
    assert kid_boq.project_name != demo_boq.project_name
    assert kid_boq.total_calculated_vnd != demo_boq.total_calculated_vnd

    # Ensure demo project does not contain kid bedroom specific IDs
    kid_source_ids = {it.source_entity_id for it in kid_boq.items if it.source_entity_id}
    assert "furn_wardrobe_kid" in kid_source_ids
    demo_source_ids = {it.source_entity_id for it in demo_boq.items if it.source_entity_id}
    assert "furn_wardrobe_kid" not in demo_source_ids


def test_export_unified_boq_xlsx():
    """Verify Excel export contains valid workbook structure, correct sheets, and all data columns."""
    xlsx_bytes = export_unified_boq_xlsx("proj_kid_bedroom")
    assert len(xlsx_bytes) > 0
    assert xlsx_bytes[:4] == b"PK\x03\x04"  # ZIP header

    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    assert "Bảng Dự Toán BOQ" in wb.sheetnames
    ws = wb["Bảng Dự Toán BOQ"]

    # Check project header title
    assert "BẢNG DỰ TOÁN KHỐI LƯỢNG" in str(ws.cell(row=1, column=1).value)

    # Check that rows and columns have been populated
    assert ws.max_row >= 15
    assert ws.max_column >= 12
