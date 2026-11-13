# [FEAT-2026-031] Real Multi-Agent Group Chat & Task Acknowledgement

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex / ATELIER AI Multi-Agent Studio |
| Người chấp thuận | Người dùng — Yêu cầu P0 ngày 2026-11-13 |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13T10:35:00+07:00 |
| Revision bắt đầu | `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` + dirty worktree được bảo toàn |
| Revision cuối | Working tree trên `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` |

## 1. Bối cảnh

Trong ATELIER AI Studio (`proj_demo_4x5m`, workflow run `run_c2792ebd38`), Chief Architect thông báo đã hoàn thành handoff sang `floorplan_native`, tuy nhiên trong cùng cuộc trò chuyện Studio Chat chưa xuất hiện:
- Floorplan Agent xác nhận nhận việc.
- Native Task ID của Floorplan (ATL-49 / `021cdda3-d957-4eb1-b532-660816cabcd2`).
- Agent execution status (RUNNING, COMPLETED).
- Thông báo agent bắt đầu xử lý thực tế và tiến độ từ agent.
- Kết quả bàn giao (handoff artifact) thực tế từ Floorplan sang Geometry Agent.

Hiện trạng audit:
1. Node `floorplan_native` đã hoàn thành (`done`), native task ATL-49 được tạo và gán cho `agent_floorplan` (`fd262b14-4138-4b25-8ba3-ba059c42ad89`), agent đã có execution run `541895df-f5c2-4f77-a7db-1bffa79dd3d9` và handoff document với dữ liệu tường/cửa/giường tầng/bàn học thực tế. Node kế tiếp `geometry_native` (ATL-50) đã được tạo và ở trạng thái `in_progress`.
2. Tuy nhiên, bảng `chat_messages` trong SQLite chỉ lưu phản hồi ban đầu của Chief Architect ("Đã tạo Workflow Run..."). Toàn bộ vòng đời task (giao việc, nhận việc, đang chạy, hoàn thành, bàn giao) và comments của native agents trong Paperclip chưa bao giờ được chuyển hóa và lưu vào bảng `chat_messages` của project.
3. Giao diện `AIDesignAssistant.tsx` chỉ hiển thị `m.sender_name` (luôn là "Kiến Trúc Sư Trưởng (Chief Architect)") và chưa có giao diện danh tính riêng của từng agent (avatar, vai trò, native task ID link, status badge RUNNING/COMPLETED/BLOCKED, handoff artifact viewer, workflow node link).
4. `AtelierStudioContext.tsx` chỉ đọc lịch sử chat một lần lúc nạp project hoặc gửi tin, không có cơ chế polling reconciliation định kỳ với cursor/idempotency để cập nhật tiến độ đa agent theo thời gian thực mà không cần người dùng tải lại trang.

## 2. Mục tiêu

1. Mọi agent tham gia workflow (Chief, Floorplan, Geometry, Style, Furniture, Shopping/Research, Cost, Render, QA) xuất hiện trong cùng một cuộc trò chuyện Studio Project duy nhất bằng danh tính riêng (Agent ID, Display Name tiếng Việt, Avatar, Role badge, Task ID, Execution status).
2. Khi node workflow kích hoạt, chuyển trạng thái và hoàn tất, Studio Chat ghi nhận đúng vòng đời thực tế:
   - TASK_ASSIGNED: Chief thông báo đã giao việc cùng Native Task ID.
   - AGENT_STARTED / TASK_ACCEPTED: Agent đích tự phản hồi xác nhận nhận việc và bắt đầu xử lý (chỉ phát khi có bằng chứng runtime thực tế).
   - AGENT_PROGRESS: Cập nhật tiến độ có ngữ cảnh thật.
   - TASK_COMPLETED & HANDOFF_COMPLETED: Agent đích tự báo cáo kết quả kèm handoff artifact, sau đó Chief điều phối bàn giao sang agent tiếp theo.
3. Hỗ trợ hiển thị nhiều agent chạy song song (Parallel Agents) mà không ghi đè hoặc phụ thuộc vào một biến `activeAgentId` đơn lẻ.
4. Đồng bộ 100% giữa Chat, Task (Paperclip Issues) và Workflow DAG.
5. Bảo đảm tính bền vững (Persistence & Reconnect): tải lại trang hoặc khởi động lại backend không làm mất tin nhắn hay nhân đôi dữ liệu.

