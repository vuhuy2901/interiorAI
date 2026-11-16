---
name: interior-photoreal-render
description: Điều phối render nội thất chân thực từ canonical Scene đã duyệt, giữ nguyên hình học, bố trí và vật liệu; dùng cho render Cycles, AI enhancement có Depth/Canny, đánh giá ảnh và vòng sửa có kiểm soát. Không dùng để tự ý thiết kế lại phòng.
---

# Interior Photoreal Render

Tạo ảnh đẹp nhưng coi canonical Scene và revision đã duyệt là nguồn sự thật. Renderer 3D tạo ảnh chuẩn; dịch vụ sinh ảnh chỉ được làm bước enhancement tùy chọn và không được thay đổi thiết kế.

## Trước khi render

- Khóa project ID, revision, camera, kích thước ảnh, seed và material hash.
- Kiểm tra phòng, tường, cửa, cửa sổ, trần, inventory, transform, kích thước, màu và material ID.
- Kiểm tra quy cách gạch, ron, hướng lát và UV. Không tự bịa texture/model/đồ trang trí.
- Nếu chưa có camera, dùng góc rộng nội thất hoặc tầm mắt cao 1,4–1,6 m, lens 21–35 mm; tránh vật thể và tường. Top-down là lựa chọn riêng.
- Đánh dấu asset không có GLB/PBR là `PARAMETRIC_PREVIEW`; không gọi proxy là sản phẩm thật.

## Chọn pipeline

1. Luôn render Blender Cycles trước và chạy scene verification.
2. Nếu người dùng ưu tiên chính xác hoặc dịch vụ AI chưa sẵn sàng, bàn giao ảnh Cycles.
3. Chỉ gọi enhancement khi adapter báo sẵn sàng và có ảnh màu cùng camera với Canny và Depth thật từ renderer.
4. Cố định seed và workflow version. Dùng structural strength cao; mức thay đổi hình ảnh mặc định thấp.
5. Nếu enhancement làm lệch tường/cửa/cửa sổ/số lượng đồ, loại ảnh và giữ bản Cycles.

Đọc [references/quality-and-iteration.md](references/quality-and-iteration.md) khi đánh giá hoặc sửa ảnh. Đọc [references/sources-and-runtime.md](references/sources-and-runtime.md) khi cấu hình ComfyUI/model hoặc cần truy nguồn.

## Vòng cải thiện

Tối đa ba vòng. Mỗi vòng xác định lỗi lớn nhất rồi chỉ đổi một nhóm: camera, exposure/lighting, material hoặc AI enhancement strength. Giữ nguyên các điều kiện khác, lưu lý do và chỉ giữ vòng tốt hơn. Dừng sớm khi đạt.

## Bàn giao

Trả ảnh, download URL và metadata gồm revision, camera/lens, engine, seed, samples, workflow version, material hash, condition-map URLs, scene QA và geometry QA. Gắn nhãn ảnh minh họa; không dùng ảnh làm thông số thi công.
