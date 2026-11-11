# [FEAT-2026-015] Workflow giao việc và handoff giữa Atelier agents

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng yêu cầu trực tiếp |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |
| Revision bắt đầu | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` |
| Revision cuối | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + feature working-tree manifest ghi tại mục 13 |

## 1. Bối cảnh

Roster live đã có một Chief Architect và tám specialist cùng quan hệ `reportsTo`,
nhưng task seed chưa có `parentId`, chưa có dependency runtime, specialist chưa
có handoff target rõ, và chín task `in_progress` lịch sử không có execution run.
Tài liệu có DAG nghiệp vụ nhưng Paperclip chưa biểu diễn DAG đó thành cây task có
blocker để tự mở bước kế tiếp.

## 2. Mục tiêu

Tạo một workflow Paperclip bền vững, có thể kiểm tra được, trong đó Chief tạo
workflow root; mỗi stage có agent phụ trách, parent/goal chung và dependency rõ;
specialist chỉ được handoff tới target hợp lệ; không cần polling nền.

## 3. Phạm vi

### In scope

- Định nghĩa canonical Atelier agent workflow và các cạnh handoff hợp lệ.
- Reconcile task workflow dưới một root do Chief quản lý, với `parentId`, `goalId`
  và blocker relation.
- Chuyển các task workflow seed chưa thực thi từ `in_progress` về `todo`; không
  thay đổi task người dùng/Telegram/3D pin ngoài workflow canonical.
- Cấp metadata/allowed tools cần thiết để agent biết stage và target handoff.
- Cung cấp API read-only để xem graph/status và API handoff có validation.
- Thêm kiểm thử tập trung và cập nhật tài liệu workflow.

### Out of scope

- Không thay đổi model, API key, prompt nội dung chuyên môn, budget hoặc quyền
  scene-write hiện có.
- Không sửa workflow Python 14-node hoặc thay thế deterministic engines.
- Không thêm polling, timer hoặc background worker mới.
- Không tự hoàn thành task hoặc bỏ qua approval/human gate.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip issue service, issue relation `blocks`, embedded PostgreSQL.
- Dữ liệu dùng chung: company/goal/project/agents/issues hiện có.
- Service/port/database không được ảnh hưởng: Paperclip `3100`, PostgreSQL `54329`.
- Invariant: company isolation, idempotent bootstrap, không tạo duplicate workflow.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm module sở hữu canonical graph, stage specs và handoff validation.
2. Reconcile graph trong Atelier bootstrap bằng task root + stage tasks có
   parent/goal/dependency; dùng event-driven issue dependency sẵn có.
3. Thêm `GET /api/atelier/workflow` và `POST /api/atelier/workflow/handoff`.
4. Thêm test cho graph, idempotency, invalid handoff và task dependency.
5. Chạy bootstrap live, xác nhận graph/status/health và ghi evidence.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-agent-workflow.ts` | Mới | Owner của graph và handoff policy |
| `paperclip/server/src/routes/atelier-bridge.ts` | Tích hợp | Bootstrap reconcile và API |
| `paperclip/server/src/__tests__/atelier-agent-workflow.test.ts` | Mới | Kiểm thử graph/handoff |
| `docs/WORKFLOW_SCHEMA.md` | Cập nhật | Ghi sơ đồ giao việc live |
| Paperclip Atelier runtime data | Reconcile | Parent/dependency/status/metadata |

## 7. Acceptance criteria

- [x] AC-01: Có đúng một workflow root do Chief quản lý và mỗi canonical stage có đúng một task con.
- [x] AC-02: Mỗi task stage có đúng `parentId`, `goalId`, assignee và blocker theo graph.
- [x] AC-03: Agent metadata công bố stage và handoff targets; handoff ngoài graph trả 422.
- [x] AC-04: Task workflow chưa chạy ở `todo`, không còn giả `in_progress` khi không có run.
- [x] AC-05: Bootstrap/reconcile chạy lặp lại không tạo duplicate.
- [x] AC-06: API graph trả nodes, edges, task status và health Paperclip vẫn `ok`.
- [x] AC-07: Không có polling/timer/background worker mới.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit test graph | Vitest file tập trung | Graph hợp lệ, cycle-free, handoff validation đúng |
| Reconcile idempotency | Gọi bootstrap/API hai lần | Không duplicate root/stage |
| Live graph | GET `/api/atelier/workflow` | Nodes/edges/tasks đầy đủ |
| Invalid handoff | POST target không hợp lệ | HTTP 422, không tạo task |
| Health | GET `/api/health` | `status=ok`, phase `ready` |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tạo task trùng | Stable workflow/stage key + reconcile idempotent |
| Dependency sai gây deadlock | Graph cycle validation + focused tests |
| Ảnh hưởng task lịch sử ngoài workflow | Chỉ mutate task canonical được nhận diện chính xác |
| Handoff vượt quyền | Validate source/target/company trước khi create |

