# [FEAT-2026-017] Thiết lập và đồng bộ Dự án Phòng Ngủ Master Japandi 4.19m × 4.04m vào hệ thống Atelier AI & Paperclip

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User (yêu cầu trực tiếp: "bạn sửa ở dự án đi :)))") |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |
| Revision bắt đầu | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |
| Revision cuối | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |

## 1. Bối cảnh

Sau khi khôi phục chuẩn xác nội dung phương án thiết kế phòng ngủ Japandi từ mặt bằng lọt lòng $4.190 \times 4.040\text{ mm}$, người dùng yêu cầu áp dụng trực tiếp dữ liệu này vào dự án hệ thống để đội ngũ Multi-Agent của Paperclip và studio 3D có thể vận hành và hiển thị ngay trên giao diện `http://localhost:3100`.

## 2. Mục tiêu

1. Tạo Canonical Project `proj_bedroom_japandi_4x4m` chuẩn xác từng milimet trong cơ sở dữ liệu của Atelier AI:
   - Kích thước phòng: $4.190 \times 4.040\text{ mm}$, trần cao $2.800\text{ mm}$.
   - Tường: 4 mảng tường với vách đầu giường ốp veneer sồi kết hợp nan thưa hai bên, vách TV sơn be nhạt điểm nhấn xám sage, tường cuối phòng bố trí tủ áo kịch trần.
   - Nội thất: Giường ngủ $1.800 \times 2.000\text{ mm}$ bọc nỉ linen greige, 2 tab treo tường, bàn phấn $900\text{ mm}$ gương tròn bo góc, tủ áo kịch trần cánh kính khói/mây đan, kệ TV treo thấp, thảm dệt phẳng oatmeal.
   - Chiếu sáng: Hệ đèn ray nhỏ $3.000\text{K}$, đèn hắt đầu giường, đèn đọc sách $2.700\text{K}$.
   - Dự toán BOQ tự động nằm trong khoảng $75 - 120\text{ triệu VNĐ}$ (thực tế tính toán: $118.575.128\text{ VNĐ}$).
2. Tạo Project "Phòng Ngủ Master Japandi (4.190 × 4.040mm)" trên Paperclip (`/api/companies/{id}/projects`).
3. Khởi tạo Issue công việc chuyên môn gắn với Kiến Trúc Sư Trưởng (`agent_concierge`) chứa Design Brief hoàn chỉnh (Issue `ATL-26`).
4. Đảm bảo toàn bộ hệ thống API và bài test hồi quy hoạt động 100%.

## 3. Phạm vi

### In scope

- Xây dựng hàm tạo `build_japandi_master_bedroom_project()` và lưu vào SQLite DB qua `app.db`.
- Gọi Paperclip API để tạo Project mới và Issue mới thuộc công ty Atelier AI (`b2e1c8a5-c3c9-412c-99cb-63180c4015dc`).
- Bổ sung test kiểm thử chấp nhận cho dự án mới trong `tests/test_japandi_bedroom_project.py`.

### Out of scope

- Không xóa hoặc làm ảnh hưởng dự án demo studio 4x5m hiện có.
- Không thay đổi model LLM hoặc adapter engine.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip backend (`:3100`), SQLite WAL (`atelier.db`).
- Dữ liệu dùng chung: ID công ty Atelier AI (`b2e1c8a5-c3c9-412c-99cb-63180c4015dc`), Kiến Trúc Sư Trưởng ID.
- Service/port/database không được ảnh hưởng: Giữ nguyên Paperclip và PostgreSQL.

## 5. Thiết kế và kế hoạch triển khai

1. Định nghĩa cấu trúc Canonical Project cho phòng ngủ Japandi $4.190 \times 4.040\text{ mm}$ với đầy đủ 4 tường, cửa ra vào góc dưới trái, cửa sổ, các đồ nội thất và tính toán dự toán BOQ qua `calculate_project_estimate`.
2. Lưu project vào SQLite database qua `save_project`.
3. Gửi request POST tới Paperclip API để tạo Project "Phòng Ngủ Master Japandi (4.190 × 4.040mm)" và tạo Issue "Thiết kế thi công nội thất Phòng Ngủ Master Japandi 4.19x4.04m".
4. Viết file test `tests/test_japandi_bedroom_project.py` và chạy kiểm thử pytest.
5. Xác minh dự án hiển thị đầy đủ trên API.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Bổ sung hàm | Tạo dữ liệu mẫu canonical cho phòng ngủ Japandi |
| Paperclip API Projects & Issues | Tạo bản ghi | Đồng bộ lên giao diện Paperclip |
| `tests/test_japandi_bedroom_project.py` | Tạo mới | Kiểm thử hồi quy và tính toàn vẹn dữ liệu dự án |

