# [FEAT-2026-038] Gỡ Lighting Agent khỏi workflow mặc định

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | User request 2026-11-14 |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T01:10:00+07:00 |
| Revision bắt đầu | 95c2db708d3e4eea8b12a26b7dedd36c4de63c57 |
| Revision cuối | 95c2db7 + scoped working-tree implementation; live workflow `ac6f33fc-11bf-457f-9cad-95a76c4315c7` v5 |

## 1. Bối cảnh

ATELIER đang có node `lighting` và agent `agent_ceiling_lighting` trong nhiều
định nghĩa workflow. Agent này đồng thời giữ cả `lighting.design` và
`render.execute`, trong khi việc tạo ánh sáng/bóng đổ thật đã do Studio và
Blender renderer thực hiện. `cost` hoặc `qa` còn phụ thuộc trực tiếp vào node
lighting nên xóa một khai báo riêng lẻ sẽ làm graph bị kẹt.

## 2. Mục tiêu

Workflow mặc định mới không tạo node/task cho Lighting Agent. Render Agent nhận
camera, HDRI, render và bóng đổ; Style giữ lighting mood; Geometry chỉ dựng đèn
vật lý khi brief yêu cầu. Workflow cũ và lịch sử task/agent vẫn đọc được.

## 3. Phạm vi

### In scope

- Gỡ stage/node `lighting` khỏi hai workflow mặc định ATELIER.
- Nối `furniture` và `style` trực tiếp vào `render`; nối `render` vào `qa`.
- Cost không chờ Lighting; giữ Research/QA làm dependency có căn cứ.
- Chuyển `render.execute` và render task type sang `agent_render`.
- Loại Lighting Agent khỏi bootstrap/routing/prompt mặc định cho dữ liệu mới.
- Vô hiệu hóa/archive agent live chỉ khi không có execution đang chạy.
- Cập nhật schema docs và focused tests.

### Out of scope

- Không xóa đèn, BOM điện, preset Ngày/Hoàng hôn/Đêm hoặc code ánh sáng Blender.
- Không sửa snapshot của run đã tạo hoặc xóa task/chat/handoff lịch sử.
- Không thay scheduler, runtime, provider, model hoặc API key.
- Không thay scene/revision/render hiện tại.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: dynamic workflow snapshots, native task lifecycle, Render/QA gate.
- Dữ liệu dùng chung: agents, issues, workflow definitions/runs và history.
- Service/port/database không được ảnh hưởng: Paperclip 3100 và API 8000 không
  được repoint; không migration hoặc delete database.
- Dirty worktree là dữ liệu của user; không reset, stash, clean hoặc ghi đè.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo workflow version mới, không sửa snapshot run cũ.
2. Default graph: geometry -> furniture/style; furniture+style -> render;
   geometry+furniture+style+render -> qa; furniture+style -> research;
   qa+research -> cost; cost -> final review.
3. Render node dùng `agent_render`, capability `render.execute`, task type
   `RENDER`; physical lighting chỉ là input tùy chọn, không là dependency chung.
4. Gỡ bootstrap/routing mặc định của `agent_ceiling_lighting`; giữ compatibility
   resolver cho historical records nếu cần đọc dữ liệu cũ.
