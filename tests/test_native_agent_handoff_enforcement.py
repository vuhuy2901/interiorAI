from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
import app.main as main  # noqa: E402
from app.services import paperclip_task_adapter as adapter  # noqa: E402


def test_project_scoped_chat_forces_native_tasks():
    assert main.resolve_chat_native_tasks(project_scoped=True, requested=None) is True
    assert main.resolve_chat_native_tasks(project_scoped=True, requested=True) is True
    with pytest.raises(ValueError, match="Native Paperclip Tasks"):
        main.resolve_chat_native_tasks(project_scoped=True, requested=False)


def test_unscoped_compatibility_route_keeps_explicit_mode():
    assert main.resolve_chat_native_tasks(project_scoped=False, requested=None) is False
    assert main.resolve_chat_native_tasks(project_scoped=False, requested=False) is False
    assert main.resolve_chat_native_tasks(project_scoped=False, requested=True) is True


def test_project_chat_route_invokes_native_workflow_mode(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "runtime.db")
    db.init_db()
    observed = {}

    async def fake_execute(workflow_id, project_id, **kwargs):
        observed.update({"workflow_id": workflow_id, "project_id": project_id, **kwargs})
        return {
            "run_id": "run-native-route",
            "scene_revision": 1,
            "status": "WAITING_FOR_AGENT",
            "events": [],
        }

    monkeypatch.setattr(main, "execute_real_workflow_run", fake_execute)
    result = asyncio.run(
        main.api_send_chat_message(
            main.ChatMessagePayload(message="Phân tích bản vẽ"),
            project_id="proj_demo_4x5m",
        )
    )

    assert observed["native_tasks"] is True
    assert observed["project_id"] == "proj_demo_4x5m"
    assert result["metadata"]["execution_mode"] == "native_paperclip_tasks"


def test_unbound_project_resolves_stable_default_not_latest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "runtime.db")
    db.init_db()
    project = db.build_default_demo_project()
    project.project_id = "proj_unbound"
    db.save_project(project, bump_revision=False)
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, 1, '{}', ?)",
        ("wf_recent_test", "Recent test", "2099-01-01T00:00:00Z"),
    )
    conn.commit()
    conn.close()

    assert db.get_project_workflow_id("proj_unbound") == "wf_default_interior_pipeline"


def test_create_project_persists_explicit_workflow_binding(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "runtime.db")
    db.init_db()

    async def no_pascal(_project):
        return {"ok": False}

    monkeypatch.setattr(main, "sync_canonical_to_pascal", no_pascal)
    created = asyncio.run(main.api_create_project(main.CreateProjectPayload(name="Bound project")))
    project_id = created["project_id"]
    conn = db.get_conn()
    binding = conn.execute(
        "SELECT workflow_id FROM project_workflow_bindings WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    conn.close()
    assert binding["workflow_id"] == "wf_default_interior_pipeline"


def test_geometry_snapshot_assignment_cannot_fall_back_to_chief(monkeypatch: pytest.MonkeyPatch):
    calls = []

    def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET" and path.startswith("/api/atelier/agent-capabilities"):
            return {
                "company_id": "company-1",
                "agents": [
                    {"agentId": "native-chief", "atelierAgentKey": "agent_chief_architect", "available": True, "lifecycleState": "ready"},
                    {"agentId": "native-geometry", "atelierAgentKey": "agent_geometry", "available": True, "lifecycleState": "ready"},
                ],
            }
        if method == "GET" and path == "/api/companies/company-1/projects":
            return [{"id": "paperclip-project-1", "name": "Bedroom", "description": "local (proj_bedroom)"}]
        if method == "POST" and path == "/api/companies/company-1/issues":
            return {"id": "geometry-task", "identifier": "ATL-200", "status": "todo"}
        raise AssertionError((method, path))

    monkeypatch.setattr(adapter, "_request_json", fake_request)
    adapter.create_native_task(
        run_id="run-native",
        project_id="proj_bedroom",
        node={"id": "geometry", "type": "pascal_geometry", "label": "Geometry"},
        local_agent_id="agent_geometry",
        task_description="Build verified geometry",
        predecessor_handoffs=["C:/data/runs/run-native/handoffs/floorplan.md"],
        idempotency_key="run-native:geometry:native",
    )

    issue_payload = calls[-1][2]
    assert issue_payload["assigneeAgentId"] == "native-geometry"
    assert issue_payload["assigneeAgentId"] != "native-chief"
    assert "Agent assignment: agent_geometry" in issue_payload["description"]

