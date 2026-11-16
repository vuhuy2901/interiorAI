---
name: bedroom-photoreal-render
description: Kiểm tra và điều phối render phòng ngủ chân thực từ canonical Scene, giữ nguyên geometry, bố trí, camera và vật liệu đã duyệt. Dùng cho yêu cầu render, phối cảnh nội thất hoặc đánh giá chất lượng ảnh phòng ngủ; không dùng để tự ý thiết kế lại phòng.
---

# Bedroom Photoreal Render

Mục tiêu là tạo ảnh trình bày chân thực nhưng không thay đổi thiết kế đã duyệt. Skill này hướng dẫn agent ra quyết định và kiểm tra; việc dựng hình, vật liệu, ánh sáng và ghi file phải được thực thi bằng renderer/API của dự án.

## Đầu vào bắt buộc

- canonical project/scene ID và revision cố định;
- camera render hoặc xác nhận dùng camera nội thất mặc định;
- kích thước phòng, tường, cửa đi, cửa sổ và trần;
- inventory với transform và kích thước từng món;
- material ID/PBR override của sàn, tường, trần và nội thất;
- kích thước gạch, ron, hướng lát và offset UV;
- lighting preset và độ phân giải.

Thiếu dữ liệu làm thay đổi thiết kế thì hỏi người dùng hoặc đánh dấu `needs_input`. Không tự bịa model, texture, cửa, đèn hay đồ trang trí.

## Quy trình

1. Khóa snapshot theo revision trước khi render. Revision lệch thì dừng với `revision_conflict`.
2. Kiểm tra số lượng tường/cửa/cửa sổ/nội thất, transform, kích thước, va chạm và vật thể xuyên tường.
3. Chọn camera người dùng đã lưu. Nếu chưa có, dùng góc tầm mắt cao 1,4–1,6 m từ cửa hoặc góc phòng, nhìn về giường, lens 24–35 mm. Giữ trục đứng tự nhiên và không đặt camera trong tường/vật thể. Top-down chỉ dùng khi người dùng chọn rõ.
4. Giữ nguyên bounding box và transform của model. Nếu chỉ có proxy, báo rõ; chỉ thay bằng asset chi tiết cùng loại khi license và mapping đã xác minh.
5. Áp dụng đúng material ID: base color, roughness, metallic, normal/bump, transmission/IOR, texture scale và hướng vân.
6. Áp dụng ánh sáng tự nhiên qua đúng cửa sổ và đèn có trong scene. Không tạo đèn/decor không có trong inventory.
7. Render preview, kiểm tra framing/exposure rồi mới render chất lượng cao.
8. Đối chiếu ảnh với snapshot. Sai số lượng, vị trí cửa, silhouette, màu, vật liệu, gạch hay camera thì `needs_review`.

Đọc [references/quality-gates.md](references/quality-gates.md) khi đánh giá ảnh hoặc điều tra ảnh lỗi.

## Ranh giới thực thi

Agent được phép chọn preset và báo lỗi. Mã/renderer chịu trách nhiệm cho snapshot, camera transform, UV/PBR, lấy mẫu, denoise, tone mapping, file ảnh và metadata. Không gọi thay đổi prompt/skill là huấn luyện AI.

Nếu Cycles không khả dụng, WebGL/HDRI chỉ là preview/fallback và phải gắn nhãn rõ; không gọi ảnh upscale từ canvas là photorealistic.

## Đầu ra

Trả `render_meta` gồm project ID, revision, camera, lens, resolution, engine, samples/quality, lighting preset, material hash và trạng thái QA. Ảnh tải xuống phải là cùng artifact đang hiển thị.
