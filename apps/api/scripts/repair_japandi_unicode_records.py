"""Repair the bounded FEAT-2026-029 v1.2 Paperclip Unicode records.

The script backs up the original rows before updating them and can restore that
backup with ``--rollback``. It deliberately targets fixed IDs and verifies their
issue/run provenance so it cannot rewrite unrelated project data.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb


DSN = os.environ.get(
    "PAPERCLIP_DATABASE_URL",
    "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip",
)
ISSUE_ID = "9eabba62-c6da-4a2c-829c-07a3321e86b9"
INTERACTION_ID = "001e7db0-9e57-45a8-a24e-f6539d2bf222"
BACKUP_PATH = Path("data/backups/FEAT-2026-029-v1.2-japandi-unicode.json")

COMMENTS = {
    "096762fc-327f-456c-a484-94a922c13700": {
        "run_id": "e4a260c7-2715-4f80-9d2e-96efb3076835",
        "body": """## Cập nhật brief phòng ngủ

Đã chuyển phạm vi sang thiết kế nội thất phòng ngủ theo ảnh mặt bằng người dùng gửi.

### Decision ledger

| Hạng mục | Trạng thái | Giá trị hiện tại |
|---|---|---|
| Loại không gian / kích thước | confirmed | Phòng ngủ; ảnh ghi khoảng 4.190 × 4.040 mm, nhưng cần người dùng xác nhận kích thước thi công thực tế |
| Công năng / nội thất bắt buộc | proposal_requested | Ảnh tham chiếu thể hiện giường 1.800 × 2.000 mm, tủ quần áo, bàn làm việc/kệ sách và hạng mục 700 mm ở đầu giường; chưa coi là danh sách bắt buộc |
| Phong cách | unknown | Chưa chốt cho phòng ngủ mới |
| Màu sơn / bảng màu | unknown | Chưa chốt |
| Vật liệu | unknown | Chưa chốt |
| Ngân sách | unknown | Chưa có ngân sách hoặc giá xác minh |
| Đồ giữ lại | unknown | Chưa xác định |
| Ràng buộc đặc biệt | unknown | Chưa xác định |

Chưa tạo BOM, Cost hoặc render cuối vì các quyết định trên ảnh hưởng trực tiếp đến bố cục và chi phí.""",
    },
    "2082b920-9d79-407d-b003-ff5b69d66baf": {
        "run_id": "3301d5ed-6ea1-415e-8e1a-9659d7b463ea",
        "body": """## Concept phòng ngủ Japandi v1

Đã dựng phối cảnh concept từ mặt bằng tham chiếu và các lựa chọn đã xác nhận.

- Giữ logic bố trí chính: giường 1.800×2.000mm, tủ áo, bàn làm việc/kệ sách và hạng mục đầu giường 700mm.
- Hướng thẩm mỹ: Japandi sáng, gỗ sáng và nền trung tính ấm ở mức minh họa concept.
- File render: **`render-phong-ngu-japandi-v1.png`**
- Chưa lập BOM/Cost: ngân sách chưa chốt, chưa có giá xác minh và vật liệu trong render chưa phải vật liệu đã duyệt.

### Decision ledger

| **Hạng mục** | **Trạng thái** | **Giá trị** |
| :--- | :--- | :--- |
| Loại không gian / kích thước | confirmed | Phòng ngủ; kích thước tham chiếu khoảng 4.190 × 4.040mm |
| Công năng / nội thất bắt buộc | confirmed | Giữ nguyên bố cục và các hạng mục chính theo ảnh |
| Phong cách | confirmed | Japandi sáng |
| Màu sơn / bảng màu | proposal_requested | Trắng ấm, be sáng, gỗ sáng trong render concept |
| Vật liệu | unknown | Chưa duyệt mã/mẫu thực tế |
| Ngân sách | confirmed | Chưa chốt; chưa có giá xác minh |
| Đồ giữ lại | confirmed | Chưa có đồ giữ lại được chỉ định |
| Ràng buộc đặc biệt | unknown | Chưa xác định |

### Handoff

