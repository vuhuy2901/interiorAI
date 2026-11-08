"""
ATELIER AI — Deterministic Cost & Surface Engineering Engine (Section 7 & 7B)
Executes exact geometric & BOQ formulas:
- Net Wall Paint Area = (Sum Wall Face Area) - (Sum Openings Area) - (Wall Tile Zone Area)
- Paint Cans = ceil(Liters / CanSize) for Primer (1 coat) + Topcoat (2 coats)
- Floor/Wall Tile Boxes = ceil((NetArea * (1 + waste_rate)) / m2_per_box)
- Skirting = (Room Perimeter - Door Widths) * (1 + 5% waste)
Never uses LLM to guess or calculate prices.
"""
from __future__ import annotations
import csv
import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.models.contracts import (
    CanonicalProject,
    CostEstimateSnapshot,
    EstimateLineItem,
)

ROOT_DIR = Path(__file__).resolve().parents[4]
MATERIALS_SEED_PATH = ROOT_DIR / "data" / "seed" / "materials_vn.json"
CATALOG_SEED_PATH = ROOT_DIR / "data" / "seed" / "catalog_vn.csv"


def load_materials_catalog() -> Dict[str, Any]:
    if MATERIALS_SEED_PATH.exists():
        return json.loads(MATERIALS_SEED_PATH.read_text(encoding="utf-8"))
    return {"paints": [], "tiles_and_flooring": [], "skirting_options": []}


def load_products_catalog() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if CATALOG_SEED_PATH.exists():
        with CATALOG_SEED_PATH.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                items.append({
                    **row,
                    "width_mm": float(row.get("width_mm", 1000)),
                    "depth_mm": float(row.get("depth_mm", 1000)),
                    "height_mm": float(row.get("height_mm", 800)),
                    "price_vnd": float(row.get("price_vnd", 0)),
                })
    return items


