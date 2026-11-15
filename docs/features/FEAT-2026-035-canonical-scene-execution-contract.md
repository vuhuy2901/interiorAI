# [FEAT-2026-035] Hợp đồng thực thi Scene chuẩn cho task thiết kế

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.3 |
| Owner | Codex / ATELIER AI |
| Người chấp thuận | Người dùng dự án |
| Ngày tạo | 2026-11-15 |
| Frozen at | 2026-11-15 (Asia/Saigon) |
| Revision bắt đầu | `3d28633d` |
| Revision cuối | Worktree đã kiểm thử, chưa commit |

## 1. Bối cảnh

Task thiết kế từ Telegram/Paperclip có thể nhận đúng native project và canonical
scene nhưng Agent chuyên môn vẫn gọi một MCP scene rỗng hoặc không được bind. Kết
quả là task bị chuyển qua lại giữa `todo`/`blocked`, báo thiếu gateway, hoặc dừng
trước Geometry, QA và BOQ dù canonical REST scene vẫn tồn tại và có revision hợp lệ.

Sự cố đang quan sát trên ATL-27: native project
`eb654960-2510-46d6-ade9-ea68a70bf64f` phải ánh xạ duy nhất tới canonical scene
`proj_bedroom_japandi_4x4m`, hiện là phòng 6.00m × 6.00m ở revision 12.

## 2. Mục tiêu

Tạo một hợp đồng thực thi backend dùng chung cho mọi task thiết kế ATELIER: resolve
đúng project/scene, đọc snapshot/revision thật, chỉ mutation trên snapshot đó, kiểm
tra kết quả đã persist rồi mới handoff Geometry → QA → Cost/BOQ → Final Review.

## 3. Phạm vi

### In scope

- Chuẩn hóa việc resolve native Paperclip project sang đúng một canonical Pascal scene.
- Preflight scene trước khi Agent chạy: scene tồn tại, không rỗng, revision khớp và endpoint sẵn sàng.
- Cấp cho Agent một đường API/tool được hỗ trợ để đọc, sửa, kiểm tra và persist canonical scene.
- Không cho phép gateway tự dùng default/empty scaffold khi task có canonical scene.
- Phân loại lỗi có cấu trúc: dependency tạm thời, thiếu dữ liệu người dùng, QA fail, xung đột revision và lỗi vĩnh viễn.
- Retry có giới hạn cho lỗi tạm thời; human review chỉ dùng khi thực sự cần quyết định của người dùng.
- Handoff giữ nguyên company, native project, canonical scene và revision/evidence.
- Khôi phục ATL-27 qua API/runtime bình thường sau khi bản sửa được nạp.

### Out of scope

- Không thay PostgreSQL, migration hoặc xóa lịch sử task.
- Không tạo project/scene mới để né lỗi binding.
- Không thay toàn bộ kiến trúc Paperclip, model AI hoặc giao diện thiết kế.
- Không cam kết tự hoàn thành yêu cầu thiếu thông số bắt buộc hoặc hành động cần phê duyệt của con người.

## 4. Dependency và tài nguyên cần bảo vệ

- Paperclip API/UI: `127.0.0.1:3100`.
- Pascal/FastAPI canonical scene API: `127.0.0.1:8000`.
- PostgreSQL hiện có và toàn bộ dữ liệu task/project/scene hiện có.
- Telegram poller và token/chat ID hiện có; không ghi token vào log/test/contract.
- Bảo vệ revision 12 của `proj_bedroom_japandi_4x4m`; mutation phải dùng optimistic revision guard.

## 5. Thiết kế và kế hoạch triển khai

1. Tách một service resolve/preflight canonical scene từ context task.
2. Chuẩn hóa payload scene execution gồm company, native project, canonical scene,
   expected revision, snapshot và endpoint được phép.
