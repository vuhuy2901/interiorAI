# [FEAT-2026-044] Tối giản Atelier Company Workflow (Draft v6) & Task Lifecycle 6 trạng thái

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User request (2026-11-14) |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T23:47:00+07:00 |
| Revision bắt đầu | `68499c8a5125bb06b96751a9ccbedd90a2c11d9c` + working tree hiện có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Workflow hiện tại `"Atelier Company Workflow"` đang ở bản publish `v5` (`ac6f33fc-11bf-457f-9cad-95a76c4315c7`) với 11 node và 15 cạnh phân nhánh song song (`Floor Plan`, `Geometry / BIM`, `Furniture`, `Style / Materials`, `Asset & Material Discovery`, `Rendering Specialist`, `QA`, `Cost / BOM`, `Final Review`, `Export and Delivery`). Cấu trúc phân nhánh này khiến người dùng khó đọc luồng chính, khó biết bước nào đang chạy hay bị lỗi.

Đồng thời:
- Màn hình `Task Lifecycle` hiện hiển thị 7 trạng thái tiếng Anh của Paperclip (`Backlog`, `To do`, `In progress`, `In review`, `Blocked`, `Done`, `Cancelled`), gắn node type `RETRY_RECOVERY` / `APPROVAL_GATE` và hiển thị thanh công cụ builder (`Validate`, `Test Run`, `Node library`, `ISSUE_STATUS`), gây nhầm lẫn như một workflow có thể chọn chạy.
- Màn hình Workflow header hiện có dropdown chọn giữa nhiều version (`v1..v5`) và nút `Test Run` chỉ chạy validation tĩnh, chưa chạy end-to-end trên scene thật kèm ảnh render thật; tab `Execution` chưa hiển thị rõ lượt chạy đang ở `"Bước n/5"` và lỗi cụ thể ở bước nào.

## 2. Mục tiêu

Tạo bản **Draft v6** (clone từ `v5`) của `"Atelier Company Workflow"` và tối giản giao diện màn hình Workflow để người dùng nhìn vào là hiểu ngay:
1. Pipeline chính chỉ còn **5 bước thẳng**, không nhánh song song, tên tiếng Việt dễ hiểu, hiển thị tiến độ `"Bước n/5"` khi chạy.
2. Bỏ `Asset & Material Discovery` khỏi đường chính; chuyển `Cost/BOM` thành bước tùy chọn bật/tắt được, chỉ chạy **sau khi** bước 5 được người duyệt xác nhận.
3. `Task Lifecycle` chỉ là sơ đồ trạng thái chỉ-đọc (read-only) với đúng **6 trạng thái**: `Chờ`, `Đang chạy`, `Chờ duyệt`, `Hoàn thành`, `Lỗi`, `Đã hủy`; chuyển cài đặt `Thử lại`, `Ghi log`, `Thông báo` vào cài đặt từng bước trong `Pipeline Workflow`.
4. Giao diện chạy chỉ có **một nút `"Chạy"` duy nhất** dùng workflow đã publish mới nhất (không bắt người dùng chọn giữa nhiều workflow); tab `Execution` hiển thị rõ đang ở bước mấy (`Bước n/5`) và lỗi ở đâu.
5. **Validate v6** và **Test Run** end-to-end trên 1 scene thật (kèm ảnh render thật Blender Cycles), chứng minh bước `Render` không bao giờ bắt đầu trước khi `Bước 3` hoàn tất. **Dừng ở Draft v6 đã Validate + Test Run, KHÔNG tự publish v6.**

## 3. Phạm vi

### In scope

