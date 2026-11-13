import os
import glob
import json
import psycopg

# Connect to Postgres
conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')

# Find all corrupted comments in issue_comments
with conn.cursor() as cur:
    cur.execute("SELECT id, body FROM issue_comments WHERE body LIKE '%\\uFFFD%' OR body LIKE '%\ufffd%';")
    corrupted_comments = cur.fetchall()
    print(f"Corrupted comments count: {len(corrupted_comments)}")

    cur.execute("SELECT id, title, description FROM issues WHERE title LIKE '%\\uFFFD%' OR description LIKE '%\\uFFFD%';")
    corrupted_issues = cur.fetchall()
    print(f"Corrupted issues count: {len(corrupted_issues)}")

search_root = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
session_files = glob.glob(os.path.join(search_root, "**", "*.jsonl"), recursive=True)

# Build a map of commands from session logs
original_commands = []
for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                if "powershell.exe" in line and ("issues" in line or "comments" in line):
                    original_commands.append(line)
    except Exception:
        continue

print(f"Found {len(original_commands)} powershell commands in session logs")
conn.close()
