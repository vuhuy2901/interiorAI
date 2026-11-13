import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, details FROM activity_log WHERE details::text LIKE '%\ufffd%';")
    rows = cur.fetchall()
    print("Corrupted activity logs count:", len(rows))
    for r_id, details in rows:
        d_str = json.dumps(details, ensure_ascii=False)
        # We can clean up known mojibake/corrupted snippets in activity log
        # or replace \ufffd with appropriate char
        d_str = d_str.replace('\ufffd', '')
        cur.execute("UPDATE activity_log SET details = %s WHERE id = %s;", (d_str, r_id))
    conn.commit()
    print("Cleaned up activity_log.")
conn.close()
