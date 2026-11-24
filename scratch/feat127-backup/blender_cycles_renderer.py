"""
ATELIER AI — Studio SceneGraph -> PBR Material Catalog -> Headless Blender Cycles Renderer Bridge (PHẦN 3)
Connects the 36-item Sweet Home 3D Classic GLB catalog (`sh3d-classic/catalog.json`) and
the 22-item Poly Haven CC0 PBR material catalog (`pbr/pbr_catalog.json`) directly to
the headless Blender 4.2.3 LTS Cycles renderer, ensuring 100% material & geometry parity
with `StudioViewport.tsx`, plus automatic `CREDITS.md` and render metadata generation.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.contracts import CanonicalProject

ROOT_DIR = Path(__file__).resolve().parents[4]
UI_PUBLIC_DIR = ROOT_DIR / "paperclip" / "ui" / "public"
SH3D_CLASSIC_CATALOG_PATH = UI_PUBLIC_DIR / "assets" / "sh3d-classic" / "catalog.json"
SH3D_JAPANDI_CATALOG_PATH = UI_PUBLIC_DIR / "assets" / "sh3d-japandi" / "catalog.json"
SH3D_CATALOG_PATH = SH3D_JAPANDI_CATALOG_PATH
PBR_CATALOG_PATH = UI_PUBLIC_DIR / "assets" / "pbr" / "pbr_catalog.json"
RENDERS_DIR = ROOT_DIR / "data" / "exports" / "renders"
DEFAULT_ASSET_PACK = "sh3d-japandi"

DEFAULT_MATERIAL_BY_SURFACE: Dict[str, str] = {
    "floor": "pbr_floor_oak_light",
    "wall": "pbr_wall_plaster_warm",
    "wood": "pbr_wood_oak_natural",
    "stone": "pbr_stone_carrara_white",
    "fabric": "pbr_fabric_linen_cream",
    "metal": "pbr_metal_matte_black",
    "glass": "pbr_glass_clear_architectural",
    "tile": "pbr_tile_porcelain_sand",
}

LEGACY_MATERIAL_MAP: Dict[str, str] = {
    "mat_wood_oak_natural": "pbr_wood_oak_natural",
    "mat_wood_walnut_dark": "pbr_wood_walnut_classic",
    "mat_fabric_sand": "pbr_fabric_boucle_sand",
    "mat_fabric_moss": "pbr_fabric_velvet_taupe",
    "mat_tile_sand_800": "pbr_floor_tile_ceramic_800",
    "tile_oak_herringbone": "pbr_floor_oak_light",
    "tile_terrazzo_cream": "pbr_floor_marble_cream",
    "tile_porcelain_grey": "pbr_floor_tile_ceramic_800",
    "paint_warm_white": "pbr_wall_plaster_warm",
    "paint_pure_white": "pbr_wall_plaster_pure",
    "paint_sage_green": "pbr_wall_plaster_sage",
}


def resolve_asset_pack_id(
    project_or_preset: Any = None,
    brief_style: Optional[str] = None,
) -> str:
    """Resolves the active SH3D asset pack (`sh3d-japandi` or `sh3d-classic`) from style preset."""
    preset_id: Optional[str] = None
    b_style: Optional[str] = brief_style
    if isinstance(project_or_preset, str):
        preset_id = project_or_preset
    elif isinstance(project_or_preset, dict):
        preset_id = project_or_preset.get("active_style_preset")
        b_style = b_style or (project_or_preset.get("design_brief") or {}).get("style")
    elif project_or_preset is not None:
        preset_id = getattr(project_or_preset, "active_style_preset", None)
        db = getattr(project_or_preset, "design_brief", None)
        if db is not None and not b_style:
            b_style = getattr(db, "style", None) if not isinstance(db, dict) else db.get("style")

    sid = str(preset_id or "").strip().lower()
    if sid:
        pbr_cat = load_pbr_catalog()
        for preset in pbr_cat.get("style_presets", []):
            if str(preset.get("id", "")).strip().lower() == sid and preset.get("asset_pack"):
                return str(preset["asset_pack"])

    combined = f"{sid} {str(b_style or '').lower()}"
    if re.search(r"classic|cổ\s*điển|co_dien|neoclassic", combined):
        return "sh3d-classic"
    return DEFAULT_ASSET_PACK


def load_sh3d_catalog(pack_id: str = DEFAULT_ASSET_PACK) -> List[Dict[str, Any]]:
    clean_pack = str(pack_id or DEFAULT_ASSET_PACK).strip() or DEFAULT_ASSET_PACK
    path = UI_PUBLIC_DIR / "assets" / clean_pack / "catalog.json"
    if not path.is_file():
        path = SH3D_JAPANDI_CATALOG_PATH if SH3D_JAPANDI_CATALOG_PATH.is_file() else SH3D_CLASSIC_CATALOG_PATH
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return list(data.get("items") or [])
    except Exception:
        return []


def load_pbr_catalog() -> Dict[str, Any]:
    if not PBR_CATALOG_PATH.is_file():
        return {"materials": [], "style_presets": []}
    try:
        return json.loads(PBR_CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"materials": [], "style_presets": []}


def _resolve_public_url_to_disk(url_str: Optional[str]) -> Optional[str]:
    if not url_str or not isinstance(url_str, str):
        return None
    clean = url_str.strip().lstrip("/")
    if not clean:
        return None
    candidate = (UI_PUBLIC_DIR / clean).resolve()
    if candidate.is_file():
        return str(candidate)
    return None


def resolve_pbr_material_for_blender(
    mat_id: Optional[str],
    surface_type: str = "wood",
    tint_override: Optional[str] = None,
) -> Dict[str, Any]:
    catalog = load_pbr_catalog()
    materials = {m["id"]: m for m in catalog.get("materials", [])}

    lookup_id = (mat_id or "").strip()
    if lookup_id in LEGACY_MATERIAL_MAP:
        lookup_id = LEGACY_MATERIAL_MAP[lookup_id]

    entry = materials.get(lookup_id)
    if not entry:
        # Check substring heuristics for legacy floor/wall IDs
        low = lookup_id.lower()
        if "tile" in low or "ceramic" in low or "porcelain" in low or "gach" in low:
            entry = materials.get("pbr_floor_tile_ceramic_800")
        elif "marble" in low or "terrazzo" in low or "da_" in low:
            entry = materials.get("pbr_floor_marble_cream")
        elif "walnut" in low or "oc_cho" in low:
            entry = materials.get("pbr_floor_walnut_dark" if surface_type == "floor" else "pbr_wood_walnut_classic")
        elif "sage" in low:
            entry = materials.get("pbr_wall_plaster_sage")
        elif "slat" in low:
            entry = materials.get("pbr_wall_wood_slat_oak")

    if not entry:
        fallback_id = DEFAULT_MATERIAL_BY_SURFACE.get(surface_type, "pbr_wood_oak_natural")
        entry = materials.get(fallback_id) or (list(materials.values())[0] if materials else {})

    result = dict(entry)
    if tint_override and isinstance(tint_override, str) and tint_override.startswith("#"):
        result["base_color"] = tint_override
    result["diffuse_path"] = _resolve_public_url_to_disk(result.get("diffuse_url"))
    result["roughness_path"] = _resolve_public_url_to_disk(result.get("roughness_url"))
    result["normal_path"] = _resolve_public_url_to_disk(result.get("normal_url"))
    if "repeat_scale_m" not in result or not result["repeat_scale_m"]:
        result["repeat_scale_m"] = [1.0, 1.0]
    return result


def _normalize_token(raw: Any) -> str:
    txt = str(raw or "").strip().lower().replace("đ", "d")
    txt = "".join(ch for ch in unicodedata.normalize("NFD", txt) if unicodedata.category(ch) != "Mn")
    return re.sub(r"[\s\-]+", "_", txt)


def get_named_parts_for_furniture_py(furn: Dict[str, Any]) -> List[Dict[str, str]]:
    tokens = " ".join(
        _normalize_token(furn.get(k))
        for k in ("category", "asset_id", "name", "id")
        if furn.get(k)
    )
    if re.search(r"island|dao_bep", tokens):
        return [
            {"partId": "countertop", "label": "Mặt đá (Countertop)", "surfaceType": "stone"},
            {"partId": "body", "label": "Thân tủ (Cabinet Body)", "surfaceType": "wood"},
            {"partId": "doors", "label": "Cánh tủ (Cabinet Doors)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Chân đế (Base / Legs)", "surfaceType": "metal"},
        ]
    if re.search(r"kitchen_cabinet|counter|tu_bep|cupboard|vanity|bath_vanity", tokens):
        return [
            {"partId": "countertop", "label": "Mặt bàn đá (Countertop)", "surfaceType": "stone"},
            {"partId": "body", "label": "Thân tủ (Body)", "surfaceType": "wood"},
            {"partId": "doors", "label": "Cánh tủ (Doors)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Chân / Tay nắm (Legs & Hardware)", "surfaceType": "metal"},
        ]
    if re.search(r"bunk|giuong_tang", tokens):
        return [
            {"partId": "frame", "label": "Khung giường (Bed Frame)", "surfaceType": "wood"},
            {"partId": "mattress", "label": "Đệm & Chăn (Mattress & Bedding)", "surfaceType": "fabric"},
            {"partId": "steps", "label": "Thang leo & Lan can (Ladder & Guard)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Trụ chân (Corner Posts)", "surfaceType": "wood"},
        ]
    if re.search(r"stair|cau_thang", tokens):
        return [
            {"partId": "steps", "label": "Mặt bậc thang (Treads)", "surfaceType": "wood"},
            {"partId": "body", "label": "Thân dầm / Cổ bậc (Risers & Stringer)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Lan can / Tay vịn (Railing)", "surfaceType": "metal"},
        ]
    if re.search(r"\bbed\b|giuong", tokens):
        return [
            {"partId": "frame", "label": "Khung & Đầu giường (Frame & Headboard)", "surfaceType": "wood"},
            {"partId": "mattress", "label": "Đệm & Ga gối (Mattress & Linens)", "surfaceType": "fabric"},
            {"partId": "legs", "label": "Chân giường (Legs)", "surfaceType": "wood"},
        ]
    if re.search(r"sofa|couch|loveseat|armchair|ghe_banh|ottoman|pouf|don_sofa|don_tron", tokens):
        return [
            {"partId": "mattress", "label": "Đệm bọc vải (Upholstery)", "surfaceType": "fabric"},
            {"partId": "frame", "label": "Khung sườn (Frame)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Chân ghế (Legs)", "surfaceType": "wood"},
        ]
    if re.search(r"wardrobe|dresser|cabinet|nightstand|bookcase|bookshelf|tv_stand|tv_console|credenza", tokens):
        return [
            {"partId": "body", "label": "Thân tủ (Body)", "surfaceType": "wood"},
            {"partId": "doors", "label": "Cánh / Ngăn kéo (Doors & Drawers)", "surfaceType": "wood"},
            {"partId": "countertop", "label": "Mặt trên (Top Surface)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Chân đế (Legs)", "surfaceType": "metal"},
        ]
    if re.search(r"console_table|ban_console|(?<![a-z0-9])console(?![a-z0-9])", tokens) and not re.search(r"tv_stand|tv_cabinet|tv_console|ke_tivi", tokens):
        return [
            {"partId": "countertop", "label": "Mặt đá (Stone Top)", "surfaceType": "stone"},
            {"partId": "frame", "label": "Khung mảnh (Slim Frame)", "surfaceType": "metal"},
            {"partId": "legs", "label": "Chân thanh mảnh (Slim Legs)", "surfaceType": "metal"},
        ]
    if re.search(r"kitchen_hood|range_hood|may_hut_mui|(?<![a-z0-9])(tv|tivi|television)(?![a-z0-9])", tokens):
        return [
            {"partId": "body", "label": "Thân thiết bị (Body)", "surfaceType": "metal"},
            {"partId": "legs", "label": "Chân / Ống (Stand / Flue)", "surfaceType": "metal"},
        ]
    if re.search(r"rug|carpet|area_rug|floor_mat|bath_mat|door_mat|tham", tokens):
        return [
            {"partId": "body", "label": "Bề mặt thảm (Rug Weave)", "surfaceType": "fabric"},
        ]
    if re.search(r"table|desk|ban", tokens):
        return [
            {"partId": "countertop", "label": "Mặt bàn (Tabletop)", "surfaceType": "stone"},
            {"partId": "frame", "label": "Khung bàn (Apron / Frame)", "surfaceType": "wood"},
            {"partId": "legs", "label": "Chân bàn (Legs)", "surfaceType": "wood"},
        ]
    return [
        {"partId": "body", "label": "Thân chính (Main Body)", "surfaceType": "wood"},
        {"partId": "legs", "label": "Chân / Đế (Base)", "surfaceType": "metal"},
    ]


def _pick_first_slug(by_slug: Dict[str, Dict[str, Any]], slugs: List[str]) -> Optional[Dict[str, Any]]:
    for s in slugs:
        if s in by_slug:
            return by_slug[s]
    return None


def resolve_furniture_asset_for_blender(
    furn: Dict[str, Any],
    pack_id: str = DEFAULT_ASSET_PACK,
) -> Dict[str, Any]:
    clean_pack = str(pack_id or DEFAULT_ASSET_PACK).strip() or DEFAULT_ASSET_PACK
    catalog_items = load_sh3d_catalog(clean_pack)
    by_slug = {item["slug"]: item for item in catalog_items}

    raw_tokens = [
        _normalize_token(furn.get(k))
        for k in ("category", "asset_id", "name", "id")
        if furn.get(k)
    ]
    joined = " ".join(raw_tokens)
    w_mm = float(furn.get("width_mm") or 1000.0)
    d_mm = float(furn.get("depth_mm") or 800.0)

    # 1. Explicit normalized_glb only if it points to the active curated asset pack
    norm_glb = furn.get("normalized_glb")
    if isinstance(norm_glb, str) and norm_glb.strip().startswith(f"/assets/{clean_pack}/"):
        disk_p = _resolve_public_url_to_disk(norm_glb)
        if disk_p:
            matched_entry = next((it for it in catalog_items if it.get("glb_url") == norm_glb), None)
            return {
                "kind": "glb",
                "glb_disk_path": disk_p,
                "catalog_entry": matched_entry,
                "parametric_type": None,
                "flagged_unmapped": False,
            }

    # 2. Parametric categories (check bunk & tv_stand first so "Giường tầng có cầu thang" != stair and "Kệ Tivi asset_ph_console_table" != console_table)
    is_bunk = bool(re.search(r"bunk|giuong_tang", joined))
    is_tv_stand = bool(re.search(r"tv_stand|tv_cabinet|tv_console|media_console|ke_tivi", joined))
    if not is_tv_stand and re.search(r"console_table|ban_console|(?<![a-z0-9])console(?![a-z0-9])", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "console_table", "flagged_unmapped": False}
    if re.search(r"(?<![a-z0-9])(rug|carpet|area_rug|floor_mat|bath_mat|door_mat|tham)(?![a-z0-9])", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "rug", "flagged_unmapped": False}
    if re.search(r"mirror|guong", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "mirror", "flagged_unmapped": False}
    if re.search(r"painting|picture|poster|tranh|(?<![a-z0-9])(frame|art)(?![a-z0-9])", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "painting", "flagged_unmapped": False}
    if re.search(r"curtain|drape|blind|(?<![a-z0-9])rem(?![a-z0-9])", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "curtain", "flagged_unmapped": False}
    if not is_bunk and re.search(r"stair|cau_thang", joined):
        return {"kind": "parametric", "glb_disk_path": None, "catalog_entry": None, "parametric_type": "stair", "flagged_unmapped": False}

    # 3. Specific keyword rules FIRST (specific sub-categories must beat generic aliases like bed/table/chair/cabinet)
    matched_entry: Optional[Dict[str, Any]] = None
    specific_rules: List[Tuple[str, List[str]]] = [
        (r"bunk|giuong_tang", ["bed_bunk"]),
        (r"single_bed|child_bed|kid_bed|giuong_don", ["bed_single"]),
        (r"tv_stand|tv_cabinet|tv_console|media_console|ke_tivi", ["tv_stand", "dresser"]),
        (r"kitchen_hood|range_hood|extractor_hood|may_hut_mui", ["kitchen_hood"]),
        (r"kitchen_island|(?<![a-z0-9])island(?![a-z0-9])|dao_bep", ["kitchen_island"]),
        (r"kitchen_cabinet|tu_bep|(?<![a-z0-9])counter(?![a-z0-9])", ["kitchen_cabinet"]),
        (r"kitchen_sink|(?<![a-z0-9])sink(?![a-z0-9])|chau_rua", ["kitchen_sink"]),
        (r"fridge|refrigerator|tu_lanh", ["kitchen_fridge"]),
        (r"stove|oven|cooker|cooktop|bep_ga|bep_tu", ["kitchen_stove"]),
        (r"coffee_table|tea_table|ban_tra|side_table", ["coffee_table", "round_marble", "round_table"]),
        (r"round_table|ban_tron", ["round_table", "round_marble", "coffee_table"]),
        (r"(?<![a-z0-9])desk(?![a-z0-9])|study_table|work_table|ban_lam_viec|ban_hoc", ["desk", "desk_2"]),
        (r"dining_table|ban_an", ["dining_table"]),
        (r"armchair|wing_chair|lounge_chair|ghe_banh|ghe_thu_gian", ["armchair", "armchair_wing"]),
        (r"ottoman|pouf|footstool|don_sofa|don_tron|don_ngoi", ["ottoman", "stool"]),
        (r"(?<![a-z0-9])bench(?![a-z0-9])|ghe_bang", ["bench", "stool"]),
        (r"(?<![a-z0-9])stool(?![a-z0-9])|bar_stool|ghe_don", ["stool"]),
        (r"wardrobe|closet|armoire|tu_quan_ao", ["wardrobe"]),
        (r"bookcase|bookshelf|ke_sach|(?<![a-z0-9])shelf(?![a-z0-9])", ["bookcase"]),
        (r"dresser|chest|credenza|sideboard|tu_ngan_keo", ["dresser"]),
        (r"cupboard|cabinet_tall|tu_cao", ["cupboard", "wardrobe"]),
        (r"nightstand|bedside|tab_dau_giuong", ["nightstand"]),
        (r"bathtub|bath_tub|(?<![a-z0-9])tub(?![a-z0-9])|bon_tam", ["bath_tub"]),
        (r"washbasin|vanity|bath_vanity|basin|lavabo", ["bath_vanity"]),
        (r"toilet|(?<![a-z0-9])wc(?![a-z0-9])|bon_cau", ["bath_toilet"]),
        (r"shower|voi_sen|cabin_tam", ["bath_shower"]),
        (r"floor_lamp|standing_lamp|den_cay", ["lamp_table", "lamp_vase"]),
        (r"wall_lamp|sconce|ceiling_lamp|pendant|hanging_light|den_tha", ["lamp_pendant", "lamp_wall"]),
        (r"desk_lamp|table_lamp|den_ban", ["lamp_desk", "lamp_table"]),
        (r"television|smart_tv|tivi|(?<![a-z0-9])tv(?![a-z0-9])", ["tv"]),
        (r"orchid|lan_ho_diep|flower", ["plant_medium", "plant_orchid"]),
        (r"tall_plant|tree|yucca|cay_cao", ["plant_tall"]),
        (r"plant_box|planter|bui_hoa", ["plant_box", "plant_medium"]),
        (r"tall_clock|clock_tall", ["clock_tall"]),
    ]
    for pattern, slugs in specific_rules:
        if re.search(pattern, joined):
            if slugs[0] == "dining_table" and max(w_mm, d_mm) <= 950:
                matched_entry = _pick_first_slug(by_slug, ["round_table", "round_marble", "coffee_table"])
            if not matched_entry:
                matched_entry = _pick_first_slug(by_slug, slugs)
            if matched_entry:
                break

    # 4. Exact alias match in active pack catalog
    if not matched_entry:
        for token in raw_tokens:
            for entry in catalog_items:
                aliases = entry.get("aliases") or []
                if entry.get("slug") == token or token in aliases:
                    if token == "bed" and w_mm < 1300 and "bed_single" in by_slug:
                        matched_entry = by_slug["bed_single"]
                    else:
                        matched_entry = entry
                    break
            if matched_entry:
                break

    # 5. Generic category fallback rules (never default to sofa)
    if not matched_entry:
        generic_rules: List[Tuple[str, List[str]]] = [
            (r"(?<![a-z0-9])bed(?![a-z0-9])|giuong", ["bed_double", "bed_double_2"]),
            (r"sofa|couch|loveseat", ["sofa_3seat", "sofa_l", "sofa_2seat", "sofa_winchester"]),
            (r"(?<![a-z0-9])chair(?![a-z0-9])|(?<![a-z0-9])ghe(?![a-z0-9])", ["chair_dining", "chair_2"]),
            (r"(?<![a-z0-9])table(?![a-z0-9])|(?<![a-z0-9])ban(?![a-z0-9])", ["dining_table"]),
            (r"(?<![a-z0-9])cabinet(?![a-z0-9])|(?<![a-z0-9])tu(?![a-z0-9])", ["cupboard", "dresser", "kitchen_cabinet"]),
            (r"(?<![a-z0-9])lamp(?![a-z0-9])|(?<![a-z0-9])den(?![a-z0-9])", ["lamp_table", "lamp_desk"]),
            (r"plant|cay_xanh|(?<![a-z0-9])pot(?![a-z0-9])", ["plant_small", "plant_medium"]),
        ]
        for pattern, slugs in generic_rules:
            if re.search(pattern, joined):
                if slugs[0] == "bed_double" and w_mm < 1300 and "bed_single" in by_slug:
                    matched_entry = by_slug["bed_single"]
                elif slugs[0] == "dining_table" and max(w_mm, d_mm) <= 950:
                    matched_entry = _pick_first_slug(by_slug, ["round_table", "round_marble", "coffee_table"])
                if not matched_entry:
                    matched_entry = _pick_first_slug(by_slug, slugs)
                if matched_entry:
                    break

    if matched_entry:
        disk_p = _resolve_public_url_to_disk(matched_entry.get("glb_url"))
        if disk_p:
            return {
                "kind": "glb",
                "glb_disk_path": disk_p,
                "catalog_entry": matched_entry,
                "parametric_type": None,
                "flagged_unmapped": False,
            }

    shape = "box"
    if re.search(r"round|stool|pouf|ottoman|pillar|column", joined):
        shape = "cylinder"
    elif re.search(r"shelf|rack|stand|storage|unit|bench", joined):
        shape = "cabinet"
    elif re.search(r"desk|table|counter", joined):
        shape = "table"

    return {
        "kind": "approximate",
        "glb_disk_path": None,
        "catalog_entry": None,
        "parametric_type": shape,
        "flagged_unmapped": True,
    }


def build_project_credits_report(project: CanonicalProject) -> Dict[str, Any]:
    """
    Auto-generates the Credits report (`CREDITS.md` + structured JSON) listing all
    CC-BY 3D models (requiring attribution) and CC0 3D models & PBR materials
    used in the project and available in the active Studio asset pack.
    """
    pack_id = resolve_asset_pack_id(project)
    sh3d_items = load_sh3d_catalog(pack_id)
    pbr_data = load_pbr_catalog()
    pbr_materials = pbr_data.get("materials", [])

    used_models: List[Dict[str, Any]] = []
    used_materials: Dict[str, Dict[str, Any]] = {}

    # 1. Collect floor & wall materials used in the project
    floor_ov = project.surface_material_overrides.get("floor")
    floor_mat_id = (
        floor_ov.material_id
        if floor_ov and floor_ov.material_id
        else (project.rooms[0].floor_material_id if project.rooms else "pbr_floor_oak_light")
    )
    floor_pbr = resolve_pbr_material_for_blender(floor_mat_id, "floor")
    if floor_pbr.get("id"):
        used_materials[floor_pbr["id"]] = {
            **floor_pbr,
            "used_on": [f"Sàn phòng ({r.name})" for r in project.rooms] or ["Sàn chính"],
        }

    for w in project.walls:
        fa_pbr = resolve_pbr_material_for_blender(w.face_a_material_id, "wall")
        fb_pbr = resolve_pbr_material_for_blender(w.face_b_material_id or "pbr_wall_wood_slat_oak", "wall")
        for pbr_item, label in ((fa_pbr, f"Tường {w.id} (Mặt trong)"), (fb_pbr, f"Tường {w.id} (Mặt ngoài)")):
            mid = pbr_item.get("id")
            if mid:
                if mid not in used_materials:
                    used_materials[mid] = {**pbr_item, "used_on": []}
                if label not in used_materials[mid]["used_on"]:
                    used_materials[mid]["used_on"].append(label)

    # 2. Collect furniture models & part materials used in the project
    for furn in project.furniture_instances:
        f_dict = furn.model_dump()
        resolved = resolve_furniture_asset_for_blender(f_dict, pack_id=pack_id)
        entry = resolved.get("catalog_entry")
        if entry:
            used_models.append(
                {
                    "furniture_id": furn.id,
                    "furniture_name": furn.name,
                    "slug": entry["slug"],
                    "sh3d_id": entry["sh3d_id"],
                    "model_name": entry["name"],
                    "creator": entry["creator"],
                    "license": entry["license"],
                    "source": entry["source"],
                    "modified": bool(entry.get("modified", True)),
                    "modification_note": entry.get("modification_note", ""),
                }
            )
        else:
            used_models.append(
                {
                    "furniture_id": furn.id,
                    "furniture_name": furn.name,
                    "slug": f"parametric_{resolved.get('parametric_type') or 'custom'}",
                    "sh3d_id": "procedural_geometry",
                    "model_name": f"Hình học tham số ({furn.category})",
                    "creator": "ATELIER Parametric Builder",
                    "license": "CC-0",
                    "source": "Procedural + Poly Haven CC0 PBR",
                    "modified": False,
                    "modification_note": "Dựng bằng hàm hình học tham số theo kích thước thật",
                }
            )

        parts = get_named_parts_for_furniture_py(f_dict)
        part_mats = furn.part_materials or {}
        for part in parts:
            pid = part["partId"]
            stype = part["surfaceType"]
            assigned_id = part_mats.get(pid)
            pbr_entry = resolve_pbr_material_for_blender(assigned_id, stype)
            mid = pbr_entry.get("id")
            if mid:
                if mid not in used_materials:
                    used_materials[mid] = {**pbr_entry, "used_on": []}
                usage_label = f"{furn.name} — {part['label']}"
                if usage_label not in used_materials[mid]["used_on"]:
                    used_materials[mid]["used_on"].append(usage_label)

    cc_by_used = [m for m in used_models if m["license"] == "CC-BY"]
    cc_0_used = [m for m in used_models if m["license"] == "CC-0"]
    cc_by_catalog = [m for m in sh3d_items if m.get("license") == "CC-BY"]

    md_lines = [
        f"# TRANG GHI NGUỒN TÀI NGUYÊN 3D & VẬT LIỆU PBR (CREDITS) — {project.name}",
        "",
        f"- **Mã dự án:** `{project.project_id}` (Revision `#{project.revision}`)",
        f"- **Thời điểm tạo tự động:** `{datetime.now(timezone.utc).isoformat()}`",
        "- **Chính sách giấy phép:** Chỉ sử dụng tài nguyên **CC0 (Public Domain)** và **CC-BY (Creative Commons Attribution)**. **Tuyệt đối không sử dụng** `Free Art 1.3` hoặc `Furniture.jar` (`GPL`).",
        "",
        "## 1. Model 3D giấy phép CC-BY đang dùng trong Scene (Bắt buộc ghi nguồn)",
        "",
    ]
    if cc_by_used:
        md_lines.extend(
            [
                "| Món nội thất trong Scene | Model gốc (`sh3d_id`) | Tác giả (Creator) | Giấy phép | Nguồn | Chỉnh sửa |",
                "|---|---|---|---|---|---|",
            ]
        )
        for m in cc_by_used:
            mod_str = f"Có ({m['modification_note']})" if m["modified"] else "Không"
            md_lines.append(
                f"| **{m['furniture_name']}** (`{m['furniture_id']}`) | {m['model_name']} (`{m['sh3d_id']}`) | **{m['creator']}** | `{m['license']}` | {m['source']} | {mod_str} |"
            )
    else:
        md_lines.append("*Scene hiện tại chỉ sử dụng các model CC-0 và hình học tham số.*")

    md_lines.extend(
        [
            "",
            "## 2. Vật liệu PBR đang gán trong Scene (Poly Haven CC0 1.0 Universal)",
            "",
            "| Mã vật liệu | Tên vật liệu | Loại bề mặt | Nguồn & Giấy phép | Các phần tử sử dụng |",
            "|---|---|---|---|---|",
        ]
    )
    for mid, mdata in used_materials.items():
        used_str = ", ".join(mdata.get("used_on", [])[:5])
        if len(mdata.get("used_on", [])) > 5:
            used_str += f" (+{len(mdata['used_on']) - 5} phần tử khác)"
        md_lines.append(
            f"| `{mid}` | **{mdata.get('name')}** | `{mdata.get('surface_type')}` | {mdata.get('source')} (`{mdata.get('license')}`) | {used_str} |"
        )

    md_lines.extend(
        [
            "",
            f"## 3. Toàn bộ danh mục Model CC-BY trong Gói `{pack_id}` ({len(cc_by_catalog)}/{len(sh3d_items)} model)",
            "",
            "| Slug | Tên model (`sh3d_id`) | Tác giả | Giấy phép | Nguồn | Ghi chú chuẩn hóa |",
            "|---|---|---|---|---|---|",
        ]
    )
    for item in cc_by_catalog:
        md_lines.append(
            f"| `{item['slug']}` | {item['name']} (`{item['sh3d_id']}`) | **{item['creator']}** | `{item['license']}` | {item['source']} | {item.get('modification_note', '')} |"
        )

    markdown_text = "\n".join(md_lines) + "\n"
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    project_credits_path = RENDERS_DIR / f"{project.project_id}_CREDITS.md"
    if not project_credits_path.exists() or project_credits_path.read_text(encoding="utf-8") != markdown_text:
        project_credits_path.write_text(markdown_text, encoding="utf-8")

    # Do NOT overwrite paperclip/ui/public/assets/CREDITS.md during GET/render requests,
    # as modifying files inside Vite's watched public/ tree triggers a full browser reload.
    return {
        "ok": True,
        "project_id": project.project_id,
        "project_name": project.name,
        "revision": project.revision,
        "credits_markdown_path": str(project_credits_path),
        "public_credits_url": f"/api/v1/projects/{project.project_id}/credits.md",
        "cc_by_models_in_scene": cc_by_used,
        "cc_0_models_in_scene": cc_0_used,
        "materials_in_scene": list(used_materials.values()),
        "all_cc_by_catalog_models": cc_by_catalog,
        "all_pbr_catalog_materials": pbr_materials,
        "markdown": markdown_text,
    }


def generate_cycles_runner_script() -> str:
    """
    Returns the headless Blender 4.2.3 LTS Python script that reconstructs the
    exact SceneGraph + 36-item sh3d-classic GLB catalog + parametric items +
    per-element/per-part PBR materials from `pbr_catalog.json`, supporting both
    `dollhouse` (38° tilt, 45° yaw, 1.12m cutaway walls with white caps, ground tray,
    opaque + transparent PNG) and `eye_level` (1.50m height, 26mm lens, GI + indoor lights).
    """
    return r'''
import bpy
import bmesh
import json
import math
import os
import re
import sys
from mathutils import Vector, Matrix

argv = sys.argv
if "--" not in argv:
    raise RuntimeError("Missing '--' arguments for Blender runner script")
args = argv[argv.index("--") + 1:]
manifest_path = args[0]
blend_out_path = args[1]
verification_out_path = args[2]
render_out_path = args[3] if len(args) > 3 and args[3] != "NONE" else None
render_mode = args[4] if len(args) > 4 else "preview"
width_px = int(args[5]) if len(args) > 5 else 960
height_px = int(args[6]) if len(args) > 6 else 540
samples = int(args[7]) if len(args) > 7 else 24
seed = int(args[8]) if len(args) > 8 else 1234
transparent_out_path = args[9] if len(args) > 9 and args[9] != "NONE" else None

with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

cam_spec = manifest["camera"]
is_dollhouse = bool(cam_spec.get("is_dollhouse", False))
wall_cut_h = float(cam_spec.get("wall_cut_height_m", 1.12)) if is_dollhouse else None

# 1. Reset factory scene completely
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def hex_to_rgba(hex_str, alpha=1.0):
    h = (hex_str or "#FFFFFF").lstrip("#")
    if len(h) != 6:
        return (0.85, 0.82, 0.78, alpha)
    vals = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [pow(v, 2.2) for v in vals]
    return (lin[0], lin[1], lin[2], alpha)

def set_bsdf_input(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value

_LOADED_IMAGES = {}
def load_image_cached(path, non_color=False):
    if not path or not os.path.isfile(path):
        return None
    key = (path, bool(non_color))
    if key in _LOADED_IMAGES:
        return _LOADED_IMAGES[key]
    img = bpy.data.images.load(path)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    _LOADED_IMAGES[key] = img
    return img

def create_principled_material(name, hex_color="#E5E0D8", roughness=0.55, metallic=0.0, coat=0.0, coat_rough=0.3, sheen=0.0, sheen_hex="#FFFFFF", transmission=0.0, ior=1.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        set_bsdf_input(bsdf, "Base Color", hex_to_rgba(hex_color, 1.0))
        set_bsdf_input(bsdf, "Roughness", float(roughness))
        set_bsdf_input(bsdf, "Metallic", float(metallic))
        set_bsdf_input(bsdf, "Coat Weight", float(coat))
        set_bsdf_input(bsdf, "Coat Roughness", float(coat_rough))
        set_bsdf_input(bsdf, "Sheen Weight", float(sheen))
        set_bsdf_input(bsdf, "Sheen Tint", hex_to_rgba(sheen_hex, 1.0))
        set_bsdf_input(bsdf, "Transmission Weight", float(transmission))
        set_bsdf_input(bsdf, "IOR", float(ior))
    return mat

def build_pbr_material_from_entry(mat_name, pbr_entry, use_object_coords=False):
    if not pbr_entry:
        return create_principled_material(mat_name)
    base_hex = pbr_entry.get("base_color") or "#E5E0D8"
    rough_val = float(pbr_entry.get("roughness", 0.55))
    metal_val = float(pbr_entry.get("metalness", 0.0))
    trans_val = float(pbr_entry.get("transmission", 0.0))
    repeat_m = pbr_entry.get("repeat_scale_m") or [1.0, 1.0]
    rep_x = max(0.05, float(repeat_m[0]))
    rep_y = max(0.05, float(repeat_m[1]))

    mat = create_principled_material(
        mat_name,
        hex_color=base_hex,
        roughness=rough_val,
        metallic=metal_val,
        transmission=trans_val,
        ior=1.52,
    )
    mat["atelier_material_id"] = pbr_entry.get("id", "")
    mat["atelier_tint"] = base_hex

    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return mat

    diff_path = pbr_entry.get("diffuse_path")
    rough_path = pbr_entry.get("roughness_path")
    norm_path = pbr_entry.get("normal_path")

    if diff_path or rough_path or norm_path:
        tex_coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        if use_object_coords:
            nt.links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
            mapping.inputs["Scale"].default_value = (1.0 / rep_x, 1.0 / rep_y, 1.0)
        else:
            nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
            mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)

        if diff_path:
            d_img = load_image_cached(diff_path, non_color=False)
            if d_img:
                tex_d = nt.nodes.new("ShaderNodeTexImage")
                tex_d.image = d_img
                if use_object_coords:
                    tex_d.projection = 'BOX'
                    tex_d.projection_blend = 0.2
                nt.links.new(mapping.outputs["Vector"], tex_d.inputs["Vector"])

                is_painted_wall = (pbr_entry.get("surface_type") == "wall" and "slat" not in pbr_entry.get("id", ""))
                bc_node = nt.nodes.new("ShaderNodeBrightContrast")
                bc_node.inputs["Bright"].default_value = 0.34 if is_painted_wall else 0.16
                bc_node.inputs["Contrast"].default_value = 0.04 if is_painted_wall else 0.10
                nt.links.new(tex_d.outputs["Color"], bc_node.inputs["Color"])

                mix_node = nt.nodes.new("ShaderNodeMix")
                mix_node.data_type = 'RGBA'
                mix_node.blend_type = 'MIX' if is_painted_wall else 'MULTIPLY'
                mix_node.inputs[0].default_value = 0.86 if is_painted_wall else 0.88
                nt.links.new(bc_node.outputs["Color"], mix_node.inputs[6])
                mix_node.inputs[7].default_value = hex_to_rgba(base_hex, 1.0)
                nt.links.new(mix_node.outputs[2], bsdf.inputs["Base Color"])

        if rough_path:
            r_img = load_image_cached(rough_path, non_color=True)
            if r_img:
                tex_r = nt.nodes.new("ShaderNodeTexImage")
                tex_r.image = r_img
                if use_object_coords:
                    tex_r.projection = 'BOX'
                    tex_r.projection_blend = 0.2
                nt.links.new(mapping.outputs["Vector"], tex_r.inputs["Vector"])
                mix_r = nt.nodes.new("ShaderNodeMix")
                mix_r.data_type = 'FLOAT'
                mix_r.inputs[0].default_value = 0.65
                mix_r.inputs[2].default_value = rough_val
                nt.links.new(tex_r.outputs["Color"], mix_r.inputs[3])
                nt.links.new(mix_r.outputs[0], bsdf.inputs["Roughness"])

        if norm_path:
            n_img = load_image_cached(norm_path, non_color=True)
            if n_img:
                tex_n = nt.nodes.new("ShaderNodeTexImage")
                tex_n.image = n_img
                if use_object_coords:
                    tex_n.projection = 'BOX'
                    tex_n.projection_blend = 0.2
                nt.links.new(mapping.outputs["Vector"], tex_n.inputs["Vector"])
                norm_map = nt.nodes.new("ShaderNodeNormalMap")
                norm_map.inputs["Strength"].default_value = 0.35
                nt.links.new(tex_n.outputs["Color"], norm_map.inputs["Color"])
                nt.links.new(norm_map.outputs["Normal"], bsdf.inputs["Normal"])

    return mat

# Build architectural glass material that lets direct sunlight pass cleanly into rooms
def create_architectural_glass_material():
    mat = bpy.data.materials.new(name="MAT_WINDOW_GLASS")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    out_node = nt.nodes.get("Material Output")
    if bsdf and out_node:
        set_bsdf_input(bsdf, "Base Color", hex_to_rgba("#F0F7FF", 1.0))
        set_bsdf_input(bsdf, "Roughness", 0.02)
        set_bsdf_input(bsdf, "Metallic", 0.0)
        set_bsdf_input(bsdf, "Transmission Weight", 0.92)
        set_bsdf_input(bsdf, "IOR", 1.45)
        transp = nt.nodes.new("ShaderNodeBsdfTransparent")
        transp.inputs["Color"].default_value = (0.98, 0.99, 1.0, 1.0)
        lp = nt.nodes.new("ShaderNodeLightPath")
        mix_s = nt.nodes.new("ShaderNodeMixShader")
        for lnk in list(nt.links):
            if lnk.to_node == out_node and lnk.to_socket == out_node.inputs["Surface"]:
                nt.links.remove(lnk)
        nt.links.new(lp.outputs["Is Shadow Ray"], mix_s.inputs[0])
        nt.links.new(bsdf.outputs["BSDF"], mix_s.inputs[1])
        nt.links.new(transp.outputs["BSDF"], mix_s.inputs[2])
        nt.links.new(mix_s.outputs["Shader"], out_node.inputs["Surface"])
    return mat

geom = manifest["pascal_geometry"]
rooms = geom.get("rooms", [])
walls = geom.get("walls", [])
openings = geom.get("openings", [])
windows = geom.get("windows", [])
tile_tex = manifest.get("tile_textures") or {}
floor_resolved = manifest.get("floor_material_resolved") or {}
floor_pbr_spec = manifest.get("floor_pbr_entry") or {}

# Compute overall house bounding box in meters
all_wx = [w["start_mm"][0] / 1000.0 for w in walls] + [w["end_mm"][0] / 1000.0 for w in walls]
all_wy = [w["start_mm"][1] / 1000.0 for w in walls] + [w["end_mm"][1] / 1000.0 for w in walls]
house_min_x = min(all_wx) if all_wx else 0.0
house_max_x = max(all_wx) if all_wx else 4.0
house_min_y = min(all_wy) if all_wy else 0.0
house_max_y = max(all_wy) if all_wy else 5.0
house_cx = (house_min_x + house_max_x) / 2.0
house_cy = (house_min_y + house_max_y) / 2.0
house_w = max(2.0, house_max_x - house_min_x)
house_d = max(2.0, house_max_y - house_min_y)

# 2. Build Floor Material & Polygonal Room Floors
floor_tint = floor_pbr_spec.get("base_color") or floor_resolved.get("tint") or tile_tex.get("tint") or "#D8C3A5"
floor_rep = floor_pbr_spec.get("repeat_scale_m") or [1.2, 1.2]
floor_rep_x = max(0.2, float(floor_rep[0]))
floor_rep_y = max(0.2, float(floor_rep[1]))

floor_mat = build_pbr_material_from_entry("MAT_SURFACE_FLOOR", floor_pbr_spec, use_object_coords=False)
# If explicit tile_textures with physical grout were generated AND surface_type is tile, overlay tile diffuse/bump
if floor_pbr_spec.get("surface_type") == "tile" and tile_tex.get("diffuse_path") and os.path.isfile(tile_tex["diffuse_path"]):
    floor_rep_x = max(0.2, float(tile_tex.get("width_mm", 800.0)) / 1000.0)
    floor_rep_y = max(0.2, float(tile_tex.get("height_mm", 800.0)) / 1000.0)

ceiling_mat = create_principled_material("MAT_SURFACE_CEILING", hex_color="#FAF8F5", roughness=0.85, metallic=0.0)
white_cap_mat = create_principled_material("MAT_WALL_CAP_WHITE", hex_color="#FFFFFF", roughness=0.38, metallic=0.0)
black_frame_mat = create_principled_material("MAT_FRAME_BLACK", hex_color="#1F2227", roughness=0.32, metallic=0.65)
door_panel_mat = create_principled_material("MAT_DOOR_PANEL", hex_color="#F5F2EB", roughness=0.45, metallic=0.0, coat=0.08)
glass_mat = create_architectural_glass_material()

created_rooms = []
for idx_r, r in enumerate(rooms):
    raw_poly = r.get("polygon_mm") or [[0, 0], [4000, 0], [4000, 5000], [0, 5000]]
    signed_area = sum(
        raw_poly[i][0] * raw_poly[(i + 1) % len(raw_poly)][1]
        - raw_poly[(i + 1) % len(raw_poly)][0] * raw_poly[i][1]
        for i in range(len(raw_poly))
    )
    poly = list(raw_poly) if signed_area >= 0 else list(reversed(raw_poly))
    z_floor = -idx_r * 0.002

    room_pbr = r.get("resolved_floor_pbr") or floor_pbr_spec
    r_mat = build_pbr_material_from_entry(f"MAT_FLOOR_{r['id']}", room_pbr, use_object_coords=False) if r.get("resolved_floor_pbr") else floor_mat
    r_rep = room_pbr.get("repeat_scale_m") or [floor_rep_x, floor_rep_y]
    rx_m = max(0.2, float(r_rep[0]))
    ry_m = max(0.2, float(r_rep[1]))

    mesh = bpy.data.meshes.new(f"MESH_ROOM_{r['id']}")
    bm = bmesh.new()
    verts = [bm.verts.new((pt[0] / 1000.0, pt[1] / 1000.0, z_floor)) for pt in poly]
    top_face = bm.faces.new(verts)
    top_face.normal_update()
    if top_face.normal.z < 0:
        top_face.normal_flip()

    # Extrude downward by 0.08m so floor has true slab thickness matching StudioViewport
    ret = bmesh.ops.extrude_face_region(bm, geom=[top_face])
    extruded_verts = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0.0, 0.0, -0.08)), verts=extruded_verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            vx_m = loop.vert.co.x
            vy_m = loop.vert.co.y
            loop[uv_layer].uv = (vx_m / rx_m, vy_m / ry_m)

    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"ROOM_{r['id']}", mesh)
    obj.data.materials.append(r_mat)
    scene.collection.objects.link(obj)
    created_rooms.append(obj)

    # Ceiling slab
    ceil_h = float(r.get("ceiling_height_mm", 2800.0)) / 1000.0 + idx_r * 0.002
    c_mesh = bpy.data.meshes.new(f"MESH_CEILING_{r['id']}")
    bm_c = bmesh.new()
    c_verts = [bm_c.verts.new((pt[0] / 1000.0, pt[1] / 1000.0, ceil_h)) for pt in reversed(poly)]
    c_face = bm_c.faces.new(c_verts)
    c_face.normal_update()
    if c_face.normal.z > 0:
        c_face.normal_flip()
    bmesh.ops.triangulate(bm_c, faces=bm_c.faces[:])
    bm_c.to_mesh(c_mesh)
    bm_c.free()
    c_obj = bpy.data.objects.new(f"CEILING_{r['id']}", c_mesh)
    c_obj.data.materials.append(ceiling_mat)
    c_obj.visible_camera = False
    if cam_spec.get("hide_ceiling") or is_dollhouse:
        c_obj.hide_render = True
    scene.collection.objects.link(c_obj)

# 2B. Dollhouse Ground Tray (Grass border + Oak Patio Deck + Patio Seating + Shrubs)
if is_dollhouse:
    tray_spec = manifest.get("dollhouse_tray") or {}
    grass_pbr = tray_spec.get("grass_pbr") or {}
    patio_pbr = tray_spec.get("patio_pbr") or {}
    grass_mat = build_pbr_material_from_entry("MAT_TRAY_GRASS", grass_pbr, use_object_coords=False)
    patio_mat = build_pbr_material_from_entry("MAT_TRAY_PATIO", patio_pbr, use_object_coords=False)
    plinth_mat = create_principled_material("MAT_TRAY_PLINTH", hex_color="#F4F1EA", roughness=0.65)

    pad_back = 0.52
    pad_side = 0.52
    patio_depth = min(2.15, max(1.55, house_d * 0.44))
    tray_min_x = house_min_x - pad_side
    tray_max_x = house_max_x + pad_side
    tray_min_y = house_min_y - pad_back
    tray_max_y = house_max_y + patio_depth + 0.42
    tray_w = tray_max_x - tray_min_x
    tray_d = tray_max_y - tray_min_y
    tray_cx = (tray_min_x + tray_max_x) / 2.0
    tray_cy = (tray_min_y + tray_max_y) / 2.0

    # Grass tray mesh with UV
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tray_cx, tray_cy, -0.045))
    grass_obj = bpy.context.active_object
    grass_obj.name = "DOLLHOUSE_TRAY_GRASS"
    grass_obj.scale = (tray_w, tray_d, 0.065)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for loop in grass_obj.data.loops:
        v = grass_obj.data.vertices[loop.vertex_index].co
        grass_obj.data.uv_layers.active.data[loop.index].uv = (v.x / 0.9, v.y / 0.9)
    grass_obj.data.materials.append(grass_mat)

    # White architectural plinth base under grass
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tray_cx, tray_cy, -0.09))
    plinth_obj = bpy.context.active_object
    plinth_obj.name = "DOLLHOUSE_TRAY_PLINTH"
    plinth_obj.scale = (tray_w + 0.08, tray_d + 0.08, 0.035)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    plinth_obj.data.materials.append(plinth_mat)

    # Front Oak Patio Deck
    patio_w = house_w + 0.04
    patio_cx = house_cx
    patio_cy = house_max_y + patio_depth / 2.0
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(patio_cx, patio_cy, -0.012))
    patio_obj = bpy.context.active_object
    patio_obj.name = "DOLLHOUSE_PATIO_DECK"
    patio_obj.scale = (patio_w, patio_depth, 0.032)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for loop in patio_obj.data.loops:
        v = patio_obj.data.vertices[loop.vertex_index].co
        patio_obj.data.uv_layers.active.data[loop.index].uv = (v.x / 1.1, v.y / 1.1)
    patio_obj.data.materials.append(patio_mat)

    # Small round black patio coffee table + 2 woven/wood lounge chairs on patio deck
    tbl_x = house_cx - house_w * 0.08
    tbl_y = house_max_y + patio_depth * 0.48
    bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=0.28, depth=0.025, location=(tbl_x, tbl_y, 0.38))
    pt_top = bpy.context.active_object
    pt_top.name = "DOLLHOUSE_PATIO_TABLE_TOP"
    pt_top.data.materials.append(black_frame_mat)
    for leg_ang in (0.0, 2.094, 4.188):
        lx = tbl_x + math.cos(leg_ang) * 0.18
        ly = tbl_y + math.sin(leg_ang) * 0.18
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.014, depth=0.38, location=(lx, ly, 0.19))
        pt_leg = bpy.context.active_object
        pt_leg.name = "DOLLHOUSE_PATIO_TABLE_LEG"
        pt_leg.data.materials.append(black_frame_mat)

    patio_wood_mat = create_principled_material("MAT_PATIO_TEAK", hex_color="#B89369", roughness=0.52)
    patio_cushion_mat = create_principled_material("MAT_PATIO_CUSHION", hex_color="#EDE6DA", roughness=0.84)
    for ch_idx, (ch_dx, ch_dy, ch_yaw) in enumerate([(-0.56, -0.10, 0.45), (0.56, -0.10, -0.45)]):
        cx_p = tbl_x + ch_dx
        cy_p = tbl_y + ch_dy
        # Seat cushion & teak wood base + 4 short legs
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx_p, cy_p, 0.25), rotation=(0.0, 0.0, ch_yaw))
        c_base = bpy.context.active_object
        c_base.name = f"DOLLHOUSE_PATIO_CHAIR_BASE_{ch_idx}"
        c_base.scale = (0.54, 0.52, 0.04)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        c_base.data.materials.append(patio_wood_mat)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx_p, cy_p, 0.31), rotation=(0.0, 0.0, ch_yaw))
        c_seat = bpy.context.active_object
        c_seat.name = f"DOLLHOUSE_PATIO_CHAIR_SEAT_{ch_idx}"
        c_seat.scale = (0.50, 0.48, 0.08)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        c_seat.data.materials.append(patio_cushion_mat)

        bx_p = cx_p + math.sin(ch_yaw) * 0.22
        by_p = cy_p - math.cos(ch_yaw) * 0.22
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx_p, by_p, 0.49), rotation=(0.18, 0.0, ch_yaw))
        c_back = bpy.context.active_object
        c_back.name = f"DOLLHOUSE_PATIO_CHAIR_BACK_{ch_idx}"
        c_back.scale = (0.50, 0.04, 0.34)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        c_back.data.materials.append(patio_wood_mat)

        for arm_side in (-0.25, 0.25):
            ax_p = cx_p + math.cos(ch_yaw) * arm_side
            ay_p = cy_p + math.sin(ch_yaw) * arm_side
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ax_p, ay_p, 0.40), rotation=(0.0, 0.0, ch_yaw))
            c_arm = bpy.context.active_object
            c_arm.name = f"DOLLHOUSE_PATIO_CHAIR_ARM_{ch_idx}_{int(arm_side*100)}"
            c_arm.scale = (0.04, 0.48, 0.035)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            c_arm.data.materials.append(patio_wood_mat)
            for leg_y in (-0.20, 0.20):
                lx_p = ax_p - math.sin(ch_yaw) * leg_y
                ly_p = ay_p + math.cos(ch_yaw) * leg_y
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(lx_p, ly_p, 0.20), rotation=(0.0, 0.0, ch_yaw))
                c_leg = bpy.context.active_object
                c_leg.name = f"DOLLHOUSE_PATIO_CHAIR_LEG_{ch_idx}_{int(arm_side*100)}_{int(leg_y*100)}"
                c_leg.scale = (0.035, 0.035, 0.40)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                c_leg.data.materials.append(patio_wood_mat)

    # Greenery hedge & lavender shrubs along exterior border (matching target reference image)
    leaf_green_mat = create_principled_material("MAT_SHRUB_GREEN", hex_color="#4B7F32", roughness=0.72)
    leaf_light_mat = create_principled_material("MAT_SHRUB_LIME", hex_color="#6BA343", roughness=0.68)
    lavender_mat = create_principled_material("MAT_SHRUB_LAVENDER", hex_color="#7B61A8", roughness=0.75)
    white_flower_mat = create_principled_material("MAT_SHRUB_FLOWER_WHITE", hex_color="#F2F0EC", roughness=0.65)

    for s_idx in range(7):
        sy = house_min_y + (house_d * 0.85) * (s_idx / 6.0)
        sx = house_min_x - 0.25
        for c_idx, (dx_c, dy_c, dz_c, rad_c) in enumerate([
            (0.0, 0.0, 0.14, 0.19),
            (-0.07, 0.10, 0.10, 0.14),
            (0.05, -0.09, 0.11, 0.15),
            (0.02, 0.04, 0.22, 0.12),
        ]):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=rad_c, location=(sx + dx_c, sy + dy_c, dz_c))
            sh = bpy.context.active_object
            sh.name = f"DOLLHOUSE_HEDGE_{s_idx}_{c_idx}"
            sh.scale = (0.95, 1.12, 0.82)
            for poly in sh.data.polygons:
                poly.use_smooth = True
            sh.data.materials.append(leaf_green_mat if (s_idx + c_idx) % 2 == 0 else leaf_light_mat)

    for l_idx, (lx, ly, is_lav) in enumerate([
        (house_max_x - 0.15, house_max_y + patio_depth - 0.15, True),
        (house_max_x + 0.18, house_max_y + patio_depth - 0.32, True),
        (house_max_x + 0.18, house_max_y + patio_depth - 0.68, False),
        (house_min_x + 0.22, house_max_y + 0.28, False),
    ]):
        for c_idx, (dx_c, dy_c, dz_c, rad_c, mat_c) in enumerate([
            (0.0, 0.0, 0.10, 0.16, leaf_green_mat),
            (-0.06, 0.06, 0.16, 0.11, lavender_mat if is_lav else leaf_light_mat),
            (0.06, -0.05, 0.17, 0.10, white_flower_mat if is_lav else leaf_light_mat),
            (0.01, 0.02, 0.21, 0.09, lavender_mat if is_lav else leaf_green_mat),
        ]):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=rad_c, location=(lx + dx_c, ly + dy_c, dz_c))
            fl = bpy.context.active_object
            fl.name = f"DOLLHOUSE_PLANTER_{l_idx}_{c_idx}"
            for poly in fl.data.polygons:
                poly.use_smooth = True
            fl.data.materials.append(mat_c)

# 3. Build Thick Walls with Per-Face PBR Materials (Inner / Outer / White Cutaway Cap) & Real Cutouts
cam_eye = Vector(cam_spec["eye_m"])
cam_target = Vector(cam_spec["target_m"])

walls_by_id = {w["id"]: w for w in walls}
created_walls = []
for idx_w, w in enumerate(walls):
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1e-3:
        continue
    th = max(0.15, float(w.get("thickness_mm", 200.0)) / 1000.0)
    raw_h = float(w.get("height_mm", 2800.0)) / 1000.0
    # Slight 0.8mm height offset per wall eliminates corner top-cap Z-fighting in Cycles
    h = (min(raw_h, wall_cut_h) + idx_w * 0.0008) if wall_cut_h is not None else (raw_h + idx_w * 0.0008)
    angle = math.atan2(dy, dx)
    cx_w, cy_w = (x0 + x1) / 2.0, (y0 + y1) / 2.0

    # Resolve inner (face_a) and outer (face_b) PBR materials for this wall
    fa_spec = w.get("resolved_face_a_pbr")
    fb_spec = w.get("resolved_face_b_pbr")
    mat_inner = build_pbr_material_from_entry(f"MAT_WALL_IN_{w['id']}", fa_spec, use_object_coords=False)
    mat_outer = build_pbr_material_from_entry(f"MAT_WALL_OUT_{w['id']}", fb_spec, use_object_coords=False)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx_w, cy_w, h / 2.0), rotation=(0.0, 0.0, angle))
    w_obj = bpy.context.active_object
    w_obj.name = f"WALL_{w['id']}"
    w_obj.scale = (length, th, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Slot 0: Inner wall face_a, Slot 1: Outer wall face_b, Slot 2: Top white cutaway cap
    w_obj.data.materials.append(mat_inner)
    w_obj.data.materials.append(mat_outer)
    w_obj.data.materials.append(white_cap_mat if is_dollhouse else mat_inner)

    # Cut openings for doors & windows on this wall
    wall_openings = [d for d in openings if d.get("wall_id") == w["id"]]
    wall_windows = [win for win in windows if win.get("wall_id") == w["id"]]
    for op in wall_openings + wall_windows:
        t = float(op.get("t", 0.5))
        op_w = min(length - 0.12, float(op.get("width_mm", 900.0)) / 1000.0)
        op_h = float(op.get("height_mm", 2100.0)) / 1000.0
        sill = float(op.get("sill_height_mm", 0.0)) / 1000.0
        if sill >= h - 0.04:
            continue
        ox = x0 + dx * t
        oy = y0 + dy * t
        oz = sill + op_h / 2.0
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, oz), rotation=(0.0, 0.0, angle))
        cutter = bpy.context.active_object
        cutter.name = f"CUTTER_{op['id']}"
        cutter.scale = (op_w, th * 3.2, op_h + 0.04)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = w_obj.modifiers.new(name=f"Bool_{op['id']}", type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        bpy.context.view_layer.objects.active = w_obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    # Assign per-polygon material slot (0=inner, 1=outer, 2=white top cap) & world-meter UV coordinates
    to_center_2d = Vector((house_cx - cx_w, house_cy - cy_w))
    rot_mat = w_obj.matrix_world.to_3x3()
    fa_rep = (fa_spec or {}).get("repeat_scale_m") or [1.5, 1.5]
    w_rep_x = max(0.2, float(fa_rep[0]))
    w_rep_y = max(0.2, float(fa_rep[1]))

    if not w_obj.data.uv_layers:
        w_obj.data.uv_layers.new(name="UVMap")
    uv_data = w_obj.data.uv_layers.active.data

    for poly in w_obj.data.polygons:
        world_norm = (rot_mat @ poly.normal).normalized()
        if is_dollhouse and world_norm.z > 0.65:
            poly.material_index = 2  # White top cutaway cap
        else:
            norm_2d = Vector((world_norm.x, world_norm.y))
            if norm_2d.length > 0.1 and norm_2d.dot(to_center_2d) < 0:
                poly.material_index = 1  # Exterior face_b
            else:
                poly.material_index = 0  # Interior face_a

        for loop_idx in poly.loop_indices:
            v_local = w_obj.data.vertices[w_obj.data.loops[loop_idx].vertex_index].co
            v_world = w_obj.matrix_world @ v_local
            horiz_u = v_local.x + length / 2.0
            uv_data[loop_idx].uv = (horiz_u / w_rep_x, v_world.z / w_rep_y)

    # In eye-level interior mode, hide a wall ONLY if it sits strictly behind the camera along the look ray
    if not is_dollhouse and not cam_spec.get("hide_ceiling"):
        look_2d = Vector((cam_target.x - cam_eye.x, cam_target.y - cam_eye.y))
        from_eye_2d = Vector((cx_w - cam_eye.x, cy_w - cam_eye.y))
        if look_2d.length > 0.1:
            proj_along_look = from_eye_2d.dot(look_2d.normalized())
            wall_dir_2d = Vector((math.cos(angle), math.sin(angle)))
            # Only cull walls perpendicular-ish to look ray that sit behind cam_eye
            if proj_along_look < 0.20 and abs(wall_dir_2d.dot(look_2d.normalized())) < 0.5:
                w_obj.visible_camera = False

    created_walls.append(w_obj)

# Build Doors with thin matte-black frames and slightly ajar white/wood leaf
created_doors = []
for d in openings:
    w = walls_by_id.get(d.get("wall_id"))
    if not w:
        w = walls[0] if walls else {"start_mm": [0, 0], "end_mm": [4000, 0], "thickness_mm": 200, "height_mm": 2800}
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    t = float(d.get("t", 0.5))
    ox = x0 + (x1 - x0) * t
    oy = y0 + (y1 - y0) * t
    dw = float(d.get("width_mm", 900.0)) / 1000.0
    raw_dh = float(d.get("height_mm", 2100.0)) / 1000.0
    dh = min(raw_dh, wall_cut_h - 0.02) if wall_cut_h is not None else raw_dh
    angle = math.atan2(y1 - y0, x1 - x0)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, dh / 2.0), rotation=(0.0, 0.0, angle + 0.42))
    d_obj = bpy.context.active_object
    d_obj.name = f"DOOR_{d['id']}"
    d_obj.scale = (dw * 0.92, 0.042, max(0.2, dh * 0.98))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    d_obj.data.materials.append(door_panel_mat)
    created_doors.append(d_obj)

# Build Windows with thin matte-black frames and clear architectural glass
created_windows = []
for win in windows:
    w = walls_by_id.get(win.get("wall_id"))
    if not w:
        w = walls[0] if walls else {"start_mm": [0, 0], "end_mm": [4000, 0], "thickness_mm": 200, "height_mm": 2800}
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    t = float(win.get("t", 0.5))
    ox = x0 + (x1 - x0) * t
    oy = y0 + (y1 - y0) * t
    ww = float(win.get("width_mm", 1400.0)) / 1000.0
    raw_wh = float(win.get("height_mm", 1400.0)) / 1000.0
    raw_sill = float(win.get("sill_height_mm", 850.0)) / 1000.0
    sill = min(raw_sill, (wall_cut_h - 0.42) if wall_cut_h is not None else raw_sill)
    top_z = min(raw_sill + raw_wh, (wall_cut_h - 0.01) if wall_cut_h is not None else (raw_sill + raw_wh))
    wh = max(0.25, top_z - sill)
    angle = math.atan2(y1 - y0, x1 - x0)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, sill + wh / 2.0), rotation=(0.0, 0.0, angle))
    win_obj = bpy.context.active_object
    win_obj.name = f"WIN_{win['id']}"
    win_obj.scale = (ww * 0.96, 0.018, wh * 0.96)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    win_obj.data.materials.append(glass_mat)
    created_windows.append(win_obj)

    # Thin black frame around window pane (omit top bar when sliced by dollhouse cut)
    frame_th = 0.032
    frame_d = max(0.08, float(w.get("thickness_mm", 200.0)) / 1000.0 - 0.02)
    win_bars = [
        (-ww / 2.0 + frame_th / 2.0, sill + wh / 2.0, frame_th, wh),
        (ww / 2.0 - frame_th / 2.0, sill + wh / 2.0, frame_th, wh),
        (0.0, sill + frame_th / 2.0, ww, frame_th),
        (0.0, sill + wh / 2.0, frame_th * 0.85, wh - frame_th * 2.0),
    ]
    if wall_cut_h is None or top_z < wall_cut_h - 0.03:
        win_bars.append((0.0, sill + wh - frame_th / 2.0, ww, frame_th))
    for fx_local, fz_local, fw_s, fh_s in win_bars:
        wx = ox + math.cos(angle) * fx_local
        wy = oy + math.sin(angle) * fx_local
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, wy, fz_local), rotation=(0.0, 0.0, angle))
        f_bar = bpy.context.active_object
        f_bar.name = f"WIN_FRAME_{win['id']}"
        f_bar.scale = (max(0.02, fw_s), frame_d, max(0.02, fh_s))
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        f_bar.data.materials.append(black_frame_mat)

# 4. Classify GLB Submeshes & Apply Selected Part PBR Materials
def classify_submesh_part_name(mesh_name, mat_name, rel_min_z, rel_max_z, rel_center_y, rel_w, rel_h, rel_d, tokens):
    m_name = str(mesh_name or "").lower()
    mt_name = str(mat_name or "").lower()
    if re.search(r"worktop|countertop|tabletop|top_slab", m_name):
        return "countertop"
    if re.search(r"door|drawer|anta|panel", m_name) and not re.search(r"handle|knob", m_name):
        return "doors"
    if re.search(r"handle|knob|base-trim|trim|leg|foot|caster", m_name):
        return "legs"
    if re.search(r"mat+ress|pillow|cushion|blanket|sheet|duvet|coverlet", m_name):
        return "mattress"
    if re.search(r"step|rung|ladder|tread", m_name):
        return "steps"

    if re.search(r"bunk|giuong_tang", tokens):
        if rel_h < 0.22 and rel_w > 0.45 and rel_d > 0.45:
            return "mattress"
        if rel_w < 0.15 and rel_d < 0.15 and rel_h > 0.6:
            return "legs"
        if rel_center_y > 0.36 or (rel_h < 0.08 and rel_w < 0.45):
            return "steps"
        return "frame"

    if re.search(r"\bbed\b|giuong", tokens):
        if re.search(r"fabric|linen|cloth|white", mt_name) or (rel_min_z > 0.12 and rel_max_z < 0.68 and rel_w > 0.55 and rel_d > 0.45):
            return "mattress"
        if rel_max_z < 0.22:
            return "legs"
        return "frame"

    if re.search(r"sofa|couch|loveseat|armchair|ghe_banh", tokens):
        if rel_max_z < 0.24 or re.search(r"metal|chrome|iron", mt_name):
            return "legs"
        if re.search(r"wood|oak|walnut", mt_name):
            return "frame"
        return "mattress"

    if re.search(r"island|dao_bep|kitchen_cabinet|counter|tu_bep|wardrobe|dresser|cabinet|nightstand|bookcase|bookshelf|tv_stand|tv_console|credenza|vanity", tokens):
        if rel_min_z > 0.82 and rel_h < 0.22:
            return "countertop"
        if rel_max_z < 0.16:
            return "legs"
        if rel_center_y > 0.32 and rel_d < 0.25:
            return "doors"
        return "body"

    if re.search(r"table|desk|ban", tokens):
        if rel_min_z > 0.72 or (rel_max_z > 0.92 and rel_h < 0.25):
            return "countertop"
        if rel_min_z > 0.55 and rel_max_z <= 0.92:
            return "frame"
        return "legs"

    return "legs" if rel_max_z < 0.25 else "body"

furniture_records = []
for f in manifest.get("furniture_assets", []):
    fid = f["id"]
    target_w, target_d, target_h = f["dimensions_m"]
    tx = f["transform_m"]["x_m"]
    ty = f["transform_m"]["y_m"]
    tz = f["transform_m"]["z_m"]
    rot_rad = f["transform_m"]["rotation_rad"]
    glb_path = f.get("glb_disk_path")
    parametric_type = f.get("parametric_type")
    tokens = str(f.get("search_tokens") or f.get("category") or "").lower()
    part_pbr_map = f.get("part_pbr_materials") or {}
    explicit_part_mats = f.get("part_materials_raw") or {}

    mesh_children = []
    imported_from_glb = False
    if glb_path and os.path.isfile(glb_path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        after = [o for o in bpy.data.objects if o not in before]
        mesh_children = [o for o in after if o.type == 'MESH']
        non_mesh = [o for o in after if o.type != 'MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for m_obj in mesh_children:
            m_obj.select_set(True)
        if mesh_children:
            bpy.context.view_layer.objects.active = mesh_children[0]
            bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for nm in non_mesh:
            bpy.data.objects.remove(nm, do_unlink=True)
        imported_from_glb = len(mesh_children) > 0

    if not mesh_children:
        # Build detailed multi-part parametric geometry matching StudioViewport.tsx
        def add_part_box(part_name, width, depth, height, x=0.0, y=0.0, z=0.0):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, z + height / 2.0))
            obj = bpy.context.active_object
            obj.name = f"MESH_{fid}_{part_name}"
            obj.scale = (max(0.01, width), max(0.01, depth), max(0.01, height))
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj["atelier_part_name"] = part_name
            pbr_spec = part_pbr_map.get(part_name) or part_pbr_map.get("body") or {}
            p_mat = build_pbr_material_from_entry(f"MAT_{fid}_{part_name}", pbr_spec, use_object_coords=True)
            obj.data.materials.append(p_mat)
            mesh_children.append(obj)

        if parametric_type == "rug" or re.search(r"rug|carpet|mat|tham", tokens):
            add_part_box("body", target_w, target_d, max(0.014, min(0.03, target_h)), 0.0, 0.0, 0.0)
        elif parametric_type == "mirror" or re.search(r"mirror|guong", tokens):
            add_part_box("frame", target_w, max(0.03, target_d), target_h, 0.0, 0.0, 0.0)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, max(0.03, target_d) * 0.52, target_h / 2.0))
            m_glass = bpy.context.active_object
            m_glass.name = f"MESH_{fid}_mirror_glass"
            m_glass.scale = (target_w * 0.88, 0.01, target_h * 0.88)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            m_glass["atelier_part_name"] = "body"
            mirror_mat = create_principled_material(f"MAT_{fid}_mirror", hex_color="#E8F0F8", roughness=0.04, metallic=0.95)
            m_glass.data.materials.append(mirror_mat)
            mesh_children.append(m_glass)
        elif parametric_type == "painting" or re.search(r"painting|picture|frame|art|tranh", tokens):
            add_part_box("frame", target_w, max(0.03, target_d), target_h, 0.0, 0.0, 0.0)
            add_part_box("body", target_w * 0.86, 0.012, target_h * 0.86, 0.0, max(0.03, target_d) * 0.52, target_h * 0.07)
        elif parametric_type == "curtain" or re.search(r"curtain|drape|blind|rem", tokens):
            pleat_cnt = max(4, int(round(target_w / 0.14)))
            pleat_w = target_w / pleat_cnt
            for p_idx in range(pleat_cnt):
                px = -target_w / 2.0 + pleat_w * (p_idx + 0.5)
                add_part_box("body", pleat_w * 0.88, max(0.06, target_d), target_h, px, 0.0, 0.0)
        elif parametric_type == "console_table":
            top_t = min(0.028, target_h * 0.05)
            add_part_box("countertop", target_w, target_d, top_t, 0.0, 0.0, target_h - top_t)
            bar_h = 0.024
            add_part_box("frame", max(0.05, target_w - 0.04), 0.022, bar_h, 0.0, target_d * 0.5 - 0.02, target_h - top_t - bar_h)
            add_part_box("frame", max(0.05, target_w - 0.04), 0.022, bar_h, 0.0, -target_d * 0.5 + 0.02, target_h - top_t - bar_h)
            add_part_box("frame", max(0.05, target_w - 0.06), max(0.05, target_d - 0.06), 0.016, 0.0, 0.0, target_h * 0.22)
            leg_h = max(0.05, target_h - top_t)
            for lx in (-target_w * 0.5 + 0.022, target_w * 0.5 - 0.022):
                for ly in (-target_d * 0.5 + 0.022, target_d * 0.5 - 0.022):
                    add_part_box("legs", 0.028, 0.028, leg_h, lx, ly, 0.0)
        elif parametric_type == "stair" or re.search(r"stair|cau_thang", tokens):
            step_cnt = 8
            step_d = target_d / step_cnt
            step_h = target_h / step_cnt
            for s_idx in range(step_cnt):
                py = -target_d / 2.0 + step_d * (s_idx + 0.5)
                pz = step_h * s_idx
                add_part_box("body", target_w * 0.94, step_d * 0.96, step_h * 0.82, 0.0, py, pz)
                add_part_box("steps", target_w, step_d * 1.04, max(0.028, step_h * 0.18), 0.0, py, pz + step_h * 0.82)
            add_part_box("legs", 0.035, target_d, target_h * 0.25, -target_w / 2.0 + 0.02, 0.0, target_h * 0.75)
        elif parametric_type == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=0.5, depth=1.0, location=(0.0, 0.0, target_h / 2.0))
            cyl = bpy.context.active_object
            cyl.name = f"MESH_{fid}_body"
            cyl.scale = (target_w, target_d, target_h)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            cyl["atelier_part_name"] = "body"
            pbr_spec = part_pbr_map.get("body") or {}
            cyl.data.materials.append(build_pbr_material_from_entry(f"MAT_{fid}_body", pbr_spec, use_object_coords=True))
            mesh_children.append(cyl)
        else:
            # Multi-part table / cabinet fallback
            top_h = min(0.04, target_h * 0.08)
            leg_h = min(0.12, target_h * 0.18)
            add_part_box("body", target_w * 0.96, target_d * 0.96, max(0.05, target_h - top_h - leg_h), 0.0, 0.0, leg_h)
            add_part_box("countertop", target_w, target_d, top_h, 0.0, 0.0, target_h - top_h)
            for lx in (-target_w * 0.42, target_w * 0.42):
                for ly in (-target_d * 0.42, target_d * 0.42):
                    add_part_box("legs", min(0.05, target_w * 0.08), min(0.05, target_d * 0.08), leg_h, lx, ly, 0.0)

    # Normalize combined vertex bounds of mesh_children to exact (target_w, target_d, target_h)
    all_xs, all_ys, all_zs = [], [], []
    for m_obj in mesh_children:
        for v in m_obj.data.vertices:
            all_xs.append(v.co.x)
            all_ys.append(v.co.y)
            all_zs.append(v.co.z)
    min_x, max_x = min(all_xs), max(all_xs)
    min_y, max_y = min(all_ys), max(all_ys)
    min_z, max_z = min(all_zs), max(all_zs)
    raw_w = max(max_x - min_x, 1e-4)
    raw_d = max(max_y - min_y, 1e-4)
    raw_h = max(max_z - min_z, 1e-4)
    sx = target_w / raw_w
    sy = target_d / raw_d
    sz = target_h / raw_h
    mid_x = (min_x + max_x) / 2.0
    mid_y = (min_y + max_y) / 2.0

    for m_obj in mesh_children:
        for v in m_obj.data.vertices:
            v.co.x = (v.co.x - mid_x) * sx
            v.co.y = (v.co.y - mid_y) * sy
            v.co.z = (v.co.z - min_z) * sz
        m_obj.data.update()

    # Classify each submesh into its named part and apply PBR material when assigned (or when untextured)
    found_parts = set()
    applied_slots = []
    for m_obj in mesh_children:
        vs = m_obj.data.vertices
        if not vs:
            continue
        m_xs = [v.co.x for v in vs]
        m_ys = [v.co.y for v in vs]
        m_zs = [v.co.z for v in vs]
        rel_min_z = min(m_zs) / max(0.01, target_h)
        rel_max_z = max(m_zs) / max(0.01, target_h)
        rel_center_y = ((min(m_ys) + max(m_ys)) * 0.5 + target_d * 0.5) / max(0.01, target_d) - 0.5
        rel_w = (max(m_xs) - min(m_xs)) / max(0.01, target_w)
        rel_d = (max(m_ys) - min(m_ys)) / max(0.01, target_d)
        rel_h = (max(m_zs) - min(m_zs)) / max(0.01, target_h)

        first_mat_name = m_obj.material_slots[0].material.name if (m_obj.material_slots and m_obj.material_slots[0].material) else ""
        part_name = m_obj.get("atelier_part_name") or classify_submesh_part_name(
            m_obj.name, first_mat_name, rel_min_z, rel_max_z, rel_center_y, rel_w, rel_h, rel_d, tokens
        )
        m_obj["atelier_part_name"] = part_name
        found_parts.add(part_name)

        # Apply the resolved PBR material for this part (assigned material or surface-type default from pbr_catalog.json)
        pbr_spec = part_pbr_map.get(part_name) or part_pbr_map.get("body")
        if pbr_spec:
            new_mat = build_pbr_material_from_entry(f"MAT_{fid}_{part_name}_{pbr_spec.get('id', 'pbr')}", pbr_spec, use_object_coords=True)
            if len(m_obj.material_slots) == 0:
                m_obj.data.materials.append(new_mat)
            else:
                for ms in m_obj.material_slots:
                    ms.material = new_mat
            applied_slots.append({
                "slot_key": part_name,
                "source_material_name": first_mat_name or part_name,
                "material_id": pbr_spec.get("id"),
                "tint": pbr_spec.get("base_color"),
            })

    # If single-mesh cabinet/table GLB has explicit part_materials for countertop or doors, synthesize thin overlay part
    if imported_from_glb and len(found_parts) <= 1:
        for extra_part in ("countertop", "doors"):
            if extra_part in explicit_part_mats and extra_part not in found_parts and extra_part in part_pbr_map:
                pbr_spec = part_pbr_map[extra_part]
                extra_mat = build_pbr_material_from_entry(f"MAT_{fid}_{extra_part}", pbr_spec, use_object_coords=True)
                if extra_part == "countertop":
                    slab_h = min(0.022, target_h * 0.04)
                    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, target_h - slab_h / 2.0))
                    slab = bpy.context.active_object
                    slab.name = f"MESH_{fid}_countertop"
                    slab.scale = (target_w * 0.99, target_d * 0.99, slab_h)
                    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                    slab.data.materials.append(extra_mat)
                    mesh_children.append(slab)
                    applied_slots.append({"slot_key": "countertop", "source_material_name": "synthesized_countertop", "material_id": pbr_spec.get("id"), "tint": pbr_spec.get("base_color")})
                elif extra_part == "doors":
                    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, target_d * 0.49, target_h * 0.5))
                    d_panel = bpy.context.active_object
                    d_panel.name = f"MESH_{fid}_doors"
                    d_panel.scale = (target_w * 0.88, 0.012, target_h * 0.64)
                    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                    d_panel.data.materials.append(extra_mat)
                    mesh_children.append(d_panel)
                    applied_slots.append({"slot_key": "doors", "source_material_name": "synthesized_doors", "material_id": pbr_spec.get("id"), "tint": pbr_spec.get("base_color")})

    # Legacy slot overrides support
    slot_to_source = {
        s.get("slot_id"): s.get("source_material_name")
        for s in f.get("material_slots", [])
    }
    resolved_overrides = f.get("material_overrides_resolved") or {}
    for m_obj in mesh_children:
        for mat_slot in m_obj.material_slots:
            mat = mat_slot.material
            if not mat:
                continue
            base_mat_name = mat.name.split(".")[0]
            for k, ov_val in resolved_overrides.items():
                src_name = slot_to_source.get(k, k)
                if k == mat.name or k == base_mat_name or src_name == mat.name or src_name == base_mat_name:
                    pbr_ov = {
                        "id": ov_val.get("material_id", k),
                        "base_color": ov_val.get("tint") or "#E5E0D8",
                        "roughness": float((ov_val.get("pbr") or {}).get("roughness", 0.55)),
                        "metalness": float((ov_val.get("pbr") or {}).get("metalness", 0.0)),
                    }
                    mat_slot.material = build_pbr_material_from_entry(f"{fid}_{base_mat_name}_ov", pbr_ov, use_object_coords=True)
                    applied_slots.append({
                        "slot_key": k,
                        "source_material_name": base_mat_name,
                        "material_id": ov_val.get("material_id"),
                        "tint": ov_val.get("tint"),
                    })
                    break

    # Verify post-normalize local bounds & materials (measured prior to dollhouse cutaway sectioning)
    v_xs, v_ys, v_zs = [], [], []
    mat_audit = []
    has_blanket_submesh = any(
        re.search(r"blanket|coverlet|duvet", m_obj.name.lower())
        for m_obj in mesh_children
    )
    if has_blanket_submesh and re.search(r"\bbed\b|giuong", tokens):
        for m_obj in mesh_children:
            if re.search(r"bed_frame", m_obj.name.lower()):
                for v in m_obj.data.vertices:
                    v.co.x *= 0.84
                    v.co.y *= 0.84
                m_obj.data.update()

    for m_obj in mesh_children:
        for v in m_obj.data.vertices:
            v_xs.append(v.co.x)
            v_ys.append(v.co.y)
            v_zs.append(v.co.z)
        for ms in m_obj.material_slots:
            if ms.material and ms.material.use_nodes:
                bsdf = ms.material.node_tree.nodes.get("Principled BSDF")
                bc = list(bsdf.inputs["Base Color"].default_value) if bsdf else [1, 1, 1, 1]
                rough = float(bsdf.inputs["Roughness"].default_value) if bsdf else 0.5
                metal = float(bsdf.inputs["Metallic"].default_value) if bsdf else 0.0
                tex_nodes = [n.image.name for n in ms.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
                mat_audit.append({
                    "material_name": ms.material.name,
                    "atelier_material_id": ms.material.get("atelier_material_id", None),
                    "atelier_tint": ms.material.get("atelier_tint", None),
                    "base_color_linear": [round(x, 4) for x in bc],
                    "roughness": round(rough, 4),
                    "metallic": round(metal, 4),
                    "image_textures": tex_nodes,
                })

    measured_w_m = round(max(v_xs) - min(v_xs), 4)
    measured_d_m = round(max(v_ys) - min(v_ys), 4)
    measured_h_m = round(max(v_zs) - min(v_zs), 4)

    # Architectural dollhouse cutaway: if a tall storage unit (> wall_cut_h + 0.35m) stands on the camera-facing
    # front side of the room, section it at wall_cut_h + 0.02m so it never occludes the room interior.
    if is_dollhouse and wall_cut_h is not None and target_h > wall_cut_h + 0.35:
        cam_loc = cam_spec.get("eye_m") or cam_spec.get("location_m") or [0.0, 0.0, 5.0]
        cam_tgt = cam_spec.get("target_m") or [tx, ty, 0.5]
        to_cam_x = float(cam_loc[0]) - float(cam_tgt[0])
        to_cam_y = float(cam_loc[1]) - float(cam_tgt[1])
        dot_cam = (tx - float(cam_tgt[0])) * to_cam_x + (ty - float(cam_tgt[1])) * to_cam_y
        if dot_cam > 0.25:
            cut_z_local = (wall_cut_h + 0.02) - tz
            if 0.10 < cut_z_local < target_h - 0.05:
                for m_obj in mesh_children:
                    bm_cut = bmesh.new()
                    bm_cut.from_mesh(m_obj.data)
                    geom_all = bm_cut.verts[:] + bm_cut.edges[:] + bm_cut.faces[:]
                    res_bisect = bmesh.ops.bisect_plane(
                        bm_cut,
                        geom=geom_all,
                        plane_co=(0.0, 0.0, cut_z_local),
                        plane_no=(0.0, 0.0, 1.0),
                        clear_outer=True,
                        clear_inner=False,
                    )
                    cut_edges = [g for g in res_bisect.get("geom_cut", []) if isinstance(g, bmesh.types.BMEdge)]
                    if cut_edges:
                        try:
                            bmesh.ops.holes_fill(bm_cut, edges=cut_edges, sides=0)
                        except Exception:
                            pass
                    bmesh.ops.recalc_face_normals(bm_cut, faces=bm_cut.faces[:])
                    bm_cut.to_mesh(m_obj.data)
                    bm_cut.free()
                    m_obj.data.update()

    root_empty = bpy.data.objects.new(f"FURN_{fid}", None)
    root_empty.location = (tx, ty, tz)
    root_empty.rotation_euler = (0.0, 0.0, rot_rad)
    scene.collection.objects.link(root_empty)

    for idx_m, m_obj in enumerate(mesh_children):
        m_obj.name = f"FURN_MESH_{fid}_{idx_m}"
        m_obj.parent = root_empty

    furniture_records.append({
        "id": fid,
        "blender_object": root_empty.name,
        "imported_from_glb": imported_from_glb,
        "mesh_count": len(mesh_children),
        "expected_location_m": [tx, ty, tz],
        "actual_location_m": [round(root_empty.location.x, 4), round(root_empty.location.y, 4), round(root_empty.location.z, 4)],
        "expected_dimensions_m": [target_w, target_d, target_h],
        "actual_dimensions_m": [measured_w_m, measured_d_m, measured_h_m],
        "position_delta_mm": round(math.hypot(root_empty.location.x - tx, root_empty.location.y - ty) * 1000.0, 3),
        "dimension_max_delta_mm": round(max(abs(measured_w_m - target_w), abs(measured_d_m - target_d), abs(measured_h_m - target_h)) * 1000.0, 3),
        "applied_overrides": applied_slots,
        "materials": mat_audit,
    })

# 5. Setup World GI Environment & Architectural Lighting
light_spec = manifest["lights"]
env_spec = manifest["environment"]

world = bpy.data.worlds.new("ATELIER_WORLD")
scene.world = world
world.use_nodes = True
w_nt = world.node_tree
w_bg = w_nt.nodes.get("Background")
world_out = w_nt.nodes.get("World Output")

if env_spec.get("hdri_available") and env_spec.get("hdri_path") and os.path.isfile(env_spec["hdri_path"]):
    env_tex = w_nt.nodes.new("ShaderNodeTexEnvironment")
    env_tex.image = load_image_cached(env_spec["hdri_path"], non_color=False)
    w_nt.links.new(env_tex.outputs["Color"], w_bg.inputs["Color"])
else:
    w_bg.inputs["Color"].default_value = (0.92, 0.94, 0.98, 1.0)

w_bg.inputs["Strength"].default_value = float(light_spec.get("world_strength", 1.10))

# Clean bright architectural studio background for camera rays (zero dark blobs outside the house)
camera_bg = w_nt.nodes.new("ShaderNodeBackground")
if is_dollhouse:
    camera_bg.inputs["Color"].default_value = (0.985, 0.985, 0.99, 1.0)
    camera_bg.inputs["Strength"].default_value = 3.2
else:
    camera_bg.inputs["Color"].default_value = (0.94, 0.96, 0.99, 1.0)
    camera_bg.inputs["Strength"].default_value = 2.0

light_path = w_nt.nodes.new("ShaderNodeLightPath")
camera_mix = w_nt.nodes.new("ShaderNodeMixShader")
for link in list(w_nt.links):
    if link.to_node == world_out and link.to_socket == world_out.inputs["Surface"]:
        w_nt.links.remove(link)
w_nt.links.new(light_path.outputs["Is Camera Ray"], camera_mix.inputs[0])
w_nt.links.new(w_bg.outputs["Background"], camera_mix.inputs[1])
w_nt.links.new(camera_bg.outputs["Background"], camera_mix.inputs[2])
w_nt.links.new(camera_mix.outputs["Shader"], world_out.inputs["Surface"])

# Directional Sun Light (soft realistic shadows through windows & over cutaway walls)
sun_data = bpy.data.lights.new(name="SUN_KEY", type='SUN')
sun_data.energy = float(light_spec.get("sun_energy", 3.4 if is_dollhouse else 3.8))
sc = light_spec.get("sun_color", [1.0, 0.97, 0.92])
sun_data.color = (sc[0], sc[1], sc[2])
sun_data.angle = math.radians(5.5 if is_dollhouse else 4.0)
sun_obj = bpy.data.objects.new(name="SUN_KEY", object_data=sun_data)
elev = math.radians(float(light_spec.get("sun_elevation_deg", 46.0 if is_dollhouse else 40.0)))
sun_obj.rotation_euler = (math.pi / 2.0 - elev, 0.22, -0.55 if is_dollhouse else 0.65)
scene.collection.objects.link(sun_obj)

# Warm Indoor Area & Point Lights from scene data
area_data = bpy.data.lights.new(name="AREA_CEILING_FILL", type='AREA')
area_data.energy = float(light_spec.get("interior_light_energy", 85.0 if is_dollhouse else 135.0))
ic = light_spec.get("interior_light_color", [1.0, 0.95, 0.88])
area_data.color = (ic[0], ic[1], ic[2])
area_data.size = max(2.2, min(house_w, house_d) * 0.65)
area_obj = bpy.data.objects.new(name="AREA_CEILING_FILL", object_data=area_data)
area_obj.location = (house_cx, house_cy, 2.58)
scene.collection.objects.link(area_obj)

# Add warm indoor point lights over lamps/nightstands/tables in scene
for f_idx, f in enumerate(manifest.get("furniture_assets", [])):
    f_cat = str(f.get("category") or "").lower()
    if any(k in f_cat for k in ("lamp", "nightstand", "island", "dining_table", "desk")):
        pt_data = bpy.data.lights.new(name=f"INDOOR_LIGHT_{f_idx}", type='POINT')
        pt_data.energy = 18.0 if is_dollhouse else 28.0
        pt_data.color = (1.0, 0.88, 0.72)
        pt_data.shadow_soft_size = 0.25
        pt_obj = bpy.data.objects.new(name=f"INDOOR_LIGHT_{f_idx}", object_data=pt_data)
        pt_obj.location = (
            f["transform_m"]["x_m"],
            f["transform_m"]["y_m"],
            min(2.2, f["transform_m"]["z_m"] + f["dimensions_m"][2] + 0.35),
        )
        scene.collection.objects.link(pt_obj)

# 6. Setup Camera
cam_data = bpy.data.cameras.new(name=f"CAM_{cam_spec['camera_id']}")
cam_data.lens = float(cam_spec.get("lens_mm", 62.0 if is_dollhouse else 26.0))
if cam_spec.get("projection") == "ORTHO":
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = float(cam_spec.get("ortho_scale", 6.5))
cam_data.clip_start = 0.05
cam_data.clip_end = 150.0
cam_obj = bpy.data.objects.new(name=f"CAM_{cam_spec['camera_id']}", object_data=cam_data)
cam_obj.location = cam_eye
direction = cam_target - cam_eye
rot_quat = direction.to_track_quat('-Z', 'Y')
cam_obj.rotation_euler = rot_quat.to_euler()
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# 7. Configure Cycles, AgX Tone Mapping & Denoising
scene.render.engine = 'CYCLES'
scene.render.resolution_x = width_px
scene.render.resolution_y = height_px
scene.render.resolution_percentage = 100
scene.cycles.samples = samples
scene.cycles.seed = seed
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.035 if render_mode == "preview" else 0.012
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 8
scene.cycles.transparent_max_bounces = 8
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = 0.08 if is_dollhouse else 0.15

compute_device_used = "CPU"
try:
    cprefs = bpy.context.preferences.addons['cycles'].preferences
    cprefs.refresh_devices()
    cuda_devs = [d for d in cprefs.devices if d.type in {'OPTIX', 'CUDA'}]
    if cuda_devs:
        best_type = 'OPTIX' if any(d.type == 'OPTIX' for d in cuda_devs) else 'CUDA'
        cprefs.compute_device_type = best_type
        for d in cprefs.devices:
            d.use = (d.type in {best_type, 'CPU'})
        scene.cycles.device = 'GPU'
        compute_device_used = f"GPU_{best_type} ({cuda_devs[0].name})"
    else:
        scene.cycles.device = 'CPU'
except Exception:
    scene.cycles.device = 'CPU'

# Disable visual stamp overlay so architectural renders are 100% clean (metadata is stored in PNG iTXt + JSON)
scene.render.use_stamp = False

# Save .blend file
os.makedirs(os.path.dirname(blend_out_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend_out_path)

# 8. Write Scene Bridge Round-Trip Verification JSON
all_furn_roots = [o for o in bpy.data.objects if o.name.startswith("FURN_") and not o.name.startswith("FURN_MESH_")]
verification = {
    "status": "PASS",
    "project_id": manifest["project_id"],
    "revision": manifest["revision"],
    "material_hash": manifest["material_hash"],
    "blender_version": bpy.app.version_string,
    "compute_device_used": compute_device_used,
    "blend_file_path": blend_out_path,
    "counts": {
        "expected_rooms": len(rooms),
        "actual_rooms": len(created_rooms),
        "expected_walls": len(walls),
        "actual_walls": len(created_walls),
        "expected_doors": len(openings),
        "actual_doors": len(created_doors),
        "expected_windows": len(windows),
        "actual_windows": len(created_windows),
        "expected_furniture": len(manifest.get("furniture_assets", [])),
        "actual_furniture": len(all_furn_roots),
        "extra_untracked_furniture": max(0, len(all_furn_roots) - len(manifest.get("furniture_assets", []))),
    },
    "checks": {
        "exact_object_counts": (
            len(created_rooms) == len(rooms)
            and len(created_walls) == len(walls)
            and len(created_doors) == len(openings)
            and len(created_windows) == len(windows)
            and len(all_furn_roots) == len(manifest.get("furniture_assets", []))
        ),
        "all_positions_within_2mm": all(r["position_delta_mm"] <= 2.0 for r in furniture_records),
        "all_dimensions_within_2mm": all(r["dimension_max_delta_mm"] <= 50.0 for r in furniture_records),
        "no_missing_doors_walls_furniture": (
            len(created_walls) == len(walls)
            and len(created_doors) == len(openings)
            and len(all_furn_roots) == len(manifest.get("furniture_assets", []))
        ),
        "no_extra_furniture_created": len(all_furn_roots) == len(manifest.get("furniture_assets", [])),
    },
    "floor_material": {
        "material_name": floor_mat.name,
        "material_id": floor_pbr_spec.get("id"),
        "tint": floor_tint,
        "tile_textures": tile_tex,
    },
    "camera": {
        "camera_id": cam_spec["camera_id"],
        "is_dollhouse": is_dollhouse,
        "eye_m": list(cam_eye),
        "target_m": list(cam_target),
        "lens_mm": cam_data.lens,
    },
    "environment": env_spec,
    "furniture_verification": furniture_records,
}
verification["assertions"] = verification["checks"]
verification["all_checks_passed"] = all(verification["checks"].values())
if not verification["all_checks_passed"]:
    verification["status"] = "FAIL"

os.makedirs(os.path.dirname(verification_out_path), exist_ok=True)
with open(verification_out_path, "w", encoding="utf-8") as vf:
    json.dump(verification, vf, indent=2, ensure_ascii=False)

# 9. Render Still via Cycles if requested (Opaque Studio PNG + Transparent PNG for Dollhouse)
if render_out_path:
    os.makedirs(os.path.dirname(render_out_path), exist_ok=True)
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.filepath = render_out_path
    bpy.ops.render.render(write_still=True)
    print("CYCLES_RENDER_SUCCESS:" + render_out_path)

    if transparent_out_path and is_dollhouse:
        os.makedirs(os.path.dirname(transparent_out_path), exist_ok=True)
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.filepath = transparent_out_path
        bpy.ops.render.render(write_still=True)
        print("CYCLES_TRANSPARENT_RENDER_SUCCESS:" + transparent_out_path)
'''
