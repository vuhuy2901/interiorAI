import sys
from pathlib import Path

# Add apps/api to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import (
    initialize_native_project_link,
    link_scene_to_native_project,
    get_native_project_workspace,
    get_conn,
)

COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"

PROJECT_SCENE_MAPPINGS = [
    {
        "native_project_id": "8b2fe984-4bc2-4af2-a65f-7dfe64fb2274",
        "project_name": "Căn hộ Studio Phòng Khách 4×5m — Japandi Minh Họa",
        "brief": "Dự án thiết kế nội thất phòng khách 4000×5000mm (cao 2800mm) phong cách Japandi, đồng bộ trực tiếp với Pascal 3D SceneGraph (proj_demo_4x5m).",
        "scene_id": "proj_demo_4x5m",
        "provenance": "native",
        "is_fixture": False,
    },
    {
        "native_project_id": "e20d2696-5794-4cdb-ba5d-47fac2fc4f0d",
        "project_name": "Phòng Ngủ Master Japandi (4.190 × 4.040mm)",
        "brief": "Dự án thiết kế thi công nội thất phòng ngủ Japandi 4190×4040mm: giường 1800×2000mm bọc nỉ linen greige giữa vách ốp nan sồi, 2 tab treo, bàn phấn 900mm bên phải, hệ tủ áo kịch trần cánh kính khói/mây đan, vách TV sơn be nhạt điểm xám sage, sàn Oak Natural, đèn ray 3000K, ngân sách 75-120 triệu VNĐ.",
        "scene_id": "proj_bedroom_japandi_4x4m",
        "provenance": "native",
        "is_fixture": False,
    },
]

def run_linking():
    print(f"Linking native projects to company {COMPANY_ID}...")
    for item in PROJECT_SCENE_MAPPINGS:
        nid = item["native_project_id"]
        name = item["project_name"]
        brief = item["brief"]
        sid = item["scene_id"]
        
        ws = initialize_native_project_link(
            native_project_id=nid,
            company_id=COMPANY_ID,
            project_name=name,
            brief=brief,
        )
        print(f"Initialized workspace for {nid}: {ws.project_name}")
        
        scene_rec = link_scene_to_native_project(
            native_project_id=nid,
            scene_id=sid,
            provenance=item["provenance"],
            is_fixture=item["is_fixture"],
        )
        print(f"Linked scene {sid} -> {nid} (provenance={scene_rec.provenance})")

        # Verify
        re_ws = get_native_project_workspace(nid)
        print(f"Verified {nid}: {len(re_ws.scenes)} scene(s) linked: {[s.scene_id for s in re_ws.scenes]}")

    print("All project links synchronized successfully.")

if __name__ == "__main__":
    run_linking()
