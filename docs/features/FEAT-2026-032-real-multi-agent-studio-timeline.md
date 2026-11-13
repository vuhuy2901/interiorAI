# [FEAT-2026-032] Timeline đa agent thật trong Studio Chat

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex / ATELIER AI |
| Người chấp thuận | TUAN (yêu cầu trực tiếp trong chat) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13 10:18 +07:00 |
| Revision bắt đầu | Worktree hiện tại, giữ nguyên toàn bộ thay đổi chưa commit |
| Revision cuối | Worktree hiện tại (chưa commit; bảo toàn thay đổi người dùng) |

## 1. Bối cảnh

Workflow run `run_c2792ebd38` đã tạo native task Floorplan `ATL-49` và Paperclip đã có execution run thật, nhưng trang Studio Chat chỉ đọc comment của conversation issue với Chief. Comment, trạng thái và execution của specialist task nằm ở issue riêng nên người dùng không thấy agent chuyên môn trong cùng trang chat. Runtime hiện cập nhật một bản ghi event theo node nhưng chưa lưu timeline lifecycle append-only; frontend Atelier đang polling `chat/history` nhưng nguồn này không chứa native task lifecycle.

## 2. Mục tiêu

Hiển thị timeline đa agent có danh tính riêng trong cùng trang Studio Chat, hoàn toàn từ native task/execution/handoff thật. Timeline phải bền vững qua reload/restart, idempotent, không phát `TASK_ACCEPTED` nếu Paperclip không có bằng chứng riêng, và tiếp tục dùng workflow snapshot hiện tại.

## 3. Phạm vi

### In scope

- Lưu event lifecycle append-only, có sequence và idempotency cho từng workflow run.
- Phát `TASK_ASSIGNED`, `AGENT_STARTED`, `AGENT_PROGRESS` khi có comment thật, `HANDOFF_COMPLETED`, `TASK_COMPLETED`, `TASK_BLOCKED`, `TASK_FAILED`, `USER_INPUT_REQUIRED`, `WORKFLOW_RESUMED` khi có bằng chứng tương ứng.
- Gắn project, conversation, run, node, native task, agent và execution run vào event.
- API đọc event theo cursor/sequence; frontend Studio Chat đọc cùng nguồn trạng thái workflow/native task.
- Hiển thị agent riêng, task/status/timestamp/link task và handoff; hỗ trợ nhiều agent đồng thời.
- Khôi phục event cho run hiện tại mà không tạo run/task mới.
- Test idempotency, reload/restart, không fake acknowledgement và E2E run hiện tại.

### Out of scope

- Không viết lại scheduler, executor registry, Paperclip task runner hoặc toàn bộ UI chat.
- Không thay đổi workflow snapshot `wf_native_handoff_e2e_bc11a169` version 1.
- Không tạo Style/Furniture node cho run hiện tại vì snapshot không chứa các node đó.
- Không giả lập execution, progress, artifact hoặc completion.
- Không tạo service/queue/chat repository mới; dùng SQLite runtime, Paperclip API và UI hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: native Paperclip issue/task, issue run history, agent roster, workflow snapshot, verified handoff manifest.
- Dữ liệu dùng chung: `C:\Users\TUAN\Downloads\data\atelier.db`, Paperclip project `8b2fe984-4bc2-4af2-a65f-7dfe64fb2274`, run `run_c2792ebd38`.
- Service/port/database không được ảnh hưởng: Paperclip 3100, sidecar 8000, Paperclip Postgres/PGlite; không reset/stash/clean, không proxy 8001.
- Restart sidecar 8000 chỉ qua tiến trình cha Paperclip đã xác minh và phải backup SQLite trước. Không restart Paperclip 3100 nếu chưa có chấp thuận riêng.

## 5. Thiết kế và kế hoạch triển khai

