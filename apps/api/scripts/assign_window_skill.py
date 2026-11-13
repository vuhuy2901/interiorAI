import json
import urllib.request

COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
TARGET_SKILL = "atelier-ai-window-opening-recognition"
TARGET_AGENTS = {
    "Floor Plan Specialist",
    "Geometry & BIM Specialist",
    "QA & Validation Specialist",
    "Chief Architect (Kiến Trúc Sư Trưởng)",
}

def main():
    url = f"http://127.0.0.1:3100/api/companies/{COMPANY_ID}/agents"
    req = urllib.request.urlopen(url)
    agents = json.loads(req.read().decode("utf-8"))
    
    for agent in agents:
        name = agent.get("name")
        if name in TARGET_AGENTS:
            agent_id = agent["id"]
            meta = agent.get("metadata") or {}
            skills = list(meta.get("assignedSkills", []))
            if TARGET_SKILL not in skills:
                skills.append(TARGET_SKILL)
                meta["assignedSkills"] = skills
                
                payload = json.dumps({"metadata": meta}).encode("utf-8")
                patch_req = urllib.request.Request(
                    f"http://127.0.0.1:3100/api/agents/{agent_id}",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="PATCH"
                )
                with urllib.request.urlopen(patch_req) as res:
                    print(f"Updated {name} ({agent_id}): status {res.status}, skills: {skills}")
            else:
                print(f"{name} already has {TARGET_SKILL}")

if __name__ == "__main__":
    main()
