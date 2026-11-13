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
    AtelierProjectWorkspace,
    AtelierRoomRecord,
    AtelierSceneRecord,
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
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def get_project_workflow_id(project_id: str) -> Optional[str]:
    """Resolve the published workflow for a project without embedding a node graph."""
    conn = get_conn()
    try:
        binding = conn.execute(
            "SELECT workflow_id FROM project_workflow_bindings WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        if binding:
            return binding["workflow_id"]
        latest = conn.execute(
            "SELECT workflow_id FROM workflows ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        return latest["workflow_id"] if latest else None
    finally:
        conn.close()


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
                asset_id="asset_ph_sofa_01_1k",
                asset_version=1,
                geometry_hash="15c4e0560fcdc0f8d0f09aea5d0e7748e9c36eb3a3fe69448c72235b67345e28",
                normalized_glb="/api/v1/assets/asset_ph_sofa_01_1k/file",
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
                asset_id="asset_ph_modern_coffee_table_02_1k",
                asset_version=1,
                normalized_glb="/api/v1/assets/asset_ph_modern_coffee_table_02_1k/file",
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
                asset_id="asset_ph_chinese_console_table_1k",
                asset_version=1,
                normalized_glb="/api/v1/assets/asset_ph_chinese_console_table_1k/file",
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
                asset_id="asset_ph_modern_arm_chair_01_1k",
                asset_version=1,
                normalized_glb="/api/v1/assets/asset_ph_modern_arm_chair_01_1k/file",
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


def build_japandi_master_bedroom_project() -> CanonicalProject:
    ts = now_iso()
    proj = CanonicalProject(
        project_id="proj_bedroom_japandi_4x4m",
        name="Phòng Ngủ Master Japandi (4.19m × 4.04m)",
        description="Dự án thiết kế nội thất phòng ngủ Japandi 4190×4040mm: giường 1800×2000mm bọc nỉ linen greige giữa vách ốp nan sồi, 2 tab treo, bàn phấn 900mm, tủ áo kịch trần cánh kính khói/mây đan, vách TV sơn be nhạt điểm xám sage, sàn Oak Natural, đèn ray 3000K.",
        revision=1,
        units="mm",
        display_unit="m",
        scale_calibrated=True,
        scale_reference=ScaleCalibration(
            p1_px=[0.0, 0.0],
            p2_px=[419.0, 0.0],
            distance_mm=4190.0,
            unit="mm",
            status="confirmed",
        ),
        rooms=[
            RoomZone(
                id="room_master_bedroom",
                name="Phòng Ngủ Master",
                room_type="bedroom",
                polygon_mm=[[0.0, 0.0], [4190.0, 0.0], [4190.0, 4040.0], [0.0, 4040.0]],
                floor_material_id="floor_oak_natural_800x120",
                ceiling_material_id="paint_dulux_ceiling_white",
                ceiling_height_mm=2800.0,
            )
        ],
        walls=[
            WallSegment(
                id="wall_north_headboard",
                start_mm=[0.0, 0.0],
                end_mm=[4190.0, 0.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="veneer_oak_natural_slats",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=True,
            ),
            WallSegment(
                id="wall_east_window",
                start_mm=[4190.0, 0.0],
                end_mm=[4190.0, 4040.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=False,
                face_a_material_id="paint_dulux_japandi_ivory",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=False,
            ),
            WallSegment(
                id="wall_south_entry",
                start_mm=[4190.0, 4040.0],
                end_mm=[0.0, 4040.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=True,
                face_a_material_id="paint_dulux_japandi_ivory",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=False,
            ),
            WallSegment(
                id="wall_west_tv",
                start_mm=[0.0, 4040.0],
                end_mm=[0.0, 0.0],
                thickness_mm=200.0,
                height_mm=2800.0,
                is_bearing=False,
                face_a_material_id="paint_dulux_sage_accent",
                face_b_material_id="paint_dulux_japandi_ivory",
                is_accent_wall=True,
            ),
        ],
        openings=[
            DoorOpening(
                id="door_entry",
                wall_id="wall_south_entry",
                wall_index=2,
                t=0.15,
                width_mm=900.0,
                height_mm=2100.0,
                sill_height_mm=0.0,
                door_type="hinged",
                swing_direction="inward",
                hinges_side="left",
                room_id="room_master_bedroom",
            )
        ],
        windows=[
            WindowOpening(
                id="win_east",
                wall_id="wall_east_window",
                wall_index=1,
                t=0.5,
                width_mm=1600.0,
                height_mm=1400.0,
                sill_height_mm=900.0,
                window_type="sliding",
                room_id="room_master_bedroom",
            )
        ],
        furniture_instances=[
            FurnitureInstance(
                id="bed_japandi_master",
                sku="BED-JAP-LINEN-180",
                name="Giường Ngủ Japandi Vải Linen Greige 1.8x2.0m",
                category="bed",
                room_id="room_master_bedroom",
                x_mm=2095.0,
                y_mm=1100.0,
                z_mm=0.0,
                width_mm=1800.0,
                depth_mm=2000.0,
                height_mm=950.0,
                rotation_deg=0.0,
                color_hex="#D5CBBF",
                price_vnd=28500000.0,
                pascal_asset_id="bed-double",
                vendor="Nhà Xinh / Atelier Custom (Minh họa)",
            ),
            FurnitureInstance(
                id="nightstand_left",
                sku="TAB-OAK-40-L",
                name="Tab Đầu Giường Treo Tường (Trái)",
                category="nightstand",
                room_id="room_master_bedroom",
                x_mm=950.0,
                y_mm=250.0,
                z_mm=450.0,
                width_mm=400.0,
                depth_mm=350.0,
                height_mm=200.0,
                rotation_deg=0.0,
                color_hex="#C8A986",
                price_vnd=2400000.0,
                pascal_asset_id="nightstand",
                vendor="An Cường Wood (Minh họa)",
            ),
            FurnitureInstance(
                id="nightstand_right",
                sku="TAB-OAK-40-R",
                name="Tab Đầu Giường Treo Tường (Phải)",
                category="nightstand",
                room_id="room_master_bedroom",
                x_mm=3240.0,
                y_mm=250.0,
                z_mm=450.0,
                width_mm=400.0,
                depth_mm=350.0,
                height_mm=200.0,
                rotation_deg=0.0,
                color_hex="#C8A986",
                price_vnd=2400000.0,
                pascal_asset_id="nightstand",
                vendor="An Cường Wood (Minh họa)",
            ),
            FurnitureInstance(
                id="vanity_desk",
                sku="DESK-VANITY-OAK-90",
                name="Bàn Phấn & Làm Việc Gỗ Sồi 900mm",
                category="desk",
                room_id="room_master_bedroom",
                x_mm=3800.0,
                y_mm=1600.0,
                z_mm=0.0,
                width_mm=900.0,
                depth_mm=500.0,
                height_mm=750.0,
                rotation_deg=90.0,
                color_hex="#C8A986",
                price_vnd=6800000.0,
                pascal_asset_id="desk",
                vendor="Atelier Millwork (Minh họa)",
            ),
            FurnitureInstance(
                id="wardrobe_full_height",
                sku="WARDROBE-JAP-FLUTED-320",
                name="Hệ Tủ Áo Kịch Trần Cánh Kính Khói & Mây Đan 3.2m",
                category="wardrobe",
                room_id="room_master_bedroom",
                x_mm=2300.0,
                y_mm=3740.0,
                z_mm=0.0,
                width_mm=3200.0,
                depth_mm=600.0,
                height_mm=2800.0,
                rotation_deg=180.0,
                color_hex="#F0EBE1",
                price_vnd=34500000.0,
                pascal_asset_id="wardrobe",
                vendor="Atelier Joinery Suite (Minh họa)",
            ),
            FurnitureInstance(
                id="tv_console_floating",
                sku="TV-CONSOLE-WALL-180",
                name="Kệ TV Treo Thấp Gỗ Sồi Bo Góc 1.8m",
                category="tv_cabinet",
                room_id="room_master_bedroom",
                x_mm=200.0,
                y_mm=2020.0,
                z_mm=350.0,
                width_mm=1800.0,
                depth_mm=350.0,
                height_mm=250.0,
                rotation_deg=270.0,
                color_hex="#C8A986",
                price_vnd=5200000.0,
                pascal_asset_id="tv_console",
                vendor="Atelier Millwork (Minh họa)",
            ),
            FurnitureInstance(
                id="rug_oatmeal_flatweave",
                sku="RUG-OATMEAL-200X240",
                name="Thảm Dệt Phẳng Oatmeal 2.0x2.4m",
                category="rug",
                room_id="room_master_bedroom",
                x_mm=2095.0,
                y_mm=1600.0,
                z_mm=0.0,
                width_mm=2000.0,
                depth_mm=2400.0,
                height_mm=15.0,
                rotation_deg=0.0,
                color_hex="#E8E2D5",
                price_vnd=4800000.0,
                pascal_asset_id="rug",
                vendor="Hanoia / Nhà Xinh (Minh họa)",
            ),
        ],
        brief=DesignBrief(
            style="Japandi",
            room_function="Phòng ngủ Master gia chủ",
            color_palette=["#F5F2EB", "#C8A986", "#B8C2B4", "#17191C"],
            liked_elements=["Gỗ sồi sáng", "Vải linen greige", "Nan gỗ dọc thưa", "Đèn ray 3000K", "Cánh kính khói"],
            disliked_elements=["Đèn chùm rườm rà", "Ánh sáng trắng lạnh", "Tủ cao nặng nề chân tường"],
            budget_limit_vnd=120000000.0,
            occupants="Vợ chồng gia chủ",
            must_have_constraints=["Lối đi thông thủy >= 800mm", "Tổng chi phí hoàn thiện <= 120 triệu VNĐ", "Giữ nguyên tường và kỹ thuật hiện hữu"],
            approved_decisions=[
                "Xác nhận kích thước phòng ngủ 4190×4040mm",
                "Giường 1.8x2.0m đặt giữa vách đầu giường ốp nan sồi",
                "Tủ áo kịch trần chạy dọc tường cuối phòng, bàn phấn 900mm bên phải",
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
        "paperclip_agent_key": "agent_concierge",
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
    {
        "agent_id": "agent_qa",
        "name": "Agent QA & Xác Minh Phối Cảnh (Independent QA)",
        "role": "render_qa",
        "connection_id": "conn_deterministic_concierge",
        "fallback_connection_id": "conn_deterministic_concierge",
        "enabled": True,
        "version": "1.0.0",
        "confidence_threshold": 0.99,
        "system_prompt": "Kiểm tra độc lập artifact scene và ảnh render; chỉ phát QA report PASS/FAIL, không tạo ảnh và không tự phê duyệt.",
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
        "connection_id": "conn_ide_bridge",
        "name": "Antigravity IDE Reverse Bridge (Zero API Cost)",
        "kind": "ide_agent",
        "provider": "antigravity_ide_bridge",
        "endpoint_or_cmd": "internal://bridge/ide_worker",
        "model_name": "antigravity-ide-interactive",
        "status": "CONNECTED",
        "has_secret": False,
        "masked_secret": "Local Antigravity Session Active (Zero Cost)",
        "latency_ms": 1,
        "capabilities": ["zero_api_cost", "direct_blender_exec", "rich_3d_payload", "cad_synthesis"],
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
        {"id": "n13_render_qa", "type": "render_qa", "label": "13. Kiểm Định Chống Sai Lệch 3D", "agent_id": "agent_qa", "position": {"x": 1920, "y": 230}, "enabled": True, "status": "READY", "config": {"strict_geometry": True}},
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

        CREATE TABLE IF NOT EXISTS project_workflow_bindings (
            project_id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(workflow_id),
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

        CREATE TABLE IF NOT EXISTS workflow_native_tasks (
            task_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            local_agent_id TEXT NOT NULL,
            native_agent_id TEXT,
            status TEXT NOT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS workflow_native_tasks_run_idx
            ON workflow_native_tasks(run_id, node_id, created_at);

        CREATE TABLE IF NOT EXISTS workflow_chat_events (
            event_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            conversation_id TEXT,
            run_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            native_task_id TEXT,
            agent_id TEXT,
            execution_run_id TEXT,
            event_type TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(run_id, sequence)
        );
        CREATE INDEX IF NOT EXISTS workflow_chat_events_project_idx
            ON workflow_chat_events(project_id, sequence, created_at);
        CREATE INDEX IF NOT EXISTS workflow_chat_events_run_idx
            ON workflow_chat_events(run_id, sequence);

        CREATE TABLE IF NOT EXISTS workflow_input_events (
            event_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_record_id TEXT NOT NULL,
            source_timestamp TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            processing_status TEXT NOT NULL,
            error TEXT,
            processed_at TEXT NOT NULL,
            UNIQUE(run_id, source_type, source_record_id)
        );
        CREATE INDEX IF NOT EXISTS workflow_input_events_run_idx
            ON workflow_input_events(run_id, source_timestamp);

        CREATE TABLE IF NOT EXISTS workflow_decisions (
            decision_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            decision_key TEXT NOT NULL,
            interaction_id TEXT,
            question_id TEXT,
            answer_value_json TEXT NOT NULL,
            answer_source TEXT NOT NULL,
            user_id TEXT,
            answered_at TEXT NOT NULL,
            validated_at TEXT,
            status TEXT NOT NULL,
            source_message_id TEXT,
            source_event_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(run_id, decision_key, revision),
            UNIQUE(run_id, source_event_id, decision_key)
        );
        CREATE INDEX IF NOT EXISTS workflow_decisions_latest_idx
            ON workflow_decisions(run_id, decision_key, revision DESC);

        CREATE TABLE IF NOT EXISTS workflow_wait_conditions (
            run_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            required_keys_json TEXT NOT NULL,
            missing_keys_json TEXT NOT NULL,
            source_json TEXT NOT NULL,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(run_id, node_id)
        );

        CREATE TABLE IF NOT EXISTS workflow_artifacts (
            artifact_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            schema_version TEXT NOT NULL,
            source_revision INTEGER NOT NULL,
            validation_status TEXT NOT NULL,
            storage_ref TEXT NOT NULL,
            checksum_sha256 TEXT,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS workflow_artifacts_run_idx
            ON workflow_artifacts(run_id, node_id, created_at);

        CREATE TABLE IF NOT EXISTS native_project_links (
            native_project_id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            brief TEXT NOT NULL DEFAULT '',
            conversation_issue_id TEXT,
            initialization_status TEXT NOT NULL DEFAULT 'pending'
                CHECK (initialization_status IN ('pending', 'ready', 'failed')),
            initialization_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS atelier_rooms (
            room_id TEXT PRIMARY KEY,
            native_project_id TEXT NOT NULL REFERENCES native_project_links(native_project_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            room_type TEXT NOT NULL DEFAULT 'other',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS atelier_scene_links (
            scene_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE RESTRICT,
            native_project_id TEXT NOT NULL REFERENCES native_project_links(native_project_id) ON DELETE CASCADE,
            room_id TEXT REFERENCES atelier_rooms(room_id) ON DELETE SET NULL,
            provenance TEXT NOT NULL DEFAULT 'unknown'
                CHECK (provenance IN ('native', 'legacy', 'fixture', 'unknown')),
            is_fixture INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS atelier_rooms_project_idx
            ON atelier_rooms(native_project_id, position, created_at);
        CREATE INDEX IF NOT EXISTS atelier_scene_links_project_idx
            ON atelier_scene_links(native_project_id, room_id, archived);
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

    # Seed Japandi Master Bedroom Project if missing
    row_bedroom = cur.execute("SELECT project_id FROM projects WHERE project_id = ?", ("proj_bedroom_japandi_4x4m",)).fetchone()
    if not row_bedroom:
        bedroom_proj = build_japandi_master_bedroom_project()
        b_payload = bedroom_proj.model_dump_json()
        cur.execute(
            "INSERT INTO projects (project_id, name, revision, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
            (bedroom_proj.project_id, bedroom_proj.name, bedroom_proj.revision, b_payload, bedroom_proj.updated_at),
        )
        cur.execute(
            "INSERT INTO scene_revisions (project_id, revision, author, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (bedroom_proj.project_id, 1, "System Seed", "Khởi tạo dự án Phòng Ngủ Master Japandi 4.19×4.04m theo mặt bằng thực tế", b_payload, bedroom_proj.updated_at),
        )
        b_welcome_meta = {
            "agent_id": "agent_chief_architect",
            "highlights": [
                "Phòng ngủ Master 4.19m × 4.04m (16.9 m²), trần cao 2.8m, tỷ lệ đã xác nhận.",
                "Giường 1.8x2.0m bọc nỉ linen greige, 2 tab treo, bàn phấn 900mm bên phải.",
                "Tủ áo kịch trần cánh kính khói/mây đan chạy dọc tường cuối phòng.",
                f"Tổng dự toán hoàn thiện: {bedroom_proj.estimate_snapshot.total_vnd:,.0f} VNĐ (Trong ngân sách 75-120 triệu VNĐ).",
            ],
            "suggested_prompts": [
                "Kiểm tra lối đi xung quanh giường ngủ 1.8x2.0m có đạt chuẩn thông thủy >= 800mm không?",
                "Tư vấn chi tiết hệ chiếu sáng 3 lớp (Ambient, Task, Accent) và đèn ray 3000K",
                "Xem phối cảnh góc nhìn mắt người (Eye-level) hướng về vách đầu giường ốp nan sồi",
                "Xuất bảng bóc tách khối lượng BOQ chi tiết sang Excel/CSV",
            ],
        }
        cur.execute(
            "INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "msg_welcome_bedroom_01",
                bedroom_proj.project_id,
                "assistant",
                "Kiến Trúc Sư Trưởng (Chief Architect)",
                (
                    "Xin chào! Tôi là **Kiến Trúc Sư Trưởng AI** phụ trách dự án **Phòng Ngủ Master Japandi (4.19m × 4.04m)**. "
                    "Mặt bằng 16.9 m² của bạn đã được thiết lập chuẩn xác từng milimet với giường ngủ 1.8x2.0m đặt giữa vách đầu giường ốp nan sồi, "
                    "hệ tủ áo kịch trần cánh kính khói chạy dọc tường cuối phòng, bàn trang điểm 900mm và vách TV điểm nhấn xám sage.\n\n"
                    f"Toàn bộ khối lượng và dự toán vật tư đã được bóc tách với tổng kinh phí **{bedroom_proj.estimate_snapshot.total_vnd:,.0f} VNĐ** "
                    "(nằm trọn vẹn trong khoảng ngân sách dự kiến 75 - 120 triệu VNĐ)."
                ),
                json.dumps(b_welcome_meta, ensure_ascii=False),
                now_iso(),
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
        agent_payload = dict(a)
        agent_payload.setdefault("paperclip_agent_key", a["agent_id"])
        exists = cur.execute("SELECT agent_id, payload_json FROM agents WHERE agent_id = ?", (a["agent_id"],)).fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO agents (agent_id, name, role, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
                (a["agent_id"], a["name"], a["role"], json.dumps(agent_payload, ensure_ascii=False), now_iso()),
            )
        else:
            current_payload = json.loads(exists["payload_json"]) if "payload_json" in exists.keys() else {}
            if current_payload.get("paperclip_agent_key") != agent_payload["paperclip_agent_key"]:
                current_payload["paperclip_agent_key"] = agent_payload["paperclip_agent_key"]
                cur.execute(
                    "UPDATE agents SET payload_json = ?, updated_at = ? WHERE agent_id = ?",
                    (json.dumps(current_payload, ensure_ascii=False), now_iso(), a["agent_id"]),
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
    else:
        # One-time safe registry migration: preserve the user-drawn graph and all
        # edges, but replace the old self-review assignment with the independent QA agent.
        existing_wf = cur.execute("SELECT payload_json, version FROM workflows WHERE workflow_id = ?", (DEFAULT_WORKFLOW["workflow_id"],)).fetchone()
        workflow_payload = json.loads(existing_wf["payload_json"])
        qa_node = next((node for node in workflow_payload.get("nodes", []) if node.get("id") == "n13_render_qa"), None)
        if qa_node and qa_node.get("agent_id") == "agent_render":
            qa_node["agent_id"] = "agent_qa"
            workflow_payload["version"] = int(existing_wf["version"]) + 1
            cur.execute(
                "UPDATE workflows SET version = ?, payload_json = ?, updated_at = ? WHERE workflow_id = ?",
                (workflow_payload["version"], json.dumps(workflow_payload, ensure_ascii=False), now_iso(), DEFAULT_WORKFLOW["workflow_id"]),
            )

    cur.execute(
        "INSERT OR IGNORE INTO project_workflow_bindings (project_id, workflow_id, updated_at) VALUES (?, ?, ?)",
        ("proj_demo_4x5m", DEFAULT_WORKFLOW["workflow_id"], now_iso()),
    )

    conn.commit()
    conn.close()


def initialize_native_project_link(
    native_project_id: str,
    company_id: str,
    project_name: str,
    brief: str = "",
    conversation_issue_id: Optional[str] = None,
) -> AtelierProjectWorkspace:
    """Idempotently initialize ATELIER metadata for a Native Paperclip Project."""
    ts = now_iso()
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT company_id FROM native_project_links WHERE native_project_id = ?",
            (native_project_id,),
        ).fetchone()
        if existing and existing["company_id"] != company_id:
            raise ValueError("Native project link belongs to another company")
        conn.execute(
            """
            INSERT INTO native_project_links (
                native_project_id, company_id, project_name, brief,
                conversation_issue_id, initialization_status, initialization_error,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'ready', NULL, ?, ?)
            ON CONFLICT(native_project_id) DO UPDATE SET
                project_name = excluded.project_name,
                brief = CASE WHEN excluded.brief <> '' THEN excluded.brief ELSE native_project_links.brief END,
                conversation_issue_id = COALESCE(excluded.conversation_issue_id, native_project_links.conversation_issue_id),
                initialization_status = 'ready',
                initialization_error = NULL,
                updated_at = excluded.updated_at
            """,
            (native_project_id, company_id, project_name, brief, conversation_issue_id, ts, ts),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    workspace = get_native_project_workspace(native_project_id)
    if workspace is None:
        raise RuntimeError("Native project metadata was not persisted")
    return workspace


def mark_native_project_initialization_failed(native_project_id: str, error: str) -> None:
    conn = get_conn()
    try:
        conn.execute(
            """UPDATE native_project_links
               SET initialization_status = 'failed', initialization_error = ?, updated_at = ?
               WHERE native_project_id = ?""",
            (error[:2000], now_iso(), native_project_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_native_project_workspace(native_project_id: str) -> Optional[AtelierProjectWorkspace]:
    conn = get_conn()
    try:
        link = conn.execute(
            "SELECT * FROM native_project_links WHERE native_project_id = ?",
            (native_project_id,),
        ).fetchone()
        if not link:
            return None
        room_rows = conn.execute(
            """SELECT * FROM atelier_rooms WHERE native_project_id = ?
               ORDER BY position ASC, created_at ASC""",
            (native_project_id,),
        ).fetchall()
        scene_rows = conn.execute(
            """
            SELECT p.project_id AS scene_id, p.name, p.revision AS latest_revision,
                   p.updated_at, l.native_project_id, l.room_id, l.provenance,
                   l.is_fixture, l.archived, COUNT(r.id) AS revision_count
            FROM atelier_scene_links l
            JOIN projects p ON p.project_id = l.scene_id
            LEFT JOIN scene_revisions r ON r.project_id = p.project_id
            WHERE l.native_project_id = ?
            GROUP BY p.project_id, p.name, p.revision, p.updated_at, l.native_project_id,
                     l.room_id, l.provenance, l.is_fixture, l.archived
            ORDER BY l.archived ASC, p.updated_at DESC, p.name ASC
            """,
            (native_project_id,),
        ).fetchall()
        rooms = [AtelierRoomRecord(**dict(row)) for row in room_rows]
        scenes = [AtelierSceneRecord(
            scene_id=row["scene_id"],
            native_project_id=row["native_project_id"],
            room_id=row["room_id"],
            name=row["name"],
            provenance=row["provenance"],
            is_fixture=bool(row["is_fixture"]),
            archived=bool(row["archived"]),
            latest_revision=int(row["latest_revision"] or 0),
            revision_count=int(row["revision_count"] or 0),
            updated_at=row["updated_at"],
        ) for row in scene_rows]
        return AtelierProjectWorkspace(
            native_project_id=link["native_project_id"],
            company_id=link["company_id"],
            project_name=link["project_name"],
            brief=link["brief"],
            conversation_issue_id=link["conversation_issue_id"],
            initialization_status=link["initialization_status"],
            initialization_error=link["initialization_error"],
            rooms=rooms,
            scenes=scenes,
        )
    finally:
        conn.close()


def create_atelier_room(native_project_id: str, name: str, room_type: str = "other") -> AtelierRoomRecord:
    ts = now_iso()
    room_id = f"room_{uuid4_hex()}"
    conn = get_conn()
    try:
        link = conn.execute(
            "SELECT native_project_id FROM native_project_links WHERE native_project_id = ?",
            (native_project_id,),
        ).fetchone()
        if not link:
            raise ValueError("Native project link not found")
        position_row = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM atelier_rooms WHERE native_project_id = ?",
            (native_project_id,),
        ).fetchone()
        position = int(position_row["next_position"])
        conn.execute(
            """INSERT INTO atelier_rooms
               (room_id, native_project_id, name, room_type, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (room_id, native_project_id, name.strip(), room_type.strip() or "other", position, ts, ts),
        )
        conn.commit()
        return AtelierRoomRecord(
            room_id=room_id,
            native_project_id=native_project_id,
            name=name.strip(),
            room_type=room_type.strip() or "other",
            position=position,
            created_at=ts,
            updated_at=ts,
        )
    finally:
        conn.close()


def uuid4_hex() -> str:
    import uuid
    return uuid.uuid4().hex[:12]


def link_scene_to_native_project(
    native_project_id: str,
    scene_id: str,
    room_id: Optional[str] = None,
    provenance: str = "legacy",
    is_fixture: bool = False,
) -> AtelierSceneRecord:
    if provenance not in {"native", "legacy", "fixture", "unknown"}:
        raise ValueError("Invalid scene provenance")
    ts = now_iso()
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        link = conn.execute(
            "SELECT native_project_id FROM native_project_links WHERE native_project_id = ?",
            (native_project_id,),
        ).fetchone()
        scene = conn.execute(
            "SELECT project_id FROM projects WHERE project_id = ?",
            (scene_id,),
        ).fetchone()
        if not link:
            raise ValueError("Native project link not found")
        if not scene:
            raise ValueError("Legacy scene not found")
        if room_id:
            room = conn.execute(
                "SELECT native_project_id FROM atelier_rooms WHERE room_id = ?",
                (room_id,),
            ).fetchone()
            if not room or room["native_project_id"] != native_project_id:
                raise ValueError("Room does not belong to the target project")
        conn.execute(
            """
            INSERT INTO atelier_scene_links
                (scene_id, native_project_id, room_id, provenance, is_fixture, archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(scene_id) DO UPDATE SET
                native_project_id = excluded.native_project_id,
                room_id = excluded.room_id,
                provenance = excluded.provenance,
                is_fixture = excluded.is_fixture,
                updated_at = excluded.updated_at
            """,
            (scene_id, native_project_id, room_id, provenance, int(is_fixture), ts, ts),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    workspace = get_native_project_workspace(native_project_id)
    if not workspace:
        raise RuntimeError("Target workspace disappeared")
    result = next((item for item in workspace.scenes if item.scene_id == scene_id), None)
    if not result:
        raise RuntimeError("Scene link was not persisted")
    return result


def audit_legacy_scenes() -> Dict[str, Any]:
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT p.project_id AS scene_id, p.name, p.revision, p.updated_at,
                   l.native_project_id, l.room_id, l.provenance, l.is_fixture,
                   COUNT(r.id) AS revision_count
            FROM projects p
            LEFT JOIN atelier_scene_links l ON l.scene_id = p.project_id
            LEFT JOIN scene_revisions r ON r.project_id = p.project_id
            GROUP BY p.project_id, p.name, p.revision, p.updated_at,
                     l.native_project_id, l.room_id, l.provenance, l.is_fixture
            ORDER BY p.updated_at DESC, p.name ASC
            """
        ).fetchall()
    finally:
        conn.close()
    names: Dict[str, List[str]] = {}
    scenes: List[Dict[str, Any]] = []
    fixture_count = 0
    unknown_ids: List[str] = []
    for row in rows:
        lowered = row["name"].strip().casefold()
        names.setdefault(lowered, []).append(row["scene_id"])
        inferred_fixture = is_fixture_scene(row["scene_id"], row["name"], bool(row["is_fixture"]))
        provenance = row["provenance"] or ("fixture" if inferred_fixture else "unknown")
        if inferred_fixture:
            fixture_count += 1
        if provenance == "unknown":
            unknown_ids.append(row["scene_id"])
        scenes.append({
            "scene_id": row["scene_id"],
            "name": row["name"],
            "native_project_id": row["native_project_id"],
            "room_id": row["room_id"],
            "provenance": provenance,
            "is_fixture": inferred_fixture,
            "latest_revision": int(row["revision"] or 0),
            "revision_count": int(row["revision_count"] or 0),
            "updated_at": row["updated_at"],
        })
    duplicate_groups = [ids for ids in names.values() if len(ids) > 1]
    linked = sum(1 for item in scenes if item["native_project_id"])
    return {
        "generated_at": now_iso(),
        "total_scenes": len(scenes),
        "linked_scenes": linked,
        "unassigned_scenes": len(scenes) - linked,
        "fixture_scenes": fixture_count,
        "duplicate_name_groups": duplicate_groups,
        "unknown_provenance_scene_ids": unknown_ids,
        "scenes": scenes,
    }


def is_fixture_scene(scene_id: str, name: str, explicit_fixture: bool = False) -> bool:
    if explicit_fixture:
        return True
    haystack = f"{scene_id} {name}".casefold()
    return any(marker in haystack for marker in (
        "fixture",
        "regression",
        " e2e",
        "test proj",
        "acceptance",
        "nghiệm thu",
        "material demo",
        "proj_g2_",
        "proj_g7_",
    ))


def list_projects(include_fixtures: bool = True) -> List[CanonicalProject]:
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT p.project_id, p.name, p.payload_json, COALESCE(l.is_fixture, 0) AS is_fixture
        FROM projects p
        LEFT JOIN atelier_scene_links l ON l.scene_id = p.project_id
        ORDER BY p.updated_at DESC
        """
    ).fetchall()
    conn.close()
    return [
        CanonicalProject.model_validate_json(row["payload_json"])
        for row in rows
        if include_fixtures or not is_fixture_scene(row["project_id"], row["name"], bool(row["is_fixture"]))
    ]


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
    else:
        existing_rev = conn.execute(
            "SELECT id FROM scene_revisions WHERE project_id = ? AND revision = ? LIMIT 1",
            (project.project_id, project.revision),
        ).fetchone()
        if not existing_rev:
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
    max_row = conn.execute(
        "SELECT MAX(revision) AS max_rev FROM scene_revisions WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    curr_row = conn.execute(
        "SELECT revision FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    restored = CanonicalProject.model_validate_json(row["payload_json"])
    latest_rev = max(
        int(max_row["max_rev"] or 1) if max_row else 1,
        int(curr_row["revision"] or 1) if curr_row else 1,
        restored.revision,
    )
    restored.revision = latest_rev
    return save_project(restored, author="Undo/Restore", reason=f"Khôi phục về phiên bản #{target_revision}", bump_revision=True)
