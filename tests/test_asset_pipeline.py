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
    FurniMeshError,
    get_furnimesh_details,
    pack_gltf_to_glb,
    parse_furnimesh_listing_html,
    register_user_glb,
    validate_furnimesh_url,
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


def test_furnimesh_listing_parser_returns_real_detail_candidates():
    html = """
    <a href="/library/seating/armchair/modern-chair-abc123/">Modern Chair</a>
    <a href="/library/format/glb/">GLB</a>
    <a href="https://evil.example/library/seating/chair/nope/">ignore</a>
    """
    results = parse_furnimesh_listing_html(html)
    assert [item.model_id for item in results] == ["modern-chair-abc123"]
    assert results[0].detail_url == "https://furnimesh.com/library/seating/armchair/modern-chair-abc123"


def test_furnimesh_detail_parser_preserves_scene_units_and_glb_url(monkeypatch: pytest.MonkeyPatch):
    detail = """
    <script type="application/ld+json">{"category":"wrong JSON-LD context"}</script>
    <h1>Modern Upholstered Chair</h1>
    <img src="https://furnimesh.com/images/chair.jpg">
    <dl><dt>Category</dt><dd>Seating → Armchair</dd></dl>
    <h2>About this model</h2><p>A real chair.</p><h2>Key features</h2>
    <a href="https://storage.googleapis.com/furnimesh-3d/gbl-files/chair.glb">GLB (48.3 MB)</a>
    <div>Model extent</div><div>0.94 × 0.91 × 0.99 (scene units — adjust scale as needed)</div>
    <div>Polycount</div><div>291,120</div>
    """
    monkeypatch.setattr(asset_pipeline, "_reject_private_hostname", lambda _host: None)
    monkeypatch.setattr(asset_pipeline, "_fetch_furnimesh_html", lambda _url: (detail, "https://furnimesh.com/library/seating/armchair/chair-abc/"))
    candidate = get_furnimesh_details(detail_url="https://furnimesh.com/library/seating/armchair/chair-abc/")
    assert candidate.name == "Modern Upholstered Chair"
    assert candidate.glb_url == "https://storage.googleapis.com/furnimesh-3d/gbl-files/chair.glb"
    assert candidate.category == "Seating → Armchair"
    assert candidate.technical["dimensions_source"] == "scene_units"
    assert candidate.technical["polycount"] == 291120


def test_furnimesh_url_validation_rejects_ssrf_and_unapproved_hosts(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(asset_pipeline, "_reject_private_hostname", lambda _host: None)
    with pytest.raises(FurniMeshError):
        validate_furnimesh_url("http://furnimesh.com/library/")
    with pytest.raises(FurniMeshError):
        validate_furnimesh_url("https://example.com/private.glb", asset=True)
    with pytest.raises(FurniMeshError):
        validate_furnimesh_url("https://storage.googleapis.com/other-bucket/model.glb", asset=True)
