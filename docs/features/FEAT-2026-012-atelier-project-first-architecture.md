# [FEAT-2026-012] ATELIER AI project-first architecture

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex / ATELIER AI |
| Người chấp thuận | User request đính kèm ngày 2026-11-11 |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11T00:48:29+07:00 |
| Revision bắt đầu | Root `c4c17d960016f5e97ab723a9d0d7073a8a990f18`; Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Paperclip đã có Native Project, authorization, project-scoped Issues và idempotent
Project creation. Pascal đang lưu thiết kế trong bảng SQLite `projects`, nhưng mỗi
bản ghi thực chất là một SceneGraph/revision container. Design Studio hiện lấy toàn
bộ các bản ghi này vào một selector toàn cục, nên scene thật, fixture, E2E data và
revision của nhiều thiết kế bị trộn lẫn. Bootstrap ATELIER hiện còn chọn project và
conversation đầu tiên theo heuristic, làm project context không đủ chặt.

Thay đổi này đưa Native Paperclip Project thành nguồn chuẩn, còn dữ liệu Pascal trở
thành Room/Scene/Revision được liên kết bền vững bằng Native Project ID. Mọi dữ liệu
legacy được giữ nguyên; bản ghi chưa xác định provenance đi vào nhóm Unassigned /
Legacy để người dùng liên kết thủ công.

## 2. Mục tiêu

- Một brief nội thất có ý nghĩa tạo đúng một Native Paperclip Project, conversation
  và intake receipt dù request bị retry/reload.
- Project Workspace chỉ truy vấn conversation, task, room, scene, revision và estimate
  thuộc project đang mở; không rò dữ liệu chéo project.
- Design Studio không còn dùng danh sách Pascal toàn cục làm danh sách project.
- Legacy scene/revision được audit và relink mà không sửa payload hoặc mất revision.
- Sidebar và Projects UX đặt Project là entry point chính cho Product Owner.

## 3. Phạm vi

### In scope

- Tái sử dụng Native Paperclip Project/service, company authorization và Issue model.
- Endpoint orchestration project intake từ brief, có idempotency receipt, trạng thái
  khởi tạo từng phần, retry an toàn và project-aware Chief conversation.
- Tên project có thể sửa, được suy ra xác định từ brief thay vì timestamp/chat title.
- Lớp metadata Pascal additive cho native project link, room, scene link và provenance;
  không đổi/xóa bảng scene legacy `projects` hoặc `scene_revisions`.
- API project-scoped cho workspace, scene list, room list, legacy audit và manual relink.
- Project List có create-via-AI, search, status/archive filter, recent sort và list/card
  preference dựa trên dữ liệu thật hiện có.
- Project Workspace có Overview, Design Studio, Conversations, Tasks, Estimate và
  Deliverables/History entry points dựa trên dữ liệu thật; trạng thái thiếu dữ liệu
  được trình bày là chưa có/chưa tính, không dùng số giả.
- Design Studio nhận Native Project ID từ route, chỉ cho chọn scene thuộc project,
  hỗ trợ empty state và hard refresh/direct URL.
- Sidebar đặt Projects cạnh Dashboard và dùng `+ Tạo dự án` làm CTA chính, vẫn giữ
  thao tác tạo Task trong Tasks.
- Tests cho idempotency, retry partial initialization, access boundary, project-scoped
  scene queries, multiple projects/rooms, legacy preservation và UI routing.
- Browser evidence tại `http://localhost:3100` nếu runtime khả dụng.

### Out of scope

- Không xây ATELIER standalone, iframe hoặc Project API/entity thứ hai.
- Không tự chạy hàng loạt AI agents/model calls, không tự sinh task giả.
- Không tự suy đoán liên kết legacy theo tên và không xóa fixture/trùng tên.
- Không tái thiết kế toàn bộ Paperclip core hoặc thay thế design system/icon library.
- Không tạo Room/Scene rỗng cho project mới khi brief/intake chưa yêu cầu thiết kế.
- Không thay đổi sâu engine hình học, camera, catalog hoặc thuật toán BOQ ngoài việc
  buộc các truy vấn hiện có theo project context.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Native `projects`, `issues`, `issue_comments`, activity log và project
  authorization của Paperclip; Pascal FastAPI/SQLite; ATELIER bridge; React Router.
- Dữ liệu dùng chung: mọi Native Project/Issue hiện có; Pascal `projects`,
  `scene_revisions`, chat, proposal, workflow run, asset/export và estimate hiện có.
- Service/port/database không được ảnh hưởng: Paperclip `localhost:3100`, Pascal
  sidecar `127.0.0.1:8000`, PGlite database và SQLite hiện tại.
- Không ghi đè các thay đổi chưa commit có sẵn trong root hoặc submodule Paperclip.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm Pascal metadata schema additive (`native_project_links`, `atelier_rooms`,
   `atelier_scene_links`) với unique/foreign-key constraints nội bộ và audit query.
2. Thêm Pascal service/routes khởi tạo link, list workspace theo Native Project ID,
   tạo room khi có yêu cầu và relink scene legacy theo thao tác rõ ràng.
3. Thêm Paperclip orchestration route dùng `projectService`/Issue persistence và
   activity-log receipt để tạo Native Project + Chief conversation; Pascal init chạy
   như bước recoverable và retry không tạo project mới.
4. Truyền company/project/conversation/active room/scene/revision/brief vào bridge chat
   context; kiểm tra quyền ở server trước mọi project-scoped operation.
5. Mở rộng API client và routing UI; nâng Project List, sidebar CTA và Project Workspace.
6. Chuyển Design Studio sang Native Project route + project-scoped scene selector;
   không tải scene toàn cục khi ở workspace.
