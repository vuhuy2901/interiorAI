"""Thin adapter over Paperclip's official Atelier/task HTTP APIs.

This module does not invent task IDs or acceptance events.  A successful create
returns the Paperclip issue id/identifier and the observed task status only.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


PAPERCLIP_BASE_URL = os.getenv("PAPERCLIP_BASE_URL", "http://127.0.0.1:3100").rstrip("/")


class PaperclipTaskError(RuntimeError):
    pass


def _request_json(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any] | list[Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{PAPERCLIP_BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=8.0) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        detail = ""
        if isinstance(exc, urllib.error.HTTPError):
            try:
                detail = exc.read().decode("utf-8")[:800]
            except Exception:
                detail = str(exc)
        raise PaperclipTaskError(f"Paperclip {method} {path} failed: {detail or exc}") from exc


def resolve_agent(agent_key: str, *, company_id: Optional[str] = None) -> Dict[str, Any]:
    query = f"?company_id={company_id}" if company_id else ""
    payload = _request_json("GET", f"/api/atelier/agent-capabilities{query}")
    if not isinstance(payload, dict):
        raise PaperclipTaskError("Paperclip capability response is not an object")
    company = company_id or payload.get("company_id")
    for agent in payload.get("agents") or []:
        if agent.get("atelierAgentKey") == agent_key:
            if not agent.get("available") or agent.get("lifecycleState") not in {"ready", "idle"}:
                raise PaperclipTaskError(f"Paperclip agent {agent_key} is unavailable")
            return {"company_id": company, **agent}
    raise PaperclipTaskError(f"Paperclip agent assignment not found: {agent_key}")


def resolve_project(project_id: str, company_id: str) -> Dict[str, Any]:
    payload = _request_json("GET", f"/api/companies/{company_id}/projects")
    if not isinstance(payload, list):
        raise PaperclipTaskError("Paperclip project response is not a list")
    marker = f"({project_id})".lower()
    for project in payload:
        text = f"{project.get('name', '')} {project.get('description', '')}".lower()
        if project.get("id") == project_id or marker in text or project.get("urlKey") == project_id:
            return project
    raise PaperclipTaskError(f"Paperclip project mapping not found for local project {project_id}")


def create_native_task(
    *,
    run_id: str,
    project_id: str,
    node: Dict[str, Any],
    local_agent_id: str,
    paperclip_agent_key: Optional[str] = None,
    task_description: str,
    predecessor_handoffs: list[str],
    idempotency_key: str,
) -> Dict[str, Any]:
    agent = resolve_agent(paperclip_agent_key or local_agent_id)
    company_id = str(agent["company_id"])
    project = resolve_project(project_id, company_id)
    predecessor_text = "\n".join(f"- {path}" for path in predecessor_handoffs) or "- Không có predecessor handoff"
    description = "\n".join([
        task_description,
        "",
        f"Workflow Run ID: {run_id}",
        f"Workflow Node ID: {node.get('id')}",
        f"Agent assignment: {local_agent_id}",
        "Predecessor handoffs cần đọc:",
        predecessor_text,
        "",
        "Khi hoàn tất, ghi đúng handoff Markdown/JSON của node và nêu artifact thực tế. Không tự nhận TASK_ACCEPTED nếu Paperclip chưa phát tín hiệu nhận việc.",
    ])
    task = _request_json("POST", f"/api/companies/{company_id}/issues", {
        "projectId": project["id"],
        "title": f"[ATELIER • {node.get('id')}] {node.get('label') or node.get('type') or 'Workflow task'}",
        "description": description,
        "status": "todo",
        "priority": "high",
        "assigneeAgentId": agent["agentId"],
        "idempotencyKey": idempotency_key,
        "allowDuplicate": False,
    })
    if not isinstance(task, dict):
        raise PaperclipTaskError("Paperclip task response is not an object")
    native_id = task.get("id") or task.get("identifier")
    if not native_id:
        raise PaperclipTaskError("Paperclip task response has no id/identifier")
    return {
        "task_id": native_id,
        "identifier": task.get("identifier"),
        "status": task.get("status", "todo"),
        "agent_id": agent["agentId"],
        "agent_key": local_agent_id,
        "company_id": company_id,
        "project_id": project["id"],
        "accepted": False,
        "acceptance_observed": False,
        "raw": task,
    }


def get_native_task(task_id: str) -> Dict[str, Any]:
    task = _request_json("GET", f"/api/issues/{task_id}")
    if not isinstance(task, dict):
        raise PaperclipTaskError("Paperclip task response is not an object")
    return task


def get_native_handoff(task_id: str, key: str = "handoff") -> Dict[str, Any]:
    document = _request_json("GET", f"/api/issues/{task_id}/documents/{key}")
    if not isinstance(document, dict) or not isinstance(document.get("body"), str):
        raise PaperclipTaskError(f"Paperclip handoff document is unavailable for {task_id}")
    return document


def list_project_issues(company_id: str, project_id: str) -> list[Dict[str, Any]]:
    query = urllib.parse.urlencode({"projectId": project_id, "view": "index", "limit": 100})
    payload = _request_json("GET", f"/api/companies/{company_id}/issues?{query}")
    if not isinstance(payload, list):
        raise PaperclipTaskError("Paperclip issue list response is not a list")
    return [item for item in payload if isinstance(item, dict)]


def get_agent_conversation(company_id: str, agent_ref: str) -> Optional[Dict[str, Any]]:
    encoded_ref = urllib.parse.quote(agent_ref, safe="")
    payload = _request_json("GET", f"/api/companies/{company_id}/chats/{encoded_ref}")
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise PaperclipTaskError("Paperclip conversation response is not an object")
    return payload


def get_issue_comments(issue_id: str) -> list[Dict[str, Any]]:
    payload = _request_json("GET", f"/api/issues/{issue_id}/comments")
    if not isinstance(payload, list):
        raise PaperclipTaskError("Paperclip comments response is not a list")
    return [item for item in payload if isinstance(item, dict)]


def get_issue_runs(issue_id: str) -> list[Dict[str, Any]]:
    """Return persisted Paperclip execution attempts for strict start evidence."""
    payload = _request_json("GET", f"/api/issues/{issue_id}/runs")
    if not isinstance(payload, list):
        raise PaperclipTaskError("Paperclip issue run response is not a list")
    return [item for item in payload if isinstance(item, dict)]


def post_issue_comment(issue_id: str, body: str, *, client_request_id: str) -> Dict[str, Any]:
    """Persist an idempotent board-authored decision message in Paperclip."""
    payload = _request_json(
        "POST",
        f"/api/issues/{issue_id}/comments",
        {"body": body, "clientRequestId": client_request_id},
    )
    if not isinstance(payload, dict):
        raise PaperclipTaskError("Paperclip comment response is not an object")
    return payload


def get_issue_interactions(issue_id: str) -> list[Dict[str, Any]]:
    payload = _request_json("GET", f"/api/issues/{issue_id}/interactions")
    if not isinstance(payload, list):
        raise PaperclipTaskError("Paperclip interactions response is not a list")
    return [item for item in payload if isinstance(item, dict)]


def get_issue_document(issue_id: str, key: str = "plan") -> Dict[str, Any]:
    payload = _request_json("GET", f"/api/issues/{issue_id}/documents/{key}")
    if not isinstance(payload, dict) or not isinstance(payload.get("body"), str):
        raise PaperclipTaskError(f"Paperclip document {key} is unavailable for {issue_id}")
    return payload


def put_issue_document(
    issue_id: str,
    key: str,
    *,
    title: str,
    body: str,
    base_revision_id: Optional[str],
) -> Dict[str, Any]:
    request: Dict[str, Any] = {"title": title, "format": "markdown", "body": body}
    if base_revision_id:
        request["baseRevisionId"] = base_revision_id
    payload = _request_json("PUT", f"/api/issues/{issue_id}/documents/{key}", request)
    if not isinstance(payload, dict):
        raise PaperclipTaskError("Paperclip document update response is not an object")
    return payload


def respond_to_interaction(
    issue_id: str,
    interaction_id: str,
    answers: list[Dict[str, Any]],
    *,
    summary_markdown: Optional[str] = None,
) -> Dict[str, Any]:
    request: Dict[str, Any] = {"answers": answers}
    if summary_markdown is not None:
        request["summaryMarkdown"] = summary_markdown
    payload = _request_json(
        "POST",
        f"/api/issues/{issue_id}/interactions/{interaction_id}/respond",
        request,
    )
    if not isinstance(payload, dict):
        raise PaperclipTaskError("Paperclip interaction response is not an object")
    return payload