- Tạo mới Draft `v6` của `"Atelier Company Workflow"` trong PostgreSQL từ `v5`:
  - **Bước 1/5 — `1. Nhận bản vẽ`** (từ `Chief Architect Intake`)
  - **Bước 2/5 — `2. Dựng scene`** (gộp `Floor Plan` + `Geometry/BIM`, kèm scene validator)
  - **Bước 3/5 — `3. Chọn đồ & vật liệu`** (gộp `Style/Materials` + `Furniture`)
  - **Bước 4/5 — `4. Render`** (từ `Rendering Specialist`; ràng buộc chặt chỉ chạy SAU khi Bước 3 hoàn tất, render đúng vật liệu đã chọn)
  - **Bước 5/5 — `5. Kiểm tra & giao`** (gộp `QA` + `Final Review` + `Export`; có cổng `NGƯỜI DUYỆT` trước khi xuất, agent không được tự đóng)
  - Bước tùy chọn sau duyệt (ngoài đường chính): `Cost/BOM` có thể bật/tắt, chỉ kích hoạt sau khi cổng `NGƯỜI DUYỆT` ở Bước 5 xác nhận.
- Cập nhật validator & executor backend (`paperclip/server`):
  - Ràng buộc thứ tự bắt buộc: không thể chạy `Render` trước khi Bước 3 (`Chọn đồ & vật liệu`) hoàn tất.
  - Hỗ trợ `stepNumber`, `totalSteps`, `stepSettings` (`retry`, `logging`, `notifications`) và `optionalSteps.costBomAfterApproval`.
  - Hỗ trợ thực thi end-to-end cho `"Chạy"` (dùng bản `published` mới nhất) và `"Test Run"` (chạy thử trên 1 scene thật với Draft hiện tại `v6`, gọi FastAPI validator + material binding + Blender Cycles render thật, lưu trace từng bước `"Bước n/5"` và lỗi nếu có, dừng ở cổng `NGƯỜI DUYỆT` trước khi xuất).
- Cập nhật `Task Lifecycle` (`lifecycle.ts` & `AtelierWorkflowBuilder.tsx`):
  - Giữ đúng 6 trạng thái hiển thị: `Chờ`, `Đang chạy`, `Chờ duyệt`, `Hoàn thành`, `Lỗi`, `Đã hủy`.
  - Gỡ khỏi Task Lifecycle mọi node/khái niệm không thuộc hiển thị trạng thái (`Backlog`/`To do` trùng, `RETRY_RECOVERY`, `APPROVAL_GATE` action, Node library, Validate/Test Run/chọn chạy).
  - Chuyển cấu hình `Thử lại`, `Ghi log`, `Thông báo` vào bảng cài đặt từng bước trong `Pipeline Workflow`.
- Cập nhật giao diện chạy & Execution trong `AtelierWorkflowBuilder.tsx` / `AtelierWorkflowMonitor.tsx`:
  - Một nút `"Chạy"` duy nhất chạy workflow đã publish mới nhất (không dropdown chọn nhiều workflow trong luồng chạy).
  - Nút `"Validate"` và `"Test Run"` rõ ràng cho Draft `v6` (chờ duyệt trước khi Publish).
  - Tab `Execution` hiển thị từng lượt chạy đang ở `"Bước n/5"`, trạng thái từng bước, log, lỗi nằm ở bước nào, ảnh render thật và nút phê duyệt/từ chối cho `NGƯỜI DUYỆT`.

### Out of scope (Không được làm)

- **KHÔNG sửa hoặc xóa `v5`** (`status = published`, bất biến).
- **KHÔNG tự Publish `v6`** — dừng ở `status = draft` đã Validate + Test Run, chờ người dùng duyệt.
- **KHÔNG xóa code agent hay skill hiện có** (`apps/api/app/services/agent_prompts.py`, 9 agent DB rows, `DEFAULT_CAPABILITIES`, FastAPI executors). Chỉ đổi cách nối trong v6; một agent có thể phụ trách nhiều bước.
- **KHÔNG đổi giao diện Studio ngoài màn hình workflow** (giữ nguyên `AtelierDesignStudioPage.tsx`, `StudioViewport.tsx`, modal vật liệu/render/credits, sidebar điều hướng).
- **KHÔNG xóa dữ liệu project, revision hoặc lịch sử workflow run cũ** (`atelier_workflow_runs`, `workflows` v1–v5, `workflow_runs`).