7. Thêm unit/integration/UI tests, chạy typecheck/token gates/build và browser smoke;
   lưu screenshot/evidence trong thư mục evidence của feature.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Additive schema/query | Lưu link Native Project–Room–Scene và audit legacy |
| `apps/api/app/models/contracts.py` | Contract | DTO project workspace/link/audit |
| `apps/api/app/main.py` | API | Project-scoped workspace, room, relink, audit endpoints |
| `tests/` Pascal API/DB tests | Test | Isolation, preservation, relink |
| `paperclip/server/src/routes/atelier-bridge.ts` | Orchestration/API | Intake idempotency, authorization, project context, proxy |
| Paperclip route tests | Test | Retry/access/context guarantees |
| `paperclip/ui/src/api/atelier.ts` (new) | Client | Typed intake/workspace APIs |
| `paperclip/ui/src/components/DesignSidebar.tsx` | Navigation | Project-first CTA/order |
| `paperclip/ui/src/pages/Projects.tsx` và toolbar | UX | Professional filters/view/create-via-AI |
| `paperclip/ui/src/pages/ProjectDetail.tsx` | Workspace | ATELIER tabs/actions and real summaries |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | State/data | Native Project route and scoped scene loading |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | UX | Project/room/scene selector and empty states |
| `paperclip/ui/src/App.tsx` | Route | Direct project workspace/design URLs |
| UI tests/CSS token layer | Test/style | Responsive states, token compliance |
| `docs/build/EVIDENCE/FEAT-2026-012/` | Evidence | Screenshots, audit and command results |

## 7. Acceptance criteria

- [ ] AC-01: Sidebar hiển thị Projects gần Dashboard và CTA chính `+ Tạo dự án`.
- [ ] AC-02: Project List hỗ trợ search, status/archive filter, recent sort và list/card view.
- [ ] AC-03: Brief có ý nghĩa tạo đúng một Native Paperclip Project và tên từ brief.
- [ ] AC-04: Greeting/brief rỗng không tạo project; project chat hiện hữu không tạo project khác.
- [ ] AC-05: Retry/reload/double-submit cùng idempotency key trả cùng project/conversation.
- [ ] AC-06: Partial Pascal/AI failure được lưu trạng thái và retry không tạo project thứ hai.
- [ ] AC-07: Chief conversation/issue và subsequent messages có đúng Project ID/context.
- [ ] AC-08: Project Workspace có entry points Overview, Design, Conversations, Tasks,
  Estimate và Deliverables/History bằng dữ liệu thật hoặc explicit empty state.
- [ ] AC-09: Một Native Project hỗ trợ nhiều Room, Room hỗ trợ nhiều Scene, Scene giữ revisions.
- [ ] AC-10: Design Studio chỉ liệt kê scene thuộc Native Project đang mở.
- [ ] AC-11: Task/conversation/estimate queries không trả dữ liệu project khác.
- [ ] AC-12: Legacy audit phân loại linked/unassigned/fixture/duplicate-name/unknown provenance.
- [ ] AC-13: Manual relink không sửa payload/assets hoặc mất bất kỳ scene revision nào.
- [ ] AC-14: Direct URL, hard refresh, browser back/forward và chuyển nhiều project giữ context đúng.
- [ ] AC-15: Server-side authorization được áp dụng cho mọi endpoint Native Project-scoped.
- [ ] AC-16: Không có standalone app/iframe/Project entity trùng Native Paperclip Project.
- [ ] AC-17: Focused tests, typecheck, token gates, build và browser smoke được ghi evidence.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Pascal unit/API | `python -m pytest` với focused test paths | Link/isolation/revision preservation pass |
| Paperclip server tests | `pnpm vitest run <focused files>` | Intake idempotency/access/retry pass |
| UI tests | `pnpm vitest run <focused UI files>` | Routes/filter/empty/error states pass |
| Typecheck | focused package typecheck, sau đó `pnpm -r typecheck` nếu khả thi | Không có lỗi mới |
| Token gate | `pnpm check:token-gates` | Không có token violation mới |
| Build | `pnpm build` | Frontend/server build thành công |
| Browser | Test tại `http://localhost:3100` bằng fixtures/mocks | Luồng A–G trọng yếu và hard refresh pass |
| Data audit | API/script audit legacy read-only | Báo cáo đủ nhóm, revision counts không đổi |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Hai database tạo trạng thái dở dang | Durable receipt + explicit init status + idempotent retry |
| Cross-project leakage | Server authorization + project ID filters + multi-project tests |
| Mất/ghi đè legacy scene | Additive tables; không update payload/revision trong migration/relink |
| Bootstrap heuristic gắn sai project | Loại bỏ first-project fallback khỏi project-scoped flows |
| Dirty worktree bị ghi đè | Patch nhỏ, kiểm diff trước/sau, không reset/checkout file người dùng |
| UI quá tải | Reuse design system/tokens, progressive disclosure, explicit empty/loading/error |

Rollback point: root `c4c17d960016f5e97ab723a9d0d7073a8a990f18`, Paperclip
`eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`; rollback bằng cách revert riêng các
patch của FEAT-2026-012. Pascal metadata mới là additive và có thể để nguyên khi
rollback; không drop bảng hoặc xóa link tự động.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của user.
- Thời điểm: 2026-11-11T00:48:29+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11T00:48:29+07:00 | Bắt đầu từ revisions nêu trên | Audit Native Project, Pascal legacy schema, bridge và UI routes | Chưa sửa implementation trước mốc FROZEN |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | | | | |

## 14. Kết quả và đóng chức năng

- Kết quả: Chưa hoàn tất.
- Hạn chế còn lại: Chưa có.
- Việc chưa hoàn tất: Toàn bộ implementation/verification theo scope đã đóng băng.
- Rollback point: Như mục 9.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
