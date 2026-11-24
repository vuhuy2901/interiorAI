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
from datetime import datetime
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


def _completed_output(run_doc: Dict[str, Any], executor: str) -> Optional[Dict[str, Any]]:
    for event in run_doc.get("events") or []:
        if event.get("status") == "COMPLETED" and executor in {event.get("executor_type"), event.get("node_type")}:
            output = event.get("output")
            if isinstance(output, dict):
                return output
    return None


def _parse_iso(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def build_completion_summary(conn: Any, run_doc: Dict[str, Any], project_id: str) -> Dict[str, Any]:
    """Structured facts for the completion message. Missing facts stay None; nothing is estimated."""
    row = conn.execute("SELECT name FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    name = str(row["name"]).strip() or None if row and row["name"] else None
    events = [event for event in run_doc.get("events") or [] if isinstance(event, dict)]
    started, finished = _parse_iso(run_doc.get("started_at")), _parse_iso(run_doc.get("completed_at"))
    duration = round((finished - started).total_seconds(), 1) if started and finished and finished >= started else None

    cost = None
    cost_out = _completed_output(run_doc, "deterministic_cost")
    if cost_out is not None and _number(cost_out.get("total_vnd")) is not None:
        priced, unpriced = _number(cost_out.get("priced_line_count")), _number(cost_out.get("unpriced_line_count"))
        is_complete = cost_out.get("total_is_complete")
        cost = {
            "total_vnd": _number(cost_out.get("total_vnd")),
            "price_coverage_percent": _number(cost_out.get("price_coverage_percent")),
            "total_is_complete": is_complete if isinstance(is_complete, bool) else None,
            "priced_line_count": int(priced) if priced is not None else None,
            "line_count": int(priced + unpriced) if priced is not None and unpriced is not None else None,
        }

    exports: List[Dict[str, str]] = []
    cad_out = _completed_output(run_doc, "cad_export") or {}
    for field, fmt, label in (("dxf_path", "dxf", "Bản vẽ DXF"), ("glb_path", "glb", "Mô hình GLB"), ("bom_csv_path", "csv", "BOM/BOQ CSV")):
        if cad_out.get(field):
            exports.append({"kind": fmt, "label": label, "url": f"/api/v1/exports/{project_id}/{fmt}"})
    render_out = _completed_output(run_doc, "render_gen") or {}
    render_url = render_out.get("render_url") if isinstance(render_out.get("render_url"), str) and render_out.get("render_url") else None

    return {
        "project_name": name,
        "revision": run_doc.get("scene_revision") if isinstance(run_doc.get("scene_revision"), int) else None,
        "completed_nodes": sum(1 for event in events if event.get("status") == "COMPLETED"),
        "total_nodes": len(events),
        "duration_seconds": duration,
        "cost": cost,
        "exports": exports,
        "render_url": render_url,
    }


def completion_message_text(summary: Dict[str, Any]) -> str:
    missing = "chưa có"
    cost = summary.get("cost")
    if not cost:
        cost_line = f"Dự toán: {missing}"
    else:
        total = f"{cost['total_vnd']:,.0f} VNĐ"
        if cost.get("total_is_complete") is True:
            cost_line = f"Tổng dự toán: {total}"
        else:
            coverage = f"{cost['priced_line_count']}/{cost['line_count']} hạng mục có giá" if cost.get("priced_line_count") is not None and cost.get("line_count") is not None else (
                f"độ phủ giá {cost['price_coverage_percent']:g}%" if cost.get("price_coverage_percent") is not None else "độ phủ giá chưa có")
            cost_line = f"Dự toán tạm tính: {total} (tạm tính, {coverage}; chưa phải tổng chính thức)"
    duration = summary.get("duration_seconds")
    lines = [
        f"Dự án hoàn thành: {summary.get('project_name') or missing}",
        f"Revision: {summary['revision'] if summary.get('revision') is not None else missing}",
        f"Node hoàn thành: {summary['completed_nodes']}/{summary['total_nodes']}",
        f"Tổng thời gian: {f'{duration:g} giây' if duration is not None else missing}",
        cost_line,
        "File xuất: " + (", ".join(f"{item['label']} ({item['url']})" for item in summary["exports"]) or missing),
        f"Ảnh render: {summary.get('render_url') or missing}",
    ]
    return "\n".join(lines)


def _insert_completion_summary(conn: Any, *, run_id: str, run_doc: Dict[str, Any], pid: str, conversation_id: Optional[str], lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One summary per run, only when the persisted run status is COMPLETED."""
    if run_doc.get("status") != "COMPLETED":
        return None
    summary = build_completion_summary(conn, run_doc, pid)
    return _insert_event(
        conn, event_id=_stable_id("evt", run_id, "PROJECT_COMPLETED"), project_id=pid, conversation_id=conversation_id,
        run_id=run_id, node_id="__project__", native_task_id=None, agent=lead, execution_run_id=None,
        event_type="PROJECT_COMPLETED", created_at=str(run_doc.get("completed_at") or now_iso()),
        content=completion_message_text(summary),
        payload={"status": "COMPLETED", "node_label": "Dự án hoàn thành", "completion": summary},
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

    inserted = _insert_completion_summary(conn, run_id=run_id, run_doc=run_doc, pid=pid, conversation_id=conversation_id, lead=lead)
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
