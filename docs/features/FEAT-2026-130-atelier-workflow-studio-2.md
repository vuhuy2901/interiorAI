# [FEAT-2026-130] Atelier Workflow Studio 2.0 — Redesign Company Workflow & Project Monitor

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Product Designer & Full-stack Architect |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng (Master Prompt Atelier Workflow Studio 2.0) |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19T20:47:00+07:00 |
| Revision bắt đầu | `707cf5f56398d53386c93de3a1743c7bf1563d18` |
| Revision cuối | `707cf5f56398d53386c93de3a1743c7bf1563d18` |

## 1. Bối cảnh

Hệ thống Company Workflow và Project Monitor hiện tại của Atelier còn nhiều hạn chế lớn về trải nghiệm và kiến trúc giao diện:
1. Các node quá nhỏ (width 244px, height 104px), typography chật chội, thiếu thứ bậc thông tin và avatar/vai trò agent chi tiết.
2. Canvas bị thu nhỏ quá mức lúc tải trang (fitView zoom < 0.3 trên màn hình rộng), để lại khoảng trắng mênh mông, khó đọc nội dung.
3. Phân tách rời rạc giữa tab "Pipeline Workflow" và tab "Task Lifecycle" gây nhầm lẫn: Task Lifecycle hiển thị các trạng thái như một diagram riêng biệt thay vì tập trung vào một Visual Workflow Studio duy nhất.
4. Thiếu hệ thống Transition Editor tương tác trực quan (kết nối kéo thả giữa các handle, chỉnh sửa thuộc tính transition, outcome labels, guards/conditions).
5. Thiếu công cụ ghi chú trực quan (Node notes, Transition notes, Canvas sticky notes, Section/Group grouping).
6. Thiếu Sidebar quản lý danh viện Workflow của từng Project với vòng đời rõ ràng: Draft, Published, Active; chưa có cơ chế kích hoạt 1 workflow duy nhất (Active Workflow) cho project kèm khóa thực thi đồng thời.
7. Execution Monitor chưa được tích hợp liền mạch vào cùng một Canvas Studio.

## 2. Mục tiêu

Thiết kế lại và triển khai trực tiếp hệ thống Company Workflow & Project Monitor thành **Atelier Visual Workflow Studio 2.0**:
- Mang phong cách Modern Enterprise Workflow Editor (lấy cảm hứng từ Jira Workflow Editor kết hợp nhận diện cao cấp của ATELIER).
- Loại bỏ hoàn toàn tab "Task Lifecycle" khỏi giao diện người dùng; bảo vệ nguyên vẹn state machine, task runtime và audit logging ở backend; hỗ trợ redirect an toàn nếu truy cập route cũ.
- Top Toolbar trực quan: Back to Projects, Project Selector, Workflow Name & Version, Status Badge (Draft/Published/Active), Mode Switcher (Design vs Execution Monitor), Auto Layout (Horizontal/Vertical), Fit View, Undo/Redo, Validate, Save Draft, Publish, Activate, Execute (nút hành động chính), Menu More (`...`).
- Left Sidebar — Workflow Library: danh sách workflow của dự án, tìm kiếm, tạo mới, nhân bản, đổi tên, xem lịch sử phiên bản, chuyển đổi Active Workflow (chỉ 1 workflow Active cho 1 dự án tại một thời điểm).
- Center Canvas: tối đa hóa diện tích, auto-fit ở zoom đọc được, Pan/Zoom/Snap-to-Grid, Node search, Minimap thu gọn, Fullscreen, Canvas Sticky Notes, Visual Group Sections (Planning, Design, Production, Quality, Delivery).
- Premium Workflow Nodes (260–280px width): Header (icon, name, type badge, status indicator), Body (description, assigned agent avatar/name/role, step ID, inputs/outputs), Footer (status, duration, approval gate, validator). Hỗ trợ các node types: Start, Agent Task, Decision, Approval Gate, Parallel Branch/Join, End.
- Smart Transition Editor: Kéo từ handle A sang B để tạo connection; click transition để mở Inspector; đổi điểm đầu/cuối, xóa transition; orthogonal/smooth routing; nhãn chuyển bước dạng pill; thuộc tính transition (Name, ID, Source, Target, Condition/Trigger, Priority, Retry, Guard); static validation (phát hiện dangling edge, cycle không có điều kiện dừng, unreachable node).
- Auto Layout Engine chuyên nghiệp dựa trên ELK.js, hỗ trợ Horizontal (trái sang phải) và Vertical (trên xuống dưới), undoable.
- Execution Monitor trong cùng Studio: highlight node đang chạy, hoàn thành, lỗi, chờ duyệt; tự động focus node đang chạy; xem log, duration, inputs/outputs, ảnh render Cycles thật và duyệt/từ chối tại Inspector mà không cần trang Task Lifecycle riêng.
- Bảo toàn 100% các node ID, agent capabilities, published v5 và draft v6 hiện có.

