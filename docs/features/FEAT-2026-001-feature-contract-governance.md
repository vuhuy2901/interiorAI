# [FEAT-2026-001] Chuẩn hóa hợp đồng triển khai chức năng

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Repository maintainers |
| Người chấp thuận | Product Owner (yêu cầu trực tiếp) |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 — bootstrap governance |
| Revision bắt đầu | `f92c6c3` |
| Revision cuối | Working tree — chưa commit |

## 1. Bối cảnh

Repo chưa có quy định cấp root buộc mỗi chức năng phải được mô tả và chốt trước
khi sửa code. Điều này cho phép phạm vi hoặc tiêu chí nghiệm thu bị thay đổi âm
thầm trong quá trình triển khai.

## 2. Mục tiêu

Thiết lập một quy trình thống nhất, có template dùng lại và được agent tự động
đọc, để yêu cầu, triển khai và kiểm thử luôn truy vết được.

## 3. Phạm vi

### In scope

- Quy tắc bắt buộc cấp repository.
- Vòng đời DRAFT → FROZEN → IMPLEMENTING → VERIFYING → CLOSED.
- Template cho từng chức năng.
- Change Log append-only sau khi đóng băng.

### Out of scope

- Thay đổi runtime hoặc hành vi sản phẩm.
- Chuyển đổi ngược toàn bộ tài liệu lịch sử sang template mới.
- Tạo công cụ CI tự động kiểm tra feature contract.

## 4. Dependency và tài nguyên cần bảo vệ

- Giữ nguyên toàn bộ source và dữ liệu sản phẩm.
- Không sửa quy tắc chuyên biệt trong các `AGENTS.md` lồng nhau.
- Quy định mới bổ sung, không thay thế quy tắc Paperclip hiện có.

## 5. File đã thay đổi

| File | Loại thay đổi | Lý do |
|---|---|---|
| `AGENTS.md` | Mới | Bắt buộc agent tuân thủ quy trình |
| `docs/features/README.md` | Mới | Runbook đầy đủ |
| `docs/features/TEMPLATE.md` | Mới | Mẫu dùng cho từng chức năng |
| File này | Mới | Bằng chứng tự áp dụng quy trình |

## 6. Acceptance criteria

- [x] AC-01: Có quy định không sửa code trước khi contract được `FROZEN`.
- [x] AC-02: Có quy định không viết lại yêu cầu đã đóng băng.
- [x] AC-03: Mọi thay đổi phạm vi phải có change request.
- [x] AC-04: Có template chứa scope, acceptance, verification và rollback.
- [x] AC-05: Có Definition of Ready và Definition of Done.

## 7. Verification evidence

| Kiểm tra | Kết quả |
|---|---|
| Các file bắt buộc tồn tại | PASS |
| Template có đủ trạng thái vòng đời | PASS |
| `git diff --check` | PASS |

## 8. Rủi ro và rollback

Rủi ro chính là quy trình tạo thêm overhead cho thay đổi nhỏ; hotfix được phép
dùng contract rút gọn nhưng không được bỏ qua hoàn toàn.

Rollback: xóa bốn file quản trị mới. Không có migration hoặc dữ liệu runtime bị
ảnh hưởng.

## 9. Change Log

Chưa có change request.

## 10. Ghi chú bootstrap

Đây là contract đầu tiên dùng để thiết lập chính quy tắc contract, nên tài liệu
và quy tắc được tạo trong cùng một lượt bootstrap. Từ chức năng kế tiếp, contract
phải đạt trạng thái `FROZEN` trước khi bất kỳ file triển khai nào được sửa.
