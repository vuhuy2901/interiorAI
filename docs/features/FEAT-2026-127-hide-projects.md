# [FEAT-2026-127] Ẩn dự án khỏi danh sách và màn 2D/3D (có bật lại)

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Claude (agent) theo yêu cầu người dùng |
| Người chấp thuận | Người dùng (yêu cầu trực tiếp trong phiên) |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Atelier có 10 dự án trong bảng `projects`. Người dùng muốn ẩn 7 dự án demo/thử
nghiệm khỏi mọi danh sách và màn 2D/3D, nhưng không xóa dữ liệu và phải có cách
bật lại. Danh sách hiện lấy từ `GET /api/v1/projects` (`list_projects`), và
`AtelierStudioContext` dùng `GET /api/v1/projects?include_fixtures=false` để
chọn dự án đầu tiên.

Dự án cần ẩn: `proj_demo_4x5m`, `proj_46650566`, `proj_bedroom_japandi_4x4m`,
`proj_g4_63e1f4eb`, `proj_g7_trace`, `proj_g7_waiting`, `proj_c22bdd94`.

Dự án phải còn hiện: `proj_e435bbeb`, `proj_kid_bedroom`, `proj_the_interior_14`.

## 2. Mục tiêu

- Sau khi áp dụng, `GET /api/v1/projects` mặc định không trả 7 dự án ẩn; chỉ
  còn 3 dự án cần hiện.
- Người dùng ẩn/bật lại được từ UI mà không cần sửa code.
- Không dự án nào bị xóa hoặc đổi payload.

## 3. Phạm vi

### In scope

- Bảng mới `project_visibility` trong `init_db` (`apps/api/app/db.py`), lưu
  cờ ẩn riêng, không ghi vào `payload_json`.
- Helper đọc/ghi cờ ẩn trong `apps/api/app/db.py` (cạnh `list_projects`).
- `GET /api/v1/projects`: mặc định bỏ dự án ẩn; `?include_hidden=true` trả tất
  cả, mỗi item có `hidden: true|false`.
- Endpoint mới `PUT /api/v1/projects/{project_id}/visibility`, body
  `{"hidden": bool, "reason": str | None}`, 404 nếu dự án không tồn tại, trả
  `{"project_id", "hidden"}`.
- UI `AtelierStudioContext.tsx`: state bật "Hiện dự án đã ẩn", tải danh sách
  kèm `include_hidden=true` khi bật, hàm đổi trạng thái ẩn rồi tải lại danh sách.
- UI `AtelierDesignStudioPage.tsx` (màn 2D/3D, nơi có bộ chọn dự án): công tắc
  "Hiện dự án đã ẩn", nút "Ẩn" / "Bật lại" cho dự án đang chọn, dự án ẩn hiển thị
  mờ (opacity 0.5) trong danh sách khi công tắc bật.
- Bỏ chọn cứng `proj_demo_4x5m` làm mặc định ở `AtelierWorkflowBuilder.tsx` và
  fallback `AtelierInventoryBOMPage.tsx`; thay bằng dự án đầu tiên trong danh sách.
- Test mới `tests/test_project_visibility.py`.
- Dữ liệu: sau khi test PASS, backup DB rồi đặt hidden=1 cho 7 dự án.

### Out of scope

- Không xóa, không sửa payload dự án, không đổi revision.
- Không đổi `GET /api/v1/projects/{id}` (vẫn lấy theo ID cho dự án ẩn).
- `DashboardOverviewPage` trong `SupportingPages.tsx` không được mount ở route
  nào (kiểm tra bằng grep: không có import). Không đưa nó vào route.
- `UnifiedBOQPage.tsx` có option cứng trong fallback; không đổi trong phiên này
  (ghi nhận làm hạng mục sau).
- `ConversationAtelierSidecar.tsx` có link export cứng `proj_demo_4x5m`; không
  đổi (link vẫn hoạt động vì GET theo ID không bị ảnh hưởng).
- Không đụng: `contracts.py`, `orchestrator.py`, `agent_prompts.py`,
  `house_plan_designer.py`, `pbrCatalog.ts`, `atelier-clarification-policy.ts`,
  dòng `style` của `CreateProjectPayload` trong `main.py`.
- Không commit, không kill/restart server 8000.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: SQLite `c:\QLDAPM-final\data\atelier.db`, FastAPI route, React
  `AtelierStudioContext`.
