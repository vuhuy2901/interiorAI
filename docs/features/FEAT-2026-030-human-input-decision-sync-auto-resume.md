# [FEAT-2026-030] Human input decision sync and workflow auto-resume

| Trường | Giá trị |
|---|---|
| Trạng thái | IMPLEMENTING |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex / ATELIER AI Backend |
| Người chấp thuận | Người dùng — yêu cầu P0 ngày 2026-11-13 |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13T09:26:58+07:00 |
| Revision bắt đầu | e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1 + dirty worktree được bảo toàn |
| Revision cuối | Working tree trên `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` (chưa commit; giữ nguyên dirty worktree) |

## 1. Bối cảnh

Workflow run `run_c2792ebd38` đang `WAITING_FOR_INPUT`. Paperclip interaction
`b37d60f5-9c46-4e86-a585-69f712a5dc67` trên ATL-1 đã được trả lời với ngân
sách 80–120 triệu VNĐ, 2 trẻ và không có đồ/ràng buộc cửa đặc biệt; ATL-1 plan
revision 2 cũng đã ghi các giá trị này. Tuy nhiên handoff ATL-35 được tạo trước
khi các câu trả lời đó được đồng bộ và vẫn chứa decision ledger `unknown`.
Runtime hiện chỉ đọc trạng thái native task/handoff, không đọc interaction
answers, không có structured decision store và không tái đánh giá run sau khi
người dùng trả lời.

## 2. Mục tiêu

Một câu trả lời thật từ Paperclip hoặc Studio được xử lý đúng một lần, lưu với
provenance/revision, cập nhật các quyết định mới nhất và tự tái đánh giá đúng
workflow run đang chờ. Run chỉ tiếp tục khi mọi input bắt buộc đã `VALIDATED`;
nếu còn thiếu phải trả về chính xác decision key còn thiếu.

## 3. Phạm vi

### In scope

- Đọc Paperclip issues, comments, interactions và plan document qua API chính thức.
- Structured decision ledger và durable input-event/idempotency records trong SQLite.
- Deterministic mapping cho question/option IDs đã khai báo và câu trả lời tự do rõ ràng.
- Reconciliation có giới hạn cho các run `WAITING_FOR_INPUT`, khởi động lại an toàn.
- Atomic/idempotent decision updates và workflow resume trên cùng run.
- Chống tạo native task trùng bằng idempotency key hiện có.
- API quan sát/reconcile phục vụ vận hành và kiểm thử.
- Đồng bộ trạng thái chat/workflow bằng dữ liệu backend thật, không giả phản hồi agent.
- Test recovery, partial answers, duplicate events, restart recovery và handoff admission.

### Out of scope

- Không sửa Paperclip core, scheduler, executor registry hoặc workflow graph.
- Không tạo project/run mới và không tự tạo quyết định chưa có bằng chứng.
- Không tự vượt Scale, Approval hoặc Render QA gate.
- Không dựng scene/render trong feature này.
- Không restart production backend port 8000 nếu chưa được người dùng cho phép.
- Không biến toàn bộ ngôn ngữ tự nhiên thành quyết định bằng AI; chỉ ánh xạ khi đủ rõ.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip API tại `127.0.0.1:3100`, SQLite `data/atelier.db`, native task adapter, workflow runtime.
- Dữ liệu dùng chung: ATL-1 documents/interactions/comments, ATL-35, `run_c2792ebd38`, mọi project/revision hiện có.
- Service/port/database không được ảnh hưởng: Paperclip 3100, API 8000, dữ liệu project demo và mọi uncommitted change.
- Không reset/stash/clean; không xóa interaction, comment, ledger hay task lịch sử.

## 5. Thiết kế và kế hoạch triển khai

1. Mở rộng adapter read-only để liệt kê project issues, comments, interactions và documents.
2. Thêm bảng `workflow_input_events`, `workflow_decisions`, `workflow_wait_conditions` với unique keys và revision tăng đơn điệu.
3. Thêm service reconciliation: thu thập event mới, chuẩn hóa answer, validate, persist và tính missing decisions.
4. Kết nối reconciler vào native run sync; chỉ chuyển node chờ khi đủ quyết định và handoff đã được cập nhật hợp lệ.
5. Thêm bounded background reconciler trong lifespan, có stop signal và không gọi AI.
6. Thêm API quan sát/reconcile idempotent và regression tests.
7. Thu thập bằng chứng production sau khi code được nạp hợp lệ; nếu không thể reload/restart, báo PARTIAL rõ ràng.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Schema additive | Durable events, decisions và wait conditions |
| `apps/api/app/services/paperclip_task_adapter.py` | API adapter | Đọc issues/comments/interactions/documents |
| `apps/api/app/services/workflow_input_sync.py` | Service mới | Normalize, persist, reconcile và auto-resume |
| `apps/api/app/services/agent_orchestrator_engine.py` | Adapter integration | Re-evaluate run trước/sau native sync |
| `apps/api/app/main.py` | Lifespan/API | Bounded reconciler và endpoint vận hành |
| `tests/test_workflow_input_sync.py` | Tests | 10 kịch bản P0 và idempotency |
| `docs/features/FEAT-2026-030-human-input-decision-sync-auto-resume.md` | Contract/evidence | Source of truth và nghiệm thu |

