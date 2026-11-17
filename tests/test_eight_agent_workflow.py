from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import DEFAULT_WORKFLOW, EIGHT_AGENT_PROFILES
from app.services.agent_orchestrator_engine import (
    NODE_EXECUTOR_REGISTRY,
    validate_geometry_predecessor_contracts,
)
from app.services.agent_prompts import AGENT_SPECIFIC_PROMPTS
from app.services.workflow_runtime import get_ready_nodes, validate_floorplan_contract


def valid_floorplan_contract() -> dict:
    return {
        "schema": "atelier.floorplan.v1",
        "source": {"artifact_id": "art_source", "sha256": "a" * 64},
        "coordinate_system": {
            "origin": "interior_top_left",
            "x_axis": "right",
            "y_axis": "down",
            "unit": "mm",
        },
        "scale": {"status": "CONFIRMED", "source": "dimension 4000"},
        "rooms": [{
            "id": "room-1",
            "polygon_mm": [[0, 0], [4000, 0], [4000, 3000], [0, 3000], [0, 0]],
            "status": "CONFIRMED",
            "source": "inner wall boundary",
        }],
        "walls": [{
            "id": "wall-top",
            "start_mm": [0, 0],
            "end_mm": [4000, 0],
            "thickness": {"value_mm": 110, "status": "CONFIRMED", "source": "wall annotation"},
            "room_refs": ["room-1"],
            "status": "CONFIRMED",
            "source": "wall line",
        }],
        "openings": [{
            "id": "door-1",
            "type": "door",
            "wall_id": "wall-top",
            "offset": {"value_mm": 100, "status": "CONFIRMED", "source": "dimension chain"},
            "width": {"value_mm": 900, "status": "CONFIRMED", "source": "door label"},
        }],
        "furniture_anchors": [{
            "id": "bed-1",
            "category": "bed",
            "wall_id": "wall-top",
            "align": "center",
            "offset": {"value_mm": 1200, "status": "CONFIRMED", "source": "dimension chain"},
            "width": {"value_mm": 1800, "status": "CONFIRMED", "source": "bed label"},
            "depth": {"value_mm": 2000, "status": "CONFIRMED", "source": "bed label"},
        }],
    }


def test_default_workflow_uses_eight_specialist_agents_and_no_shopping_or_lighting():
    nodes = DEFAULT_WORKFLOW["nodes"]
    agents = {node["agent_id"] for node in nodes}
    assert DEFAULT_WORKFLOW["version"] == 3
    assert len(agents) == 8
    assert "agent_shopping" not in agents
    assert "agent_ceiling_lighting" not in agents
    assert {node["id"] for node in nodes} == {
        "brief", "floorplan", "floorplan_qa", "geometry", "style",
        "furniture", "cost_spec", "render", "final_qa", "delivery",
    }
    assert NODE_EXECUTOR_REGISTRY["floorplan_validation"]["required_role"] == "render_qa"


def test_workflow_parallelizes_style_and_furniture_after_geometry():
    statuses = {
        "brief": "COMPLETED",
        "floorplan": "COMPLETED",
        "floorplan_qa": "COMPLETED",
        "geometry": "COMPLETED",
    }
    assert get_ready_nodes(DEFAULT_WORKFLOW, statuses) == ["style", "furniture"]
    statuses.update({"style": "COMPLETED", "furniture": "COMPLETED"})
    assert get_ready_nodes(DEFAULT_WORKFLOW, statuses) == ["cost_spec", "render"]


def test_floorplan_contract_accepts_traceable_wall_opening_and_anchor():
    assert validate_floorplan_contract(valid_floorplan_contract()) == []


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda plan: plan["source"].update(sha256="bad"), "source.sha256"),
        (lambda plan: plan["rooms"][0].update(polygon_mm=[[0, 0], [1, 0], [1, 1], [0, 1]]), "must be closed"),
        (lambda plan: plan["openings"][0].update(wall_id="missing"), "known wall"),
        (lambda plan: plan["furniture_anchors"][0]["offset"].update(status="UNKNOWN"), "cannot be UNKNOWN"),
    ],
)
def test_floorplan_contract_rejects_untraceable_geometry(mutate, message):
    plan = valid_floorplan_contract()
    mutate(plan)
    assert any(message in error for error in validate_floorplan_contract(plan))


def test_geometry_requires_floorplan_and_independent_qa_artifacts(tmp_path):
    floorplan_path = tmp_path / "floorplan.json"
    qa_path = tmp_path / "qa.json"
    floorplan_path.write_text(json.dumps({"result": {"floorplan_contract": valid_floorplan_contract()}}), encoding="utf-8")
    qa_path.write_text(json.dumps({"result": {"floorplan_validation": {"passed": True, "errors": []}}}), encoding="utf-8")
    artifacts = [
        {"node_id": "floorplan", "artifacts": [{"path": str(floorplan_path)}]},
        {"node_id": "floorplan_qa", "artifacts": [{"path": str(qa_path)}]},
    ]
    validate_geometry_predecessor_contracts(artifacts, allow_inferred=True)
    qa_path.write_text(json.dumps({"result": {"floorplan_validation": {"passed": False}}}), encoding="utf-8")
    with pytest.raises(ValueError, match="floorplan_validation"):
        validate_geometry_predecessor_contracts(artifacts, allow_inferred=True)


def test_all_eight_agents_have_specialized_skills_and_boundaries():
    assert len(EIGHT_AGENT_PROFILES) == 8
    for profile in EIGHT_AGENT_PROFILES.values():
        assert profile["skills"]
        assert profile["system_prompt"]
    prompt_keys = {
        "agent_concierge", "agent_floorplan", "agent_geometry", "agent_style",
        "agent_furniture", "agent_cost", "agent_render", "agent_qa",
    }
    for key in prompt_keys:
        spec = AGENT_SPECIFIC_PROMPTS[key]
        assert spec["skills"]
        assert "HỢP ĐỒNG" in spec["role_prompt"] or "CONTRACT" in spec["role_prompt"] or "BOUNDARY" in spec["role_prompt"] or "ADMISSION" in spec["role_prompt"] or "QA" in spec["role_prompt"]
