"""Strict measurement and identity validation before scene persistence."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List

from app.models.contracts import CanonicalProject, DimensionChain, FurnitureInstance


FURNITURE_MEASUREMENT_FIELDS = (
    "x_mm",
    "y_mm",
    "z_mm",
    "width_mm",
    "depth_mm",
    "height_mm",
    "rotation_deg",
    "offset_mm",
    "wall_distance_mm",
)


def _issue(code: str, message: str, **context: Any) -> Dict[str, Any]:
    return {"code": code, "message": message, **context}


def _room_extent(project: CanonicalProject, room_id: str, axis: str) -> float | None:
    room = next((item for item in project.rooms if item.id == room_id), None)
    if room is None or len(room.polygon_mm) < 3:
        return None
    index = 0 if axis == "width" else 1
    values = [float(point[index]) for point in room.polygon_mm]
    return max(values) - min(values)


def validate_furniture_measurements(item: FurnitureInstance) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    if not item.category.strip():
        issues.append(_issue("MISSING_CATEGORY", "Furniture category is required.", entity_id=item.id))
    if not item.pascal_asset_id.strip():
        issues.append(_issue("MISSING_ASSET", "Furniture asset identity is required.", entity_id=item.id))
    if item.legacy_flags:
        issues.append(_issue(
            "LEGACY_DEFAULT_REVIEW_REQUIRED",
            "Legacy defaults must be reviewed before this entity can be saved again.",
            entity_id=item.id,
            flags=list(item.legacy_flags),
        ))

    for field_name in FURNITURE_MEASUREMENT_FIELDS:
        evidence = item.measurement_evidence.get(field_name)
        if evidence is None:
            issues.append(_issue(
                "MISSING_MEASUREMENT_EVIDENCE",
                f"Measurement evidence is required for {field_name}.",
                entity_id=item.id,
                field=field_name,
            ))
            continue
        if evidence.status == "UNKNOWN":
            issues.append(_issue(
                "UNKNOWN_MEASUREMENT",
                f"UNKNOWN measurement cannot be persisted as geometry: {field_name}.",
                entity_id=item.id,
                field=field_name,
                source=evidence.source,
            ))
            continue
        actual = float(getattr(item, field_name))
        expected = float(evidence.value)
        if abs(actual - expected) > 0.001:
            issues.append(_issue(
                "MEASUREMENT_VALUE_MISMATCH",
                f"Stored value and evidence differ for {field_name}.",
                entity_id=item.id,
                field=field_name,
                stored_value=actual,
                evidence_value=expected,
                delta=round(actual - expected, 6),
            ))
    return issues


def validate_dimension_chain(project: CanonicalProject, chain: DimensionChain) -> List[Dict[str, Any]]:
    unknown_segments = [
        segment.id for segment in chain.segments if segment.measurement.status == "UNKNOWN"
    ]
    if chain.expected_total.status == "UNKNOWN" or unknown_segments:
        return [_issue(
            "UNKNOWN_DIMENSION_CHAIN",
            "Dimension chain contains UNKNOWN values and cannot drive geometry.",
            chain_id=chain.id,
            unknown_segments=unknown_segments,
            expected_total_status=chain.expected_total.status,
        )]

    segment_values = [float(segment.measurement.value) for segment in chain.segments]
    segment_total = sum(segment_values)
    expected_total = float(chain.expected_total.value)
    delta = segment_total - expected_total
    issues: List[Dict[str, Any]] = []
    if abs(delta) > chain.tolerance_mm:
        issues.append(_issue(
            "DIMENSION_CHAIN_MISMATCH",
            "Dimension segments do not match the declared total; no scaling was applied.",
            chain_id=chain.id,
            axis=chain.axis,
            segments=segment_values,
            segment_total_mm=round(segment_total, 6),
            expected_total_mm=round(expected_total, 6),
            delta_mm=round(delta, 6),
            tolerance_mm=chain.tolerance_mm,
        ))

    room_extent = _room_extent(project, chain.room_id, chain.axis)
    if room_extent is None:
        issues.append(_issue(
            "DIMENSION_CHAIN_ROOM_MISSING",
            "Dimension chain references a missing or invalid room.",
            chain_id=chain.id,
            room_id=chain.room_id,
        ))
    elif abs(room_extent - expected_total) > chain.tolerance_mm:
        issues.append(_issue(
            "DIMENSION_CHAIN_ROOM_MISMATCH",
            "Declared dimension total does not match the room extent; no scaling was applied.",
            chain_id=chain.id,
            axis=chain.axis,
            room_extent_mm=round(room_extent, 6),
            expected_total_mm=round(expected_total, 6),
            delta_mm=round(room_extent - expected_total, 6),
            tolerance_mm=chain.tolerance_mm,
        ))
    return issues


def validate_project_for_persistence(project: CanonicalProject) -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    for item in project.furniture_instances:
        issues.extend(validate_furniture_measurements(item))
    for chain in project.dimension_chains:
        issues.extend(validate_dimension_chain(project, chain))
    return {"valid": not issues, "issues": issues}
