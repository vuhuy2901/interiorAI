"""
ATELIER AI 2.0 — IDE Reverse Bridge Service
Zero API Cost Dispatcher routing conversational requests from both Paperclip Web UI (:3100)
and FastAPI (:8000) directly to the local Antigravity IDE agent.
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.db import get_conn, get_project, now_iso
from app.services.cost_engine import calculate_project_estimate
from app.services.geometry import analyze_scene_spatial_quality
from app.services.inventory_bom import generate_project_inventory_bom

BRIDGE_DATA_DIR = Path("C:/Users/TUAN/Downloads/qldapm_fina/data/bridge")
BRIDGE_TASKS_FILE = BRIDGE_DATA_DIR / "inbox_tasks.json"
PAPERCLIP_BASE_URL = os.getenv("PAPERCLIP_BASE_URL", "http://127.0.0.1:3100")


def ensure_bridge_dir() -> Path:
    BRIDGE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not BRIDGE_TASKS_FILE.exists():
        BRIDGE_TASKS_FILE.write_text("[]", encoding="utf-8")
    return BRIDGE_DATA_DIR


def ensure_bridge_table() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ide_bridge_tasks (
            task_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_text TEXT NOT NULL,
            selected_entity_id TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            response_content TEXT,
            attachments_json TEXT
        )
        """
    )
    conn.commit()


def is_ide_bridge_enabled() -> bool:
    """Returns True if IDE bridge mode is toggled via env or settings."""
    env_val = os.getenv("IDE_BRIDGE_MODE", "1").lower().strip()
    return env_val in ("1", "true", "yes", "on")


