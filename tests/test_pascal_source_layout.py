import json
import subprocess
from pathlib import Path


GATEWAY = Path(__file__).resolve().parents[1] / "packages/pascal-adapter/gateway.mjs"


def test_missing_source_polygon_is_not_replaced_by_demo():
    result = subprocess.run(
        ["node", str(GATEWAY)],
        input=json.dumps({"action": "sync_from_canonical", "canonical": {
            "rooms": [{"id": "source-room"}],
        }}),
        capture_output=True, text=True, timeout=30,
    )
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert "requires a source polygon" in payload["error"]


def test_opening_with_unknown_wall_is_not_assigned_to_arbitrary_wall():
    result = subprocess.run(
        ["node", str(GATEWAY)],
        input=json.dumps({"action": "sync_from_canonical", "canonical": {
            "rooms": [{"id": "source-room", "polygon_mm": [[0, 0], [3000, 0], [3000, 4200], [0, 4200]]}],
            "openings": [{"id": "entry", "wall_id": "missing-wall", "wall_index": 0}],
        }}),
        capture_output=True, text=True, timeout=30,
    )
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert "Unknown wall missing-wall" in payload["error"]


def test_wall_anchored_furniture_never_falls_back_to_a_guessed_catalog_asset():
    result = subprocess.run(
        ["node", str(GATEWAY)],
        input=json.dumps({"action": "sync_from_canonical", "canonical": {
            "rooms": [{
                "id": "source-room",
                "name": "Children bedroom",
                "polygon_mm": [[0, 0], [2300, 0], [2300, 4000], [0, 4000]],
            }],
            "furniture_instances": [{
                "id": "source-desk",
                "name": "Bàn học",
                "category": "desk",
                "pascal_asset_id": "atelier-study-desk",
                "room_id": "source-room",
                "width_mm": 520,
                "depth_mm": 1050,
                "height_mm": 750,
                "wall": "right",
                "align": "top",
                "offset_mm": 1630,
            }],
        }}),
        capture_output=True, text=True, timeout=30,
    )
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    calls = payload["executedCalls"]
    assert not any(call["tool"] == "place_items" for call in calls)
    authored = next(call for call in calls if call.get("canonicalId") == "source-desk")
    assert authored["tool"] in {"add_object", "add_object_skipped"}
    if authored["tool"] == "add_object_skipped":
        assert authored["reason"] == "scripts_unavailable"
