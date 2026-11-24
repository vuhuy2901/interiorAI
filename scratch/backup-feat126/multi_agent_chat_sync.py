"""Project conversation projection for verified native workflow lifecycle events.

The workflow snapshot and Paperclip task/execution history remain authoritative.
This module only projects observed evidence into an append-only, idempotent
timeline and the existing Atelier chat history. It never invents task
acceptance, progress, completion, agents, or downstream routes.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.db import get_conn, now_iso
from app.services import paperclip_task_adapter as adapter
from app.services.workflow_runtime import validate_handoff

logger = logging.getLogger(__name__)


def _stable_id(prefix: str, *parts: object) -> str:
    raw = "\0".join(str(part) for part in parts)
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:20]}"


def make_deterministic_message_id(run_id: str, node_id: str, event_suffix: str) -> str:
    return _stable_id("msg", run_id, node_id, event_suffix)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _agent_profile(conn: Any, agent_id: Optional[str], *, native_agent_id: Optional[str] = None) -> Dict[str, Any]:
    """Resolve display identity from persisted agent configuration, not a roster constant."""
    key = str(agent_id or "").strip()
    profile: Dict[str, Any] = {
        "agent_id": key or native_agent_id or "unknown-agent",
        "native_agent_id": native_agent_id,
        "display_name": key or native_agent_id or "Agent",
        "role_title": "workflow_agent",
        "avatar": "bot",
    }
    if key:
        row = conn.execute("SELECT payload_json FROM agents WHERE agent_id = ?", (key,)).fetchone()
        if row:
            try:
                payload = json.loads(row["payload_json"])
                profile["display_name"] = payload.get("name") or profile["display_name"]
                profile["role_title"] = payload.get("role") or profile["role_title"]
            except (TypeError, json.JSONDecodeError):
                pass
    return profile


def _handoff_summary(body: str) -> str:
    """Return a short factual summary without treating Markdown as the artifact."""
    blocks = re.findall(r"```json\s*(.*?)\s*```", body or "", flags=re.DOTALL | re.IGNORECASE)
    if blocks:
        try:
            payload = json.loads(blocks[-1])
            result = payload.get("result") or payload.get("summary") or payload.get("status")
            if isinstance(result, str) and result.strip():
                return result.strip()[:400]
            artifacts = payload.get("artifacts") or []
            if artifacts:
                return f"Đã bàn giao {len(artifacts)} artifact được khai báo trong manifest."
        except (TypeError, json.JSONDecodeError):
            pass
    bullets = [line.strip()[2:].strip() for line in (body or "").splitlines() if line.strip().startswith(("- ", "* "))]
    return " · ".join(bullets[:3])[:400] or "Handoff đã được runtime xác minh."


def _conversation_id(task_payloads: Iterable[Dict[str, Any]], snapshot: Dict[str, Any]) -> Optional[str]:
    """Resolve the existing Chief conversation for metadata; failure does not block projection."""
    company_id = next((str(item.get("company_id")) for item in task_payloads if item.get("company_id")), None)
    if not company_id:
        return None
    lead = next((node for node in snapshot.get("nodes") or [] if node.get("type") == "input_intake"), None)
    lead_key = str((lead or {}).get("agent_id") or "")
    if not lead_key:
        return None
    try:
        native = adapter.resolve_agent(lead_key, company_id=company_id)
        conversation = adapter.get_agent_conversation(company_id, str(native["agentId"]))
        return str(conversation["id"]) if conversation and conversation.get("id") else None
    except Exception as exc:
        logger.debug("Cannot resolve project conversation for %s: %s", lead_key, exc)
        return None


def _insert_event(
    conn: Any,
    *,
    event_id: str,
    project_id: str,
    conversation_id: Optional[str],
    run_id: str,
    node_id: str,
    native_task_id: Optional[str],
    agent: Dict[str, Any],
    execution_run_id: Optional[str],
    event_type: str,
    created_at: str,
    content: str,
    payload: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if conn.execute("SELECT 1 FROM workflow_chat_events WHERE event_id = ?", (event_id,)).fetchone():
        return None
    sequence = int(conn.execute(
        "SELECT COALESCE(MAX(sequence), 0) + 1 FROM workflow_chat_events WHERE run_id = ?", (run_id,)
    ).fetchone()[0])
    metadata = {
        **payload,
        "event_id": event_id,
        "event_type": event_type,
        "project_id": project_id,
        "conversation_id": conversation_id,
        "workflow_run_id": run_id,
        "node_id": node_id,
        "native_task_id": native_task_id,
        "agent_id": agent.get("agent_id"),
        "native_agent_id": agent.get("native_agent_id"),
        "execution_run_id": execution_run_id,
        "sequence": sequence,
        "role_title": agent.get("role_title"),
        "avatar": agent.get("avatar", "bot"),
    }
    conn.execute(
        "INSERT INTO workflow_chat_events (event_id, project_id, conversation_id, run_id, node_id, native_task_id, agent_id, execution_run_id, event_type, sequence, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (event_id, project_id, conversation_id, run_id, node_id, native_task_id, agent.get("agent_id"), execution_run_id, event_type, sequence, _json(metadata), created_at),
    )
    message_id = make_deterministic_message_id(run_id, node_id, event_id)
    conn.execute(
        "INSERT OR IGNORE INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
        (message_id, project_id, agent.get("display_name") or "Agent", content, _json(metadata), created_at),
    )
    return {"event_id": event_id, "sequence": sequence, "event_type": event_type, "message_id": message_id}


def _execution_attempts(task_id: str) -> List[Dict[str, Any]]:
    attempts = adapter.get_issue_runs(task_id)
    return sorted(
        [item for item in attempts if item.get("runId") and item.get("startedAt")],
        key=lambda item: (str(item.get("startedAt")), str(item.get("runId"))),
    )


def sync_workflow_run_to_chat(run_id: str, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Project verified Paperclip lifecycle evidence into the shared Studio timeline."""
    conn = get_conn()
    run_row = conn.execute("SELECT project_id, payload_json FROM workflow_runs WHERE run_id = ?", (run_id,)).fetchone()
    if not run_row:
        conn.close()
        return []
    run_doc = json.loads(run_row["payload_json"])
    pid = project_id or run_row["project_id"]
    snapshot = run_doc.get("workflow_snapshot") or {}
    nodes = {str(node.get("id")): node for node in snapshot.get("nodes") or [] if node.get("id")}
    event_by_node = {str(event.get("node_id")): event for event in run_doc.get("events") or [] if event.get("node_id")}
    task_rows = conn.execute("SELECT * FROM workflow_native_tasks WHERE run_id = ? ORDER BY created_at, task_id", (run_id,)).fetchall()
    decoded_payloads: List[Dict[str, Any]] = []
    for row in task_rows:
        try:
            decoded_payloads.append(json.loads(row["payload_json"]))
        except (TypeError, json.JSONDecodeError):
            decoded_payloads.append({})
    conversation_id = _conversation_id(decoded_payloads, snapshot)
    lead_node = next((node for node in nodes.values() if node.get("type") == "input_intake"), None)
    lead = _agent_profile(conn, (lead_node or {}).get("agent_id"))
    created: List[Dict[str, Any]] = []

    for row in task_rows:
        task_id = str(row["task_id"])
        node_id = str(row["node_id"])
        node = nodes.get(node_id) or {}
        run_event = event_by_node.get(node_id) or {}
        agent = _agent_profile(conn, row["local_agent_id"], native_agent_id=row["native_agent_id"])
        try:
            native_task = adapter.get_native_task(task_id)
            if str(native_task.get("assigneeAgentId") or "") != str(row["native_agent_id"] or ""):
                logger.warning("Skip chat projection for %s: native assignee mismatch", task_id)
                continue
            comments = adapter.get_issue_comments(task_id)
            attempts = _execution_attempts(task_id)
        except Exception as exc:
            logger.debug("Skip unavailable native evidence for %s: %s", task_id, exc)
            continue

        identifier = str(native_task.get("identifier") or task_id)
        label = str(node.get("label") or node_id)
        task_link = f"/ATL/issues/{identifier}"
        observed_status = str(native_task.get("status") or row["status"])

        assigned_id = _stable_id("evt", run_id, node_id, task_id, "TASK_ASSIGNED")
        inserted = _insert_event(
            conn, event_id=assigned_id, project_id=pid, conversation_id=conversation_id,
            run_id=run_id, node_id=node_id, native_task_id=task_id, agent=lead,
            execution_run_id=None, event_type="TASK_ASSIGNED", created_at=str(row["created_at"]),
            content=f"Đã giao **{label}** cho **{agent['display_name']}** — [{identifier}]({task_link}).",
            payload={"status": "ASSIGNED", "task_identifier": identifier, "target_agent_id": agent["agent_id"], "node_label": label},
        )
        if inserted:
            created.append(inserted)

        # Paperclip has no independent accepted receipt. A started event is
        # emitted per real execution run, never from issue status alone.
        for attempt in attempts:
            execution_id = str(attempt["runId"])
            event_id = _stable_id("evt", run_id, node_id, task_id, "AGENT_STARTED", execution_id)
            inserted = _insert_event(
                conn, event_id=event_id, project_id=pid, conversation_id=conversation_id,
                run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                execution_run_id=execution_id, event_type="AGENT_STARTED", created_at=str(attempt["startedAt"]),
                content=f"Đang thực hiện **{label}** — [{identifier}]({task_link}).",
                payload={"status": "RUNNING", "task_identifier": identifier, "node_label": label, "execution_status": attempt.get("status")},
            )
            if inserted:
                created.append(inserted)
            if attempt.get("status") in {"failed", "cancelled"}:
                failed_id = _stable_id("evt", run_id, node_id, task_id, "TASK_FAILED", execution_id)
                inserted = _insert_event(
                    conn, event_id=failed_id, project_id=pid, conversation_id=conversation_id,
                    run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                    execution_run_id=execution_id, event_type="TASK_FAILED", created_at=str(attempt.get("finishedAt") or attempt["startedAt"]),
                    content=f"Lần thực thi **{label}** thất bại ({attempt.get('errorCode') or attempt.get('status')}) — [{identifier}]({task_link}).",
                    payload={"status": "FAILED", "task_identifier": identifier, "node_label": label, "error_code": attempt.get("errorCode"), "attempt": (attempt.get("execution") or {}).get("attempt"), "max_attempts": (attempt.get("execution") or {}).get("maxAttempts")},
                )
                if inserted:
                    created.append(inserted)

        for comment in comments:
            if str(comment.get("authorAgentId") or "") != str(row["native_agent_id"] or ""):
                continue
            body = str(comment.get("body") or "").strip()
            comment_id = str(comment.get("id") or "")
            if not body or not comment_id:
                continue
            event_id = _stable_id("evt", run_id, node_id, task_id, "AGENT_PROGRESS", comment_id)
            inserted = _insert_event(
                conn, event_id=event_id, project_id=pid, conversation_id=conversation_id,
                run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                execution_run_id=str(comment.get("createdByRunId") or "") or None,
                event_type="AGENT_PROGRESS", created_at=str(comment.get("createdAt") or now_iso()),
                content=body, payload={"status": "RUNNING", "task_identifier": identifier, "source_comment_id": comment_id, "node_label": label},
            )
            if inserted:
                created.append(inserted)

        if run_event.get("status") == "WAITING_FOR_INPUT":
            event_id = _stable_id("evt", run_id, node_id, task_id, "USER_INPUT_REQUIRED", run_event.get("output_summary"))
            inserted = _insert_event(
                conn, event_id=event_id, project_id=pid, conversation_id=conversation_id,
                run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                execution_run_id=None, event_type="USER_INPUT_REQUIRED", created_at=str(run_event.get("completed_at") or now_iso()),
                content=str(run_event.get("output_summary") or "Node đang chờ dữ liệu bắt buộc."),
                payload={"status": "WAITING_FOR_INPUT", "task_identifier": identifier, "node_label": label},
            )
            if inserted:
                created.append(inserted)

        if observed_status in {"blocked", "failed", "cancelled"}:
            kind = "TASK_BLOCKED" if observed_status == "blocked" else "TASK_FAILED"
            event_id = _stable_id("evt", run_id, node_id, task_id, kind, observed_status)
            inserted = _insert_event(
                conn, event_id=event_id, project_id=pid, conversation_id=conversation_id,
                run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                execution_run_id=None, event_type=kind, created_at=str(row["updated_at"]),
                content=f"{label}: {observed_status} — [{identifier}]({task_link}).",
                payload={"status": observed_status.upper(), "task_identifier": identifier, "node_label": label},
            )
            if inserted:
                created.append(inserted)

        # Completion admission comes only from the engine's validated handoff.
        if run_event.get("status") == "COMPLETED" and run_event.get("handoff", {}).get("manifest_path"):
            try:
                manifest_path = Path(str(run_event["handoff"]["manifest_path"]))
                manifest = validate_handoff(manifest_path, expected_node_id=node_id)
                document = adapter.get_native_handoff(task_id)
                summary = _handoff_summary(str(document.get("body") or ""))
            except Exception as exc:
                logger.warning("Reject completion projection for %s: %s", task_id, exc)
            else:
                execution_id = next((str(item["runId"]) for item in reversed(attempts) if item.get("status") == "succeeded"), None)
                artifact_sha = str(manifest["artifacts"][0]["sha256"])
                handoff_id = _stable_id("evt", run_id, node_id, task_id, "HANDOFF_COMPLETED", artifact_sha)
                inserted = _insert_event(
                    conn, event_id=handoff_id, project_id=pid, conversation_id=conversation_id,
                    run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                    execution_run_id=execution_id, event_type="HANDOFF_COMPLETED", created_at=str(run_event.get("completed_at") or row["updated_at"]),
                    content=f"Đã bàn giao **{label}**: {summary}",
                    payload={"status": "COMPLETED", "task_identifier": identifier, "node_label": label, "handoff_path": str(manifest_path), "artifact_ids": run_event.get("artifact_ids") or [], "artifact_sha256": artifact_sha},
                )
                if inserted:
                    created.append(inserted)
                completed_id = _stable_id("evt", run_id, node_id, task_id, "TASK_COMPLETED", artifact_sha)
                inserted = _insert_event(
                    conn, event_id=completed_id, project_id=pid, conversation_id=conversation_id,
                    run_id=run_id, node_id=node_id, native_task_id=task_id, agent=agent,
                    execution_run_id=execution_id, event_type="TASK_COMPLETED", created_at=str(run_event.get("completed_at") or row["updated_at"]),
                    content=f"Đã hoàn thành **{label}** — [{identifier}]({task_link}); artifact và checksum đã được xác minh.",
                    payload={"status": "COMPLETED", "task_identifier": identifier, "node_label": label, "artifact_ids": run_event.get("artifact_ids") or []},
                )
                if inserted:
                    created.append(inserted)

    conn.commit()
    conn.close()
    return created


def reconcile_project_chat(project_id: str) -> List[Dict[str, Any]]:
    """Explicit bounded reconciliation; ordinary history reads never call Paperclip."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT run_id FROM workflow_runs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 5", (project_id,)
    ).fetchall()
    conn.close()
    created: List[Dict[str, Any]] = []
    for row in rows:
        created.extend(sync_workflow_run_to_chat(str(row["run_id"]), project_id=project_id))
    return created


def list_project_events(project_id: str, *, after_sequence: int = 0, run_id: Optional[str] = None, limit: int = 200) -> Dict[str, Any]:
    conn = get_conn()
    where = "project_id = ? AND sequence > ?"
    params: List[Any] = [project_id, max(0, int(after_sequence))]
    if run_id:
        where += " AND run_id = ?"
        params.append(run_id)
    params.append(max(1, min(int(limit), 500)))
    rows = conn.execute(
        f"SELECT * FROM workflow_chat_events WHERE {where} ORDER BY sequence, created_at, event_id LIMIT ?", params
    ).fetchall()
    conn.close()
    events = [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows]
    return {"project_id": project_id, "run_id": run_id, "events": events, "next_sequence": events[-1]["sequence"] if events else after_sequence}