## 7. Acceptance criteria

- [x] AC-01: Dự án `proj_bedroom_japandi_4x4m` được tạo thành công trong SQLite DB với kích thước lọt lòng $4.190 \times 4.040\text{ mm}$.
- [x] AC-02: Tổng dự toán BOQ của dự án nằm trong khoảng $75 - 120\text{ triệu VNĐ}$ (kết quả: 118.575.128 VNĐ).
- [x] AC-03: Project xuất hiện trên Paperclip API với đầy đủ metadata và description (Project ID: `e20d2696-5794-4cdb-ba5d-47fac2fc4f0d`).
- [x] AC-04: Issue thiết kế phòng ngủ Japandi được tạo trên Paperclip gắn với Chief Architect (Issue: `ATL-26`).
- [x] AC-05: Toàn bộ bài test `tests/test_japandi_bedroom_project.py` pass 100%.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra SQLite DB | `python -c "from app.db import get_project; ..."` | Trả về project đúng kích thước và đồ nội thất (PASS) |
| Kiểm tra Paperclip Project | GET `/api/companies/{id}/projects` | Chứa project Japandi Bedroom (PASS) |
| Kiểm tra Paperclip Issue | GET `/api/projects/{id}/issues` | Chứa issue thiết kế phòng ngủ ATL-26 (PASS) |
| Kiểm tra Pytest | `pytest tests/test_japandi_bedroom_project.py` | Passed 4/4 (100% PASS) |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Trùng lặp project ID | Dùng ID duy nhất `proj_bedroom_japandi_4x4m` |

Rollback point và cách rollback:
- Xóa project `proj_bedroom_japandi_4x4m` nếu cần rollback.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity Assistant & User confirmation
- Thời điểm: 2026-11-11 11:40:00 +07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 | c4c17d9 | Khởi tạo hợp đồng tính năng | FROZEN |
| 2026-11-11 | c4c17d9 | Thêm hàm `build_japandi_master_bedroom_project` và seed vào SQLite | Hoàn thành |
| 2026-11-11 | c4c17d9 | Tạo Project `Phòng Ngủ Master Japandi` trên Paperclip API | ID: `e20d2696-5794-4cdb-ba5d-47fac2fc4f0d` |
| 2026-11-11 | c4c17d9 | Tạo Issue `ATL-26` gắn Kiến Trúc Sư Trưởng và gửi kickoff comment | Hoàn thành |
| 2026-11-11 | c4c17d9 | Viết bộ test `tests/test_japandi_bedroom_project.py` (4/4 passed) | Hoàn thành |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 | c4c17d9 | Kiểm tra SQLite DB model | PASS (4190x4040mm, 7 món nội thất) | Python runtime query |
| 2026-11-11 | c4c17d9 | Kiểm tra BOQ Cost Engine | PASS (118.575.128 VNĐ $\in [75\text{M}, 120\text{M}]$) | Deterministic cost snapshot |
| 2026-11-11 | c4c17d9 | Paperclip Project API | PASS (ID: `e20d2696-5794-4cdb-ba5d-47fac2fc4f0d`) | GET `/api/companies/:id/projects` |
| 2026-11-11 | c4c17d9 | Paperclip Issue ATL-26 | PASS (Status: `in_progress`, Assigned: Chief Architect) | GET `/api/companies/:id/issues` |
| 2026-11-11 | c4c17d9 | Pytest test suite | PASS (4 passed in 0.16s) | Pytest stdout |

## 14. Kết quả và đóng chức năng

- Kết quả: Dự án Phòng Ngủ Master Japandi 4.19m × 4.04m đã được thiết lập và đồng bộ trực tiếp vào cơ sở dữ liệu Atelier AI, Paperclip Project và Paperclip Issue ATL-26. Toàn bộ các chuyên gia Multi-Agent đã sẵn sàng vận hành.
- Hạn chế còn lại: Không.
- Rollback point: c4c17d9
