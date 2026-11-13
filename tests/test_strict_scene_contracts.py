import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.models.contracts import (  # noqa: E402
    CanonicalProject,
    DimensionChain,
    DimensionSegment,
    FurnitureInstance,
    MeasurementEvidence,
    RoomZone,
)
from app.services.measurement_validation import (  # noqa: E402
    FURNITURE_MEASUREMENT_FIELDS,
    validate_project_for_persistence,
)


GATEWAY = ROOT / "packages" / "pascal-adapter" / "gateway.mjs"


def evidence_for(item: FurnitureInstance, source: str = "unit-test") -> dict:
    return {
        field: MeasurementEvidence(
            value=float(getattr(item, field)),
            unit="deg" if field == "rotation_deg" else "mm",
            status="CONFIRMED",
            source=source,
        )
        for field in FURNITURE_MEASUREMENT_FIELDS
    }


def valid_item(**overrides) -> FurnitureInstance:
    values = {
        "id": "desk-1",
        "sku": "DESK-1",
        "name": "Desk",
        "category": "desk",
        "pascal_asset_id": "atelier-study-desk",
        "x_mm": 2500,
        "y_mm": 1800,
        "z_mm": 0,
        "width_mm": 1050,
        "depth_mm": 520,
        "height_mm": 750,
        "rotation_deg": 0,
        "offset_mm": 0,
        "wall_distance_mm": 0,
    }
    values.update(overrides)
    item = FurnitureInstance(**values)
    item.measurement_evidence = evidence_for(item)
    item.legacy_flags = []
    return item


def project_with(item: FurnitureInstance, *, chains=None) -> CanonicalProject:
    return CanonicalProject(
        project_id="strict-test",
        name="Strict test",
        rooms=[RoomZone(
            id="room-main",
            name="Room",
            room_type="bedroom",
            polygon_mm=[[0, 0], [3100, 0], [3100, 4000], [0, 4000]],
        )],
        furniture_instances=[item],
        dimension_chains=chains or [],
    )


def test_furniture_identity_has_no_implicit_sofa_defaults():
    with pytest.raises(ValidationError) as category_error:
        FurnitureInstance(id="bad", sku="BAD", name="Missing category", pascal_asset_id="asset")
    assert "category" in str(category_error.value)

    with pytest.raises(ValidationError) as asset_error:
        FurnitureInstance(id="bad", sku="BAD", name="Missing asset", category="desk")
    assert "pascal_asset_id" in str(asset_error.value)


def test_legacy_sofa_proxy_is_flagged_and_rejected_on_resave():
    item = FurnitureInstance(
        id="legacy-bed",
        sku="LEGACY",
        name="Legacy bed",
        category="bunk_bed",
        pascal_asset_id="sofa",
    )
    assert "LEGACY_DEFAULT_PASCAL_ASSET_SOFA" in item.legacy_flags
    report = validate_project_for_persistence(project_with(item))
    assert report["valid"] is False
    assert any(issue["code"] == "LEGACY_DEFAULT_REVIEW_REQUIRED" for issue in report["issues"])


def test_measurement_evidence_must_match_stored_geometry():
    item = valid_item()
    item.measurement_evidence["width_mm"].value = 1040
    report = validate_project_for_persistence(project_with(item))
    mismatch = next(issue for issue in report["issues"] if issue["code"] == "MEASUREMENT_VALUE_MISMATCH")
    assert mismatch["field"] == "width_mm"
    assert mismatch["stored_value"] == 1050
    assert mismatch["evidence_value"] == 1040


def test_dimension_chain_reports_exact_mismatch_without_scaling():
    chain = DimensionChain(
        id="kid-room-width",
        room_id="room-main",
        axis="width",
        segments=[
            DimensionSegment(id="left", label="Left", measurement=MeasurementEvidence(value=600, status="CONFIRMED", source="drawing")),
            DimensionSegment(id="bed", label="Bed", measurement=MeasurementEvidence(value=1970, status="CONFIRMED", source="drawing")),
            DimensionSegment(id="desk", label="Desk", measurement=MeasurementEvidence(value=520, status="CONFIRMED", source="drawing")),
        ],
        expected_total=MeasurementEvidence(value=3100, status="CONFIRMED", source="user-confirmed room width"),
    )
    report = validate_project_for_persistence(project_with(valid_item(), chains=[chain]))
    mismatch = next(issue for issue in report["issues"] if issue["code"] == "DIMENSION_CHAIN_MISMATCH")
    assert mismatch["segments"] == [600.0, 1970.0, 520.0]
    assert mismatch["segment_total_mm"] == 3090.0
    assert mismatch["expected_total_mm"] == 3100.0
    assert mismatch["delta_mm"] == -10.0


def test_valid_explicit_measurements_and_chain_pass():
    chain = DimensionChain(
        id="room-width",
        room_id="room-main",
        axis="width",
        segments=[
            DimensionSegment(id="a", label="A", measurement=MeasurementEvidence(value=600, status="CONFIRMED", source="drawing")),
            DimensionSegment(id="b", label="B", measurement=MeasurementEvidence(value=1970, status="CONFIRMED", source="drawing")),
            DimensionSegment(id="c", label="C", measurement=MeasurementEvidence(value=530, status="CONFIRMED", source="drawing")),
        ],
        expected_total=MeasurementEvidence(value=3100, status="CONFIRMED", source="drawing"),
    )
    report = validate_project_for_persistence(project_with(valid_item(), chains=[chain]))
    assert report == {"valid": True, "issues": []}


def test_api_rejects_invalid_scene_before_sync_or_save(monkeypatch):
    from app import main

    existing = project_with(valid_item())
    invalid = project_with(FurnitureInstance(
        id="legacy",
        sku="LEGACY",
        name="Legacy",
        category="desk",
        pascal_asset_id="sofa",
    ))
    calls = {"sync": 0, "save": 0}

    monkeypatch.setattr(main, "get_project", lambda _project_id: existing)

    async def fake_sync(_project):
        calls["sync"] += 1
        return {"ok": True}

    def fake_save(*_args, **_kwargs):
        calls["save"] += 1

    monkeypatch.setattr(main, "sync_canonical_to_pascal", fake_sync)
    monkeypatch.setattr(main, "save_project", fake_save)

    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_update_scene("strict-test", invalid))
    assert error.value.status_code == 422
    assert error.value.detail["code"] == "SCENE_MEASUREMENT_VALIDATION_FAILED"
    assert calls == {"sync": 0, "save": 0}


def test_pascal_gateway_rejects_missing_identity_before_fallback():
    payload = {
        "action": "sync_from_canonical",
        "canonical": {
            "rooms": [{"id": "room-main", "polygon_mm": [[0, 0], [3100, 0], [3100, 4000], [0, 4000]]}],
            "furniture_instances": [{"id": "missing-category", "pascal_asset_id": "asset"}],
        },
    }
    result = subprocess.run(
        ["node", str(GATEWAY)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=30,
    )
    output = json.loads(result.stdout)
    assert output["ok"] is False
    assert "requires category" in output["error"]
