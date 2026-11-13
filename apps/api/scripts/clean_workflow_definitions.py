import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')

clean_descriptions = {
    "FLOOR_PLAN_RECOGNITION": "Xác thực mặt bằng, đơn vị mm, tường, cửa đi, cửa sổ và tỷ lệ.",
    "BIM_GEOMETRY": "Dựng hình học/BIM từ mặt bằng đã xác thực, có kiểm tra kích thước.",
    "FURNITURE_PLANNING": "Bố trí nội thất, kiểm tra va chạm, vùng mở cửa và lối lưu thông.",
    "STYLE_RESEARCH": "Đề xuất và xác nhận phong cách, màu, vật liệu; unknown phải needs_input.",
    "LIGHTING_DESIGN": "Thiết kế chiếu sáng và visualization dựa trên layout/vật liệu đã gate.",
    "COST_CALCULATION": "Bóc tách BOM và dự toán; ngân sách thiếu phải needs_input, không tự chốt.",
    "SPATIAL_QA": "Kiểm tra hình học, công năng, hồ sơ, nguồn giá và các quyết định còn thiếu.",
    "FINAL_REVIEW": "Chief tổng hợp, nêu phần cần người dùng duyệt và chờ kết luận sau approval."
}

with conn.cursor() as cur:
    cur.execute("SELECT id, definition FROM workflows;")
    rows = cur.fetchall()
    print(f"Total workflows: {len(rows)}")
    for wid, defn in rows:
        modified = False
        if isinstance(defn, dict) and "nodes" in defn:
            for node in defn["nodes"]:
                tt = node.get("taskType") or node.get("id")
                if tt in clean_descriptions:
                    node["description"] = clean_descriptions[tt]
                    modified = True
        elif isinstance(defn, str):
            d = json.loads(defn)
            if "nodes" in d:
                for node in d["nodes"]:
                    tt = node.get("taskType") or node.get("id")
                    if tt in clean_descriptions:
                        node["description"] = clean_descriptions[tt]
                        modified = True
            defn = d

        if modified:
            cur.execute("UPDATE workflows SET definition = %s WHERE id = %s;", (json.dumps(defn, ensure_ascii=False), wid))
            print(f"Updated workflow {wid}")
    conn.commit()
conn.close()
print("Workflow definitions cleaned successfully!")