## 3. Phạm vi

### In scope

1. **Frontend Architecture & Components (`paperclip/ui`)**:
   - `AtelierWorkflowStudio.tsx`: Thay thế/nâng cấp `AtelierWorkflowBuilder.tsx` thành Studio 2.0 toàn diện.
   - `workflow-graph/nodes/PremiumWorkflowNode.tsx`: Node component cao cấp với đầy đủ thứ bậc (Header, Body, Footer, Agent avatar/name/role, Inputs/Outputs, Status accents).
   - `workflow-graph/nodes/CanvasStickyNote.tsx`: Ghi chú sticky note trực tiếp trên canvas.
   - `workflow-graph/edges/SmartTransitionEdge.tsx`: Transition edge với smart routing, bo góc, transition label pill, note indicator, click handler để inspect.
   - `workflow-graph/panels/StudioTopToolbar.tsx`: Top toolbar chuẩn Jira-inspired/ATELIER-branded.
   - `workflow-graph/panels/WorkflowLibrarySidebar.tsx`: Sidebar quản lý danh sách workflows của project (Active, Published, Draft).
   - `workflow-graph/panels/StudioInspector.tsx`: Inspector bên phải hỗ trợ 4 chế độ: Node Inspector, Transition Inspector, Canvas Note Inspector, Workflow/Project Overview.
   - `workflow-graph/layout.ts`: Nâng cấp ELK.js layout hỗ trợ Horizontal & Vertical layout, auto arrange và group frames.
   - `workflow-graph/types.ts`: Bổ sung schemas cho CanvasNotes, TransitionMetadata, GroupSections, LayoutDirection, ActiveWorkflow.
   - Bỏ tab Task Lifecycle khỏi UI; thêm redirect an toàn khi query param `diagram=lifecycle` được gọi.
2. **Backend API & Orchestration (`paperclip/server`)**:
   - Mở rộng API workflow definitions trong `atelier-bridge.ts`:
     - Hỗ trợ metadata lưu canvas notes, transition properties, group sections.
     - Hỗ trợ workflow activation endpoint: `POST /api/atelier/workflow/projects/:projectId/activate` để kích hoạt 1 workflow duy nhất cho project.
     - Kiểm tra trạng thái thực thi hiện tại trước khi switch active workflow hoặc bắt đầu execution mới (tránh duplicate runs).
     - Đảm bảo route `/api/atelier/workflow/run` và test-run thực thi an toàn và trả về trace chuẩn.
3. **Bảo tồn tính tương thích**:
   - Bảo toàn v5 (`published`), draft v6, bảng `workflows`, `atelier_workflow_runs`, `issues`.
   - Giữ nguyên toàn bộ 9 agent DB rows và DEFAULT_CAPABILITIES.

### Out of scope

- Không tạo workflow engine độc lập thứ hai; tái sử dụng backend Paperclip/Atelier engine.
- Không xóa bất kỳ dữ liệu lịch sử nào trong database.
- Không thay đổi thiết kế ngoài màn hình Workflow (giữ nguyên Studio Viewport 3D, chat panel, v.v.).

## 4. Dependency và tài nguyên cần bảo vệ