Chờ duyệt hướng phối cảnh và mức độ sáng/gỗ trước khi tinh chỉnh v2 hoặc đối chiếu mã màu, vật liệu và sản phẩm thực tế.""",
    },
}

QUESTION_COPY = {
    "layout_scope": {
        "prompt": "Bạn muốn dùng nguyên bố cục và các hạng mục trong ảnh, hay chỉ dùng ảnh làm tham chiếu? Chọn A) giữ nguyên giường 1.8×2m + tủ + bàn/kệ; B) giữ bố cục nhưng cho phép đổi kích thước/nội thất; C) thiết kế lại, hãy ghi công năng bắt buộc.",
        "options": [
            {"id": "A", "label": "Giữ nguyên", "description": "Bám sát mặt bằng và danh sách trong ảnh."},
            {"id": "B", "label": "Giữ bố cục, linh hoạt", "description": "Giữ logic bố trí nhưng cho phép điều chỉnh nội thất."},
            {"id": "C", "label": "Thiết kế lại", "description": "Cần bạn ghi công năng/nội thất bắt buộc."},
        ],
    },
    "style_palette": {
        "prompt": "Phong cách và bảng màu nào cho phòng ngủ? Chọn A) Japandi sáng; B) hiện đại ấm; C) tự chỉ định phong cách/màu cụ thể.",
        "options": [
            {"id": "A", "label": "Japandi sáng", "description": "Gỗ sáng, trắng ấm, tối giản."},
            {"id": "B", "label": "Hiện đại ấm", "description": "Đường nét gọn, màu trung tính ấm."},
            {"id": "C", "label": "Tự chỉ định", "description": "Ghi phong cách, màu sơn hoặc vật liệu bạn muốn."},
        ],
    },
    "budget_keep": {
        "prompt": "Ngân sách và đồ cần giữ lại là gì? Chọn A) chưa chốt ngân sách, chưa có đồ giữ; B) có ngân sách cụ thể, hãy ghi khoảng tiền; C) có đồ giữ lại, hãy ghi tên/kích thước.",
        "options": [
            {"id": "A", "label": "Chưa chốt", "description": "Chỉ lập phương án concept, chưa tổng dự toán."},
            {"id": "B", "label": "Có ngân sách", "description": "Cho phép kiểm soát phương án theo khoảng tiền."},
            {"id": "C", "label": "Có đồ giữ lại", "description": "Cần liệt kê đồ và kích thước để tránh xung đột bố trí."},
        ],
    },
}


def _repair_questions(questions: list[dict[str, Any]]) -> None:
    for question in questions:
        clean = QUESTION_COPY.get(question.get("id"))
        if clean:
            question["prompt"] = clean["prompt"]
            question["options"] = clean["options"]


def _has_replacement(value: Any) -> bool:
    if isinstance(value, str):
        return "\ufffd" in value
    if isinstance(value, list):
        return any(_has_replacement(item) for item in value)
    if isinstance(value, dict):
        return any(_has_replacement(item) for item in value.values())
    return False


def backup_and_repair() -> None:
    with psycopg.connect(DSN) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """select id, issue_id, body, author_agent_id, created_by_run_id
                   from issue_comments where id = any(%s) order by id for update""",
                (list(COMMENTS),),
            )
            comment_rows = cursor.fetchall()
            cursor.execute(
                """select id, issue_id, kind, status, payload, result, source_run_id
                   from issue_thread_interactions where id = %s for update""",
                (INTERACTION_ID,),
            )
            interaction = cursor.fetchone()
            if len(comment_rows) != len(COMMENTS) or interaction is None:
                raise RuntimeError("Expected repair records were not found; no data changed")

            for row in comment_rows:
                expected = COMMENTS[str(row[0])]
                if str(row[1]) != ISSUE_ID or str(row[4]) != expected["run_id"]:
                    raise RuntimeError(f"Comment provenance mismatch for {row[0]}")
            if str(interaction[1]) != ISSUE_ID or str(interaction[6]) != COMMENTS["096762fc-327f-456c-a484-94a922c13700"]["run_id"]:
                raise RuntimeError("Interaction provenance mismatch")

            backup = {
                "comments": [
                    {
                        "id": str(row[0]),
                        "issue_id": str(row[1]),
                        "body": row[2],
                        "author_agent_id": str(row[3]) if row[3] else None,
                        "created_by_run_id": str(row[4]) if row[4] else None,
                    }
                    for row in comment_rows
                ],
                "interaction": {
                    "id": str(interaction[0]),
                    "issue_id": str(interaction[1]),
                    "kind": interaction[2],
                    "status": interaction[3],
                    "payload": interaction[4],
                    "result": interaction[5],
                    "source_run_id": str(interaction[6]) if interaction[6] else None,
                },
            }
            BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
            if not BACKUP_PATH.exists():
                BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")

            for comment_id, expected in COMMENTS.items():
                cursor.execute(
                    "update issue_comments set body = %s, updated_at = now() where id = %s",
                    (expected["body"], comment_id),
                )

            repaired_payload = json.loads(json.dumps(interaction[4]))
            _repair_questions(repaired_payload.get("questions", []))
            _repair_questions(repaired_payload.get("questionSet", {}).get("questions", []))
            if _has_replacement(repaired_payload):
                raise RuntimeError("Repaired interaction still contains U+FFFD")
            cursor.execute(
                "update issue_thread_interactions set payload = %s, updated_at = now() where id = %s",
                (Jsonb(repaired_payload), INTERACTION_ID),
            )
        connection.commit()
    print(f"Repaired {len(COMMENTS)} comments and interaction {INTERACTION_ID}")
    print(f"Backup: {BACKUP_PATH.resolve()}")


def rollback() -> None:
    backup = json.loads(BACKUP_PATH.read_text(encoding="utf-8"))
    with psycopg.connect(DSN) as connection:
        with connection.cursor() as cursor:
            for comment in backup["comments"]:
                cursor.execute(
                    "update issue_comments set body = %s, updated_at = now() where id = %s and issue_id = %s",
                    (comment["body"], comment["id"], comment["issue_id"]),
                )
            interaction = backup["interaction"]
            cursor.execute(
                "update issue_thread_interactions set payload = %s, updated_at = now() where id = %s and issue_id = %s",
                (Jsonb(interaction["payload"]), interaction["id"], interaction["issue_id"]),
            )
        connection.commit()
    print(f"Restored records from {BACKUP_PATH.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    rollback() if args.rollback else backup_and_repair()
