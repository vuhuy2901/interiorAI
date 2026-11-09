from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import build_default_demo_project, get_conn, now_iso, save_project  # noqa: E402
from app.services.agent_orchestrator_engine import execute_real_workflow_run  # noqa: E402
import app.services.blender_mcp as blender_mcp  # noqa: E402


def _store_workflow(workflow_id: str, nodes: list[dict]) -> None:
    payload = {"workflow_id": workflow_id, "name": "G7 trace test", "nodes": nodes}
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
        (workflow_id, "G7 trace test", 1, json.dumps(payload), now_iso()),
    )
    conn.commit()
    conn.close()


def test_real_trace_records_calls_and_propagates_render_block(monkeypatch):
    project = build_default_demo_project()
    project.project_id = "proj_g7_trace"
    project.estimate_snapshot = None
    save_project(project, bump_revision=False)

    workflow_id = "wf_g7_trace_block"
    _store_workflow(
        workflow_id,
        [
            {"id": "n1_intake", "label": "Intake", "agent_id": "agent_chief_architect"},
            {"id": "n12_render", "label": "Render", "agent_id": "agent_render"},
            {"id": "n13_render_qa", "label": "Render QA", "agent_id": "agent_qa"},
        ],
    )
    monkeypatch.setattr(blender_mcp, "is_blender_available", lambda: (False, "Blender test unavailable"))

    run = asyncio.run(execute_real_workflow_run(workflow_id, project.project_id))

    assert run["status"] == "BLOCKED"
    assert [event["status"] for event in run["events"]] == ["COMPLETED", "BLOCKED", "BLOCKED"]
    assert run["events"][0]["tool_called"] == "project_intake_validator"
    assert run["events"][0]["tool_call_id"].startswith("call_")
    assert run["events"][1]["tool_called"] == "render_agent_executor"
    assert run["events"][2]["tool_called"] is None
    assert run["events"][2]["blocked_by"] == "n12_render"
    assert all(event["duration_ms"] >= 0 for event in run["events"])


def test_waiting_gate_stops_downstream_tools():
    project = build_default_demo_project()
    project.project_id = "proj_g7_waiting"
    project.scale_calibrated = False
    project.scale_reference = None
    save_project(project, bump_revision=False)

    workflow_id = "wf_g7_trace_waiting"
    _store_workflow(
        workflow_id,
        [
            {"id": "n3_scale_gate", "label": "Scale gate", "agent_id": "agent_floorplan"},
            {"id": "n4_brief", "label": "Brief", "agent_id": "agent_chief_architect"},
        ],
    )

    run = asyncio.run(execute_real_workflow_run(workflow_id, project.project_id))

    assert run["status"] == "WAITING_FOR_INPUT"
    assert run["events"][0]["status"] == "WAITING_FOR_INPUT"
    assert run["events"][1]["status"] == "BLOCKED"
    assert run["events"][1]["blocked_by"] == "n3_scale_gate"
    assert run["events"][1]["tool_call_id"] is None
