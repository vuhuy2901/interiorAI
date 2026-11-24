# [FEAT-2026-131] Cô lập dự án nội thất theo từng task (New task = dự án mới)

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.1 |
| Owner | Claude agent (bug fix) |
| Người chấp thuận | Người dùng (yêu cầu sửa lỗi) |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 (trước khi sửa code) |
| Revision bắt đầu | Không có git; backup `scratch/backup-new-task-isolation/` |
| Revision cuối | Xem mục 13 (SHA-256) |

## 1. Bối cảnh và Root cause

Lỗi: bấm "New task" nhưng task mới dùng ngữ cảnh dự án cũ. Bằng chứng (đã đọc code):

| # | Nghi vấn | Kết luận | Bằng chứng |
|---|---|---|---|
| 1 | Fallback về dự án đầu danh sách | ĐÚNG (nguyên nhân gốc chính) | `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` `refreshProjectBundle`: khi `pid` rỗng thì lấy `nextProjects[0].project_id` rồi `setActiveProjectId`. Task/hội thoại không hề đặt `activeProjectId`, nên sidecar `ConversationAtelierSidecar` (render trong `pages/AgentChat.tsx`) luôn hiển thị dự án đầu danh sách hoặc dự án vừa mở. |
| 2 | Khóa liên kết theo project thay vì theo task | ĐÚNG | `apps/api/app/db.py` `initialize_native_project_link` chỉ khóa theo `native_project_id` và KHÔNG tạo scene; không có bảng nào nối issue/task với scene (chỉ `atelier_scene_links` scene->native project). Mọi issue trong cùng Paperclip project dùng chung. |
| 3 | `activeProjectId` không reset khi đổi task | ĐÚNG | `AtelierStudioContext.tsx` `useState("")` một lần cho cả app; chỉ `Project3DStudioTab` đặt khi vào trang project; không có effect reset khi đổi issue; `project`, `chatHistory`, `estimate` giữ giá trị cũ tới khi fetch xong (lóe dữ liệu cũ; response muộn của project trước có thể ghi đè). |
| 4 | Cache key thiếu project_id | MỘT PHẦN | react-query của `Project3DStudioTab.tsx:91` đã có `projectId` trong key; dữ liệu studio nằm trong `useState` của context (không phải react-query) nên không có key và bị giữ qua điều hướng. |
| 5 | Agent native nhận handoff/decision của run cũ | SAI | `apps/api/app/services/agent_orchestrator_engine.py:72-90` đọc handoff chỉ ở `data/runs/{run_id}/handoffs` theo `run_id`; `decision_context` (dòng ~378) chỉ lấy decisions của run hiện tại; tiêu đề task native chứa run_id (`paperclip_task_adapter.py:119`). |
| 6 | Session adapter resume mang lịch sử cũ | SAI | `paperclip/server/src/services/heartbeat/run-preparation.ts:1555-1563` `taskKey` suy ra từ issueId/taskId: session theo issue, không theo project. |
| 7 | Telegram nhớ dự án cũ | SAI (có chủ đích) | `services/atelier-telegram/project-context.ts` `chooseTelegramProject`: chỉ dùng lựa chọn rõ ràng của chat hoặc khi công ty có đúng 1 project, nếu không thì lỗi; không fallback demo. |
| (phụ) | Dự án mới nhân bản từ demo | ĐÚNG | `apps/api/app/main.py` `api_create_project` clone `build_default_demo_project()` (sofa, bàn trà, kệ TV, ghế, vật liệu, `scale_calibrated=True` mặc định): dự án "mới" mang đồ demo. |
| (phụ) | Dự án demo cứng ở bridge | ĐÚNG nhưng chỉ bootstrap | `paperclip/server/src/routes/atelier-bridge.ts:742,958,2260` (`proj_demo_4x5m`, đồng bộ chat vào MỘT conversation cố định `boot.conversationIssueId`) cho các route `/atelier/*` cũ: không đổi lần này, ghi nhận là hạn chế. |

Gốc: ngữ cảnh "dự án nội thất" (scene) là trạng thái toàn cục của UI, không phải thuộc tính của task; backend không có khái niệm "scene của task".

## 2. Mục tiêu

Mỗi task (issue Paperclip) có đúng một scene canonical riêng, tạo idempotent, sạch; UI luôn dùng scene của task đang mở, không bao giờ mượn dự án khác.

## 3. Phạm vi

### In scope

- Bảng `issue_scene_links` + hàm DB + endpoint `POST/GET /api/v1/issues/{issue_id}/scene`.
- Scene sạch cho task mới (brief mặc định `DesignBrief()` Modern, revision 1, không đồ, không override màu, không chat/question/decision/run).
- Tùy chọn tường minh `continue_scene_id` để task tiếp tục dự án cũ (mặc định: dự án mới).
- Route bridge Paperclip `POST/GET /issues/:issueId/atelier/scene` (kiểm tra quyền công ty, link native project nếu đã khởi tạo).
- UI: provider có `bindIssue`; reset sạch khi đổi task; chặn response cũ; không fallback danh sách khi đang gắn task; sidecar hội thoại gắn theo issue, hiển thị "đang tạo dự án"/lỗi.