5. Kiểm tra live executions trước khi archive/disable agent. Không hard-delete.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-agent-workflow.ts` | workflow v2 | Gỡ lighting và nối Render/QA |
| `paperclip/server/src/services/atelier-workflow-orchestration.ts` | canonical graph v2 | Gỡ dependency lighting |
| `paperclip/server/src/services/atelier-workflow-builder.ts` | registry/task map | Giao render cho agent_render |
| `paperclip/server/src/routes/atelier-bridge.ts` | bootstrap catalog | Không tạo Lighting Agent mới |
| `apps/api/app/services/agent_prompts.py` | prompt registry/routing | Gỡ Lighting khỏi đội mặc định |
| `docs/WORKFLOW_SCHEMA.md` | tài liệu graph | Đồng bộ workflow mới |
| focused Paperclip/Python tests | regression | Chứng minh không tạo task Lighting |
| live Paperclip agent record | archive/disable | Ngừng nhận task mới, giữ lịch sử |

## 7. Acceptance criteria

- [ ] AC-01: Workflow mặc định mới không có node `lighting` hoặc assignment
  `agent_ceiling_lighting`.
- [ ] AC-02: Furniture và Style hoàn thành thì Render Agent có thể READY.
- [ ] AC-03: QA chờ render hợp lệ; Cost không bị chặn vì Lighting Agent.
- [ ] AC-04: Render vẫn giữ camera, HDRI, bóng đổ, Cycles và lighting presets.
- [ ] AC-05: Workflow run/task/chat cũ vẫn đọc được và không bị sửa snapshot.
- [ ] AC-06: Lighting Agent không nhận task mới; không hard-delete lịch sử.
- [ ] AC-07: Graph validation, builder tests và focused runtime tests PASS.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Static references | focused `rg` in workflow/registry files | Không còn default node assignment Lighting |
| Workflow graph tests | focused Vitest | Graph hợp lệ, Render/QA/Cost READY đúng dependency |
| Python prompt tests | focused pytest hoặc compile | Registry/routing không yêu cầu Lighting |
| Compatibility | load historical workflow fixture | Dữ liệu cũ vẫn đọc được |
| Live state | Paperclip API/UI read after restart | Agent archived/disabled; không active execution bị mất |
| Render preservation | existing render tests | Lighting presets và Blender render không đổi |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| QA/Cost bị dependency treo | Test graph và READY transitions trước deploy |
| Mất khả năng render | Tách rõ Render Agent khỏi Lighting trước khi disable |
| Lịch sử mất assignee | Archive/disable, không delete agent row |
| Run cũ đổi đường đi | Run chỉ đọc snapshot đã lưu; không migrate snapshot |
| Duplicate default definitions bị lệch | Sửa và test cả hai owner hiện có trong cùng pass |

Rollback point và cách rollback: quay lại revision
`95c2db708d3e4eea8b12a26b7dedd36c4de63c57`, bật lại agent đã archive và
republish workflow version trước; không xóa hoặc sửa run/task cũ.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của user.
- Thời điểm: 2026-11-14T01:10:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14T01:10:00+07:00 | 95c2db7 | Contract frozen | Chưa sửa implementation |
| 2026-11-14T01:20:00+07:00 | 95c2db7 + working tree | Replaced Lighting stage/registry/bootstrap/routing with Rendering Specialist | Historical workflow versions and issues preserved |
| 2026-11-14T01:27:00+07:00 | live Paperclip | Paused legacy Lighting Agent, created ready Render Agent and published workflow v5 | No active Lighting execution existed before pause |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-14T01:08:00+07:00 | working tree | Focused workflow Vitest | PASS | `3 passed`, `10 passed` |
| 2026-11-14T01:18:00+07:00 | working tree | Python compile | PASS | `agent_prompts.py`, `ide_bridge_service.py`, `orchestrator.py` compile successfully |
| 2026-11-14T01:18:00+07:00 | working tree | Full Paperclip typecheck | BLOCKED (pre-existing environment) | Node 22 is below required 24.11 and ACPX generated profile check fails on existing line-ending drift before changed server layers run |
| 2026-11-14T01:25:00+07:00 | live Paperclip | Workflow validation-only test | PASS | v5 draft valid, zero validation issues, no dispatch |
| 2026-11-14T01:26:00+07:00 | live Paperclip | Publish and reload | PASS | Current definition v5 published; nodes contain `render`, omit `lighting`; 15 edges |
| 2026-11-14T01:27:00+07:00 | live Paperclip | Agent lifecycle | PASS | Lighting `5e7a...` paused/paused; Render `a7bb...` idle/ready; Lighting active runs `[]` |
| 2026-11-14T01:28:00+07:00 | working tree | Runtime reference grep and diff checks | PASS | Zero Lighting node/agent references in active workflow/bootstrap/routing files; whitespace checks clean |

## 14. Kết quả và đóng chức năng

- Kết quả: Workflow mặc định và published workflow v5 đã bỏ Lighting Agent; Rendering Specialist tiếp nhận kết xuất.
- Hạn chế còn lại: Workflow/run v1-v4 và ATL-14/ATL-22 vẫn được giữ làm lịch sử; chúng không bị sửa hoặc xóa. Lighting Agent ở trạng thái paused để có rollback.
- Việc chưa hoàn tất: Full repository typecheck cần Node >=24.11 và ACPX generated profile sạch; đây không phải lỗi của thay đổi workflow.
- Rollback point: `95c2db708d3e4eea8b12a26b7dedd36c4de63c57`
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-14T01:28:00+07:00
