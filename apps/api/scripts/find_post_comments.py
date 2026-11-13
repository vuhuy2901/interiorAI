import os
import glob
import json
import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, issue_id, body FROM issue_comments WHERE body LIKE '%\\uFFFD%' OR body LIKE '%\ufffd%';")
    corrupted_comments = cur.fetchall()

search_root = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
session_files = glob.glob(os.path.join(search_root, "**", "*.jsonl"), recursive=True)

found_map = {}

for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                if "/comments" in line and ("POST" in line.upper() or "METHOD POST" in line.upper() or "-METHOD POST" in line.upper()):
                    for cid, iid, body in corrupted_comments:
                        if str(iid) in line:
                            found_map[str(cid)] = (os.path.basename(fpath), line)
    except Exception:
        continue

print(f"Matched {len(found_map)} out of {len(corrupted_comments)} corrupted comments.")
for cid, (fname, l) in found_map.items():
    print(f"\nComment ID: {cid} in {fname}")
    try:
        d = json.loads(l)
        cmd = d.get('payload', {}).get('input') or d.get('payload', {}).get('item', {}).get('command')
        print(f"Command:\n{cmd}")
    except Exception:
        print(l[:500])

conn.close()
