"""
ATELIER AI 2.0 — IDE Reverse Bridge Service
Zero API Cost Dispatcher routing conversational requests to the local Antigravity IDE agent.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.db import get_conn, now_iso

BRIDGE_DATA_DIR = Path("C:/Users/TUAN/Downloads/qldapm_fina/data/bridge")
BRIDGE_TASKS_FILE = BRIDGE_DATA_DIR / "inbox_tasks.json"


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
    selected_entity_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Enqueues a user chat request for processing by the local IDE Agent.
    Saves to both SQLite and the JSON queue file for easy CLI inspection.
    """
    ensure_bridge_dir()
    ensure_bridge_table()
    
    task_id = f"task_{uuid.uuid4().hex[:10]}"
    ts = now_iso()
    
    task = {
        "task_id": task_id,
        "project_id": project_id,
        "user_text": user_text,
        "selected_entity_id": selected_entity_id,
        "status": "PENDING",
        "created_at": ts,
        "resolved_at": None,
        "response_content": None,
        "attachments": {}
    }
    
    # Save to SQLite
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO ide_bridge_tasks
        (task_id, project_id, user_text, selected_entity_id, status, created_at, attachments_json)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        """,
        (task_id, project_id, user_text, selected_entity_id, ts, "{}")
    )
    
    # Also record user message in project chat_messages table so it appears immediately on Web UI
    user_msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn.execute(
        """
        INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
        VALUES (?, ?, 'user', 'Gia chủ / Người thiết kế', ?, ?, ?)
        """,
        (user_msg_id, project_id, user_text, json.dumps({"bridge_task_id": task_id, "status": "PENDING_IDE"}, ensure_ascii=False), ts)
    )
    conn.commit()
    
    # Update JSON file
    try:
        tasks = []
        if BRIDGE_TASKS_FILE.exists():
            tasks = json.loads(BRIDGE_TASKS_FILE.read_text(encoding="utf-8"))
        tasks.append(task)
        BRIDGE_TASKS_FILE.write_text(json.dumps(tasks, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
        
    return task


def list_tasks(status: Optional[str] = "PENDING", limit: int = 50) -> List[Dict[str, Any]]:
    ensure_bridge_table()
    conn = get_conn()
    
    if status:
        cur = conn.execute(
            "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            (status, limit)
        )
    else:
        cur = conn.execute(
            "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks ORDER BY created_at DESC LIMIT ?",
            (limit,)
        )
        
    rows = cur.fetchall()
    results = []
    for r in rows:
        results.append({
            "task_id": r[0],
            "project_id": r[1],
            "user_text": r[2],
            "selected_entity_id": r[3],
            "status": r[4],
            "created_at": r[5],
            "resolved_at": r[6],
            "response_content": r[7],
            "attachments": json.loads(r[8] or "{}")
        })
    return results


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    ensure_bridge_table()
    conn = get_conn()
    cur = conn.execute(
        "SELECT task_id, project_id, user_text, selected_entity_id, status, created_at, resolved_at, response_content, attachments_json FROM ide_bridge_tasks WHERE task_id = ?",
        (task_id,)
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
        "attachments": json.loads(r[8] or "{}")
    }


def resolve_task(
    task_id: str,
    assistant_message: str,
    glb_path: Optional[str] = None,
    render_urls: Optional[List[str]] = None,
    proposal_diff: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Resolves an IDE bridge task:
    1. Updates the bridge task status to 'RESOLVED'.
    2. Writes the assistant response message directly into the project's `chat_messages` table,
       so Web UI immediately updates via its standard polling / stream!
    """
    ensure_bridge_table()
    task = get_task(task_id)
    if not task:
        raise ValueError(f"Không tìm thấy bridge task: {task_id}")
        
    ts = now_iso()
    attachments = {
        "glb_path": glb_path,
        "render_urls": render_urls or [],
        "proposal_diff": proposal_diff,
        "cost_usd": 0.0, # Zero API cost!
        "handled_by": "Antigravity IDE Agent (Local)"
    }
    attachments_json = json.dumps(attachments, ensure_ascii=False)
    
    conn = get_conn()
    conn.execute(
        """
        UPDATE ide_bridge_tasks
        SET status = 'RESOLVED', resolved_at = ?, response_content = ?, attachments_json = ?
        WHERE task_id = ?
        """,
        (ts, assistant_message, attachments_json, task_id)
    )
    
    # Insert assistant reply into project's chat_messages table
    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn.execute(
        """
        INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at)
        VALUES (?, ?, 'assistant', 'Antigravity IDE Agent (Zero-Cost)', ?, ?, ?)
        """,
        (msg_id, task["project_id"], assistant_message, attachments_json, ts)
    )
    conn.commit()
    
    # Update JSON file
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
        "resolved_at": ts,
        "cost_usd": 0.0
    }


def get_bridge_status() -> Dict[str, Any]:
    ensure_bridge_table()
    conn = get_conn()
    cur = conn.execute("SELECT status, count(*) FROM ide_bridge_tasks GROUP BY status")
    counts = dict(cur.fetchall())
    
    return {
        "enabled": is_ide_bridge_enabled(),
        "bridge_type": "antigravity_reverse_bridge",
        "pending_tasks": counts.get("PENDING", 0),
        "resolved_tasks": counts.get("RESOLVED", 0),
        "total_tasks": sum(counts.values()),
        "token_cost_usd": 0.0,
        "active_endpoint": "internal://bridge/ide_worker"
    }
