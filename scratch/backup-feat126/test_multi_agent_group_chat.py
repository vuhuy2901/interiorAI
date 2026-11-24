from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
from app.services import multi_agent_chat_sync as chat_sync  # noqa: E402
from app.services import paperclip_task_adapter as adapter  # noqa: E402
from app.services.workflow_runtime import materialize_native_handoff  # noqa: E402


@pytest.fixture
def runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "atelier.db")
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    db.init_db()
    conn = db.get_conn()
    for key, name, role in [
        ("lead", "Chief Dynamic", "orchestrator"),
        ("floor", "Floorplan Dynamic", "floorplan_cv"),
        ("geometry", "Geometry Dynamic", "geometry_mcp"),
    ]:
        payload = {"agent_id": key, "name": name, "role": role}
        conn.execute(
            "INSERT INTO agents (agent_id, name, role, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
            (key, name, role, json.dumps(payload), db.now_iso()),
        )
    conn.commit()
    conn.close()

    state = {
        "tasks": {},
        "runs": {},
        "comments": {},
        "handoffs": {},
    }
    monkeypatch.setattr(adapter, "resolve_agent", lambda key, company_id=None: {"agentId": f"native-{key}", "company_id": company_id or "company"})
    monkeypatch.setattr(adapter, "get_agent_conversation", lambda *_args: {"id": "conversation-1"})
    monkeypatch.setattr(adapter, "get_native_task", lambda task_id: state["tasks"][task_id])
    monkeypatch.setattr(adapter, "get_issue_runs", lambda task_id: state["runs"].get(task_id, []))
    monkeypatch.setattr(adapter, "get_issue_comments", lambda task_id: state["comments"].get(task_id, []))
    monkeypatch.setattr(adapter, "get_native_handoff", lambda task_id: {"body": state["handoffs"].get(task_id, "")})
    return state


def seed_run(state, *, run_id="run_chat", project_id="project_chat", nodes=None, tasks=None):
    nodes = nodes or [
        {"id": "chief", "type": "input_intake", "label": "Chief", "agent_id": "lead"},
        {"id": "floorplan", "type": "floorplan_cv", "label": "Floorplan", "agent_id": "floor"},
    ]
    tasks = tasks or [{"task_id": "task-floor", "node_id": "floorplan", "local_agent_id": "floor", "native_agent_id": "native-floor"}]
    run_doc = {
        "run_id": run_id,
        "project_id": project_id,
        "status": "WAITING_FOR_AGENT",
        "workflow_snapshot": {"nodes": nodes, "edges": [{"source": "chief", "target": "floorplan"}]},
        "events": [{"node_id": task["node_id"], "status": "WAITING_FOR_AGENT", "native_task_id": task["task_id"]} for task in tasks],
    }
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO workflow_runs (run_id, workflow_id, project_id, status, payload_json, updated_at) VALUES (?, 'wf', ?, ?, ?, ?)",
        (run_id, project_id, run_doc["status"], json.dumps(run_doc), db.now_iso()),
    )
    for task in tasks:
        payload = {"company_id": "company", "project_id": "native-project"}
        conn.execute(
            "INSERT INTO workflow_native_tasks (task_id, run_id, node_id, local_agent_id, native_agent_id, status, idempotency_key, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)",
            (task["task_id"], run_id, task["node_id"], task["local_agent_id"], task["native_agent_id"], f"{run_id}:{task['node_id']}", json.dumps(payload), "2026-11-13T01:00:00Z", "2026-11-13T01:00:00Z"),
        )
        state["tasks"][task["task_id"]] = {
            "id": task["task_id"], "identifier": task["task_id"].upper(), "status": "todo", "assigneeAgentId": task["native_agent_id"],
        }
    conn.commit()
    conn.close()
    return run_doc


def event_types(project_id="project_chat"):
    return [item["event_type"] for item in chat_sync.list_project_events(project_id)["events"]]


def test_a_assigned_requires_observed_task_and_keeps_dynamic_identity(runtime):
    seed_run(runtime)
    created = chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    assert [item["event_type"] for item in created] == ["TASK_ASSIGNED"]
    conn = db.get_conn()
    message = conn.execute("SELECT sender_name, metadata_json FROM chat_messages WHERE project_id='project_chat'").fetchone()
    conn.close()
    assert message["sender_name"] == "Chief Dynamic"
    assert json.loads(message["metadata_json"])["target_agent_id"] == "floor"


def test_b_no_fake_accepted_or_started_from_issue_status(runtime):
    seed_run(runtime)
    runtime["tasks"]["task-floor"]["status"] = "in_progress"
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    assert event_types() == ["TASK_ASSIGNED"]
    assert "TASK_ACCEPTED" not in event_types()


