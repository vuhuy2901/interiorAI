# [FEAT-2026-028] P0 Real Multi-Agent Workflow Orchestration

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.5 |
| Owner | Codex + TUAN |
| Người chấp thuận | TUAN (P0 request, 2026-11-13) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13 |
| Revision bắt đầu | Uncommitted working tree |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Studio Chat gọi `process_user_chat_message` trực tiếp và tự sinh proposal A/B/C, không tạo `workflow_run`. `execute_real_workflow_run` lại duyệt mảng node tuần tự bằng `previous_node_id`, bỏ qua dependency thật trong `edges`. Vì vậy sơ đồ workflow chưa là nguồn điều khiển.

## 2. Mục tiêu

Một tin nhắn Studio tạo Workflow Run gắn project/message/revision, thực thi DAG dựa trên edges, kiểm quyền agent, tạo artifact handoff có kiểm tra và lưu trace/reload bền vững. Không agent nào trả kết quả quy trình bằng đường tắt.

## 3. Phạm vi

### In scope

- Chat entrypoint → persisted user message → run có ID/trace/status.
- Scheduler DAG dùng edges; mở ready nodes song song; barrier Cost đủ Style + Shopping; Export chỉ phụ thuộc Approval.
- Artifact table/contract, node output artifact và dependency validation.
- Registry validation/capability mapping, QA agent thật và tách QA khỏi render agent.
- Scale/approval/render/export gate và events truy vết.
- Native Paperclip task-link adapter, persisted agent event feed and recovery-safe node attempt state.
- Backend tests cho routing, edge scheduler, artifact handoff, invalid QA, barriers và isolation.

### Out of scope

- Không redesign Workflow UI/editor, không thay Three.js/Blender, không sửa auth/Paperclip core.
- Không dùng project test thay project Studio để nghiệm thu.
- Không xoá/reset/stash/restore các thay đổi hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- FastAPI :8000, Paperclip :3100, SQLite ATELIER DB, Pascal MCP, Blender.
- Giữ toàn bộ diff hiện có và project/revision ngoài run đang test.

## 5. Thiết kế và kế hoạch triển khai

1. Bổ sung storage artifact và seed QA agent id ổn định.
2. Refactor engine thành scheduler theo predecessor edges, state machine và artifact admission.
3. Đổi Chat endpoint tạo user message + gọi workflow, chỉ phát events có trace.
4. Expose run/artifact API và cập nhật verification tests.
5. Chạy test, build và một run trên `proj_demo_4x5m` không tự duyệt approval.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | Schema/registry | artifact storage và QA registry |
| `apps/api/app/services/agent_orchestrator_engine.py` | Refactor | edge-based scheduler + handoff |
| `apps/api/app/main.py` | Endpoint | chat-to-run và run/artifact trace |
| `apps/api/app/services/workflow_task_adapter.py` | New | Idempotent native-task extension point and event records |
| `tests/test_real_workflow_orchestration.py` | New | P0 regression evidence |
| `docs/features/FEAT-2026-028-real-workflow-orchestration.md` | Contract/evidence | Governance |

## 7. Acceptance criteria

- [ ] AC-01: Studio Chat tạo persisted Workflow Run, lấy đúng Project ID, message ID, revision và workflow version.
- [ ] AC-02: Scheduler uses graph edges only; Style/Furniture concurrently ready after Geometry; Cost waits for Style + Shopping; Export waits only Approval.
- [ ] AC-03: Every completed node has validated artifact(s) with required provenance metadata.
- [ ] AC-04: Missing/disabled/mismatched agent capability blocks node; QA is registered and independent from Render.
- [ ] AC-05: Scale and approval gates block downstream Geometry/Render/Export as graph dictates.
- [ ] AC-06: Run/events/artifacts reload through APIs without duplicate node execution.
- [ ] AC-07: Tests pass and real selected Studio project run is traceable without auto-approval.
- [ ] AC-08: Node attempts and agent events are persisted, idempotently linked to a native task adapter, and recoverable after process restart.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Source audit | `git status`, `git diff`, endpoint/code trace | Root cause recorded |
| Backend P0 tests | `pytest tests/test_real_workflow_orchestration.py -v` | Edge/artifact/gate assertions pass |
| Existing regression | targeted API tests | No regressions |
| Live Studio project | POST chat/run for `proj_demo_4x5m` | Trace exists; gate does not auto-approve |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Existing chat UI expects proposal | Return compatible `reply`, plus explicit run metadata |
| Concurrent project writes | Node functions do not mutate project except controlled cost/export paths; persist scheduler state after each transition |
| Render cost/time | Stop at approval gate on real Studio project |

