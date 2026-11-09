"""Generate machine-readable G2 audit artifacts from the implemented system."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
if str(API) not in sys.path:
    sys.path.insert(0, str(API))

from app.db import get_project  # noqa: E402
from app.services.material_system import inspect_glb_material_structure, list_materials  # noqa: E402


def main() -> None:
    evidence = ROOT / "docs" / "build" / "EVIDENCE" / "G2_2026-11-10_004858+0700"
    evidence.mkdir(parents=True, exist_ok=True)
    glb = ROOT / "data" / "assets" / "library" / "asset_ph_sofa_01_1k" / "normalized.glb"
    slot_audit = inspect_glb_material_structure(glb)
    (evidence / "sofa_slot_audit.json").write_text(
        json.dumps(slot_audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    materials = [material.model_dump() for material in list_materials()]
    (evidence / "material_registry_snapshot.json").write_text(
        json.dumps(materials, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    project = get_project("proj_g2_material_demo")
    sofa = next(
        (item for item in (project.furniture_instances if project else []) if item.id == "furn_sofa_main"),
        None,
    )
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gate": "G2",
        "overall_status": "PARTIAL",
        "reason_not_complete": "Sofa_01 has one primitive/material, so fabric and legs cannot be edited independently. Full floor/tile PBR UI is not complete.",
        "slot_audit": slot_audit,
        "registry_material_count": len(materials),
        "persisted_demo_revision": project.revision if project else None,
        "persisted_sofa_overrides": {
            key: value.model_dump() for key, value in (sofa.material_overrides if sofa else {}).items()
        },
        "tests": {
            "T1_slot_mapping": "PASS_WITH_LIMITATION",
            "T2_selected_slot_only": "PASS_FOR_WHOLE_ASSET_SLOT",
            "T3_three_changes_no_reload_identity_stable": "PASS",
            "T4_fabric_pbr": "PASS",
            "T4_wood_pbr": "NOT_VERIFIED",
            "T4_tile_pbr": "PARTIAL",
            "T5_800x800_grout_3mm": "SCHEMA_AND_REPEAT_MATH_PASS_VISUAL_NOT_VERIFIED",
            "T6_reload_persistence": "PASS",
            "T7_object_isolation": "PASS",
            "T8_renderer_neutral_definition": "PASS",
            "T9_revision_conflict": "PASS",
            "T10_invalid_png_controlled_error": "PASS",
        },
        "evidence_files": [
            "browser_material_metrics.json",
            "visual_comparison.json",
            "sofa_before.png",
            "sofa_after_moss.png",
            "sofa_restored_after_reload.png",
            "comparison_before_sand_3d.png",
            "comparison_after_moss_3d.png",
        ],
    }
    (evidence / "g2_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"evidence": str(evidence), "status": manifest["overall_status"]}))


if __name__ == "__main__":
    main()