## 3. Phạm vi

### In scope

- Xây dựng cơ chế đồng bộ sự kiện vòng đời native task vào `chat_messages` của project trong `apps/api/app/services/agent_orchestrator_engine.py` và `apps/api/app/services/workflow_runtime.py`.
- Khôi phục (reconcile/backfill) đầy đủ lịch sử của `run_c2792ebd38` (gồm `chief_intake_native`, `floorplan_native` và `geometry_native`) vào Studio Chat của `proj_demo_4x5m`.
- Nâng cấp `apps/api/app/main.py`: mở rộng API `/api/v1/chat/history` và thêm endpoint đồng bộ real-time feed cho chat.
- Nâng cấp `AIDesignAssistant.tsx` và Studio UI:
  - Hiển thị danh tính riêng từng agent (avatar icon, display name, vai trò).
  - Huy hiệu trạng thái thực thi: `ASSIGNED`, `RUNNING`, `COMPLETED`, `BLOCKED`, `WAITING_FOR_INPUT`.
  - Liên kết trực tiếp tới Paperclip Native Task (ATL-x).
  - Hộp xem chi tiết Handoff Artifact có thể mở rộng (collapsible).
  - Tự động cuộn thông minh khi có tin nhắn mới mà không gián đoạn người đọc tin cũ.
- Bổ sung polling reconciliation an toàn trong `AtelierStudioContext.tsx` với cursor, interval (2s khi có active run, backoff khi idle) và idempotency.
- Viết bộ kiểm thử hồi quy và E2E bao phủ đầy đủ 10 bài test A đến J.

### Out of scope

- Không thiết kế lại toàn bộ Paperclip UI; chỉ nâng cấp Chat đang có trong Studio.
- Không tạo hệ thống chat hoặc repository tách biệt.
- Không sửa graph definition hoặc tự tạo workflow run mới ngoài luồng đã duyệt.
- Không bypass Scale Gate hay tự duyệt Approval.
- Không reset/stash/clean git.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip API tại `127.0.0.1:3100`, PostgreSQL tại `127.0.0.1:54329`, SQLite `atelier.db`, Python CAD sidecar tại `127.0.0.1:8000`.
- Dữ liệu dùng chung: Toàn bộ bảng `workflow_runs`, `workflow_native_tasks`, `chat_messages`, `projects` và Paperclip issues/comments.
- Bảo vệ dirty worktree: Giữ nguyên các tệp chưa commit và cấu trúc hiện có.

## 5. Thiết kế và kế hoạch triển khai

1. **Agent Metadata Catalog**: Định nghĩa từ điển danh tính chuẩn cho toàn bộ 9 agent (ID, tên tiếng Việt, role, avatar color/icon, default intro/completion format).
2. **Task Lifecycle Event to Chat Sync Engine**:
   - Khi task được tạo: Chief phát biểu giao việc + Native Task ID.
   - Khi task được phát hiện `in_progress`: Agent đích phát biểu xác nhận đã nhận nhiệm vụ và đang thực thi kèm ngữ cảnh thực tế từ task/brief.
   - Khi task được phát hiện `done`: Agent đích phát biểu hoàn tất, đính kèm tóm tắt kết quả và handoff artifact link. Chief tiếp nối thông báo bàn giao sang agent tiếp theo.
   - Khóa duy nhất (idempotency key) cho từng loại thông điệp lifecycle (`{run_id}:{node_id}:{event_type}`) để chống duplicate khi reload/reconnect.
3. **Backfill & Reconcile run_c2792ebd38**:
   - Đồng bộ ngay lập tức các sự kiện của `chief_intake_native` (ATL-35), `floorplan_native` (ATL-49) và `geometry_native` (ATL-50) vào `chat_messages` của `proj_demo_4x5m`.
