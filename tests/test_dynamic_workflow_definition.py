from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
from app.services.agent_orchestrator_engine import execute_real_workflow_run  # noqa: E402


@pytest.fixture()
def isolated_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "dynamic-workflow.db")
    db.init_db()
    return db


def _store_workflow(store, workflow_id: str, version: int, nodes: list[dict], edges: list[dict]) -> None:
    payload = {
        "workflow_id": workflow_id,
        "name": workflow_id,
        "version": version,
        "nodes": nodes,
        "edges": edges,
    }
    conn = store.get_conn()
    conn.execute(
        "INSERT INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
        (workflow_id, workflow_id, version, json.dumps(payload), store.now_iso()),
    )
    conn.commit()
    conn.close()


def test_b_renamed_node_ids_dispatch_by_published_type(isolated_runtime):
    _store_workflow(
        isolated_runtime,
        "wf_b_renamed",
        7,
        [
            {"id": "brief_from_customer", "type": "input_intake", "agent_id": "agent_chief_architect"},
            {"id": "read_plan_v2", "type": "floorplan_cv", "agent_id": "agent_floorplan"},
        ],
        [{"id": "b-edge", "source": "brief_from_customer", "target": "read_plan_v2"}],
    )

    run = asyncio.run(execute_real_workflow_run("wf_b_renamed", "proj_demo_4x5m"))

    assert run["workflow_version"] == 7
    assert [event["node_id"] for event in run["events"]] == ["brief_from_customer", "read_plan_v2"]
    assert [event["tool_called"] for event in run["events"]] == [
        "project_intake_validator",
        "floorplan_cv_vision_engine",
    ]
    assert all(event["status"] == "COMPLETED" for event in run["events"])


def test_c_modified_graph_allows_multiple_nodes_of_same_type(isolated_runtime):
    _store_workflow(
        isolated_runtime,
        "wf_c_repeated_type",
        3,
        [
            {"id": "root", "type": "input_intake", "agent_id": "agent_chief_architect"},
            {"id": "plan_primary", "type": "floorplan_cv", "agent_id": "agent_floorplan"},
            {"id": "plan_cross_check", "type": "floorplan_cv", "agent_id": "agent_floorplan"},
        ],
        [
            {"id": "c1", "source": "root", "target": "plan_primary"},
            {"id": "c2", "source": "root", "target": "plan_cross_check"},
        ],
    )

    run = asyncio.run(execute_real_workflow_run("wf_c_repeated_type", "proj_demo_4x5m"))
    by_id = {event["node_id"]: event for event in run["events"]}

    assert by_id["plan_primary"]["tool_called"] == "floorplan_cv_vision_engine"
    assert by_id["plan_cross_check"]["tool_called"] == "floorplan_cv_vision_engine"
    assert by_id["plan_primary"]["depends_on"] == ["root"]
    assert by_id["plan_cross_check"]["depends_on"] == ["root"]


def test_d_missing_agent_assignment_blocks_without_chief_fallback(isolated_runtime):
    _store_workflow(
        isolated_runtime,
        "wf_d_missing_agent",
        1,
        [{"id": "unassigned_intake", "type": "input_intake"}],
        [],
    )

    run = asyncio.run(execute_real_workflow_run("wf_d_missing_agent", "proj_demo_4x5m"))
    event = run["events"][0]

    assert event["status"] == "BLOCKED"
    assert event["agent_id"] is None
    assert event["tool_called"] is None
    assert "assignment" in event["output_summary"].lower()


def test_e_unknown_published_node_type_is_blocked(isolated_runtime):
    _store_workflow(
        isolated_runtime,
        "wf_e_unknown_executor",
        1,
        [{"id": "custom_magic", "type": "unsupported.magic", "agent_id": "agent_floorplan"}],
        [],
    )

    run = asyncio.run(execute_real_workflow_run("wf_e_unknown_executor", "proj_demo_4x5m"))
    event = run["events"][0]

    assert event["status"] == "BLOCKED"
    assert event["tool_called"] is None
    assert "executor" in event["output_summary"].lower()

