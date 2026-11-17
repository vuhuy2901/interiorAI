---
name: scene-bound-cost-provenance
description: Lập và kiểm định BOQ/giá từ đúng canonical scene revision, phân biệt giá người dùng nhập, giá xác minh, giá tham khảo và dòng thiếu giá. Dùng khi cảnh/GLB thay đổi, khi chạy Cost workflow hoặc trước nghiệm thu tài chính để ngăn dùng giá của phòng hay revision cũ.
key: paperclipai/bundled/interior-design/scene-bound-cost-provenance
defaultInstall: true
recommendedForRoles:
  - finance
  - researcher
  - qa
tags:
  - interior-design
  - boq
  - cost
  - provenance
---

# Scene-bound Cost Provenance

## Mục tiêu

Mỗi dòng BOQ phải truy ngược được đến đối tượng/phạm vi của scene hiện hành và nguồn đơn giá. Không dùng dự toán cũ chỉ vì tên hạng mục giống nhau.

## Nguồn và luồng thật

- Đọc canonical project/scene và revision đã kiểm định.
- Dùng cost workflow hiện có tại `/api/v1/projects/{project_id}/cost-workflow` cùng các route BOQ/material pricing mà ứng dụng đang gọi.
- Dùng inventory/mesh classification hiện có; tường và sàn có thể bóc theo diện tích/chiều dài, đồ rời theo instance/nhóm được xác nhận.
- Nguồn giá bên ngoài chỉ được ghi khi có URL/tài liệu, ngày truy cập và phạm vi áp dụng.

## Quy trình

1. Khóa `project_id`, `scene_id`, revision, asset hash và phạm vi (toàn cảnh/tầng/phòng/nhóm).
2. Tạo inventory từ cảnh hiện hành. Gộp mesh thành hạng mục chỉ khi có quy tắc nhóm có thể giải thích; không coi mỗi mesh kỹ thuật là một sản phẩm bán lẻ.
3. Với mỗi dòng ghi: scene object/group IDs, tên, nhóm, kích thước/khối lượng, số lượng, đơn vị, vật liệu, SKU nếu có, công thức và hệ số hao hụt.
4. Gán một trạng thái đơn giá:
   - `user_provided`: do người dùng nhập.
   - `verified`: có báo giá/catalog chính thức còn nhận diện được nguồn và ngày.
   - `reference`: giá tham khảo có nguồn/ngày; cho phép người dùng chỉnh nhưng không gọi là báo giá mua hàng.
   - `missing`: chưa có căn cứ giá.
5. Tính bằng số học xác định: thành tiền từng dòng, trước thuế, VAT và sau thuế. VAT/hao hụt phải hiển thị, không âm thầm áp dụng.
6. Đối chiếu độ phủ inventory ↔ BOQ và nêu rõ dòng thiếu/không định giá. Scene revision hoặc asset hash đổi thì đánh dấu BOQ stale và tính lại.
7. Trước handoff, đọc lại cost workflow để chứng minh tổng và số dòng lưu trữ khớp artifact xuất.

## Evidence tối thiểu

- Scene revision + asset hash và phạm vi.
- Tổng số nhóm/instance trong inventory, số dòng BOQ và quy tắc gộp.
- Nguồn/ngày cho mọi dòng `verified` hoặc `reference`.
- Tổng theo từng trạng thái giá, trước VAT, VAT, sau VAT và các dòng `missing`.
- Cảnh báo rõ: giá `reference` không phải báo giá mua hàng/hồ sơ thi công.

## Cổng hoàn thành

- `in_review`: BOQ phủ đủ phạm vi hoặc liệt kê minh bạch phần thiếu, artifact mở được và tổng đã đối chiếu.
- `blocked`: không xác định được scene revision/phạm vi, inventory không đáng tin cậy hoặc quy tắc thuế bắt buộc chưa được xác nhận.
- `done`: phạm vi và cơ sở giá đã được người dùng duyệt theo đúng mục đích (tham khảo hay mua hàng), artifact cuối khớp revision.

Không bịa SKU, nhà cung cấp, giá hoặc biến `reference` thành `verified`.
