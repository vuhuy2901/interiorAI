import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, before_config, after_config FROM agent_config_revisions WHERE before_config::text LIKE '%\ufffd%' OR after_config::text LIKE '%\ufffd%';")
    rows = cur.fetchall()
    print("Corrupted agent config revisions count:", len(rows))
    
    # We can replace the broken characters with proper Vietnamese titles
    title_fixes = {
        "Chuyn Gia Tr?n, Chi?u Sng & Ph?i C?nh 3D": "Chuyên Gia Trần, Chiếu Sáng & Phối Cảnh 3D",
        "Chuyn Gia Phong Cch, V?t Li?u & Hon Thi?n": "Chuyên Gia Phong Cách, Vật Liệu & Hoàn Thiện",
        "Chuyn Gia Nghin C?u S?n Ph?m, Catalog & Ngu?n Hng": "Chuyên Gia Nghiên Cứu Sản Phẩm, Catalog & Nguồn Hàng",
        "Chuyn Gia Danh M?c, Bc Tch & D? Ton BOQ": "Chuyên Gia Danh Mục, Bóc Tách & Dự Toán BOQ",
        "Ki?n Trc Su Tru?ng & Di?u Ph?i Da Agent": "Kiến Trúc Sư Trưởng & Điều Phối Đa Agent"
    }

    for rev_id, before_cfg, after_cfg in rows:
        b_str = json.dumps(before_cfg, ensure_ascii=False) if before_cfg else None
        a_str = json.dumps(after_cfg, ensure_ascii=False) if after_cfg else None
        
        for bad, good in title_fixes.items():
            if b_str and bad in b_str:
                b_str = b_str.replace(bad, good)
            if a_str and bad in a_str:
                a_str = a_str.replace(bad, good)
                
        cur.execute(
            "UPDATE agent_config_revisions SET before_config = %s, after_config = %s WHERE id = %s;",
            (b_str, a_str, rev_id)
        )
    conn.commit()
    print("Cleaned up agent config revisions.")
conn.close()
