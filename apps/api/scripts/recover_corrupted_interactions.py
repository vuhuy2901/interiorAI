import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
target_id = 'b37d60f5-9c46-4e86-a585-69f712a5dc67'

with conn.cursor() as cur:
    cur.execute("SELECT id, payload FROM issue_thread_interactions WHERE id = %s;", (target_id,))
    row = cur.fetchone()
    if not row:
        print(f"Target interaction {target_id} not found!")
        exit(1)
        
    old_payload = row[1]
    with open("apps/api/scripts/backup_interaction_b37d.json", "w", encoding="utf-8") as f:
        json.dump(old_payload, f, ensure_ascii=False, indent=2)
    print("Backed up old payload.")

    recovered_payload = {
        "version": 1,
        "questionSet": {
            "schema": "paperclip.question_set.v1",
            "questions": [
                {
                    "id": "budget",
                    "prompt": "Ngân sách trần cho phòng ngủ trẻ em là mức nào?",
                    "answerMode": "single_select",
                    "required": True,
                    "options": [
                        {"id": "budget_80_120", "label": "A — 80–120 triệu VNĐ"},
                        {"id": "budget_120_180", "label": "B — 120–180 triệu VNĐ"},
                        {"id": "budget_other", "label": "C — Mức khác, ghi rõ số tiền"}
                    ],
                    "customAnswer": {"enabled": True}
                },
                {
                    "id": "users",
                    "prompt": "Phòng này phục vụ bao nhiêu trẻ và độ tuổi nào?",
                    "answerMode": "single_select",
                    "required": True,
                    "options": [
                        {"id": "users_one", "label": "A — 1 trẻ"},
                        {"id": "users_two", "label": "B — 2 trẻ"},
                        {"id": "users_other", "label": "C — Khác, ghi rõ"}
                    ],
                    "customAnswer": {"enabled": True}
                },
                {
                    "id": "constraints",
                    "prompt": "Có đồ cần giữ lại hoặc ràng buộc cửa sổ/cửa ra vào nào cần chốt không?",
                    "answerMode": "single_select",
                    "required": True,
                    "options": [
                        {"id": "constraints_none", "label": "A — Không có, cho phép đề xuất trong phạm vi mặt bằng"},
                        {"id": "constraints_keep", "label": "B — Có đồ giữ lại, tôi sẽ liệt kê"},
                        {"id": "constraints_opening", "label": "C — Có ràng buộc cửa/cửa sổ, tôi sẽ mô tả hoặc gửi kích thước"}
                    ],
                    "customAnswer": {"enabled": True}
                }
            ]
        },
        "questions": [
            {
                "id": "budget",
                "prompt": "Ngân sách trần cho phòng ngủ trẻ em là mức nào?",
                "required": True,
                "allowOther": True,
                "selectionMode": "single",
                "options": [
                    {"id": "budget_80_120", "label": "A — 80–120 triệu VNĐ"},
                    {"id": "budget_120_180", "label": "B — 120–180 triệu VNĐ"},
                    {"id": "budget_other", "label": "C — Mức khác, ghi rõ số tiền"},
                    {"id": "paperclip_custom_answer", "label": "Other", "freeText": True}
                ]
            },
            {
                "id": "users",
                "prompt": "Phòng này phục vụ bao nhiêu trẻ và độ tuổi nào?",
                "required": True,
                "allowOther": True,
                "selectionMode": "single",
                "options": [
                    {"id": "users_one", "label": "A — 1 trẻ"},
                    {"id": "users_two", "label": "B — 2 trẻ"},
                    {"id": "users_other", "label": "C — Khác, ghi rõ"},
                    {"id": "paperclip_custom_answer", "label": "Other", "freeText": True}
                ]
            },
            {
                "id": "constraints",
                "prompt": "Có đồ cần giữ lại hoặc ràng buộc cửa sổ/cửa ra vào nào cần chốt không?",
                "required": True,
                "allowOther": True,
                "selectionMode": "single",
                "options": [
                    {"id": "constraints_none", "label": "A — Không có, cho phép đề xuất trong phạm vi mặt bằng"},
                    {"id": "constraints_keep", "label": "B — Có đồ giữ lại, tôi sẽ liệt kê"},
                    {"id": "constraints_opening", "label": "C — Có ràng buộc cửa/cửa sổ, tôi sẽ mô tả hoặc gửi kích thước"},
                    {"id": "paperclip_custom_answer", "label": "Other", "freeText": True}
                ]
            }
        ],
        "supersedeOnUserComment": False
    }

    cur.execute(
        "UPDATE issue_thread_interactions SET payload = %s WHERE id = %s;",
        (json.dumps(recovered_payload, ensure_ascii=False), target_id)
    )
    conn.commit()
    print(f"Successfully recovered interaction {target_id} in database!")

    # Verify recovery
    cur.execute("SELECT payload FROM issue_thread_interactions WHERE id = %s;", (target_id,))
    updated_payload = cur.fetchone()[0]
    first_q = updated_payload['questions'][0]
    print(f"Verified prompt: {first_q['prompt']}")
    print(f"Verified option 1: {first_q['options'][0]['label']}")
    print(f"Verified option 2: {first_q['options'][1]['label']}")
    print(f"Verified option 3: {first_q['options'][2]['label']}")
conn.close()
