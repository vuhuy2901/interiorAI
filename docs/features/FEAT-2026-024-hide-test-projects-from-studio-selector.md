# [FEAT-2026-024] Tách dữ liệu test khỏi danh sách dự án Studio

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier Studio |
| Người chấp thuận | Yêu cầu người dùng 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 16:20 +07:00 |
| Revision bắt đầu | `628d46151` + working tree hiện tại |
| Revision cuối | `628d46151` + working-tree implementation 2026-11-13 |

## 1. Bối cảnh

Studio selector đang gọi `/api/v1/projects` và hiển thị toàn bộ 27 scene legacy.
Audit hiện xác định ít nhất 14 fixture/E2E; các run acceptance cũ và material
demo cũng nằm cùng bảng nên bị hiểu nhầm là dự án/mẫu của người dùng.

## 2. Mục tiêu

Selector mặc định chỉ hiển thị dự án làm việc. Fixture/E2E vẫn được giữ để audit
và có thể lấy khi API được gọi với tùy chọn rõ ràng.

## 3. Phạm vi

### In scope

- Phân loại deterministic fixture/test/acceptance scene từ provenance hiện có,
  ID và marker tên đã biết.
- API project list hỗ trợ `include_fixtures`; giữ mặc định tương thích cho caller
  khác, Studio gọi explicit `false`.
- Studio không tự chọn project test khi khởi động.
- Test classifier và API/UI selection behavior.

### Out of scope

- Xóa project, revision, render, artifact hoặc evidence.
- Gộp các project trùng tên hay migrate toàn bộ scene legacy sang native project.
- Đổi project do người dùng tạo thành template.

## 4. Dependency và tài nguyên cần bảo vệ

- SQLite `projects`, `scene_revisions`, `atelier_scene_links`.
- Không xóa dữ liệu; active project hợp lệ tiếp tục tải được qua ID.
- API `/api/v1/projects` cho caller cũ không bị đổi mặc định.

## 5. Thiết kế và kế hoạch triển khai

1. Dùng một classifier duy nhất cho audit và list filtering.
2. Thêm query `include_fixtures` ở route list.
3. Studio gọi list với `include_fixtures=false` tại mọi điểm refresh.
4. Thêm test và browser evidence.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | behavior fix | Classify/filter scene test |
| `apps/api/app/main.py` | API option | Expose `include_fixtures` |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | UI fix | Yêu cầu danh sách sạch |
| focused tests | test | Bảo vệ dữ liệu thật và fixture |

## 7. Acceptance criteria

- [x] AC-01: P0 Regression, E2E, Real Acceptance, G2 demo và G7 trace được
  phân loại fixture/test.
- [x] AC-02: Studio selector mặc định không hiển thị fixture/test.
- [x] AC-03: API vẫn trả toàn bộ khi `include_fixtures=true` hoặc caller cũ dùng
  mặc định tương thích.
- [x] AC-04: Không project/revision nào bị xóa hoặc sửa.
- [x] AC-05: Browser evidence và focused tests pass.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| DB classifier test | pytest focused | PASS |
| API snapshot | count all vs filtered | filtered < all, user projects giữ nguyên |
| UI typecheck | focused/full UI typecheck | PASS |
| Browser | Studio dropdown | không còn fixture/E2E |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Ẩn nhầm project thật có chữ test | Marker rõ + provenance/ID; không xóa dữ liệu |
| Caller cũ mất fixture | API default giữ include=true |

Rollback: revert filter/query; toàn bộ dữ liệu vẫn còn nguyên trong SQLite.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 16:20 +07:00.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-12 | working tree | Fixture classifier, API filter và Studio clean list | Không xóa dữ liệu |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 | working tree | Pytest project architecture | PASS 3/3 | `tests/test_project_first_architecture.py` |
| 2026-11-13 | working tree | API all vs filtered | PASS 27 -> 3 | `PERFORMANCE_AND_DATA_AUDIT.md` |
| 2026-11-13 | working tree | Browser selector | PASS, đúng 3 option | `studio-projects-filtered.png` |

## 14. Kết quả và đóng chức năng

- Kết quả: Studio chỉ hiện 3 dự án người dùng; 24 fixture/test bị ẩn, không bị xóa.
- Hạn chế còn lại: Dữ liệu fixture vẫn tồn tại theo chủ đích để giữ evidence/test.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: `628d46151` + working tree hiện tại.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-13 00:32 +07:00.
