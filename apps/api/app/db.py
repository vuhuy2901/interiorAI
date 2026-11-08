"""
ATELIER AI — SQLite WAL Persistence & Seed Registry
Stores Canonical Projects, Scene Revisions, Conversations, Interactive Questions,
Scene Proposals, AI Provider Connections (with redacted secrets), Agents, Workflows,
Workflow Runs, and Audit Logs.
"""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.contracts import (
    CanonicalProject,
    DesignBrief,
    DoorOpening,
    FurnitureInstance,
    RoomZone,
    ScaleCalibration,
    WallSegment,
    WallTileZone,
    WindowOpening,
)
from app.services.cost_engine import calculate_project_estimate

ROOT_DIR = Path(__file__).resolve().parents[4]
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "atelier.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def build_default_demo_project() -> CanonicalProject:
    ts = now_iso()
    proj = CanonicalProject(
        project_id="proj_demo_4x5m",
        name="Căn hộ Studio Phòng Khách 4×5m — Japandi Minh Họa",
        description="Dự án chuẩn 4000×5000mm có 1 cửa đi 900mm, 1 cửa sổ 1500mm, sofa, bàn trà, kệ TV và thảm.",
        revision=1,
        units="mm",
        display_unit="m",
        scale_calibrated=True,
        scale_reference=ScaleCalibration(
            p1_px=[0.0, 0.0],
            p2_px=[400.0, 0.0],
            real_length_mm=4000.0,
            mm_per_px=10.0,
            confirmed_by_user=True,
            confidence=0.99,
            notes="Đã xác nhận cạnh chuẩn Bắc 4000mm (1:1 CAD DXF)",
        ),
        rooms=[
            RoomZone(
                id="room_main",
                name="Phòng khách chính",
                room_type="living",
                polygon_mm=[[0.0, 0.0], [4000.0, 0.0], [4000.0, 5000.0], [0.0, 5000.0]],
                ceiling_height_mm=2800.0,
                floor_material_id="floor_wood_oak_straight",
                ceiling_material_id="paint_ceiling_gypsum_white",
                wall_base_material_id="paint_dulux_japandi_ivory",
                wall_tile_zone=WallTileZone(
                    enabled=False,
                    tile_material_id="wall_tile_300x600_terrazzo",
                    tile_height_mm=1200.0,
                    wall_ids=[],
                ),
                skirting_material_id="skirting_wood_oak_90",
            )
        ],
        walls=[
            WallSegment(
                id="wall_north",
                start_mm=[0.0, 0.0],
                end_mm=[4000.0, 0.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="paint_dulux_japandi_ivory",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=False,
            ),
            WallSegment(
                id="wall_east",
                start_mm=[4000.0, 0.0],
                end_mm=[4000.0, 5000.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="paint_dulux_sage_mist",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=True,
                accent_face="a",
            ),
            WallSegment(
                id="wall_south",
                start_mm=[4000.0, 5000.0],
                end_mm=[0.0, 5000.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="paint_dulux_japandi_ivory",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=False,
            ),
            WallSegment(
                id="wall_west",
                start_mm=[0.0, 5000.0],
                end_mm=[0.0, 0.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="paint_dulux_japandi_ivory",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=False,
            ),
        ],
        openings=[
            DoorOpening(
                id="door_main",
                wall_id="wall_south",
                wall_index=2,
                t=0.28,
                width_mm=900.0,
                height_mm=2100.0,
                sill_height_mm=0.0,
                door_type="hinged",
                swing_direction="inward",
                hinges_side="left",
                room_id="room_main",
            )
        ],
        windows=[
            WindowOpening(
                id="win_north",
                wall_id="wall_north",
                wall_index=0,
                t=0.5,
                width_mm=1500.0,
                height_mm=1400.0,
                sill_height_mm=900.0,
                window_type="sliding",
                room_id="room_main",
            )
        ],
        furniture_instances=[
            FurnitureInstance(
                id="furn_sofa_main",
                sku="SOFA-JAP-210",
                name="Sofa Văng 3 Chỗ Japandi Gỗ Sồi 2.1m",
                category="sofa",
                room_id="room_main",
                x_mm=800.0,
                y_mm=2300.0,
                z_mm=0.0,
                width_mm=2100.0,
                depth_mm=880.0,
                height_mm=780.0,
                rotation_deg=90.0,
                color_hex="#E4DDD3",
                price_vnd=14500000.0,
                pascal_asset_id="sofa",
                source_url="https://baya.vn/products/sofa-japandi-210 (Giá minh họa)",
                vendor="Baya / Nhà Xinh (Minh họa)",
            ),
            FurnitureInstance(
                id="furn_table_main",
                sku="TABLE-COFFEE-110",
                name="Bàn Trà Gỗ Sồi Bo Góc Japandi 1.1m",
                category="coffee_table",
                room_id="room_main",
                x_mm=2150.0,
                y_mm=2300.0,
                z_mm=0.0,
                width_mm=1100.0,
                depth_mm=600.0,
                height_mm=420.0,
                rotation_deg=90.0,
                color_hex="#C8A986",
                price_vnd=4200000.0,
                pascal_asset_id="coffee-table",
                source_url="https://baya.vn/products/ban-tra-oak-110 (Giá minh họa)",
                vendor="Baya (Minh họa)",
            ),
            FurnitureInstance(
                id="furn_tv_main",
                sku="TV-STAND-180",
                name="Hệ Kệ Tivi Gỗ Sồi Tự Nhiên 1.8m",
                category="tv_cabinet",
                room_id="room_main",
                x_mm=3600.0,
                y_mm=2300.0,
                z_mm=0.0,
                width_mm=1800.0,
                depth_mm=420.0,
                height_mm=500.0,
                rotation_deg=270.0,
                color_hex="#BF9B72",
                price_vnd=6800000.0,
                pascal_asset_id="tv-stand",
                source_url="https://nhaxinh.com/ke-tivi-japandi (Giá minh họa)",
                vendor="Nhà Xinh (Minh họa)",
            ),
            FurnitureInstance(
                id="furn_chair_accent",
                sku="CHAIR-LOUNGE-75",
                name="Ghế Thư Giãn Armchair Mây Đan",
                category="armchair",
                room_id="room_main",
                x_mm=2100.0,
                y_mm=700.0,
                z_mm=0.0,
                width_mm=750.0,
                depth_mm=780.0,
                height_mm=760.0,
                rotation_deg=0.0,
                color_hex="#D6C6B2",
                price_vnd=4600000.0,
                pascal_asset_id="livingroom-chair",
                source_url="https://baya.vn/products/armchair-may (Giá minh họa)",
                vendor="Baya (Minh họa)",
            ),
        ],
        design_brief=DesignBrief(
            style="Japandi",
            room_function="Phòng khách sinh hoạt chung & tiếp khách",
            color_palette=["#F5F2EB", "#B8C2B4", "#C8A986", "#276E70"],
            liked_elements=["Gỗ sồi sáng", "Tường điểm nhấn Xanh Sage", "Vải Linen màu kem"],
            disliked_elements=["Tông màu tối nặng nề", "Đồ nội thất chắn lối đi"],
            budget_limit_vnd=120000000.0,
            occupants="Gia đình 2 người lớn, 1 trẻ nhỏ",
            must_have_constraints=["Lối đi thông thủy >= 750mm", "Tổng chi phí hoàn thiện <= 120 triệu VNĐ"],
            approved_decisions=[
                "Xác nhận kích thước phòng chuẩn 4000×5000mm",
                "Chọn sàn gỗ sồi sáng An Cường kết hợp tường nhấn Xanh Sage (Dulux 50GY 53/083)",
            ],
        ),
        approval_state="APPROVED",
        created_at=ts,
        updated_at=ts,
    )
    proj.estimate_snapshot = calculate_project_estimate(proj)
    return proj


DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {
        "agent_id": "agent_chief_architect",
        "name": "Kiến Trúc Sư Trưởng (Chief Architect / Design Concierge)",
        "role": "orchestrator_concierge",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_gemini_api",
        "enabled": True,
        "version": "1.2.0",
        "confidence_threshold": 0.80,
        "system_prompt": (
            "Bạn là Kiến Trúc Sư Trưởng (Design Concierge) của ATELIER AI. "
            "Nhiệm vụ: lắng nghe nhu cầu gia chủ bằng tiếng Việt tự nhiên, phát hiện thông tin còn thiếu "
            "(tỷ lệ bản vẽ, công năng, ngân sách, phong cách), sinh thẻ câu hỏi tương tác (ask_user), "
            "điều phối các Agent chuyên gia và tổng hợp phương án A/B/C kèm bảng so sánh Trước/Sau."
        ),
        "allowed_mcp_tools": ["get_scene_info", "list_nodes_by_type", "verify_scene", "check_collisions"],
        "permissions": {"can_ask_user": True, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_floorplan",
        "name": "Agent Phân Tích Mặt Bằng 2D (Floor Plan Understanding)",
        "role": "floorplan_cv",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_gemini_api",
        "enabled": True,
        "version": "1.1.0",
        "confidence_threshold": 0.85,
        "system_prompt": (
            "Trích xuất tường, cửa đi, cửa sổ, vùng phòng và chữ kích thước từ DXF/PDF/PNG. "
            "Nếu bản vẽ ảnh chưa có tỷ lệ chuẩn (mm/px), bắt buộc dừng và gọi ask_user để người dùng xác nhận 1 cạnh."
        ),
        "allowed_mcp_tools": ["get_scene_info", "verify_scene"],
        "permissions": {"can_ask_user": True, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_geometry",
        "name": "Agent Dựng Hình 3D & BIM (Pascal Geometry Builder)",
        "role": "geometry_mcp",
        "connection_id": "conn_pascal_mcp",
        "fallback_connection_id": "conn_deterministic_concierge",
        "enabled": True,
        "version": "1.0.7",
        "confidence_threshold": 0.90,
        "system_prompt": (
            "Đồng bộ mô hình Canonical (mm) sang Pascal SceneGraph (m) qua @pascal-app/mcp. "
            "Không bao giờ phá hủy tường chịu lực khi chưa được người dùng phê duyệt."
        ),
        "allowed_mcp_tools": [
            "create_building", "create_room", "add_wall", "add_door", "add_window",
            "update_node", "delete_nodes", "verify_scene", "export_json"
        ],
        "permissions": {"can_ask_user": False, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_style",
        "name": "Agent Phong Cách & Vật Liệu Bề Mặt (Style & Surface Material)",
        "role": "style_material",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_gemini_api",
        "enabled": True,
        "version": "1.2.0",
        "confidence_threshold": 0.80,
        "system_prompt": (
            "Tư vấn bảng màu sơn tường (Dulux/Jotun), tường điểm nhấn (Accent Wall), gạch lát sàn/ốp tường "
            "(An Cường, Eurotile, Đồng Tâm) và gọi công cụ paint / set_zone_material trong Pascal MCP."
        ),
        "allowed_mcp_tools": ["paint", "set_zone_material", "search_materials", "apply_preset_material"],
        "permissions": {"can_ask_user": True, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_furniture",
        "name": "Agent Bố Trí Nội Thất & Kiểm Tra Va Chạm (Furniture & Clearance)",
        "role": "furniture_layout",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_pascal_mcp",
        "enabled": True,
        "version": "1.1.0",
        "confidence_threshold": 0.85,
        "system_prompt": (
            "Đề xuất bố cục nội thất Phương án A/B/C, kiểm tra vùng quét cửa mở, đảm bảo hành lang đi lại >= 750mm "
            "và kiểm tra kích thước đồ nội thất lọt cửa phòng."
        ),
        "allowed_mcp_tools": ["place_items", "move_items", "swap_item", "check_collisions", "search_assets"],
        "permissions": {"can_ask_user": True, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_cost",
        "name": "Agent Dự Toán Khối Lượng & Ngân Sách (Deterministic Cost Engine)",
        "role": "cost_boq",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_deterministic_concierge",
        "enabled": True,
        "version": "1.3.0",
        "confidence_threshold": 0.99,
        "system_prompt": (
            "Thực thi công thức tính bóc tách khối lượng xác định (sơn trừ lỗ mở, làm tròn thùng sơn & thùng gạch ceil, "
            "hao hụt vật tư, nhân công, thuế VAT 8%). Tuyệt đối không tự bịa giá bằng LLM."
        ),
        "allowed_mcp_tools": ["get_scene_info", "list_nodes_by_type"],
        "permissions": {"can_ask_user": True, "can_propose_scene": False, "direct_commit": False},
    },
    {
        "agent_id": "agent_shopping",
        "name": "Agent Catalog & Mua Sắm Nội Thất (Product Sourcing & Fit-Check)",
        "role": "shopping_catalog",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_gemini_api",
        "enabled": True,
        "version": "1.0.0",
        "confidence_threshold": 0.85,
        "system_prompt": (
            "Tra cứu sản phẩm từ catalog_vn.csv theo kích thước và ngân sách, kiểm tra lọt lòng phòng "
            "và đề xuất thay thế trực tiếp vào Scene 3D."
        ),
        "allowed_mcp_tools": ["search_assets", "swap_item", "check_collisions"],
        "permissions": {"can_ask_user": False, "can_propose_scene": True, "direct_commit": False},
    },
    {
        "agent_id": "agent_render",
        "name": "Agent Phối Cảnh & Kiểm Định Hình Học (Render & Hallucination Guard)",
        "role": "render_qa",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_gemini_api",
        "enabled": True,
        "version": "1.0.0",
        "confidence_threshold": 0.85,
        "system_prompt": (
            "Chụp phối cảnh từ góc camera khóa cố định và kiểm tra đối chiếu với hình học 3D gốc để không thêm/bớt cửa sổ hoặc đổi kết cấu."
        ),
        "allowed_mcp_tools": ["get_scene_info", "verify_scene"],
        "permissions": {"can_ask_user": False, "can_propose_scene": False, "direct_commit": False},
    },
]


DEFAULT_CONNECTIONS: List[Dict[str, Any]] = [
    {
        "connection_id": "conn_pascal_mcp",
        "name": "Pascal 3D BIM MCP Server (@pascal-app/mcp v1.0.7)",
        "kind": "mcp_server",
        "provider": "pascal-mcp-local",
        "endpoint_or_cmd": "node packages/pascal-adapter/gateway.mjs",
        "model_name": "pascal-scene-bridge-v1.0.7",
        "status": "CONNECTED",
        "has_secret": False,
        "masked_secret": "Local Stdio/Bridge (No API Key Required)",
        "latency_ms": 14,
        "capabilities": ["80_bim_tools", "scene_verification", "collision_check", "surface_paint"],
    },
    {
        "connection_id": "conn_deterministic_concierge",
        "name": "ATELIER Local Architectural Engine + Rule Concierge",
        "kind": "local_engine",
        "provider": "atelier-deterministic-v1",
        "endpoint_or_cmd": "internal://orchestrator/concierge",
        "model_name": "atelier-architect-rules-vn",
        "status": "CONNECTED",
        "has_secret": False,
        "masked_secret": "Built-in Deterministic Engine",
        "latency_ms": 8,
        "capabilities": ["vietnamese_concierge", "ask_user_interrupt", "deterministic_boq", "layout_ab_generator"],
    },
    {
        "connection_id": "conn_gemini_api",
        "name": "Google Gemini API (gemini-2.5-pro / gemini-2.5-flash)",
        "kind": "model_api",
        "provider": "google_gemini",
        "endpoint_or_cmd": "https://generativelanguage.googleapis.com/v1beta",
        "model_name": "gemini-2.5-flash",
        "status": "UNCONFIGURED",
        "has_secret": False,
        "masked_secret": "",
        "latency_ms": None,
        "capabilities": ["vision_floorplan", "tool_calling", "structured_json"],
    },
    {
        "connection_id": "conn_openai_api",
        "name": "OpenAI API / Compatible (GPT-4.1 / o4-mini)",
        "kind": "model_api",
        "provider": "openai",
        "endpoint_or_cmd": "https://api.openai.com/v1",
        "model_name": "gpt-4.1",
        "status": "UNCONFIGURED",
        "has_secret": False,
        "masked_secret": "",
        "latency_ms": None,
        "capabilities": ["vision_floorplan", "tool_calling", "structured_json"],
    },
    {
        "connection_id": "conn_cli_gemini",
        "name": "Gemini CLI / Claude Code Subprocess Adapter",
        "kind": "cli_agent",
        "provider": "cli_subprocess",
        "endpoint_or_cmd": "gemini --non-interactive",
        "model_name": "cli-agent-default",
        "status": "READY_ON_DEMAND",
        "has_secret": False,
        "masked_secret": "Uses Host CLI Profile",
        "latency_ms": None,
        "capabilities": ["local_cli_execution", "json_stdout_contract"],
    },
    {
        "connection_id": "conn_local_ollama",
        "name": "Local AI — Ollama / LM Studio (Low-Spec Friendly)",
        "kind": "local_llm",
        "provider": "ollama",
        "endpoint_or_cmd": "http://127.0.0.1:11434/api/chat",
        "model_name": "qwen2.5:7b-instruct",
        "status": "DISCONNECTED",
        "has_secret": False,
        "masked_secret": "Localhost HTTP",
        "latency_ms": None,
        "capabilities": ["offline_chat", "tool_calling"],
    },
]


DEFAULT_WORKFLOW: Dict[str, Any] = {
    "workflow_id": "wf_default_interior_pipeline",
    "name": "Quy Trình Thiết Kế Nội Thất Đa Agent Chuẩn (14 Nodes)",
    "version": 1,
    "description": "Luồng phối hợp từ nhập bản vẽ 2D, hỏi đáp gia chủ, dựng 3D Pascal MCP, bố trí nội thất, phối màu sơn/gạch đến bóc tách dự toán và xuất CAD.",
    "nodes": [
        {"id": "n1_intake", "type": "input_intake", "label": "1. Nhập Mặt Bằng & Nhu Cầu", "agent_id": "agent_chief_architect", "position": {"x": 40, "y": 140}, "enabled": True, "status": "COMPLETED", "config": {"timeout_s": 30, "retry": 1}},
        {"id": "n2_floorplan", "type": "floorplan_cv", "label": "2. Phân Tích Tường & Cửa 2D", "agent_id": "agent_floorplan", "position": {"x": 300, "y": 60}, "enabled": True, "status": "COMPLETED", "config": {"require_scale": True}},
        {"id": "n3_scale_gate", "type": "human_gate", "label": "3. Xác Nhận Tỷ Lệ Chuẩn (mm)", "agent_id": "agent_floorplan", "position": {"x": 300, "y": 230}, "enabled": True, "status": "COMPLETED", "config": {"gate_type": "SCALE_CONFIRMATION"}},
        {"id": "n4_brief", "type": "concierge_brief", "label": "4. Hỏi Đáp & Chốt Design Brief", "agent_id": "agent_chief_architect", "position": {"x": 570, "y": 140}, "enabled": True, "status": "COMPLETED", "config": {"allow_ask_user": True}},
        {"id": "n5_geometry", "type": "pascal_geometry", "label": "5. Dựng Khung 3D Pascal MCP", "agent_id": "agent_geometry", "position": {"x": 840, "y": 60}, "enabled": True, "status": "COMPLETED", "config": {"mcp_server": "conn_pascal_mcp"}},
        {"id": "n6_style", "type": "style_surface", "label": "6. Phối Sơn Tường & Gạch Sàn (7B)", "agent_id": "agent_style", "position": {"x": 840, "y": 230}, "enabled": True, "status": "COMPLETED", "config": {"apply_accent_wall": True}},
        {"id": "n7_furniture", "type": "furniture_layout", "label": "7. Bố Trí Nội Thất Phương Án A/B", "agent_id": "agent_furniture", "position": {"x": 1110, "y": 60}, "enabled": True, "status": "COMPLETED", "config": {"min_walkway_mm": 750}},
        {"id": "n8_clearance", "type": "collision_qa", "label": "8. Kiểm Tra Va Chạm & Lối Đi", "agent_id": "agent_furniture", "position": {"x": 1110, "y": 230}, "enabled": True, "status": "COMPLETED", "config": {"check_door_swing": True}},
        {"id": "n9_shopping", "type": "catalog_match", "label": "9. Khớp SKU Catalog Việt Nam", "agent_id": "agent_shopping", "position": {"x": 1380, "y": 60}, "enabled": True, "status": "COMPLETED", "config": {"catalog": "catalog_vn.csv"}},
        {"id": "n10_cost", "type": "deterministic_cost", "label": "10. Tính Dự Toán BOQ Xác Định", "agent_id": "agent_cost", "position": {"x": 1380, "y": 230}, "enabled": True, "status": "COMPLETED", "config": {"vat_rate": 0.08}},
        {"id": "n11_approval", "type": "human_gate", "label": "11. Cổng Duyệt Phương Án & Giá", "agent_id": "agent_chief_architect", "position": {"x": 1650, "y": 140}, "enabled": True, "status": "COMPLETED", "config": {"gate_type": "PROPOSAL_APPROVAL"}},
        {"id": "n12_render", "type": "render_gen", "label": "12. Kết Xuất Phối Cảnh Minh Họa", "agent_id": "agent_render", "position": {"x": 1920, "y": 60}, "enabled": True, "status": "READY", "config": {"lock_camera": True}},
        {"id": "n13_render_qa", "type": "render_qa", "label": "13. Kiểm Định Chống Sai Lệch 3D", "agent_id": "agent_render", "position": {"x": 1920, "y": 230}, "enabled": True, "status": "READY", "config": {"strict_geometry": True}},
        {"id": "n14_export", "type": "cad_export", "label": "14. Xuất Hồ Sơ DXF / GLB / IFC / BOQ", "agent_id": "agent_geometry", "position": {"x": 2190, "y": 140}, "enabled": True, "status": "READY", "config": {"formats": ["dxf", "glb", "ifc", "dae", "xlsx"]}},
    ],
    "edges": [
        {"id": "e1-2", "source": "n1_intake", "target": "n2_floorplan"},
        {"id": "e2-3", "source": "n2_floorplan", "target": "n3_scale_gate"},
        {"id": "e3-4", "source": "n3_scale_gate", "target": "n4_brief"},
        {"id": "e4-5", "source": "n4_brief", "target": "n5_geometry"},
        {"id": "e5-6", "source": "n5_geometry", "target": "n6_style"},
        {"id": "e5-7", "source": "n5_geometry", "target": "n7_furniture"},
        {"id": "e7-8", "source": "n7_furniture", "target": "n8_clearance"},
        {"id": "e8-9", "source": "n8_clearance", "target": "n9_shopping"},
        {"id": "e6-10", "source": "n6_style", "target": "n10_cost"},
        {"id": "e9-10", "source": "n9_shopping", "target": "n10_cost"},
        {"id": "e10-11", "source": "n10_cost", "target": "n11_approval"},
        {"id": "e11-12", "source": "n11_approval", "target": "n12_render"},
        {"id": "e12-13", "source": "n12_render", "target": "n13_render_qa"},
        {"id": "e11-14", "source": "n11_approval", "target": "n14_export"},
    ],
}


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            project_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scene_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            author TEXT NOT NULL,
            reason TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            message_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS questions (
            question_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS proposals (
            proposal_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connections (
            connection_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            secret_value TEXT DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
            agent_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflows (
            workflow_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_runs (
            run_id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )

    # Seed Demo Project if missing
    row = cur.execute("SELECT project_id FROM projects WHERE project_id = ?", ("proj_demo_4x5m",)).fetchone()
    if not row:
        demo = build_default_demo_project()
        payload = demo.model_dump_json()
        cur.execute(
            "INSERT INTO projects (project_id, name, revision, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
            (demo.project_id, demo.name, demo.revision, payload, demo.updated_at),
        )
        cur.execute(
            "INSERT INTO scene_revisions (project_id, revision, author, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (demo.project_id, 1, "System Seed", "Khởi tạo dự án mẫu phòng khách 4×5m chuẩn Japandi", payload, demo.updated_at),
        )
        # Seed initial conversation welcome message
        welcome_meta = {
            "agent_id": "agent_chief_architect",
            "highlights": [
                "Phòng khách 4.0m × 5.0m (20 m²), trần cao 2.8m, tỷ lệ đã xác nhận.",
                "Sàn gỗ sồi tự nhiên An Cường + Sơn Dulux Trắng Kem kết hợp tường nhấn Xanh Sage.",
                f"Tổng dự toán hiện tại: {demo.estimate_snapshot.total_vnd:,.0f} VNĐ (Trong ngân sách 120,000,000 VNĐ).",
            ],
            "suggested_prompts": [
                "Tư vấn 2 phương án bố trí A/B cho phòng khách 4×5m này dưới 110 triệu",
                "Sofa hiện tại hơi to, đổi sang sofa nhỏ hơn 1.8m và tính lại giá",
                "Đổi sơn tường nhấn sang màu Xanh Cổ Vịt (Teal Slate) và lát gạch 800×800",
                "Kiểm tra lối đi và khoảng mở cửa đi có bị vướng đồ nội thất không?",
            ],
        }
        cur.execute(
            "INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "msg_welcome_01",
                demo.project_id,
                "assistant",
                "Kiến Trúc Sư Trưởng (Chief Architect)",
                (
                    "Xin chào! Tôi là **Kiến Trúc Sư Trưởng AI** phụ trách dự án **Căn hộ Studio Phòng Khách 4×5m**. "
                    "Mặt bằng 20 m² của bạn đã được đồng bộ 1:1 với mô hình 3D BIM (`@pascal-app/mcp`) và bảng dự toán khối lượng xác định.\n\n"
                    "Bạn có thể trò chuyện trực tiếp để yêu cầu lên phương án thiết kế mới, đổi màu sơn/gạch lát sàn, "
                    "thay đổi kích thước đồ nội thất hoặc kiểm tra ngân sách."
                ),
                json.dumps(welcome_meta, ensure_ascii=False),
                demo.updated_at,
            ),
        )

    # Seed Connections
    for c in DEFAULT_CONNECTIONS:
        exists = cur.execute("SELECT connection_id FROM connections WHERE connection_id = ?", (c["connection_id"],)).fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO connections (connection_id, name, kind, payload_json, secret_value, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (c["connection_id"], c["name"], c["kind"], json.dumps(c, ensure_ascii=False), "", now_iso()),
            )

    # Seed Agents
    for a in DEFAULT_AGENTS:
        exists = cur.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (a["agent_id"],)).fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO agents (agent_id, name, role, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
                (a["agent_id"], a["name"], a["role"], json.dumps(a, ensure_ascii=False), now_iso()),
            )

    # Seed Workflow
    wf_exists = cur.execute("SELECT workflow_id FROM workflows WHERE workflow_id = ?", (DEFAULT_WORKFLOW["workflow_id"],)).fetchone()
    if not wf_exists:
        cur.execute(
            "INSERT INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
            (
                DEFAULT_WORKFLOW["workflow_id"],
                DEFAULT_WORKFLOW["name"],
                DEFAULT_WORKFLOW["version"],
                json.dumps(DEFAULT_WORKFLOW, ensure_ascii=False),
                now_iso(),
            ),
        )

    conn.commit()
    conn.close()


def list_projects() -> List[CanonicalProject]:
    conn = get_conn()
    rows = conn.execute("SELECT payload_json FROM projects ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [CanonicalProject.model_validate_json(r["payload_json"]) for r in rows]


def get_project(project_id: str) -> Optional[CanonicalProject]:
    conn = get_conn()
    row = conn.execute("SELECT payload_json FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return CanonicalProject.model_validate_json(row["payload_json"])


def save_project(project: CanonicalProject, author: str = "User", reason: str = "Cập nhật mô hình", bump_revision: bool = True) -> CanonicalProject:
    ts = now_iso()
    if bump_revision:
        project.revision += 1
    project.updated_at = ts
    project.estimate_snapshot = calculate_project_estimate(project)
    payload = project.model_dump_json()

    conn = get_conn()
    conn.execute(
        """
        INSERT INTO projects (project_id, name, revision, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
            name = excluded.name,
            revision = excluded.revision,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        """,
        (project.project_id, project.name, project.revision, payload, ts),
    )
    if bump_revision:
        conn.execute(
            "INSERT INTO scene_revisions (project_id, revision, author, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project.project_id, project.revision, author, reason, payload, ts),
        )
    conn.commit()
    conn.close()
    return project


def get_project_revisions(project_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, revision, author, reason, created_at FROM scene_revisions WHERE project_id = ? ORDER BY revision DESC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def restore_project_revision(project_id: str, target_revision: int) -> Optional[CanonicalProject]:
    conn = get_conn()
    row = conn.execute(
        "SELECT payload_json FROM scene_revisions WHERE project_id = ? AND revision = ? ORDER BY id DESC LIMIT 1",
        (project_id, target_revision),
    ).fetchone()
    conn.close()
    if not row:
        return None
    restored = CanonicalProject.model_validate_json(row["payload_json"])
    return save_project(restored, author="Undo/Restore", reason=f"Khôi phục về phiên bản #{target_revision}", bump_revision=True)
