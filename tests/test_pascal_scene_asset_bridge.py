import pytest

from app.models.contracts import FurnitureInstance
from app.services import pascal_scene_asset_bridge as bridge


def _reference(**overrides):
    values = {
        "object_id": "chair-1",
        "model_id": "a-contemporary-accent-chair-featuring-a-rounded-ytct9c",
        "detail_url": "https://furnimesh.com/library/seating/armchair/a-contemporary-accent-chair-featuring-a-rounded-ytct9c/",
        "glb_url": "https://storage.googleapis.com/furnimesh-3d/gbl-files/example.glb",
        "scene_id": "scene-1",
        "expected_revision": 4,
        "position_mm": (1200, 900, 0),
        "bounding_box_mm": (940, 910, 990),
        "dimensions_source": "scene_units",
    }
    values.update(overrides)
    return bridge.PascalFurnitureAssetReference.model_validate(values)


def test_scene_asset_reference_requires_active_scene_revision(monkeypatch):
    monkeypatch.setattr(bridge, "validate_furnimesh_url", lambda *args, **kwargs: None)
    reference = _reference()

    with pytest.raises(ValueError, match="expected_revision"):
        bridge.validate_pascal_asset_reference(reference, active_scene_id="scene-1", active_revision=5)


def test_scene_units_are_not_reported_as_physical_dimensions(monkeypatch):
    monkeypatch.setattr(bridge, "validate_furnimesh_url", lambda *args, **kwargs: None)
    reference = _reference()

    result = bridge.validate_pascal_asset_reference(reference, active_scene_id="scene-1", active_revision=4)
    payload = bridge.build_scene_furniture_payload(
        reference,
        room_id="room_main",
        category="seating",
        name="FurniMesh chair",
    )

    assert result["needs_calibration"] is True
    assert payload["pascal_asset_id"].startswith("furnimesh:")
    assert payload["measurement_evidence"]["width"]["status"] == "UNKNOWN"
    assert payload["measurement_evidence"]["width"]["value"] is None
    assert FurnitureInstance.model_validate(payload).normalized_glb == reference.glb_url
