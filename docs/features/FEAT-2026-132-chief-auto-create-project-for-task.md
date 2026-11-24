# [FEAT-2026-132] Chief auto-creates a project for design chat tasks without a project

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Phase 3 ATELIER / Chief agent |
| Người chấp thuận | Chưa chốt |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

`POST /api/v1/chat/messages` (và `POST /api/v1/projects/{project_id}/chat/messages`)
trả 404 khi request không có `project_id` (ví dụ task Paperclip ATL-70 chưa gắn
project). Chief cần tự tạo project khi tin nhắn là yêu cầu thiết kế mới.

## 2. Mục tiêu

- Khi không có project và tin nhắn chứa từ khóa thiết kế, endpoint tạo project mới,
  gắn workflow mặc định, rồi đi tiếp vào luồng workflow bình thường.
- Khi không có project và tin nhắn không phải yêu cầu thiết kế, giữ nguyên 404.

## 3. Phạm vi

### In scope

- `apps/api/app/main.py`, hàm `api_send_chat_message`: nhánh `project is None`.
- Import thêm `bind_project_workflow` và `build_clean_task_scene` nếu chưa có (đã có trong
  import block đầu file, không cần thêm).

### Out of scope

- Không đổi endpoint khác, không đổi schema `ChatMessagePayload`, không đổi logic
  `execute_real_workflow_run`.
- Không tạo project khi `project_id` đã được truyền nhưng không tồn tại (vẫn 404).
- Không liên kết với Paperclip issue (việc đó thuộc `link_issue_to_scene`, ngoài phạm vi).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `save_project`, `bind_project_workflow`, `build_clean_task_scene`, `uuid` (đã import).
- Dữ liệu dùng chung: bảng `projects`, `project_workflow_bindings`. Không sửa schema.
- Workflow `wf_default_interior_pipeline` phải tồn tại (đã dùng ở nhánh task hiện có).

## 5. Thiết kế và kế hoạch triển khai

1. Khi `pid` rỗng và tin nhắn khớp từ khóa thiết kế (không phân biệt hoa thường):
   - `pid = f"proj_{uuid4().hex[:8]}"`
   - `scene = build_clean_task_scene(pid, name, brief)` với `name` lấy từ 60 ký tự đầu của tin nhắn.
   - `save_project(scene, author="Chief Auto-Create", reason="Auto-created from task without project", bump_revision=False)`
   - `bind_project_workflow(pid, "wf_default_interior_pipeline")`, lỗi `ValueError` đổi thành 409.
   - Gán `project = saved` và tiếp tục luồng hiện có.
2. Các trường hợp còn lại: giữ nguyên `HTTPException(404)`.

Lý do chọn `build_clean_task_scene` thay vì `build_default_demo_project` (đề xuất ban đầu):
nhánh task hiện có dùng hàm này để tạo project sạch, không kéo dữ liệu demo vào; và bắt
buộc bind workflow, nếu không `get_project_workflow_id` trả None và luồng trả 409.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/main.py` (`api_send_chat_message`) | Sửa nhánh không tìm thấy project | Thêm auto-create có điều kiện |
| `docs/features/FEAT-2026-132-chief-auto-create-project-for-task.md` | Tạo mới | Hợp đồng bắt buộc theo AGENTS.md |

## 7. Acceptance criteria

- [ ] AC-01: Tin nhắn có từ khóa thiết kế, không có project → tạo project mới, trả về thành công (không 404).
- [ ] AC-02: Project mới có workflow binding `wf_default_interior_pipeline`.
- [ ] AC-03: Tin nhắn không có từ khóa thiết kế, không có project → vẫn 404.
- [ ] AC-04: `project_id` truyền vào nhưng không tồn tại → vẫn 404 (không auto-create).
- [ ] AC-05: Chỉ thay đổi nhánh được mô tả ở mục 5; diff không đụng code khác.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Import và syntax | `python -c "import ast; ast.parse(open('apps/api/app/main.py',encoding='utf-8').read())"` | Không lỗi |
| Import module | `python -c "import sys; sys.path.insert(0,'apps/api'); import app.main"` | Không lỗi |
| AC-01..AC-04 | Gọi `TestClient` POST với tin nhắn có/không từ khóa, có/không project_id (nếu môi trường DB cho phép) | Khớp AC |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Từ khóa quá rộng (ví dụ "nhà") tạo project ngoài ý muốn | Chỉ áp dụng khi không có project_id; có thể siết lại bằng CR |
| Project mới rỗng nếu `build_clean_task_scene` lỗi | Lỗi được propagate, không ghi dữ liệu nửa vời vì save sau build |

Rollback point: revision git hiện tại trước khi sửa (repo không phải git; khôi phục bằng
cách hoàn tác đúng khối code đã thêm trong `api_send_chat_message`).

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: agent (theo yêu cầu Phase 3)
- Thời điểm: 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | Chưa có | Sửa nhánh lookup project trong `api_send_chat_message` (main.py) | Dùng `build_clean_task_scene` + `bind_project_workflow` thay vì `build_default_demo_project` (xem mục 5) |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | Chưa có | `ast.parse` main.py | Pass | Syntax OK |
| 2026-11-18 | Chưa có | Import `app.db` (build_default_demo_project, save_project, build_clean_task_scene, bind_project_workflow) | Pass | Imports OK |
| 2026-11-18 | Chưa có | AC-01..AC-04 end-to-end qua API | Chưa chạy | Cần môi trường DB/workflow để gọi endpoint |

## 14. Kết quả và đóng chức năng

- Kết quả:
- Hạn chế còn lại:
- Việc chưa hoàn tất:
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:
