import json
import psycopg

log_path = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc\codex-home\skill-runtimes\802d1324-f1a7-45d8-8963-d31684328127\eb3a1cf8d174587390fc119111498fe3ab0d28bad82b1771e73780e9778f1337\sessions\2026\11\13\rollout-2026-11-13T00-13-52-01a1d0c0-64b7-7792-bf49-fdc5ef4c65bc.jsonl"

target_ledger = None
with open(log_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if idx == 143: # line 144
            d = json.loads(line)
            inp = d['payload']['input']
            start_marker = "$ledger=@'\\n"
            end_marker = "\\n'@"
            start_pos = inp.find(start_marker)
            if start_pos != -1:
                start_pos += len(start_marker)
                end_pos = inp.find(end_marker, start_pos)
                raw_ledger = inp[start_pos:end_pos]
                # decode escaped chars
                target_ledger = raw_ledger.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')
                break

if target_ledger:
    print(f"Extracted clean ledger ({len(target_ledger)} chars):")
    print(target_ledger[:300])

    conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
    with conn.cursor() as cur:
        doc_id = '86c9a052-c677-4a6e-9849-5181c1350aad'
        cur.execute("UPDATE documents SET latest_body = %s WHERE id = %s;", (target_ledger, doc_id))
        cur.execute("UPDATE document_revisions SET body = %s WHERE document_id = %s;", (target_ledger, doc_id))
        conn.commit()
    conn.close()
    print("Document and revision restored successfully!")
else:
    print("Could not extract target ledger.")
