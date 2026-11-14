"""Create presentation revision #5 for the existing ATL-51 child bedroom scene."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.db import get_project, save_project
from app.models.contracts import (
    DesignBrief,
    DoorOpening,
    FurnitureInstance,
    MaterialOverride,
    MeasurementEvidence,
    WindowOpening,
)
from app.services.mcp_gateway import sync_canonical_to_pascal
from app.services.measurement_validation import validate_project_for_persistence


PROJECT_ID = "proj_564f46a5"
MINIMUM_SOURCE_REVISION = 4
SOURCE = "User presentation brief 2026-11-13"


def evidence(value: float, field: str) -> MeasurementEvidence:
    return MeasurementEvidence(
        value=value,
        unit="deg" if field == "rotation_deg" else "mm",
        status="INFERRED",
        source=SOURCE,
        source_ref="child-bedroom-layout-image-2",
        notes="Presentation geometry; 100-200 mm layout tolerance accepted by user.",
    )


def furniture(
    *,
    item_id: str,
    name: str,
    category: str,
    asset: str,
    x: float,
    y: float,
    width: float,
    depth: float,
    height: float,
    color: str,
    z: float = 0.0,
    rotation: float = 0.0,
    wall: str | None = None,
    align: str | None = None,
    offset: float = 0.0,
    wall_distance: float = 0.0,
    asset_id: str | None = None,
) -> FurnitureInstance:
    values = {
        "x_mm": x,
        "y_mm": y,
        "z_mm": z,
        "width_mm": width,
        "depth_mm": depth,
        "height_mm": height,
        "rotation_deg": rotation,
        "offset_mm": offset,
        "wall_distance_mm": wall_distance,
    }
    return FurnitureInstance(
        id=item_id,
        sku=f"PRESENTATION-{item_id.upper()}",
        name=name,
        category=category,
        pascal_asset_id=asset,
        asset_id=asset_id,
        room_id="room_main",
        x_mm=x,
        y_mm=y,
        z_mm=z,
        width_mm=width,
        depth_mm=depth,
        height_mm=height,
        rotation_deg=rotation,
        wall=wall,
        align=align,
        offset_mm=offset,
        wall_distance_mm=wall_distance,
        color_hex=color,
        price_vnd=0.0,
        measurement_evidence={field: evidence(value, field) for field, value in values.items()},
        legacy_flags=[],
    )


async def main() -> None:
    project = get_project(PROJECT_ID)
    if project is None:
        raise RuntimeError(f"Existing project not found: {PROJECT_ID}")
    if project.revision < MINIMUM_SOURCE_REVISION:
        raise RuntimeError(
            f"Refusing to update an older scene: expected at least {MINIMUM_SOURCE_REVISION}, got {project.revision}"
        )
    if "Presentation revision theo bản vẽ gốc" in project.description:
        raise RuntimeError(f"Presentation revision already exists at revision {project.revision}")
    source_revision = project.revision

    room = project.rooms[0]
    room.name = "Phòng ngủ 2 trẻ — trình bày"
    room.room_type = "bedroom"
    room.polygon_mm = [[0.0, 0.0], [3100.0, 0.0], [3100.0, 4000.0], [0.0, 4000.0]]
    room.ceiling_height_mm = 2700.0
    room.floor_material_id = "mat_wood_oak_natural"
    room.wall_base_material_id = "paint_pastel_cream"

    wall_by_id = {wall.id: wall for wall in project.walls}
    wall_by_id["wall_south"].start_mm = [3100.0, 0.0]
    wall_by_id["wall_south"].end_mm = [0.0, 0.0]
    wall_by_id["wall_south"].is_accent_wall = True
    wall_by_id["wall_east"].start_mm = [3100.0, 0.0]
    wall_by_id["wall_east"].end_mm = [3100.0, 4000.0]
    wall_by_id["wall_north"].start_mm = [3100.0, 4000.0]
    wall_by_id["wall_north"].end_mm = [0.0, 4000.0]
    wall_by_id["wall_west"].start_mm = [0.0, 4000.0]
    wall_by_id["wall_west"].end_mm = [0.0, 0.0]
    for wall in project.walls:
        wall.thickness_mm = 100.0
        wall.height_mm = 2700.0
        wall.face_a_material_id = "paint_pastel_cream"
        wall.face_b_material_id = "paint_pastel_cream"

    project.openings = [
        DoorOpening(
            id="door_main",
            wall_id="wall_west",
            wall_index=3,
            t=0.1075,
            width_mm=860.0,
            height_mm=2100.0,
            door_type="hinged",
            swing_direction="inward",
            hinges_side="left",
            room_id="room_main",
        )
    ]
    project.windows = [
        WindowOpening(
            id="window_east_01",
            wall_id="wall_east",
            wall_index=1,
            t=0.58,
            width_mm=1250.0,
            height_mm=1300.0,
            sill_height_mm=900.0,
            window_type="sliding",
            room_id="room_main",
        )
    ]

    project.furniture_instances = [
        furniture(item_id="bunk_bed", name="Giường tầng 2 trẻ", category="bunk_bed", asset="atelier-bunk-bed", x=1670, y=1015, width=1970, depth=1230, height=1500, color="#69B7A9", wall="top", align="right", offset=445, wall_distance=400),
        furniture(item_id="stair_01", name="Cầu thang giường tầng 8 bậc", category="bunk_stair", asset="atelier-bunk-stair-8-step", x=1670, y=200, width=1970, depth=400, height=1500, color="#F4B860", wall="top", align="right", offset=445),
        furniture(item_id="bookshelf", name="Giá sách trẻ em", category="bookshelf", asset="atelier-bookshelf", x=150, y=900, width=300, depth=1800, height=1800, color="#EF8FB8", wall="left", align="top"),
        furniture(item_id="desk", name="Bàn học đôi", category="study_desk", asset="atelier-study-desk", x=2840, y=2650, width=520, depth=1050, height=750, color="#68A9D3", wall="right", align="center", offset=650),
        furniture(item_id="desk_drawer", name="Ngăn kéo bàn học", category="drawer_unit", asset="atelier-drawer-unit", x=2840, y=1845, width=520, depth=490, height=650, color="#F2C14E", wall="right", align="top", offset=1600),
        furniture(item_id="wardrobe", name="Tủ quần áo 2 trẻ", category="wardrobe", asset="atelier-wardrobe", x=2100, y=3735, width=2000, depth=530, height=2200, color="#E7B46A", wall="bottom", align="right"),
        furniture(item_id="study_chair", name="Ghế học màu xanh", category="chair", asset="atelier-study-chair", asset_id="asset_ph_modern_arm_chair_01_1k", x=2300, y=2700, width=500, depth=500, height=780, color="#7EB8DA"),
        furniture(item_id="round_rug", name="Thảm tròn cầu vồng", category="round_rug", asset="atelier-round-rug", x=1520, y=2650, width=1350, depth=1350, height=25, color="#F28E7C"),
        furniture(item_id="blanket_lower", name="Chăn tầng dưới", category="blanket", asset="atelier-blanket", x=1670, y=1030, z=500, width=1650, depth=900, height=55, color="#F47C7C"),
        furniture(item_id="blanket_upper", name="Chăn tầng trên", category="blanket", asset="atelier-blanket", x=1670, y=1030, z=1445, width=1650, depth=900, height=55, color="#6E9ED6"),
        furniture(item_id="pillow_lower", name="Gối tầng dưới", category="pillow", asset="atelier-pillow", x=1020, y=1030, z=555, width=430, depth=300, height=150, color="#FFD166"),
        furniture(item_id="pillow_upper", name="Gối tầng trên", category="pillow", asset="atelier-pillow", x=1020, y=1030, z=1500, width=430, depth=300, height=150, color="#EF70A1"),
        furniture(item_id="book_stack_01", name="Sách nhiều màu 1", category="book_stack", asset="atelier-book-stack", x=160, y=450, z=620, width=210, depth=180, height=180, color="#5DB7DE"),
        furniture(item_id="book_stack_02", name="Sách nhiều màu 2", category="book_stack", asset="atelier-book-stack", x=160, y=900, z=930, width=210, depth=180, height=210, color="#F2C14E"),
        furniture(item_id="book_stack_03", name="Sách nhiều màu 3", category="book_stack", asset="atelier-book-stack", x=160, y=1350, z=1220, width=210, depth=180, height=190, color="#EF70A1"),
        furniture(item_id="small_plant", name="Cây xanh nhỏ", category="plant", asset="atelier-small-plant", x=2600, y=3300, width=360, depth=360, height=720, color="#65A765"),
        furniture(item_id="desk_lamp", name="Đèn bàn ánh sáng ấm", category="table_lamp", asset="atelier-table-lamp", x=2850, y=2380, z=750, width=260, depth=260, height=420, color="#FFB347"),
        furniture(item_id="wall_art", name="Tranh vui nhộn", category="wall_art", asset="atelier-wall-art", x=520, y=70, z=1250, width=620, depth=45, height=650, color="#8C7AE6"),
        furniture(item_id="curtain", name="Rèm cửa pastel", category="curtain", asset="atelier-curtain", x=3040, y=2320, width=80, depth=1450, height=2350, color="#F3B4D1"),
    ]

    project.dimension_chains = []
    project.surface_material_overrides["floor"] = MaterialOverride(
        material_id="mat_wood_oak_natural",
        material_version=1,
        tint="#DDBB86",
        pbr={"roughness": 0.48, "metalness": 0.0, "clearcoat": 0.08},
    )
    project.design_brief = DesignBrief(
        style="Phòng trẻ em pastel vui tươi",
        room_function="Phòng ngủ hai trẻ với giường tầng và góc học tập",
        color_palette=["#FFF1DC", "#DDEBFF", "#69B7A9", "#EF70A1", "#F4B860"],
        liked_elements=["Gỗ sồi sáng", "Màu pastel", "Điểm nhấn rực rỡ", "Ánh sáng ấm"],
        disliked_elements=["Khối hộp đồng màu", "Không gian tối", "Đồ nội thất sai chức năng"],
        budget_limit_vnd=120_000_000,
        occupants="Hai trẻ em",
        must_have_constraints=["Bố cục theo bản vẽ gốc", "Giường tầng thấp hơn tủ", "Cửa mở vào trong"],
        approved_decisions=["Cho phép sai số trình bày 100-200 mm", "Dùng phòng 3100 x 4000 mm"],
    )
    project.description = (
        "Presentation revision theo bản vẽ gốc; dùng 3100×4000 mm. "
        "Sai số chuỗi kích thước được xử lý theo bố cục trực quan đã được người dùng chấp thuận."
    )
    project.approval_state = "APPROVED"

    validation = validate_project_for_persistence(project)
    if not validation["valid"]:
        raise RuntimeError(json.dumps(validation, ensure_ascii=False, indent=2))

    pascal = await sync_canonical_to_pascal(project)
    if pascal.get("ok") and pascal.get("sceneJson"):
        project.pascal_scene_json = pascal["sceneJson"]
    else:
        project.pascal_scene_json = {
            **project.pascal_scene_json,
            "status": "CANONICAL_READY_PASCAL_SYNC_DEFERRED",
            "sync_error": pascal.get("error", "Pascal sync did not return SceneGraph"),
        }

    latest = get_project(PROJECT_ID)
    if latest is None or latest.revision != source_revision:
        raise RuntimeError(
            f"Scene changed while preparing revision: source {source_revision}, latest {getattr(latest, 'revision', None)}"
        )

    saved = save_project(
        project,
        author="Studio Presentation Pass",
        reason="Bố cục phòng trẻ em theo bản vẽ + màu sắc, trang trí và ánh sáng trình bày",
        bump_revision=True,
    )
    print(json.dumps({
        "project_id": saved.project_id,
        "revision": saved.revision,
        "furniture_count": len(saved.furniture_instances),
        "pascal_sync_ok": bool(pascal.get("ok")),
        "pascal_error": pascal.get("error"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
