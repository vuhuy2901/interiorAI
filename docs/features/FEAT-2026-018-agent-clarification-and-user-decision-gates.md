# [FEAT-2026-018] Cổng hỏi lại và quyết định thuộc quyền người dùng

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng yêu cầu trực tiếp |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 11:55 +07:00 |
| Revision bắt đầu | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` |
| Revision cuối | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + feature working-tree manifest tại mục 13 |

## 1. Bối cảnh

Tài liệu prompt Atelier đã mô tả `needs_input`, nhưng chín agent live không có
instruction bundle chứa quy tắc này. Runtime hiện chỉ thấy mô tả năng lực ngắn,
nên có thể biến dữ liệu thiếu thành giả định và tự chốt phong cách, màu sơn,
nội thất hoặc ngân sách. Task Style seed còn mang tên chứa sẵn màu sơn demo,
làm giả định này trông giống quyết định đã được người dùng xác nhận.

## 2. Mục tiêu

Buộc mọi agent phân biệt `confirmed`, `proposal_requested` và `unknown`; quyết
định thuộc sở thích/chi tiêu của người dùng chưa được xác nhận phải tạo câu hỏi
và dừng, không được đánh dấu hoàn tất hoặc handoff như một fact đã chốt.

## 3. Phạm vi

### In scope

- Chính sách quyết định dùng chung cho ngân sách, phong cách, màu/bảng màu, vật
  liệu, nhu cầu nội thất/công năng, đồ giữ lại và ràng buộc đặc biệt.
- Bộ instruction `AGENTS.md` được materialize idempotent cho chín agent live;
  specialist chuyển câu hỏi về Chief, Chief hỏi người dùng tối đa ba câu/lượt.
- Bộ đánh giá brief deterministic trả `needs_input` và câu hỏi có lựa chọn khi
  thiếu quyết định cốt lõi; project intake không được tiếp tục âm thầm.
- Xóa giả định màu/nội thất demo khỏi title/description task workflow canonical.
- Test tập trung, tài liệu vận hành và kiểm chứng live.

### Out of scope

- Không tự suy luận câu trả lời từ ảnh, lịch sử ngoài conversation hiện tại hoặc
  dữ liệu cá nhân của người dùng.
- Không tự chọn phương án A/B/C thay người dùng.
- Không thay model, giá, API key, Python 14-node workflow hoặc scene-write gate.
- Không xây UI form DesignBrief mới trong feature này.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: agent instruction bundle service, Atelier bootstrap, issue service.
- Dữ liệu dùng chung: agent adapter config, canonical workflow tasks và project intake.
- Service/port/database không được ảnh hưởng: Paperclip `3100`, PostgreSQL `54329`.
- Invariant: giữ model `gpt-5.6-luna`; không ghi đè instruction bundle đã được
  người dùng version hóa; bootstrap vẫn idempotent.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo module decision policy, bộ câu hỏi ưu tiên và brief assessment.
2. Sinh instruction bundle theo vai trò với quy tắc dừng `needs_input` bắt buộc.
3. Bootstrap materialize bundle khi agent chưa có bundle; giữ nguyên bundle đã
   version hóa hoặc được cấu hình riêng.
4. Tích hợp assessment vào project intake và cung cấp API kiểm tra brief.
5. Reconcile mô tả task canonical bằng policy mới, bỏ title demo tự chốt.
6. Test, restart, kiểm chứng brief thiếu bị chặn và agent live đã nhận policy.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-clarification-policy.ts` | Mới | Decision policy, assessment và instruction content |
| `paperclip/server/src/routes/atelier-bridge.ts` | Tích hợp | Bootstrap instructions và brief gate API |
| `paperclip/server/src/services/atelier-agent-workflow.ts` | Cập nhật | Canonical task không mang giả định demo |
| `paperclip/server/src/__tests__/atelier-clarification-policy.test.ts` | Mới | Test missing/confirmed/proposal states |
| `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Cập nhật | Ghi rõ cổng quyết định live |
| Paperclip runtime data | Reconcile | Instruction bundles và canonical task descriptions |

## 7. Acceptance criteria

- [x] AC-01: Cả 9 agent live có instruction policy cấm tự biến unknown thành fact.
- [x] AC-02: Chief hỏi tối đa 3 câu ưu tiên; specialist gửi `needs_input` về Chief và dừng.
- [x] AC-03: Brief thiếu ngân sách/phong cách/màu/công năng trả structured `needs_input`, không tạo project.
- [x] AC-04: Yêu cầu “hãy đề xuất” được ghi `proposal_requested`; agent đưa A/B/C nhưng không tự chọn.
- [x] AC-05: Cost không công bố tổng khi thiếu budget hoặc giá xác minh.
- [x] AC-06: Task Style/Cost canonical không còn title hay mô tả chốt màu/sản phẩm demo.
- [x] AC-07: Bootstrap lặp lại không tạo bundle/task trùng và không đổi model.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit policy | Focused Vitest | Phân loại missing, confirmed, proposal_requested đúng |
| Missing brief live | POST brief assessment/intake | HTTP 422 `needs_input`, không tăng project/task |
| Agent instructions | Đọc bundle của 9 agent | Có decision ledger, stop rule và role routing |
| Canonical tasks | GET workflow/issues | Không còn title màu/sản phẩm tự chốt |
| Idempotency/model | Bootstrap hai lần + agent API | Không duplicate; 9/9 vẫn `gpt-5.6-luna` |
| Health | GET `/api/health` | `status=ok`, recovery `ready` |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Hỏi quá nhiều | Tối đa ba câu/lượt, ưu tiên quyết định ảnh hưởng lớn |
| Chặn người dùng đã muốn AI đề xuất | Cho phép `proposal_requested`, nhưng vẫn chờ họ chọn trước commit |
| Ghi đè hướng dẫn tùy chỉnh | Chỉ materialize khi chưa có instruction bundle |
| Brief parser bỏ sót cách diễn đạt | Parser chỉ là gate tối thiểu; agent vẫn phải dùng decision ledger |

Rollback point và cách rollback: revert các file feature; khôi phục adapter config
agent trước materialize và title/description canonical từ snapshot trước reconcile.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của người dùng.
- Thời điểm: 2026-11-11 11:55 +07:00.

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 11:55 +07:00 | Working tree trên `eac39d0b` | Thêm decision policy, parser và role instructions | Không đổi model/API key |
| 2026-11-11 11:57 +07:00 | Working tree trên `eac39d0b` | Tích hợp instruction bundle, brief assessment/intake gate và canonical task copy | Bundle tùy chỉnh có sẵn được bảo vệ |
| 2026-11-11 12:00 +07:00 | Working tree trên `eac39d0b` | Restart, reconcile và kiểm chứng runtime | PostgreSQL/Python sidecar được giữ nguyên |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 11:54 +07:00 | `eac39d0b` + working tree | Focused Vitest | PASS | 2 files, 8 tests, exit 0 |
| 2026-11-11 11:55 +07:00 | `eac39d0b` + working tree | Route import smoke | PASS | `atelier-bridge-import-ok`, exit 0 |
| 2026-11-11 11:59 +07:00 | `eac39d0b` + working tree | Missing brief assessment | PASS | HTTP 422, `needs_input`, 3 câu ưu tiên |
| 2026-11-11 11:59 +07:00 | `eac39d0b` + working tree | Missing brief intake | PASS | HTTP 422 `ATELIER_NEEDS_INPUT`; projects `2 -> 2`, issues `23 -> 23` |
| 2026-11-11 12:00 +07:00 | `eac39d0b` + working tree | Proposal vs confirmed | PASS | “chưa biết/đề xuất” giữ `proposal_requested`; brief đầy đủ trả HTTP 200 `ready` |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Live instruction bundles | PASS | 9/9 managed bundle có decision ledger và stop rule; metadata policy `installed` |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Workflow/model/idempotency | PASS | root ổn định qua 2 lần; 10 nodes; 9/9 model `gpt-5.6-luna` |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Canonical task copy | PASS | Style/Cost title trung tính, không còn màu/sản phẩm demo tự chốt |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Health | PASS | `/api/health`: `status=ok`, startup recovery `ready` |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Diff hygiene | PASS | `git diff --check` sạch trên các file implementation/test trong scope |
| 2026-11-11 12:01 +07:00 | `eac39d0b` + working tree | Feature manifest | RECORDED | policy `77E44F80...0FF3`; route `653326B2...A560`; workflow `DCB418B6...D8E1`; test `FD928A28...F27F`; docs `6FA12955...A221` (SHA-256) |

## 14. Kết quả và đóng chức năng

- Kết quả: Chín agent live đã có cổng quyết định bắt buộc; brief thiếu bị chặn
  bằng câu hỏi cụ thể và proposal không còn được coi là lựa chọn đã xác nhận.
- Hạn chế còn lại: Feature chưa thêm UI form DesignBrief riêng; câu hỏi được trả
  qua conversation/API hiện có.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: `eac39d0b` + snapshot runtime trước reconcile.
- Trạng thái `CLOSED` bởi: Codex sau khi đạt toàn bộ acceptance criteria.
- Thời điểm: 2026-11-11 12:01 +07:00.