1. Audit route trạng thái native task → workflow event → Studio Chat và ghi bằng chứng file:dòng.
2. Thêm bảng timeline append-only trong SQLite và helper ghi event idempotent, sequence tăng đơn điệu theo run.
3. Trong reconciliation hiện có, chỉ suy event từ trạng thái/interaction/comment/handoff đã quan sát; không tạo acceptance giả.
4. Mở API timeline theo project/run và cursor; response có agent metadata cần thiết.
5. Thêm feed gọn trong trang Agent Chat/Studio, tái sử dụng realtime reconciliation có backoff, không thêm polling vô hạn thứ hai nếu có thể dùng chu kỳ hiện hữu.
6. Reconcile run hiện tại để backfill event từ execution/task history thật, sau đó theo dõi Floorplan → Geometry.
7. Kiểm thử unit/integration/UI/reload/restart/no-duplicate; chụp UI thật nếu luồng hoàn tất.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Schema | Lưu workflow chat events append-only |
| `apps/api/app/services/agent_orchestrator_engine.py` | Reconciliation | Phát event từ evidence thật |
| `apps/api/app/services/paperclip_task_adapter.py` | Read adapter | Đọc run/comment/agent evidence cần thiết |
| `apps/api/app/main.py` | API | Timeline theo cursor/project/run |
| `paperclip/ui/src/pages/AgentChat.tsx` | UI integration | Hiển thị timeline trong cùng trang chat |
| `paperclip/ui/src/features/atelier/*` | Feed/UI tối thiểu | Danh tính, trạng thái, link task/handoff |
| `tests/*workflow*`, `paperclip/ui/src/**/*test*` | Tests | Lifecycle, idempotency, rendering |

## 7. Acceptance criteria

- [x] AC-01: `floorplan_native` dùng đúng native task `021cdda3-d957-4eb1-b532-660816cabcd2`, không tạo duplicate.
- [x] AC-02: `TASK_ASSIGNED` chỉ xuất hiện sau khi task tồn tại và gán đúng agent.
- [x] AC-03: `AGENT_STARTED` chỉ xuất hiện khi có execution run thật; event chứa execution run ID.
- [x] AC-04: Không phát `TASK_ACCEPTED` nếu Paperclip không có acknowledgement độc lập.
- [x] AC-05: Completion chỉ hiển thị sau handoff/artifact/hash validation; event có task, node, agent, artifact/handoff.
- [x] AC-06: Geometry chỉ được giao sau Floorplan COMPLETED theo snapshot và nhận đúng handoff.
- [x] AC-07: Timeline hiển thị trong trang Studio Chat với danh tính riêng, timestamp, status và link; Chief không giả danh specialist.
- [x] AC-08: Reload/reconnect/reconcile/restart không mất và không nhân đôi event/message.
- [x] AC-09: Sequence ổn định; event đến muộn vẫn sắp xếp nhất quán; nhiều agent không ghi đè nhau.
- [x] AC-10: BLOCKED/FAILED/USER_INPUT_REQUIRED phản ánh lý do thật và chỉ chặn node bị ảnh hưởng.
- [x] AC-11: Backend 8000 thực sự nạp revision cuối; UI đọc đúng endpoint/revision.
- [ ] AC-12: Test A–J được báo riêng PASS/PARTIAL/BLOCKED bằng bằng chứng thật; không gộp hoặc suy diễn.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit lifecycle/idempotency | `pytest -q` các test workflow timeline/input/runtime | Không event/task trùng; không fake accepted |
| API cursor/reload | Gọi timeline nhiều lần với cursor, restart sidecar có backup | Cùng event IDs/sequence, không mất lịch sử |
| Native execution | Đọc Paperclip issue/runs cho ATL-49 và downstream | Agent/execution/task ID thật |
| Handoff validation | Reconcile run và kiểm tra file/hash/artifact ID | Chỉ completed khi hợp lệ |
| UI | Mở localhost:3100 Studio Chat, reload | Agent riêng và trạng thái tồn tại |
| Parallel | Fixture/snapshot có hai node READY độc lập | Hai trạng thái đồng thời, không dùng một activeAgentId |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Event giả do suy từ status không đủ mạnh | Bảng mapping evidence rõ; không có `TASK_ACCEPTED` fallback |
| Duplicate khi reconcile/restart | Deterministic event ID + unique constraint + sequence transaction |
| Polling làm web lag | Cursor, backoff, dùng chu kỳ context hiện có, payload delta |
| Specialist task comment lộ sai project | Scope theo project/run/snapshot/native task mapping |
| UI/server Paperclip cần restart | Ưu tiên sidecar API và UI HMR; không restart 3100 khi chưa được phép |

