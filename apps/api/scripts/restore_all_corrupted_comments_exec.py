import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')

updates = {
    'f00672c3-2630-4a3f-bb1a-ed7cd3901fea': 
        "📩 **Yêu cầu khởi tạo qua Telegram** (Người gửi: @tuan_architect):\n\nGiao cho Geometry Agent dựng một căn phòng 4x5m, có một cửa ra vào và hai cửa sổ.",
        
    '7caa1c31-36cf-4442-9e5f-f06d29e91866': 
        "💬 **Phản hồi qua Telegram** (@tuan_architect):\n\nKích thước cửa sổ là 1200x1400mm, cao cách sàn 900mm nhé Agent.",
        
    'ecf1026b-c26b-4a04-98a4-79f58adf63ba': 
        "Hãy thực hiện kiểm thử điều phối ngay bây giờ: tạo 4 task độc lập (không làm subtask của hội thoại) cho phương án Japandi hiện tại, lần lượt giao cho Geometry/BIM, Furniture, Style/Materials và Cost/BOM.",
        
    'ab811dfb-cd67-4ca8-b8f7-e6af59baa086': 
        "## Phương án thiết kế phòng ngủ Japandi\n\nTôi đã đọc mặt bằng đính kèm: kích thước lọt lòng khoảng **4.190 × 4.040mm**, giường **1.800 × 2.000mm** đặt giữa vách đầu giường, bàn phấn bên phải, tủ áo chữ L.",
        
    'a1b16a19-54b4-422c-a77b-fdcfa0812fc9': 
        "## Phương án thiết kế phòng ngủ Japandi\n\nTôi đã đọc mặt bằng đính kèm: kích thước lọt lòng khoảng **4.190 × 4.040mm**, giường **1.800 × 2.000mm** đặt giữa vách đầu giường, bàn phấn bên phải, tủ áo chữ L.",
        
    'ff449114-2745-4734-b3e8-f49d015451ed': 
        "## Cập nhật định lượng Mục 7B\n\nĐã xác định dữ liệu nền: phòng 4×5m, cao 2,8m; cửa đi 0,9×2,1m; cửa sổ 1,4×1,2m.\n\n- Tổng diện tích 4 mặt tường: (2×4 + 2×5) × 2,8 = 50,40m².\n- Trừ cửa đi 1,89m² và cửa sổ 1,68m²: diện tích sơn thuần = 46,83m².\n- Với Dulux phủ 2 lớp, dùng định mức bảo thủ 13m²/lít/lớp: cần 7,20L sơn phủ; đề xuất mua 1 thùng 9L màu Trắng Ngà và 1 thùng 1L màu Xanh Xô Thơm (sau khi chốt chính xác vị trí tường nhấn).\n- Sàn gỗ An Cường: 20m² × 1,10 hao hụt = 22m². Nếu quy cách 1,64m²/hộp: 14 hộp (22,96m²).\n\nPhần cần chốt: tường nào là mảng nhấn để tách chính xác số lít từng màu; số liệu trên giữ dư hao hụt hợp lý.",
        
    '57d4ca8e-a566-49ad-bea6-33c45af25e68': 
        "Nguyên nhân: phiên trước dừng ở trạng thái chờ nhưng không có disposition hợp lệ.\nĐã ghi nhận lỗi đường chạy tiếp theo và trả task về Style & Materials Consultant.\nRetry: hoàn tất phép tính, xác nhận vị trí màu và đóng task.",
        
    'd09f507f-9bbf-40d7-ab63-4c964483665e': 
        "Đã hoàn tất phương án bố trí nội thất và handoff các tiêu chí va chạm, vùng mở cửa, sightline và lưu thông cho bước QA tiếp theo.",
        
    '0290c0e5-6c82-4ab4-83b3-cd94aa32f143': 
        "Chờ xác nhận vị trí mảng tường Xanh Xô Thơm để tách đúng định lượng từng màu.\nĐã tạo câu hỏi có cấu trúc và giữ task cho Style & Materials Consultant.\nSau khi trả lời, tiếp tục tính và đóng task."
}

with conn.cursor() as cur:
    for cid, clean_text in updates.items():
        cur.execute("UPDATE issue_comments SET body = %s WHERE id = %s;", (clean_text, cid))
        print(f"Updated comment {cid}")

    # Fix b643261b-9606-4072-8da9-cf92b9659ff8 by replacing U+FFFD with m²
    cur.execute("SELECT body FROM issue_comments WHERE id = 'b643261b-9606-4072-8da9-cf92b9659ff8';")
    row = cur.fetchone()
    if row:
        fixed_b64 = row[0].replace('\ufffd', '²')
        cur.execute("UPDATE issue_comments SET body = %s WHERE id = 'b643261b-9606-4072-8da9-cf92b9659ff8';", (fixed_b64,))
        print("Updated comment b643261b-9606-4072-8da9-cf92b9659ff8")

    # Fix issue 899155d9-77ec-46df-9596-8d268dd1f90f title & description
    clean_issue = "Giao cho Geometry Agent dựng một căn phòng 4x5m, có một cửa ra vào và hai cửa sổ."
    cur.execute("UPDATE issues SET title = %s, description = %s WHERE id = '899155d9-77ec-46df-9596-8d268dd1f90f';", (clean_issue, clean_issue))
    print("Updated issue 899155d9-77ec-46df-9596-8d268dd1f90f")

    conn.commit()

print("All corrupted comments and issues updated successfully!")
conn.close()