## 4. Dependency và tài nguyên cần bảo vệ

- PostgreSQL (`127.0.0.1:54329`): bảng `workflows` (bảo vệ v1–v5 nguyên vẹn), `atelier_workflow_runs`, `atelier_workflow_stage_executions`, `issues`, `agents`, `projects`.
- Paperclip server (`127.0.0.1:3100`), Vite UI (`127.0.0.1:5173`), FastAPI (`127.0.0.1:8000`), Blender Cycles `4.2.3`.
- Dirty working tree của `FEAT-2026-041` trên `apps/api` và `AtelierDesignStudioPage.tsx` / `StudioViewport.tsx` phải được giữ nguyên.

## 5. Thiết kế và kế hoạch triển khai

1. **Schema & Backend Workflow (`paperclip/server`)**:
   - Mở rộng type `AtelierWorkflowNode` (`stepNumber`, `totalSteps`, `stepLabel`, `sourceNodes`, `includesValidator`, `stepSettings: { retry, logging, notifications }`) và `AtelierEditableDefinition` (`optionalSteps.costBomAfterApproval`).
   - Bổ sung kiểm tra validator cho luồng tuyến tính có gắn `render` phải đứng sau node vật liệu/nội thất (`style_and_furniture` / `style` & `furniture`), và cho phép `END` node mang thông tin cổng `NGƯỜI DUYỆT`.
   - Bảo đảm `DEFAULT_CAPABILITIES` hỗ trợ gộp bước mà không xóa capability/agent cũ.
   - Bổ sung API chạy thực tế & test run (`/api/atelier/workflow/run` cho bản publish mới nhất và `/api/atelier/workflow/definitions/:id/test-run` cho Draft) thực thi từng bước 1→5 theo thứ tự nghiêm ngặt, kiểm tra chặn Step 4 nếu Step 3 chưa xong, gọi FastAPI scene validator + material hash + Blender Cycles render thật, dừng ở cổng `NGƯỜI DUYỆT` trước bước xuất và chạy `Cost/BOM` chỉ khi người duyệt xác nhận + toggle bật.
2. **Tạo Draft v6 trên PostgreSQL**:
   - Clone từ `v5` sang `v6` (`status = 'draft'`), cập nhật đồ thị 5 bước thẳng, 4 cạnh nối liền, cài đặt từng bước và `optionalSteps.costBomAfterApproval` (`enabled: false`). Giữ nguyên `v5`.
3. **Frontend Workflow & Task Lifecycle (`paperclip/ui`)**:
   - `workflow-graph/lifecycle.ts`: chỉ giữ đúng 6 trạng thái (`Chờ`, `Đang chạy`, `Chờ duyệt`, `Hoàn thành`, `Lỗi`, `Đã hủy`), mode chỉ-hiển-thị.
   - `AtelierWorkflowBuilder.tsx`:
     - Node card hiển thị `"Bước n/5"`, tên tiếng Việt rõ ràng, agent phụ trách, trạng thái chạy hoặc cổng `NGƯỜI DUYỆT`.
     - Bổ sung mục `"Cài đặt bước (Thử lại · Ghi log · Thông báo)"` trong Inspector và thẻ cấu hình `"Bước tùy chọn sau duyệt: Cost/BOM (Bật / Tắt)"`.
     - Header tối giản: một nút `"Chạy"` duy nhất chạy workflow đã publish mới nhất; chọn scene để chạy/test; chế độ `Task Lifecycle` ẩn hoàn toàn nút chọn chạy/chỉnh sửa/Validate/Test Run.
     - Tab `Execution`: hiển thị lượt chạy hiện tại đang ở `"Bước n/5"`, tiến trình 5 bước, log từng bước, bước bị lỗi và nguyên nhân lỗi, ảnh render thật, cùng nút Duyệt / Từ chối của `NGƯỜI DUYỆT`.
