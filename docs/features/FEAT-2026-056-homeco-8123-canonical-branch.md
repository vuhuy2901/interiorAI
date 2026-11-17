# [FEAT-2026-056] Canonical HOME&CO 8123 feature branch

| Trường | Giá trị |
|---|---|
| Trạng thái | IMPLEMENTING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng yêu cầu bản đúng tại cổng 8123 |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 (Asia/Bangkok) |
| Revision bắt đầu | e422e4cc |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Nhánh `feat/homeco-8123` hiện chỉ là alias của nhánh cũ `feat/luxury-3d-office-timelapse` tại commit `e422e4cc`, nên hệ thống review không nhận diện được một thay đổi mới. Bản đang chạy đúng tại `http://localhost:8123/` là `ai-office-standalone/index.html`; app `ai-office/` là bản nhầm từng chạy ở cổng 5173.

## 2. Mục tiêu

Tạo một revision mới trên nhánh `feat/homeco-8123` thể hiện rõ bản HOME&CO tại cổng 8123 là bản canonical và không còn app nhầm `ai-office/` trong working tree của nhánh này.

## 3. Phạm vi

### In scope

- Giữ nguyên `ai-office-standalone/index.html` và các asset snapshot của HOME&CO.
- Xoá mã nguồn app `ai-office/` khỏi nhánh feature để không còn đường chạy bản 5173.
- Ghi nhận revision mới và push lên remote `origin/feat/homeco-8123`.

### Out of scope

- Không sửa hành vi, giao diện hoặc dữ liệu của HOME&CO 8123.
- Không force-push, không sửa `main`, và không xoá các nhánh khác.
- Không xoá process đang chạy ở cổng 8123.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `ai-office-standalone/index.html` và các asset snapshot đã commit.
- Dữ liệu dùng chung: lịch sử Git hiện có và remote branches.
- Service/port/database không được ảnh hưởng: `http://localhost:8123/` phải tiếp tục trả về HOME&CO; cổng 5173 không được khởi chạy lại.

## 5. Thiết kế và kế hoạch triển khai

1. Ghi nhận revision hiện tại và xác minh nội dung live 8123 khớp file canonical.
2. Xoá tracked directory `ai-office/` khỏi working tree.
3. Chạy kiểm tra diff, kiểm tra title và kiểm tra port 8123.
4. Commit thay đổi trên `feat/homeco-8123` và push fast-forward lên remote cùng tên.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office/` | Xoá | Loại bỏ bản mô phỏng nhầm ở cổng 5173 |
| `docs/features/FEAT-2026-056-homeco-8123-canonical-branch.md` | Thêm | Hợp đồng và bằng chứng triển khai |

## 7. Acceptance criteria

- [ ] AC-01: Nhánh `feat/homeco-8123` có commit mới khác `e422e4cc`.
- [ ] AC-02: `ai-office-standalone/index.html` vẫn tồn tại và title là `HOME&CO Interior · Luxury Architecture & Interior Studio`.
- [ ] AC-03: Không còn tracked file dưới `ai-office/` trên nhánh feature.
- [ ] AC-04: `http://localhost:8123/` trả HTTP 200 và phục vụ HOME&CO.
- [ ] AC-05: Remote `origin/feat/homeco-8123` trỏ tới revision cuối.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| So sánh live/source | Hash response `http://localhost:8123/` và `ai-office-standalone/index.html` trước thay đổi | Khớp trước khi xoá app nhầm |
| Kiểm tra file | `git ls-files ai-office` và `Test-Path ai-office` | Không còn kết quả sau commit |
| Kiểm tra ứng dụng | `Invoke-WebRequest http://localhost:8123/` | HTTP 200, title HOME&CO |
| Kiểm tra Git | `git status --short --branch`, `git ls-remote --heads origin feat/homeco-8123` | Working tree sạch, remote trỏ revision cuối |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| App 5173 bị xoá khỏi nhánh feature | Bản HOME&CO 8123 không thay đổi; rollback bằng `git revert` commit cleanup hoặc phục hồi từ commit `e422e4cc` |
| Remote branch không nhận revision | Chỉ dùng push fast-forward, không force-push |

Rollback point và cách rollback: commit ngay trước cleanup `e422e4cc`; dùng `git revert <cleanup-commit>` trên nhánh feature nếu cần phục hồi app cũ.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-17 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 | e422e4cc | Tạo hợp đồng FROZEN và loại bỏ tracked app `ai-office/` khỏi nhánh `feat/homeco-8123` | Giữ nguyên HOME&CO 8123 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-17 | working tree | Kiểm tra live `http://localhost:8123/` | PASS: HTTP 200, title HOME&CO | `Invoke-WebRequest` |
| 2026-11-17 | working tree | Kiểm tra canonical source | PASS: `ai-office-standalone/index.html` tồn tại | `Test-Path` |

## 14. Kết quả và đóng chức năng

- Kết quả: Đang triển khai cleanup trên nhánh `feat/homeco-8123`.
- Hạn chế còn lại: Chưa có.
- Việc chưa hoàn tất: Commit, push và verification cuối.
- Rollback point: `e422e4cc`.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa có.
