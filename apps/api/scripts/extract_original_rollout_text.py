import json

log_path = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc\codex-home\skill-runtimes\802d1324-f1a7-45d8-8963-d31684328127\eb3a1cf8d174587390fc119111498fe3ab0d28bad82b1771e73780e9778f1337\sessions\2026\11\13\rollout-2026-11-13T00-13-52-01a1d0c0-64b7-7792-bf49-fdc5ef4c65bc.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if "Ngân sách trần" in line or "child-bedroom" in line or "questions:" in line:
            print(f"Found on line {idx+1}:")
            data = json.loads(line)
            # Find the command or text
            print(json.dumps(data, indent=2, ensure_ascii=False)[:1000])
