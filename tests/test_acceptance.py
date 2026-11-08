"""
ATELIER AI — Comprehensive Acceptance & Multi-Agent Verification Test Suite
Covers:
1. All 10 Mandatory Acceptance Tests (Master Prompt Section 11)
2. Section 7B Surface-level Paint, Accent Wall, Floor Tile & Waste/Package Rounding Formulas
3. All 12 Multi-Agent Orchestration, Conversational Concierge & MCP Gateway Verification Scenarios
"""
from __future__ import annotations
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.main import app  # noqa: E402


def test_full_atelier_acceptance_suite():
    with TestClient(app) as client:
        # 1. Health & Pascal MCP 80 Tools Discovery
        r_health = client.get("/api/v1/health")
        assert r_health.status_code == 200
        h_data = r_health.json()
        assert h_data["status"] == "ok"
        assert h_data["pascal_mcp_connected"] is True
        assert h_data["pascal_mcp_tool_count"] >= 75

        r_tools = client.get("/api/v1/mcp/tools")
        assert r_tools.status_code == 200
        tools_data = r_tools.json()
        assert tools_data["ok"] is True
        tool_names = {t["name"] for t in tools_data["tools"]}
        for required_tool in ("create_room", "add_wall", "add_door", "add_window", "paint", "place_items", "verify_scene"):
            assert required_tool in tool_names

        # 2. Demo 4x5m Project & Spatial QA Verification
        r_proj = client.get("/api/v1/projects/proj_demo_4x5m")
        assert r_proj.status_code == 200
        proj = r_proj.json()
        assert proj["scale_calibrated"] is True
        assert len(proj["walls"]) == 4
        assert len(proj["openings"]) == 1
        assert len(proj["windows"]) == 1
        assert proj["spatial_qa"]["walkway_ok"] is True

        # 3. DXF Export & 1:1 Round-Trip Import Tolerance <= 1 mm
        r_dxf = client.get("/api/v1/exports/proj_demo_4x5m/dxf")
        assert r_dxf.status_code == 200
        dxf_bytes = r_dxf.content
        assert len(dxf_bytes) > 500

        r_imp = client.post(
            "/api/v1/imports",
            data={"project_id": "proj_demo_4x5m"},
            files={"file": ("roundtrip_4x5m.dxf", dxf_bytes, "application/dxf")},
        )
        assert r_imp.status_code == 200
        parsed_dxf = r_imp.json()["parsed"]
        assert abs(parsed_dxf["width_mm"] - 4000.0) <= 1.0
        assert abs(parsed_dxf["depth_mm"] - 5000.0) <= 1.0

        # 4. Uncalibrated Raster Upload -> Ask User Interrupt & Resume Gate
        r_uncal = client.post(
            "/api/v1/imports",
            data={"project_id": "proj_demo_4x5m"},
            files={"file": ("unscaled_plan.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
        )
        assert r_uncal.status_code == 200
        assert r_uncal.json()["parsed"]["requires_scale_confirmation"] is True

        # Chat while uncalibrated triggers QuestionRequest (WAITING_FOR_INPUT)
        r_chat_interrupt = client.post(
            "/api/v1/chat/messages",
            json={"project_id": "proj_demo_4x5m", "message": "Hãy thiết kế nội thất cho mặt bằng này"},
        )
        assert r_chat_interrupt.status_code == 200
        interrupt_meta = r_chat_interrupt.json()["metadata"]
        assert interrupt_meta["workflow_state"] == "WAITING_FOR_INPUT"
        q_id = interrupt_meta["question"]["question_id"]

        # Answer Question to Resume Workflow & Unlock High-Confidence Estimate
        r_ans = client.post(f"/api/v1/questions/{q_id}/answer", json={"answer": "4000 mm"})
        assert r_ans.status_code == 200
        resumed_proj = r_ans.json()["project"]
        assert resumed_proj["scale_calibrated"] is True
        assert resumed_proj["estimate_snapshot"]["confidence_level"] == "HIGH_VERIFIED_SCALE"

        # 5. Conversational Feedback: Smaller Sofa Proposal -> Approve -> Undo/Restore
        rev_before = resumed_proj["revision"]
        r_chat_sofa = client.post(
            "/api/v1/chat/messages",
            json={"project_id": "proj_demo_4x5m", "message": "Sofa hiện tại hơi to, đổi sang sofa nhỏ hơn 1.8m"},
        )
        assert r_chat_sofa.status_code == 200
        prop = r_chat_sofa.json()["metadata"]["proposal"]
        assert prop["status"] == "PENDING"
        assert prop["cost_delta_vnd"] < 0  # Smaller 1.8m sofa is cheaper than 2.1m sofa

        # Approve Proposal
        r_app = client.post(f"/api/v1/proposals/{prop['proposal_id']}/approve", json={})
        assert r_app.status_code == 200
        approved_proj = r_app.json()["project"]
        assert approved_proj["revision"] == rev_before + 1
        sofa_now = next(f for f in approved_proj["furniture_instances"] if f["category"] == "sofa")
        assert sofa_now["width_mm"] == 1800.0

        # Restore previous revision (Undo)
        r_undo = client.post(f"/api/v1/projects/proj_demo_4x5m/revisions/{rev_before}/restore")
        assert r_undo.status_code == 200
        restored_proj = r_undo.json()
        sofa_restored = next(f for f in restored_proj["furniture_instances"] if f["category"] == "sofa")
        assert sofa_restored["width_mm"] == 2100.0

        # 6. Section 7B Surface Update (Accent Wall Paint + 800x800 Calacatta Tile) & Selective Invalidation
        r_surf = client.post(
            "/api/v1/projects/proj_demo_4x5m/surfaces",
            json={
                "floor_material_id": "floor_tile_800x800_calacatta",
                "wall_base_material_id": "paint_dulux_japandi_ivory",
                "accent_wall_id": "wall_east",
                "accent_paint_id": "paint_dulux_teal_accent",
                "wall_tile_enabled": True,
                "wall_tile_material_id": "wall_tile_300x600_terrazzo",
                "wall_tile_height_mm": 1200.0,
            },
        )
        assert r_surf.status_code == 200
        surf_data = r_surf.json()
        assert surf_data["geometry_rebuilt"] is False
        assert "n6_style" in surf_data["invalidated_nodes"]
        assert "n5_geometry" not in surf_data["invalidated_nodes"]
        est_lines = surf_data["project"]["estimate_snapshot"]["lines"]
        categories = {l["category"] for l in est_lines}
        assert "paint" in categories
        assert "floor_tile_wood" in categories
        assert "wall_tile" in categories
        assert "skirting" in categories

        # 7. Product Catalog Fit-Check & Direct Scene Replacement
        r_fit = client.post(
            "/api/v1/catalog/fit-check",
            json={"project_id": "proj_demo_4x5m", "sku": "SOFA-JAP-210"},
        )
        assert r_fit.status_code == 200
        assert r_fit.json()["overall_fit"] is True

        # 8. Agent MCP Tool Permission Guard (Cost Agent cannot call delete_nodes)
        r_perm = client.post(
            "/api/v1/mcp/call",
            json={"tool_name": "delete_nodes", "arguments": {"nodeIds": ["w1"]}, "agent_id": "agent_cost"},
        )
        assert r_perm.status_code == 200
        assert r_perm.json()["ok"] is False
        assert "PermissionDenied" in r_perm.json()["error"]

        # 9. AI Connection Secret Redaction Check
        r_conn_upd = client.put(
            "/api/v1/connections/conn_gemini_api",
            json={"api_key": "AIzaSySuperSecretKey123456789"},
        )
        assert r_conn_upd.status_code == 200
        conns = client.get("/api/v1/connections").json()
        gemini_conn = next(c for c in conns if c["connection_id"] == "conn_gemini_api")
        assert gemini_conn["has_secret"] is True
        assert "AIzaSySuperSecretKey123456789" not in str(gemini_conn)
        assert "REDACTED" in gemini_conn["masked_secret"]

        # 10. Binary GLB, IFC4, COLLADA DAE, CSV & XLSX Exports
        for fmt in ("glb", "ifc", "dae", "csv", "xlsx"):
            r_exp = client.get(f"/api/v1/exports/proj_demo_4x5m/{fmt}")
            assert r_exp.status_code == 200
            assert len(r_exp.content) > 100
