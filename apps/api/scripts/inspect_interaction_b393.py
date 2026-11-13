import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, issue_id, status, payload FROM issue_thread_interactions WHERE id = 'b39359ce-b8a5-4784-8584-fcb7ab00e248';")
    row = cur.fetchone()
    if row:
        print("ID:", row[0])
        print("Issue ID:", row[1])
        print("Status:", row[2])
        print("Payload:", json.dumps(row[3], ensure_ascii=False, indent=2))
conn.close()