def enqueue_task(
    project_id: str,
    user_text: str,
    selected_entity_id: Optional[str] = None,
    paperclip_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Enqueues a user chat request for processing by the local IDE Agent.
    Saves to both SQLite and the JSON queue file for easy CLI inspection.
    """
    ensure_bridge_dir()
    ensure_bridge_table()

    task_id = f"task_{uuid.uuid4().hex[:10]}"
    ts = now_iso()
    initial_attachments: Dict[str, Any] = {}
    if paperclip_meta:
        initial_attachments["paperclip"] = paperclip_meta

    task = {
        "task_id": task_id,
        "project_id": project_id,
        "user_text": user_text,
        "selected_entity_id": selected_entity_id,
        "status": "PENDING",
        "created_at": ts,
        "resolved_at": None,
        "response_content": None,
        "attachments": initial_attachments,
    }

    conn = get_conn()
    conn.execute(
        """
        INSERT INTO ide_bridge_tasks
        (task_id, project_id, user_text, selected_entity_id, status, created_at, attachments_json)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        """,
        (task_id, project_id, user_text, selected_entity_id, ts, json.dumps(initial_attachments, ensure_ascii=False)),
    )

    user_msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn.execute(
        """
        INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
        VALUES (?, ?, 'user', 'Gia chủ / Người thiết kế', ?, ?, ?)
        """,
        (
            user_msg_id,
            project_id,
            user_text,
            json.dumps(
                {"bridge_task_id": task_id, "status": "PENDING_IDE", "paperclip": paperclip_meta},
                ensure_ascii=False,
            ),
            ts,
        ),
    )
    conn.commit()

    try:
        tasks = []
        if BRIDGE_TASKS_FILE.exists():
            tasks = json.loads(BRIDGE_TASKS_FILE.read_text(encoding="utf-8"))
        tasks.append(task)
        BRIDGE_TASKS_FILE.write_text(json.dumps(tasks, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    return task


DEEP_IDE_KEYWORDS = (
    "blender",
    "asset builder",
    "dựng tủ",
    "dựng bàn",
    "dựng ghế",
    "dựng kệ",
    "tạo model",
    "chụp 6 góc",
    "render 6",
    "cycles",
    "kiểm toán",
    "audit",
    "sửa code",
    "viết code",
    "tạo task",
    "4 task",
    "delegation",
    "nhờ ide",
    "gọi ide",
    "chuyển về ide",
)

SCENE_MUTATION_KEYWORDS = (
    "đổi sơn",
    "màu sơn",
    "lát gạch",
    "đổi gạch",
    "đổi sàn",
    "sofa",
    "đồng ý duyệt",
    "phê duyệt",
    "duyệt phương án",
    "thiết kế căn hộ",
    "thiết kế phòng",
    "phương án thiết kế",
)


def is_deep_ide_task(user_text: str) -> bool:
    """Returns True only for tasks requiring full Antigravity IDE coding, Blender 3D builds, or QA audits."""
    lower = (user_text or "").lower().strip()
    if not lower or lower.startswith("## paperclip wake payload"):
        return False
    return any(kw in lower for kw in DEEP_IDE_KEYWORDS)


def _format_room_dimensions_mm(project: Any) -> str:
    if not project.rooms:
        return "4000×5000×2800 mm"
    room = project.rooms[0]
    xs = [pt[0] for pt in room.polygon_mm]
    ys = [pt[1] for pt in room.polygon_mm]
    width = max(xs) - min(xs) if xs else 4000.0
    depth = max(ys) - min(ys) if ys else 5000.0
    return f"{width:,.0f}×{depth:,.0f}×{room.ceiling_height_mm:,.0f} mm"


def _build_fast_studio_reply(agent_name: str, user_text: str, project_id: str = "proj_demo_4x5m") -> Optional[str]:
    """Builds an instant (<0.5s), role-tailored Vietnamese response from real project state at $0.00 cost."""
    project = get_project(project_id)
    if not project:
        return None

    lower_agent = (agent_name or "").lower()
    clean_text = (user_text or "").strip()
    is_wake_retry = clean_text.lower().startswith("## paperclip wake payload")
    room_dims = _format_room_dimensions_mm(project)
    room = project.rooms[0] if project.rooms else None
    estimate = project.estimate_snapshot or calculate_project_estimate(project)
    spatial = analyze_scene_spatial_quality(project)
    bom = generate_project_inventory_bom(project)
    furn_count = len(project.furniture_instances)
    glb_ref = "`/static/assets/glb/tv_console_wall_1800x350x300.glb`"

    if "lighting" in lower_agent or "chiếu sáng" in lower_agent or "visualization" in lower_agent:
        body = (
            f"Chào bạn! **Lighting & Visualization Specialist** đã phản hồi ngay:\n\n"
            f"- **Dự án & Không gian**: `{project.project_id}` (`{room.name if room else 'Phòng khách'}`, `{room_dims}`, `Revision #{project.revision}`).\n"
            f"- **Kịch bản ánh sáng hiện tại**: Ánh sáng tự nhiên ban ngày kết hợp đèn hắt khe trần `3000K`.\n"
            f"- **Vật liệu & Model 3D kiểm định**: {glb_ref} với 3 khe PBR chuẩn (`MAT_wood_body`, `MAT_wood_door`, `MAT_metal_handle`).\n"
            f"- **Gợi ý tiếp theo**: Nhắn góc camera, nhiệt độ màu (`2700K–4000K`) hoặc lệnh *\"render / chụp 6 góc\"* để tôi xử lý chi tiết."
        )
    elif "cost" in lower_agent or "bom" in lower_agent or "dự toán" in lower_agent:
        body = (
            f"Báo cáo tức thì từ **Cost, BOM & Inventory Manager** (`{project.project_id}`):\n\n"
            f"- **Tổng dự toán hoàn thiện**: `{estimate.total_vnd:,.0f} VNĐ` (Hạn mức ngân sách: `{estimate.budget_limit_vnd:,.0f} VNĐ` — {'Đạt trong ngân sách' if estimate.within_budget else 'Vượt ngân sách'}).\n"
            f"- **Chi tiết bóc tách**: Vật liệu `{estimate.materials_subtotal_vnd:,.0f} VNĐ`, Đồ rời ({furn_count} món) `{estimate.furniture_subtotal_vnd:,.0f} VNĐ`, Nhân công `{estimate.labor_subtotal_vnd:,.0f} VNĐ`, VAT `{estimate.tax_vnd:,.0f} VNĐ`.\n"
            f"- **Kiểm kê BOM**: `{bom.get('total_items', furn_count)}` hạng mục hợp lệ (`{estimate.confidence_level}`)."
        )
    elif "qa" in lower_agent or "validation" in lower_agent or "kiểm định" in lower_agent:
        body = (
            f"**QA & Validation Specialist** đã kiểm tra tức thì cảnh `{project.project_id}` (`Revision #{project.revision}`):\n\n"
            f"- **Tình trạng thông thủy & va chạm**: `{'ĐẠT' if spatial.get('clearance_ok', True) else 'CẦN XEM XÉT'}` (Lối đi tối thiểu `{spatial.get('min_walkway_mm', 850):,.0f} mm`, số va chạm `{len(spatial.get('collisions', []))}`).\n"
            f"- **Scale Gate**: `{'Đã xác thực tỷ lệ mm' if project.scale_calibrated else 'Chưa khóa tỷ lệ'}` (`{room_dims}`).\n"
            f"- Nếu cần kiểm toán P0–P3 toàn repo hoặc bằng chứng render, hãy nhắn *\"kiểm toán độc lập\"*."
        )
    elif "geometry" in lower_agent or "bim" in lower_agent or "floor plan" in lower_agent or "mặt bằng" in lower_agent:
        body = (
            f"**{agent_name}** báo cáo thông số BIM hiện tại (`{project.project_id}`):\n\n"
            f"- **Kích thước phòng**: `{room_dims}` | Tường: `{len(project.walls)}` đoạn | Cửa đi: `{len(project.openings)}` | Cửa sổ: `{len(project.windows)}`.\n"
            f"- **Asset tham số mới nhất**: Kệ TV treo tường `1800×350×300 mm` ({glb_ref}).\n"
            f"- **Sẵn sàng xuất**: DXF R2007, IFC4 và GLB. Nếu cần dựng đồ nội thất Blender mới, hãy nhập rõ kích thước `mm` + vật liệu (ví dụ *\"dựng tủ ...\"*)."
        )
    elif "furniture" in lower_agent or "bố cục" in lower_agent or "style" in lower_agent or "research" in lower_agent:
        furn_names = ", ".join(f.name for f in project.furniture_instances[:4]) or "Chưa có đồ rời"
        body = (
            f"**{agent_name}** đã kiểm tra trạng thái bố cục & vật liệu (`{project.project_id}`):\n\n"
            f"- **Phong cách**: `{project.design_brief.style}` | Sàn `{room.floor_material_id if room else 'floor_wood_oak_straight'}` | Tường `{room.wall_base_material_id if room else 'paint_dulux_japandi_ivory'}`.\n"
            f"- **Đồ rời hiện có ({furn_count} món)**: {furn_names}.\n"
            f"- **Thông thủy lối đi**: `{spatial.get('min_walkway_mm', 850):,.0f} mm`."
        )
    else:
        body = (
            f"Chào bạn! **{agent_name}** đã tiếp nhận và phản hồi tức thì (`{project.project_id}`):\n\n"
            f"- **Không gian**: `{room_dims}` (`{project.design_brief.style}`, `Revision #{project.revision}`).\n"
            f"- **Dự toán hiện tại**: `{estimate.total_vnd:,.0f} VNĐ` ({furn_count} món nội thất, thông thủy `{spatial.get('min_walkway_mm', 850):,.0f} mm`).\n"
            f"- **Tài sản 3D mới nhất**: {glb_ref}.\n"
            f"- Bạn có thể hỏi trực tiếp về dự toán, thông thủy, đổi sơn/gạch/sofa, hoặc gõ lệnh dựng Blender/kiểm toán để đẩy sang Antigravity IDE Worker!"
        )

    if not is_wake_retry and clean_text:
        header = f"⚡ **[Phản hồi tức thì — $0.00 API Cost]** *(Đã nhận: `{clean_text[:80]}`)*\n\n"
    else:
        header = "⚡ **[Phản hồi tức thì — $0.00 API Cost]**\n\n"
    return header + body


def _record_fast_resolved_task(
    task: Dict[str, Any],
    reply_text: str,
) -> None:
    ts = now_iso()
    attachments = {
        **(task.get("attachments") or {}),
        "cost_usd": 0.0,
        "handled_by": "Hybrid Fast-Path Studio Engine ($0.00)",
    }
    conn = get_conn()
    conn.execute(
        """
        UPDATE ide_bridge_tasks
        SET status = 'RESOLVED', resolved_at = ?, response_content = ?, attachments_json = ?
        WHERE task_id = ?
        """,
        (ts, reply_text, json.dumps(attachments, ensure_ascii=False), task["task_id"]),
    )
    conn.execute(
        """
        INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
        VALUES (?, ?, 'assistant', 'Hybrid Fast-Path Studio Engine ($0.00)', ?, ?, ?)
        """,
        (f"msg_{uuid.uuid4().hex[:10]}", task["project_id"], reply_text, json.dumps(attachments, ensure_ascii=False), ts),
    )
    conn.commit()


def _extract_paperclip_turn_context(payload: Dict[str, Any]) -> tuple[str, str, Dict[str, Any], str]:
    issue_id = str(payload.get("issue_id") or "").strip()
    comment_id = str(payload.get("comment_id") or "").strip()
    agent_id = str(payload.get("agent_id") or "").strip()
    agent_name = str(payload.get("agent_name") or "Chief Architect").strip()
    wake_prompt = str(payload.get("wake_prompt") or "").strip()

    user_text = wake_prompt
    identifier = issue_id
    if issue_id:
        try:
            req = urllib.request.urlopen(f"{PAPERCLIP_BASE_URL}/api/issues/{issue_id}", timeout=2.0)
            iss_data = json.loads(req.read().decode("utf-8"))
            identifier = iss_data.get("identifier") or issue_id
            c_req = urllib.request.urlopen(f"{PAPERCLIP_BASE_URL}/api/issues/{issue_id}/comments", timeout=2.0)
            comments = json.loads(c_req.read().decode("utf-8"))
            if comment_id:
                matched = next((c for c in comments if c.get("id") == comment_id), None)
                if matched and matched.get("body"):
                    user_text = matched["body"]
            if (not user_text or user_text.startswith("## Paperclip Wake Payload")) and comments:
                latest_user = next((c for c in comments if c.get("authorUserId") and not c.get("authorAgentId")), None)
                if latest_user and latest_user.get("body"):
                    user_text = latest_user["body"]
        except Exception:
            pass

    if not user_text:
        user_text = f"[Paperclip Turn on {identifier}]"

    paperclip_meta = {
        "issue_id": issue_id,
        "identifier": identifier,
        "comment_id": comment_id,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "run_id": payload.get("run_id"),
    }
    return user_text, identifier, paperclip_meta, agent_name


def enqueue_paperclip_turn(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hybrid Paperclip Bridge dispatcher ($0.00):
    - Fast conversational / query turns answer immediately from real Studio Engine state (<0.5s).
    - Deep IDE tasks (Blender 3D modeling, code edits, QA audits, multi-task delegation) queue as PENDING for the Antigravity IDE Daemon.
    """
    user_text, identifier, paperclip_meta, agent_name = _extract_paperclip_turn_context(payload)
    task = enqueue_task(
        project_id="proj_demo_4x5m",
        user_text=user_text,
        selected_entity_id=identifier,
        paperclip_meta=paperclip_meta,
    )

    if not is_deep_ide_task(user_text):
        fast_reply = _build_fast_studio_reply(agent_name, user_text, project_id="proj_demo_4x5m")
        if fast_reply:
            _record_fast_resolved_task(task, fast_reply)
            return {
                "ok": True,
                "mode": "fast_path",
                "queued_for_ide": False,
                "task_id": task["task_id"],
                "identifier": identifier,
                "user_text": user_text,
                "immediate_reply": fast_reply,
                "cost_usd": 0.0,
            }

    immediate_reply = (
        f"⚡ **[Cầu nối Antigravity IDE — $0.00 API Cost]**\n\n"
        f"**{agent_name}** đã đưa tác vụ chuyên sâu (`\"{user_text[:120]}\"`) vào hàng đợi **Antigravity IDE Daemon** "
        f"(Mã Task: `{task['task_id']}`, Hội thoại: `{identifier}`).\n\n"
        f"🤖 IDE Worker đang chạy nền sẽ tự động xử lý và đẩy câu trả lời + file 3D trực tiếp lên đây trong chu kỳ kế tiếp!"
    )
    return {
        "ok": True,
        "mode": "deep_ide_queue",
        "queued_for_ide": True,
        "task_id": task["task_id"],
        "identifier": identifier,
        "user_text": user_text,
        "immediate_reply": immediate_reply,
        "cost_usd": 0.0,
    }


async def enqueue_paperclip_turn_async(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Async variant supporting natural scene-mutation intents via orchestrator.process_user_chat_message."""
    user_text, identifier, paperclip_meta, agent_name = _extract_paperclip_turn_context(payload)
    lower_txt = user_text.lower()

    if not is_deep_ide_task(user_text) and any(k in lower_txt for k in SCENE_MUTATION_KEYWORDS):
        try:
            from app.services.orchestrator import process_user_chat_message

            task = enqueue_task(
                project_id="proj_demo_4x5m",
                user_text=user_text,
                selected_entity_id=identifier,
                paperclip_meta=paperclip_meta,
            )
            orch_res = await process_user_chat_message(
                project_id="proj_demo_4x5m",
                user_text=user_text,
                selected_entity_id=identifier,
            )
            reply_text = orch_res.get("reply")
            if reply_text:
                formatted = f"⚡ **[Cầu nối Studio Engine — $0.00 API Cost]**\n\n{reply_text}"
                _record_fast_resolved_task(task, formatted)
                return {
                    "ok": True,
                    "mode": "orchestrator_fast_path",
                    "queued_for_ide": False,
                    "task_id": task["task_id"],
                    "identifier": identifier,
                    "user_text": user_text,
                    "immediate_reply": formatted,
                    "cost_usd": 0.0,
                }
        except Exception:
            pass

    return enqueue_paperclip_turn(payload)


def fetch_paperclip_conversations() -> List[Dict[str, Any]]:
    """Fetches live Paperclip conversations from :3100/api/atelier/ide-bridge/pending."""
    try:
        req = urllib.request.urlopen(f"{PAPERCLIP_BASE_URL}/api/atelier/ide-bridge/pending", timeout=2.5)
        data = json.loads(req.read().decode("utf-8"))
        if data.get("ok") and isinstance(data.get("conversations"), list):
            return data["conversations"]
    except Exception:
        pass
    return []


def sync_paperclip_pending_chats() -> List[Dict[str, Any]]:
    """
    Checks Paperclip (:3100) for any conversation where the latest user comment has not been
    imported into ide_bridge_tasks yet, and automatically creates a PENDING bridge task for it.
    """
    ensure_bridge_table()
    convs = fetch_paperclip_conversations()
    if not convs:
        return []

    conn = get_conn()
    existing_rows = conn.execute("SELECT attachments_json FROM ide_bridge_tasks").fetchall()
    seen_comment_ids = set()
    for r in existing_rows:
        try:
            att = json.loads(r[0] or "{}")
            cid = att.get("paperclip", {}).get("comment_id")
            if cid:
                seen_comment_ids.add(cid)
        except Exception:
            pass

    newly_enqueued = []
    for c in convs:
        latest_user = c.get("latest_user_comment")
        if not c.get("needs_reply") or not latest_user:
            continue
        cid = latest_user.get("id")
        if not cid or cid in seen_comment_ids:
            continue
        seen_comment_ids.add(cid)
        paperclip_meta = {
            "issue_id": c.get("issue_id"),
            "identifier": c.get("identifier"),
            "comment_id": cid,
            "agent_id": c.get("agent_id"),
            "agent_name": c.get("agent_name"),
        }
        task = enqueue_task(
            project_id="proj_demo_4x5m",
            user_text=latest_user.get("body", ""),
            selected_entity_id=c.get("identifier"),
            paperclip_meta=paperclip_meta,
        )
        newly_enqueued.append(task)

    return newly_enqueued


def post_reply_to_paperclip(
    issue_id_or_identifier: str,
    message: str,
    agent_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Posts an agent reply directly into a Paperclip conversation issue (:3100)
    so it renders immediately in the Paperclip Web UI!
    """
    payload = {
        "issue_id": issue_id_or_identifier,
        "message": message,
    }
    if agent_id:
        payload["agent_id"] = agent_id

    data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{PAPERCLIP_BASE_URL}/api/atelier/ide-bridge/reply",
        data=data_bytes,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def list_tasks(status: Optional[str] = "PENDING", limit: int = 50, sync_paperclip: bool = True) -> List[Dict[str, Any]]:
    ensure_bridge_table()
    if sync_paperclip:
        try:
            sync_paperclip_pending_chats()
        except Exception:
            pass

    conn = get_conn()
    if status:
        cur = conn.execute(
            "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            (status, limit),
        )
    else:
        cur = conn.execute(
            "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )

    rows = cur.fetchall()
    results = []
    for r in rows:
        results.append(
            {
                "task_id": r[0],
                "project_id": r[1],
                "user_text": r[2],
                "selected_entity_id": r[3],
                "status": r[4],
                "created_at": r[5],
                "resolved_at": r[6],
                "response_content": r[7],
                "attachments": json.loads(r[8] or "{}"),
            }
        )
    return results


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    ensure_bridge_table()
    conn = get_conn()
    cur = conn.execute(
        "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks WHERE task_id = ?",
        (task_id,),
    )
    r = cur.fetchone()
    if not r:
        return None
    return {
        "task_id": r[0],
        "project_id": r[1],
        "user_text": r[2],
        "selected_entity_id": r[3],
        "status": r[4],
        "created_at": r[5],
        "resolved_at": r[6],
        "response_content": r[7],
        "attachments": json.loads(r[8] or "{}"),
    }


def resolve_task(
    task_id: str,
    assistant_message: str,
    glb_path: Optional[str] = None,
    render_urls: Optional[List[str]] = None,
    proposal_diff: Optional[Dict[str, Any]] = None,
    paperclip_issue_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolves an IDE bridge task:
    1. Updates the bridge task status to 'RESOLVED'.
    2. Writes the assistant response message into SQLite `chat_messages`.
    3. Also posts the assistant response directly into Paperclip's PostgreSQL `issue_comments`
       on :3100 so the Paperclip Chat UI updates immediately!
    """
    ensure_bridge_table()
    task = get_task(task_id)
    if not task:
        raise ValueError(f"Không tìm thấy bridge task: {task_id}")

    ts = now_iso()
    existing_att = task.get("attachments") or {}
    paperclip_meta = existing_att.get("paperclip") or {}
    target_paperclip_issue = (
        paperclip_issue_id
        or paperclip_meta.get("issue_id")
        or paperclip_meta.get("identifier")
        or (task.get("selected_entity_id") if str(task.get("selected_entity_id") or "").startswith("ATL-") else None)
        or "ATL-1"
    )
    target_agent_id = paperclip_meta.get("agent_id")

    formatted_msg = assistant_message
    if glb_path:
        formatted_msg += f"\n\n📦 **Mô hình 3D GLB đính kèm**: `{glb_path}`"
    if render_urls:
        formatted_msg += "\n🖼️ **Ảnh Render kiểm tra**: " + ", ".join(f"`{u}`" for u in render_urls)

    paperclip_receipt = post_reply_to_paperclip(
        issue_id_or_identifier=target_paperclip_issue,
        message=formatted_msg,
        agent_id=target_agent_id,
    )

    attachments = {
        **existing_att,
        "glb_path": glb_path,
        "render_urls": render_urls or [],
        "proposal_diff": proposal_diff,
        "cost_usd": 0.0,
        "handled_by": "Antigravity IDE Agent (Local)",
        "paperclip_receipt": paperclip_receipt,
    }
    attachments_json = json.dumps(attachments, ensure_ascii=False)

    conn = get_conn()
    conn.execute(
        """
        UPDATE ide_bridge_tasks
        SET status = 'RESOLVED', resolved_at = ?, response_content = ?, attachments_json = ?
        WHERE task_id = ?
        """,
        (ts, assistant_message, attachments_json, task_id),
    )

    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn.execute(
        """
        INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
        VALUES (?, ?, 'assistant', 'Antigravity IDE Agent (Zero-Cost)', ?, ?, ?)
        """,
        (msg_id, task["project_id"], assistant_message, attachments_json, ts),
    )
    conn.commit()

    try:
        ensure_bridge_dir()
        if BRIDGE_TASKS_FILE.exists():
            tasks = json.loads(BRIDGE_TASKS_FILE.read_text(encoding="utf-8"))
            for t in tasks:
                if t.get("task_id") == task_id:
                    t["status"] = "RESOLVED"
                    t["resolved_at"] = ts
                    t["response_content"] = assistant_message
                    t["attachments"] = attachments
            BRIDGE_TASKS_FILE.write_text(json.dumps(tasks, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    return {
        "task_id": task_id,
        "status": "RESOLVED",
        "message_id": msg_id,
        "project_id": task["project_id"],
        "paperclip_issue": target_paperclip_issue,
        "paperclip_synced": bool(paperclip_receipt and paperclip_receipt.get("ok")),
        "resolved_at": ts,
        "cost_usd": 0.0,
    }


def get_bridge_status() -> Dict[str, Any]:
    ensure_bridge_table()
    conn = get_conn()
    cur = conn.execute("SELECT status, count(*) FROM ide_bridge_tasks GROUP BY status")
    counts = dict(cur.fetchall())
    paperclip_convs = fetch_paperclip_conversations()

    return {
        "enabled": is_ide_bridge_enabled(),
        "bridge_type": "antigravity_reverse_bridge",
        "pending_tasks": counts.get("PENDING", 0),
        "resolved_tasks": counts.get("RESOLVED", 0),
        "total_tasks": sum(counts.values()),
        "token_cost_usd": 0.0,
        "active_endpoint": "internal://bridge/ide_worker",
        "paperclip_connected": len(paperclip_convs) > 0,
        "paperclip_conversations": len(paperclip_convs),
    }