- Bảng PostgreSQL: `workflows` (v1–v5 giữ nguyên, v6 draft), `atelier_workflow_runs`, `atelier_workflow_stage_executions`, `issues`, `agents`, `projects`.
- Server ports: Paperclip server `3100`, Vite UI `5173`, FastAPI `8000`.
- Dirty files hiện có trong repo: không được làm mất các file đang modified hoặc untracked liên quan đến FurniMesh hay scene asset bridge.

## 5. Thiết kế và kế hoạch triển khai

1. **Phase 1: Schemas & Types Expansion**:
   - Cập nhật `paperclip/ui/src/features/atelier/workflow-graph/types.ts` bổ sung `CanvasNote`, `TransitionMetadata`, `WorkflowGroupSection`, `LayoutDirection`, `ProjectWorkflowMeta`.
2. **Phase 2: Custom Components & Transition Engine**:
   - Tạo `PremiumWorkflowNode.tsx` (Start, Agent Task, Decision, Approval Gate, Parallel Branch/Join, End).
   - Tạo `CanvasStickyNote.tsx` (Sticky note tương tác).
   - Cập nhật `SmartTransitionEdge.tsx` / `OrthogonalEdge.tsx` với label pill, hover effect, note indicator, click-to-inspect.
   - Cập nhật `layout.ts` hỗ trợ Horizontal và Vertical direction qua ELK.
3. **Phase 3: Studio Panels & UI**:
   - `StudioTopToolbar.tsx`: Navigation, selector, modes, auto-layout, undo/redo, actions (Validate, Save, Publish, Activate, Execute, More menu).
   - `WorkflowLibrarySidebar.tsx`: Danh sách workflow của project, tìm kiếm, tạo mới, chọn, đổi tên, activate.
   - `StudioInspector.tsx`: Tích hợp Node / Transition / Note / Workflow inspector vào một panel mượt mà.
4. **Phase 4: Workflow Studio Orchestration**:
   - Refactor `AtelierWorkflowBuilder.tsx` để tích hợp toàn bộ các components mới, loại bỏ Task Lifecycle tab, hỗ trợ context menu, keyboard shortcuts, canvas search, focus mode, auto-focus running node.
   - Cập nhật `AtelierWorkflowMonitor.tsx` và `AtelierPages.tsx` để route sang Studio 2.0.
5. **Phase 5: Backend API Enhancements**:
   - Cập nhật `paperclip/server/src/routes/atelier-bridge.ts` và `atelier-workflow-builder.ts` để lưu canvas notes, transition metadata và hỗ trợ project active workflow lock & activation endpoint.