- Dữ liệu dùng chung: bảng `projects`, `atelier_scene_links` (không sửa).
- Service/port/database không được ảnh hưởng: server port 8000 đang chạy (không
  restart); DB chỉ thêm một bảng và các dòng trong `project_visibility`.
- File có thay đổi chưa commit của người khác: chỉ sửa đúng vùng liên quan, đọc
  lại trước khi Edit.

## 5. Thiết kế và kế hoạch triển khai

1. Backup file gốc vào `scratch/backup-hide-projects/`.
2. `init_db`: thêm `CREATE TABLE IF NOT EXISTS project_visibility (...)`.
3. `db.py`: `get_hidden_project_ids()`, `set_project_visibility(pid, hidden, reason)`
   (upsert, `updated_at` = `now_iso()`).
4. `main.py`: sửa `api_list_projects` thêm `include_hidden`; thêm route PUT.
5. UI: context và trang 2D/3D như mô tả ở mục 3.
6. Test pytest, `npm run typecheck`.
7. Backup DB, insert 7 dòng hidden=1, query xác nhận.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Sửa | Bảng `project_visibility`, helper ẩn/hiện |
| `apps/api/app/main.py` | Sửa (vùng route projects) | List lọc ẩn, PUT visibility |
| `tests/test_project_visibility.py` | Tạo mới | Test hành vi |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Sửa | Trạng thái include_hidden, hàm đổi ẩn |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Sửa | Công tắc, nút Ẩn/Bật lại |
| `paperclip/ui/src/features/atelier/AtelierWorkflowBuilder.tsx` | Sửa (dòng default) | Bỏ chọn cứng proj_demo_4x5m |
| `paperclip/ui/src/features/atelier/AtelierInventoryBOMPage.tsx` | Sửa (fallback) | Bỏ chọn cứng proj_demo_4x5m |
| `data/atelier.db` | Dữ liệu | Đặt hidden=1 cho 7 dự án (sau backup) |

## 7. Acceptance criteria

- [ ] AC-01: `GET /api/v1/projects` không trả 7 dự án ẩn; trả đủ 3 dự án còn hiện.
- [ ] AC-02: `GET /api/v1/projects?include_hidden=true` trả cả 10 dự án, có `hidden`.
- [ ] AC-03: `PUT .../visibility` với hidden=false làm dự án hiện lại trong list.
- [ ] AC-04: `PUT` với id không tồn tại trả 404.
- [ ] AC-05: `init_db()` gọi lại không làm mất cờ hidden.
- [ ] AC-06: `GET /api/v1/projects/{id}` vẫn trả dự án ẩn.
- [ ] AC-07: UI có công tắc hiện dự án ẩn và nút Ẩn/Bật lại; typecheck pass.
- [ ] AC-08: Trên DB thật, đúng 7 dự án có hidden=1, 3 dự án không ẩn.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Test visibility | `.venv\Scripts\python -m pytest tests/test_project_visibility.py -q` | PASS |
| Regression liên quan | `.venv\Scripts\python -m pytest tests/test_multi_agent_group_chat.py -q` | PASS |
| Typecheck UI | `npm run typecheck` trong `paperclip/ui` | Không lỗi mới |
| Dữ liệu thật | Query bảng `project_visibility` sau khi ghi | 7 hidden=1, 3 không ẩn |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Agent khác sửa main.py/AtelierStudioContext cùng lúc | Đọc lại trước Edit; chỉ sửa vùng liên quan |
| Ghi nhầm DB thật | Backup DB trước khi ghi; chỉ ghi sau khi test PASS |
| Typecheck có lỗi có sẵn từ người khác | Ghi nhận lỗi không thuộc phạm vi, không sửa |

Rollback point và cách rollback: file gốc nằm trong
`scratch/backup-hide-projects/`; DB backup
`c:\QLDAPM-final\data\atelier-before-hide-projects-<timestamp>.db`. Bật lại
bằng PUT visibility `hidden=false` hoặc `DELETE FROM project_visibility`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude (agent), theo yêu cầu người dùng.
- Thời điểm: 2026-11-18

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | Chưa có (không commit) | Backup file gốc vào `scratch/backup-hide-projects/`; thêm bảng `project_visibility`; helper `get_hidden_project_ids`/`set_project_visibility`; route list + PUT visibility; UI context + trang 2D/3D; bỏ chọn cứng `proj_demo_4x5m` ở `AtelierWorkflowBuilder.tsx` và `AtelierInventoryBOMPage.tsx`; test mới | Ghi chú: field `hidden` luôn có trong item list (không chỉ khi include_hidden) — tập con của contract, không đổi hành vi yêu cầu. Test dùng DB tạm qua monkeypatch `DB_PATH` (khác các test cũ dùng DB thật). |
| 2026-11-18 19:04 | Chưa có | Backup DB bằng `sqlite3` backup API: `c:\QLDAPM-final\data\atelier-before-hide-projects-20261118-190449.db`; tạo bảng và ghi hidden=1 cho 7 dự án, reason `Japandi - người dùng ẩn` | Server 8000 vẫn chạy code cũ; cần restart để route mới có hiệu lực |