### Out of scope

- Đổi approval gate, scale gate, port, credential; xóa/sửa dự án có sẵn; dự án ẩn giữ nguyên.
- Render Codex AI (agent khác). Dòng include router trong `main.py`.
- Trang `/design-studio` độc lập (chọn dự án bằng select rõ ràng) vẫn mặc định dự án đầu danh sách khi KHÔNG có task: ghi nhận hạn chế.
- Thêm ô chọn "Tiếp tục dự án" vào `NewIssueDialog`: API hỗ trợ sẵn, UI chỉ đề xuất.

## 4. Dependency và tài nguyên cần bảo vệ

- DB thật `data/atelier.db`: chỉ thêm bảng mới bằng `CREATE TABLE IF NOT EXISTS`; test dùng DB tạm.
- Không đụng `render_brief.py`, `codex_render.py`, nhánh `render_gen`, `AtelierPhotorealRenderPage.tsx`, `photorealRender.ts`, dòng include router.

## 5. Thiết kế và kế hoạch triển khai

1. `issue_scene_links(issue_id PK, company_id, scene_id, native_project_id, origin 'new'|'continued', created_at)`.
2. `ensure_issue_scene`: nếu đã có link thì trả link (idempotent); nếu không thì tạo scene sạch (hoặc dùng `continue_scene_id` nếu tồn tại), link, và nếu có `native_project_id` đã `ready` cùng company thì ghi `atelier_scene_links`.
3. Endpoint khóa theo issue (lock asyncio) tránh tạo trùng khi gọi đồng thời.
4. GET trả 404 khi chưa có link (không fallback).
5. UI: `bindIssue(issueId)` đặt `activeProjectId=""`, xóa state, trạng thái `resolving`, gọi bridge ensure, đặt `activeProjectId` = scene của task.

## 6. File/component dự kiến thay đổi

| File | Loại | Lý do |
|---|---|---|
| `apps/api/app/db.py` | thêm bảng + hàm | link task-scene, scene sạch |
| `apps/api/app/main.py` | thêm endpoint | ensure/get |
| `paperclip/server/src/routes/atelier-bridge.ts` | thêm route | proxy có kiểm quyền |
| `paperclip/ui/src/api/atelier.ts` | thêm hàm | gọi bridge |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | sửa | bind/reset/guard |
| `ConversationAtelierSidecar.tsx`, `pages/AgentChat.tsx` | sửa | gắn issue |
| `tests/test_new_task_project_isolation.py`, test UI | mới | verify |

## 7. Acceptance criteria

- [ ] AC-01: 2 task mới ra 2 scene khác nhau, revision 1, brief mặc định Modern, không đồ/chat/câu hỏi/decision/run dùng chung.
- [ ] AC-02: gọi lại ensure cùng task trả cùng scene, không tạo trùng.
- [ ] AC-03: GET task chưa link trả 404, không demo.
- [ ] AC-04: mở lại task cũ trả đúng scene cũ.
- [ ] AC-05: `continue_scene_id` cho task tiếp tục dự án chọn; scene không tồn tại thì 404.
- [ ] AC-06: UI reset khi đổi task, không fallback danh sách khi đang gắn task, bỏ response cũ.
- [ ] AC-07: dự án ẩn, dự án có sẵn không bị đổi; test cũ liên quan vẫn pass.

## 8. Verification plan

Pytest DB tạm; vitest cho logic UI; các test liệt kê trong yêu cầu; `npm run typecheck` UI; server typecheck chỉ báo lỗi mới.

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Task cũ chưa link bị tạo scene mới rỗng khi mở | Chấp nhận: tốt hơn mượn dự án khác; có `continue_scene_id` |
| Backend chưa restart | Ghi chú restart port 8000 và Paperclip server |

Rollback: khôi phục file từ `scratch/backup-new-task-isolation/`; bảng mới vô hại nếu để lại.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude agent, 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-1 | 2026-11-18 | (1) Ô "Tiếp tục dự án" trong `NewIssueDialog` (chỉ khi assignee là Chief Architect), truyền `continueSceneId`; (2) tạo scene ngay sau khi UI tạo issue atelier (fire-and-forget, lỗi không chặn tạo task); (3) task cũ chưa link: sidecar GET (không POST), hiện "Tạo dự án mới" / "Gắn dự án có sẵn…"; (4) `/design-studio` độc lập nhớ dự án đã chọn (localStorage, try/catch), dự án ẩn/mất/chưa chọn thì hiện màn chọn, bỏ `projects[0]`; (5) bridge cũ `/atelier/*` bỏ fallback demo/conversation cố định (pin demo, ide-bridge/reply fallback, mirror chat vào conversation cố định), thiếu thông tin thì 4xx tiếng Việt | Hoàn tất các hạn chế đã ghi ở mục 14 và non-goal "ô Tiếp tục dự án" | File thêm: `taskProjectScope.ts`, `AtelierStudioContext.tsx`, `AtelierDesignStudioPage.tsx` (chỉ phần chọn dự án), `ConversationAtelierSidecar.tsx`, `NewIssueDialog.tsx` (thêm state/field), `api/atelier.ts`, `atelier-bridge.ts`; mới: `AtelierProjectPicker.tsx`; test mới. Không đổi approval/scale gate, port, credential; không đụng dữ liệu có sẵn | Người dùng (yêu cầu trực tiếp) | 1.1 |

