import json
import urllib.request

BASE = "http://127.0.0.1:3100"
COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"

def get(path):
    try:
        with urllib.request.urlopen(BASE + path) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}

def main():
    projects = [
        ("8b2fe984-4bc2-4af2-a65f-7dfe64fb2274", "Căn hộ Studio Phòng Khách 4×5m"),
        ("e20d2696-5794-4cdb-ba5d-47fac2fc4f0d", "Phòng Ngủ Master Japandi (4.19m × 4.04m)"),
    ]
    
    for pid, pname in projects:
        print("=" * 80)
        print(f"DỰ ÁN: {pname} (ID: {pid})")
        print("=" * 80)
        data = get(f"/api/atelier/workflow/project/{pid}")
        if "error" in data:
            print("  Lỗi workflow:", data["error"])
            continue
            
        run = data.get("run") or {}
        print(f"Workflow Run ID : {run.get('id')}")
        print(f"Trạng thái Run  : {run.get('status')}")
        print(f"Root Issue ID   : {data.get('rootIssueId')}")
        
        stages = data.get("stages", [])
        print(f"Số lượng Stages : {len(stages)}")
        print("-" * 80)
        for s in stages:
            sk = s.get("stageKey")
            status = s.get("status")
            issue_id = s.get("issueIdentifier") or s.get("issueId")
            agent = s.get("agentName") or s.get("agentKey")
            blocker = s.get("blockerReason")
            inputs = s.get("requiredInputs") or []
            print(f"  * [{sk:<12}] {status:<12} | Issue: {str(issue_id):<8} | Phụ trách: {str(agent):<32}")
            if blocker:
                print(f"      -> Blocker: {blocker}")
        print()

if __name__ == "__main__":
    main()
