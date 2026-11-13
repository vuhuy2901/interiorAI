import json

filepath = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc\codex-home\skill-runtimes\802d1324-f1a7-45d8-8963-d31684328127\eb3a1cf8d174587390fc119111498fe3ab0d28bad82b1771e73780e9778f1337\sessions\2026\11\13\rollout-2026-11-13T00-13-52-01a1d0c0-64b7-7792-bf49-fdc5ef4c65bc.jsonl"

with open(filepath, "r", encoding="utf-8", errors="replace") as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        s = json.dumps(data, ensure_ascii=False)
        if "child-bedroom:v1" in s or "budget_80_120" in s:
            print(f"=== FOUND IN LINE {i} ===")
            print(json.dumps(data, ensure_ascii=False, indent=2)[:3000])