def polygon_area_m2(polygon_mm: List[List[float]]) -> float:
    if len(polygon_mm) < 3:
        return 0.0
    area = 0.0
    n = len(polygon_mm)
    for i in range(n):
        x1, y1 = polygon_mm[i]
        x2, y2 = polygon_mm[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0 / 1_000_000.0


def polygon_perimeter_m(polygon_mm: List[List[float]]) -> float:
    if len(polygon_mm) < 2:
        return 0.0
    perim = 0.0
    n = len(polygon_mm)
    for i in range(n):
        x1, y1 = polygon_mm[i]
        x2, y2 = polygon_mm[(i + 1) % n]
        perim += math.hypot(x2 - x1, y2 - y1)
    return perim / 1000.0


def wall_length_m(start_mm: List[float], end_mm: List[float]) -> float:
    return math.hypot(end_mm[0] - start_mm[0], end_mm[1] - start_mm[1]) / 1000.0


def calculate_project_estimate(project: CanonicalProject) -> CostEstimateSnapshot:
    mat_db = load_materials_catalog()
    paints_by_id = {p["id"]: p for p in mat_db.get("paints", [])}
    tiles_by_id = {t["id"]: t for t in mat_db.get("tiles_and_flooring", [])}
    skirtings_by_id = {s["id"]: s for s in mat_db.get("skirting_options", [])}

    lines: List[EstimateLineItem] = []

    # 1. Openings total area (m2) & door width (m)
    total_door_area_m2 = sum((d.width_mm * d.height_mm) / 1_000_000.0 for d in project.openings)
    total_window_area_m2 = sum((w.width_mm * w.height_mm) / 1_000_000.0 for w in project.windows)
    total_openings_area_m2 = total_door_area_m2 + total_window_area_m2
    total_door_width_m = sum(d.width_mm / 1000.0 for d in project.openings)

    # 2. Wall Tile Zone (Section 7B)
    wall_tile_area_m2 = 0.0
    for room in project.rooms:
        if room.wall_tile_zone and room.wall_tile_zone.enabled:
            perim_m = polygon_perimeter_m(room.polygon_mm)
            tile_h_m = room.wall_tile_zone.tile_height_mm / 1000.0
            zone_area = max(0.0, (perim_m - total_door_width_m) * tile_h_m)
            wall_tile_area_m2 += zone_area
            wt_mat = tiles_by_id.get(room.wall_tile_zone.tile_material_id) or next(iter(tiles_by_id.values()), None)
            if wt_mat:
                waste = float(wt_mat.get("waste_rate", 0.07))
                gross_m2 = zone_area * (1.0 + waste)
                m2_box = float(wt_mat.get("m2_per_box", 1.44))
                boxes = math.ceil(gross_m2 / m2_box)
                subtotal = boxes * float(wt_mat["price_per_box_vnd"])
                lines.append(EstimateLineItem(
                    id=f"line_wt_{room.id}",
                    category="wall_tile",
                    title=f"Ốp gạch tường ({room.name}) — {wt_mat['name']}",
                    specification=f"{wt_mat['tile_width_mm']}×{wt_mat['tile_length_mm']}mm, cao {int(room.wall_tile_zone.tile_height_mm)}mm",
                    net_quantity=round(zone_area, 2),
                    waste_rate=waste,
                    gross_quantity=round(gross_m2, 2),
                    unit="m2",
                    package_count=boxes,
                    package_unit=f"thùng ({m2_box} m2/thùng)",
                    unit_price_vnd=float(wt_mat["price_per_box_vnd"]),
                    subtotal_vnd=subtotal,
                    formula_explanation=f"ceil(({zone_area:.2f} m2 × (1 + {waste*100:.0f}%)) / {m2_box} m2/thùng) = {boxes} thùng",
                    source_url=wt_mat.get("source_url"),
                    checked_at=wt_mat.get("checked_at", "2026-11-01"),
                ))

    # 3. Wall Paint (Base Interior Walls vs Accent Walls - Section 7B)
    paint_area_by_mat: Dict[str, float] = {}
    total_wall_gross_m2 = 0.0
    for wall in project.walls:
        w_len_m = wall_length_m(wall.start_mm, wall.end_mm)
        w_h_m = wall.height_mm / 1000.0
        face_area = w_len_m * w_h_m
        total_wall_gross_m2 += face_area

    for wall in project.walls:
        w_len_m = wall_length_m(wall.start_mm, wall.end_mm)
        w_h_m = wall.height_mm / 1000.0
        gross_face = w_len_m * w_h_m
        proportion = (gross_face / total_wall_gross_m2) if total_wall_gross_m2 > 0 else 0.25
        # Subtract proportional openings and wall tile zones from interior face (face_a)
        net_face = max(0.0, gross_face - proportion * (total_openings_area_m2 + wall_tile_area_m2))
        mat_id = wall.face_a_material_id
        paint_area_by_mat[mat_id] = paint_area_by_mat.get(mat_id, 0.0) + net_face

    for mat_id, net_area in paint_area_by_mat.items():
        if net_area <= 0:
            continue
        p_mat = paints_by_id.get(mat_id) or next(iter(paints_by_id.values()), None)
        if not p_mat:
            continue
        coverage = float(p_mat.get("coverage_m2_per_liter", 12.0))
        coats = int(p_mat.get("coats_required", 2))
        can_size = float(p_mat.get("can_size_liters", 5.0))
        liters_top = (net_area * coats) / coverage
        cans_top = max(1, math.ceil(liters_top / can_size))
        subtotal_top = cans_top * float(p_mat["unit_price_vnd"])
        lines.append(EstimateLineItem(
            id=f"line_paint_top_{mat_id}",
            category="paint",
            title=f"Sơn phủ tường ({coats} nước) — {p_mat['name']}",
            specification=f"Mã màu {p_mat['color_code']} ({p_mat['hex_color']}), thùng {int(can_size)}L",
            net_quantity=round(net_area, 2),
            waste_rate=0.0,
            gross_quantity=round(liters_top, 2),
            unit="lít",
            package_count=cans_top,
            package_unit=f"thùng {int(can_size)}L",
            unit_price_vnd=float(p_mat["unit_price_vnd"]),
            subtotal_vnd=subtotal_top,
            formula_explanation=f"Diện tích sơn thực tế {net_area:.2f}m2 (đã trừ cửa {total_openings_area_m2:.2f}m2 & gạch ốp {wall_tile_area_m2:.2f}m2) × {coats} lớp / {coverage}m2/L = {liters_top:.2f}L → làm tròn ceil = {cans_top} thùng",
            source_url=p_mat.get("source_url"),
            checked_at=p_mat.get("checked_at", "2026-11-01"),
        ))
        # Primer (1 coat)
        liters_primer = net_area / coverage
        cans_primer = max(1, math.ceil(liters_primer / can_size))
        primer_price = float(p_mat.get("primer_price_per_can_vnd", 950000))
        lines.append(EstimateLineItem(
            id=f"line_paint_primer_{mat_id}",
            category="paint",
            title=f"Sơn lót kháng kiềm nội thất (1 nước) cho {p_mat['brand']}",
            specification=f"Độ phủ {coverage} m2/L, thùng {int(can_size)}L",
            net_quantity=round(net_area, 2),
            waste_rate=0.0,
            gross_quantity=round(liters_primer, 2),
            unit="lít",
            package_count=cans_primer,
            package_unit=f"thùng {int(can_size)}L",
            unit_price_vnd=primer_price,
            subtotal_vnd=cans_primer * primer_price,
            formula_explanation=f"ceil(({net_area:.2f}m2 × 1 lớp / {coverage}m2/L) / {can_size}L) = {cans_primer} thùng",
            source_url=p_mat.get("source_url"),
            checked_at=p_mat.get("checked_at", "2026-11-01"),
        ))

    # 4. Room Floor Tile / Wood Flooring + Adhesive/Grout + Skirting + Ceiling Paint
    for room in project.rooms:
        floor_area_m2 = polygon_area_m2(room.polygon_mm)
        perim_m = polygon_perimeter_m(room.polygon_mm)
        f_mat = tiles_by_id.get(room.floor_material_id) or next(iter(tiles_by_id.values()), None)
        if f_mat and floor_area_m2 > 0:
            waste = float(f_mat.get("waste_rate", 0.06))
            gross_m2 = floor_area_m2 * (1.0 + waste)
            m2_box = float(f_mat.get("m2_per_box", 1.48))
            boxes = math.ceil(gross_m2 / m2_box)
            box_price = float(f_mat["price_per_box_vnd"])
            lines.append(EstimateLineItem(
                id=f"line_floor_{room.id}",
                category="floor_tile_wood",
                title=f"Vật tư lát sàn ({room.name}) — {f_mat['name']}",
                specification=f"Quy cách {f_mat['tile_width_mm']}×{f_mat['tile_length_mm']}mm ({f_mat['layout_pattern']}), hao hụt {waste*100:.0f}%",
                net_quantity=round(floor_area_m2, 2),
                waste_rate=waste,
                gross_quantity=round(gross_m2, 2),
                unit="m2",
                package_count=boxes,
                package_unit=f"thùng ({m2_box} m2/thùng)",
                unit_price_vnd=box_price,
                subtotal_vnd=boxes * box_price,
                formula_explanation=f"ceil(({floor_area_m2:.2f} m2 × (1 + {waste*100:.0f}%)) / {m2_box} m2/thùng) = {boxes} thùng chẵn",
                source_url=f_mat.get("source_url"),
                checked_at=f_mat.get("checked_at", "2026-11-01"),
            ))

            # Adhesive / Underlayment + Grout
            adh_unit = float(f_mat.get("adhesive_or_underlay_vnd_per_m2", 50000))
            lines.append(EstimateLineItem(
                id=f"line_adh_{room.id}",
                category="adhesive_grout",
                title=f"Phụ kiện xốp lót / keo dán gạch & chà ron ({room.name})",
                specification="Định mức tiêu chuẩn theo diện tích sàn thực tế",
                net_quantity=round(floor_area_m2, 2),
                waste_rate=0.05,
                gross_quantity=round(floor_area_m2 * 1.05, 2),
                unit="m2",
                unit_price_vnd=adh_unit,
                subtotal_vnd=round(floor_area_m2 * 1.05 * adh_unit),
                formula_explanation=f"{floor_area_m2:.2f} m2 × 1.05 × {adh_unit:,.0f} đ/m2",
                source_url=f_mat.get("source_url"),
            ))

            # Skirting (Perimeter minus door widths)
            skirting_net_m = max(0.0, perim_m - total_door_width_m)
            sk_mat = skirtings_by_id.get(room.skirting_material_id) or next(iter(skirtings_by_id.values()), None)
            sk_price = float(sk_mat["unit_price_vnd_per_md"]) if sk_mat else 95000.0
            sk_waste = float(sk_mat.get("waste_rate", 0.05)) if sk_mat else 0.05
            sk_gross_m = math.ceil(skirting_net_m * (1.0 + sk_waste))
            lines.append(EstimateLineItem(
                id=f"line_skirt_{room.id}",
                category="skirting",
                title=f"Phào / Len chân tường ({room.name}) — {sk_mat['name'] if sk_mat else 'Tiêu chuẩn'}",
                specification=f"Chu vi phòng {perim_m:.2f}m trừ cửa đi {total_door_width_m:.2f}m",
                net_quantity=round(skirting_net_m, 2),
                waste_rate=sk_waste,
                gross_quantity=float(sk_gross_m),
                unit="md",
                unit_price_vnd=sk_price,
                subtotal_vnd=sk_gross_m * sk_price,
                formula_explanation=f"ceil(({perim_m:.2f}m - {total_door_width_m:.2f}m) × 1.05) = {sk_gross_m} md × {sk_price:,.0f} đ/md",
            ))

            # Labor for floor + wall paint
            labor_floor_rate = float(f_mat.get("labor_vnd_per_m2", 100000))
            labor_paint_area = sum(paint_area_by_mat.values())
            labor_total = (floor_area_m2 * labor_floor_rate) + (labor_paint_area * 45000.0)
            lines.append(EstimateLineItem(
                id=f"line_labor_{room.id}",
                category="labor",
                title=f"Nhân công thi công lát sàn, đóng phào & sơn bả hoàn thiện ({room.name})",
                specification=f"Sàn {floor_area_m2:.1f}m2 ({labor_floor_rate:,.0f}đ/m2) + Sơn tường {labor_paint_area:.1f}m2 (45,000đ/m2)",
                net_quantity=round(floor_area_m2 + labor_paint_area, 2),
                waste_rate=0.0,
                gross_quantity=round(floor_area_m2 + labor_paint_area, 2),
                unit="gói",
                unit_price_vnd=round(labor_total),
                subtotal_vnd=round(labor_total),
                formula_explanation=f"({floor_area_m2:.2f}m2 × {labor_floor_rate:,.0f}đ) + ({labor_paint_area:.2f}m2 × 45,000đ)",
            ))

    # 5. Furniture Instances
    for furn in project.furniture_instances:
        lines.append(EstimateLineItem(
            id=f"line_furn_{furn.id}",
            category="furniture",
            title=f"Nội thất rời: {furn.name}",
            specification=f"SKU: {furn.sku} | Kích thước: {int(furn.width_mm)}×{int(furn.depth_mm)}×{int(furn.height_mm)}mm",
            net_quantity=1.0,
            waste_rate=0.0,
            gross_quantity=1.0,
            unit="chiếc/bộ",
            package_count=1,
            package_unit="bộ",
            unit_price_vnd=furn.price_vnd,
            subtotal_vnd=furn.price_vnd,
            formula_explanation=f"1 bộ × {furn.price_vnd:,.0f} đ (Đơn giá catalog minh họa)",
            source_url=furn.source_url or "https://baya.vn (Giá minh họa)",
        ))

    materials_sub = sum(
        l.subtotal_vnd for l in lines if l.category in ("paint", "floor_tile_wood", "wall_tile", "skirting", "adhesive_grout")
    )
    furniture_sub = sum(l.subtotal_vnd for l in lines if l.category == "furniture")
    labor_sub = sum(l.subtotal_vnd for l in lines if l.category == "labor")
    shipping = 1500000.0 if (materials_sub + furniture_sub) > 0 else 0.0
    pre_tax = materials_sub + furniture_sub + labor_sub + shipping
    tax_rate = 0.08
    tax_vnd = round(pre_tax * tax_rate)
    total_vnd = round(pre_tax + tax_vnd)
    budget_limit = project.design_brief.budget_limit_vnd or 120000000.0

    return CostEstimateSnapshot(
        snapshot_id=f"est_{uuid.uuid4().hex[:10]}",
        project_id=project.project_id,
        revision=project.revision,
        created_at=datetime.now(timezone.utc).isoformat(),
        scale_verified=project.scale_calibrated,
        confidence_level="HIGH_VERIFIED_SCALE" if project.scale_calibrated else "LOW_UNVERIFIED_SCALE",
        lines=lines,
        materials_subtotal_vnd=round(materials_sub),
        furniture_subtotal_vnd=round(furniture_sub),
        labor_subtotal_vnd=round(labor_sub),
        shipping_fee_vnd=round(shipping),
        tax_rate=tax_rate,
        tax_vnd=tax_vnd,
        total_vnd=total_vnd,
        budget_limit_vnd=budget_limit,
        within_budget=total_vnd <= budget_limit,
    )
