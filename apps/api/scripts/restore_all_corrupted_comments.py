import os
import glob
import json
import re
import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, issue_id, body FROM issue_comments WHERE body LIKE '%\\uFFFD%' OR body LIKE '%\ufffd%';")
    corrupted_comments = cur.fetchall()

search_root = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
session_files = glob.glob(os.path.join(search_root, "**", "*.jsonl"), recursive=True)

# Parse all exec commands that posted comments
posted_bodies = []
for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                if "/comments" in line and ("$comment" in line or "$body" in line or "body=" in line or "Invoke-WebRequest" in line):
                    # extract the command
                    try:
                        data = json.loads(line)
                        input_cmd = data.get('payload', {}).get('input', '')
                        if not input_cmd and 'command' in str(data):
                            # check item
                            item = data.get('payload', {}).get('item', {})
                            cmd_arr = item.get('command', [])
                            if cmd_arr:
                                input_cmd = " ".join(cmd_arr)
                        if input_cmd:
                            posted_bodies.append(input_cmd)
                    except Exception:
                        pass
    except Exception:
        continue

print(f"Total posted comment command snippets: {len(posted_bodies)}")

for cid, iid, body in corrupted_comments:
    print(f"\n--- Comment {cid} (Issue {iid}) ---")
    print(f"Corrupted text snippet:\n{body[:150]}")
    
    # Try to find corresponding snippet in posted_bodies
    # Look for matching pattern in body
    for cmd in posted_bodies:
        # Check if cmd mentions this issue or key words
        if iid in cmd:
            print("  -> Found exact issue_id match in command!")
            # extract string
            # let's see what is inside cmd
            print(f"     CMD snippet: {cmd[:250]}...")
            break

conn.close()