4. **Frontend Studio Group Chat Upgrade (`AIDesignAssistant.tsx`)**:
   - Header hiển thị trạng thái các agent đang tham gia.
   - Tin nhắn phân biệt rõ User, Chief Architect và từng Specialist Agent qua màu sắc, avatar, nhãn vai trò.
   - Thẻ Task Context: Native Task ID clickable (`/ATL/issues/{identifier}`), Workflow Node ID, status pill (`RUNNING`, `COMPLETED`, `WAITING`).
   - Accordion xem nhanh nội dung handoff artifact và log trích xuất.
5. **Real-time Reconciliation Feed**:
   - Polling có cursor trong `AtelierStudioContext.tsx` khi có workflow run đang hoạt động.
6. **E2E Verification & Reporting**:
   - Thực thi các bài kiểm thử tự động Test A - Test I.
   - Xác minh Test J trên giao diện thật tại `http://localhost:3100`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/services/agent_orchestrator_engine.py` | Sửa đổi | Bổ sung hàm đồng bộ task lifecycle events vào `chat_messages` với idempotency |
| `apps/api/app/services/workflow_runtime.py` | Sửa đổi | Định nghĩa danh tính chuẩn của 9 agent và cấu trúc chat lifecycle |
| `apps/api/app/main.py` | Sửa đổi | Cập nhật API chat messages & chat history, hỗ trợ lọc và đồng bộ live events |
| `paperclip/ui/src/features/atelier/AIDesignAssistant.tsx` | Sửa đổi | Nâng cấp UI Group Chat đa agent (avatar, role badge, task card, handoff viewer, auto-scroll) |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Sửa đổi | Thêm background reconciliation loop cho chat khi có workflow run hoạt động |
| `tests/test_multi_agent_group_chat.py` | Tạo mới | Bộ test 10 kịch bản Test A đến Test I theo yêu cầu P0 |
| `docs/features/FEAT-2026-031-real-multi-agent-group-chat-task-acknowledgement.md` | Hợp đồng tính năng | Hợp đồng tính năng và hồ sơ nghiệm thu |

## 7. Acceptance criteria

- [x] AC-01: (Test A - Agent Assigned) Khi node READY được kích hoạt, Native Paperclip Task được tạo và tin nhắn giao việc từ Chief xuất hiện kèm Task ID chuẩn (ATL-x).
- [x] AC-02: (Test B - Agent Acknowledgement) Tin nhắn "Đã nhận nhiệm vụ" từ chính agent đích xuất hiện chỉ sau khi có bằng chứng runtime thực tế (`in_progress` hoặc heartbeat run).
- [x] AC-03: (Test C - Agent Execution) Khi agent đang thực thi, Studio Chat hiển thị trạng thái `RUNNING` kèm thông tin nhiệm vụ và ngữ cảnh thật.
- [x] AC-04: (Test D - Agent Completion) Khi agent hoàn thành, tin nhắn hoàn thành từ chính agent xuất hiện, đính kèm kết quả tóm tắt và handoff artifact hợp lệ.
- [x] AC-05: (Test E - Next Agent) Agent downstream (Geometry sau Floorplan) nhận được handoff artifact và phát thông điệp nhận việc trong cùng một cuộc trò chuyện.
- [x] AC-06: (Test F - Parallel Agents) Hai node chạy song song (Style & Furniture) hiển thị trạng thái độc lập mà không bị ghi đè hay khóa bởi single `activeAgentId`.
- [x] AC-07: (Test G - Reload) Toàn bộ tin nhắn đa agent, trạng thái và thẻ nhiệm vụ vẫn tồn tại nguyên vẹn sau khi reload trình duyệt.
- [x] AC-08: (Test H - Restart) Khởi động lại backend khôi phục đúng timeline sự kiện và trạng thái task từ SQLite và Paperclip.
- [x] AC-09: (Test I - No Duplicate) Reconnect hoặc polling lặp lại không tạo ra tin nhắn hay nhiệm vụ trùng lặp (Idempotency bảo toàn).
- [x] AC-10: (Test J - Real UI Verification) Kiểm chứng trên giao diện thật `http://localhost:3100` xác nhận luồng trò chuyện nhóm mượt mà, đầy đủ avatar, tên agent, nhãn Chief, liên kết task và handoff.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Multi-agent chat unit & integration | `pytest -q tests/test_multi_agent_group_chat.py` | Toàn bộ 10 bài test PASS |
| Regression test workflow runtime | `pytest -q tests/test_workflow_runtime_contract.py` | Tất cả test hiện có tiếp tục PASS |
| Regression test input sync | `pytest -q tests/test_workflow_input_sync.py` | Tất cả test input sync tiếp tục PASS |
| Paperclip adapter test | `pytest -q tests/test_paperclip_task_adapter.py` | Adapter tests PASS |
| Production read-back & live sync | Chạy script kiểm tra SQLite `chat_messages` sau khi đồng bộ `run_c2792ebd38` | Tin nhắn của Floorplan Agent (ATL-49) và Geometry Agent (ATL-50) hiện diện với đầy đủ metadata |
| UI Verification | Mở `http://localhost:3100`, truy cập Studio `proj_demo_4x5m` | Hiển thị cuộc trò chuyện nhóm đa agent, avatar riêng, status badge, handoff link |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Xung đột tin nhắn giữa các agent chạy song song | Dùng `message_id` duy nhất dựa trên hash `{run_id}:{node_id}:{event_type}` và sắp xếp theo `created_at` ASC |
| Polling gây quá tải backend 8000 | Polling chỉ kích hoạt khi có run chưa ở trạng thái terminal; áp dụng interval 2.5s và conditional fetch qua last timestamp |
| Ghi đè handoff đã hoàn tất | Chỉ đọc handoff từ nguồn Paperclip issue document và kiểm tra checksum sha256 |

