# [FEAT-2026-127] Paperclip link to company simulation

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19 |
| Revision bắt đầu | working tree |
| Revision cuối | working tree (HEAD `707cf5f56398d53386c93de3a1743c7bf1563d18`; UI changes uncommitted) |

## 1. Bối cảnh

Paperclip hiện có các mục điều hướng cho không gian thiết kế nhưng chưa có link
trực tiếp tới bản mô phỏng công ty HOME&CO đang chạy tại `http://localhost:8123/`.
Người dùng cần mở mô phỏng từ cả hai chế độ sidebar của Paperclip.

## 2. Mục tiêu

Thêm một mục điều hướng có nhãn `Mô phỏng công ty` trong Paperclip. Mục này
mở đúng URL `http://localhost:8123/` trong tab mới và không làm thay đổi app
mô phỏng, route nội bộ hoặc dữ liệu Paperclip.

## 3. Phạm vi

### In scope

- Hiển thị link trong Classic sidebar và Coordinator sidebar.
- Dùng external anchor với `target="_blank"` và `rel="noopener noreferrer"`.
- Giữ style, trạng thái rail/collapsed và tooltip phù hợp sidebar hiện tại.

### Out of scope

- Không sửa nội dung hoặc server của HOME&CO.
- Không tạo route proxy trong Paperclip.
- Không thay đổi MCP, Pascal, database hoặc quyền agent.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip UI router/sidebar và HOME&CO static server.
- Dữ liệu dùng chung: không có.
- Service/port/database không được ảnh hưởng: `http://localhost:8123/`, Paperclip
  API/UI `http://localhost:3100/`.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo component link dùng chung cho external company simulation.
2. Gắn component vào hai sidebar hiện tại ở khu vực thiết kế.
3. Build UI và kiểm tra HTML output có đúng href/target/rel.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/components/CompanySimulationLink.tsx` | Thêm | Component link dùng chung, hỗ trợ rail/tooltip |
| `paperclip/ui/src/components/Sidebar.tsx` | Cập nhật | Hiển thị link trong Classic sidebar |
| `paperclip/ui/src/components/CoordinatorSidebar.tsx` | Cập nhật | Hiển thị link trong Coordinator sidebar |

## 7. Acceptance criteria

- [x] AC-01: Classic sidebar hiển thị `Mô phỏng công ty`.
- [x] AC-02: Coordinator sidebar hiển thị `Mô phỏng công ty`.
- [x] AC-03: Anchor dùng href chính xác `http://localhost:8123/`, mở tab mới
  và có `rel="noopener noreferrer"`.
- [x] AC-04: UI build thành công; HOME&CO và Paperclip không bị sửa server/route.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Build UI | `pnpm --filter @paperclipai/ui build` | Thành công |
| Source contract | `rg "http://localhost:8123/" paperclip/ui/src/components` | Có đúng component link |
| Live target | `Invoke-WebRequest http://localhost:8123/` | HTTP 200 |
| Diff scope | `git diff --check` và `git diff --stat` | Không lỗi whitespace, chỉ đúng file trong scope |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| HOME&CO chưa chạy nên link không mở được | Giữ link rõ ràng; kiểm tra HTTP 200 trước bàn giao |
| Mở tab mới bị chặn bởi browser policy | Dùng anchor chuẩn, không dùng popup API |

Rollback point và cách rollback: revert các thay đổi trong ba file UI được nêu ở
mục 6; không tác động dữ liệu hoặc service đang chạy.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng
- Thời điểm: 2026-11-19

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-19 | working tree | Bắt đầu triển khai link mô phỏng công ty | Giữ nguyên HOME&CO và Paperclip server |
| 2026-11-19 | working tree | Thêm component dùng chung vào Classic và Coordinator sidebar | Anchor mở tab mới tới HOME&CO |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-19 | working tree | `pnpm --filter @paperclipai/ui build` | PASS | Vite build thành công; có cảnh báo engine Node 22.19.0 thấp hơn yêu cầu package >=24.11.0 và các cảnh báo CSS/chunk có sẵn |
| 2026-11-19 | working tree | HTTP Paperclip `http://127.0.0.1:3100/` + bundle asset | PASS | Index HTTP 200; bundle HTTP 200; bundle chứa `http://localhost:8123/` |
| 2026-11-19 | working tree | HTTP HOME&CO `http://127.0.0.1:8123/` | PASS | HTTP 200; title HOME&CO; static server PID 34672 |
| 2026-11-19 | working tree | `git diff --check` trên 4 file trong scope | PASS | Không có lỗi whitespace |

## 14. Kết quả và đóng chức năng

- Kết quả: Paperclip có link `Mô phỏng công ty` trong cả hai sidebar, mở HOME&CO tại cổng 8123.
- Hạn chế còn lại: Chrome Computer Use không được dùng để kiểm tra DOM vì browser helper không xác định được URL hiện tại; đã kiểm tra live bằng HTTP và bundle production.
- Việc chưa hoàn tất: Không còn việc bắt buộc trong phạm vi contract.
- Rollback point: Các file UI trong mục 6.
- Trạng thái `CLOSED` bởi: Codex sau khi build và live HTTP verification thành công.
- Thời điểm: 2026-11-19
