"""FurniMesh-to-Pascal scene asset contract.

The bridge deliberately stops at a validated, revision-bound addition envelope.
The existing scene_furniture router remains the only mutation path: it performs
the atomic CAS, idempotency receipt, spatial QA, and Pascal verification.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.asset_pipeline import validate_furnimesh_url


class PascalFurnitureAssetReference(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    object_id: str = Field(min_length=1, max_length=200)
    provider: Literal["furnimesh"] = "furnimesh"
    model_id: str = Field(min_length=1, max_length=300)
    detail_url: str = Field(min_length=1, max_length=2000)
    glb_url: str = Field(min_length=1, max_length=2000)
    scene_id: str = Field(min_length=1, max_length=200)
    expected_revision: int = Field(strict=True, ge=1)
    position_mm: tuple[float, float, float]
    rotation_deg: tuple[float, float, float] = (0.0, 0.0, 0.0)
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0)
    bounding_box_mm: tuple[float, float, float]
    dimensions_source: Literal["physical_meters", "scene_units", "unknown"] = "unknown"
    approval_required: bool = True

    @field_validator("position_mm", "rotation_deg", "scale", "bounding_box_mm")
    @classmethod
    def finite_values(cls, value):
        import math

        if not all(math.isfinite(float(item)) for item in value):
            raise ValueError("scene vectors must contain finite values")
        return value


def validate_pascal_asset_reference(
    reference: PascalFurnitureAssetReference,
    *,
    active_scene_id: str,
    active_revision: int,
) -> dict[str, object]:
    """Validate the read-before-write CAS envelope without mutating a scene."""
    if reference.scene_id != active_scene_id:
        raise ValueError("scene_id does not match the active Pascal scene")
    if reference.expected_revision != active_revision:
        raise ValueError("expected_revision does not match the active scene revision")
    if any(value <= 0 for value in reference.scale):
        raise ValueError("scale values must be greater than zero")
    if any(value <= 0 for value in reference.bounding_box_mm):
        raise ValueError("bounding_box_mm values must be greater than zero")
    validate_furnimesh_url(reference.detail_url)
    validate_furnimesh_url(reference.glb_url, asset=True)
    return {
        "ok": True,
        "scene_id": reference.scene_id,
        "expected_revision": reference.expected_revision,
        "asset_id": f"furnimesh:{reference.model_id}",
        "needs_calibration": reference.dimensions_source != "physical_meters",
        "approval_required": reference.approval_required,
    }


def build_scene_furniture_payload(
    reference: PascalFurnitureAssetReference,
    *,
    room_id: str,
    category: str,
    name: str,
    price_vnd: float = 0,
) -> dict[str, object]:
    """Map FurniMesh provenance to the existing add-only scene request shape."""
    width_mm, depth_mm, height_mm = reference.bounding_box_mm
    return {
        "id": reference.object_id,
        "sku": f"furnimesh:{reference.model_id}",
        "name": name,
        "category": category,
        "room_id": room_id,
        "x_mm": reference.position_mm[0],
        "y_mm": reference.position_mm[1],
        "z_mm": reference.position_mm[2],
        "rotation_deg": reference.rotation_deg[2],
        "width_mm": width_mm,
        "depth_mm": depth_mm,
        "height_mm": height_mm,
        "price_vnd": price_vnd,
        "pascal_asset_id": f"furnimesh:{reference.model_id}",
        "vendor": "FurniMesh",
        "asset_id": reference.model_id,
        "source_url": reference.detail_url,
        "normalized_glb": reference.glb_url,
        "original_dimensions_mm": [width_mm, depth_mm, height_mm],
        "measurement_evidence": {
            axis: {
                "value": value if reference.dimensions_source == "physical_meters" else None,
                "unit": "mm",
                "status": "CONFIRMED" if reference.dimensions_source == "physical_meters" else "UNKNOWN",
                "source": "FurniMesh scene metadata",
                "source_ref": reference.detail_url,
                "notes": "Calibrate before treating scene units as physical dimensions."
                if reference.dimensions_source != "physical_meters" else None,
            }
            for axis, value in zip(("width", "depth", "height"), (width_mm, depth_mm, height_mm))
        },
    }
