import json
import os
import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import get_conn, DEFAULT_CONNECTIONS
from app.services import ide_bridge_service


def test_conn_ide_bridge_is_registered():
    conn_ids = [c["connection_id"] for c in DEFAULT_CONNECTIONS]
    assert "conn_ide_bridge" in conn_ids
    bridge_conn = next(c for c in DEFAULT_CONNECTIONS if c["connection_id"] == "conn_ide_bridge")
    assert bridge_conn["kind"] == "ide_agent"
    assert bridge_conn["status"] == "CONNECTED"
    assert "zero_api_cost" in bridge_conn["capabilities"]


def test_enqueue_and_list_bridge_task():
    ide_bridge_service.ensure_bridge_table()
    test_text = "Giao cho Geometry Agent dựng kệ tivi 1800x350x300 mm"
    task = ide_bridge_service.enqueue_task(
        project_id="proj_demo_4x5m",
        user_text=test_text,
        selected_entity_id="entity_tv_wall"
    )
    
    assert task["task_id"].startswith("task_")
    assert task["status"] == "PENDING"
    assert task["user_text"] == test_text
    
    # Check listing
    pending = ide_bridge_service.list_tasks(status="PENDING")
    task_ids = [t["task_id"] for t in pending]
    assert task["task_id"] in task_ids


def test_resolve_bridge_task_delivers_to_chat_messages():
    task = ide_bridge_service.enqueue_task(
        project_id="proj_demo_4x5m",
        user_text="Dựng tủ tivi gỗ sồi 1800mm",
    )
    
    reply_content = "Đã dựng xong tủ tivi 1800x350x300mm theo tiêu chuẩn mộc thực tế."
    glb_test_path = "data/exports/models/tv_console_wall_1800x350x300.glb"
    
    result = ide_bridge_service.resolve_task(
        task_id=task["task_id"],
        assistant_message=reply_content,
        glb_path=glb_test_path
    )
    
    assert result["status"] == "RESOLVED"
    assert result["cost_usd"] == 0.0
    
    # Verify in chat_messages table
    conn = get_conn()
    row = conn.execute(
        "SELECT message_id, role, sender_name, content, metadata_json FROM chat_messages WHERE message_id = ?",
        (result["message_id"],)
    ).fetchone()
    
    assert row is not None
    assert row["role"] == "assistant"
    assert "Antigravity IDE Agent" in row["sender_name"]
    assert reply_content in row["content"]
    
    meta = json.loads(row["metadata_json"])
    assert meta["glb_path"] == glb_test_path
    assert meta["cost_usd"] == 0.0


def test_bridge_status_reports_zero_cost():
    status = ide_bridge_service.get_bridge_status()
    assert status["enabled"] is True
    assert status["token_cost_usd"] == 0.0
    assert status["bridge_type"] == "antigravity_reverse_bridge"
    assert status["total_tasks"] >= 1


def test_paperclip_enqueue_and_metadata():
    res = ide_bridge_service.enqueue_paperclip_turn({
        "run_id": "run_test_123",
        "company_id": "b2e1c8a5-c3c9-412c-99cb-63180c4015dc",
        "agent_id": "802d1324-f1a7-45d8-8963-d31684328127",
        "agent_name": "Chief Architect (Kiến Trúc Sư Trưởng)",
        "issue_id": "ATL-1",
        "comment_id": "comment_test_456",
        "wake_prompt": "Kiểm tra kết nối từ Paperclip UI về IDE",
    })
    assert res["ok"] is True
    assert res["task_id"].startswith("task_")
    assert "$0.00 API Cost" in res["immediate_reply"]
    task = ide_bridge_service.get_task(res["task_id"])
    assert task is not None
    assert task["attachments"]["paperclip"]["agent_id"] == "802d1324-f1a7-45d8-8963-d31684328127"
    assert res["mode"] == "fast_path"
    assert res["queued_for_ide"] is False
    assert task["status"] == "RESOLVED"


def test_paperclip_deep_ide_task_routes_to_pending_queue():
    res = ide_bridge_service.enqueue_paperclip_turn({
        "run_id": "run_test_deep_789",
        "company_id": "b2e1c8a5-c3c9-412c-99cb-63180c4015dc",
        "agent_id": "c8afb863-0402-4fa1-8f31-5f3826628dbb",
        "agent_name": "Geometry & BIM Specialist",
        "issue_id": "ATL-15",
        "comment_id": "comment_deep_789",
        "wake_prompt": "Dựng tủ quần áo 2000x600x2400 mm bằng Blender và chụp 6 góc render",
    })
    assert res["ok"] is True
    assert res["mode"] == "deep_ide_queue"
    assert res["queued_for_ide"] is True
    assert "$0.00 API Cost" in res["immediate_reply"]
    task = ide_bridge_service.get_task(res["task_id"])
    assert task is not None
    assert task["status"] == "PENDING"
    ide_bridge_service.resolve_task(res["task_id"], "Đã hoàn tất test dựng tủ Blender")
