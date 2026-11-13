# [FEAT-2026-022] Orthogonal workflow visual layout

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier platform |
| Người chấp thuận | User request, 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 12:05 +07:00 |
| Revision bắt đầu | `628d46151f244213059e9882176c739b4b08e8e4` + FEAT-2026-021 working tree |
| Revision cuối | `628d46151` + FEAT-2026-021/022 working tree (chưa commit) |

## 1. Bối cảnh

Workflow Builder hiện dùng vị trí node persisted thủ công và edge mặc định của
React Flow. Graph chưa có layered layout, orthogonal routing, edge inspector,
transition labels đầy đủ hoặc Task Lifecycle view. Node card còn thiếu owner và
trạng thái, canvas dễ tạo bố cục zíc zắc, không đáp ứng reference chuyên nghiệp.

## 2. Mục tiêu

- Pipeline được căn trái sang phải theo dependency thật, không overlap và không
  thay đổi topology.
- Edge được định tuyến vuông góc với nhãn transition đọc được.
- Draft chỉnh được node, edge, dependency và layout rồi save/reload.
- Pipeline Workflow và Task Lifecycle dùng chung visual primitives nhưng dữ
  liệu riêng; lifecycle chỉ phản ánh trạng thái Paperclip thực.
- Published definition, workflow runs, tasks và agent governance không đổi.

## 3. Phạm vi

### In scope

- ELK layered RIGHT/ORTHOGONAL layout và chuyển bend points thành custom edge.
- Node cards 220-260 px với type, task type, owner/role và status semantics.
- Edge selection/inspector cho outcome label; dependency được cập nhật qua
  connection/delete edge trên draft.
- Toolbar đầy đủ, node search, panel collapse, fit view, minimap gọn.
- Pipeline/Task Lifecycle visual modes; lifecycle đọc status/transition thực từ
  Paperclip source, không ghi vào workflow definition.
- UTF-8 text handling, responsive desktop layout, focused tests và evidence.

### Out of scope

- Thay workflow engine, task state machine, agent governance hoặc database schema.
- Tự thêm cycle/backward transition vào canonical DAG.
- Tự migrate run v1/v2 hoặc sửa published workflow.
- Tạo demo graph giả hay hardcode trạng thái lifecycle không tồn tại.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `@xyflow/react`, `elkjs`, Paperclip UI tokens và icons hiện có.
- Dữ liệu: workflow v1/v2, active runs, issues, stage executions, agents.
- Port/service: app `3100`; workflow API FEAT-2026-021 giữ nguyên contract.

## 5. Thiết kế và kế hoạch triển khai

1. Tách graph visual primitives, ELK layout adapter và orthogonal edge renderer.
2. Mở rộng node/edge selection, inspector và draft edit controls.
3. Bổ sung Task Lifecycle từ state model thật.
4. Chuẩn hóa toolbar/panels/node library và execution identifiers.
5. Test topology preservation, layout assertions, typecheck/build và browser.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/package.json` | dependency | Khai báo trực tiếp ELK layout engine |
| `paperclip/ui/src/features/atelier/AtelierWorkflowBuilder.tsx` | UI refactor | Toolbar, modes, edit controls, panels |
| `paperclip/ui/src/features/atelier/workflow-graph/*` | UI/domain mới | ELK adapter, custom edge, node card, lifecycle model |
| focused UI tests | test | Topology/layout/edit assertions |
| `docs/build/*`, contract này | evidence | Audit trail bắt buộc |

## 7. Acceptance criteria

- [x] AC-01: Auto Layout tạo layered RIGHT layout, không overlap và không đổi
  source/target/outcome của edge.
- [x] AC-02: Edge renderer dùng orthogonal segments/bend points; không dùng
  smoothstep làm giải pháp thay thế.
- [x] AC-03: Parallel nodes cùng dependency được bố trí cùng layer; backward
  edges dùng lane ngoài luồng chính nếu lifecycle model có transition quay lại.
- [x] AC-04: Node card đủ lớn và hiển thị name, role/agent, task type, state.
- [x] AC-05: Draft chỉnh được node, edge label/dependency và save/reload; published
  read-only có giải thích và nút Create Draft.
- [x] AC-06: Pipeline và Task Lifecycle là hai model riêng; lifecycle chỉ dùng
  trạng thái/transitions có trong Paperclip source.
- [x] AC-07: Agent governance tests tiếp tục pass; không đổi active run/task data.
- [x] AC-08: UI typecheck/build pass và browser evidence được ghi trung thực.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Layout unit tests | focused Vitest | topology giữ nguyên, không overlap, orthogonal sections |
| Governance regression | existing focused Vitest | pass |
| UI checks | UI typecheck + build | pass |
| Live API | snapshot versions/runs trước sau | published/run/task không đổi ngoài draft test được yêu cầu |
| Browser | Chrome/Playwright nhiều viewport | graph dễ đọc, panels/fit/inspect/edit hoạt động |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| ELK làm mất vị trí thủ công | Chỉ áp dụng khi người dùng bấm Auto Layout; lưu vào draft |
| Edge path không đồng bộ canvas | Dùng sections từ cùng một lần ELK layout |
| Lifecycle gây hiểu nhầm engine | Dẫn xuất từ source constants; read-only visual model |
| Published bị sửa | Giữ backend immutable guard và disable có giải thích |

Rollback: revert riêng FEAT-2026-022 UI/dependency. Definition persisted và
engine FEAT-2026-021 vẫn đọc được vì topology/schema không đổi.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 12:05 +07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-12 12:06-12:35 +07 | `628d46151` + working tree | ELK layout, orthogonal edge, lifecycle, builder UI, tests | Không đổi workflow engine/schema |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-12 12:35 +07 | working tree | Layout Vitest | PASS 1/1 | `docs/build/EVIDENCE/WORKFLOW_VISUAL_REDESIGN_20261112_1215/LAYOUT_ASSERTIONS.md` |
| 2026-11-12 12:35 +07 | working tree | Builder/orchestration Vitest | PASS 6/6 | `docs/build/EVIDENCE/WORKFLOW_VISUAL_REDESIGN_20261112_1215/BROWSER_AND_DATA_VERIFICATION.md` |
| 2026-11-12 12:35 +07 | working tree | UI typecheck + production build | PASS | Cùng evidence directory |
| 2026-11-12 12:34 +07 | working tree | Chrome screenshots + API snapshot | PASS | `pipeline-workflow.png`, `task-lifecycle.png`, verification note |

## 14. Kết quả và đóng chức năng

- Kết quả: Workflow Builder đã có professional left-to-right layered layout,
  custom orthogonal edge, draft inspector và read-only Task Lifecycle view.
- Hạn chế còn lại: Graph dài được fit toàn bộ khi mở lần đầu nên text nhỏ ở
  overview; zoom/pan và panel collapse dùng để đọc chi tiết. ELK tạo chunk lớn
  nhưng build vẫn pass.
- Việc chưa hoàn tất: Không có trong frozen scope.
- Rollback point: `628d46151` + FEAT-2026-021 working tree.
- Trạng thái `CLOSED` bởi: Codex sau verification.
- Thời điểm: 2026-11-12 12:36 +07:00.
