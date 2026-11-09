import json
import struct
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.services import asset_pipeline, blender_mcp
from app.services.asset_pipeline import (
    AssetPipelineError,
    pack_gltf_to_glb,
    register_user_glb,
    validate_glb,
)


def _write_triangle_gltf(directory: Path) -> Path:
    # Three float32 XYZ vertices and three uint16 indices.
    positions = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 1)
    indices = struct.pack("<3H", 0, 1, 2)
    payload = positions + indices
    (directory / "triangle.bin").write_bytes(payload)
    document = {
        "asset": {"version": "2.0", "generator": "ATELIER test fixture"},
        "buffers": [{"uri": "triangle.bin", "byteLength": len(payload)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(positions), "target": 34962},
            {"buffer": 0, "byteOffset": len(positions), "byteLength": len(indices), "target": 34963},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "min": [0, 0, 0],
                "max": [1, 1, 1],
            },
            {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"},
        ],
        "materials": [{"name": "Fabric_Main"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "material": 0}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    source = directory / "triangle.gltf"
    source.write_text(json.dumps(document), encoding="utf-8")
    return source


def test_pack_validate_and_register_user_glb(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(asset_pipeline, "ASSET_LIBRARY_DIR", tmp_path / "library")
    source = _write_triangle_gltf(tmp_path)
    glb = pack_gltf_to_glb(source, tmp_path / "triangle.glb")
    report = validate_glb(glb)

    assert report["valid"] is True
    assert report["mesh_count"] == 1
    assert report["primitive_count"] == 1
    assert report["material_names"] == ["Fabric_Main"]
    assert report["dimensions_mm"] == [1000.0, 1000.0, 1000.0]

    metadata = register_user_glb(
        glb,
        name="Licensed triangle",
        category="test_fixture",
        author="ATELIER test",
        license_name="CC0-1.0",
        source_url="https://example.invalid/triangle",
    )
    assert metadata.validation_status == "VALID"
    assert len(metadata.geometry_hash) == 64
    assert metadata.material_slots[0].source_material_name == "Fabric_Main"


def test_register_rejects_missing_license(tmp_path: Path):
    glb = pack_gltf_to_glb(_write_triangle_gltf(tmp_path), tmp_path / "triangle.glb")
    with pytest.raises(AssetPipelineError, match="giấy phép"):
        register_user_glb(
            glb,
            name="Unlicensed triangle",
            category="test_fixture",
            author="Unknown",
            license_name="",
        )


def test_blender_missing_is_blocked_without_fake_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(blender_mcp, "is_blender_available", lambda: (False, "Blender missing"))
    output = tmp_path / "must-not-exist.glb"
    result = blender_mcp.generate_custom_furniture_glb(
        "test", "Test", "test", [1000, 500, 750], output
    )

    assert result["ok"] is False
    assert result["status"] == "BLOCKED"
    assert result["error_code"] == "BLENDER_NOT_AVAILABLE"
    assert not output.exists()
