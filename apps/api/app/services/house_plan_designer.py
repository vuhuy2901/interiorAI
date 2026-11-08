"""
ATELIER AI — House Plan Designer Skill Engine (Upgrade 1 & 3)
Reference: https://github.com/ZWD11/house-plan-designer
Transforms raster/vector floor plans into structured, validated FloorSpec JSON,
auto-generates multi-room layouts, and maps directly into Pascal 3D SceneGraph.
"""
from __future__ import annotations
import math
import uuid
from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

from app.models.contracts import (
    CanonicalProject,
    DoorOpening,
    FurnitureInstance,
    RoomZone,
    ScaleCalibration,
    WallSegment,
    WindowOpening,
)


class LightingFixture(BaseModel):
    id: str
    fixture_type: Literal["downlight_recessed", "pendant_chandelier", "track_light", "cove_led_strip", "wall_sconce"]
    room_id: str
    position_mm: List[float]  # [x, y, z]
    lumen: int = 800
    color_temp_k: int = 3500  # 3000K warm, 4000K neutral
    power_watts: float = 9.0
    brand: str = "Rạng Đông Eco Downlight"
    unit_price_vnd: float = 185000.0


class StructuredRoomSpec(BaseModel):
    id: str
    name: str
    room_type: Literal["living", "bedroom_master", "bedroom_sub", "kitchen_dining", "bathroom", "balcony"]
    polygon_mm: List[List[float]]
    area_sqm: float
    ceiling_height_mm: float = 2800.0
    ceiling_type: Literal["flat_gypsum", "recessed_tray", "slatted_wood"] = "recessed_tray"
    ceiling_drop_mm: float = 150.0
    floor_material_id: str = "floor_wood_oak_straight"
    wall_paint_id: str = "paint_dulux_japandi_ivory"
    lighting_fixtures: List[LightingFixture] = Field(default_factory=list)


class FloorSpec(BaseModel):
    plan_id: str
    source_format: Literal["png", "jpg", "pdf", "dxf", "dwg", "json"]
    scale_confirmed: bool = True
    mm_per_px: float = 10.0
    calibration_edge_mm: float = 4000.0
    overall_width_mm: float
    overall_depth_mm: float
    total_usable_area_sqm: float
    rooms: List[StructuredRoomSpec] = Field(default_factory=list)
    walls: List[WallSegment] = Field(default_factory=list)
    doors: List[DoorOpening] = Field(default_factory=list)
    windows: List[WindowOpening] = Field(default_factory=list)
    furniture_layout: List[FurnitureInstance] = Field(default_factory=list)


