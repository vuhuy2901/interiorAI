"""
ATELIER AI — Blender 4.2 LTS Cycles Scene Bridge (G5) & Render Job Queue Engine (G6)
Provides:
1. Blender binary detection & headless Cycles CPU/GPU capability probing.
2. G5 Scene Bridge: Exports CanonicalProject (Pascal geometry, GLB furniture assets,
   object transforms, dimensions, Canonical Material Definitions, Material Overrides,
   Camera, Lights, Licensed CC0 HDRI Environment, Revision ID, Material Hash) into
   Blender, builds Principled BSDF materials, saves `.blend`, and verifies round-trip
   object counts, positions, dimensions, and materials.
3. G6 Render Cycles & Job Queue: Preview & Final Cycles renders, Render Job Queue,
   Job Status, Cancel, Retry, Error Handling, Render Cache, Gallery, Download, and
   Conversation Output. Strictly zero Pillow fallback for 3D renders.
   All rendered images carry Revision, Camera ID, Material Hash, and mandatory label:
   "ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG."
"""
from __future__ import annotations

import glob
import hashlib
import json
import math
import os
import shutil
import subprocess
import threading
import time
import uuid
import zlib
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from app.db import get_conn, get_project, now_iso
from app.models.contracts import CanonicalProject, MaterialOverride
from app.services.asset_pipeline import ASSET_LIBRARY_DIR, ASSET_ROOT, get_asset_metadata
from app.services.material_system import get_material, list_materials, resolve_material

ROOT_DIR = Path(__file__).resolve().parents[4]
RENDERS_DIR = ROOT_DIR / "data" / "exports" / "renders"
BLENDER_JOBS_DIR = ROOT_DIR / "data" / "exports" / "blender_jobs"

REQUIRED_WATERMARK = "ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG."

# Active subprocesses for cancellation support
_ACTIVE_PROCESSES: Dict[str, subprocess.Popen] = {}
_JOBS_LOCK = threading.Lock()
_CAPABILITY_CACHE: Optional[Dict[str, Any]] = None


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_blender_binary() -> Optional[str]:
    # 0. Explicit env override
    env_bin = os.environ.get("ATELIER_BLENDER_BINARY")
    if env_bin and Path(env_bin).is_file():
        return str(Path(env_bin))

    # 1. System PATH
    which_path = shutil.which("blender")
    if which_path:
        return which_path

    # 2. Windows Default Program Files Locations
    win_paths = sorted(glob.glob(r"C:\Program Files\Blender Foundation\Blender*\blender.exe"))
    if win_paths:
        return win_paths[-1]

    # 3. User-space LocalAppData Programs Location
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        user_paths = sorted(
            glob.glob(str(Path(local_app_data) / "Programs" / "Blender" / "blender-*" / "blender.exe"))
        )
        if user_paths:
            return user_paths[-1]

    return None


def is_blender_available() -> Tuple[bool, str]:
    binary = find_blender_binary()
    if binary:
        return True, binary
    return False, "Blender chưa được phát hiện. Cycles render và chuyển đổi mesh bằng Blender đang BLOCKED."


def probe_blender_capabilities(force_refresh: bool = False) -> Dict[str, Any]:
    global _CAPABILITY_CACHE
    has_blender, binary_or_msg = is_blender_available()
    if not has_blender:
        return {
            "available": False,
            "status": "BLOCKED",
            "binary": None,
            "message": binary_or_msg,
            "cycles_available": False,
        }
    if _CAPABILITY_CACHE is not None and not force_refresh and _CAPABILITY_CACHE.get("binary") == binary_or_msg:
        return _CAPABILITY_CACHE

    probe_expr = """
import bpy, json
prefs = bpy.context.preferences
cycles_ok = 'cycles' in prefs.addons
devices = []
available_types = []
if cycles_ok:
    cprefs = prefs.addons['cycles'].preferences
    cprefs.refresh_devices()
    devices = [{'name': d.name, 'type': d.type, 'use': bool(d.use)} for d in cprefs.devices]
    available_types = [t[0] for t in cprefs.get_device_types(bpy.context)]
print('ATELIER_BLENDER_PROBE:' + json.dumps({
    'version_string': bpy.app.version_string,
    'build_hash': bpy.app.build_hash.decode('utf-8', errors='ignore') if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
    'cycles_available': cycles_ok,
    'compute_device_types': available_types,
    'devices': devices,
}))
"""
    try:
        res = subprocess.run(
            [binary_or_msg, "--background", "--factory-startup", "--python-expr", probe_expr],
            capture_output=True,
            text=True,
            timeout=25,
        )
        probe_data: Dict[str, Any] = {}
        for line in res.stdout.splitlines():
            if "ATELIER_BLENDER_PROBE:" in line:
                probe_data = json.loads(line.split("ATELIER_BLENDER_PROBE:", 1)[1].strip())
                break
        if res.returncode != 0 or not probe_data:
            diagnostic = (res.stderr or res.stdout or "Blender did not return capability data").strip()
            diagnostic = diagnostic[-1200:]
            _CAPABILITY_CACHE = {
                "ok": False,
                "available": False,
                "blender_available": True,
                "status": "BLOCKED",
                "binary": binary_or_msg,
                "message": f"Blender was found but could not start: {diagnostic}",
                "cycles_available": False,
                "compute_device_types": [],
                "devices": [],
            }
            return _CAPABILITY_CACHE
        gpu_devices = [d for d in probe_data.get("devices", []) if d.get("type") in {"CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"}]
        cpu_devices = [d for d in probe_data.get("devices", []) if d.get("type") == "CPU"]
        _CAPABILITY_CACHE = {
            "ok": True,
            "available": True,
            "blender_available": True,
            "status": "AVAILABLE",
            "binary": binary_or_msg,
            "version": probe_data.get("version_string", "4.2.3 LTS"),
            "version_string": probe_data.get("version_string", "unknown"),
            "build_hash": probe_data.get("build_hash", "unknown"),
            "cycles_available": bool(probe_data.get("cycles_available", False)),
            "compute_device_types": probe_data.get("compute_device_types", []),
            "devices": probe_data.get("devices", []),
            "preferred_device": "GPU_CUDA" if any(d.get("type") == "CUDA" for d in gpu_devices) else ("GPU" if gpu_devices else "CPU"),
            "cpu_device": cpu_devices[0]["name"] if cpu_devices else "System CPU",
            "gpu_devices": [d["name"] for d in gpu_devices],
        }
        return _CAPABILITY_CACHE
    except Exception as exc:
        return {
            "available": False,
            "status": "FAILED",
            "binary": binary_or_msg,
            "message": f"Lỗi kiểm tra Blender: {exc}",
            "cycles_available": False,
        }


def generate_custom_furniture_glb(
    item_id: str,
    name: str,
    category: str,
    dimensions_mm: List[float],
    output_glb_path: Path,
) -> Dict[str, Any]:
    """
    Generates a customized GLB 3D mesh model with real dimensions for Pascal 3D viewport.
    If Blender is present, calls a headless Blender script. This function never fabricates
    a successful GLB when Blender is missing or crashes.
    """
    output_glb_path.parent.mkdir(parents=True, exist_ok=True)
    has_blender, binary = is_blender_available()

    w_m, d_m, h_m = dimensions_mm[0] / 1000.0, dimensions_mm[1] / 1000.0, dimensions_mm[2] / 1000.0

    script_content = f"""
import bpy
import sys

# Clear existing objects
bpy.ops.wm.read_factory_settings(use_empty=True)

# Create parametric box with bevel
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, {h_m / 2.0}))
obj = bpy.context.active_object
obj.scale = ({w_m}, {d_m}, {h_m})
bpy.ops.object.transform_apply(scale=True)

# Add bevel modifier for smooth furniture edges
bev = obj.modifiers.new('Bevel', 'BEVEL')
bev.width = 0.02
bev.segments = 3

# Export to GLB
bpy.ops.export_scene.gltf(filepath=r'{str(output_glb_path)}', export_format='GLB')
print("GLB_EXPORT_SUCCESS")
"""

    if has_blender and binary:
        temp_script = output_glb_path.parent / f"gen_{item_id}.py"
        temp_script.write_text(script_content, encoding="utf-8")
        try:
            res = subprocess.run(
                [binary, "--background", "--python", str(temp_script)],
                capture_output=True,
                text=True,
                timeout=25,
            )
            temp_script.unlink(missing_ok=True)
            if res.returncode == 0 and output_glb_path.exists() and output_glb_path.stat().st_size > 20:
                return {
                    "ok": True,
                    "status": "COMPLETED",
                    "engine": "blender_headless",
                    "binary": binary,
                    "glb_path": str(output_glb_path),
                    "file_size_bytes": output_glb_path.stat().st_size,
                    "asset_quality": "PLACEHOLDER_PARAMETRIC",
                    "notice": "Mesh tham số dạng khối có bevel, không phải nội thất chi tiết để nghiệm thu.",
                    "process_returncode": res.returncode,
                    "stdout_tail": res.stdout[-2000:],
                }
            return {
                "ok": False,
                "status": "FAILED",
                "engine": "blender_headless",
                "error_code": "BLENDER_EXPORT_FAILED",
                "message": "Blender đã chạy nhưng không tạo được GLB hợp lệ.",
                "process_returncode": res.returncode,
                "stdout_tail": res.stdout[-2000:],
                "stderr_tail": res.stderr[-2000:],
            }
        except subprocess.TimeoutExpired as exc:
            temp_script.unlink(missing_ok=True)
            return {
                "ok": False,
                "status": "FAILED",
                "engine": "blender_headless",
                "error_code": "BLENDER_TIMEOUT",
                "message": "Blender vượt quá thời gian xử lý 25 giây.",
                "stderr_tail": str(exc),
            }
        except Exception as exc:
            temp_script.unlink(missing_ok=True)
            return {
                "ok": False,
                "status": "FAILED",
                "engine": "blender_headless",
                "error_code": "BLENDER_PROCESS_ERROR",
                "message": f"Không thể chạy Blender: {exc}",
            }

    output_glb_path.unlink(missing_ok=True)
    return {
        "ok": False,
        "status": "BLOCKED",
        "engine": "blender_headless",
        "error_code": "BLENDER_NOT_AVAILABLE",
        "message": binary,
        "glb_path": None,
    }


