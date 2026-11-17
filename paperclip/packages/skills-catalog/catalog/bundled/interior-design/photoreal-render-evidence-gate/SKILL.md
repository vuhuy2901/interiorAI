---
name: photoreal-render-evidence-gate
description: Khóa chất lượng và bằng chứng cho render Blender Cycles của ATELIER. Dùng khi chuẩn bị camera/ánh sáng, gửi render, kiểm tra ảnh đầu ra hoặc nghiệm thu để bảo đảm ảnh thuộc đúng scene revision, góc camera thực sự thay đổi, không sai tầng và không cắt mất nội thất.
key: paperclipai/bundled/interior-design/photoreal-render-evidence-gate
defaultInstall: true
recommendedForRoles:
  - architect
  - engineer
  - qa
tags:
  - interior-design
  - blender
  - rendering
  - evidence
---

# Photoreal Render Evidence Gate

## Phạm vi

Skill này bổ sung cổng kiểm chứng cho các skill thiết kế ánh sáng và Blender hiện có. Nó không tự ý thay geometry, bố trí hay vật liệu đã duyệt để làm ảnh “đẹp hơn”.

## API và artifact thật

- Trạng thái bộ máy: `GET /api/v1/render/blender/status` và `GET /api/v1/render/capabilities`.
- Tạo snapshot/bridge: `POST /api/v1/projects/{project_id}/scene-bridge` và `/scene-bridge/verify`.
- Gửi việc: `POST /api/v1/projects/{project_id}/render-jobs` (hoặc endpoint render tương thích đang được UI dùng).
- Theo dõi: `GET /api/v1/render-jobs/{job_id}` và danh sách job/gallery theo project.
- Tải artifact bằng endpoint download của render job; không coi preview WebGL là ảnh Cycles.

## Quy trình

1. Khóa project, scene revision, asset hash, camera preset/transform, độ phân giải và chất lượng trước khi gửi.
2. Kiểm tra Blender/Cycles sẵn sàng. Nếu chưa sẵn sàng, trả trạng thái chưa kết nối và cấu hình thiếu; không giả lập thành công.
3. Kiểm tra camera: không nằm trong mesh, near/far hợp bounds, target nằm trong vùng nội thất, khung hình chứa phạm vi người dùng yêu cầu.
4. Khi đổi góc camera, chứng minh ma trận/position-target hoặc camera hash đã đổi. Nếu metadata không đổi, không gửi lại job và báo lỗi binding camera.
5. Kiểm tra ánh sáng theo tầng và trần thực tế. Đèn âm trần phải bám mặt trần đúng tầng; đèn thả phải có điểm treo và cao độ hợp lệ; không thêm đèn ra ngoài bounds để chữa exposure.
6. Gửi job và dùng trạng thái thật: queued/running/succeeded/failed/cancelled. Chỉ hiển thị phần trăm hoặc ETA nếu backend cung cấp.
7. Khi thành công, mở artifact, xác nhận kích thước ảnh, renderer `BLENDER_CYCLES`, revision, camera và material/scene hash khớp request.
8. QA trực quan: không cháy sáng diện rộng, không đen mất chi tiết, không cắt sai tầng, không mất đồ, không tường/trần che góc nội thất, vật liệu chính không bị thay màu vô cớ.

## Evidence bàn giao

- `job_id`, project/scene/revision và asset hash.
- Camera preset + transform/hash trước khi gửi.
- Resolution, quality, renderer và thời gian hoàn thành.
- URL/path artifact tải được và kích thước ảnh thực.
- Danh sách kiểm tra framing, geometry, material, lighting và sai lệch còn lại.

## Điều kiện trạng thái

- `in_review`: artifact Cycles mở được và metadata khớp snapshot.
- `blocked`: engine không sẵn sàng, bridge sai revision, camera không bind, job thất bại lặp lại hoặc artifact không khớp request. Ghi nguyên nhân và hành động mở khóa cụ thể.
- `done`: artifact đã qua QA và bước duyệt bắt buộc của task đã hoàn tất.

Không dùng ảnh cũ, ảnh preview hoặc ảnh thuộc camera khác để đóng task.