4. **Kiểm thử & Test Run thật**:
   - Chạy unit/integration test cho validator, thứ tự `Bước 3 -> Render`, 6 trạng thái Task Lifecycle, và UI layout/typecheck.
   - Chạy Validate `v6` và Test Run end-to-end trên 1 scene thật (`proj_demo_4x5m`), lưu ảnh render thật và chụp UI bằng Playwright.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-workflow-builder.ts` | Mở rộng schema, validator & step settings | Hỗ trợ `Bước n/5`, `stepSettings`, `optionalSteps`, ràng buộc `Bước 3 -> Render` |
| `paperclip/server/src/services/atelier-workflow-orchestration.ts` | Thêm bộ thực thi 5 bước & state trace | Thực thi tuần tự 5 bước trên scene thật, enforce `Step 3 -> Render`, human gate, optional Cost/BOM |
| `paperclip/server/src/routes/atelier-bridge.ts` | Thêm endpoint Run / Test Run / Approval | Nút `"Chạy"` (latest published), `"Test Run"` (Draft v6 trên scene thật), `"NGƯỜI DUYỆT"` |
| `paperclip/ui/src/features/atelier/workflow-graph/types.ts` | Cập nhật TS types | Kiểu `stepNumber`, `stepSettings`, `optionalSteps`, `stepLabel` |
| `paperclip/ui/src/features/atelier/workflow-graph/lifecycle.ts` | Tối giản còn 6 trạng thái | Chỉ giữ `Chờ`, `Đang chạy`, `Chờ duyệt`, `Hoàn thành`, `Lỗi`, `Đã hủy` (read-only) |
| `paperclip/ui/src/features/atelier/AtelierWorkflowBuilder.tsx` | Tối giản giao diện Workflow & Execution | 1 nút `"Chạy"`, hiển thị `"Bước n/5"`, chuyển Thử lại/Log/Thông báo vào bước, Execution trace + lỗi + ảnh render |
| `paperclip/ui/src/features/atelier/AtelierWorkflowMonitor.tsx` | Đồng bộ nhãn trạng thái/step | Hiển thị `Bước n/5` và lỗi rõ ràng ở monitor |
| `paperclip/server/src/__tests__/atelier-workflow-builder.test.ts` & UI tests | Bổ sung unit tests | Test v6 5 bước, chặn `Render` trước `Bước 3`, 6 trạng thái Lifecycle |
| Live DB `workflows` row `v6` (`draft`) | Tạo mới từ `v5` | Draft `v6` để Validate + Test Run, giữ `v5` bất biến |

## 7. Acceptance criteria

- [ ] AC-01: `v5` trong PostgreSQL vẫn ở trạng thái `published` và giữ nguyên byte-for-byte 11 node / 15 cạnh; không bị sửa hay xóa.
- [ ] AC-02: Draft `v6` (`status = 'draft'`) tồn tại với đúng 5 bước thẳng không nhánh song song (`1. Nhận bản vẽ`, `2. Dựng scene`, `3. Chọn đồ & vật liệu`, `4. Render`, `5. Kiểm tra & giao`), hiển thị `"Bước 1/5"`..`"Bước 5/5"`; `v6` KHÔNG tự publish.
- [ ] AC-03: Không có `Asset & Material Discovery` và `Cost/BOM` trên đường chính; `Cost/BOM` là bước tùy chọn bật/tắt được và chỉ chạy sau khi Bước 5 được người duyệt xác nhận.
- [ ] AC-04: Toàn bộ agent và skill hiện có vẫn còn nguyên; không xóa file hay agent nào.
- [ ] AC-05: `Task Lifecycle` chỉ hiển thị đúng 6 trạng thái (`Chờ`, `Đang chạy`, `Chờ duyệt`, `Hoàn thành`, `Lỗi`, `Đã hủy`), ở chế độ chỉ đọc (không chọn chạy, không chứa Retry/Log/Notification action); các cài đặt `Thử lại`, `Ghi log`, `Thông báo` nằm trong cài đặt từng bước của `Pipeline Workflow`.
- [ ] AC-06: Giao diện chạy chỉ có một nút `"Chạy"` duy nhất chạy workflow đã publish mới nhất (không bắt người dùng chọn giữa nhiều workflow); tab `Execution` hiển thị đang ở `"Bước n/5"` và chỉ rõ lỗi ở bước nào.
- [ ] AC-07: Ràng buộc thứ tự được kiểm tra tự động và bằng test: `Render` (Bước 4) bị chặn nếu Bước 3 (`Chọn đồ & vật liệu`) chưa hoàn tất, và dùng đúng vật liệu đã chọn (`material_hash`).
- [ ] AC-08: Validate `v6` PASS (0 error) và Test Run end-to-end trên 1 scene thật (`proj_demo_4x5m`) tạo ra ảnh render Blender Cycles thật; có ảnh chụp giao diện thực tế.
- [ ] AC-09: Giao diện Studio ngoài màn hình workflow và lịch sử project/run cũ không bị ảnh hưởng hoặc xóa.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Backend workflow tests | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/atelier-workflow-builder.test.ts src/__tests__/atelier-workflow-orchestration.test.ts` | Tất cả test PASS, kể cả test v6 5 bước và test chặn Render trước Bước 3 |
| UI graph/lifecycle tests & typecheck | `pnpm --filter @paperclipai/ui exec vitest run src/features/atelier/workflow-graph/layout.test.ts` và typecheck file workflow | PASS, không lỗi TS trong các file đã sửa |
| Immutable v5 & Draft v6 DB check | Query `/api/atelier/workflow/definitions` | v5 `published` nguyên vẹn 11 node / 15 cạnh; v6 `draft` 5 node / 4 cạnh |
| Validate v6 API | `POST /api/atelier/workflow/definitions/{v6}/validate` | `valid: true`, 0 issues |
| Test Run v6 end-to-end | Kích hoạt Test Run Draft v6 trên scene thật `proj_demo_4x5m` qua API/UI | Chạy tuần tự Bước 1→2→3→4(Render PNG thật khớp `material_hash`)→dừng cổng `NGƯỜI DUYỆT` tại Bước 5 |
| UI Playwright verification | Chụp `/ATL/workflows` (Pipeline v6, Task Lifecycle 6 trạng thái, Step settings, Execution tab) | Đúng tiếng Việt, không overlap, nút Chạy duy nhất, thấy Bước n/5 & ảnh render |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| `ATELIER_CANONICAL_STAGES` cũ (9 stage) vẫn được project cũ dùng ở `v1..v5` | Giữ nguyên hàm/constant xử lý run cũ cho `v1..v5`; thêm nhánh riêng cho graph v2 tuyến tính 5 bước của `v6` để run cũ không gãy |
| Server `tsx src/index.ts` trên cổng 3100 không hot-reload | Sau khi sửa xong backend `paperclip/server`, restart sạch tiến trình server cổng 3100 và kiểm tra `/api/health` |
| Render thật mất thời gian hoặc lỗi kết nối FastAPI | Dùng `proj_demo_4x5m` đã sẵn sàng (Blender 4.2.3 Cycles hoạt động), timeout HTTP đủ rộng |

Rollback point và cách rollback:
- Trước khi tạo Draft v6, `v5` vẫn giữ nguyên ID `ac6f33fc-11bf-457f-9cad-95a76c4315c7` và status `published`. Nếu cần rollback DB, chỉ cần xóa row Draft `v6` (`status = 'draft'`) mà không chạm vào `v1..v5` hay lịch sử run cũ. Code rollback qua `git checkout` các file liệt kê ở Mục 6.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity (theo user request 2026-11-14)
- Thời điểm: 2026-11-14T23:47:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| | | | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | | | | |

## 14. Kết quả và đóng chức năng

- Kết quả: Chờ người dùng duyệt Draft v6 và kết quả kiểm thử/ảnh trước khi publish hoặc đóng hợp đồng.
- Hạn chế còn lại: Chưa publish v6 theo đúng ràng buộc.