Rollback point và cách rollback: giữ backup SQLite mới nhất trước mỗi restart 8000; rollback source chỉ các file thuộc feature bằng reverse patch có kiểm soát, không reset/restore thay đổi người dùng; bảng/event mới additive và có thể ngừng đọc mà không xóa dữ liệu.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của TUAN.
- Thời điểm: 2026-11-13 10:18 +07:00.

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13 10:18 +07:00 | Worktree hiện tại | Root-cause audit | ATL-49 tồn tại, đúng agent, execution run thật; specialist history đang ở issue riêng, Studio Chat chưa project event |
| 2026-11-13 14:20 +07:00 | Worktree hiện tại | Event store/API/UI | Thêm timeline append-only, cursor API, strict evidence mapping và feed cùng trang Chief; bỏ reconciliation khỏi mỗi lần đọc history để giảm tải |
| 2026-11-13 14:23 +07:00 | Worktree hiện tại | Managed sidecar reload | Backup SQLite rồi chỉ restart child 8000 thuộc Paperclip PID 9008; PID mới 27196 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 10:15 +07:00 | Worktree hiện tại | Sidecar managed restart | PASS | PID 23268, owner Paperclip PID 9008; backup `atelier_pre_sidecar_restart_20261113_101505.db` |
| 2026-11-13 10:15 +07:00 | Worktree hiện tại | Native Floorplan execution | PASS | ATL-49, agent `fd262b14-4138-4b25-8ba3-ba059c42ad89`, run `541895df-f5c2-4f77-a7db-1bffa79dd3d9`, phase `working` |
| 2026-11-13 14:26 +07:00 | Worktree hiện tại | Backend regression suite | PASS | `52 passed in 3.52s`; Python compile PASS |
| 2026-11-13 14:31 +07:00 | Worktree hiện tại | Frontend typecheck | PASS | `pnpm --dir paperclip/ui exec tsc --noEmit` exit 0 |
| 2026-11-13 14:20 +07:00 | Worktree hiện tại | Native handoff validation | PASS | Chief `art_b2276deb1527`; Floorplan `art_e4b4e14339ce`; handoff files và SHA-256 được runtime đọc lại |
| 2026-11-13 14:30 +07:00 | Worktree hiện tại | Idempotent reconciliation | PASS | Ba lần sync liên tiếp giữ nguyên 28 event (`28 → 28 → 28`), không tạo task/event trùng |
| 2026-11-13 14:30 +07:00 | Worktree hiện tại | Workflow snapshot | PASS | `wf_native_handoff_e2e_bc11a169` version 1; edges Chief → Floorplan → Geometry không bị sửa |
| 2026-11-13 14:29 +07:00 | Worktree hiện tại | Studio UI + reload | PASS | Trang `/ATL/chats/chief-architect-kien-truc-su-truong` hiển thị “Nhóm agent theo Workflow”, ATL-35/49 COMPLETED và ATL-50 FAILED/provider_quota theo agent riêng; reload vẫn còn |
| 2026-11-13 14:30 +07:00 | Worktree hiện tại | Geometry native execution | BLOCKED | ATL-50 / execution `cce8ffd4-6940-458b-823c-8802bd4ea18b` hết retry 3/3 do `provider_quota`; không có Scene artifact nên không tuyên bố E2E PASS |
| 2026-11-13 14:37 +07:00 | Worktree hiện tại | Provider quota audit | BLOCKED | Log thật: OpenAI/ChatGPT `gpt-5.6-luna`, `subscription_included`, 0 tokens; usage limit, `retryNotBefore=2026-11-13T14:06:00Z` (21:06 +07:00); task chỉ cho phép `inspect_run` |
| 2026-11-13 14:39 +07:00 | Worktree hiện tại | Chief Chat recovery notice | PASS | Board-authored comment `c6d425e5-90b4-4040-a0e8-93771474eb9a` lưu đúng ATL-35; không giả danh Geometry và không tạo execution/task mới |

## 14. Kết quả và đóng chức năng

- Kết quả: Timeline/event pipeline đã triển khai và xác minh; workflow dự án vẫn `BLOCKED` ở Geometry vì quota nhà cung cấp.
- Hạn chế còn lại: Workflow snapshot hiện tại chỉ có Chief → Floorplan → Geometry; không thể nghiệm thu Style/Furniture parallel trên chính run này.
- Việc chưa hoàn tất: Geometry chưa tạo Scene artifact; chưa thể nghiệm thu Chief → Floorplan → Geometry → Scene hoặc nhánh Style/Furniture không có trong snapshot.
- Rollback point: `C:\Users\TUAN\Downloads\data\backups\atelier_pre_sidecar_restart_20261113_142349.db` (SHA-256 `A18974B58D75FBF21DD61608BEBBFECB8A8BBF3211C6C225982972726FDF49B4`) và diff theo feature.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