3. Buộc Pascal gateway nhận snapshot thật; từ chối task-bound call nếu snapshot rỗng.
4. Chèn execution contract vào prompt/context của mọi Agent thiết kế và handoff.
5. Chuẩn hóa outcome/retry để lỗi dependency không biến thành vòng lặp blocked mơ hồ.
6. Thêm test cho binding, empty scaffold, stale revision, handoff và persistence evidence.
7. Nạp lại server, kiểm tra health, rồi retry ATL-27 qua API bình thường.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-telegram/project-context.ts` | Sửa | Trả execution context chuẩn, có preflight/evidence |
| `paperclip/server/src/routes/atelier-scene.ts` | Sửa | Một đường đọc/mutation canonical có revision guard |
| `paperclip/server/src/services/atelier-workflow-handoff.ts` | Sửa | Giữ scene identity và evidence qua handoff |
| `paperclip/server/src/services/atelier-telegram/task-manager.ts` | Sửa | Chèn execution contract cho task Telegram |
| `paperclip/server/src/services/atelier-clarification-policy.ts` và ATELIER roster bootstrap | Sửa | Dạy mọi specialist dùng bound MCP/REST path và không báo done thiếu evidence |
| `packages/pascal-adapter/gateway.mjs` | Sửa | Chặn default scaffold và sync snapshot thật |
| `apps/api/app/main.py` và `apps/api/app/services/mcp_gateway.py` | Sửa | Bind mọi MCP call vào persisted canonical project snapshot |
| `apps/api/app/db.py` | Sửa | Migration an toàn cho allowlist Agent, thay các tên Pascal tool đã lỗi thời |
| `apps/api/app/services/scene_furniture.py` | Sửa | Ghi layout nội thất có revision guard, QA, Pascal sync và persistence evidence |
| `tests/test_acceptance.py` và test MCP regression mới | Sửa/thêm | Chứng minh endpoint không còn mở default scene rỗng |
| Test liên quan trong `paperclip/server/src/**` và `packages/pascal-adapter/**` | Thêm/sửa | Chứng minh regression không tái diễn |

Danh sách có thể thu hẹp sau điều tra; mở rộng ra component khác cần Change Request.

## 7. Acceptance criteria

- [x] AC-01: Task có native project hợp lệ resolve đúng một canonical scene; 0 hoặc >1 scene trả lỗi có cấu trúc, không đoán fallback.
- [x] AC-02: Agent đọc được snapshot thật của scene và revision trước mọi mutation.
- [x] AC-03: Gateway từ chối empty/default scaffold đối với task đã bind scene.
- [x] AC-04: Mutation dùng expected revision và xác nhận revision mới/persisted scene trước handoff.
- [x] AC-05: Geometry, QA và BOQ nhận cùng scene identity; không handoff bằng ID native project như Pascal scene ID.
- [x] AC-06: Lỗi tạm thời retry có giới hạn; thiếu quyết định người dùng chuyển review; QA fail có remediation; không loop vô hạn.
- [x] AC-07: Không task nào được báo `done` nếu chưa có deliverable/evidence bắt buộc của phase.
- [x] AC-08: ATL-27 được retry trên `proj_bedroom_japandi_4x4m`; không tạo scene/project mới và không mất dữ liệu revision 12.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit binding/preflight | Vitest targeted | 0/1/n scene, empty snapshot, stale revision đều đúng contract |
| Gateway snapshot | Node test/targeted invocation | Snapshot thật được load; default scaffold bị từ chối |
| Route mutation | `atelier-scene` route tests | Revision guard và persistence evidence pass |
| Workflow handoff | targeted handoff tests | Scene identity/evidence không bị mất |
| Live health | GET health 3100/8000 | Hai service healthy sau restart |
| Live regression | Retry ATL-27 và đọc scene/task events | Geometry dùng canonical scene, rồi QA/BOQ tiếp tục hoặc trả remediation cụ thể |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Ghi nhầm scene | Resolve duy nhất + company/project scope + expected revision |
| Ghi đè revision mới | Optimistic revision guard; reread trước mutation |
| Retry storm | Retry budget/idempotency key và structured terminal outcome |
| Agent báo xong giả | Phase evidence gate trước status/handoff |
| Ảnh hưởng task cũ | Adapter tương thích ngược, nhưng cấm fallback khi đã có canonical binding |

Rollback point: revision `3d28633d`; rollback chỉ các file thuộc contract, không reset
worktree hoặc dữ liệu người dùng. Nếu live mutation chưa đạt, giữ task ở trạng thái
có thể retry với evidence rõ ràng, không đánh dấu hoàn tất.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu “chỉnh để backend chạy mượt cho tất cả task”.
- Thời điểm: 2026-11-15 (Asia/Saigon).

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-15 | Mở rộng phạm vi sang FastAPI MCP endpoint và regression test | Điều tra xác nhận `/api/v1/mcp/call` bỏ qua persisted `pascal_scene_json`, khiến short-lived gateway luôn đọc default scaffold | Không đổi schema; endpoint yêu cầu canonical `project_id`, optional `expected_revision`, rồi truyền snapshot thật vào gateway | Người dùng yêu cầu tiếp tục sửa backend hệ thống | 1.1 |
| CR-002 | 2026-11-15 | Cập nhật instruction contract/roster bootstrap | Sửa API nhưng Agent cũ vẫn có thể tiếp tục gọi generic `get_scene`; cần chỉ dẫn chuẩn ở runtime và task | Không thay model/quyền; chỉ thay đường đọc scene và evidence gate | Người dùng yêu cầu backend vận hành ổn định cho mọi task | 1.2 |
| CR-003 | 2026-11-15 | Chuẩn hóa registry MCP và thêm canonical furniture-layout write | Live retry ATL-27 cho thấy snapshot đã đúng nhưng 9 Agent vẫn có allowlist tên tool cũ (`update_node`, `move_items`, `get_scene_info`); MCP mutation không tự persist canonical scene | Migration giữ các tool hợp lệ, map alias cũ sang tool thật; unavailable tool trả lỗi cấu trúc; layout write dùng CAS/revision và sync lại 2D/3D/BOQ | Người dùng yêu cầu sửa backend hệ thống thay vì chữa từng task | 1.3 |
| CR-004 | 2026-11-15 | Cứng hóa runtime Windows và đồng bộ báo cáo nghiệm thu sau comment Agent | Live ATL-28 phát hiện symlink skill bị Windows chặn, PowerShell 5 lỗi với `Invoke-WebRequest`, managed instruction bị stale và Approval được tạo trước comment kết quả cuối | Copy fallback cho skill injection; dùng REST client tương thích; tự sửa instruction drift; routing nội thất ưu tiên đúng Agent; Approval luôn làm mới bằng comment Agent được ghi sau lúc tạo phiếu | Người dùng yêu cầu tiếp tục sửa tới khi task thoát blocked và có thể nghiệm thu | 1.4 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-15 | worktree | Bind MCP vào canonical snapshot và chặn empty scaffold | Mọi call yêu cầu `project_id`; hỗ trợ revision guard |
| 2026-11-15 | worktree | Chuẩn hóa allowlist MCP cho 9 Agent | Alias cũ được map sang tool đang cài; tool không tồn tại trả lỗi cấu trúc |
| 2026-11-15 | worktree | Thêm canonical furniture-layout write | CAS revision, idempotency, QA, BOQ và Pascal SceneGraph sync |
| 2026-11-15 | worktree | Sửa final approval gate | Không dùng blocker/comment cũ làm báo cáo nghiệm thu; không tự chuyển `done` |
| 2026-11-15 | worktree | Sửa race giữa chuyển `in_review` và comment cuối | Sau khi lưu comment Agent, Approval được materialize lại; comment sau thời điểm tạo Approval vẫn được dùng dù người dùng mở phiếu sau 5 phút |
| 2026-11-15 | worktree | Cứng hóa Codex runtime trên Windows | Khi không tạo được symlink skill do `EPERM`/`EACCES`, adapter copy bundle vào runtime thay vì làm run thất bại |
| 2026-11-15 | worktree | Sửa instruction drift và control-plane client | Bootstrap ghi lại AGENTS.md stale; policy v6 yêu cầu `Invoke-RestMethod`/`curl.exe` và recovery action chính thức |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-15 | worktree | Python acceptance/cost/scene suite | PASS, 29 tests | `pytest tests/test_acceptance.py tests/test_cost_engine_price_coverage.py tests/test_scene_furniture.py -q` |
| 2026-11-15 | worktree | Telegram/project context suite | PASS, 31 tests | 2 Vitest files |
| 2026-11-15 | worktree | Final approval regression | PASS, 15 tests | `atelier-telegram-project-selection.test.ts` |
| 2026-11-15 | live | Health Paperclip/FastAPI | PASS | Hai service trả `status=ok`; registry có 80 MCP tools |
| 2026-11-15 | live revision 13 | Retry ATL-27 | PASS | Scene 6×6m, 9 đồ vật, QA valid, 0 collision, lối đi 762mm, BOQ 142.920.882 VND, coverage giá 100% |
| 2026-11-15 | live revision 13 | Export deliverables | PASS | DXF, GLB, IFC và XLSX đều HTTP 200 |
| 2026-11-15 | worktree | Approval/runtime regression | PASS, 17 tests | `atelier-telegram-project-selection.test.ts` và `execute.skills.test.ts` |
| 2026-11-15 | live revision 13 | Retry ATL-28 | PASS | Task `in_review`; QA valid; 0 collision, 0 boundary/door warning; lối đi 762mm; không mutation và BOQ không đổi |
| 2026-11-15 | live | Đồng bộ Approval ATL-28 | PASS | Phiếu `Nghiệm thu ATL-28` pending chứa đúng báo cáo revision 13 thay cho recovery hand-back cũ |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã triển khai đường thực thi canonical dùng chung; ATL-27 đã persist revision 13 và dừng đúng ở `in_review` để người dùng nghiệm thu.
- Hạn chế còn lại: Task thiếu dữ liệu bắt buộc, QA không đạt hoặc cần quyết định nghiệp vụ vẫn dừng có chủ đích để hỏi/phê duyệt; đây không phải lỗi backend.
- Việc chưa hoàn tất: Người dùng chưa phê duyệt nghiệm thu ATL-27; việc này không được backend tự quyết định.
- Rollback point: `3d28633d`.
- Trạng thái `CLOSED` bởi: Codex sau khi unit/integration/live regression đều đạt.
- Thời điểm: 2026-11-15 (Asia/Saigon).
