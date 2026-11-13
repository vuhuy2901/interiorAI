import json
import urllib.request

COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
SKILL = "atelier-ai-window-opening-recognition"
TARGET_NAMES = {
    "Floor Plan Specialist",
    "Geometry & BIM Specialist",
    "QA & Validation Specialist",
    "Chief Architect (Kiến Trúc Sư Trưởng)",
}

def main():
    url = f"http://127.0.0.1:3100/api/companies/{COMPANY_ID}/agents"
    with urllib.request.urlopen(url) as res:
        agents = json.loads(res.read().decode("utf-8"))

    for a in agents:
        name = a.get("name")
        if name in TARGET_NAMES:
            aid = a["id"]
            meta = a.get("metadata") or {}
            assigned = list(meta.get("assignedSkills") or [])
            if SKILL not in assigned:
                assigned.append(SKILL)
            meta["assignedSkills"] = assigned
            req = urllib.request.Request(
                f"http://127.0.0.1:3100/api/agents/{aid}",
                data=json.dumps({"metadata": meta}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PATCH",
            )
            with urllib.request.urlopen(req) as r:
                print(f"Assigned {SKILL} to {name}: {r.status}")

if __name__ == "__main__":
    main()
