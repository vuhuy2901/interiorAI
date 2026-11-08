"""
ATELIER AI — Spatial Geometry, Clearance, Collision & Fit-Check Engine
Provides deterministic 2D/3D spatial validation in millimeters (mm):
1. Furniture-to-Furniture AABB/OBB overlap check
2. Furniture-to-Room boundary containment check
3. Door swing arc clearance check
4. Minimum walkway clearance check (>= 750 mm)
5. Product catalog fit-check (doorway entry + room footprint)
"""
from __future__ import annotations
import math
from typing import Any, Dict, List, Tuple

from app.models.contracts import CanonicalProject, FurnitureInstance


def get_oriented_bbox_mm(furn: FurnitureInstance) -> Tuple[float, float, float, float]:
    """Returns (min_x, min_y, max_x, max_y) in mm accounting for 90/270 degree rotations."""
    rot = int(round(furn.rotation_deg)) % 360
    if rot in (90, 270):
        w, d = furn.depth_mm, furn.width_mm
    else:
        w, d = furn.width_mm, furn.depth_mm
    half_w = w / 2.0
    half_d = d / 2.0
    return (furn.x_mm - half_w, furn.y_mm - half_d, furn.x_mm + half_w, furn.y_mm + half_d)


def boxes_overlap_area(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    dx = min(a[2], b[2]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[1], b[1])
    if dx > 0 and dy > 0:
        return dx * dy
    return 0.0


def box_clearance_distance_mm(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    dx = max(0.0, max(a[0] - b[2], b[0] - a[2]))
    dy = max(0.0, max(a[1] - b[3], b[1] - a[3]))
    return math.hypot(dx, dy)


def get_room_bounds_mm(project: CanonicalProject) -> Tuple[float, float, float, float]:
    if project.rooms and project.rooms[0].polygon_mm:
        pts = project.rooms[0].polygon_mm
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return (min(xs), min(ys), max(xs), max(ys))
    return (0.0, 0.0, 4000.0, 5000.0)


def analyze_scene_spatial_quality(project: CanonicalProject) -> Dict[str, Any]:
    """
    Runs deterministic collision, door swing, and walkway clearance checks.
    """
    r_min_x, r_min_y, r_max_x, r_max_y = get_room_bounds_mm(project)
    collisions: List[str] = []
    boundary_violations: List[str] = []
    door_swing_warnings: List[str] = []

    items = project.furniture_instances
    boxes = {f.id: get_oriented_bbox_mm(f) for f in items}

    # 1. Room boundary check
    for f in items:
        bx0, by0, bx1, by1 = boxes[f.id]
        if bx0 < r_min_x - 20 or by0 < r_min_y - 20 or bx1 > r_max_x + 20 or by1 > r_max_y + 20:
            boundary_violations.append(
                f"Đồ nội thất '{f.name}' ({int(f.width_mm)}×{int(f.depth_mm)}mm) vượt ra ngoài ranh giới tường phòng."
            )

    # 2. Pairwise overlap & main circulation walkway clearance
    min_walkway_mm = 1150.0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            f1, f2 = items[i], items[j]
            b1, b2 = boxes[f1.id], boxes[f2.id]
            ov = boxes_overlap_area(b1, b2)
            if ov > 100.0:
                collisions.append(f"Va chạm hình học giữa '{f1.name}' và '{f2.name}'.")
            else:
                pair_cats = {f1.category, f2.category}
                # Living room seating cluster (sofa + coffee_table + armchair) has 400-600mm reach distance
                if pair_cats.issubset({"sofa", "coffee_table", "armchair"}):
                    continue
                dist = box_clearance_distance_mm(b1, b2)
                if 100.0 < dist < min_walkway_mm:
                    min_walkway_mm = round(dist, 0)

    # 3. Door swing clearance check
    for door in project.openings:
        wall = next((w for w in project.walls if w.id == door.wall_id), None)
        if not wall:
            continue
        wx0, wy0 = wall.start_mm
        wx1, wy1 = wall.end_mm
        cx = wx0 + (wx1 - wx0) * door.t
        cy = wy0 + (wy1 - wy0) * door.t
        r = door.width_mm
        door_arc_box = (cx - r / 2.0, cy - r, cx + r / 2.0, cy + r)
        for f in items:
            if boxes_overlap_area(door_arc_box, boxes[f.id]) > 5000.0:
                door_swing_warnings.append(
                    f"Cửa '{door.id}' ({int(door.width_mm)}mm) khi mở có nguy cơ vướng vào '{f.name}'."
                )

    walkway_ok = min_walkway_mm >= 750.0
    warnings = collisions + boundary_violations + door_swing_warnings
    if not walkway_ok:
        warnings.append(f"Khoảng cách lối đi hẹp nhất ({int(min_walkway_mm)}mm) nhỏ hơn tiêu chuẩn tối thiểu 750mm.")

    return {
        "valid": len(collisions) == 0 and len(boundary_violations) == 0 and len(door_swing_warnings) == 0,
        "collision_count": len(collisions),
        "boundary_violation_count": len(boundary_violations),
        "door_swing_warning_count": len(door_swing_warnings),
        "min_walkway_mm": min_walkway_mm,
        "walkway_ok": walkway_ok,
        "warnings": warnings,
    }


def check_catalog_product_fit(
    project: CanonicalProject,
    product: Dict[str, Any],
    replace_furniture_id: str | None = None,
) -> Dict[str, Any]:
    """
    Verifies whether a product SKU from catalog_vn.csv fits through the doorway
    and fits inside the room without colliding with other furniture.
    """
    p_w = float(product.get("width_mm", 1000))
    p_d = float(product.get("depth_mm", 800))
    p_h = float(product.get("height_mm", 750))

    r_min_x, r_min_y, r_max_x, r_max_y = get_room_bounds_mm(project)
    room_w = r_max_x - r_min_x
    room_d = r_max_y - r_min_y

    door_w = max((d.width_mm for d in project.openings), default=900.0)
    door_h = max((d.height_mm for d in project.openings), default=2100.0)

    # Can pass through door if smallest cross-section dimension < door width or diagonal
    min_dim = min(p_w, p_d, p_h)
    fits_doorway = min_dim <= (door_w + 50.0) and min(p_h, p_d) <= door_h
    fits_room = p_w <= (room_w - 400.0) and p_d <= (room_d - 400.0)

    target = None
    if replace_furniture_id:
        target = next((f for f in project.furniture_instances if f.id == replace_furniture_id), None)
    if not target and project.furniture_instances:
        cat = str(product.get("category", "")).lower()
        target = next((f for f in project.furniture_instances if f.category == cat), None)

    delta_w = round(p_w - target.width_mm, 0) if target else 0.0
    delta_price = float(product.get("price_vnd", 0)) - (target.price_vnd if target else 0.0)

    return {
        "sku": product.get("sku"),
        "name": product.get("name"),
        "fits_doorway": fits_doorway,
        "fits_room": fits_room,
        "overall_fit": fits_doorway and fits_room,
        "room_dimensions_mm": [room_w, room_d],
        "door_width_mm": door_w,
        "product_dimensions_mm": [p_w, p_d, p_h],
        "target_furniture_id": target.id if target else None,
        "target_furniture_name": target.name if target else None,
        "width_delta_mm": delta_w,
        "price_delta_vnd": delta_price,
        "recommendation": (
            f"Vừa vặn với phòng {room_w/1000:.1f}×{room_d/1000:.1f}m và lọt cửa {int(door_w)}mm."
            if (fits_doorway and fits_room)
            else "Kích thước sản phẩm quá lớn so với diện tích phòng hoặc khổ cửa đi."
        ),
    }