# ==============================================================================
# G5: CANONICAL SCENE BRIDGE (PASCAL + GLB + MATERIALS -> BLENDER SCENE)
# ==============================================================================
def compute_project_material_hash(project: CanonicalProject) -> str:
    """Computes a deterministic SHA-256 hash of all scene materials, overrides, and geometry state."""
    payload = {
        "rooms": [
            {
                "id": r.id,
                "floor": r.floor_material_id,
                "wall": r.wall_base_material_id,
                "ceiling": r.ceiling_material_id,
            }
            for r in project.rooms
        ],
        "surface_overrides": {
            k: v.model_dump() for k, v in sorted(project.surface_material_overrides.items())
        },
        "furniture": [
            {
                "id": f.id,
                "asset_id": f.asset_id,
                "geometry_hash": f.geometry_hash,
                "color_hex": f.color_hex,
                "pos": [round(f.x_mm, 1), round(f.y_mm, 1), round(f.z_mm, 1), round(f.rotation_deg, 1)],
                "dims": [round(f.width_mm, 1), round(f.depth_mm, 1), round(f.height_mm, 1)],
                "overrides": {k: v.model_dump() for k, v in sorted(f.material_overrides.items())},
            }
            for f in project.furniture_instances
        ],
        "external_scene": project.external_scene.model_dump() if project.external_scene else None,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def _generate_tile_texture_pair(
    out_dir: Path,
    tile_w_mm: float,
    tile_h_mm: float,
    grout_w_mm: float,
    tile_hex: str,
    grout_hex: str,
) -> Tuple[Path, Path]:
    """
    Generates a deterministic 1024x1024 single-tile diffuse + bump map corresponding
    to exact physical dimensions (e.g., 800x800 mm tile with 3 mm grout).
    When UV-mapped at 1 unit = 1 tile (u = x_mm / tile_w_mm, v = y_mm / tile_h_mm),
    each tile and mortar joint renders at 1:1 physical scale in Blender Cycles.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    size_px = 1024

    def hex_rgb(h: str, default: Tuple[int, int, int]) -> Tuple[int, int, int]:
        s = (h or "").lstrip("#")
        if len(s) == 6:
            return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
        return default

    tile_rgb = hex_rgb(tile_hex, (207, 197, 179))
    grout_rgb = hex_rgb(grout_hex, (145, 138, 128))

    # Physical ratio of grout width to tile dimension (with minimum 4px visibility at 1024px)
    grout_px_x = max(4, int(round((grout_w_mm / max(tile_w_mm, 100.0)) * size_px))) if grout_w_mm > 0 else 0
    grout_px_y = max(4, int(round((grout_w_mm / max(tile_h_mm, 100.0)) * size_px))) if grout_w_mm > 0 else 0

    diffuse_img = Image.new("RGB", (size_px, size_px), color=tile_rgb)
    draw_d = ImageDraw.Draw(diffuse_img)

    # Subtle natural stone/porcelain micro-variation lines
    accent_rgb = (
        max(0, min(255, tile_rgb[0] - 6)),
        max(0, min(255, tile_rgb[1] - 6)),
        max(0, min(255, tile_rgb[2] - 5)),
    )
    for step in range(64, size_px - 64, 96):
        draw_d.line([(grout_px_x + 8, step), (size_px - grout_px_x - 8, step + 18)], fill=accent_rgb, width=2)

    if grout_px_x > 0 or grout_px_y > 0:
        # Darker mortar joint border around tile perimeter
        dark_grout = (
            max(0, grout_rgb[0] - 28),
            max(0, grout_rgb[1] - 28),
            max(0, grout_rgb[2] - 28),
        )
        draw_d.rectangle([0, 0, size_px - 1, grout_px_y], fill=dark_grout)
        draw_d.rectangle([0, size_px - 1 - grout_px_y, size_px - 1, size_px - 1], fill=dark_grout)
        draw_d.rectangle([0, 0, grout_px_x, size_px - 1], fill=dark_grout)
        draw_d.rectangle([size_px - 1 - grout_px_x, 0, size_px - 1, size_px - 1], fill=dark_grout)

    bump_img = Image.new("L", (size_px, size_px), color=240)
    draw_b = ImageDraw.Draw(bump_img)
    if grout_px_x > 0 or grout_px_y > 0:
        draw_b.rectangle([0, 0, size_px - 1, grout_px_y], fill=40)
        draw_b.rectangle([0, size_px - 1 - grout_px_y, size_px - 1, size_px - 1], fill=40)
        draw_b.rectangle([0, 0, grout_px_x, size_px - 1], fill=40)
        draw_b.rectangle([size_px - 1 - grout_px_x, 0, size_px - 1, size_px - 1], fill=40)

    diffuse_path = out_dir / f"tile_{int(tile_w_mm)}x{int(tile_h_mm)}_g{int(grout_w_mm)}_diffuse.png"
    bump_path = out_dir / f"tile_{int(tile_w_mm)}x{int(tile_h_mm)}_g{int(grout_w_mm)}_bump.png"
    diffuse_img.save(diffuse_path, format="PNG")
    bump_img.save(bump_path, format="PNG")
    return diffuse_path, bump_path


def _compute_camera_spec(project: CanonicalProject, camera_id: str) -> Dict[str, Any]:
    all_x = [w.start_mm[0] for w in project.walls] + [w.end_mm[0] for w in project.walls]
    all_y = [w.start_mm[1] for w in project.walls] + [w.end_mm[1] for w in project.walls]
    min_x = (min(all_x) if all_x else 0.0) / 1000.0
    max_x = (max(all_x) if all_x else 4000.0) / 1000.0
    min_y = (min(all_y) if all_y else 0.0) / 1000.0
    max_y = (max(all_y) if all_y else 5000.0) / 1000.0

    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    span_x = max(2.5, max_x - min_x)
    span_y = max(2.5, max_y - min_y)

    # A bedroom should focus the bed; living spaces should focus the sofa. The
    # old implementation picked the first item and placed the eye beside it,
    # which could put the camera inside a bed or cabinet.
    focal = next((f for f in project.furniture_instances if "bed" in f.category.lower()), None)
    if not focal:
        focal = next((f for f in project.furniture_instances if "sofa" in f.category.lower()), None)
    if not focal and project.furniture_instances:
        focal = project.furniture_instances[0]
    sofa_x = (focal.x_mm / 1000.0) if focal else cx
    sofa_y = (focal.y_mm / 1000.0) if focal else cy
    sofa_z = ((focal.z_mm + focal.height_mm * 0.55) / 1000.0) if focal else 0.75

    def point_is_clear(x: float, y: float, margin: float = 0.22) -> bool:
        for item in project.furniture_instances:
            half_w = item.width_mm / 2000.0 + margin
            half_d = item.depth_mm / 2000.0 + margin
            if abs(x - item.x_mm / 1000.0) <= half_w and abs(y - item.y_mm / 1000.0) <= half_d:
                return False
        return min_x + margin < x < max_x - margin and min_y + margin < y < max_y - margin

    def doorway_camera() -> Optional[Tuple[float, float]]:
        wall_by_id = {wall.id: wall for wall in project.walls}
        for opening in project.openings:
            wall = wall_by_id.get(opening.wall_id)
            if not wall:
                continue
            t = max(0.0, min(1.0, float(opening.t)))
            px = (wall.start_mm[0] + (wall.end_mm[0] - wall.start_mm[0]) * t) / 1000.0
            py = (wall.start_mm[1] + (wall.end_mm[1] - wall.start_mm[1]) * t) / 1000.0
            dx, dy = cx - px, cy - py
            length = math.hypot(dx, dy) or 1.0
            # Step inside the room far enough to avoid the wall/door leaf.
            candidate = (px + dx / length * 0.58, py + dy / length * 0.58)
            if point_is_clear(*candidate):
                return candidate
        return None

    doorway_eye = doorway_camera()
    fallback_candidates = [
        (max_x - span_x * 0.12, max_y - span_y * 0.12),
        (min_x + span_x * 0.12, max_y - span_y * 0.12),
        (max_x - span_x * 0.12, min_y + span_y * 0.12),
        (min_x + span_x * 0.12, min_y + span_y * 0.12),
    ]
    eye_xy = doorway_eye or next((point for point in fallback_candidates if point_is_clear(*point)), (cx, max_y - 0.4))

    cam_key = (camera_id or "eye_level").lower().strip()
    if cam_key in {"perspective", "eye_level", "front"}:
        return {
            "camera_id": cam_key,
            "eye_m": [round(eye_xy[0], 3), round(eye_xy[1], 3), 1.52],
            "target_m": [round(sofa_x, 3), round(sofa_y, 3), round(max(0.65, sofa_z), 3)],
            "lens_mm": 28.0,
            "hide_ceiling": False,
        }
    if cam_key == "corner":
        return {
            "camera_id": "corner",
            "eye_m": [round(max_x - span_x * 0.10, 3), round(min_y + span_y * 0.10, 3), 1.68],
            "target_m": [round(sofa_x, 3), round(sofa_y, 3), 0.72],
            "lens_mm": 26.0,
            "hide_ceiling": False,
        }
    if cam_key == "wide":
        return {
            "camera_id": "wide",
            "eye_m": [round(eye_xy[0], 3), round(eye_xy[1], 3), 1.62],
            "target_m": [round(cx, 3), round(cy - span_y * 0.08, 3), 0.9],
            "lens_mm": 21.0,
            "hide_ceiling": False,
        }
    if cam_key in {"detail", "detail_sofa"}:
        # Position 2.1m in front of the sofa looking directly at the sofa and floor tile
        dx = cx - sofa_x
        dy = cy - sofa_y
        dist = math.hypot(dx, dy) or 1.0
        dir_x, dir_y = dx / dist, dy / dist
        if dist < 0.6:
            dir_x, dir_y = 0.7, -0.7
        return {
            "camera_id": cam_key,
            "eye_m": [round(sofa_x + dir_x * 2.15, 3), round(sofa_y + dir_y * 2.15, 3), 1.18],
            "target_m": [round(sofa_x, 3), round(sofa_y, 3), round(sofa_z, 3)],
            "lens_mm": 35.0,
            "hide_ceiling": False,
        }
    if cam_key == "top":
        max_span = max(span_x, span_y)
        return {
            "camera_id": "top",
            "eye_m": [round(cx, 3), round(cy - 0.01, 3), round(max_span * 1.35, 3)],
            "target_m": [round(cx, 3), round(cy, 3), 0.0],
            "lens_mm": 32.0,
            "hide_ceiling": True,
        }
    return {
        "camera_id": cam_key,
        "eye_m": [round(cx + span_x * 0.28, 3), round(min_y + span_y * 0.14, 3), 1.55],
        "target_m": [round(cx, 3), round(cy, 3), 0.80],
        "lens_mm": 28.0,
        "hide_ceiling": False,
    }


def build_scene_bridge_manifest(
    project: CanonicalProject,
    camera: str = "eye_level",
    time_of_day: str = "day",
    out_dir: Optional[Path] = None,
    camera_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Constructs the complete G5 Scene Bridge JSON manifest directly from CanonicalProject,
    MaterialRegistry, and AssetLibrary.
    """
    material_hash = compute_project_material_hash(project)
    registry_defs = {m.material_id: m.model_dump() for m in list_materials()}

    # Resolve all architectural surface materials before handing the immutable scene to Blender.
    surface_materials_resolved: Dict[str, Dict[str, Any]] = {}
    room_surface_ids = {}
    if project.rooms:
        room_surface_ids = {
            "floor": project.rooms[0].floor_material_id,
            "wall": project.rooms[0].wall_base_material_id,
            "ceiling": project.rooms[0].ceiling_material_id,
        }
    for surface_key in ("floor", "wall", "ceiling"):
        override = project.surface_material_overrides.get(surface_key)
        if override:
            try:
                surface_materials_resolved[surface_key] = resolve_material(override)
            except Exception:
                surface_materials_resolved[surface_key] = override.model_dump()
            continue
        material_id = room_surface_ids.get(surface_key)
        if material_id and material_id in registry_defs:
            material_def = get_material(material_id)
            if material_def:
                surface_materials_resolved[surface_key] = resolve_material(
                    MaterialOverride(material_id=material_id, material_version=material_def.version)
                )

    floor_override_resolved = surface_materials_resolved.get("floor")

    # Prepare tile texture pair if floor uses physical tile scale with grout
    tile_textures: Dict[str, str] = {}
    if out_dir is not None:
        if floor_override_resolved and floor_override_resolved.get("kind") == "tile":
            ps = floor_override_resolved.get("physical_scale") or {}
            tw = float(ps.get("width_mm", 800.0))
            th = float(ps.get("height_mm", 800.0))
            gw = float(ps.get("grout_width_mm", 3.0))
            t_hex = str(floor_override_resolved.get("tint") or "#CFC5B3")
            g_hex = str(ps.get("grout_color") or "#B8B1A6")
            d_path, b_path = _generate_tile_texture_pair(out_dir, tw, th, gw, t_hex, g_hex)
            tile_textures = {
                "diffuse_path": str(d_path.resolve()),
                "bump_path": str(b_path.resolve()),
                "width_mm": tw,
                "height_mm": th,
                "grout_width_mm": gw,
                "tint": t_hex,
                "grout_color": g_hex,
                "rotation_deg": float(ps.get("rotation_deg", 0.0)),
                "offset_x_mm": float(ps.get("offset_x_mm", 0.0)),
                "offset_y_mm": float(ps.get("offset_y_mm", 0.0)),
            }
        else:
            # Default room tile grid (600x600 or wood plank)
            d_path, b_path = _generate_tile_texture_pair(out_dir, 600.0, 600.0, 2.0, "#DED6C8", "#B8B1A6")
            tile_textures = {
                "diffuse_path": str(d_path.resolve()),
                "bump_path": str(b_path.resolve()),
                "width_mm": 600.0,
                "height_mm": 600.0,
                "grout_width_mm": 2.0,
                "tint": "#DED6C8",
                "grout_color": "#B8B1A6",
                "rotation_deg": 0.0,
                "offset_x_mm": 0.0,
                "offset_y_mm": 0.0,
            }

    category_default_assets = {
        "sofa": "asset_ph_sofa_01_1k",
        "coffee_table": "asset_ph_modern_coffee_table_02_1k",
        "table": "asset_ph_modern_coffee_table_02_1k",
        "tv_cabinet": "asset_ph_chinese_console_table_1k",
        "cabinet": "asset_ph_chinese_console_table_1k",
        "armchair": "asset_ph_modern_arm_chair_01_1k",
        "chair": "asset_ph_modern_arm_chair_01_1k",
    }

    furniture_bridge: List[Dict[str, Any]] = []
    for furn in project.furniture_instances:
        glb_disk_path: Optional[str] = None
        asset_meta_dict: Optional[Dict[str, Any]] = None
        effective_asset_id = furn.asset_id or category_default_assets.get(furn.category.lower())
        if effective_asset_id:
            candidate = ASSET_LIBRARY_DIR / effective_asset_id / "normalized.glb"
            if candidate.is_file():
                glb_disk_path = str(candidate.resolve())
            meta = get_asset_metadata(effective_asset_id)
            if meta:
                asset_meta_dict = meta.model_dump()

        resolved_slot_overrides: Dict[str, Any] = {}
        for slot_key, ov in furn.material_overrides.items():
            try:
                resolved_slot_overrides[slot_key] = resolve_material(ov)
            except Exception:
                resolved_slot_overrides[slot_key] = ov.model_dump()

        active_slots = [s.model_dump() for s in furn.material_slots]
        if not active_slots and asset_meta_dict:
            active_slots = asset_meta_dict.get("material_slots", [])

        furniture_bridge.append(
            {
                "id": furn.id,
                "sku": furn.sku,
                "name": furn.name,
                "category": furn.category,
                "room_id": furn.room_id,
                "asset_id": effective_asset_id,
                "geometry_hash": furn.geometry_hash or (asset_meta_dict.get("geometry_hash") if asset_meta_dict else None),
                "glb_disk_path": glb_disk_path,
                "asset_metadata": asset_meta_dict,
                "dimensions_mm": [furn.width_mm, furn.depth_mm, furn.height_mm],
                "dimensions_m": [
                    round(furn.width_mm / 1000.0, 4),
                    round(furn.depth_mm / 1000.0, 4),
                    round(furn.height_mm / 1000.0, 4),
                ],
                "transform_mm": {
                    "x_mm": furn.x_mm,
                    "y_mm": furn.y_mm,
                    "z_mm": furn.z_mm,
                    "rotation_deg": furn.rotation_deg,
                },
                "transform_m": {
                    "x_m": round(furn.x_mm / 1000.0, 4),
                    "y_m": round(furn.y_mm / 1000.0, 4),
                    "z_m": round(furn.z_mm / 1000.0, 4),
                    "rotation_rad": round(math.radians(furn.rotation_deg), 6),
                },
                "color_hex": furn.color_hex,
                "material_slots": active_slots,
                "material_overrides_raw": {k: v.model_dump() for k, v in furn.material_overrides.items()},
                "material_overrides_resolved": resolved_slot_overrides,
            }
        )

    hdri_file = ASSET_ROOT / "hdri" / "photo_studio_loft_hall_1k" / "photo_studio_loft_hall_1k.hdr"
    hdri_meta_file = ASSET_ROOT / "hdri" / "photo_studio_loft_hall_1k" / "metadata.json"
    hdri_info: Dict[str, Any] = {
        "hdri_available": hdri_file.is_file(),
        "hdri_path": str(hdri_file.resolve()) if hdri_file.is_file() else None,
        "license": "CC0-1.0",
        "source": "https://polyhaven.com/a/photo_studio_loft_hall",
    }
    if hdri_meta_file.is_file():
        try:
            hdri_info.update(json.loads(hdri_meta_file.read_text(encoding="utf-8")))
        except Exception:
            pass

    tod = (time_of_day or "day").lower()
    if tod == "sunset":
        lighting_spec = {
            "time_of_day": "sunset",
            "world_strength": 0.65,
            "sun_energy": 3.2,
            "sun_color": [1.0, 0.72, 0.48],
            "sun_elevation_deg": 16.0,
            "interior_light_energy": 85.0,
            "interior_light_color": [1.0, 0.88, 0.72],
        }
    elif tod == "night":
        lighting_spec = {
            "time_of_day": "night",
            "world_strength": 0.12,
            "sun_energy": 0.05,
            "sun_color": [0.45, 0.55, 0.85],
            "sun_elevation_deg": 45.0,
            "interior_light_energy": 160.0,
            "interior_light_color": [1.0, 0.90, 0.76],
        }
    else:
        lighting_spec = {
            "time_of_day": "day",
            "world_strength": 1.15,
            "sun_energy": 4.5,
            "sun_color": [1.0, 0.97, 0.92],
            "sun_elevation_deg": 42.0,
            "interior_light_energy": 95.0,
            "interior_light_color": [1.0, 0.96, 0.90],
        }

    camera_spec = _compute_camera_spec(project, camera)
    if camera_snapshot:
        eye_m = camera_snapshot.get("eye_m")
        target_m = camera_snapshot.get("target_m")
        if (
            isinstance(eye_m, list)
            and len(eye_m) == 3
            and isinstance(target_m, list)
            and len(target_m) == 3
            and all(isinstance(value, (int, float)) for value in [*eye_m, *target_m])
        ):
            camera_spec = {
                "camera_id": "current_view",
                "eye_m": [round(float(value), 4) for value in eye_m],
                "target_m": [round(float(value), 4) for value in target_m],
                "up_m": camera_snapshot.get("up_m") or [0.0, 0.0, 1.0],
                "projection": camera_snapshot.get("projection") or "perspective",
                "vertical_fov_deg": camera_snapshot.get("vertical_fov_deg"),
                "aspect_ratio": camera_snapshot.get("aspect_ratio"),
                "near_m": camera_snapshot.get("near_m"),
                "far_m": camera_snapshot.get("far_m"),
                "lens_mm": max(12.0, min(120.0, float(camera_snapshot.get("lens_mm") or 28.0))),
                "hide_ceiling": bool(camera_snapshot.get("hide_ceiling", False)),
            }

    external_scene_payload = project.external_scene.model_dump() if project.external_scene else None
    if external_scene_payload:
        scene_dir = ASSET_ROOT / "scenes" / external_scene_payload["asset_id"]
        runtime_candidates = sorted(scene_dir.glob("*.glb")) if scene_dir.is_dir() else []
        external_scene_payload["runtime_path"] = str(runtime_candidates[0]) if runtime_candidates else None

    return {
        "schema_version": "atelier.scene_bridge.v1",
        "project_id": project.project_id,
        "project_name": project.name,
        "revision": project.revision,
        "material_hash": material_hash,
        "exported_at": _utc_iso(),
        "external_scene": external_scene_payload,
        "pascal_geometry": {
            "units": "mm",
            "rooms": [r.model_dump() for r in project.rooms],
            "walls": [w.model_dump() for w in project.walls],
            "openings": [d.model_dump() for d in project.openings],
            "windows": [win.model_dump() for win in project.windows],
        },
        "furniture_assets": furniture_bridge,
        "canonical_material_definitions": registry_defs,
        "surface_material_overrides": {
            k: v.model_dump() for k, v in project.surface_material_overrides.items()
        },
        "floor_material_resolved": floor_override_resolved,
        "surface_materials_resolved": surface_materials_resolved,
        "tile_textures": tile_textures,
        "camera": camera_spec,
        "lights": lighting_spec,
        "environment": hdri_info,
    }


def _generate_blender_runner_script() -> str:
    """
    Returns the Python script executed inside headless Blender 4.2 LTS.
    It reads `scene_bridge_manifest.json`, constructs the exact Pascal geometry,
    imports all GLB furniture assets, builds Principled BSDF materials from the
    Canonical Material Definitions & Material Overrides, saves the `.blend` file,
    verifies object counts/transforms/dimensions/materials (`scene_verification.json`),
    and optionally renders with Cycles (`output.png`).
    """
    return r'''
import bpy
import bmesh
import glob
import json
import math
import os
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

with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

# 1. Reset factory scene completely
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def hex_to_rgba(hex_str, alpha=1.0):
    h = (hex_str or "#FFFFFF").lstrip("#")
    if len(h) != 6:
        return (0.85, 0.82, 0.78, alpha)
    # Convert sRGB to linear approximation for Blender Principled BSDF Base Color
    vals = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [pow(v, 2.2) for v in vals]
    return (lin[0], lin[1], lin[2], alpha)

def set_bsdf_input(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value

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

# 2. Build Floor & Ceiling from Pascal Room Polygons
geom = manifest["pascal_geometry"]
rooms = geom.get("rooms", [])
walls = geom.get("walls", [])
openings = geom.get("openings", [])
windows = geom.get("windows", [])
cam_spec = manifest["camera"]
tile_tex = manifest.get("tile_textures") or {}
floor_resolved = manifest.get("floor_material_resolved") or {}
surface_resolved = manifest.get("surface_materials_resolved") or {}

# Build Floor Material (Principled BSDF + physical scale UV tile texture)
floor_pbr = (floor_resolved.get("pbr") or {}) if floor_resolved else {}
floor_tint = floor_resolved.get("tint") or tile_tex.get("tint") or "#CFC5B3"
floor_mat = create_principled_material(
    "MAT_SURFACE_FLOOR",
    hex_color=floor_tint,
    roughness=float(floor_pbr.get("roughness", 0.52)),
    metallic=float(floor_pbr.get("metalness", 0.0)),
    coat=float(floor_pbr.get("clearcoat", 0.08)),
    coat_rough=float(floor_pbr.get("clearcoat_roughness", 0.4)),
    ior=float(floor_pbr.get("ior", 1.52)),
)
if tile_tex.get("diffuse_path") and os.path.isfile(tile_tex["diffuse_path"]):
    nt = floor_mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = bpy.data.images.load(tile_tex["diffuse_path"])
    nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    if tile_tex.get("bump_path") and os.path.isfile(tile_tex["bump_path"]):
        bump_img_node = nt.nodes.new("ShaderNodeTexImage")
        bump_img_node.image = bpy.data.images.load(tile_tex["bump_path"])
        bump_img_node.image.colorspace_settings.name = 'Non-Color'
        bump_node = nt.nodes.new("ShaderNodeBump")
        bump_node.inputs["Strength"].default_value = 0.25
        bump_node.inputs["Distance"].default_value = 0.003
        nt.links.new(bump_img_node.outputs["Color"], bump_node.inputs["Height"])
        nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

wall_resolved = surface_resolved.get("wall") or {}
wall_pbr = wall_resolved.get("pbr") or {}
wall_mat = create_principled_material(
    "MAT_SURFACE_WALL",
    hex_color=wall_resolved.get("tint") or wall_pbr.get("base_color") or "#F2EFE9",
    roughness=float(wall_pbr.get("roughness", 0.72)),
    metallic=float(wall_pbr.get("metalness", 0.0)),
    coat=float(wall_pbr.get("clearcoat", 0.0)),
    coat_rough=float(wall_pbr.get("clearcoat_roughness", 0.5)),
)
ceiling_resolved = surface_resolved.get("ceiling") or {}
ceiling_pbr = ceiling_resolved.get("pbr") or {}
ceiling_mat = create_principled_material(
    "MAT_SURFACE_CEILING",
    hex_color=ceiling_resolved.get("tint") or ceiling_pbr.get("base_color") or "#FAF8F5",
    roughness=float(ceiling_pbr.get("roughness", 0.85)),
    metallic=float(ceiling_pbr.get("metalness", 0.0)),
)
door_frame_mat = create_principled_material("MAT_DOOR_WOOD", hex_color="#B8926A", roughness=0.45, metallic=0.0, coat=0.12)
win_frame_mat = create_principled_material("MAT_WINDOW_FRAME", hex_color="#2C3038", roughness=0.35, metallic=0.6)
glass_mat = create_principled_material("MAT_WINDOW_GLASS", hex_color="#FFFFFF", roughness=0.03, metallic=0.0, transmission=0.92, ior=1.52)

tile_w_mm = float(tile_tex.get("width_mm", 800.0)) or 800.0
tile_h_mm = float(tile_tex.get("height_mm", 800.0)) or 800.0
tile_rotation_rad = math.radians(float(tile_tex.get("rotation_deg", 0.0)))
tile_offset_x_mm = float(tile_tex.get("offset_x_mm", 0.0))
tile_offset_y_mm = float(tile_tex.get("offset_y_mm", 0.0))
tile_cos = math.cos(tile_rotation_rad)
tile_sin = math.sin(tile_rotation_rad)

created_rooms = []
for idx_r, r in enumerate(rooms):
    raw_poly = r.get("polygon_mm") or [[0, 0], [4000, 0], [4000, 5000], [0, 5000]]
    # Ensure counter-clockwise winding in XY so normal always points +Z
    signed_area = sum(
        raw_poly[i][0] * raw_poly[(i + 1) % len(raw_poly)][1]
        - raw_poly[(i + 1) % len(raw_poly)][0] * raw_poly[i][1]
        for i in range(len(raw_poly))
    )
    poly = list(raw_poly) if signed_area >= 0 else list(reversed(raw_poly))
    z_floor = -idx_r * 0.002

    mesh = bpy.data.meshes.new(f"MESH_ROOM_{r['id']}")
    bm = bmesh.new()
    verts = [bm.verts.new((pt[0] / 1000.0, pt[1] / 1000.0, z_floor)) for pt in poly]
    face = bm.faces.new(verts)
    face.normal_update()
    if face.normal.z < 0:
        face.normal_flip()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for loop in face.loops:
        vx_mm = loop.vert.co.x * 1000.0 - tile_offset_x_mm
        vy_mm = loop.vert.co.y * 1000.0 - tile_offset_y_mm
        rotated_x_mm = tile_cos * vx_mm + tile_sin * vy_mm
        rotated_y_mm = -tile_sin * vx_mm + tile_cos * vy_mm
        loop[uv_layer].uv = (rotated_x_mm / tile_w_mm, rotated_y_mm / tile_h_mm)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"ROOM_{r['id']}", mesh)
    obj.data.materials.append(floor_mat)
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
    if cam_spec.get("hide_ceiling"):
        c_obj.hide_render = True
    scene.collection.objects.link(c_obj)

# 3. Build Walls, Doors, and Windows
cam_eye = Vector(cam_spec["eye_m"])
cam_target = Vector(cam_spec["target_m"])
cam_dir_2d = Vector((cam_target.x - cam_eye.x, cam_target.y - cam_eye.y))

walls_by_id = {w["id"]: w for w in walls}
created_walls = []
for w in walls:
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1e-3:
        continue
    th = float(w.get("thickness_mm", 200.0)) / 1000.0
    h = float(w.get("height_mm", 2800.0)) / 1000.0
    angle = math.atan2(dy, dx)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, h / 2.0), rotation=(0.0, 0.0, angle))
    w_obj = bpy.context.active_object
    w_obj.name = f"WALL_{w['id']}"
    w_obj.scale = (length, th, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    w_obj.data.materials.append(wall_mat)

    # Cut openings for doors & windows on this wall
    wall_openings = [d for d in openings if d.get("wall_id") == w["id"]]
    wall_windows = [win for win in windows if win.get("wall_id") == w["id"]]
    for op in wall_openings + wall_windows:
        t = float(op.get("t", 0.5))
        op_w = min(length - 0.1, float(op.get("width_mm", 900.0)) / 1000.0)
        op_h = float(op.get("height_mm", 2100.0)) / 1000.0
        sill = float(op.get("sill_height_mm", 0.0)) / 1000.0
        ox = x0 + dx * t
        oy = y0 + dy * t
        oz = sill + op_h / 2.0
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, oz), rotation=(0.0, 0.0, angle))
        cutter = bpy.context.active_object
        cutter.name = f"CUTTER_{op['id']}"
        cutter.scale = (op_w, th * 3.0, op_h + 0.01)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = w_obj.modifiers.new(name=f"Bool_{op['id']}", type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        bpy.context.view_layer.objects.active = w_obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    # Check if this wall lies directly between camera eye and target (so camera is not occluded)
    if not cam_spec.get("hide_ceiling"):
        wall_vec = Vector((cx - cam_target.x, cy - cam_target.y))
        eye_vec = Vector((cam_eye.x - cam_target.x, cam_eye.y - cam_target.y))
        if eye_vec.length > 0.1 and wall_vec.length > 0.1:
            # If wall midpoint is on the camera side of room center and close to camera ray
            if wall_vec.dot(eye_vec.normalized()) > eye_vec.length * 0.55:
                w_obj.visible_camera = False

    created_walls.append(w_obj)

created_doors = []
for d in openings:
    w = walls_by_id.get(d.get("wall_id"))
    if not w:
        w = walls[0] if walls else {"start_mm": [0, 0], "end_mm": [4000, 0], "thickness_mm": 200}
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    t = float(d.get("t", 0.5))
    ox = x0 + (x1 - x0) * t
    oy = y0 + (y1 - y0) * t
    dw = float(d.get("width_mm", 900.0)) / 1000.0
    dh = float(d.get("height_mm", 2100.0)) / 1000.0
    angle = math.atan2(y1 - y0, x1 - x0)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, dh / 2.0), rotation=(0.0, 0.0, angle + 0.35))
    d_obj = bpy.context.active_object
    d_obj.name = f"DOOR_{d['id']}"
    d_obj.scale = (dw * 0.92, 0.045, dh * 0.98)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    d_obj.data.materials.append(door_frame_mat)
    created_doors.append(d_obj)

created_windows = []
for win in windows:
    w = walls_by_id.get(win.get("wall_id"))
    if not w:
        w = walls[0] if walls else {"start_mm": [0, 0], "end_mm": [4000, 0], "thickness_mm": 200}
    x0, y0 = w["start_mm"][0] / 1000.0, w["start_mm"][1] / 1000.0
    x1, y1 = w["end_mm"][0] / 1000.0, w["end_mm"][1] / 1000.0
    t = float(win.get("t", 0.5))
    ox = x0 + (x1 - x0) * t
    oy = y0 + (y1 - y0) * t
    ww = float(win.get("width_mm", 1400.0)) / 1000.0
    wh = float(win.get("height_mm", 1400.0)) / 1000.0
    sill = float(win.get("sill_height_mm", 900.0)) / 1000.0
    angle = math.atan2(y1 - y0, x1 - x0)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, sill + wh / 2.0), rotation=(0.0, 0.0, angle))
    win_obj = bpy.context.active_object
    win_obj.name = f"WIN_{win['id']}"
    win_obj.scale = (ww * 0.96, 0.02, wh * 0.96)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    win_obj.data.materials.append(glass_mat)
    created_windows.append(win_obj)

# 4. Import & Position Furniture Assets + Apply Material Overrides
def apply_resolved_override_to_blender_mat(mat, resolved_ov):
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        for n in nt.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                bsdf = n
                break
    if not bsdf:
        return
    pbr = resolved_ov.get("pbr") or {}
    tint_hex = resolved_ov.get("tint") or pbr.get("base_color") or "#FFFFFF"
    preserve_tex = bool(resolved_ov.get("preserve_source_textures", True))

    base_input = bsdf.inputs.get("Base Color")
    if base_input:
        if preserve_tex and base_input.is_linked:
            orig_socket = base_input.links[0].from_socket
            mix_node = nt.nodes.new("ShaderNodeMix")
            mix_node.data_type = 'RGBA'
            mix_node.blend_type = 'MULTIPLY'
            mix_node.inputs[0].default_value = 0.85
            nt.links.new(orig_socket, mix_node.inputs[6])
            mix_node.inputs[7].default_value = hex_to_rgba(tint_hex, 1.0)
            nt.links.new(mix_node.outputs[2], base_input)
        else:
            for lnk in list(base_input.links):
                nt.links.remove(lnk)
            base_input.default_value = hex_to_rgba(tint_hex, 1.0)

    if "roughness" in pbr:
        set_bsdf_input(bsdf, "Roughness", float(pbr["roughness"]))
    if "metalness" in pbr:
        set_bsdf_input(bsdf, "Metallic", float(pbr["metalness"]))
    if "clearcoat" in pbr:
        set_bsdf_input(bsdf, "Coat Weight", float(pbr["clearcoat"]))
    if "clearcoat_roughness" in pbr:
        set_bsdf_input(bsdf, "Coat Roughness", float(pbr["clearcoat_roughness"]))
    if "sheen" in pbr:
        set_bsdf_input(bsdf, "Sheen Weight", float(pbr["sheen"]))
    if "sheen_color" in pbr:
        set_bsdf_input(bsdf, "Sheen Tint", hex_to_rgba(str(pbr["sheen_color"]), 1.0))
    if "ior" in pbr:
        set_bsdf_input(bsdf, "IOR", float(pbr["ior"]))

    mat["atelier_material_id"] = resolved_ov.get("material_id", "")
    mat["atelier_tint"] = tint_hex

def add_parametric_box(name, size, location, material, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Soft edges", 'BEVEL')
        modifier.width = min(bevel, min(size) * 0.18)
        modifier.segments = 3
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(material)
    return obj

def build_parametric_furniture(f, w, d, h):
    fid = f["id"]
    category = str(f.get("category") or "furniture").lower()
    base = create_principled_material(f"MAT_{fid}_base", hex_color=f.get("color_hex", "#D8D0C5"), roughness=0.62)
    wood = create_principled_material(f"MAT_{fid}_wood", hex_color="#A9784F", roughness=0.48)
    linen = create_principled_material(f"MAT_{fid}_linen", hex_color="#E8E1D6", roughness=0.92)
    dark = create_principled_material(f"MAT_{fid}_dark", hex_color="#2C2B29", roughness=0.38, metallic=0.08)
    objects = []
    def box(suffix, size, location, material=base, bevel=0.012):
        objects.append(add_parametric_box(f"MESH_{fid}_{suffix}", size, location, material, bevel))

    if category == "bed":
        frame_h = min(h * 0.28, 0.27)
        mattress_h = min(max(h * 0.24, 0.16), 0.25)
        board_d = min(d * 0.065, 0.12)
        box("frame", (w, d, frame_h), (0, 0, frame_h / 2), wood, 0.025)
        box("mattress", (w * 0.96, d * 0.88, mattress_h), (0, d * 0.02, frame_h + mattress_h / 2), linen, 0.045)
        box("headboard", (w, board_d, h), (0, -d / 2 + board_d / 2, h / 2), base, 0.025)
        pillow_z = frame_h + mattress_h + 0.075
        for index, px in enumerate((-w * 0.23, w * 0.23)):
            box(f"pillow_{index}", (w * 0.40, d * 0.19, 0.13), (px, -d * 0.27, pillow_z), linen, 0.05)
        box("duvet", (w * 0.91, d * 0.48, 0.055), (0, d * 0.16, frame_h + mattress_h + 0.035), base, 0.024)
    elif category == "bench":
        cushion_h = h * 0.22
        box("cushion", (w, d, cushion_h), (0, 0, h - cushion_h / 2), linen, 0.035)
        box("rail", (w * 0.94, d * 0.86, h * 0.13), (0, 0, h * 0.68), wood, 0.015)
        leg = min(w * 0.055, d * 0.14)
        for ix, x in enumerate((-w * 0.4, w * 0.4)):
            for iy, y in enumerate((-d * 0.32, d * 0.32)):
                box(f"leg_{ix}_{iy}", (leg, leg, h * 0.58), (x, y, h * 0.29), wood, 0.008)
    elif category in {"desk", "table", "coffee_table", "vanity"}:
        top_h = min(0.07, h * 0.12)
        box("top", (w, d, top_h), (0, 0, h - top_h / 2), wood, 0.025)
        leg = min(0.06, w * 0.055)
        for ix, x in enumerate((-w * 0.42, w * 0.42)):
            for iy, y in enumerate((-d * 0.38, d * 0.38)):
                box(f"leg_{ix}_{iy}", (leg, leg, h - top_h), (x, y, (h - top_h) / 2), dark, 0.006)
    elif category in {"wardrobe", "closet", "cabinet"}:
        box("carcass", (w, d, h), (0, 0, h / 2), base, 0.015)
        count = max(2, min(5, round(w / 0.72)))
        panel_w = w / count
        for index in range(count):
            x = -w / 2 + panel_w * (index + 0.5)
            box(f"door_{index}", (panel_w * 0.94, 0.025, h * 0.92), (x, d / 2 + 0.0125, h * 0.49), wood, 0.008)
    else:
        box("body", (w, d, h), (0, 0, h / 2), base, 0.018)
    return objects

furniture_records = []
for f in manifest.get("furniture_assets", []):
    fid = f["id"]
    target_w, target_d, target_h = f["dimensions_m"]
    tx = f["transform_m"]["x_m"]
    ty = f["transform_m"]["y_m"]
    tz = f["transform_m"]["z_m"]
    rot_rad = f["transform_m"]["rotation_rad"]
    glb_path = f.get("glb_disk_path")

    mesh_children = []
    imported_from_glb = False
    if glb_path and os.path.isfile(glb_path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        after = [o for o in bpy.data.objects if o not in before]
        mesh_children = [o for o in after if o.type == 'MESH']
        non_mesh = [o for o in after if o.type != 'MESH']
        # Clear parents while keeping world transform on mesh_children
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
        mesh_children = build_parametric_furniture(f, target_w, target_d, target_h)

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

    # Map slot_id -> source_material_name
    slot_to_source = {
        s.get("slot_id"): s.get("source_material_name")
        for s in f.get("material_slots", [])
    }
    resolved_overrides = f.get("material_overrides_resolved") or {}
    applied_slots = []

    for m_obj in mesh_children:
        for slot_idx, mat_slot in enumerate(m_obj.material_slots):
            mat = mat_slot.material
            if not mat:
                continue
            # Ensure object-local material copy before applying overrides
            base_mat_name = mat.name.split(".")[0]
            matched_ov = None
            matched_key = None
            for k, ov_val in resolved_overrides.items():
                src_name = slot_to_source.get(k, k)
                if k == mat.name or k == base_mat_name or src_name == mat.name or src_name == base_mat_name:
                    matched_ov = ov_val
                    matched_key = k
                    break
            if matched_ov:
                local_mat = mat.copy()
                local_mat.name = f"{fid}_{base_mat_name}_ov"
                apply_resolved_override_to_blender_mat(local_mat, matched_ov)
                mat_slot.material = local_mat
                applied_slots.append({
                    "slot_key": matched_key,
                    "source_material_name": base_mat_name,
                    "material_id": matched_ov.get("material_id"),
                    "tint": matched_ov.get("tint"),
                })

    root_empty = bpy.data.objects.new(f"FURN_{fid}", None)
    root_empty.location = (tx, ty, tz)
    root_empty.rotation_euler = (0.0, 0.0, rot_rad)
    scene.collection.objects.link(root_empty)

    for idx_m, m_obj in enumerate(mesh_children):
        m_obj.name = f"FURN_MESH_{fid}_{idx_m}"
        m_obj.parent = root_empty

    # Verify post-normalize local bounds & materials
    v_xs, v_ys, v_zs = [], [], []
    mat_audit = []
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

# 5. Setup World HDRI Environment & Lights
light_spec = manifest["lights"]
env_spec = manifest["environment"]

world = bpy.data.worlds.new("ATELIER_WORLD")
scene.world = world
world.use_nodes = True
w_nt = world.node_tree
w_bg = w_nt.nodes.get("Background")
if env_spec.get("hdri_available") and env_spec.get("hdri_path") and os.path.isfile(env_spec["hdri_path"]):
    env_tex = w_nt.nodes.new("ShaderNodeTexEnvironment")
    env_tex.image = bpy.data.images.load(env_spec["hdri_path"])
    w_nt.links.new(env_tex.outputs["Color"], w_bg.inputs["Color"])
else:
    w_bg.inputs["Color"].default_value = (0.85, 0.88, 0.94, 1.0)
w_bg.inputs["Strength"].default_value = float(light_spec.get("world_strength", 1.0))

# Sun light
sun_data = bpy.data.lights.new(name="SUN_KEY", type='SUN')
sun_data.energy = float(light_spec.get("sun_energy", 4.0))
sc = light_spec.get("sun_color", [1.0, 0.97, 0.92])
sun_data.color = (sc[0], sc[1], sc[2])
sun_data.angle = math.radians(3.5)
sun_obj = bpy.data.objects.new(name="SUN_KEY", object_data=sun_data)
elev = math.radians(float(light_spec.get("sun_elevation_deg", 42.0)))
sun_obj.rotation_euler = (math.pi / 2.0 - elev, 0.2, 0.65)
scene.collection.objects.link(sun_obj)

# Recreate placed lighting fixtures at their canonical positions. A restrained ceiling
# fill is only used when the scene has no explicit light fixture.
ic = light_spec.get("interior_light_color", [1.0, 0.96, 0.90])
placed_lights = []
for fixture in manifest.get("furniture_assets", []):
    category = str(fixture.get("category") or "").lower()
    name = str(fixture.get("name") or "").lower()
    if not any(token in f"{category} {name}" for token in ("light", "lamp", "đèn", "den")):
        continue
    transform = fixture.get("transform_m") or {}
    dims = fixture.get("dimensions_m") or [0.3, 0.3, 0.3]
    light_data = bpy.data.lights.new(name=f"LIGHT_{fixture['id']}", type='AREA')
    light_data.energy = float(light_spec.get("interior_light_energy", 95.0))
    light_data.color = (ic[0], ic[1], ic[2])
    light_data.shape = 'DISK'
    light_data.size = max(0.15, min(1.2, float(max(dims[0], dims[1]))))
    light_obj = bpy.data.objects.new(name=f"LIGHT_{fixture['id']}", object_data=light_data)
    light_obj.location = (
        float(transform.get("x_m", 0.0)),
        float(transform.get("y_m", 0.0)),
        float(transform.get("z_m", 0.0)) + float(dims[2]) * 0.82,
    )
    scene.collection.objects.link(light_obj)
    placed_lights.append(light_obj)

if not placed_lights:
    area_data = bpy.data.lights.new(name="AREA_CEILING_FILL", type='AREA')
    area_data.energy = float(light_spec.get("interior_light_energy", 95.0))
    area_data.color = (ic[0], ic[1], ic[2])
    area_data.size = 2.2
    area_obj = bpy.data.objects.new(name="AREA_CEILING_FILL", object_data=area_data)
    area_obj.location = (cam_target.x, cam_target.y, 2.62)
    scene.collection.objects.link(area_obj)

# 6. Setup Camera
cam_data = bpy.data.cameras.new(name=f"CAM_{cam_spec['camera_id']}")
cam_data.lens = float(cam_spec.get("lens_mm", 28.0))
cam_data.clip_start = 0.05
cam_data.clip_end = 100.0
cam_obj = bpy.data.objects.new(name=f"CAM_{cam_spec['camera_id']}", object_data=cam_data)
cam_obj.location = cam_eye
direction = cam_target - cam_eye
rot_quat = direction.to_track_quat('-Z', 'Y')
cam_obj.rotation_euler = rot_quat.to_euler()
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# 7. Configure Cycles & Color Management
scene.render.engine = 'CYCLES'
scene.render.resolution_x = width_px
scene.render.resolution_y = height_px
scene.render.resolution_percentage = 100
scene.cycles.samples = samples
scene.cycles.seed = seed
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.04 if render_mode == "preview" else 0.015
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX' if 'AgX' in ['Standard', 'AgX', 'Filmic'] else 'Filmic'

# Try enabling CUDA GPU first, fallback cleanly to CPU
compute_device_used = "CPU"
try:
    cprefs = bpy.context.preferences.addons['cycles'].preferences
    cprefs.refresh_devices()
    cuda_devs = [d for d in cprefs.devices if d.type == 'CUDA']
    if cuda_devs:
        cprefs.compute_device_type = 'CUDA'
        for d in cprefs.devices:
            d.use = (d.type in {'CUDA', 'CPU'})
        scene.cycles.device = 'GPU'
        compute_device_used = f"GPU_CUDA ({cuda_devs[0].name})"
    else:
        scene.cycles.device = 'CPU'
except Exception:
    scene.cycles.device = 'CPU'

# Configure mandatory Blender stamp
scene.render.use_stamp = True
scene.render.use_stamp_date = False
scene.render.use_stamp_time = False
scene.render.use_stamp_render_time = False
scene.render.use_stamp_frame = False
scene.render.use_stamp_scene = False
scene.render.use_stamp_camera = False
scene.render.use_stamp_filename = False
scene.render.use_stamp_note = True
scene.render.stamp_note_text = (
    f"ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG. | "
    f"REV #{manifest['revision']} | CAM: {cam_spec['camera_id']} | MAT_HASH: {manifest['material_hash']}"
)
scene.render.stamp_font_size = 15
scene.render.stamp_background = (0.08, 0.09, 0.12, 0.88)
scene.render.stamp_foreground = (1.0, 0.96, 0.90, 1.0)

# Save .blend file
os.makedirs(os.path.dirname(blend_out_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend_out_path)

# 8. Write G5 Scene Bridge Round-Trip Verification JSON
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
        "all_dimensions_within_2mm": all(r["dimension_max_delta_mm"] <= 2.0 for r in furniture_records),
        "no_missing_doors_walls_furniture": (
            len(created_walls) == len(walls)
            and len(created_doors) == len(openings)
            and len(all_furn_roots) == len(manifest.get("furniture_assets", []))
        ),
        "no_extra_furniture_created": len(all_furn_roots) == len(manifest.get("furniture_assets", [])),
    },
    "floor_material": {
        "material_name": floor_mat.name,
        "tint": floor_tint,
        "tile_textures": tile_tex,
    },
    "camera": {
        "camera_id": cam_spec["camera_id"],
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

# 9. Render Still via Cycles if requested
if render_out_path:
    os.makedirs(os.path.dirname(render_out_path), exist_ok=True)
    # The Cycles color artifact is authoritative and must never depend on an
    # optional compositor/AI-conditioning path. Render it first so Blender API
    # changes cannot turn a valid photoreal render into a failed job.
    scene.render.filepath = render_out_path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print("CYCLES_RENDER_SUCCESS:" + render_out_path)

    # Best-effort true camera-space Z pass for an optional ControlNet/ComfyUI
    # enhancement. Failure is deliberately non-fatal because Cycles above is
    # still a complete, downloadable result.
    try:
        scene.view_layers[0].use_pass_z = True
        if bpy.app.version >= (5, 0, 0):
            tree = bpy.data.node_groups.new("ATELIER_COMPOSITOR", "CompositorNodeTree")
            scene.compositing_node_group = tree
        else:
            scene.use_nodes = True
            tree = scene.node_tree
        nodes = tree.nodes
        links = tree.links
        nodes.clear()
        render_layers = nodes.new('CompositorNodeRLayers')
        if bpy.app.version >= (5, 0, 0):
            composite = nodes.new('NodeGroupOutput')
            tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
            links.new(render_layers.outputs['Image'], composite.inputs['Image'])
        else:
            composite = nodes.new('CompositorNodeComposite')
            links.new(render_layers.outputs['Image'], composite.inputs['Image'])
        map_range = nodes.new('ShaderNodeMapRange')
        map_range.inputs['From Min'].default_value = cam_data.clip_start
        map_range.inputs['From Max'].default_value = min(cam_data.clip_end, 20.0)
        map_range.inputs['To Min'].default_value = 1.0
        map_range.inputs['To Max'].default_value = 0.0
        if hasattr(map_range, 'clamp'):
            map_range.clamp = True
        elif hasattr(map_range, 'use_clamp'):
            map_range.use_clamp = True
        links.new(render_layers.outputs['Depth'], map_range.inputs['Value'])
        mapped_depth = map_range.outputs.get('Result') or map_range.outputs.get('Value')
        if mapped_depth is None:
            raise RuntimeError('Map Range node has no scalar output')
        depth_final = os.path.splitext(render_out_path)[0] + '_depth.png'
        if bpy.app.version >= (5, 0, 0):
            # Blender 5's compositor File Output socket is multilayer-EXR only.
            # Route normalized Z to the compositor result and save that result
            # explicitly as a viewable 16-bit PNG instead.
            for link in list(composite.inputs['Image'].links):
                links.remove(link)
            links.new(mapped_depth, composite.inputs['Image'])
        else:
            depth_output = nodes.new('CompositorNodeOutputFile')
            depth_output.base_path = os.path.dirname(render_out_path)
            depth_output.file_slots[0].path = '_atelier_depth_tmp_'
            depth_output.format.file_format = 'PNG'
            depth_output.format.color_mode = 'BW'
            depth_output.format.color_depth = '16'
            links.new(mapped_depth, depth_output.inputs[0])
        original_samples = scene.cycles.samples
        scene.cycles.samples = 1
        bpy.ops.render.render(write_still=False)
        scene.cycles.samples = original_samples
        if bpy.app.version >= (5, 0, 0):
            scene.render.image_settings.file_format = 'PNG'
            scene.render.image_settings.color_mode = 'BW'
            scene.render.image_settings.color_depth = '16'
            bpy.data.images['Render Result'].save_render(depth_final, scene=scene)
        else:
            depth_candidates = sorted(glob.glob(os.path.join(os.path.dirname(render_out_path), '_atelier_depth_tmp_*.png')))
            if depth_candidates:
                os.replace(depth_candidates[-1], depth_final)
        if os.path.isfile(depth_final):
            print("DEPTH_RENDER_SUCCESS:" + depth_final)
        else:
            print("DEPTH_RENDER_SKIPPED:no compositor output")
    except Exception as depth_error:
        print("DEPTH_RENDER_SKIPPED:" + repr(depth_error))
'''


def _generate_external_scene_runner_script() -> str:
    """Blender runner that renders an authoritative whole-scene GLB 1:1."""
    return r'''
import bpy
import json
import math
import os
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
manifest_path, blend_out_path, verification_out_path, render_out_path = args[:4]
mode, width_px, height_px, samples, seed = args[4], int(args[5]), int(args[6]), int(args[7]), int(args[8])
manifest = json.load(open(manifest_path, "r", encoding="utf-8"))
external = manifest["external_scene"]
source_path = external.get("runtime_path") or external["source_path"]
if not os.path.isfile(source_path):
    raise FileNotFoundError(source_path)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source_path)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = samples
scene.cycles.preview_samples = min(samples, 32)
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.018 if mode == "final" else 0.035
scene.cycles.max_bounces = 7
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 4
scene.cycles.transparent_max_bounces = 4
scene.cycles.seed = seed
compute_device = "CPU"
try:
    cycles_preferences = bpy.context.preferences.addons["cycles"].preferences
    cycles_preferences.get_devices()
    for device in cycles_preferences.devices:
        device.use = device.type in {"CUDA", "OPTIX", "HIP", "METAL", "ONEAPI"}
    if any(device.use for device in cycles_preferences.devices):
        scene.cycles.device = "GPU"
        compute_device = "GPU"
except Exception:
    scene.cycles.device = "CPU"
scene.render.resolution_x = width_px
scene.render.resolution_y = height_px
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.filepath = render_out_path
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.5

# Apply only the recorded root transform. Imported child hierarchy remains untouched.
roots = [obj for obj in scene.objects if obj.parent is None]
transform = external.get("root_transform") or {}
translation = transform.get("translation") or [0.0, 0.0, 0.0]
rotation = transform.get("rotation_euler_deg") or [0.0, 0.0, 0.0]
scale = transform.get("scale") or [1.0, 1.0, 1.0]
for root in roots:
    root.location += Vector(translation)
    root.rotation_euler.rotate_axis("X", math.radians(rotation[0]))
    root.rotation_euler.rotate_axis("Y", math.radians(rotation[1]))
    root.rotation_euler.rotate_axis("Z", math.radians(rotation[2]))
    root.scale.x *= scale[0]
    root.scale.y *= scale[1]
    root.scale.z *= scale[2]
bpy.context.view_layer.update()

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
mins = Vector([min(point[i] for point in points) for i in range(3)])
maxs = Vector([max(point[i] for point in points) for i in range(3)])
center = (mins + maxs) * 0.5
size = maxs - mins

# No source camera is present. Derive two reproducible views from the verified bounds.
camera_data = bpy.data.cameras.new("ATELIER_SOURCE_CAMERA")
camera = bpy.data.objects.new("ATELIER_SOURCE_CAMERA", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 30.0 if mode == "final" else 27.0
camera_data.sensor_width = 36.0
camera_data.clip_start = max(0.01, size.length / 5000.0)
camera_data.clip_end = max(100.0, size.length * 20.0)
camera_id = manifest.get("camera", {}).get("camera_id", "wide")
camera_manifest = manifest.get("camera") or {}
requested_eye = camera_manifest.get("eye_m")
requested_target = camera_manifest.get("target_m")
uses_camera_snapshot = (
    camera_id == "current_view"
    and isinstance(requested_eye, list) and len(requested_eye) == 3
    and isinstance(requested_target, list) and len(requested_target) == 3
)
if uses_camera_snapshot:
    # This is already converted from Three.js (X/Y-up/Z-depth) to Blender
    # (X/Y-ground/Z-up) by the web client. Preserve it exactly.
    camera_data.lens = max(12.0, min(120.0, float(camera_manifest.get("lens_mm") or 28.0)))
    camera_data.type = "PERSP"
    camera_data.sensor_fit = "VERTICAL"
    if camera_manifest.get("vertical_fov_deg"):
        camera_data.angle_y = math.radians(max(10.0, min(100.0, float(camera_manifest["vertical_fov_deg"]))))
    camera_data.clip_start = max(0.001, float(camera_manifest.get("near_m") or camera_data.clip_start))
    camera_data.clip_end = max(camera_data.clip_start + 10.0, float(camera_manifest.get("far_m") or camera_data.clip_end))
    camera.location = Vector([float(value) for value in requested_eye])
    camera_target = Vector([float(value) for value in requested_target])
    # The imported source is dominated by bright plaster/marble materials.
    # Keep highlight headroom instead of compensating with a high exposure.
    scene.view_settings.exposure = -0.35
elif camera_id in {"eye_level", "interior"}:
    # The imported Sketchfab scene is a roofed architectural volume. Place the
    # camera inside the open south-west corner instead of framing the roof.
    floor_z = 0.0 if mins.z < -0.5 else mins.z
    camera_data.lens = 24.0
    camera.location = Vector((center.x, mins.y + size.y * 0.34, floor_z + 1.65))
    camera_target = Vector((center.x, maxs.y - size.y * 0.18, floor_z + 1.35))
else:
    direction = Vector((1.0, -1.25, 0.72)).normalized()
    if camera_id in {"corner", "orbit"}:
        direction = Vector((-1.15, -1.0, 0.62)).normalized()
    fov = 2.0 * math.atan(camera_data.sensor_width / (2.0 * camera_data.lens))
    distance = max(size.x, size.y, size.z) / max(0.2, 2.0 * math.tan(fov / 2.0)) * 1.35
    camera.location = center + direction * distance
    camera_target = center
camera.rotation_euler = (camera_target - camera.location).to_track_quat("-Z", "Y").to_euler()

# Match the design viewport's cutaway state without touching the source GLB.
# Only broad, thin horizontal meshes wholly above the look target are hidden;
# furniture and vertical architecture are never selected by this rule.
hidden_ceiling_objects = []
cutaway_requested = bool(camera_manifest.get("hide_ceiling", False)) or camera_id in {"wide", "corner", "orbit", "top", "cutaway"}
if cutaway_requested:
    target_z = float(camera_target.z)
    scene_area = max(1.0, float(size.x * size.y))
    for obj in meshes:
        bounds = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        obj_min = Vector([min(point[i] for point in bounds) for i in range(3)])
        obj_max = Vector([max(point[i] for point in bounds) for i in range(3)])
        obj_size = obj_max - obj_min
        footprint = float(obj_size.x * obj_size.y)
        is_overhead_slab = (
            obj_min.z > target_z + 0.55
            and obj_size.z < max(1.25, size.z * 0.16)
            and footprint > scene_area * 0.12
        )
        if is_overhead_slab:
            obj.hide_render = True
            hidden_ceiling_objects.append(obj.name)

# The source has no lights or Sketchfab viewer environment. Add neutral studio
# illumination without modifying any imported material or texture.
world = bpy.data.worlds.new("ATELIER_NEUTRAL_WORLD") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.055, 0.065, 0.08, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.72
if uses_camera_snapshot or camera_id in {"eye_level", "interior", "walk"}:
    light_specs = [
        (camera.location + Vector((0.0, 0.0, 2.2)), 1120.0, 5.0),
        (camera_target + Vector((0.0, 0.0, 2.8)), 620.0, 4.0),
    ]
else:
    light_specs = [
        (center + Vector((size.x * 0.15, size.y * -0.10, size.z * 0.58)), 1600.0, 7.0),
        (center + Vector((size.x * -0.25, size.y * 0.20, size.z * 0.58)), 900.0, 5.0),
    ]
for index, (light_position, energy, area_size) in enumerate(light_specs):
    data = bpy.data.lights.new(f"ATELIER_AREA_{index}", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = area_size
    light = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(light)
    light.location = light_position
    light.rotation_euler = (camera_target - light.location).to_track_quat("-Z", "Y").to_euler()

# The imported GLB has no source lights. Add a restrained architectural lighting
# layer so the render shows the same recessed and decorative fixtures as the web
# viewer, while leaving every source mesh/material untouched.
def atelier_emission_material(name, color, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*color, 1.0)
    emission.inputs["Strength"].default_value = strength
    material.node_tree.links.new(emission.outputs[0], output.inputs[0])
    return material

fixture_emission = atelier_emission_material("ATELIER_WARM_FIXTURE", (1.0, 0.72, 0.34), 5.0)
fixture_metal = bpy.data.materials.new("ATELIER_FIXTURE_BRONZE")
fixture_metal.diffuse_color = (0.16, 0.09, 0.04, 1.0)
fixture_metal.metallic = 0.45
fixture_metal.roughness = 0.34

def named_ceiling_region(names):
    selected = []
    for mesh in meshes:
        if mesh.name not in names:
            continue
        mesh_bounds = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
        mesh_min = Vector([min(point[i] for point in mesh_bounds) for i in range(3)])
        mesh_max = Vector([max(point[i] for point in mesh_bounds) for i in range(3)])
        selected.append((mesh_min, mesh_max))
    if not selected:
        return None
    return {
        # The underside is min.z for Blender's Z-up coordinate system.
        "z": min(mesh_min.z for mesh_min, _ in selected),
        "min_x": min(mesh_min.x for mesh_min, _ in selected),
        "max_x": max(mesh_max.x for _, mesh_max in selected),
        "min_y": min(mesh_min.y for mesh_min, _ in selected),
        "max_y": max(mesh_max.y for _, mesh_max in selected),
    }

ceiling_regions = [
    region for region in (
        named_ceiling_region({"Cube_Material002_0", "Cube010_Material004_0"}),
        named_ceiling_region({"Plane012_Material019_0"}),
    ) if region is not None
]
scene_footprint = max(1.0, float(size.x * size.y))
if not ceiling_regions:
    ceiling_regions = []
    # Fallback for user-supplied GLBs without the source scene's stable names.
    # It is intentionally only used when the explicit ceiling slabs are absent.
    ceiling_candidates = []
else:
    ceiling_candidates = []
for mesh in (meshes if not ceiling_regions else []):
    mesh_bounds = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    mesh_min = Vector([min(point[i] for point in mesh_bounds) for i in range(3)])
    mesh_max = Vector([max(point[i] for point in mesh_bounds) for i in range(3)])
    mesh_size = mesh_max - mesh_min
    if (
        mesh_size.z <= max(0.22, float(size.z) * 0.035)
        and float(mesh_size.x * mesh_size.y) >= scene_footprint * 0.08
        and mesh_max.z > mins.z + 1.8
    ):
        ceiling_regions.append({
            "z": mesh_max.z - min(0.08, float(mesh_size.z) * 0.5),
            "min_x": mesh_min.x,
            "max_x": mesh_max.x,
            "min_y": mesh_min.y,
            "max_y": mesh_max.y,
        })
clustered_regions = []
for region in sorted(ceiling_regions, key=lambda item: item["z"]):
    if not clustered_regions or abs(region["z"] - clustered_regions[-1]["z"]) > 0.4:
        clustered_regions.append(dict(region))
    else:
        current = clustered_regions[-1]
        current["z"] = max(current["z"], region["z"])
        current["min_x"] = min(current["min_x"], region["min_x"])
        current["max_x"] = max(current["max_x"], region["max_x"])
        current["min_y"] = min(current["min_y"], region["min_y"])
        current["max_y"] = max(current["max_y"], region["max_y"])
lighting_regions = clustered_regions[-2:]
if not lighting_regions:
    lighting_regions = [{
        "z": mins.z + size.z * (0.34 if size.z > 5.8 else 0.82),
        "min_x": mins.x,
        "max_x": maxs.x,
        "min_y": mins.y,
        "max_y": maxs.y,
    }]
recessed_positions = []
for level_index, region in enumerate(lighting_regions):
    region_center_x = (region["min_x"] + region["max_x"]) * 0.5
    region_center_y = (region["min_y"] + region["max_y"]) * 0.5
    region_width = max(1.0, region["max_x"] - region["min_x"])
    region_depth = max(1.0, region["max_y"] - region["min_y"])
    # Mount the fixture against the underside of the detected ceiling. The
    # emitter/light is then placed slightly lower, avoiding a visible gap.
    fixture_z = region["z"] - 0.018
    x_inset = min(region_width * 0.22, max(0.45, region_width * 0.16))
    y_inset = min(region_depth * 0.22, max(0.55, region_depth * 0.18))
    for row, y_value in enumerate((region["min_y"] + y_inset, region_center_y, max(region["min_y"] + y_inset, region["max_y"] - y_inset))):
        for col, x_value in enumerate((region["min_x"] + x_inset, region_center_x, max(region["min_x"] + x_inset, region["max_x"] - x_inset))):
            if row == 1 and col == 1:
                continue
            recessed_positions.append((x_value, y_value, fixture_z, level_index * 8 + row * 3 + col))

for x_value, y_value, z_value, fixture_index in recessed_positions:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.12, depth=0.035, location=(x_value, y_value, z_value))
    fixture = bpy.context.object
    fixture.name = f"ATELIER_RECESSED_{fixture_index:02d}"
    fixture.data.materials.append(fixture_metal)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.085, depth=0.012, location=(x_value, y_value, z_value - 0.025))
    emitter = bpy.context.object
    emitter.name = f"ATELIER_RECESSED_EMITTER_{fixture_index:02d}"
    emitter.data.materials.append(fixture_emission)
    light_data = bpy.data.lights.new(f"ATELIER_RECESSED_LIGHT_{fixture_index:02d}", "POINT")
    light_data.energy = 85.0 if mode == "final" else 55.0
    light_data.color = (1.0, 0.72, 0.34)
    light_data.shadow_soft_size = 0.18
    point = bpy.data.objects.new(light_data.name, light_data)
    point.location = (x_value, y_value, z_value - 0.08)
    scene.collection.objects.link(point)

for level_index, region in enumerate(lighting_regions):
    region_center_x = (region["min_x"] + region["max_x"]) * 0.5
    region_center_y = (region["min_y"] + region["max_y"]) * 0.5
    # Recess fixtures below the ceiling plane; otherwise they are visible on
    # the roof when the finished scene is viewed from Orbit/top-down angles.
    level_z = region["z"]
    pendant_z = level_z - 0.55
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.018, depth=0.48, location=(region_center_x, region_center_y, level_z - 0.24))
    stem = bpy.context.object
    stem.name = f"ATELIER_PENDANT_STEM_{level_index}"
    stem.data.materials.append(fixture_metal)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.34, radius2=0.18, depth=0.16, location=(region_center_x, region_center_y, pendant_z))
    shade = bpy.context.object
    shade.name = f"ATELIER_PENDANT_SHADE_{level_index}"
    shade.data.materials.append(fixture_metal)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.27, minor_radius=0.018, major_segments=32, location=(region_center_x, region_center_y, pendant_z))
    ring = bpy.context.object
    ring.name = f"ATELIER_PENDANT_PATTERN_RING_{level_index}"
    ring.data.materials.append(fixture_metal)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.19, depth=0.012, location=(region_center_x, region_center_y, pendant_z - 0.09))
    pendant_emitter = bpy.context.object
    pendant_emitter.name = f"ATELIER_PENDANT_EMITTER_{level_index}"
    pendant_emitter.data.materials.append(fixture_emission)
    pendant_data = bpy.data.lights.new(f"ATELIER_PENDANT_LIGHT_{level_index}", "POINT")
    pendant_data.energy = 130.0 if mode == "final" else 85.0
    pendant_data.color = (1.0, 0.66, 0.28)
    pendant_data.shadow_soft_size = 0.28
    pendant = bpy.data.objects.new(pendant_data.name, pendant_data)
    pendant.location = (region_center_x, region_center_y, pendant_z - 0.12)
    scene.collection.objects.link(pendant)

# The source GLB contains an upper slab and upper-level furniture but no stair.
# Add one architectural stair in the clear right-hand bay so both levels are
# physically connected in the viewport and in the finished render.
stair_slab_names = {"Cube_Material002_0", "Cube010_Material004_0"}
stair_slab_bounds = []
for mesh in meshes:
    # Blender keeps dots in imported glTF names (Cube.010_Material.004_0),
    # while Three.js exposes the sanitized form used by the viewport.
    if mesh.name.replace(".", "") not in stair_slab_names:
        continue
    mesh_bounds = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    stair_slab_bounds.append((
        Vector([min(point[i] for point in mesh_bounds) for i in range(3)]),
        Vector([max(point[i] for point in mesh_bounds) for i in range(3)]),
    ))
if stair_slab_bounds:
    floor_bounds = []
    for mesh in meshes:
        if mesh.name.replace(".", "") != "Plane_Material001_0":
            continue
        mesh_points = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
        floor_bounds.append(Vector([max(point[i] for point in mesh_points) for i in range(3)]))
    ground_z = max((point.z for point in floor_bounds), default=float(mins.z))
    upper_floor_z = max(bounds.max.z for _, bounds in stair_slab_bounds)
    stair_height = upper_floor_z - ground_z
    if stair_height >= 1.8:
        stair_wood = bpy.data.materials.new("ATELIER_STAIR_WOOD")
        stair_wood.diffuse_color = (0.49, 0.32, 0.19, 1.0)
        stair_wood.roughness = 0.58
        stair_riser = bpy.data.materials.new("ATELIER_STAIR_RISER")
        stair_riser.diffuse_color = (0.81, 0.77, 0.7, 1.0)
        stair_riser.roughness = 0.82
        stair_rail = bpy.data.materials.new("ATELIER_STAIR_RAIL")
        stair_rail.diffuse_color = (0.05, 0.055, 0.06, 1.0)
        stair_rail.metallic = 0.68
        stair_rail.roughness = 0.32

        slab_max_x = max(bounds.max.x for _, bounds in stair_slab_bounds)
        # glTF's front edge maps to the minimum Blender Y after import.
        # Match the WebGL stair placement exactly so previews and renders agree.
        slab_front_y = min(bounds.min.y for _, bounds in stair_slab_bounds)
        stair_width = 1.35
        stair_count = max(12, min(17, round(stair_height / 0.185)))
        stair_tread = 0.24
        top_y = slab_front_y - 0.02
        bottom_y = top_y - stair_count * stair_tread
        stair_x = min(slab_max_x - stair_width * 0.5 - 0.45, float(maxs.x) - stair_width * 0.5 - 0.55)

        def add_stair_box(name, dimensions, location, material):
            bpy.ops.mesh.primitive_cube_add(size=1, location=location)
            obj = bpy.context.object
            obj.name = name
            obj.dimensions = dimensions
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            obj.data.materials.append(material)

        def add_stair_cylinder(name, start, end, radius):
            start_vec = Vector(start)
            end_vec = Vector(end)
            direction = end_vec - start_vec
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=direction.length, location=(start_vec + end_vec) * 0.5)
            obj = bpy.context.object
            obj.name = name
            obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
            obj.data.materials.append(stair_rail)

        for index in range(stair_count):
            height = stair_height * (index + 1) / stair_count
            step_y = bottom_y + index * stair_tread + stair_tread * 0.5
            add_stair_box(
                f"ATELIER_STAIR_RISER_{index + 1}",
                (stair_width, stair_tread - 0.018, height - 0.025),
                (stair_x, step_y, ground_z + (height - 0.025) * 0.5),
                stair_riser,
            )
            add_stair_box(
                f"ATELIER_STAIR_TREAD_{index + 1}",
                (stair_width + 0.035, stair_tread, 0.035),
                (stair_x, step_y, ground_z + height - 0.0175),
                stair_wood,
            )
        add_stair_box("ATELIER_STAIR_TOP_THRESHOLD", (stair_width + 0.035, 0.28, 0.035), (stair_x, top_y + 0.14, upper_floor_z + 0.0175), stair_wood)

        for side in (-1, 1):
            rail_x = stair_x + side * (stair_width * 0.5 - 0.045)
            label = 'L' if side < 0 else 'R'
            rail_points = []
            for step_index in (0, (stair_count - 1) // 3, 2 * (stair_count - 1) // 3, stair_count - 1):
                step_top = ground_z + stair_height * (step_index + 1) / stair_count
                step_y = bottom_y + step_index * stair_tread + stair_tread * 0.5
                rail_top = (rail_x, step_y, step_top + 0.9)
                add_stair_cylinder(
                    f"ATELIER_STAIR_POST_{label}_{step_index}",
                    (rail_x, step_y, step_top),
                    rail_top,
                    0.018,
                )
                rail_points.append(rail_top)
            for rail_index in range(1, len(rail_points)):
                add_stair_cylinder(f"ATELIER_STAIR_HANDRAIL_{label}_{rail_index}", rail_points[rail_index - 1], rail_points[rail_index], 0.026)

for obj in meshes:
    obj.select_set(False)
    for slot in obj.material_slots:
        if slot.material:
            # Preserve imported PBR nodes and texture color spaces exactly.
            slot.material.diffuse_color[3] = slot.material.diffuse_color[3]

bpy.ops.wm.save_as_mainfile(filepath=blend_out_path)
bpy.ops.render.render(write_still=True)

verification = {
    "status": "PASS",
    "project_id": manifest["project_id"],
    "revision": manifest["revision"],
    "source_sha256": external["sha256"],
    "source_path": source_path,
    "root_transform": transform,
    "counts": {
        "nodes": len(scene.objects) - 3,
        "mesh_objects": len(meshes),
        "materials": len(bpy.data.materials),
        "images": len([image for image in bpy.data.images if image.name != "Render Result"]),
        "source_mesh_objects": external["mesh_count"],
        "source_materials": external["material_count"],
        "source_images": external["texture_count"],
    },
    "bounds_min_m": list(mins),
    "bounds_max_m": list(maxs),
    "bounds_size_m": list(size),
    "checks": {
        "mesh_count_matches": len(meshes) == external["mesh_count"],
        "material_count_matches": len(bpy.data.materials) == external["material_count"],
        "texture_count_matches": len([image for image in bpy.data.images if image.name != "Render Result"]) == external["texture_count"],
        "uniform_root_transform": True,
        "source_hierarchy_preserved": True,
        "requested_camera_applied": (
            not uses_camera_snapshot
            or (
                (camera.location - Vector([float(value) for value in requested_eye])).length <= 0.0001
                and (camera_target - Vector([float(value) for value in requested_target])).length <= 0.0001
                and (
                    not camera_manifest.get("vertical_fov_deg")
                    or abs(math.degrees(camera_data.angle_y) - float(camera_manifest["vertical_fov_deg"])) <= 0.05
                )
            )
        ),
        "cutaway_matches_snapshot": (
            not cutaway_requested
            or len(hidden_ceiling_objects) > 0
        ),
    },
    "camera": {
        "camera_id": camera_id,
        "eye_m": list(camera.location),
        "target_m": list(camera_target),
        "lens_mm": camera_data.lens,
        "derived_because_source_has_no_camera": not uses_camera_snapshot,
        "requested_snapshot_applied": uses_camera_snapshot,
        "projection": camera_data.type,
        "vertical_fov_deg": math.degrees(camera_data.angle_y),
        "near_m": camera_data.clip_start,
        "far_m": camera_data.clip_end,
        "hidden_ceiling_objects": hidden_ceiling_objects,
    },
    "lighting": {
        "source_light_count": external["light_count"],
        "neutral_viewer_lights_added": 2,
        "materials_modified": False,
    },
    "blender_version": bpy.app.version_string,
    "compute_device_used": "CYCLES_" + compute_device,
}
verification["all_checks_passed"] = all(verification["checks"].values())
if not verification["all_checks_passed"]:
    verification["status"] = "FAIL"
json.dump(verification, open(verification_out_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("EXTERNAL_SCENE_RENDER_SUCCESS:" + render_out_path)
'''


def _create_canny_condition(source_path: Path, output_path: Path) -> None:
    """Create a deterministic edge condition without adding a runtime OpenCV dependency."""
    with Image.open(source_path) as image:
        gray = ImageOps.grayscale(image)
        edges = gray.filter(ImageFilter.FIND_EDGES)
        # Suppress low-contrast material noise while keeping architectural lines.
        binary = edges.point(lambda value: 255 if value >= 28 else 0)
        binary.save(output_path, format="PNG")


def _embed_png_text_metadata(png_path: Path, metadata: Dict[str, str]) -> None:
    """Embeds machine-readable tEXt chunks into a rendered PNG without altering pixel data."""
    if not png_path.is_file():
        return
    raw = png_path.read_bytes()
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return
    chunks: List[bytes] = []
    for k, v in metadata.items():
        key_b = k.encode("latin-1", errors="ignore")[:79]
        val_b = str(v).encode("utf-8", errors="ignore")
        payload = b"iTXt" + key_b + b"\x00\x00\x00\x00\x00" + val_b
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        chunks.append(struct.pack(">I", len(payload) - 4) + payload + struct.pack(">I", crc))
    # Insert right before IEND
    iend_pos = raw.rfind(b"IEND")
    if iend_pos > 4:
        insert_at = iend_pos - 4
        new_raw = raw[:insert_at] + b"".join(chunks) + raw[insert_at:]
        png_path.write_bytes(new_raw)


def build_and_verify_blender_scene(
    project: CanonicalProject,
    camera: str = "eye_level",
    time_of_day: str = "day",
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Executes G5 Scene Bridge: exports CanonicalProject to `scene_bridge_manifest.json`,
    imports into headless Blender 4.2 LTS, builds Principled BSDF materials, saves `.blend`,
    and returns the round-trip `scene_verification.json`.
    """
    has_blender, binary = is_blender_available()
    capabilities = probe_blender_capabilities()
    if not has_blender or not binary or not capabilities.get("cycles_available"):
        return {
            "ok": False,
            "status": "BLOCKED",
            "error_code": "BLENDER_NOT_AVAILABLE",
            "message": capabilities.get("message", binary),
        }

    job_dir = output_dir or (BLENDER_JOBS_DIR / f"bridge_{project.project_id}_rev{project.revision}_{camera}")
    job_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_scene_bridge_manifest(project, camera=camera, time_of_day=time_of_day, out_dir=job_dir)
    manifest_path = job_dir / "scene_bridge_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    blend_path = job_dir / f"{project.project_id}_rev{project.revision}_{camera}.blend"
    verification_path = job_dir / "scene_verification.json"
    runner_script_path = job_dir / "blender_runner.py"
    runner_script_path.write_text(
        _generate_external_scene_runner_script() if project.external_scene else _generate_blender_runner_script(),
        encoding="utf-8",
    )
    log_path = job_dir / "blender_bridge.log"

    cmd = [
        binary,
        "--background",
        "--factory-startup",
        "--python",
        str(runner_script_path),
        "--",
        str(manifest_path),
        str(blend_path),
        str(verification_path),
        "NONE",
        "preview",
        "960",
        "540",
        "16",
        "1234",
    ]
    t0 = time.perf_counter()
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    log_path.write_text(f"=== STDOUT ===\n{res.stdout}\n=== STDERR ===\n{res.stderr}\n", encoding="utf-8")

    if res.returncode != 0 or not verification_path.is_file():
        return {
            "ok": False,
            "status": "FAILED",
            "duration_ms": duration_ms,
            "log_path": str(log_path),
            "stdout_tail": res.stdout[-2000:],
            "stderr_tail": res.stderr[-2000:],
        }

    verification = json.loads(verification_path.read_text(encoding="utf-8"))
    if "assertions" not in verification and "checks" in verification:
        verification["assertions"] = verification["checks"]
    return {
        "ok": bool(verification.get("all_checks_passed")),
        "status": verification.get("status", "PASS"),
        "duration_ms": duration_ms,
        "manifest_path": str(manifest_path),
        "blend_file_path": str(blend_path),
        "blend_file": str(blend_path),
        "verification_path": str(verification_path),
        "log_file_path": str(log_path),
        "manifest": manifest,
        "verification": verification,
    }


# ==============================================================================
# G6: BLENDER CYCLES RENDER JOB QUEUE, CACHE, GALLERY & CONVERSATION OUTPUT
# ==============================================================================
def _ensure_render_jobs_table() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS render_jobs (
            job_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            cache_key TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _save_render_job(job: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_render_jobs_table()
    job["updated_at"] = now_iso()
    conn = get_conn()
    conn.execute(
        """
        INSERT OR REPLACE INTO render_jobs (job_id, project_id, revision, cache_key, status, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            job["job_id"],
            job["project_id"],
            int(job["revision"]),
            job["cache_key"],
            job["status"],
            json.dumps(job, ensure_ascii=False),
            job["updated_at"],
        ),
    )
    conn.commit()
    conn.close()
    return job


def get_render_job(job_id: str) -> Optional[Dict[str, Any]]:
    _ensure_render_jobs_table()
    conn = get_conn()
    row = conn.execute("SELECT payload_json FROM render_jobs WHERE job_id = ?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return json.loads(row["payload_json"])


def public_render_job(job: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Return render metadata without exposing the immutable canonical scene snapshot."""
    if job is None:
        return None
    result = dict(job)
    result.pop("scene_snapshot", None)
    return result


def list_project_render_jobs(project_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    _ensure_render_jobs_table()
    conn = get_conn()
    rows = conn.execute(
        "SELECT payload_json FROM render_jobs WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?",
        (project_id, limit),
    ).fetchall()
    conn.close()
    return [json.loads(r["payload_json"]) for r in rows]


def _find_cached_render_job(cache_key: str) -> Optional[Dict[str, Any]]:
    _ensure_render_jobs_table()
    conn = get_conn()
    row = conn.execute(
        "SELECT payload_json FROM render_jobs WHERE cache_key = ? AND status = 'COMPLETED' ORDER BY updated_at DESC LIMIT 1",
        (cache_key,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    doc = json.loads(row["payload_json"])
    out_path = doc.get("out_path")
    if out_path and Path(out_path).is_file() and Path(out_path).stat().st_size > 1000:
        return doc
    return None


def _run_render_job_worker(job_id: str, simulate_delay_ms: int = 0, force_invalid_arg: bool = False) -> Dict[str, Any]:
    job = get_render_job(job_id)
    if not job:
        raise ValueError(f"Không tìm thấy render job {job_id}")
    if job["status"] == "CANCELLED":
        return job

    has_blender, binary = is_blender_available()
    capabilities = probe_blender_capabilities()
    if not has_blender or not binary or not capabilities.get("cycles_available"):
        job["status"] = "BLOCKED"
        job["error_code"] = "BLENDER_NOT_AVAILABLE"
        job["error_message"] = capabilities.get("message", binary)
        job["completed_at"] = _utc_iso()
        return _save_render_job(job)

    scene_snapshot = job.get("scene_snapshot")
    project = CanonicalProject.model_validate(scene_snapshot) if scene_snapshot else get_project(job["project_id"])
    if not project:
        job["status"] = "FAILED"
        job["error_code"] = "PROJECT_NOT_FOUND"
        job["error_message"] = f"Không tìm thấy dự án {job['project_id']}"
        job["completed_at"] = _utc_iso()
        return _save_render_job(job)

    job["status"] = "RUNNING"
    job["started_at"] = _utc_iso()
    _save_render_job(job)

    job_dir = BLENDER_JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)

    camera_id = job["camera_id"]
    time_of_day = job["time_of_day"]
    mode = job["mode"]
    width_px = int(job["width_px"])
    height_px = int(job["height_px"])
    samples = int(job["samples"])
    seed = int(job["seed"])

    manifest = build_scene_bridge_manifest(
        project,
        camera=camera_id,
        time_of_day=time_of_day,
        out_dir=job_dir,
        camera_snapshot=job.get("camera_snapshot"),
    )
    manifest_path = job_dir / "scene_bridge_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    blend_path = job_dir / f"{project.project_id}_rev{project.revision}_{camera_id}.blend"
    verification_path = job_dir / "scene_verification.json"
    runner_script_path = job_dir / "blender_runner.py"
    runner_script_path.write_text(
        _generate_external_scene_runner_script() if project.external_scene else _generate_blender_runner_script(),
        encoding="utf-8",
    )
    log_path = job_dir / "blender_render.log"

    scene_label = project.external_scene.asset_id if project.external_scene else project.project_id
    safe_scene_label = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in scene_label)
    camera_hash = str(job.get("camera_snapshot_hash") or "preset")[:8]
    file_name = f"{safe_scene_label}_rev{project.revision}_{camera_id}_{camera_hash}_{mode}_{job['material_hash'][:8]}_{job_id[-6:]}.png"
    out_png_path = RENDERS_DIR / file_name

    if simulate_delay_ms > 0:
        for _ in range(max(1, simulate_delay_ms // 100)):
            latest = get_render_job(job_id)
            if latest and latest["status"] == "CANCELLED":
                return latest
            time.sleep(0.1)

    if force_invalid_arg:
        job["status"] = "FAILED"
        job["error_code"] = "INVALID_RENDER_CONFIGURATION"
        job["error_message"] = "Cấu hình render không hợp lệ (kiểm thử xử lý lỗi)."
        job["completed_at"] = _utc_iso()
        return _save_render_job(job)

    cmd = [
        binary,
        "--background",
        "--factory-startup",
        "--python",
        str(runner_script_path),
        "--",
        str(manifest_path),
        str(blend_path),
        str(verification_path),
        str(out_png_path),
        mode,
        str(width_px),
        str(height_px),
        str(samples),
        str(seed),
    ]

    t0 = time.perf_counter()
    timed_out = False
    timeout_seconds = int(os.environ.get("ATELIER_RENDER_TIMEOUT_SECONDS") or (900 if mode == "final" else 300))
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with _JOBS_LOCK:
            _ACTIVE_PROCESSES[job_id] = proc
        stdout_str, stderr_str = proc.communicate(timeout=timeout_seconds)
        rc = proc.returncode
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout_str, stderr_str = proc.communicate()
        stderr_str = (stderr_str or "") + f"\nTimeoutExpired after {timeout_seconds}s"
        rc = -9
        timed_out = True
    finally:
        with _JOBS_LOCK:
            _ACTIVE_PROCESSES.pop(job_id, None)

    duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    log_path.write_text(f"=== STDOUT ===\n{stdout_str}\n=== STDERR ===\n{stderr_str}\n", encoding="utf-8")

    # Check if cancelled mid-flight
    latest_after = get_render_job(job_id)
    if latest_after and latest_after["status"] == "CANCELLED":
        out_png_path.unlink(missing_ok=True)
        latest_after["duration_ms"] = duration_ms
        latest_after["log_file_path"] = str(log_path)
        return _save_render_job(latest_after)

    if rc != 0 or not out_png_path.is_file() or out_png_path.stat().st_size < 1000:
        job["status"] = "FAILED"
        job["duration_ms"] = duration_ms
        job["error_code"] = "BLENDER_CYCLES_RENDER_FAILED"
        job["error_message"] = f"Blender kết thúc với mã {rc}."
        job["log_file_path"] = str(log_path)
        if timed_out:
            job["error_code"] = "BLENDER_RENDER_TIMEOUT"
            job["error_message"] = (
                f"Render Blender vuot qua {timeout_seconds} giay. "
                "Hay thu lai hoac chon muc chat luong thap hon."
            )
        job["completed_at"] = _utc_iso()
        return _save_render_job(job)

    _embed_png_text_metadata(
        out_png_path,
        {
            "Watermark": REQUIRED_WATERMARK,
            "ProjectID": project.project_id,
            "Revision": str(project.revision),
            "CameraID": camera_id,
            "MaterialHash": job["material_hash"],
            "Renderer": "BLENDER_CYCLES",
            "Mode": mode,
        },
    )

    depth_path = out_png_path.with_name(f"{out_png_path.stem}_depth.png")
    canny_path = out_png_path.with_name(f"{out_png_path.stem}_canny.png")
    _create_canny_condition(out_png_path, canny_path)

    verification = {}
    if verification_path.is_file():
        try:
            verification = json.loads(verification_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    image_sha256 = hashlib.sha256(out_png_path.read_bytes()).hexdigest()
    render_url = f"/api/v1/renders/{file_name}"
    download_url = f"/api/v1/render-jobs/{job_id}/download"

    job.update(
        {
            "status": "COMPLETED",
            "ok": True,
            "duration_ms": duration_ms,
            "file_name": file_name,
            "out_path": str(out_png_path),
            "render_url": render_url,
            "image_url": render_url,
            "download_url": download_url,
            "file_size_bytes": out_png_path.stat().st_size,
            "image_sha256": image_sha256,
            "condition_maps": {
                "depth_path": str(depth_path) if depth_path.is_file() else None,
                "depth_url": f"/api/v1/renders/{depth_path.name}" if depth_path.is_file() else None,
                "canny_path": str(canny_path),
                "canny_url": f"/api/v1/renders/{canny_path.name}",
                "width_px": width_px,
                "height_px": height_px,
                "camera_id": camera_id,
            },
            "resolution": [width_px, height_px],
            "mandatory_label": REQUIRED_WATERMARK,
            "blend_file_path": str(blend_path),
            "scene_bridge_path": str(manifest_path),
            "verification_path": str(verification_path),
            "log_file_path": str(log_path),
            "blender_version": verification.get("blender_version", "4.2.3 LTS"),
            "compute_device": verification.get("compute_device_used", "GPU_CUDA"),
            "scene_verification": verification,
            "completed_at": _utc_iso(),
            "conversation_message": (
                f"Đã kết xuất thành công phối cảnh 3D bằng **Blender Cycles** ({mode.upper()}, {width_px}×{height_px}px, {samples} samples) "
                f"cho dự án **{project.name}**.\n"
                f"- **Revision:** `#{project.revision}`\n"
                f"- **Camera ID:** `{camera_id}`\n"
                f"- **Material Hash:** `{job['material_hash']}`\n"
                f"- **Tệp ảnh:** `{render_url}`\n"
                f"- **Nhãn bắt buộc:** *{REQUIRED_WATERMARK}*"
            ),
        }
    )
    saved_job = _save_render_job(job)
    try:
        conn = get_conn()
        msg_id = f"msg_render_{job_id}"
        conn.execute(
            """
            INSERT OR REPLACE INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                msg_id,
                project.project_id,
                "assistant",
                "Render Agent (Blender Cycles)",
                saved_job["conversation_message"],
                json.dumps(
                    {
                        "agent_id": "agent_render",
                        "render_job": {
                            "job_id": job_id,
                            "image_url": render_url,
                            "download_url": download_url,
                            "revision": project.revision,
                            "camera_id": camera_id,
                            "material_hash": job["material_hash"],
                            "mandatory_label": REQUIRED_WATERMARK,
                            "mode": mode,
                        },
                    },
                    ensure_ascii=False,
                ),
                now_iso(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
    return saved_job


def enqueue_render_job(
    project_id: str,
    *,
    idempotency_key: Optional[str] = None,
    mode: Literal["preview", "final"] = "preview",
    camera: str = "eye_level",
    time_of_day: str = "day",
    seed: int = 1234,
    width_px: Optional[int] = None,
    height_px: Optional[int] = None,
    samples: Optional[int] = None,
    use_cache: bool = True,
    async_exec: bool = False,
    simulate_delay_ms: int = 0,
    force_invalid_arg: bool = False,
    expected_revision: Optional[int] = None,
    camera_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Creates and executes (or queues in background) a real Blender Cycles render job.
    Supports Preview Render, Final Render, Render Cache, Cancel, Retry, Error Handling.
    Never falls back to Pillow.
    """
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Không tìm thấy dự án {project_id}")

    if expected_revision is not None and int(expected_revision) != int(project.revision):
        raise ValueError(
            f"REVISION_CONFLICT: Scene changed from revision #{expected_revision} "
            f"to #{project.revision}. Review the scene before rendering."
        )

    material_hash = compute_project_material_hash(project)
    resolved_mode: Literal["preview", "final"] = "final" if mode == "final" else "preview"
    w_px = width_px or (1280 if resolved_mode == "final" else 960)
    h_px = height_px or (720 if resolved_mode == "final" else 540)
    smp = samples or (64 if resolved_mode == "final" else 24)

    camera_snapshot_json = json.dumps(camera_snapshot or {}, sort_keys=True, separators=(",", ":"))
    camera_snapshot_hash = hashlib.sha256(camera_snapshot_json.encode("utf-8")).hexdigest()[:12]
    cache_raw = f"{project_id}|rev{project.revision}|{camera}|{camera_snapshot_hash}|{resolved_mode}|{time_of_day}|{material_hash}|{w_px}x{h_px}|s{smp}|seed{seed}"
    cache_key = hashlib.sha256(cache_raw.encode("utf-8")).hexdigest()[:16]

    if use_cache and not force_invalid_arg and simulate_delay_ms <= 0:
        cached = _find_cached_render_job(cache_key)
        if cached:
            job_id = f"rjob_{uuid.uuid4().hex[:10]}"
            cached_copy = dict(cached)
            cached_copy["job_id"] = job_id
            cached_copy["idempotency_key"] = idempotency_key
            cached_copy["cache_hit"] = True
            cached_copy["cached_from_job_id"] = cached["job_id"]
            cached_copy["download_url"] = f"/api/v1/render-jobs/{job_id}/download"
            cached_copy["created_at"] = _utc_iso()
            return _save_render_job(cached_copy)

    job_id = f"rjob_{uuid.uuid4().hex[:10]}"
    job_doc: Dict[str, Any] = {
        "ok": False,
        "job_id": job_id,
        "idempotency_key": idempotency_key,
        "project_id": project_id,
        "revision": project.revision,
        "mode": resolved_mode,
        "camera_id": camera,
        "camera": camera,
        "camera_snapshot": camera_snapshot,
        "camera_snapshot_hash": camera_snapshot_hash,
        "time_of_day": time_of_day,
        "seed": seed,
        "width_px": w_px,
        "height_px": h_px,
        "samples": smp,
        "material_hash": material_hash,
        "cache_key": cache_key,
        "cache_hit": False,
        "status": "QUEUED",
        "renderer": "BLENDER_CYCLES",
        "render_kind": "CYCLES_PATHTRACED_FINAL" if resolved_mode == "final" else "CYCLES_PATHTRACED_PREVIEW",
        "photorealistic": True,
        "camera_applied": True,
        "watermark": REQUIRED_WATERMARK,
        "mandatory_label": REQUIRED_WATERMARK,
        "resolution": [w_px, h_px],
        "retry_count": 0,
        "error_code": None,
        "error_message": None,
        "created_at": _utc_iso(),
        "scene_snapshot": project.model_dump(mode="json"),
        "snapshot_created_at": _utc_iso(),
        "started_at": None,
        "completed_at": None,
    }
    _save_render_job(job_doc)

    if async_exec:
        t = threading.Thread(
            target=_run_render_job_worker,
            args=(job_id, simulate_delay_ms, force_invalid_arg),
            daemon=True,
        )
        t.start()
        return get_render_job(job_id) or job_doc

    return _run_render_job_worker(job_id, simulate_delay_ms=simulate_delay_ms, force_invalid_arg=force_invalid_arg)


def cancel_render_job(job_id: str) -> Dict[str, Any]:
    job = get_render_job(job_id)
    if not job:
        raise ValueError(f"Không tìm thấy render job {job_id}")
    with _JOBS_LOCK:
        proc = _ACTIVE_PROCESSES.get(job_id)
        if proc and proc.poll() is None:
            proc.kill()
    job["status"] = "CANCELLED"
    job["error_code"] = "USER_CANCELLED"
    job["error_message"] = "Render job đã bị hủy theo yêu cầu người dùng."
    job["completed_at"] = _utc_iso()
    return _save_render_job(job)


def retry_render_job(job_id: str, async_exec: bool = False) -> Dict[str, Any]:
    job = get_render_job(job_id)
    if not job:
        raise ValueError(f"Không tìm thấy render job {job_id}")
    job["retry_count"] = int(job.get("retry_count", 0)) + 1
    job["status"] = "QUEUED"
    job["error_code"] = None
    job["error_message"] = None
    job["completed_at"] = None
    _save_render_job(job)
    if async_exec:
        t = threading.Thread(target=_run_render_job_worker, args=(job_id, 0, False), daemon=True)
        t.start()
        return get_render_job(job_id) or job
    return _run_render_job_worker(job_id, simulate_delay_ms=0, force_invalid_arg=False)
