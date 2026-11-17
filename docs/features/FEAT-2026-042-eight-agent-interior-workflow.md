# [FEAT-2026-042] Workflow nội thất 8 agent và Floorplan Contract

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | User request 2026-11-14 |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T22:10:00+07:00 |
| Revision bắt đầu | Dirty worktree được giữ nguyên |
| Revision cuối | 68499c8 + scoped working-tree implementation |

## 1. Bối cảnh

Workflow mặc định hiện có 14 node, tách Catalog/Shopping thành một agent riêng
không được Paperclip resolve ổn định và để Style chặn nhánh downstream vì các
quyết định không cần thiết cho geometry. Floorplan là nguồn hình học quan trọng
nhất nhưng completion contract hiện mới nằm trong prose; Geometry vẫn có thể
nhận một handoff thiếu hệ tọa độ, tường, cửa hoặc nguồn kích thước.

## 2. Mục tiêu

Thay workflow mặc định cho các run mới bằng 8 agent chuyên biệt: Chief,
Floorplan, Geometry, Style, Furniture, Cost & Specification, Render và QA.
Mọi run chỉ đọc snapshot. Floorplan phải phát hành artifact có nguồn, hệ tọa
độ, scale, room boundary, walls, openings và furniture anchors; thiếu trường
bắt buộc thì Geometry không được READY.

## 3. Phạm vi

### In scope

- Workflow mặc định 8 agent, graph động, không hardcode route trong scheduler.
- Gộp Shopping/Specification vào Cost Agent; không tạo Shopping task mặc định.
- Style và Furniture chạy song song sau Geometry.
- Render chịu camera, ánh sáng và kết xuất; không có Lighting Agent.
- QA kiểm tra Floorplan trước Geometry và kiểm tra độc lập đầu ra cuối.
- Prompt/skill contract chuyên biệt cho cả 8 agent.
- Floorplan completion schema và validator trước khi mở Geometry.
- Tài liệu Markdown vận hành toàn dự án và tài liệu từng agent.
- Nâng workflow hiện tại lên version mới mà không sửa snapshot/run cũ.

### Out of scope

- Không viết lại scheduler, registry hoặc Paperclip.
- Không sửa scene/revision/render hiện có.
- Không tự tạo giá, kích thước hoặc approval còn thiếu.
- Không xóa agent/task/run lịch sử; Shopping chỉ bị loại khỏi graph mặc định.
- Không thay provider, model, API key hoặc service port.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: workflow snapshot, native handoff, agent prompts, Project binding.
- Dữ liệu: `atelier.db`, projects, revisions, workflow runs/tasks/artifacts.
- Service: Paperclip 3100 và API 8000 giữ nguyên; không proxy sang port khác.
- Dirty worktree của user không reset, stash, clean hoặc ghi đè.

## 5. Thiết kế và kế hoạch triển khai

