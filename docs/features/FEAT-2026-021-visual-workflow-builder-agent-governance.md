# [FEAT-2026-021] Visual Workflow Builder and strict agent governance

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier platform |
| Người chấp thuận | User request, 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 11:20 +07:00 |
| Revision bắt đầu | `628d46151f244213059e9882176c739b4b08e8e4` + working tree |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Audit tại `docs/WORKFLOW_AUDIT.md` xác nhận workflow v1 đã có persistence và
native task bindings nhưng definition bị hardcode đúng 8 stage, không có draft
editing/publish API, capability policy chưa bảo vệ mọi assignment/admission và
UI chỉ đọc. Người dùng yêu cầu editor thật, versioning bất biến và enforcement
backend trước UI.

## 2. Mục tiêu

- Bảo toàn published v1 và mọi run/task hiện tại.
- Cho phép clone v1 thành v2 draft, sửa/lưu/validate/publish/version history.
- Thực thi capability routing tại backend cho task workflow-bound và admission.
- Cung cấp visual graph editor dùng dữ liệu persisted, không phải mock.
- Đồng bộ node execution với native Paperclip tasks/runs và audit decisions.

## 3. Phạm vi

### In scope

- Versioned definition schema trong JSONB hiện có; validator DAG, node contract,
  roles, capabilities, approvals, artifacts, retries và condition/join integrity.
- Draft clone/update/validate/test/publish/history/restore/import/export APIs.
- Typed Agent Capability projection từ registry hiện có và structured routing decisions.
- Workflow-bound native task assignment/checkout/completion guards.
- Visual builder với xyflow, node library, inspector, undo/redo, save, validate,
  publish, history và execution view.
- Focused backend/UI tests, evidence bundle và acceptance report.

### Out of scope

- Thay thế Paperclip issues, heartbeat runner hoặc generic company workflow subsystem.
- Tự động migrate active v1 run sang v2.
- Xóa task/run/event lịch sử hoặc reset PostgreSQL.
- Tự dispatch production agents trong test run.
- Hỗ trợ expression language tùy ý; condition dùng outcome keys hữu hạn.

## 4. Dependency và tài nguyên cần bảo vệ

- `workflows`, `atelier_workflow_runs`, stage executions/events, `issues`,
  heartbeat runs, agents, activity log.
- `@xyflow/react` đã có trong UI package.
- Port 3100, embedded PostgreSQL 54329 và published v1 bất biến.

## 5. Thiết kế và kế hoạch triển khai

1. Định nghĩa schema/validator và capability registry/policy service.
2. Thêm immutable draft/version lifecycle API.
3. Gắn policy vào task mapping, assignment và execution admission.
4. Nâng project reconcile/run view đọc definition snapshot theo version.
5. Xây visual editor và inspector bằng xyflow.
6. Thêm tests, evidence, build log và acceptance report.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-workflow-*` | Backend domain/policy | Schema, versioning, validation, routing |
| `paperclip/server/src/routes/atelier-bridge.ts` | API | Draft/publish/test/history and policy endpoints |
| `paperclip/server/src/services/issues.ts`, admission path | Guard integration | Enforce workflow-bound tasks server-side |
| `paperclip/ui/src/features/atelier/*` | UI | Visual builder, inspector, execution monitor |
| focused tests and docs/evidence | Verification | Required acceptance proof |

## 7. Acceptance criteria

- [ ] AC-01: v1 remains published and byte-equivalent; v2 draft can clone/save/reload.
- [ ] AC-02: published rows are immutable; publish requires zero validator errors.
- [ ] AC-03: validator rejects cycles, missing start/end, invalid role/agent,
  incomplete conditions/joins/approvals, unbounded retry and missing artifacts.
- [ ] AC-04: incompatible or disabled agent assignment is rejected server-side
  with structured reason and eligible alternatives.
- [ ] AC-05: workflow-bound checkout/execution cannot bypass version,
  dependency, approval or capability checks.
- [ ] AC-06: completion requires persisted output evidence matching node contract.
- [ ] AC-07: visual editor persists node/edge/inspector edits and supports undo/redo.
- [ ] AC-08: project runs stay pinned to their definition version; no automatic migration.
- [ ] AC-09: focused backend/UI tests, typecheck/build and browser verification are recorded honestly.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Domain tests | focused Vitest files | Validator/version/routing tests pass |
| UI tests | focused Vitest file | Save/reload/validation interactions pass |
| Typecheck/build | package typecheck + UI build | Pass |
| Token gate | `node scripts/check-token-gates.mjs` | Clean |
| API live smoke | clone/save/validate/publish on safe v2 draft | v1 unchanged, v2 persisted |
| Browser E2E | real editor interactions | Saved graph reloads; inspector and canvas work |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Active v1 corruption | Immutable published guard, snapshot before mutation, no auto migration |
| Generic task regression | Guard activates only for explicit Atelier workflow metadata |
| Duplicate tasks on retry | Stable idempotency key and mapping uniqueness |
| Invalid graph dispatch | Validate before publish/run; backend remains authoritative |

Rollback: revert FEAT-2026-021 code/migration. Published v1 and existing task/run
rows remain readable. Do not delete v2 rows during rollback.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 11:20 +07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|

## 14. Kết quả và đóng chức năng

- Kết quả: Chưa triển khai.
- Hạn chế còn lại: Chưa có.
- Việc chưa hoàn tất: implementation và verification.
- Rollback point: `628d46151` + pre-feature database state.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa có.
