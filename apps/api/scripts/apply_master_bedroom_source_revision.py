"""Create a new source-aligned revision for the existing Japandi bedroom project."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.db import get_project, get_project_revisions, save_project  # noqa: E402
from app.models.contracts import (  # noqa: E402
    DoorOpening,
    FurnitureInstance,
    MeasurementEvidence,
    WindowOpening,
)


PROJECT_ID = "proj_bedroom_japandi_4x4m"
SOURCE_REVISION = 2
SOURCE_IMAGE = Path(r"C:\Users\TUAN\Downloads\thiet-ke-phong-ngu-15m2-1001.jpg")
SOURCE_NOTE = "Source plan supplied by user on 2026-11-14; presentation tolerance 100-200 mm."


def inferred(value: float, field: str) -> MeasurementEvidence:
    return MeasurementEvidence(
        value=value,
        unit="deg" if field == "rotation_deg" else "mm",
        status="INFERRED",
        source=SOURCE_NOTE,
        source_ref=f"sha256:{hashlib.sha256(SOURCE_IMAGE.read_bytes()).hexdigest()}",
        notes="Read from labeled dimensions and proportional placement in the source plan; not for construction.",
    )


def item(
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
    *,
    rotation: float = 0.0,
    z: float = 0.0,
    asset_id: str | None = None,
) -> FurnitureInstance:
    measurements = {
        "x_mm": x,
        "y_mm": y,
        "z_mm": z,
        "width_mm": width,
        "depth_mm": depth,
        "height_mm": height,
        "rotation_deg": rotation,
    }
    return FurnitureInstance(
        id=item_id,
        sku=f"SOURCE-{item_id.upper()}",
        name=name,
        category=category,
        pascal_asset_id=asset,
        asset_id=asset_id,
        room_id="room_master_bedroom",
        x_mm=x,
        y_mm=y,
        z_mm=z,
        width_mm=width,
        depth_mm=depth,
        height_mm=height,
        rotation_deg=rotation,
        color_hex=color,
        price_vnd=0.0,
        measurement_evidence={field: inferred(value, field) for field, value in measurements.items()},
        legacy_flags=[],
    )


def main() -> None:
    if not SOURCE_IMAGE.is_file():
        raise RuntimeError(f"Source image not found: {SOURCE_IMAGE}")
    project = get_project(PROJECT_ID)
    if project is None:
        raise RuntimeError(f"Existing project not found: {PROJECT_ID}")
    if project.revision > SOURCE_REVISION and "source-plan-aligned-v1" in project.description:
        print(json.dumps({"project_id": PROJECT_ID, "revision": project.revision, "status": "already_applied"}))
        return
    if project.revision != SOURCE_REVISION:
        raise RuntimeError(f"Expected current revision {SOURCE_REVISION}, got {project.revision}; refusing to overwrite newer work")
    if not any(row["revision"] == SOURCE_REVISION for row in get_project_revisions(PROJECT_ID)):
        raise RuntimeError("Recovery revision 2 is missing")

    source_sha = hashlib.sha256(SOURCE_IMAGE.read_bytes()).hexdigest()

    # The room envelope and bed center already match the labeled source plan.
    room = project.rooms[0]
    room.polygon_mm = [[0.0, 0.0], [4190.0, 0.0], [4190.0, 4040.0], [0.0, 4040.0]]
    room.floor_material_id = "floor_oak_natural_800x120"

    # Source entry is on the left wall; the east opening is the long window/curtain run.
    project.openings = [
        DoorOpening(
            id="door_entry",
            wall_id="wall_west_tv",
            wall_index=3,
            t=0.45,
            width_mm=900.0,
            height_mm=2100.0,
            door_type="hinged",
            swing_direction="inward",
            hinges_side="left",
            room_id="room_master_bedroom",
        )
    ]
    project.windows = [
        WindowOpening(
            id="win_east",
            wall_id="wall_east_window",
            wall_index=1,
            t=0.50,
            width_mm=1910.0,
            height_mm=1400.0,
            sill_height_mm=900.0,
            window_type="sliding",
            room_id="room_master_bedroom",
        )
    ]

    chair_asset = "asset_ph_modern_arm_chair_01_1k"
    project.furniture_instances = [
        item("bed_japandi_master", "Giường 1800×2000", "bed", "bed-double", 2095, 1100, 1800, 2000, 950, "#CFC5B8"),
        item("nightstand_left", "Tap đầu giường 700", "nightstand", "nightstand", 650, 250, 700, 450, 500, "#C99F6B"),
        item("vanity_desk", "Bàn phấn 900", "desk", "desk", 3630, 350, 900, 500, 750, "#C99F6B"),
        item("vanity_chair", "Ghế bàn phấn", "chair", "atelier-chair", 3630, 950, 520, 520, 780, "#D8CFC2", rotation=180, asset_id=chair_asset),
        item("wardrobe_full_height", "Tủ quần áo 2790", "wardrobe", "wardrobe", 1395, 3740, 2790, 600, 2400, "#E7DDCF"),
        item("work_desk", "Bàn làm việc", "study_desk", "atelier-study-desk", 3045, 3740, 510, 600, 750, "#C99F6B"),
        item("bookshelf_low", "Giá sách thấp", "bookshelf", "atelier-bookshelf", 3410, 3915, 220, 250, 900, "#D8B98B"),
        item("safe_cabinet", "Két và tủ phụ", "tv_cabinet", "atelier-cabinet", 3855, 3740, 670, 600, 750, "#D9C6AA"),
        item("work_chair", "Ghế bàn làm việc", "chair", "atelier-chair", 3300, 3000, 520, 520, 780, "#D8CFC2", asset_id=chair_asset),
    ]

    project.description = (
        "source-plan-aligned-v1 | Phòng ngủ 4190×4040 dựng theo ảnh "
        f"thiet-ke-phong-ngu-15m2-1001.jpg (sha256:{source_sha}). "
        "Bố cục trình bày, sai số 100-200 mm; không dùng làm hồ sơ thi công."
    )
    project.design_brief.approved_decisions = list(dict.fromkeys([
        *project.design_brief.approved_decisions,
        "Bố cục revision 3 đối chiếu ảnh nguồn thiet-ke-phong-ngu-15m2-1001.jpg",
        "Sai số trình bày 100-200 mm; không dùng làm kích thước thi công",
    ]))

    saved = save_project(
        project,
        author="Source Plan Alignment",
        reason="Sửa bố cục theo ảnh nguồn: cửa trái, tap 700, vanity, tủ áo và cụm bàn làm việc",
        bump_revision=True,
    )
    print(json.dumps({
        "project_id": saved.project_id,
        "revision": saved.revision,
        "source_revision_preserved": SOURCE_REVISION,
        "source_sha256": source_sha,
        "furniture_count": len(saved.furniture_instances),
        "door_wall": saved.openings[0].wall_id,
        "window_wall": saved.windows[0].wall_id,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