def test_c_started_contains_real_execution_run_id(runtime):
    seed_run(runtime)
    runtime["runs"]["task-floor"] = [{"runId": "execution-1", "status": "running", "startedAt": "2026-11-13T01:01:00Z"}]
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    events = chat_sync.list_project_events("project_chat")["events"]
    started = next(item for item in events if item["event_type"] == "AGENT_STARTED")
    assert started["execution_run_id"] == "execution-1"
    assert started["payload"]["status"] == "RUNNING"


def test_d_in_review_without_verified_handoff_does_not_complete(runtime):
    seed_run(runtime)
    runtime["tasks"]["task-floor"]["status"] = "in_review"
    runtime["runs"]["task-floor"] = [{"runId": "execution-1", "status": "succeeded", "startedAt": "2026-11-13T01:01:00Z"}]
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    assert "TASK_COMPLETED" not in event_types()
    assert "HANDOFF_COMPLETED" not in event_types()


def test_e_completion_requires_manifest_files_and_matching_hash(runtime):
    run_doc = seed_run(runtime)
    document = "# Floorplan handoff\n\n```json\n{\"status\":\"completed\",\"result\":\"Mặt bằng đã xác minh\"}\n```\n"
    handoff = materialize_native_handoff("run_chat", "floorplan", "floor", document)
    run_doc["events"][0].update({
        "status": "COMPLETED",
        "completed_at": "2026-11-13T01:02:00Z",
        "handoff": {"manifest_path": handoff["manifest_path"]},
        "artifact_ids": [handoff["artifacts"][0]["artifact_id"]],
    })
    conn = db.get_conn()
    conn.execute("UPDATE workflow_runs SET payload_json=? WHERE run_id='run_chat'", (json.dumps(run_doc),))
    conn.commit()
    conn.close()
    runtime["tasks"]["task-floor"]["status"] = "done"
    runtime["runs"]["task-floor"] = [{"runId": "execution-1", "status": "succeeded", "startedAt": "2026-11-13T01:01:00Z"}]
    runtime["handoffs"]["task-floor"] = document
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    assert "HANDOFF_COMPLETED" in event_types()
    assert "TASK_COMPLETED" in event_types()


def test_f_only_agent_authored_comments_become_progress(runtime):
    seed_run(runtime)
    runtime["comments"]["task-floor"] = [
        {"id": "user", "authorAgentId": None, "body": "User correction", "createdAt": "2026-11-13T01:01:00Z"},
        {"id": "agent", "authorAgentId": "native-floor", "body": "Measured wall", "createdAt": "2026-11-13T01:01:01Z", "createdByRunId": "execution-1"},
    ]
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    progress = [item for item in chat_sync.list_project_events("project_chat")["events"] if item["event_type"] == "AGENT_PROGRESS"]
    assert len(progress) == 1
    assert progress[0]["payload"]["source_comment_id"] == "agent"


def test_g_idempotent_reconcile_and_cursor(runtime):
    seed_run(runtime)
    runtime["runs"]["task-floor"] = [{"runId": "execution-1", "status": "running", "startedAt": "2026-11-13T01:01:00Z"}]
    first = chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    second = chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    assert len(first) == 2
    assert second == []
    page = chat_sync.list_project_events("project_chat", after_sequence=1)
    assert [item["sequence"] for item in page["events"]] == [2]


def test_h_parallel_agents_have_independent_timeline(runtime):
    nodes = [
        {"id": "chief", "type": "input_intake", "label": "Chief", "agent_id": "lead"},
        {"id": "floorplan", "type": "floorplan_cv", "label": "Floor", "agent_id": "floor"},
        {"id": "geometry", "type": "pascal_geometry", "label": "Geometry", "agent_id": "geometry"},
    ]
    tasks = [
        {"task_id": "task-floor", "node_id": "floorplan", "local_agent_id": "floor", "native_agent_id": "native-floor"},
        {"task_id": "task-geometry", "node_id": "geometry", "local_agent_id": "geometry", "native_agent_id": "native-geometry"},
    ]
    seed_run(runtime, nodes=nodes, tasks=tasks)
    runtime["runs"].update({
        "task-floor": [{"runId": "exec-floor", "status": "running", "startedAt": "2026-11-13T01:01:00Z"}],
        "task-geometry": [{"runId": "exec-geometry", "status": "running", "startedAt": "2026-11-13T01:01:00Z"}],
    })
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    started = [item for item in chat_sync.list_project_events("project_chat")["events"] if item["event_type"] == "AGENT_STARTED"]
    assert {item["node_id"] for item in started} == {"floorplan", "geometry"}


def test_i_restart_readback_uses_persisted_events_without_native_calls(runtime, monkeypatch):
    seed_run(runtime)
    chat_sync.sync_workflow_run_to_chat("run_chat", "project_chat")
    monkeypatch.setattr(adapter, "get_native_task", lambda _task_id: (_ for _ in ()).throw(AssertionError("network read")))
    restored = chat_sync.list_project_events("project_chat")
    assert len(restored["events"]) == 1
    assert restored["events"][0]["conversation_id"] == "conversation-1"
