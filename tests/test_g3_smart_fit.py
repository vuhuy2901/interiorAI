from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
if str(API) not in sys.path:
    sys.path.insert(0, str(API))

from app.db import build_default_demo_project  # noqa: E402
from app.models.contracts import FurnitureInstance  # noqa: E402
from app.services.material_system import inspect_glb_material_structure  # noqa: E402
from app.services.smart_fit import (  # noqa: E402
    assess_fit,
    generate_placement_options,
    plan_resize,
    polygons_overlap_sat,
    oriented_corners,
)


def test_real_sofa_03_has_two_actual_material_slots():
    path = ROOT / "data" / "assets" / "library" / "asset_ph_sofa_03_1k" / "normalized.glb"
    audit = inspect_glb_material_structure(path)
    assert audit["mesh_count"] == 1
    assert audit["primitive_count"] == 2
    assert audit["material_count"] == 2
    assert {slot["source_material_name"] for slot in audit["slots"]} == {"sofa_03", "sofa_03_fringe"}
    assert audit["independent_part_editing"] is True


def test_resize_policies_never_distort_fixed_or_uniform_assets():
    fixed = FurnitureInstance(id="fixed", sku="SKU", name="Fixed sofa", width_mm=2100, depth_mm=880, height_mm=780)
    rejected = plan_resize(fixed, [1500, 880, 780])
    assert rejected["ok"] is False
    assert rejected["status"] == "REJECTED_FIXED_SIZE"
    assert rejected["dimensions_mm"] == [2100, 880, 780]

    decor = fixed.model_copy(update={"id": "decor", "sizing_policy": "UNIFORM_SCALABLE", "uniform_scale_range": [0.5, 1.5]})
    uniform = plan_resize(decor, [1050, 440, 390])
    assert uniform["ok"] is True
    assert uniform["scale"] == 0.5
    assert uniform["dimensions_mm"] == [1050.0, 440.0, 390.0]

    cabinet = fixed.model_copy(update={
        "id": "cabinet",
        "sizing_policy": "PARAMETRIC",
        "width_mm": 1800,
        "depth_mm": 600,
        "height_mm": 2400,
        "parametric_module_mm": 300,
        "parametric_axes": ["width"],
    })
    parametric = plan_resize(cabinet, [1500, 600, 2400])
    assert parametric["ok"] is True
    assert parametric["module_count"] == 5
    assert parametric["dimensions_mm"] == [1500, 600, 2400]
    assert parametric["requires_geometry_regeneration"] is True


def test_l_shaped_room_sat_collision_and_two_generated_options():
    project = build_default_demo_project()
    project.rooms[0].polygon_mm = [[0, 0], [4000, 0], [4000, 2000], [2000, 2000], [2000, 4000], [0, 4000]]
    decor = FurnitureInstance(
        id="decor",
        sku="DECOR",
        name="Decor",
        category="decor",
        x_mm=800,
        y_mm=800,
        width_mm=400,
        depth_mm=400,
        height_mm=500,
        sizing_policy="UNIFORM_SCALABLE",
        uniform_scale_range=[0.5, 1.5],
    )
    project.furniture_instances = [decor]
    assert assess_fit(project, decor)["fits"] is True
    outside = assess_fit(project, decor, x_mm=3000, y_mm=3000)
    assert outside["fits"] is False
    assert outside["inside_room_polygon"] is False

    first = oriented_corners(1000, 1000, 900, 500, 45)
    second = oriented_corners(1200, 1000, 900, 500, -20)
    assert polygons_overlap_sat(first, second) is True

    options = generate_placement_options(project, "decor", limit=2)
    assert options["ok"] is True
    assert len(options["options"]) == 2
    assert options["evaluated_candidates"] > 2
    assert all(option["fit"]["fits"] for option in options["options"])