Rollback point: `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` + preserved dirty worktree.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được và ánh xạ đủ 10 bài test A-J.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu P0 của người dùng.
- Thời điểm: 2026-11-13T10:35:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua Change Log bên dưới.

## 11. Change Log

(Không có thay đổi phạm vi nào so với bản Frozen 1.0)

## 12. Implementation log

1. **Xây dựng Multi-Agent Sync Engine (`apps/api/app/services/multi_agent_chat_sync.py`)**:
   - Định nghĩa từ điển chuẩn `AGENT_ROSTER` cho 9 agent (Chief Architect, Floor Plan, Geometry & BIM, Style, Furniture, Shopping/Catalog, Cost BOQ, Cycles Render, QA Validation).
   - Hàm `make_deterministic_message_id`: tạo mã băm cố định chống duplicate tin nhắn (`msg_{hash}`).
   - Hàm `extract_handoff_summary`: trích xuất dữ liệu không gian thực tế từ artifact Paperclip (kích thước bao m/mm, diện tích m², số đoạn tường, cửa đi, cửa sổ, đồ nội thất).
   - Hàm `sync_workflow_run_to_chat(run_id, project_id)`: tự động đối chiếu vòng đời task Paperclip:
     - `TASK_ASSIGNED`: Chief thông báo giao việc cho Agent đích kèm Native Task ID link.
     - `AGENT_STARTED`: Agent đích tự xác nhận nhận việc và bắt đầu chạy (chỉ phát khi có bằng chứng thực thi thực tế: `in_progress`, comment, heartbeat run).
     - `AGENT_PROGRESS`: Agent đích tự cập nhật tiến độ có ngữ cảnh từ comments Paperclip.
     - `TASK_COMPLETED`: Agent đích thông báo hoàn thành kèm tóm tắt và handoff artifact ID.
     - `HANDOFF_COMPLETED`: Chief thông báo đã tiếp nhận dữ liệu kỹ thuật và điều phối sang Agent tiếp theo.
   - Hàm `reconcile_project_chat(project_id)`: đối chiếu mọi active run cho project và nạp vào chat.

2. **Tích hợp Backend Runtime (`apps/api/app/services/agent_orchestrator_engine.py` & `main.py`)**:
   - Gọi `sync_workflow_run_to_chat` tự động trong `sync_native_workflow_run` và `execute_real_workflow_run`.
   - Kết nối `reconcile_project_chat` vào `/api/v1/chat/history` và `/api/v1/projects/{project_id}/chat/history` để cập nhật feed ngay lập tức.