## 7. Acceptance criteria

- [x] AC-01: Answered interaction được lưu thành decision có source IDs, user, timestamps, status và revision.
- [x] AC-02: Ngân sách, số trẻ và constraints của ATL-1 được recover mà không hỏi lại.
- [x] AC-03: Pending/partial answers chỉ để lại đúng keys còn thiếu.
- [x] AC-04: Cùng source event xử lý hai lần không tạo duplicate decision/resume/task.
- [x] AC-05: Studio chat/native comment rõ ràng được ánh xạ; nội dung mơ hồ không được tự xác nhận.
- [ ] AC-06: Run đang chờ tự tái đánh giá trên cùng `run_id`; không tạo run mới.
- [x] AC-07: Native task chỉ được tạo khi predecessor đủ điều kiện và vẫn dùng idempotency key hiện có.
- [x] AC-08: Restart/reconcile lại không mất answer, không lùi interaction/ledger revision.
- [x] AC-09: Scale/Approval/Render QA gate vẫn được giữ nguyên.
- [ ] AC-10: UI/API hiển thị quyết định mới nhất và missing keys nhất quán sau reload.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit decision normalization | `pytest -q tests/test_workflow_input_sync.py` | Mapping đúng, ambiguous giữ UNKNOWN |
| Existing response recovery | Test fixture từ payload ATL-1 | 3 decision VALIDATED, đúng provenance |
| Partial/duplicate/restart | Test cases riêng | Không duplicate, missing keys chính xác |
| Existing runtime regressions | Workflow/native adapter test suites | Không làm hỏng scheduler/handoff/gates |
| Production read-back | API Paperclip + API 8000 sau khi code được nạp | Cùng run, ledger/UI nhất quán |
| UI verification | Studio Chat/Questions/Workflow reload | Không hỏi lại decision đã xác nhận |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Ingest comment cũ/khác project | Chỉ quét issue cùng Paperclip project, timestamp sau run start và mapping rõ ràng |
| Hai reconciler xử lý cùng event | Unique event key + transaction + monotonic revision |
| Resume khi chưa đủ an toàn | Required keys + status VALIDATED + runtime gates |
| Ghi đè frozen handoff | Tạo synchronized manifest có provenance; không sửa artifact COMPLETED hợp lệ |
| Polling gây tải | Chỉ run đang chờ, interval giới hạn, request timeout, không AI loop |

Rollback point và cách rollback: gỡ integration/background task và service mới;
schema additive được giữ lại để không mất audit history. Không rollback bằng reset/clean.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu P0 của người dùng.
- Thời điểm: 2026-11-13T09:26:58+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-13T09:51:35+07:00 | Ghi nhận ba quyết định mới; chuyển Decision Gate từ toàn-run sang hợp đồng input theo node; cho phép Floorplan/Geometry tiếp tục với chi tiết giường tầng `PROVISIONAL`; nạp source mới qua Paperclip-managed Python sidecar | Người dùng xác nhận bảng màu/vật liệu, yêu cầu an toàn giường tầng phải được đề xuất và duyệt sau; các input không liên quan không được chặn nhánh độc lập | `workflow_input_sync`, native task context, tests, production sidecar restart/recovery; không đổi run ID hoặc published snapshot | Người dùng — yêu cầu ngày 2026-11-13 | 1.1 |

### CR-001 — Frozen addendum

**Scope**

- Lưu nguyên văn quyết định người dùng vào Paperclip interaction và decision ledger
  với provenance/revision; `bunk_bed_safety` mang trạng thái `PROVISIONAL` cho
  đến khi có thông số, tiêu chuẩn và phê duyệt cuối.
- Tính required decisions theo node đang chờ từ snapshot/config và node type,
  không lấy hợp của mọi pending question làm gate toàn run.
- Floorplan được chạy khi input mặt bằng của node đủ; Geometry được dựng kiến
  trúc/bố trí sơ bộ và phải nhận cảnh báo provisional; Style node, nếu có trong
  snapshot, sở hữu palette/materials.
- Gate phê duyệt/xuất hồ sơ cuối chỉ nhận `VALIDATED`, không nhận
  `PROVISIONAL` cho quyết định an toàn.
- Restart sidecar 8000 bằng owner Paperclip đã xác minh, sau SQLite online
  backup; không restart Paperclip 3100/PostgreSQL và không đổi proxy/port.

**Non-goals**

- Không sửa nodes/edges hoặc thêm Style node vào snapshot cố định của run hiện
  tại; không tạo run mới để né giới hạn graph đã publish.
- Không tự phê duyệt kích thước/cấu tạo giường tầng, Scale/Approval/Render QA.
- Không tạo task ngoài node READY của snapshot và không viết lại scheduler.

**Affected components**

- `apps/api/app/services/workflow_input_sync.py`: decision status và node-scoped gate.
- `apps/api/app/services/agent_orchestrator_engine.py`: task context và resume.
- `tests/test_workflow_input_sync.py`: per-node/provisional/branch regressions.
- Paperclip interaction `f580da42-b420-4f31-8997-3b6934267bbf` và sidecar 8000.

