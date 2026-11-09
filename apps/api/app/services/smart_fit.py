"""Deterministic room-aware furniture fit, resize policy and placement search."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from app.models.contracts import CanonicalProject, FurnitureInstance


Point = Tuple[float, float]


def point_in_polygon(point: Point, polygon: Sequence[Sequence[float]]) -> bool:
    x, y = point
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and x <= (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def oriented_corners(x: float, y: float, width: float, depth: float, rotation_deg: float) -> List[Point]:
    angle = math.radians(rotation_deg)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    corners: List[Point] = []
    for local_x, local_y in [(-width / 2, -depth / 2), (width / 2, -depth / 2), (width / 2, depth / 2), (-width / 2, depth / 2)]:
        corners.append((x + local_x * cos_a - local_y * sin_a, y + local_x * sin_a + local_y * cos_a))
    return corners


def _axes(polygon: Sequence[Point]) -> Iterable[Point]:
    for index, point in enumerate(polygon):
        nxt = polygon[(index + 1) % len(polygon)]
        edge = (nxt[0] - point[0], nxt[1] - point[1])
        length = math.hypot(*edge) or 1.0
        yield (-edge[1] / length, edge[0] / length)


def polygons_overlap_sat(first: Sequence[Point], second: Sequence[Point]) -> bool:
    for axis in list(_axes(first)) + list(_axes(second)):
        first_projection = [point[0] * axis[0] + point[1] * axis[1] for point in first]
        second_projection = [point[0] * axis[0] + point[1] * axis[1] for point in second]
        if max(first_projection) <= min(second_projection) or max(second_projection) <= min(first_projection):
            return False
    return True


def _bounds(points: Sequence[Sequence[float]]) -> Tuple[float, float, float, float]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _room_for(project: CanonicalProject, furniture: FurnitureInstance):
    return next((room for room in project.rooms if room.id == furniture.room_id), project.rooms[0] if project.rooms else None)


def assess_fit(
    project: CanonicalProject,
    furniture: FurnitureInstance,
    *,
    x_mm: float | None = None,
    y_mm: float | None = None,
    rotation_deg: float | None = None,
    exclude_id: str | None = None,
) -> Dict[str, Any]:
    room = _room_for(project, furniture)
    if not room:
        return {"fits": False, "status": "BLOCKED", "issues": ["Không tìm thấy room polygon"]}
    x = furniture.x_mm if x_mm is None else x_mm
    y = furniture.y_mm if y_mm is None else y_mm
    rotation = furniture.rotation_deg if rotation_deg is None else rotation_deg
    footprint = oriented_corners(x, y, furniture.width_mm, furniture.depth_mm, rotation)
    issues: List[str] = []
    inside_room = all(point_in_polygon(point, room.polygon_mm) for point in footprint)
    if not inside_room:
        issues.append("Footprint vượt ngoài room polygon")
    if furniture.height_mm > room.ceiling_height_mm:
        issues.append("Chiều cao model vượt trần")

    collisions = []
    for other in project.furniture_instances:
        if other.id in {furniture.id, exclude_id}:
            continue
        other_footprint = oriented_corners(other.x_mm, other.y_mm, other.width_mm, other.depth_mm, other.rotation_deg)
        if polygons_overlap_sat(footprint, other_footprint):
            collisions.append(other.id)
    if collisions:
        issues.append("Va chạm với: " + ", ".join(collisions))

    doorway_width = max((door.width_mm for door in project.openings), default=900.0)
    doorway_height = max((door.height_mm for door in project.openings), default=2100.0)
    fits_doorway = min(furniture.width_mm, furniture.depth_mm) <= doorway_width + 50 and min(
        furniture.height_mm, furniture.depth_mm
    ) <= doorway_height
    if not fits_doorway:
        issues.append("Model không lọt khổ cửa hiện có")

    return {
        "fits": not issues,
        "inside_room_polygon": inside_room,
        "fits_doorway": fits_doorway,
        "collision_ids": collisions,
        "issues": issues,
        "footprint_mm": [[round(px, 3), round(py, 3)] for px, py in footprint],
        "room_id": room.id,
        "room_area_sqm": round(abs(sum(
            room.polygon_mm[i][0] * room.polygon_mm[(i + 1) % len(room.polygon_mm)][1]
            - room.polygon_mm[(i + 1) % len(room.polygon_mm)][0] * room.polygon_mm[i][1]
            for i in range(len(room.polygon_mm))
        )) / 2_000_000, 3),
    }


def plan_resize(furniture: FurnitureInstance, target_dimensions_mm: List[float]) -> Dict[str, Any]:
    if len(target_dimensions_mm) != 3 or any(value <= 0 for value in target_dimensions_mm):
        return {"ok": False, "status": "INVALID", "reason": "Kích thước đích phải gồm W/D/H dương"}
    current = [furniture.width_mm, furniture.depth_mm, furniture.height_mm]
    if furniture.sizing_policy == "FIXED_SIZE":
        unchanged = all(abs(a - b) <= 1 for a, b in zip(current, target_dimensions_mm))
        return {
            "ok": unchanged,
            "status": "UNCHANGED" if unchanged else "REJECTED_FIXED_SIZE",
            "dimensions_mm": current,
            "reason": "Model/SKU kích thước cố định; phải tìm model khác hoặc xin duyệt thay thế." if not unchanged else None,
        }
    if furniture.sizing_policy == "UNIFORM_SCALABLE":
        ratios = [target_dimensions_mm[i] / current[i] for i in range(3)]
        scale = min(ratios)
        limits = furniture.uniform_scale_range if len(furniture.uniform_scale_range) == 2 else [0.75, 1.25]
        if not limits[0] <= scale <= limits[1]:
            return {"ok": False, "status": "OUTSIDE_SCALE_LIMIT", "requested_scale": scale, "limits": limits}
        dimensions = [round(value * scale, 3) for value in current]
        return {"ok": True, "status": "UNIFORM_SCALE", "scale": scale, "dimensions_mm": dimensions}

    axes = set(furniture.parametric_axes)
    module = furniture.parametric_module_mm or 300.0
    dimensions = current[:]
    axis_names = ["width", "depth", "height"]
    module_count = None
    for index, axis in enumerate(axis_names):
        if axis in axes:
            if axis == "width":
                module_count = max(1, round(target_dimensions_mm[index] / module))
                dimensions[index] = module_count * module
            else:
                dimensions[index] = target_dimensions_mm[index]
        elif abs(target_dimensions_mm[index] - current[index]) > 1:
            return {"ok": False, "status": "AXIS_LOCKED", "axis": axis, "dimensions_mm": current}
    return {
        "ok": True,
        "status": "PARAMETRIC_REGEN_REQUIRED",
        "dimensions_mm": dimensions,
        "module_width_mm": module,
        "module_count": module_count,
        "requires_geometry_regeneration": True,
    }


def generate_placement_options(project: CanonicalProject, furniture_id: str, limit: int = 2) -> Dict[str, Any]:
    furniture = next((item for item in project.furniture_instances if item.id == furniture_id), None)
    if not furniture:
        return {"ok": False, "status": "NOT_FOUND", "options": []}
    room = _room_for(project, furniture)
    if not room:
        return {"ok": False, "status": "BLOCKED", "options": []}
    min_x, min_y, max_x, max_y = _bounds(room.polygon_mm)
    step = max(100.0, min(250.0, min(furniture.width_mm, furniture.depth_mm) / 3))
    candidates: List[Dict[str, Any]] = []
    x = min_x + step
    while x <= max_x - step:
        y = min_y + step
        while y <= max_y - step:
            for rotation in (0.0, 90.0, 180.0, 270.0):
                result = assess_fit(project, furniture, x_mm=x, y_mm=y, rotation_deg=rotation)
                if not result["fits"]:
                    continue
                distance_from_current = math.hypot(x - furniture.x_mm, y - furniture.y_mm)
                wall_distance = min(x - min_x, max_x - x, y - min_y, max_y - y)
                score = round(1000 - abs(wall_distance - 250) * 0.15 - distance_from_current * 0.01, 3)
                candidates.append({"x_mm": round(x), "y_mm": round(y), "rotation_deg": rotation, "score": score, "fit": result})
            y += step
        x += step
    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected: List[Dict[str, Any]] = []
    for candidate in candidates:
        if all(math.hypot(candidate["x_mm"] - item["x_mm"], candidate["y_mm"] - item["y_mm"]) >= 500 for item in selected):
            selected.append(candidate)
        if len(selected) >= max(1, min(limit, 5)):
            break
    return {
        "ok": len(selected) > 0,
        "status": "OPTIONS_FOUND" if selected else "NO_VALID_PLACEMENT",
        "evaluated_candidates": len(candidates),
        "options": selected,
        "algorithm": "room-polygon grid search + SAT collision + doorway/ceiling constraints",
    }
