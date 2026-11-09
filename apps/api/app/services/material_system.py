"""Renderer-neutral PBR material registry, validation, resolution and GLB slot audit."""
from __future__ import annotations

import json
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.contracts import MaterialDefinition, MaterialOverride


ROOT_DIR = Path(__file__).resolve().parents[4]
MATERIAL_ROOT = ROOT_DIR / "data" / "materials"
REGISTRY_DIR = MATERIAL_ROOT / "registry"


class MaterialSystemError(RuntimeError):
    pass


def _safe_id(value: str) -> str:
    safe = "".join(char for char in value if char.isalnum() or char in {"_", "-"})
    if not safe or safe != value:
        raise MaterialSystemError("Material ID không hợp lệ")
    return safe


def list_materials() -> List[MaterialDefinition]:
    if not REGISTRY_DIR.exists():
        return []
    result: List[MaterialDefinition] = []
    for path in sorted(REGISTRY_DIR.glob("*.json")):
        try:
            result.append(MaterialDefinition.model_validate_json(path.read_text(encoding="utf-8")))
        except Exception as exc:
            raise MaterialSystemError(f"Material registry lỗi tại {path.name}: {exc}") from exc
    return result


def get_material(material_id: str) -> Optional[MaterialDefinition]:
    safe_id = _safe_id(material_id)
    path = REGISTRY_DIR / f"{safe_id}.json"
    if not path.is_file():
        return None
    return MaterialDefinition.model_validate_json(path.read_text(encoding="utf-8"))


def save_material(material: MaterialDefinition) -> MaterialDefinition:
    safe_id = _safe_id(material.material_id)
    existing = get_material(safe_id)
    if existing:
        material.version = existing.version + 1
    material.created_at = datetime.now(timezone.utc).isoformat()
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    temp = REGISTRY_DIR / f"{safe_id}.json.tmp"
    temp.write_text(material.model_dump_json(indent=2), encoding="utf-8")
    temp.replace(REGISTRY_DIR / f"{safe_id}.json")
    return material


def resolve_material(override: MaterialOverride) -> Dict[str, Any]:
    definition = get_material(override.material_id)
    if not definition:
        raise MaterialSystemError(f"Không tìm thấy material {override.material_id}")
    if definition.version != override.material_version:
        raise MaterialSystemError(
            f"Material version không khớp: yêu cầu {override.material_version}, registry {definition.version}"
        )
    pbr = definition.pbr.model_dump()
    pbr.update(override.pbr)
    return {
        "schema_version": definition.schema_version,
        "material_id": definition.material_id,
        "material_version": definition.version,
        "kind": definition.kind,
        "pbr": pbr,
        "textures": [texture.model_dump() for texture in definition.textures],
        "physical_scale": (override.texture_scale or definition.physical_scale).model_dump(),
        "tint": override.tint or definition.tint,
        "preserve_source_textures": definition.preserve_source_textures,
        "source": {
            "url": definition.source_url,
            "author": definition.author,
            "license": definition.license,
            "license_url": definition.license_url,
        },
        "product_ref": definition.product_ref,
        "price_status": definition.price_status,
    }


def inspect_glb_material_structure(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        raise MaterialSystemError("Không tìm thấy GLB để audit material slot")
    with path.open("rb") as stream:
        magic, version, _ = struct.unpack("<4sII", stream.read(12))
        if magic != b"glTF" or version != 2:
            raise MaterialSystemError("File không phải GLB 2.0")
        json_length, json_type = struct.unpack("<I4s", stream.read(8))
        if json_type != b"JSON":
            raise MaterialSystemError("GLB không có JSON chunk hợp lệ")
        document = json.loads(stream.read(json_length).decode("utf-8").rstrip(" \t\r\n\x00"))

    materials = document.get("materials") or []
    meshes = document.get("meshes") or []
    slots: List[Dict[str, Any]] = []
    for mesh_index, mesh in enumerate(meshes):
        for primitive_index, primitive in enumerate(mesh.get("primitives") or []):
            material_index = primitive.get("material")
            material_name = (
                materials[material_index].get("name")
                if isinstance(material_index, int) and material_index < len(materials)
                else None
            )
            slots.append(
                {
                    "mesh_index": mesh_index,
                    "mesh_name": mesh.get("name") or f"mesh_{mesh_index}",
                    "primitive_index": primitive_index,
                    "material_index": material_index,
                    "source_material_name": material_name or "UNASSIGNED",
                }
            )
    independently_editable = len({slot["material_index"] for slot in slots}) > 1
    return {
        "node_count": len(document.get("nodes") or []),
        "mesh_count": len(meshes),
        "primitive_count": len(slots),
        "material_count": len(materials),
        "slots": slots,
        "independent_part_editing": independently_editable,
        "semantic_mapping_status": "MAPPABLE" if independently_editable else "WHOLE_ASSET_ONLY",
        "limitation": None
        if independently_editable
        else "GLB chỉ có một material/primitive; không thể đổi riêng vải và chân mà không segmentation mesh.",
    }
