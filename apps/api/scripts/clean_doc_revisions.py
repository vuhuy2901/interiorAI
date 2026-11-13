import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, body FROM document_revisions WHERE body LIKE '%\ufffd%';")
    rows = cur.fetchall()
    print(f"Document revisions with U+FFFD: {len(rows)}")
    for r_id, body in rows:
        fixed_body = body.replace('\ufffd', '×')
        # Also fix "Can h? Studio" if present
        fixed_body = fixed_body.replace("Can h? Studio", "Căn hộ Studio").replace("Ph?m vi d? ch?t", "Phạm vi đã chốt")
        cur.execute("UPDATE document_revisions SET body = %s WHERE id = %s;", (fixed_body, r_id))
    conn.commit()
    print("Fixed document revisions.")
conn.close()