1. Định nghĩa graph version mới bằng node type, edge và agent assignment.
2. Nâng prompt/skill của 8 agent, đặc biệt Floorplan và QA.
3. Thêm Floorplan Contract validator dùng dữ liệu artifact thật, không prose.
4. Chặn Geometry khi Floorplan/QA artifact thiếu hoặc không hợp lệ.
5. Viết tài liệu tổng và tài liệu từng agent.
6. Chạy test graph, prompt, validator và migration; sau đó áp dụng definition
   mới cho workflow mặc định hiện tại. Run cũ tiếp tục dùng snapshot cũ.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/db.py` | default agents/workflow + safe migration | Workflow 8 agent cho run mới |
| `apps/api/app/services/agent_prompts.py` | prompt/skill registry | Chuyên môn hóa agent |
| `apps/api/app/services/agent_orchestrator_engine.py` | registry/admission | Floorplan QA và handoff gate |
| `apps/api/app/services/workflow_runtime.py` | validator | Enforce Floorplan Contract |
| `tests/test_eight_agent_workflow.py` | focused tests | Graph, skills, Floorplan gate |
| `docs/ATELIER_8_AGENT_WORKFLOW.md` | tài liệu tổng | Vận hành toàn dự án |
| `docs/agents/*.md` | tài liệu agent | Skill/input/output/boundary |
| live `wf_default_interior_pipeline` | version mới | Áp dụng cho Project hiện tại |

## 7. Acceptance criteria

- [x] AC-01: Workflow mặc định có đúng 8 agent chuyên biệt; không Lighting hoặc Shopping node.
- [x] AC-02: Graph là Chief → Floorplan → Floorplan QA → Geometry → Style/Furniture song song → Cost/Render → Final QA.
- [x] AC-03: Floorplan artifact bắt buộc có source identity/hash, coordinate system, scale status/source, room boundary, walls, openings và furniture anchors.
- [x] AC-04: Mọi số đo có `value_mm`, `status` và `source`; UNKNOWN không được biến thành số thi công.
- [x] AC-05: Wall/opening/anchor references không hợp lệ hoặc polygon hở làm Floorplan QA FAIL và chặn Geometry.
- [x] AC-06: Style thiếu mã sản phẩm và Cost thiếu giá không chặn render concept; đầu ra phải ghi provisional/unverified.
- [x] AC-07: Agent prompts nêu rõ skill, input, output, quyền và điều cấm; Chief không làm thay agent.
- [x] AC-08: Run cũ/snapshot cũ không bị sửa; Project/revision/scene hiện có không đổi.
- [x] AC-09: Tài liệu tổng và tài liệu 8 agent tồn tại, UTF-8 tiếng Việt hợp lệ.
- [x] AC-10: Focused tests, compile và diff check PASS.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Workflow graph | focused pytest | 8 agent, DAG hợp lệ, đúng join/parallel |
| Floorplan contract | valid/invalid fixtures | valid PASS; thiếu source/wall/ref FAIL |
| Agent skills | prompt registry tests | 8 prompt có boundary và output contract |
| Migration | copy DB/transaction audit | version mới, run cũ giữ snapshot |
| Regression | native handoff/runtime tests | PASS |
| Static | compileall, diff check, Unicode scan | PASS |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Floorplan cũ không đạt contract mới | Chỉ enforce cho workflow version mới; báo lỗi rõ |
| Workflow đang chạy bị đổi route | Run dùng snapshot, chỉ run mới đọc version mới |
| Cost/Render bị join sai | Focused graph tests cho cả hai nhánh |
| Prompt quá dài hoặc chồng quyền | Skill boundary và output contract riêng từng agent |

Rollback point: khôi phục definition workflow version trước và các prompt hunks
của feature này; không xóa run/task/artifact đã phát sinh.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của user.
- Thời điểm: 2026-11-14T22:10:00+07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14T22:10:00+07:00 | Dirty worktree preserved | Contract frozen | Chưa sửa implementation |
| 2026-11-14T22:20:00+07:00 | 68499c8 + working tree | Implemented workflow v3, agent skills and Floorplan Contract admission | Existing run snapshots preserved |
| 2026-11-14T22:25:00+07:00 | Live SQLite | Migrated `wf_default_interior_pipeline` v2 → v3 and agent profiles → 2.0.0 | Project/revision/run counts unchanged |
| 2026-11-14T22:28:00+07:00 | Backend PID 28612 | Restarted verified Uvicorn service on port 8000 | Health OK; no proxy or alternate port |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-14T22:24:00+07:00 | Working tree | Focused graph, Floorplan contract, handoff and runtime tests | PASS | `49 passed in 4.52s` |
| 2026-11-14T22:24:00+07:00 | Working tree | Python compile and diff validation | PASS | `compileall` exit 0; `git diff --check` exit 0 (line-ending warnings only) |
| 2026-11-14T22:25:00+07:00 | Live SQLite | Safe migration audit | PASS | Workflow 2/14 nodes → version 3/10 nodes; 29 projects, 379 revisions and 78 runs unchanged |
| 2026-11-14T22:28:00+07:00 | Live API 8000 | Reload verification | PASS | Health OK; workflow version 3 visible; Floorplan prompt contains Floorplan Contract and `furniture_anchors` |

## 14. Kết quả và đóng chức năng

- Kết quả: Workflow v3 gồm 8 agent chuyên biệt đã được áp dụng; Floorplan Contract và QA admission chặn Geometry khi dữ liệu sai/thiếu.
- Hạn chế còn lại: Run đã tạo trước version 3 tiếp tục dùng snapshot cũ theo thiết kế; chưa chạy một production E2E mới vì việc đó sẽ tạo Native Tasks thật.
- Việc chưa hoàn tất: Chạy một Project mới qua workflow v3 khi có input bản vẽ thật.
- Rollback point: Working tree trước FEAT-2026-042.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-14T22:28:00+07:00
