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

# Parse all session files looking for original text
commands_found = []
for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                if "/comments" in line or "/issues" in line:
                    for cid, iid, body in corrupted_comments:
                        if str(iid) in line:
                            commands_found.append({
                                "file": os.path.basename(fpath),
                                "issue_id": str(iid),
                                "line": line
                            })
    except Exception:
        continue

print(f"Found {len(commands_found)} matching lines for corrupted comments issues:")
for cf in commands_found[:10]:
    print(f"File {cf['file']} - Issue {cf['issue_id']}:")
    try:
        d = json.loads(cf['line'])
        inp = d.get('payload', {}).get('input') or d.get('payload', {}).get('item', {}).get('command')
        print(f"  {str(inp)[:300]}")
    except Exception:
        print(f"  {cf['line'][:300]}")
conn.close()