6. **Phase 6: Verification & Test**:
   - Build UI bằng Vite (`vite build`).
   - Run typecheck & unit tests.
   - Xác minh toàn bộ 10 acceptance criteria.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-130-atelier-workflow-studio-2.md` | Tạo mới | Feature contract bắt buộc |
| `paperclip/ui/src/features/atelier/workflow-graph/types.ts` | Mở rộng | Thêm schemas cho nodes, transitions, notes, groups, project workflows |
| `paperclip/ui/src/features/atelier/workflow-graph/layout.ts` | Mở rộng | Hỗ trợ ELK horizontal & vertical layout, auto-arrange |
| `paperclip/ui/src/features/atelier/workflow-graph/OrthogonalEdge.tsx` | Nâng cấp | Smart transition edge, interactive pill, note indicator |
| `paperclip/ui/src/features/atelier/workflow-graph/PremiumWorkflowNode.tsx` | Tạo mới | Node component cao cấp, anatomy chuẩn Jira/ATELIER |
| `paperclip/ui/src/features/atelier/workflow-graph/CanvasStickyNote.tsx` | Tạo mới | Ghi chú trực tiếp trên canvas |
| `paperclip/ui/src/features/atelier/workflow-graph/StudioTopToolbar.tsx` | Tạo mới | Toolbar chuẩn Jira-inspired, ATELIER-branded |
| `paperclip/ui/src/features/atelier/workflow-graph/WorkflowLibrarySidebar.tsx` | Tạo mới | Left sidebar quản lý workflows của dự án |
| `paperclip/ui/src/features/atelier/workflow-graph/StudioInspector.tsx` | Tạo mới | Panel bên phải inspect Node, Transition, Note, Overview |
| `paperclip/ui/src/features/atelier/AtelierWorkflowBuilder.tsx` | Refactor lớn | Tích hợp thành Visual Workflow Studio 2.0, loại bỏ Task Lifecycle |
| `paperclip/ui/src/features/atelier/AtelierWorkflowMonitor.tsx` | Đồng bộ | Đồng bộ hóa monitoring với Studio 2.0 |
| `paperclip/server/src/services/atelier-workflow-builder.ts` | Mở rộng | Hỗ trợ notes, transition metadata, active workflow state |
| `paperclip/server/src/routes/atelier-bridge.ts` | Bổ sung | Endpoint activate workflow cho project, concurrency lock |
| `paperclip/server/src/__tests__/atelier-workflow-builder.test.ts` | Bổ sung | Unit test cho validation, activation, transitions |

## 7. Acceptance criteria

- [x] AC-01: Tab "Task Lifecycle" bị loại bỏ hoàn toàn khỏi giao diện Workflow; không tạo trang Task Lifecycle riêng; route `/workflows?diagram=lifecycle` redirect về studio an toàn; backend task status và state machine được bảo toàn nguyên vẹn.
- [x] AC-02: Top Toolbar hiển thị rõ ràng: Back to Projects, Project Selector, Workflow Name, Version, Status badge (Draft/Published/Active), Design vs Execution switch, Auto Layout, Fit View, Undo, Redo, Validate, Save Draft, Publish, Activate, Execute, cùng More menu cho các hành động phụ.
- [x] AC-03: Phân biệt rõ ràng giữa ba hành động: Publish (chốt phiên bản draft thành bất biến), Activate (chọn workflow cho project), Execute (thực thi workflow trên project).
- [x] AC-04: Left Sidebar hiển thị danh mục Project Workflows với các trạng thái Active, Published, Draft; hỗ trợ tạo mới, tìm kiếm, chọn, đổi tên, nhân bản, xem lịch sử và kích hoạt cho project; áp dụng quy tắc duy nhất 1 Active Workflow cho 1 dự án.
- [x] AC-05: Canvas chiếm trọn diện tích màn hình; lúc mở tự động căn chỉnh sơ đồ ở zoom thoải mái, dễ đọc (không bị thu nhỏ li ti giữa màn hình trống); hỗ trợ zoom/pan, fit view, center selection, node search, snap to grid, minimap thu gọn, fullscreen.
- [x] AC-06: Hệ thống Custom Nodes cao cấp (260–280px width) với Header (icon, name, type, status), Body (description, agent avatar/name/role, step ID, inputs/outputs), Footer (status, duration, gate); phân biệt rõ Start, Agent Task, Decision, Approval, Parallel Branch/Join, End; màu trạng thái tinh tế.
- [x] AC-07: Smart Transition Editor: Kéo thả tạo connection giữa các handle, click transition để mở Inspector, hiển thị nhãn transition dạng pill nhỏ trên đường nối (Start, Approved, Rejected, Retry...), smart orthogonal routing bo góc, không che node label; Inspector cho phép chỉnh sửa trigger, condition, guard, priority, retry rule.
- [x] AC-08: Transition Validation: Kiểm tra lỗi dangling edge, node không thể truy cập, cycle không có điều kiện dừng, missing end node, duplicate transition.
- [x] AC-09: Ghi chú trực quan: Hỗ trợ ghi chú trong Node (Node notes Markdown), ghi chú trên Transition (indicator trên edge), ghi chú trên Canvas (Sticky notes đổi màu được), và khung phân vùng Group Sections (Planning, Design, Production, Quality, Delivery).
- [x] AC-10: Execution Monitor tích hợp trong Studio: Chuyển đổi mượt mà giữa Design Mode và Execution Mode; tự động focus vào node đang chạy; Inspector hiển thị đầy đủ thông tin agent, log, duration, input/output, ảnh render Blender Cycles thật và nút duyệt/từ chối của cổng NGƯỜI DUYỆT.
- [x] AC-11: Toàn bộ 10–11 bước hiện tại của Atelier (Chief Intake, Floor Plan, Geometry, Style, Furniture, Rendering, Research, QA, Cost/BOM, Final Review, Export) được bảo toàn nguyên vẹn node ID, roles và tương thích ngược với v5 published và v6 draft.
- [x] AC-12: Vite build và TypeScript build thành công không có lỗi.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Vite UI Build | `cd paperclip/ui; npx vite build` | Build thành công (Exit 0), không lỗi TS/bundle |
| Unit Tests Server | `pnpm --filter @paperclipai/server test src/__tests__/atelier-workflow-builder.test.ts` | Toàn bộ tests pass |
| Task Lifecycle Removal & Redirect | Code inspection & UI render | Không còn tab Task Lifecycle, query diagram=lifecycle mở Studio an toàn |
| Node & Transition Anatomy | Component review | Node rộng 260-280px, Transition có label pill và mở Inspector khi click |
| Active Workflow Concurrency | Backend route test & state check | Chỉ 1 workflow Active cho 1 project, cấm execute trùng lặp |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Xóa nhầm state machine backend khi gỡ tab Task Lifecycle | Giữ nguyên toàn bộ `stateMachine` trong schema, giữ `ISSUE_STATUSES` và logic runtime trong server |
| Graph lớn bị lag khi render | Sử dụng React memo, hạn chế re-render canvas khi edit notes/inspectors, snap to grid tối ưu |
| Xung đột versioning với v5 | Giữ v5 nguyên vẹn, các thao tác edit luôn tạo hoặc sửa trên draft |

Rollback point: `git checkout 707cf5f56398d53386c93de3a1743c7bf1563d18`

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Principal Product Designer & Full-stack Architect
- Thời điểm: 2026-11-19T20:47:00+07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Initial frozen version | Yêu cầu master prompt Atelier Studio 2.0 | Toàn bộ scope | User | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-19T20:47:00+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | Khởi tạo feature contract FROZEN | Bắt đầu triển khai |
| 2026-11-19T20:53:00+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | Triển khai Types, ELK Layout 270x132, PremiumWorkflowNode, CanvasStickyNote, OrthogonalEdge | Hoàn thành custom node, smart edge, sticky notes |
| 2026-11-19T20:57:00+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | Triển khai StudioTopToolbar, WorkflowLibrarySidebar, StudioInspector, Refactor AtelierWorkflowBuilder | Loại bỏ Task Lifecycle tab, hỗ trợ studio modes & execution focus |
| 2026-11-19T20:59:00+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | Bổ sung API activate/run/concurrency lock & guarded retry validation | Server tests & Vite build thành công |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-19T21:00:16+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | `cd paperclip/ui; npx vite build` | PASS (Exit code 0) | `8337 modules transformed. dist/assets/AtelierPages-DNf2XWCJ.js (301.32 kB) built in 22.64s` |
| 2026-11-19T21:01:23+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | `cd paperclip/server; npx vitest run src/__tests__/atelier-workflow-builder.test.ts` | PASS (Exit code 0) | `6 passed (6) in 25ms` bao gồm cycle guard test, duplicate edge test |
| 2026-11-19T21:01:33+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | `cd paperclip; npx vitest run ui/src/features/atelier/workflow-graph/layout.test.ts` | PASS (Exit code 0) | `1 passed (1) in 181ms` kiểm tra auto-layout ELK |
| 2026-11-19T21:01:42+07:00 | `707cf5f56398d53386c93de3a1743c7bf1563d18` | `cd paperclip; npx vitest run ui/src/lib/workflow-sort.test.ts` | PASS (Exit code 0) | `11 passed (11) in 10ms` |

## 14. Kết quả và đóng chức năng

- Kết quả: Hoàn thành toàn diện Atelier Workflow Studio 2.0 theo Master Prompt.
- Hạn chế còn lại: Không có.
- Việc chưa hoàn tất: Không có.
- Rollback point: `707cf5f56398d53386c93de3a1743c7bf1563d18`
- Trạng thái `CLOSED` bởi: Principal Product Designer & Full-stack Architect
- Thời điểm: 2026-11-19T21:02:00+07:00