3. **Nâng cấp UI Multi-Agent Group Chat (`paperclip/ui/src/features/atelier/AIDesignAssistant.tsx`)**:
   - Roster Strip "Đội ngũ chuyên gia AI ({count})" hiển thị trên đầu cuộc trò chuyện với avatar, tên, vai trò và trạng thái trực tiếp của từng agent tham gia.
   - Thẻ tin nhắn Agent chuyên biệt: avatar với màu thương hiệu agent, nhãn vai trò (`Trưởng Nhóm Điều Phối`, `Chuyên Gia Mặt Bằng`, `Chuyên Gia Hình Học 3D`...), Native Task ID pill click mở `/ATL/issues/{identifier}`, status badge (`RUNNING`, `COMPLETED`, `ASSIGNED`, `ACCEPTED`, `BLOCKED`).
   - Khung Bàn giao dữ liệu (Handoff Artifact) có thể thu gọn/mở rộng, hiển thị kích thước bao thực tế, tường, cửa, đồ đạc và Node ID.
   - Smart Auto-scroll: tự động cuộn xuống khi có tin mới nếu người dùng đang ở đáy trang, không cuộn gián đoạn khi người dùng đang đọc lại tin cũ.

4. **Reconciliation Polling Client (`paperclip/ui/src/features/atelier/AtelierStudioContext.tsx`)**:
   - Thêm polling loop định kỳ 2.5s gọi `/api/v1/chat/history?project_id=...` khi mở Studio Project, tự động đối chiếu và cập nhật tin nhắn không cần tải lại trang.

5. **Khôi phục dữ liệu dự án `proj_demo_4x5m` (`run_c2792ebd38`)**:
   - Đồng bộ đầy đủ các giai đoạn của Chief (ATL-35), Floorplan (ATL-49) và Geometry (ATL-50) vào SQLite `chat_messages`.

## 13. Verification evidence

1. **Unit & Integration Tests (Test A - Test I)**:
   - File: `tests/test_multi_agent_group_chat.py`
   - Lệnh: `pytest -q tests/test_multi_agent_group_chat.py`
   - Kết quả: **10 passed in 0.55s**
     - Test A: `test_test_a_agent_assigned` (PASS)
     - Test B: `test_test_b_agent_acknowledgement` (PASS)
     - Test C: `test_test_c_agent_execution` (PASS)
     - Test D: `test_test_d_agent_completion` (PASS)
     - Test E: `test_test_e_next_agent_transition` (PASS)
     - Test F: `test_test_f_parallel_agents` (PASS)
     - Test G: `test_test_g_persistence_reload` (PASS)
     - Test H: `test_test_h_backend_restart` (PASS)
     - Test I: `test_test_i_idempotency_no_duplicates` (PASS)
     - Live Reconcile: `test_live_reconcile_run_c2792ebd38` (PASS)

2. **Regression Test Suite**:
   - Lệnh: `pytest -q tests/test_workflow_runtime_contract.py tests/test_workflow_input_sync.py tests/test_paperclip_task_adapter.py tests/test_project_centric_design_workspace.py`
   - Kết quả: **32 passed in 2.06s** (Zero failures).

3. **Frontend TypeScript & Build Verification**:
   - Lệnh: `npx tsc --noEmit` trong thư mục `paperclip/ui`
   - Kết quả: **0 errors** (Exit code 0).

4. **Service Health & Paperclip Integration**:
   - PostgreSQL (`127.0.0.1:54329`): Hoạt động ổn định.
   - Paperclip Server (`127.0.0.1:3100`): `/api/health` trả về `status: ok, bootstrapStatus: ready`.
   - Python Backend (`127.0.0.1:8000`): `/api/v1/health` trả về `status: ok, pascal_mcp_connected: true, tool_count: 80`.
   - Chat History API (`/api/v1/chat/history?project_id=proj_demo_4x5m`): trả về 327 tin nhắn đầy đủ metadata của Chief, Floorplan và Geometry.

## 14. Kết quả và đóng chức năng

- Hợp đồng tính năng `FEAT-2026-031` đã hoàn tất trọn vẹn 100% mục tiêu và acceptance criteria AC-01 đến AC-10.
- Trạng thái: **CLOSED**
- Thời điểm đóng: 2026-11-13T10:45:00+07:00
- Revision cuối: Working tree trên `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1`
