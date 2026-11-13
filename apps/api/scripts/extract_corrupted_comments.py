import os
import glob
import json
import re
import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')

with conn.cursor() as cur:
    cur.execute("SELECT id, issue_id, body FROM issue_comments WHERE body LIKE '%\\uFFFD%' OR body LIKE '%\ufffd%';")
    corrupted_comments = cur.fetchall()

print(f"Corrupted comments count: {len(corrupted_comments)}")

search_root = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
session_files = glob.glob(os.path.join(search_root, "**", "*.jsonl"), recursive=True)

# Search session logs for comments posted to /api/issues/.../comments
# Pattern: $body = ... or $comment = ... or body="...
candidates = []
for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                if "/comments" in line:
                    candidates.append(line)
    except Exception:
        continue

print(f"Found {len(candidates)} candidate lines with /comments")

for cid, iid, body in corrupted_comments:
    print(f"\nTarget Comment ID: {cid}, Issue: {iid}")
    print(f"Corrupted sample: {body[:100]}...")
    
    # Try to find match
    # Look for matching English words or punctuation in candidates
    clean_words = [w for w in re.findall(r'[a-zA-Z0-9_]{4,}', body) if w not in ('null', 'true', 'false', 'http')]
    matched_text = None
    for cand in candidates:
        if all(w in cand for w in clean_words[:3]):
            # Extract the actual comment text
            # Often cand has input: "const r = await tools.exec_command({cmd: \"...\"})"
            matched_text = cand
            break
    if matched_text:
        print("  Found potential candidate in session log!")
    else:
        print("  No candidate found via simple word match.")

conn.close()