Rollback point và cách rollback: revert code; xóa các relation/task mang stable
workflow key của FEAT-2026-015 hoặc khôi phục snapshot runtime trước reconcile.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của người dùng.
- Thời điểm: 2026-11-11

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 11:29 +07:00 | Working tree trên `eac39d0b` | Thêm canonical DAG, reconcile root/stage/dependency, agent metadata và handoff policy | Không thay model hoặc Python workflow |
| 2026-11-11 11:40 +07:00 | Working tree trên `eac39d0b` | Thêm API graph/handoff, test và tài liệu | Dùng issue dependency event-driven có sẵn |
| 2026-11-11 11:45 +07:00 | Working tree trên `eac39d0b` | Restart Paperclip và reconcile runtime live | PostgreSQL giữ nguyên, server PID mới 12700 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 11:40 +07:00 | `eac39d0b` + working tree | Focused Vitest | PASS, 1 file / 4 tests | `atelier-agent-workflow.test.ts`, exit 0 |
| 2026-11-11 11:45 +07:00 | `eac39d0b` + working tree | Paperclip health | PASS | `/api/health`: `status=ok`, `bootstrapStatus=ready`, startup recovery `ready` |
| 2026-11-11 11:46 +07:00 | `eac39d0b` + working tree | Live graph + idempotency | PASS | 1 stable root, 10 stable node IDs, 15 edges, all stage parent IDs đúng; gọi hai lần không tăng task |
| 2026-11-11 11:46 +07:00 | `eac39d0b` + working tree | Invalid handoff | PASS | `agent_floorplan -> agent_cost` trả HTTP 422; issue count giữ `22 -> 22` |
| 2026-11-11 11:46 +07:00 | `eac39d0b` + working tree | Status/run integrity | PASS | Các stage chưa mở ở `todo`; 3 stage `in_progress` đều có execution và checkout run ID thật |
| 2026-11-11 11:46 +07:00 | `eac39d0b` + working tree | Agent routing metadata | PASS | Chief + 8 specialist đều có stage/handoff target; 9/9 model `gpt-5.6-luna`, reasoning `low` |
| 2026-11-11 11:47 +07:00 | `eac39d0b` + working tree | Diff hygiene | PASS | `git diff --check` sạch trên ba file implementation/test |
| 2026-11-11 11:47 +07:00 | `eac39d0b` + working tree | Feature manifest | RECORDED | workflow service `5B6C563E...10168`; route `D21F4E68...F1B4`; test `303A80D2...9081`; schema `41A887DB...9D02` (SHA-256) |
| 2026-11-11 11:40 +07:00 | `eac39d0b` + working tree | Repository typecheck | BLOCKED (pre-existing/out of scope) | Runner generated-profile line-ending preflight; direct `tsc` also reports existing `rootDir`, intake, Telegram and vendor errors. Không sửa file ngoài scope. |

## 14. Kết quả và đóng chức năng

- Kết quả: Workflow giao việc Atelier đã được reconcile live với DAG, parent,
  blocker, assignee, handoff allowlist và API kiểm tra rõ ràng.
- Hạn chế còn lại: Repository-wide typecheck vẫn bị chặn bởi lỗi có sẵn ngoài
  phạm vi feature; focused test và runtime verification đều đạt.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: Revision trước thay đổi + runtime snapshot trước reconcile.
- Trạng thái `CLOSED` bởi: Codex sau khi đạt toàn bộ acceptance criteria.
- Thời điểm: 2026-11-11 11:47 +07:00.