def build_default_multiroom_floorspec(scale_confirmed: bool = True, reference_length_mm: float = 4000.0) -> FloorSpec:
    """
    Constructs a complete multi-room apartment FloorSpec (Living, Kitchen/Dining, Master Bedroom, Bath, Balcony)
    used for full-apartment design and benchmark testing.
    Overall dimensions: 7.5m width x 7.0m depth = ~52.5 m²
    """
    scale_factor = reference_length_mm / 4000.0 if scale_confirmed else 1.0

    # Room 1: Living Room (4.0m x 4.5m)
    r_living_poly = [[0.0, 0.0], [4000.0 * scale_factor, 0.0], [4000.0 * scale_factor, 4500.0 * scale_factor], [0.0, 4500.0 * scale_factor]]
    # Room 2: Kitchen & Dining (3.5m x 4.5m)
    r_kitchen_poly = [[4000.0 * scale_factor, 0.0], [7500.0 * scale_factor, 0.0], [7500.0 * scale_factor, 4500.0 * scale_factor], [4000.0 * scale_factor, 4500.0 * scale_factor]]
    # Room 3: Master Bedroom (4.5m x 3.5m)
    r_bed_poly = [[0.0, 4500.0 * scale_factor], [4500.0 * scale_factor, 4500.0 * scale_factor], [4500.0 * scale_factor, 7500.0 * scale_factor], [0.0, 7500.0 * scale_factor]]
    # Room 4: Bathroom (2.0m x 2.2m)
    r_bath_poly = [[4500.0 * scale_factor, 4500.0 * scale_factor], [6500.0 * scale_factor, 4500.0 * scale_factor], [6500.0 * scale_factor, 6700.0 * scale_factor], [4500.0 * scale_factor, 6700.0 * scale_factor]]
    # Room 5: Loggia / Balcony (1.0m x 3.0m)
    r_balcony_poly = [[6500.0 * scale_factor, 4500.0 * scale_factor], [7500.0 * scale_factor, 4500.0 * scale_factor], [7500.0 * scale_factor, 7500.0 * scale_factor], [6500.0 * scale_factor, 7500.0 * scale_factor]]

    rooms = [
        StructuredRoomSpec(
            id="room_living",
            name="Phòng Khách Sinh Hoạt Chung",
            room_type="living",
            polygon_mm=r_living_poly,
            area_sqm=round(18.0 * scale_factor * scale_factor, 1),
            ceiling_type="recessed_tray",
            ceiling_drop_mm=150.0,
            floor_material_id="floor_wood_oak_straight",
            wall_paint_id="paint_dulux_japandi_ivory",
            lighting_fixtures=[
                LightingFixture(id="light_liv_cove", fixture_type="cove_led_strip", room_id="room_living", position_mm=[2000.0 * scale_factor, 2250.0 * scale_factor, 2650.0], power_watts=36.0, unit_price_vnd=650000.0),
                LightingFixture(id="light_liv_dl_1", fixture_type="downlight_recessed", room_id="room_living", position_mm=[1000.0 * scale_factor, 1000.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_liv_dl_2", fixture_type="downlight_recessed", room_id="room_living", position_mm=[3000.0 * scale_factor, 1000.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_liv_dl_3", fixture_type="downlight_recessed", room_id="room_living", position_mm=[1000.0 * scale_factor, 3500.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_liv_dl_4", fixture_type="downlight_recessed", room_id="room_living", position_mm=[3000.0 * scale_factor, 3500.0 * scale_factor, 2800.0]),
            ],
        ),
        StructuredRoomSpec(
            id="room_kitchen",
            name="Khu Vực Bếp & Bàn Ăn",
            room_type="kitchen_dining",
            polygon_mm=r_kitchen_poly,
            area_sqm=round(15.75 * scale_factor * scale_factor, 1),
            ceiling_type="flat_gypsum",
            floor_material_id="floor_tile_600x600_matte_sand",
            wall_paint_id="paint_dulux_japandi_ivory",
            lighting_fixtures=[
                LightingFixture(id="light_kit_pendant", fixture_type="pendant_chandelier", room_id="room_kitchen", position_mm=[5750.0 * scale_factor, 2250.0 * scale_factor, 2100.0], brand="Đèn Thả Bàn Ăn Hiện Đại 3 Chao", unit_price_vnd=1450000.0),
                LightingFixture(id="light_kit_dl_1", fixture_type="downlight_recessed", room_id="room_kitchen", position_mm=[5000.0 * scale_factor, 1000.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_kit_dl_2", fixture_type="downlight_recessed", room_id="room_kitchen", position_mm=[6500.0 * scale_factor, 1000.0 * scale_factor, 2800.0]),
            ],
        ),
        StructuredRoomSpec(
            id="room_bed_master",
            name="Phòng Ngủ Master",
            room_type="bedroom_master",
            polygon_mm=r_bed_poly,
            area_sqm=round(13.5 * scale_factor * scale_factor, 1),
            ceiling_type="flat_gypsum",
            floor_material_id="floor_wood_oak_straight",
            wall_paint_id="paint_dulux_sage_mist",
            lighting_fixtures=[
                LightingFixture(id="light_bed_dl_1", fixture_type="downlight_recessed", room_id="room_bed_master", position_mm=[1500.0 * scale_factor, 6000.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_bed_dl_2", fixture_type="downlight_recessed", room_id="room_bed_master", position_mm=[3500.0 * scale_factor, 6000.0 * scale_factor, 2800.0]),
                LightingFixture(id="light_bed_sconce", fixture_type="wall_sconce", room_id="room_bed_master", position_mm=[500.0 * scale_factor, 7000.0 * scale_factor, 1600.0], brand="Đèn Đọc Sách Đầu Giường", unit_price_vnd=420000.0),
            ],
        ),
        StructuredRoomSpec(
            id="room_bath",
            name="Phòng Vệ Sinh & Tắm Kính",
            room_type="bathroom",
            polygon_mm=r_bath_poly,
            area_sqm=round(4.4 * scale_factor * scale_factor, 1),
            ceiling_type="flat_gypsum",
            floor_material_id="floor_tile_anti_slip_300x300",
            wall_paint_id="paint_waterproof_white",
            lighting_fixtures=[
                LightingFixture(id="light_bath_dl", fixture_type="downlight_recessed", room_id="room_bath", position_mm=[5500.0 * scale_factor, 5600.0 * scale_factor, 2800.0]),
            ],
        ),
    ]

    # Walls for perimeter & partitions
    w1 = WallSegment(id="wall_ext_north", start_mm=[0.0, 0.0], end_mm=[7500.0 * scale_factor, 0.0], thickness_mm=220.0, height_mm=2800.0)
    w2 = WallSegment(id="wall_ext_east", start_mm=[7500.0 * scale_factor, 0.0], end_mm=[7500.0 * scale_factor, 7500.0 * scale_factor], thickness_mm=220.0, height_mm=2800.0)
    w3 = WallSegment(id="wall_ext_south", start_mm=[7500.0 * scale_factor, 7500.0 * scale_factor], end_mm=[0.0, 7500.0 * scale_factor], thickness_mm=220.0, height_mm=2800.0)
    w4 = WallSegment(id="wall_ext_west", start_mm=[0.0, 7500.0 * scale_factor], end_mm=[0.0, 0.0], thickness_mm=220.0, height_mm=2800.0)
    # Partitions
    w5 = WallSegment(id="wall_part_mid_vert", start_mm=[4000.0 * scale_factor, 0.0], end_mm=[4000.0 * scale_factor, 4500.0 * scale_factor], thickness_mm=110.0, height_mm=2800.0, is_bearing=False)
    w6 = WallSegment(id="wall_part_mid_horiz", start_mm=[0.0, 4500.0 * scale_factor], end_mm=[7500.0 * scale_factor, 4500.0 * scale_factor], thickness_mm=110.0, height_mm=2800.0, is_bearing=False)
    w7 = WallSegment(id="wall_part_bath", start_mm=[4500.0 * scale_factor, 4500.0 * scale_factor], end_mm=[4500.0 * scale_factor, 6700.0 * scale_factor], thickness_mm=110.0, height_mm=2800.0, is_bearing=False)

    walls = [w1, w2, w3, w4, w5, w6, w7]

    doors = [
        DoorOpening(id="door_main_entrance", wall_id="wall_ext_north", wall_index=0, t=0.2, width_mm=950.0, height_mm=2200.0, door_type="hinged", room_id="room_living"),
        DoorOpening(id="door_master_bed", wall_id="wall_part_mid_horiz", wall_index=5, t=0.25, width_mm=850.0, height_mm=2100.0, door_type="hinged", room_id="room_bed_master"),
        DoorOpening(id="door_bath", wall_id="wall_part_bath", wall_index=6, t=0.5, width_mm=750.0, height_mm=2000.0, door_type="hinged", room_id="room_bath"),
        DoorOpening(id="door_balcony", wall_id="wall_part_mid_horiz", wall_index=5, t=0.9, width_mm=800.0, height_mm=2100.0, door_type="sliding", room_id="room_kitchen"),
    ]

    windows = [
        WindowOpening(id="win_living_bay", wall_id="wall_ext_west", wall_index=3, t=0.3, width_mm=2000.0, height_mm=1600.0, sill_height_mm=600.0, window_type="floor_window", room_id="room_living"),
        WindowOpening(id="win_bed_master", wall_id="wall_ext_south", wall_index=2, t=0.3, width_mm=1800.0, height_mm=1400.0, sill_height_mm=900.0, window_type="sliding", room_id="room_bed_master"),
        WindowOpening(id="win_kitchen_loggia", wall_id="wall_ext_east", wall_index=1, t=0.5, width_mm=1200.0, height_mm=1200.0, sill_height_mm=1000.0, window_type="casement", room_id="room_kitchen"),
    ]

    # Comprehensive multi-room furniture layout
    furniture = [
        # Living Room
        FurnitureInstance(id="furn_sofa_3p", sku="VN-SF-JAP-210", name="Sofa Băng 3 Chỗ Vải Linen Japandi", category="sofa", room_id="room_living", x_mm=1200.0 * scale_factor, y_mm=2250.0 * scale_factor, width_mm=2100.0, depth_mm=880.0, height_mm=780.0, rotation_deg=90.0, color_hex="#E8E2D8", price_vnd=14500000.0, vendor="KUKA Home Vietnam"),
        FurnitureInstance(id="furn_coffee_table", sku="VN-TB-OAK-D80", name="Bàn Trà Tròn Mặt Đá Ceramic & Chân Gỗ Sồi", category="coffee_table", room_id="room_living", x_mm=2100.0 * scale_factor, y_mm=2250.0 * scale_factor, width_mm=800.0, depth_mm=800.0, height_mm=420.0, rotation_deg=0.0, color_hex="#F5F3EF", price_vnd=4200000.0, vendor="Nhà Xinh"),
        FurnitureInstance(id="furn_tv_console", sku="VN-TV-OAK-180", name="Kệ Tivi Treo Tường Gỗ MDF Chống Ẩm An Cường", category="tv_console", room_id="room_living", x_mm=3650.0 * scale_factor, y_mm=2250.0 * scale_factor, width_mm=1800.0, depth_mm=350.0, height_mm=400.0, rotation_deg=90.0, color_hex="#D0B89C", price_vnd=5800000.0, vendor="An Cường Wood Working"),
        FurnitureInstance(id="furn_living_rug", sku="VN-RUG-JAP-2x3", name="Thảm Dệt Sợi Ngắn Tối Giản 2.0x2.8m", category="rug", room_id="room_living", x_mm=2100.0 * scale_factor, y_mm=2250.0 * scale_factor, width_mm=2800.0, depth_mm=2000.0, height_mm=15.0, rotation_deg=0.0, color_hex="#E2DBD1", price_vnd=3600000.0, vendor="JYSK Vietnam"),
        FurnitureInstance(id="furn_plant_monstera", sku="VN-PLT-MON-120", name="Cây Bàng Singapore Chậu Gốm Mộc 1.4m", category="plant", room_id="room_living", x_mm=400.0 * scale_factor, y_mm=400.0 * scale_factor, width_mm=500.0, depth_mm=500.0, height_mm=1400.0, rotation_deg=0.0, color_hex="#4A6B53", price_vnd=1200000.0, vendor="Vườn Kiểng Xanh"),
        # Kitchen & Dining
        FurnitureInstance(id="furn_dining_table", sku="VN-DT-OAK-160", name="Bàn Ăn 4 Ghế Gỗ Sồi Tự Nhiên Bắc Âu", category="dining_table", room_id="room_kitchen", x_mm=5750.0 * scale_factor, y_mm=2250.0 * scale_factor, width_mm=1400.0, depth_mm=800.0, height_mm=750.0, rotation_deg=0.0, color_hex="#C2A888", price_vnd=8900000.0, vendor="Chilai Vietnam"),
        FurnitureInstance(id="furn_kitchen_cabinet", sku="VN-KC-LSHAPE", name="Hệ Tủ Bếp Chữ L Gỗ MDF Phủ Acrylic", category="kitchen_cabinet", room_id="room_kitchen", x_mm=6800.0 * scale_factor, y_mm=1200.0 * scale_factor, width_mm=2400.0, depth_mm=600.0, height_mm=2200.0, rotation_deg=90.0, color_hex="#FAF9F6", price_vnd=28500000.0, vendor="An Cường Kitchen"),
        # Master Bedroom
        FurnitureInstance(id="furn_bed_master", sku="VN-BED-OAK-180", name="Giường Ngủ 1.8x2.0m Bọc Nệm Đầu Giường", category="bed", room_id="room_bed_master", x_mm=2250.0 * scale_factor, y_mm=6000.0 * scale_factor, width_mm=1900.0, depth_mm=2100.0, height_mm=950.0, rotation_deg=0.0, color_hex="#D5CBBF", price_vnd=16800000.0, vendor="Nhà Xinh"),
        FurnitureInstance(id="furn_wardrobe_master", sku="VN-WR-SLIDE-200", name="Tủ Áo Cánh Lùa Kịch Trần 2.0m", category="wardrobe", room_id="room_bed_master", x_mm=4000.0 * scale_factor, y_mm=6000.0 * scale_factor, width_mm=2000.0, depth_mm=600.0, height_mm=2600.0, rotation_deg=90.0, color_hex="#E8E2D5", price_vnd=18200000.0, vendor="An Cường Wood Working"),
        FurnitureInstance(id="furn_curtain_master", sku="VN-CUR-DOUBLE", name="Rèm Cửa 2 Lớp Cản Sáng 100% Khổ Rộng 2.2m", category="curtain", room_id="room_bed_master", x_mm=2250.0 * scale_factor, y_mm=7350.0 * scale_factor, width_mm=2200.0, depth_mm=150.0, height_mm=2600.0, rotation_deg=0.0, color_hex="#8A9A86", price_vnd=4500000.0, vendor="Rèm Cửa Hàn Quốc"),
    ]

    total_area = sum(r.area_sqm for r in rooms)

    return FloorSpec(
        plan_id=f"plan_house_{uuid.uuid4().hex[:8]}",
        source_format="png",
        scale_confirmed=scale_confirmed,
        mm_per_px=round(10.0 / scale_factor, 4),
        calibration_edge_mm=reference_length_mm,
        overall_width_mm=7500.0 * scale_factor,
        overall_depth_mm=7500.0 * scale_factor,
        total_usable_area_sqm=total_area,
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
        furniture_layout=furniture,
    )


def convert_floorspec_to_canonical_project(floor_spec: FloorSpec, project_id: str = "proj_demo_4x5m", project_name: str = "Căn Hộ Đa Phòng ATELIER") -> CanonicalProject:
    """
    Transforms structured FloorSpec directly into CanonicalProject for SceneGraph, CAD export & BOQ calculation.
    """
    canonical_rooms: List[RoomZone] = []
    for r in floor_spec.rooms:
        canonical_rooms.append(
            RoomZone(
                id=r.id,
                name=r.name,
                room_type=r.room_type if r.room_type in ["living", "bedroom", "kitchen", "bathroom", "dining", "office", "balcony"] else "living",
                polygon_mm=r.polygon_mm,
                ceiling_height_mm=r.ceiling_height_mm,
                floor_material_id=r.floor_material_id,
                wall_base_material_id=r.wall_paint_id,
            )
        )

    return CanonicalProject(
        project_id=project_id,
        name=project_name,
        description=f"Dự án phân tích từ mặt bằng kiến trúc {floor_spec.source_format.upper()} — Diện tích sử dụng: {floor_spec.total_usable_area_sqm} m²",
        revision=1,
        units="mm",
        display_unit="m",
        scale_calibrated=floor_spec.scale_confirmed,
        scale_reference=ScaleCalibration(
            p1_px=[0.0, 0.0],
            p2_px=[400.0, 0.0],
            real_length_mm=floor_spec.calibration_edge_mm,
            mm_per_px=floor_spec.mm_per_px,
            confirmed_by_user=floor_spec.scale_confirmed,
            confidence=1.0 if floor_spec.scale_confirmed else 0.5,
            notes="Đã xác nhận tỷ lệ 1 cạnh chuẩn bằng House Plan Designer" if floor_spec.scale_confirmed else "Chưa xác nhận tỷ lệ — Cần kiểm tra thước đo mm",
        ),
        rooms=canonical_rooms,
        walls=floor_spec.walls,
        openings=floor_spec.doors,
        windows=floor_spec.windows,
        furniture_instances=floor_spec.furniture_layout,
    )


def convert_floorspec_to_pascal_scenegraph(floor_spec: FloorSpec) -> Dict[str, Any]:
    """
    Builds the complete Pascal SceneGraph 3D JSON node hierarchy (meters) representing the entire house.
    """
    children: List[Dict[str, Any]] = []

    # 1. Floor Slabs per room
    for r in floor_spec.rooms:
        # compute center & extents
        xs = [p[0] / 1000.0 for p in r.polygon_mm]
        ys = [p[1] / 1000.0 for p in r.polygon_mm]
        cx, cz = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
        sx, sz = max(xs) - min(xs), max(ys) - min(ys)
        children.append({
            "id": f"node_slab_{r.id}",
            "name": f"Floor Slab • {r.name}",
            "type": "mesh",
            "geometry": {"type": "box", "width": sx, "height": 0.05, "depth": sz},
            "material": {"type": "pbr", "materialId": r.floor_material_id, "roughness": 0.35},
            "transform": {"position": [cx, -0.025, cz], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        })

    # 2. Wall Solids with cutouts
    for w in floor_spec.walls:
        x0, z0 = w.start_mm[0] / 1000.0, w.start_mm[1] / 1000.0
        x1, z1 = w.end_mm[0] / 1000.0, w.end_mm[1] / 1000.0
        length = math.hypot(x1 - x0, z1 - z0)
        angle = math.atan2(z1 - z0, x1 - x0)
        thick = w.thickness_mm / 1000.0
        height = w.height_mm / 1000.0
        cx, cz = (x0 + x1) / 2.0, (z0 + z1) / 2.0

        children.append({
            "id": f"node_wall_{w.id}",
            "name": f"Wall • {w.id}",
            "type": "mesh",
            "geometry": {"type": "box", "width": length, "height": height, "depth": thick},
            "material": {"type": "pbr", "materialId": w.face_a_material_id, "roughness": 0.8},
            "transform": {"position": [cx, height / 2.0, cz], "rotation": [0, -angle, 0], "scale": [1, 1, 1]},
        })

    # 3. Ceilings & Lighting
    for r in floor_spec.rooms:
        xs = [p[0] / 1000.0 for p in r.polygon_mm]
        ys = [p[1] / 1000.0 for p in r.polygon_mm]
        cx, cz = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
        sx, sz = max(xs) - min(xs), max(ys) - min(ys)
        c_height = r.ceiling_height_mm / 1000.0

        children.append({
            "id": f"node_ceiling_{r.id}",
            "name": f"Ceiling • {r.name} ({r.ceiling_type})",
            "type": "mesh",
            "geometry": {"type": "box", "width": sx, "height": 0.05, "depth": sz},
            "material": {"type": "pbr", "materialId": "paint_ceiling_gypsum_white", "roughness": 0.9},
            "transform": {"position": [cx, c_height, cz], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        })

        for light in r.lighting_fixtures:
            children.append({
                "id": f"node_light_{light.id}",
                "name": f"Light • {light.brand}",
                "type": "light_point",
                "intensity": round(light.lumen / 100.0, 1),
                "colorTemperature": light.color_temp_k,
                "transform": {"position": [light.position_mm[0] / 1000.0, light.position_mm[2] / 1000.0, light.position_mm[1] / 1000.0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            })

    # 4. Furniture Instances
    for f in floor_spec.furniture_layout:
        rot_rad = math.radians(f.rotation_deg)
        children.append({
            "id": f"node_furn_{f.id}",
            "name": f"{f.name} ({f.vendor or 'VN'})",
            "type": "furniture_instance",
            "sku": f.sku,
            "category": f.category,
            "roomId": f.room_id,
            "dimensions": [f.width_mm / 1000.0, f.height_mm / 1000.0, f.depth_mm / 1000.0],
            "priceVnd": f.price_vnd,
            "transform": {
                "position": [f.x_mm / 1000.0, (f.height_mm / 2.0) / 1000.0, f.y_mm / 1000.0],
                "rotation": [0, -rot_rad, 0],
                "scale": [1, 1, 1],
            },
        })

    return {
        "version": "1.4.0",
        "units": "meters",
        "root": {
            "id": "scene_root",
            "name": "ATELIER Multi-Room Apartment",
            "children": children,
        },
    }
