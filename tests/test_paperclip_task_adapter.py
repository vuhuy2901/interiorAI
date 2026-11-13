from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.services import paperclip_task_adapter as adapter  # noqa: E402
from app.services import agent_orchestrator_engine as engine  # noqa: E402


def test_resolve_agent_uses_published_atelier_key_and_capability_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(adapter, "_request_json", lambda *_args, **_kwargs: {
        "company_id": "company-1",
        "agents": [{"agentId": "native-floorplan", "atelierAgentKey": "agent_floorplan", "available": True, "lifecycleState": "ready"}],
    })
    result = adapter.resolve_agent("agent_floorplan")
    assert result["agentId"] == "native-floorplan"
    assert result["company_id"] == "company-1"


def test_create_native_task_returns_observed_task_without_fake_acceptance(monkeypatch: pytest.MonkeyPatch):
    calls = []

    def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET" and path.startswith("/api/atelier/agent-capabilities"):
            return {"company_id": "company-1", "agents": [{"agentId": "native-floorplan", "atelierAgentKey": "agent_floorplan", "available": True, "lifecycleState": "ready"}]}
        if method == "GET" and path == "/api/companies/company-1/projects":
            return [{"id": "paperclip-project-1", "name": "Bedroom", "description": "local (proj_bedroom)"}]
        if method == "POST" and path == "/api/companies/company-1/issues":
            return {"id": "native-task-1", "identifier": "ATL-101", "status": "todo"}
        raise AssertionError((method, path))

    monkeypatch.setattr(adapter, "_request_json", fake_request)
    result = adapter.create_native_task(
        run_id="run-1",
        project_id="proj_bedroom",
        node={"id": "floorplan_node", "type": "floorplan_cv", "label": "Floorplan"},
        local_agent_id="agent_floorplan",
        task_description="Parse the floor plan",
        predecessor_handoffs=[],
        idempotency_key="run-1:floorplan_node:native",
    )
    assert result["task_id"] == "native-task-1"
    assert result["status"] == "todo"
    assert result["accepted"] is False
    assert result["acceptance_observed"] is False
    assert calls[-1][2]["assigneeAgentId"] == "native-floorplan"
    assert calls[-1][2]["idempotencyKey"] == "run-1:floorplan_node:native"


def test_post_issue_comment_uses_idempotent_board_receipt(monkeypatch: pytest.MonkeyPatch):
    calls = []
    monkeypatch.setattr(
        adapter,
        "_request_json",
        lambda method, path, payload=None: calls.append((method, path, payload)) or {"id": "comment-1", "body": payload["body"]},
    )
    result = adapter.post_issue_comment("issue-1", "Quyết định người dùng", client_request_id="decision-run-1")
    assert result["id"] == "comment-1"
    assert calls == [(
        "POST",
        "/api/issues/issue-1/comments",
        {"body": "Quyết định người dùng", "clientRequestId": "decision-run-1"},
    )]


def test_native_predecessor_handoff_paths_are_absolute():
    paths = engine.predecessor_handoff_paths("run-1", ["chief-renamed"])
    assert len(paths) == 1
    assert Path(paths[0]).is_absolute()
    assert paths[0].endswith(str(Path("runs") / "run-1" / "handoffs" / "chief-renamed.md"))
