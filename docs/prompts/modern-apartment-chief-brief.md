# Prompt gửi Chief Architect — Modern Apartment GLB

File model nguồn: [modern_apartment.glb](<C:/Users/DELL/Downloads/modern_apartment.glb>)

## Prompt

Chief Architect, hãy tiếp nhận file GLB `modern_apartment.glb` làm model tham khảo chính cho một phương án căn hộ hiện đại.

Yêu cầu triển khai:

1. Đọc và kiểm tra model trước khi chỉnh sửa: cấu trúc scene, số tầng, các không gian, tường, sàn, trần, cầu thang, cửa, cửa sổ, đồ nội thất và vật liệu.
2. Không tự suy đoán kích thước thật từ tên file. Hãy đo bounding box của model, xác định đơn vị và ghi rõ scale confidence. Nếu chưa có mốc kích thước được xác nhận, đánh dấu `scale: unknown` hoặc `proposed` và yêu cầu Floor Plan/QA xác minh trước khi dùng cho bản vẽ kỹ thuật.
3. Giữ nguyên bản model nguồn. Tạo một bản làm việc mới trong project hiện tại, có source link tới file GLB và ghi provenance đầy đủ.
4. Bóc tách model thành hồ sơ kiến trúc có thể kiểm tra: mặt bằng từng tầng, room polygons, tường, cột, cửa đi, cửa sổ, cầu thang, lan can, sàn và trần. Mỗi phần phải có ID ổn định, kích thước, cao độ và tầng tương ứng.
5. Giao Floor Plan Agent xác thực mặt bằng 2D và kích thước; giao QA Agent kiểm tra topology, scale, room area, lối đi, cửa và cầu thang. Chỉ sau khi Floor Plan QA PASS mới chuyển Geometry/BIM.
6. Giao Geometry/BIM Agent dựng canonical SceneGraph từ dữ liệu đã xác thực và xuất DXF R2007, GLB và IFC4. Geometry không được ghi đè model nguồn.
7. Sau Geometry, cho Style/Materials và Furniture Agent bổ sung hoặc thay thế vật liệu/nội thất theo brief, nhưng không làm thay đổi tường, kích thước, cửa, cửa sổ hoặc cầu thang nếu chưa có handoff hợp lệ.
8. Nếu model có đồ nội thất baked sẵn, phân loại rõ phần nào là architectural geometry và phần nào là reference furniture. Không coi texture baked là specification thi công.
9. Ghi các lựa chọn tự chủ của specialist vào decision ledger; chỉ hỏi người dùng khi thiếu scale, thay đổi công năng, vấn đề an toàn, thay đổi brief hoặc cam kết chi phí.
10. Kết thúc bằng một handoff document gồm: scene ID, revision, đơn vị, kích thước tổng thể, diện tích từng tầng, danh sách phòng, các giả định, cảnh báo, nguồn file, license/provenance và các deliverable đã xuất.

Đầu ra đầu tiên cần có:

- báo cáo kiểm tra model và bounding box;
- bảng phân tầng và danh sách không gian;
- danh sách kích thước chưa xác minh;
- đề xuất workflow/subtask cho Floor Plan → Floor Plan QA → Geometry/BIM → Style/Furniture → Cost/Render → Final QA;
- không tự đánh dấu hoàn tất và không tạo project/workflow thứ hai.

Model này là dữ liệu tham khảo để triển khai thiết kế. Không coi nó là bản vẽ thi công hoặc hồ sơ kết cấu đã được phê duyệt.