Rollback point và cách rollback: revert only files listed in section 6; retain pre-existing user changes. No destructive git operation.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu P0 của TUAN.
- Thời điểm: 2026-11-13.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-13 | Add native task linkage, live event persistence and recovery scope | User supplied P0 finalization requirement | New storage/adapter/tests; no UI redesign or auth changes | TUAN | 1.1 |
| CR-002 | 2026-11-13 | Runtime must dispatch by published node type, select project-bound immutable workflow snapshots, and derive invalidation/artifact lineage from graph data | Step 2 dynamic workflow requirement | Adds dynamic graph tests and later registry/scheduler/versioning refactor; preserves existing default template | TUAN | 1.2 |
| CR-003 | 2026-11-13 | Implement node executor registry keyed by published `node.type`; block missing assignments and unsupported executors | Step 3 red tests B/C/D/E | Production executor admission/dispatch changes only; tests remain unchanged | TUAN | 1.3 |
| CR-004 | 2026-11-13 | Add generic concurrent DAG scheduling, join/barrier semantics, concurrency limits, duplicate protection and cancellation state | Step 4 requirement | New scheduler module/integration tests; no native delegation claim | TUAN | 1.4 |
| CR-005 | 2026-11-13 | Simplify runtime around immutable workflow snapshots, edge-based readiness and per-run handoff manifests with strict artifact validation | User simplification request | Adds handoff adapter/validation and snapshot fields; does not add another orchestration framework | TUAN | 1.5 |
| CR-006 | 2026-11-13 | Connect READY nodes to real Paperclip native tasks, persisted task/agent events, handoff consumption and legacy Chat question/proposal compatibility | User next-step request | Adds a thin official API adapter and persisted linkage; no scheduler/runtime rewrite or fake task acceptance | TUAN | 1.6 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13 | Uncommitted | G0 audit | Xác nhận Chat bypass tại `api_send_chat_message`; engine dùng `previous_node_id` |
| 2026-11-13 | Uncommitted | G1/G3/G4 | Chat→run, edge predecessor trace, agent admission, QA registry và artifact storage |
| 2026-11-13 | Uncommitted | Live smoke | Run `run_5488456ffe` trên `proj_demo_4x5m` qua API runtime port 8001 |
| 2026-11-13 | Uncommitted | Step 2 red tests B/C/D/E | Added data-driven renamed/repeated-type/missing-agent/unknown-executor tests; production source unchanged in this step |
| 2026-11-13 | Uncommitted | Step 3 node executor registry | Dispatch now uses published `node.type`; removed Chief fallback; missing assignment/unknown type block explicitly |
| 2026-11-13 | Uncommitted | CR-005 simplified runtime | Added immutable run snapshot, `get_ready_nodes` ALL-join helper, project workflow binding, per-run Markdown/JSON handoffs with artifact hash admission, save-time graph validation, and runtime scale/approval/render-QA gates |
| 2026-11-13 | Uncommitted | CR-006 native task bridge | Added official Paperclip capability/project lookup, idempotent issue-task creation, native task persistence, live task/handoff sync and next-node activation without claiming acceptance before Paperclip reports it |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 | Uncommitted | Compile + existing project isolation tests | PASS | `python -m compileall ...`; `PYTHONPATH='.;apps/api' pytest tests/test_project_first_architecture.py -v`: 3 passed |
| 2026-11-13 | Uncommitted | Edge ordering proof | PASS | Workflow stored with n2 before n1 executed `n1_intake → n2_floorplan`, 2 valid artifacts |
| 2026-11-13 | Uncommitted | Real Studio chat/run | PARTIAL | `proj_demo_4x5m`, `run_5488456ffe`, 14 node artifacts; API runtime started separately on :8001 |
| 2026-11-13 | Uncommitted | Render artifact persistence | PASS | `rjob_f394c4bc1b`: 634,472-byte PNG exists; official download endpoint returned HTTP 200 image/png |
| 2026-11-13 | Uncommitted | `pytest tests/test_dynamic_workflow_definition.py -v` | EXPECTED FAIL | 4 collected, 4 failed: renamed IDs and repeated types use `internal_agent_logic`; missing agent and unsupported type incorrectly complete |
| 2026-11-13 | Uncommitted | Step 3 `pytest tests/test_dynamic_workflow_definition.py -v` | PASS | 4 passed in 1.28s without test changes |
| 2026-11-13 | Uncommitted | Dynamic + project isolation regression | PASS | 7 passed in 1.48s |
| 2026-11-13 | Uncommitted | Default 14-node Cycles regression | PASS | `test_g7_full_14_node_workflow_orchestration_with_real_cycles`: 1 passed in 15.25s |
| 2026-11-13 | Uncommitted | Legacy full acceptance | PARTIAL | Scale state compatibility fixed; suite continues to fail because new Chat→Run response does not yet recreate legacy `metadata.question` contract |
| 2026-11-13 | Uncommitted | Step 4 concurrency tests F–O | PASS | `pytest tests/test_concurrent_dag_scheduler.py -q`: 12 passed; generic scheduler proves barrier, dynamic edges, failure propagation, artifact barrier, limits, duplicate protection, cancel, waiting and cycle rejection |
| 2026-11-13 | Uncommitted | Step 4 regression | PASS | Dynamic executor + project isolation: 7 passed |
| 2026-11-13 | Uncommitted | Simplified runtime contract tests | PASS | `pytest tests/test_workflow_runtime_contract.py tests/test_dynamic_workflow_definition.py tests/test_concurrent_dag_scheduler.py -q`: 23 passed |
| 2026-11-13 | Uncommitted | Engine hardcode audit | PASS | `rg -n -P "n[0-9]+_" apps/api/app/services/agent_orchestrator_engine.py`: `NO_MATCHES` |
| 2026-11-13 | Uncommitted | Data-only graph change | PASS | Run `run_21ca26cf61` version 21 had 1 edge/2 nodes; run `run_7b48ee862d` version 22 had 2 edges/3 nodes including `lighting_new`; both completed without source edits |
| 2026-11-13 | Uncommitted | Legacy acceptance suite | PARTIAL | Question compatibility restored; suite still expects legacy `metadata.proposal` after Chat, which the workflow-first endpoint intentionally does not synthesize |
| 2026-11-13 | Uncommitted | Native Paperclip adapter tests + legacy acceptance | PASS | `pytest tests/test_paperclip_task_adapter.py tests/test_workflow_runtime_contract.py tests/test_dynamic_workflow_definition.py tests/test_concurrent_dag_scheduler.py tests/test_acceptance.py -q`: 26 passed |
| 2026-11-13 | Uncommitted | Real native task E2E | PARTIAL / WAITING_FOR_INPUT | Project `proj_demo_4x5m`; run `run_c2792ebd38`; native task `ATL-35` / `309330f5-422b-4476-8274-f0449b59e12e`; Paperclip agent moved to `in_review`, created a question interaction and handoff document; Geometry correctly not activated until user answers |

## 14. Kết quả và đóng chức năng

- Kết quả: Runtime now freezes the published graph in each run, resolves readiness from snapshot edges, writes/verifies per-node handoffs, and enforces scale/approval/render-QA gates independently of drawn gate nodes. The existing sequential executor remains intentionally small and graph-driven; the generic scheduler module and its F–O suite remain available but are not expanded here.
- Hạn chế còn lại: Native task creation and live status/handoff sync now work, but the real E2E is waiting for the user’s Paperclip question response; no Geometry task is claimed yet. Node timeout/max-retry execution, atomic persisted READY→RUNNING claims, stale-RUNNING restart recovery, and a full visual UI proof remain incomplete.
- Việc chưa hoàn tất: User response to the real Chief interaction, then Floorplan → Geometry continuation and scene verification. Legacy `metadata.question` and `metadata.proposal` compatibility tests now pass.
- Rollback point: Chỉ files section 6.
- Trạng thái `CLOSED` bởi: Chưa áp dụng.
- Thời điểm: Chưa áp dụng.
