#!/usr/bin/env python3
"""
ATELIER AI 2.0 — IDE Reverse Bridge CLI
Enables Antigravity in the local IDE to inspect pending tasks from Paperclip Web UI (:3100),
FastAPI (:8000), and Telegram, and deliver responses + 3D assets back to the user with Zero API Cost ($0).
"""
import sys
import json
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.services import ide_bridge_service


def cmd_list(args):
    tasks = ide_bridge_service.list_tasks(status=args.status, limit=args.limit, sync_paperclip=True)
    print(f"=== DANH SÁCH {len(tasks)} YÊU CẦU CẦU NỐI (Trạng thái: {args.status or 'TẤT CẢ'}) ===")
    if not tasks:
        print("  (Không có yêu cầu nào đang chờ xử lý trong ide_bridge_tasks)")
    else:
        for i, t in enumerate(tasks, 1):
            pc = (t.get("attachments") or {}).get("paperclip") or {}
            pc_info = f" | Paperclip: {pc.get('identifier')} ({pc.get('agent_name')})" if pc else ""
            print(f"\n[{i}] Mã Task: {t['task_id']} | Dự án: {t['project_id']}{pc_info}")
            print(f"    Thời điểm: {t['created_at']}")
            print(f"    Trạng thái: {t['status']}")
            print(f"    Nội dung từ Web/Paperclip: \"{t['user_text']}\"")

    convs = ide_bridge_service.fetch_paperclip_conversations()
    if convs:
        print(f"\n=== TRẠNG THÁI HỘI THOẠI TRỰC TIẾP TRÊN PAPERCLIP UI (:3100) [{len(convs)} luồng] ===")
        for c in convs:
            flag = "🔴 CẦN TRẢ LỜI" if c.get("needs_reply") else "🟢 Đã trả lời"
            latest_u = (c.get("latest_user_comment") or {}).get("body", "")
            print(
                f"  • [{c.get('identifier')}] {c.get('agent_name')} (Model: {c.get('agent_model')}) — {flag}\n"
                f"    Tin nhắn mới nhất của User: \"{latest_u[:100]}\""
            )


def cmd_get(args):
    task = ide_bridge_service.get_task(args.task_id)
    if not task:
        print(f"ERROR: Không tìm thấy task {args.task_id}")
        sys.exit(1)
    print(json.dumps(task, indent=2, ensure_ascii=False))


def cmd_respond(args):
    task_id = args.task_id
    message = args.message
    glb_path = args.glb
    renders = args.renders.split(",") if args.renders else []

    proposal_diff = None
    if args.proposal:
        p_path = Path(args.proposal)
        if p_path.exists():
            proposal_diff = json.loads(p_path.read_text(encoding="utf-8"))
        else:
            proposal_diff = json.loads(args.proposal)

    try:
        if task_id.upper().startswith("ATL-") or len(task_id) == 36:
            # Direct reply to a Paperclip conversation issue (e.g. ATL-1 or ATL-14)
            formatted_msg = message
            if glb_path:
                formatted_msg += f"\n\n📦 **Mô hình 3D GLB đính kèm**: `{glb_path}`"
            receipt = ide_bridge_service.post_reply_to_paperclip(
                issue_id_or_identifier=task_id,
                message=formatted_msg,
            )
            print("================================================================================")
            print("✅ ĐÃ BẮN TRỰC TIẾP CÂU TRẢ LỜI LÊN PAPERCLIP WEB UI (:3100) (ZERO API COST)")
            print("================================================================================")
            print(f"  • Hội thoại Paperclip: {task_id}")
            print(f"  • Đồng bộ PostgreSQL (:54329): {bool(receipt and receipt.get('ok'))}")
            print(f"  • Chi phí API: 0.0$ (Hoàn toàn miễn phí)")
            return

        res = ide_bridge_service.resolve_task(
            task_id=task_id,
            assistant_message=message,
            glb_path=glb_path,
            render_urls=renders,
            proposal_diff=proposal_diff,
            paperclip_issue_id=args.issue,
        )
        print("================================================================================")
        print("✅ ĐÃ TRẢ LỜI THÀNH CÔNG VỀ GIAO DIỆN WEB & PAPERCLIP UI (ZERO API COST)")
        print("================================================================================")
        print(f"  • Task ID: {res['task_id']}")
        print(f"  • Message ID: {res['message_id']}")
        print(f"  • Dự án: {res['project_id']}")
        print(f"  • Hội thoại Paperclip (:3100): {res.get('paperclip_issue')} (Đã đồng bộ: {res.get('paperclip_synced')})")
        print(f"  • Chi phí API: {res['cost_usd']}$ (Hoàn toàn miễn phí)")
        if glb_path:
            print(f"  • Đính kèm mô hình 3D: {glb_path}")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


def cmd_status(args):
    status = ide_bridge_service.get_bridge_status()
    print("=== TRẠNG THÁI CẦU NỐI IDE REVERSE BRIDGE ===")
    print(json.dumps(status, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="ATELIER AI 2.0 IDE Reverse Bridge CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    p_list = subparsers.add_parser("list", help="Liệt kê yêu cầu từ Paperclip Web UI / FastAPI / Telegram")
    p_list.add_argument("--status", default="PENDING", help="Trạng thái (PENDING, RESOLVED, hoặc để trống cho tất cả)")
    p_list.add_argument("--limit", type=int, default=50, help="Giới hạn số lượng")
    p_list.set_defaults(func=cmd_list)

    # get
    p_get = subparsers.add_parser("get", help="Xem chi tiết một task")
    p_get.add_argument("task_id", help="Mã task_id")
    p_get.set_defaults(func=cmd_get)

    # respond
    p_resp = subparsers.add_parser("respond", help="Trả lời yêu cầu và gửi kết quả về Paperclip Web UI (:3100)")
    p_resp.add_argument("--task-id", required=True, help="Mã task_id hoặc mã hội thoại Paperclip (VD: ATL-1, ATL-14)")
    p_resp.add_argument("--message", required=True, help="Nội dung trả lời gửi về Web")
    p_resp.add_argument("--issue", help="Mã hội thoại Paperclip đích (mặc định tự động lấy từ task hoặc ATL-1)")
    p_resp.add_argument("--glb", help="Đường dẫn file GLB 3D đính kèm")
    p_resp.add_argument("--renders", help="Danh sách URL/đường dẫn ảnh render (ngăn cách bằng dấu phẩy)")
    p_resp.add_argument("--proposal", help="File JSON hoặc chuỗi JSON proposal diff")
    p_resp.set_defaults(func=cmd_respond)

    # status
    p_stat = subparsers.add_parser("status", help="Kiểm tra trạng thái cầu nối")
    p_stat.set_defaults(func=cmd_status)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
