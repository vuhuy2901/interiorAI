import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, title, latest_body FROM documents WHERE id = '86c9a052-c677-4a6e-9849-5181c1350aad';")
    row = cur.fetchone()
    if row:
        print("Document title:", row[1])
        print("Corrupted document sample:", row[2][:300])

        # Also let's check document_revisions table
        cur.execute("SELECT id, document_id, body FROM document_revisions WHERE document_id = '86c9a052-c677-4a6e-9849-5181c1350aad';")
        revs = cur.fetchall()
        print(f"Revisions count: {len(revs)}")
conn.close()
