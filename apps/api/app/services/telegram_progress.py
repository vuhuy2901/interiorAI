from __future__ import annotations

import asyncio
import contextlib
import json
import re
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, List, Optional

from app.db import get_conn, get_project, now_iso
from app.models.contracts import (
    QuestionRequest,
    SceneProposal,
    TaskProgressRecord,
    TelegramConfigPayload,
    TelegramProgressStep,
)


DEFAULT_STEPS = [
    ("n4_brief", "Phân tích yêu cầu & khóa tỷ lệ", "agent_floorplan"),
    ("n5_geometry", "Điều phối bố cục / vật liệu", "agent_geometry"),
    ("n8_clearance", "Kiểm định lối đi & dự toán", "agent_cost"),
    ("n11_approval", "Tổng hợp kết quả & phê duyệt", "agent_chief_architect"),
]


def build_ascii_progress_bar(pct: int) -> str:
    pct = max(0, min(100, int(pct)))
    filled = min(10, pct // 10)
    return f"[{'█' * filled}{'░' * (10 - filled)}] {pct}%"


def get_telegram_config(include_secret: bool = False) -> TelegramConfigPayload:
    conn = get_conn()
    row = conn.execute("SELECT payload_json, bot_token FROM telegram_settings WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return TelegramConfigPayload()
    payload = json.loads(row["payload_json"])
    payload["bot_token"] = row["bot_token"] if include_secret else ("REDACTED" if row["bot_token"] else "")
    return TelegramConfigPayload.model_validate(payload)


def save_telegram_config(config: TelegramConfigPayload) -> TelegramConfigPayload:
    conn = get_conn()
    old = conn.execute("SELECT bot_token FROM telegram_settings WHERE id = 1").fetchone()
    token = config.bot_token
    if token in {"", "REDACTED"} and old:
        token = old["bot_token"]
    public = config.model_dump(exclude={"bot_token"})
    conn.execute(
        "INSERT INTO telegram_settings (id, payload_json, bot_token, updated_at) VALUES (1, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, bot_token=excluded.bot_token, updated_at=excluded.updated_at",
        (json.dumps(public, ensure_ascii=False), token, now_iso()),
    )
    conn.commit()
    conn.close()
    return get_telegram_config(False)


def _save(record: TaskProgressRecord) -> TaskProgressRecord:
    record.updated_at = now_iso()
    conn = get_conn()
    conn.execute(
        "INSERT INTO task_progress (task_id, project_id, run_id, status, progress_pct, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(task_id) DO UPDATE SET run_id=excluded.run_id, status=excluded.status, progress_pct=excluded.progress_pct, payload_json=excluded.payload_json, updated_at=excluded.updated_at",
        (record.task_id, record.project_id, record.run_id, record.status, record.progress_pct, record.model_dump_json(), record.created_at, record.updated_at),
    )
    conn.commit()
    conn.close()
    return record


def get_task(task_id: str) -> Optional[TaskProgressRecord]:
    conn = get_conn()
    row = conn.execute("SELECT payload_json FROM task_progress WHERE task_id = ?", (task_id,)).fetchone()
    conn.close()
    return TaskProgressRecord.model_validate_json(row["payload_json"]) if row else None


def list_task_progress(limit: int = 50, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_conn()
    if project_id:
        rows = conn.execute("SELECT payload_json FROM task_progress WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?", (project_id, limit)).fetchall()
    else:
        rows = conn.execute("SELECT payload_json FROM task_progress ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
    logs = conn.execute("SELECT * FROM telegram_delivery_logs ORDER BY id DESC LIMIT 100").fetchall()
    conn.close()
    by_task: Dict[str, List[Dict[str, Any]]] = {}
    for log in logs:
        item = dict(log)
        by_task.setdefault(item.get("task_id") or "", []).append(item)
    result = []
    for row in rows:
        item = json.loads(row["payload_json"])
        item["delivery_logs"] = by_task.get(item["task_id"], [])
        result.append(item)
    return result


def _keyboard(record: TaskProgressRecord) -> Optional[Dict[str, Any]]:
    if record.question_id:
        conn = get_conn()
        row = conn.execute("SELECT payload_json FROM questions WHERE question_id=?", (record.question_id,)).fetchone()
        conn.close()
        if row:
            q = QuestionRequest.model_validate_json(row["payload_json"])
            return {"inline_keyboard": [[{"text": c.label, "callback_data": f"question:{q.question_id}:{c.id}"}] for c in q.choices]}
    if record.proposal_id:
        conn = get_conn()
        row = conn.execute("SELECT payload_json FROM proposals WHERE proposal_id=?", (record.proposal_id,)).fetchone()
        conn.close()
        if row:
            p = SceneProposal.model_validate_json(row["payload_json"])
            keys = [[{"text": "✅ Phê duyệt áp dụng", "callback_data": f"approve:{p.proposal_id}"}, {"text": "❌ Từ chối", "callback_data": f"reject:{p.proposal_id}"}]]
            if p.options:
                keys.append([{"text": f"Chọn PA {o.option_id}", "callback_data": f"approve:{p.proposal_id}:{o.option_id}"} for o in p.options])
            return {"inline_keyboard": keys}
    return None


def format_progress_card(record: TaskProgressRecord) -> str:
    project = get_project(record.project_id)
    project_name = project.name if project else record.project_id
    status_icons = {"QUEUED": "🕒", "RUNNING": "🔄", "WAITING_FOR_INPUT": "⏸️", "WAITING_FOR_APPROVAL": "🟡", "COMPLETED": "✅", "FAILED": "❌"}
    lines = [
        f"{status_icons.get(record.status, '📋')} <b>#{record.task_id} — {record.title}</b>",
        f"🏠 Dự án: <b>{project_name}</b>",
        f"<code>{build_ascii_progress_bar(record.progress_pct)}</code>",
        f"📌 {record.current_step_label or record.status}",
        f"🤖 Agent: {record.assigned_agent}", "",
    ]
    icons = {"COMPLETED": "✅", "RUNNING": "⏳", "PENDING": "⚪", "SKIPPED": "⏭️", "FAILED": "❌"}
    lines.extend(f"{icons.get(s.status, '⚪')} {s.label}{(': ' + s.detail) if s.detail else ''}" for s in record.steps)
    if record.proposal_id:
        lines.extend(["", f"📝 Đề xuất: <code>{record.proposal_id}</code>"])
    if record.question_id:
        lines.extend(["", f"❓ Cần phản hồi: <code>{record.question_id}</code>"])
    return "\n".join(lines)


class TelegramProgressReporter:
    async def publish(self, record: TaskProgressRecord, force_send: bool = False) -> TaskProgressRecord:
        config = get_telegram_config(True)
        text = format_progress_card(record)
        keyboard = _keyboard(record)
        real = bool(config.enabled and config.bot_token and config.chat_id and config.bot_token != "REDACTED")
        method = "sendMessage"
        if real and record.telegram_message_id and config.update_mode == "edit_single_message" and not force_send:
            method = "editMessageText"
        payload: Dict[str, Any] = {"chat_id": config.chat_id, "text": text, "parse_mode": "HTML"}
        if method == "editMessageText":
            payload["message_id"] = record.telegram_message_id
        if keyboard:
            payload["reply_markup"] = json.dumps(keyboard, ensure_ascii=False)
        response: Dict[str, Any] = {"ok": True, "simulation": not real}
        status = "SIMULATED"
        if real:
            try:
                response = await asyncio.to_thread(self._post, config.bot_token, method, payload)
                status = "DELIVERED" if response.get("ok") else "FAILED"
                if method == "sendMessage" and response.get("result", {}).get("message_id"):
                    record.telegram_message_id = str(response["result"]["message_id"])
                    record.telegram_chat_id = config.chat_id
                    _save(record)
            except Exception as exc:
                response, status = {"ok": False, "error": str(exc)}, "FAILED"
        conn = get_conn()
        conn.execute("INSERT INTO telegram_delivery_logs (task_id, delivery_mode, method, status, message_text, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (record.task_id, config.update_mode, method, status, text, json.dumps(response, ensure_ascii=False), now_iso()))
        conn.commit(); conn.close()
        return record

    @staticmethod
    def _post(token: str, method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=urllib.parse.urlencode(payload).encode(), method="POST")
        with urllib.request.urlopen(req, timeout=12) as res:
            return json.loads(res.read().decode())


async def start_task_progress(project_id: str, title: str, prompt: str, assigned_agent: str, steps: Optional[List[Any]] = None, run_id: Optional[str] = None) -> TaskProgressRecord:
    task_steps = [TelegramProgressStep(step_id=s[0], label=s[1], agent_id=s[2]) for s in (steps or DEFAULT_STEPS)]
    ts = now_iso()
    record = TaskProgressRecord(task_id=f"ATL-{uuid.uuid4().hex[:4].upper()}", project_id=project_id, run_id=run_id, title=title, prompt=prompt, assigned_agent=assigned_agent, steps=task_steps, created_at=ts, updated_at=ts)
    _save(record); await TelegramProgressReporter().publish(record, True)
    return record


async def advance_task_progress(task_id: str, step_id: str, status: str, detail: str, progress_pct: int) -> TaskProgressRecord:
    record = get_task(task_id)
    if not record: raise ValueError(f"Task {task_id} not found")
    ts = now_iso()
    for step in record.steps:
        if step.step_id == step_id:
            step.status, step.detail = status, detail
            step.started_at = step.started_at or ts
            if status in {"COMPLETED", "SKIPPED", "FAILED"}: step.completed_at = ts
        elif step.status == "RUNNING":
            step.status, step.completed_at = "COMPLETED", ts
    record.status = "FAILED" if status == "FAILED" else "RUNNING"
    record.progress_pct, record.current_step_label = progress_pct, detail
    _save(record); await TelegramProgressReporter().publish(record)
    return record


async def attach_proposal_or_question_to_progress(task_id: str, proposal: Any = None, question: Any = None) -> TaskProgressRecord:
    record = get_task(task_id)
    if not record: raise ValueError(f"Task {task_id} not found")
    if proposal:
        record.proposal_id = proposal.proposal_id if hasattr(proposal, "proposal_id") else proposal["proposal_id"]
        record.status, record.progress_pct, record.current_step_label = "WAITING_FOR_APPROVAL", 95, "Đang chờ phê duyệt đề xuất"
    if question:
        record.question_id = question.question_id if hasattr(question, "question_id") else question["question_id"]
        record.status, record.current_step_label = "WAITING_FOR_INPUT", "Đang chờ phản hồi"
    _save(record); await TelegramProgressReporter().publish(record)
    return record


async def complete_task_progress(task_id: str, summary_text: str, revision: int) -> TaskProgressRecord:
    record = get_task(task_id)
    if not record: raise ValueError(f"Task {task_id} not found")
    for step in record.steps:
        if step.status not in {"SKIPPED", "FAILED"}: step.status = "COMPLETED"
    record.status, record.progress_pct = "COMPLETED", 100
    record.current_step_label = f"{summary_text} — Revision #{revision}"
    _save(record); await TelegramProgressReporter().publish(record)
    return record


async def fail_task_progress(task_id: str, error_message: str) -> TaskProgressRecord:
    record = get_task(task_id)
    if not record: raise ValueError(f"Task {task_id} not found")
    record.status, record.current_step_label = "FAILED", error_message
    _save(record); await TelegramProgressReporter().publish(record)
    return record


def find_task_by_link(*, proposal_id: Optional[str] = None, question_id: Optional[str] = None) -> Optional[TaskProgressRecord]:
    conn = get_conn(); rows = conn.execute("SELECT payload_json FROM task_progress ORDER BY updated_at DESC").fetchall(); conn.close()
    for row in rows:
        rec = TaskProgressRecord.model_validate_json(row["payload_json"])
        if (proposal_id and rec.proposal_id == proposal_id) or (question_id and rec.question_id == question_id): return rec
    return None


def _session_project(chat_id: str) -> Optional[str]:
    conn = get_conn()
    row = conn.execute("SELECT active_project_id FROM telegram_chat_sessions WHERE chat_id=?", (chat_id,)).fetchone()
    conn.close()
    return row["active_project_id"] if row else None


def _save_session(chat_id: str, project_id: Optional[str], update_id: int) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO telegram_chat_sessions (chat_id, active_project_id, last_update_id, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(chat_id) DO UPDATE SET active_project_id=COALESCE(excluded.active_project_id, telegram_chat_sessions.active_project_id), last_update_id=MAX(telegram_chat_sessions.last_update_id, excluded.last_update_id), updated_at=excluded.updated_at",
        (chat_id, project_id, update_id, now_iso()),
    )
    conn.commit(); conn.close()


def _last_update_id() -> int:
    conn = get_conn()
    row = conn.execute("SELECT MAX(last_update_id) AS value FROM telegram_chat_sessions").fetchone()
    conn.close()
    return int(row["value"] or 0)


def _plain(text: str) -> str:
    return re.sub(r"[`*_#]", "", text or "").strip()[:3500]


async def _bot_call(method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get_telegram_config(True)
    if not cfg.bot_token or cfg.bot_token == "REDACTED":
        return {"ok": False, "error": "Telegram bot token is not configured"}
    return await asyncio.to_thread(TelegramProgressReporter._post, cfg.bot_token, method, payload)


async def _send_chat(chat_id: str, text: str, keyboard: Optional[Dict[str, Any]] = None) -> None:
    payload: Dict[str, Any] = {"chat_id": chat_id, "text": text}
    if keyboard:
        payload["reply_markup"] = json.dumps(keyboard, ensure_ascii=False)
    await _bot_call("sendMessage", payload)


async def _handle_message(message: Dict[str, Any], update_id: int) -> None:
    from app.db import list_projects
    from app.services.orchestrator import process_user_chat_message

    chat_id = str(message.get("chat", {}).get("id", ""))
    text = (message.get("text") or "").strip()
    cfg = get_telegram_config(True)
    if not chat_id or chat_id != str(cfg.chat_id):
        return
    active = _session_project(chat_id)
    projects = list_projects()

    if text in {"/start", "/help"}:
        _save_session(chat_id, active or (projects[0].project_id if projects else None), update_id)
        await _send_chat(chat_id, "🏛 ATELIER AI — KTS Trưởng\n\n/projects — danh sách dự án\n/project <project_id> — chọn dự án\n/status — xem dự án đang mở\nNhập nội dung bất kỳ để giao việc cho KTS Trưởng.")
        return
    if text == "/projects":
        lines = ["📁 Danh sách dự án:"] + [f"• {p.project_id} — {p.name} (Rev #{p.revision})" for p in projects]
        await _send_chat(chat_id, "\n".join(lines)); _save_session(chat_id, active, update_id); return
    if text.startswith("/project"):
        target = text.partition(" ")[2].strip()
        project = get_project(target)
        if not project:
            await _send_chat(chat_id, "❌ Không tìm thấy project_id. Dùng /projects để xem danh sách.")
        else:
            _save_session(chat_id, target, update_id)
            await _send_chat(chat_id, f"✅ Đã chọn dự án: {project.name}\nMã: {project.project_id}\nRevision #{project.revision}")
        return
    if text == "/status":
        project = get_project(active) if active else None
        await _send_chat(chat_id, f"📌 Dự án đang mở: {project.name}\n{project.project_id} • Rev #{project.revision}" if project else "⚠️ Chưa chọn dự án. Dùng /projects rồi /project <project_id>.")
        _save_session(chat_id, active, update_id); return
    if text.startswith("/"):
        await _send_chat(chat_id, "Lệnh chưa hỗ trợ. Dùng /help để xem hướng dẫn."); _save_session(chat_id, active, update_id); return
    if not active or not get_project(active):
        await _send_chat(chat_id, "⚠️ Hãy chọn dự án trước: /projects rồi /project <project_id>")
        _save_session(chat_id, active, update_id); return

    await _send_chat(chat_id, f"📥 Đã nhận việc cho dự án {get_project(active).name}. KTS Trưởng đang điều phối các Agent...")
    try:
        result = await process_user_chat_message(active, text)
        task = result.get("metadata", {}).get("task_progress", {}).get("task_id", "")
        await _send_chat(chat_id, f"🏛 KTS Trưởng phản hồi #{task}:\n\n{_plain(result.get('reply', 'Đã xử lý yêu cầu.'))}")
    except Exception as exc:
        await _send_chat(chat_id, f"❌ Không thể xử lý công việc: {_plain(str(exc))}")
    _save_session(chat_id, active, update_id)


async def _handle_callback(callback: Dict[str, Any], update_id: int) -> None:
    from app.services.orchestrator import answer_question_and_resume, approve_scene_proposal, reject_scene_proposal

    callback_id = callback.get("id", "")
    data = callback.get("data", "")
    chat_id = str(callback.get("message", {}).get("chat", {}).get("id", ""))
    cfg = get_telegram_config(True)
    if not chat_id or chat_id != str(cfg.chat_id):
        return
    try:
        parts = data.split(":")
        if parts[0] == "approve":
            result = await approve_scene_proposal(parts[1], parts[2] if len(parts) > 2 else None)
            task = find_task_by_link(proposal_id=parts[1])
            if task: await complete_task_progress(task.task_id, "Đã phê duyệt từ Telegram & đồng bộ 3D", result["project"]["revision"])
            message = "✅ Đã phê duyệt và đồng bộ dự án."
        elif parts[0] == "reject":
            reject_scene_proposal(parts[1], "Từ chối từ Telegram")
            task = find_task_by_link(proposal_id=parts[1])
            if task: await complete_task_progress(task.task_id, "Đề xuất đã bị từ chối từ Telegram", 0)
            message = "❌ Đã từ chối đề xuất."
        elif parts[0] == "question":
            result = answer_question_and_resume(parts[1], parts[2])
            task = find_task_by_link(question_id=parts[1])
            if task: await complete_task_progress(task.task_id, "Đã nhận phản hồi từ Telegram", (result.get("project") or {}).get("revision", 0))
            message = "✅ Đã ghi nhận câu trả lời và tiếp tục quy trình."
        else:
            message = "Thao tác không được hỗ trợ."
        await _bot_call("answerCallbackQuery", {"callback_query_id": callback_id, "text": message})
        await _send_chat(chat_id, message)
    except Exception as exc:
        await _bot_call("answerCallbackQuery", {"callback_query_id": callback_id, "text": "Không thể xử lý thao tác"})
        await _send_chat(chat_id, f"❌ Lỗi callback: {_plain(str(exc))}")
    _save_session(chat_id, _session_project(chat_id), update_id)


async def telegram_inbound_polling_loop() -> None:
    bootstrapped_token = ""
    while True:
        try:
            cfg = get_telegram_config(True)
            if not cfg.enabled or not cfg.bot_token or not cfg.chat_id or cfg.bot_token == "REDACTED":
                await asyncio.sleep(2.0); continue
            if bootstrapped_token != cfg.bot_token and _last_update_id() == 0:
                initial = await _bot_call("getUpdates", {"offset": -1, "timeout": 0})
                for update in initial.get("result", []):
                    chat = update.get("message", {}).get("chat", {})
                    if str(chat.get("id", "")) == str(cfg.chat_id):
                        _save_session(str(cfg.chat_id), None, int(update["update_id"]))
                bootstrapped_token = cfg.bot_token
            response = await _bot_call("getUpdates", {"offset": _last_update_id() + 1, "timeout": 20, "allowed_updates": json.dumps(["message", "callback_query"])})
            for update in response.get("result", []):
                uid = int(update["update_id"])
                if update.get("message"): await _handle_message(update["message"], uid)
                elif update.get("callback_query"): await _handle_callback(update["callback_query"], uid)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(3.0)


def start_telegram_inbound_worker() -> asyncio.Task:
    return asyncio.create_task(telegram_inbound_polling_loop(), name="atelier-telegram-inbound")


async def stop_telegram_inbound_worker(task: Optional[asyncio.Task]) -> None:
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