Phạm vi không làm (ghi nhận, không phải CR): `DashboardOverviewPage` trong
`SupportingPages.tsx` không được mount ở route nào nên không có nút ẩn theo từng
dòng; điều khiển ẩn/bật lại đặt ở header `AtelierDesignStudioPage`. Các option
cứng trong `UnifiedBOQPage.tsx` và link export cứng trong
`ConversationAtelierSidecar.tsx` chưa đổi.

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | Chưa có | `.venv\Scripts\python -m pytest tests/test_project_visibility.py -q` | PASS (3 passed) | Chạy trước khi ghi DB thật |
| 2026-11-18 | Chưa có | `.venv\Scripts\python -m pytest tests/test_project_visibility.py tests/test_multi_agent_group_chat.py -q` | PASS (19 passed) | Output: `19 passed in 5.58s` |
| 2026-11-18 | Chưa có | `npm run typecheck` trong `paperclip/ui` | PASS (exit 0) | `tsc -b` không lỗi |
| 2026-11-18 19:04 | Chưa có | Query DB thật: bảng project_visibility | PASS: 7 hidden=1; 3 còn hiện (`proj_e435bbeb`, `proj_kid_bedroom`, `proj_the_interior_14`) | Hidden: proj_46650566, proj_bedroom_japandi_4x4m, proj_c22bdd94, proj_demo_4x5m, proj_g4_63e1f4eb, proj_g7_trace, proj_g7_waiting |
| 2026-11-18 19:05 | Chưa có | Kiểm tra read-only qua TestClient trên DB thật: list mặc định, include_hidden, GET theo ID, PUT id lạ | PASS: default list = 3 dự án; include_hidden = 10; GET `proj_demo_4x5m` = 200; PUT id lạ = 404 | Không ghi dữ liệu |

SHA-256 các file đã sửa (sau khi sửa xong):

- `apps/api/app/db.py` `6cad0a8f581200524fac5e23f2816560753163165315db416b840cb6f14d1b1f`
- `apps/api/app/main.py` `93971bdd0aa3edd5296b60b01c066c0fae4be77f47e07a2a5778d0bfb8b92d8a`
- `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` `51bc5a75cfa7112715384dc1988f7765caf0e18466ec0452670dc2accf488229`
- `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` `d2b066a31282d89863426fea8010d5b38996501bcc43e68dba7e7eaf26726751`
- `paperclip/ui/src/features/atelier/AtelierWorkflowBuilder.tsx` `9df1c5f85cec1814805788332fc14265241c57bc104af5aaf452f1436eba5857`
- `paperclip/ui/src/features/atelier/AtelierInventoryBOMPage.tsx` `3d34e9aae400b462d0884f4b5d93ae7563c4299768e2c5c804888f32b6f59b38`
- `tests/test_project_visibility.py` `1793fee29362480ee3ea9c70c1073e9c7eb66efc144095910090a2c82eae31ed`

## 14. Kết quả và đóng chức năng

- Kết quả: Đạt AC-01 đến AC-06 và AC-08 (kiểm chứng bằng test và query); AC-07 đạt ở mức typecheck, chưa kiểm tra bằng trình duyệt.
- Hạn chế còn lại: Server 8000 cần restart để route mới có hiệu lực; nút ẩn chỉ cho dự án đang chọn (không có danh sách theo dòng trên màn sống); chưa kiểm tra giao diện bằng trình duyệt.
- Việc chưa hoàn tất: Đổi các option cứng trong `UnifiedBOQPage.tsx`, link export cứng trong `ConversationAtelierSidecar.tsx`.
- Rollback point: Xem mục 9 (file gốc trong `scratch/backup-hide-projects/`, DB backup `atelier-before-hide-projects-20261118-190449.db`).
- Trạng thái `CLOSED` bởi:
- Thời điểm:
