from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Mapping

import pytest

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.services.sweethome3d_bridge import (  # noqa: E402
    SweetHome3DConverter,
    catalog_rule_for,
    mm_to_cm,
    normalize_scene,
    render_and_export,
)


def scene_fixture(category: str = "desk") -> dict[str, Any]:
    return {
        "project_id": "arbitrary_scene_id",
        "name": "Any room",
        "revision": 7,
        "rooms": [{"id": "r", "name": "Room", "polygon_mm": [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]}],
        "walls": [
            {"id": "top", "start_mm": [0, 0], "end_mm": [4000, 0], "thickness_mm": 100, "height_mm": 2700},
            {"id": "right", "start_mm": [4000, 0], "end_mm": [4000, 3000], "thickness_mm": 100, "height_mm": 2700},
            {"id": "bottom", "start_mm": [4000, 3000], "end_mm": [0, 3000], "thickness_mm": 100, "height_mm": 2700},
            {"id": "left", "start_mm": [0, 3000], "end_mm": [0, 0], "thickness_mm": 100, "height_mm": 2700},
        ],
        "openings": [{"id": "d", "wall_id": "left", "t": 0.75, "width_mm": 900, "height_mm": 2100, "sill_height_mm": 0}],
        "windows": [{"id": "w", "wall_id": "right", "t": 0.25, "width_mm": 1200, "height_mm": 1200, "sill_height_mm": 900}],
        "furniture_instances": [{"id": "f", "name": "Item", "category": category, "x_mm": 2000, "y_mm": 1500,
                                  "z_mm": 0, "width_mm": 1000, "depth_mm": 500, "height_mm": 750,
                                  "rotation_deg": 90, "color_hex": "#ABCDEF"}],
    }


class FakeClient:
    def __init__(self, *, catalog: bool = True) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.catalog = catalog
        self.counter = 0

    def call_tool(self, name: str, arguments: Mapping[str, Any] | None = None) -> Any:
        args = dict(arguments or {})
        self.calls.append((name, args))
        if name == "list_furniture_catalog":
            if not self.catalog:
                return {"items": []}
            return {"items": [{"id": f"catalog-{args.get('query')}", "name": args.get("query"), "category": "Test"}]}
        if name in {"create_wall", "create_room_polygon", "place_door_or_window", "place_furniture", "generate_shape"}:
            self.counter += 1
            return {"id": f"generated-{self.counter}"}
        return {"ok": True}


def test_units_and_coordinates_are_generic() -> None:
    assert mm_to_cm(4190) == 419
    normalized = normalize_scene(scene_fixture())
    assert normalized["project_id"] == "arbitrary_scene_id"
    assert normalized["walls"][0]["x_end"] == 400
    assert normalized["furniture"][0]["width"] == 100
    assert normalized["openings"][1]["elevation"] == 90


def test_missing_category_is_rejected() -> None:
    scene = scene_fixture()
    del scene["furniture_instances"][0]["category"]
    with pytest.raises(ValueError, match="missing category"):
        normalize_scene(scene)


def test_known_categories_do_not_collapse_to_sofa() -> None:
    assert catalog_rule_for("desk").query == "desk"
    assert catalog_rule_for("wardrobe").query == "wardrobe"
    assert catalog_rule_for("bunk_bed").query == "bed"
    assert catalog_rule_for("tv_console").query == "TV unit"


def test_unknown_category_uses_flagged_shape_not_sofa() -> None:
    client = FakeClient(catalog=False)
    result = SweetHome3DConverter(client).convert(scene_fixture("custom_sculpture"))
    tool_names = [name for name, _ in client.calls]
    assert "generate_shape" in tool_names
    furniture_record = next(model for model in result.manifest["models"] if model["studio_category"] == "custom_sculpture")
    assert furniture_record["approximate"] is True
    assert furniture_record["catalog_name"] is None
    assert not any(args.get("name", "").casefold() == "sofa" for _, args in client.calls)


def test_converter_preserves_counts_and_dimensions() -> None:
    client = FakeClient()
    result = SweetHome3DConverter(client).convert(scene_fixture())
    assert result.manifest["counts"] == {"walls": 4, "rooms": 1, "openings": 2, "furniture": 1}
    modify_calls = [args for name, args in client.calls if name == "modify_furniture"]
    assert any(call.get("width") == 100 and call.get("depth") == 50 and call.get("height") == 75 for call in modify_calls)
    assert result.manifest["models"][-1]["license_url"] == "https://www.sweethome3d.com/license/"
    assert result.primary_furniture_id is not None
    assert result.manifest["camera_plan"]["entrance"]["x"] > 0
    assert result.manifest["camera_plan"]["bounds"] == {"min_x": 0.0, "max_x": 400.0, "min_y": 0.0, "max_y": 300.0}
    assert result.manifest["camera_plan"]["primary_target"]["z"] == 37.5
    room_call = next(args for name, args in client.calls if name == "create_room_polygon")
    assert room_call["ceilingVisible"] is True
    environment_call = next(args for name, args in client.calls if name == "set_environment")
    assert environment_call["lightColor"] == "#FFFFFF"


def test_step3_and_step4_materials_decor_and_overhead_ceiling(tmp_path: Path) -> None:
    scene = scene_fixture("sofa")
    scene["furniture_instances"].append(
        {
            "id": "f2",
            "name": "Coffee Table",
            "category": "coffee_table",
            "x_mm": 2200,
            "y_mm": 1500,
            "z_mm": 0,
            "width_mm": 1000,
            "depth_mm": 600,
            "height_mm": 420,
            "rotation_deg": 0,
            "color_hex": "#ABCDEF",
        }
    )
    client = FakeClient()
    result = SweetHome3DConverter(client, enrich_decor=True).convert(scene)
    tool_names = [name for name, _ in client.calls]
    assert "connect_walls" in tool_names
    assert "apply_texture" in tool_names
    assert len(result.manifest["decor_added"]) >= 5

    # Two items sharing identical input color_hex receive distinct material profiles
    f_models = [m for m in result.manifest["models"] if m["studio_object_id"] in {"f", "f2"}]
    assert len(f_models) == 2
    assert f_models[0]["material"]["color_hex"] != f_models[1]["material"]["color_hex"]
    assert f_models[0]["material"]["shininess"] != f_models[1]["material"]["shininess"]

    artifacts = render_and_export(client, result, tmp_path, width=1920, height=1080, quality="high")
    assert len(artifacts["renders"]) == 3
    room_mod_calls = [args for name, args in client.calls if name == "modify_room" and "ceilingVisible" in args]
    assert any(call["ceilingVisible"] is False for call in room_mod_calls)
    assert room_mod_calls[-1]["ceilingVisible"] is True