**Acceptance criteria**

- AC-11: Ba quyết định mới có source/revision; palette và materials `VALIDATED`,
  bunk-bed construction `PROVISIONAL` và không bị diễn giải thành phê duyệt cuối.
- AC-12: Pending palette/material/safety không chặn Floorplan; provisional safety
  không chặn Geometry sơ bộ nhưng chặn gate/final export liên quan.
- AC-13: Required/missing decisions được tính cho node hiện tại; pending
  interaction khác node không làm run-wide gate.
- AC-14: Cùng `run_c2792ebd38`, đúng snapshot version 1, không duplicate native
  task; node tiếp theo lấy từ edges.
- AC-15: Backend 8000 nạp source mới qua Paperclip-managed sidecar, health và
  OpenAPI xác minh được; rollback dùng pre-restart DB backup và revision bắt đầu.
- AC-16: UI Paperclip và execution trace phản ánh task/handoff thật; nếu snapshot
  không có Style node thì báo rõ, không tự thêm node/task.

**Risks and rollback**

- Risk: provisional bị coi là final. Mitigation: node contract tách
  `allow_provisional` khỏi `required_decisions`; final gates chỉ nhận VALIDATED.
- Risk: restart sai process. Mitigation: xác minh PID, parent PID, command line,
  SQLite online backup và dùng Paperclip bootstrap để owner tự spawn lại sidecar.
- Rollback: dừng sidecar mới qua cùng owner, khôi phục source revision
  `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1`/working-tree backup và SQLite
  backup trước restart; không reset/clean repository.

**Verification plan**

- Unit tests cho node-scoped gate, provisional admission và final-gate block.
- Regression suites hiện hữu cho scheduler/handoff/idempotency.
- Production read-back: OpenAPI routes, decision revisions, run events, native
  task count/idempotency key và Paperclip UI reload.

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13T09:27:00+07:00 | working tree | Thêm schema input-event, decision ledger và wait condition | Schema additive; không xóa dữ liệu cũ |
| 2026-11-13T09:31:00+07:00 | working tree | Thêm Paperclip adapter và input reconciliation service | Mapping deterministic; không dùng AI để suy đoán câu trả lời |
| 2026-11-13T09:35:00+07:00 | working tree | Tích hợp run sync, bounded background reconciler và API quan sát | Không đổi scheduler/graph/gate hiện hữu |
| 2026-11-13T09:40:00+07:00 | working tree | Recover ATL-1 vào cùng run `run_c2792ebd38` | Không tạo run/task mới; còn đúng ba quyết định chưa có bằng chứng |
| 2026-11-13T09:51:35+07:00 | working tree | CR-001 frozen; implementation resumed | Per-node gate, provisional safety và Paperclip-managed sidecar restart |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13T09:26:58+07:00 | working tree | Audit ATL-1/ATL-35 | FAIL reproduced | b37 answered + ATL-1 plan rev 2 validated, ATL-35 handoff/run remain unknown/waiting |
| 2026-11-13T09:41:00+07:00 | working tree | Input-sync regression tests | PASS | `10 passed`; recovery, partial, duplicate, restart, ambiguous text và exactly-once. Hai acceptance test production “real agent handoff” và “real Paperclip UI submit” chưa thể chạy vì còn thiếu ba câu trả lời thật và API 8000 chưa được phép restart. |
| 2026-11-13T09:42:00+07:00 | working tree | Workflow/adapter regression suites | PASS | `35 passed in 2.49s` |
| 2026-11-13T09:42:00+07:00 | working tree | Project-first regressions | PASS | `3 passed in 0.38s` |
| 2026-11-13T09:43:00+07:00 | working tree | Production reconciliation/read-back | PASS (service) | Same run; one native task; 25 decision revisions; 4 unique input events; missing `bunk_bed_safety`, `materials`, `palette` |
| 2026-11-13T09:44:00+07:00 | working tree | Studio chat UI read-back | PASS (manual reload) | 3 answered questions shown; one palette question and decision ledger show exactly three unresolved decisions |
| 2026-11-13T09:44:00+07:00 | working tree | Running API OpenAPI read-back | BLOCKED | API 8000 healthy but new decision/reconcile routes are not loaded; restart/reload is forbidden without user permission |

## 14. Kết quả và đóng chức năng

- Kết quả: PARTIAL — implementation và tests hoàn tất; production data đã được
  recover/reconcile trên cùng run, nhưng tiến trình API 8000 đang chạy chưa nạp
  code listener mới.
- Hạn chế còn lại: Chưa thể nghiệm thu production auto-listener/auto-resume sau
  restart vì yêu cầu cấm restart backend 8000 khi chưa được cho phép. Ba quyết
  định `palette`, `materials`, `bunk_bed_safety` cũng chưa có câu trả lời thật.
- Việc chưa hoàn tất: Nạp code mới vào backend 8000, xác minh background listener
  tự nhận câu trả lời mới, rồi chạy E2E tiếp đến agent downstream trên cùng run.
- Rollback point: e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1 + preserved dirty worktree.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa có.
