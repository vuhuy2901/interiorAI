import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    target_id = 'b39359ce-b8a5-4784-8584-fcb7ab00e248'
    clean_prompt = "Mảng tường nào dùng màu Xanh Xô Thơm: tường 4m không có ô mở, tường có cửa đi, hay tường có cửa sổ?"
    
    recovered_payload = {
        "version": 1,
        "questions": [
            {
                "id": "accent_wall",
                "prompt": clean_prompt,
                "options": [
                    {
                        "id": "paperclip_text_answer",
                        "label": "Type an answer",
                        "freeText": True
                    }
                ],
                "required": True,
                "allowOther": True,
                "selectionMode": "single"
            }
        ],
        "questionSet": {
            "schema": "paperclip.question_set.v1",
            "questions": [
                {
                    "id": "accent_wall",
                    "prompt": clean_prompt,
                    "required": True,
                    "answerMode": "text"
                }
            ]
        },
        "supersedeOnUserComment": False
    }

    cur.execute("UPDATE issue_thread_interactions SET payload = %s WHERE id = %s;", (json.dumps(recovered_payload, ensure_ascii=False), target_id))
    conn.commit()
    print("Recovered interaction b39359ce-b8a5-4784-8584-fcb7ab00e248!")
conn.close()