## 12. Implementation log

Xem mục 13.

## 13. Verification evidence

| Thoi diem | Revision | Kiem tra | Ket qua | Evidence |
|---|---|---|---|---|
| 2026-11-18 | no-git | `pytest tests/test_new_task_project_isolation.py` (DB tam) | PASS 7/7 | AC-01..05, AC-07 |
| 2026-11-18 | no-git | `pytest` multi_agent_group_chat, project_visibility, modern_default_finish_questions, workflow_input_sync, eight_agent_workflow | 70 PASS, 1 FAIL co san: `test_eight_agent_workflow` assert `DEFAULT_WORKFLOW["version"] == 3` nhung la 4 (do FEAT-130 cua agent khac, khong lien quan) | |
| 2026-11-18 | no-git | `vitest taskProjectScope.test.ts` (UI) | PASS 8/8 | AC-06 |
| 2026-11-18 | no-git | `vitest` server project-context + telegram-project-selection(+route) | PASS 22/22 | nghi van 7 |
| 2026-11-18 | no-git | `npm run typecheck` UI | 3 loi co san ngoai pham vi (AtelierOfficeSimulationPage, ProjectCompletionCard cua agent render); file cua FEAT-131 sach | |
| 2026-11-18 | no-git | `tsc --noEmit` server | 298 loi co san (rootDir/plugin-sdk), khong co loi moi o atelier-bridge.ts | |
| 2026-11-18 | no-git | UI that (5173) | CHUA verify: UI 5173 khong chay; API 8000 chay nhung chua restart nen chua co endpoint moi | |

SHA-256 cuoi:

```
bac2dacf28ea319ef484acc9de30013315e431972928bc854a7d0af671b5e853 apps/api/app/db.py
85d47d690112064309b3fcb21e9d14c6e74bc30a09aecf173ca97c2046f0afdd apps/api/app/main.py
8b5c17563558da273cc7daab43e2593cbc4a7878cb5824f051e619cf19939905 paperclip/server/src/routes/atelier-bridge.ts
c2ae85fa92fa7a26a0137125f1b5f8e52ae9b5486d0facbe9580578b43a0b59f paperclip/ui/src/api/atelier.ts
dc8b83904ef3181d4b29334bf1e43b680c1876d37ef7a4f4aeee35905ec8c324 paperclip/ui/src/pages/AgentChat.tsx
9b134244a0d745d0eab235da41bbd8840817a74fcee4b257ab0ec5353a910007 paperclip/ui/src/features/atelier/AtelierStudioContext.tsx
3790e9296d533d4dfe972ae7852838a38ec824f0df24b1f913e392c89b8eff96 paperclip/ui/src/features/atelier/ConversationAtelierSidecar.tsx
b6d459eda81acbf34d85457572897363a3c4ac41c011d3a30515ca843d62bd94 paperclip/ui/src/features/atelier/UnifiedBOQPage.tsx
cb5f7b902dc9c0675777b3e761e3af7650d0366e337d168e7d76595b3e41fd83 paperclip/ui/src/features/atelier/taskProjectScope.ts
3dcf1b61d707f72a743010aa2d5c05cc36e61e3c90984076feb2f5c7f7764cca paperclip/ui/src/features/atelier/taskProjectScope.test.ts
b9a66e06f2d7d19cedb1041156a101bc1215581e38432cb1f33023ed9af208d8 tests/test_new_task_project_isolation.py
```

## 14. Kết quả và đóng chức năng

- Kết quả: hoàn tất code + test; chưa CLOSED vì chưa verify bằng UI thật.
- Hạn chế còn lại: `/design-studio` độc lập vẫn mặc định dự án đầu danh sách khi không gắn task; bridge cũ `/atelier/*` còn demo cứng; task cũ chưa link sẽ nhận scene mới rỗng khi mở sidecar; chưa có ô "Tiếp tục dự án" trong NewIssueDialog (API `continueSceneId` đã sẵn).
- Việc chưa hoàn tất: restart API 8000 và Paperclip server, verify UI.
- Rollback point: `scratch/backup-new-task-isolation/`.
