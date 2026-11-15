# [FEAT-2026-034] Cổng duyệt nghiệm thu cho task Telegram

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex / ATELIER AI |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng trong phiên làm việc |
| Ngày tạo | 2026-11-15 |
| Frozen at | 2026-11-15 (Asia/Saigon) |
| Revision bắt đầu | 3d28633d |
| Revision cuối | Working tree trên `3d28633d` (chưa commit theo yêu cầu người dùng) |

## 1. Bối cảnh

Task thiết kế tạo từ Telegram hiện có thể được Agent chuyển thẳng sang `done`. Trang
`Approvals > Pending` và lệnh Telegram `/approvals` vì vậy không có bản ghi nào, dù
người dùng mong đợi một bước duyệt nghiệm thu sau khi các Agent hoàn tất.

## 2. Mục tiêu

Mọi task mới tạo từ bridge Telegram phải dừng ở trạng thái chờ duyệt sau khi Agent
báo hoàn tất, xuất hiện dưới dạng Approval chính thức trên web và Telegram, và chỉ
trở thành `done` sau quyết định của người dùng.

## 3. Phạm vi

### In scope

- Đánh dấu rõ nguồn gốc task được tạo bởi ATELIER Telegram bridge.
- Gắn một execution approval stage do người dùng chịu trách nhiệm quyết định.
- Tự động tạo đúng một Approval chính thức khi task bước vào approval stage.
- Đồng bộ quyết định duyệt thành `done`; từ chối/yêu cầu sửa trả task về Agent.
- Bổ sung test cho nguồn gốc, policy, materialization và quyết định.

### Out of scope

- Thay đổi task cũ đã hoàn tất trước bản sửa.
- Thêm schema hoặc migration mới.
- Thay đổi cơ chế phê duyệt của task không đến từ ATELIER Telegram bridge.
- Bắt buộc duyệt trước từng thao tác Scene; đây là cổng nghiệm thu cuối task.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `issues`, `approvals`, `issue_approvals`, execution policy hiện có.
- Dữ liệu dùng chung: project/scene binding và comment lịch sử của task.
- Service/port/database không được ảnh hưởng: Paperclip 3100, Pascal API 8000,
  PostgreSQL hiện tại; không tạo timer/poller mới.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo contract thuần cho Telegram approval gate trong module sở hữu Telegram.
2. Khi tạo task, lưu provenance `chat_channel` và execution approval stage.
3. Khi issue service ghi nhận stage `approval` ở trạng thái `pending`, materialize
   Approval `request_board_approval` và link với issue trong cùng transaction.
4. Khi Approval được duyệt/từ chối/yêu cầu sửa, áp dụng patch vòng đời tương ứng
   cho issue liên kết, dùng issue service để giữ invariant và audit hiện có.
5. Không thêm polling; tận dụng transaction và notification hiện hữu.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/server/src/services/atelier-telegram/approval-gate.ts` | Mới | Chủ sở hữu contract và logic đồng bộ |
| `paperclip/server/src/services/atelier-telegram/task-manager.ts` | Sửa | Gắn provenance và approval policy |
| `paperclip/server/src/services/issues.ts` | Sửa nhỏ | Materialize Approval tại transaction issue |
| `paperclip/server/src/routes/approvals.ts` | Sửa nhỏ | Đồng bộ quyết định web về task |
| `paperclip/server/src/services/atelier-telegram/task-manager.ts` | Sửa nhỏ | Đồng bộ quyết định Telegram về task |
| Test liên quan Telegram approval | Mới/sửa | Chứng minh vòng đời |

## 7. Acceptance criteria

- [x] AC-01: Task Telegram mới mang provenance riêng và có approval stage cho
  người dùng chịu trách nhiệm.
- [x] AC-02: Agent báo hoàn tất làm task chuyển `in_review`, không chuyển thẳng `done`.
- [x] AC-03: Một Approval pending chính thức được tạo và link với task, không nhân đôi.
- [x] AC-04: Approval hiển thị qua API/web Pending và lệnh Telegram `/approvals`.
- [x] AC-05: Duyệt Approval hoàn tất task; từ chối/yêu cầu sửa trả task về Agent.
- [x] AC-06: Task không phải Telegram giữ nguyên hành vi.
- [ ] AC-07: Typecheck và test tập trung pass.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit approval gate | Vitest file mới | Materialize idempotent và patch quyết định đúng |
| Telegram project selection | Vitest hiện có | Task có provenance/policy và project binding không đổi |
| Server typecheck | `pnpm --filter @paperclipai/server typecheck` | Pass |
| Diff hygiene | `git diff --check` | Pass |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Approval bị tạo lặp khi retry | Advisory lock + kiểm tra link pending trong transaction |
| Quyết định làm sai task khác | Chỉ áp dụng cho provenance prefix ATELIER Telegram và linked issue cùng company |
| Agent không quay lại sau yêu cầu sửa | Trả ownership về `returnAssignee`; giữ wake hiện có của approval route |
| Tăng chi phí đường update issue | Chỉ chạy truy vấn materialization khi task đúng provenance và state pending approval |

Rollback: bỏ module gate, bỏ wiring tại task creation/issue update/approval decision;
không cần rollback schema hay dữ liệu.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu sửa trực tiếp của người dùng.
- Thời điểm: 2026-11-15 (Asia/Saigon).

> Sau khi mục này được chốt, mọi thay đổi phạm vi phải đi qua Change Log.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-15 | 3d28633d | Bắt đầu triển khai | Worktree có thay đổi người dùng; chỉ chạm file trong phạm vi |
| 2026-11-15 | working tree | Gắn provenance và approval execution policy vào task Telegram mới | Dùng user chịu trách nhiệm của company làm người duyệt |
| 2026-11-15 | working tree | Materialize Approval và đồng bộ quyết định web/Telegram | Idempotent trong transaction; không wake lại Agent sau khi duyệt cuối |
| 2026-11-15 | working tree | Nạp lại dịch vụ | Paperclip 3100, API 8000 và Telegram poller hoạt động |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-15 | working tree | `vitest atelier-telegram-project-selection.test.ts` | PASS | 15/15 test; gồm create policy, materialize idempotent và quyết định Telegram -> `done` |
| 2026-11-15 | working tree | `vitest approval-routes-idempotency.test.ts --hookTimeout=180000` | PASS | 11/11 test tuyến Approval web cũ |
| 2026-11-15 | working tree | Import `server/src/routes/approvals.ts` bằng `tsx` | PASS | Route nạp thành công |
| 2026-11-15 | working tree | `git diff --check` | PASS | Không có whitespace error trong diff |
| 2026-11-15 | working tree | Health sau restart | PASS | `/api/health`: `status=ok`; Telegram `/status`: `polling`, `lastError=null` |
| 2026-11-15 | working tree | `pnpm --filter @paperclipai/server typecheck` | BLOCKED (ngoài phạm vi) | Runner build qua; layered server typecheck lỗi sẵn có TS6059/TS6307 do source `paperclip-runner` nằm ngoài `server/src` rootDir |

## 14. Kết quả và đóng chức năng

- Kết quả: Implementation hoàn tất và đã nạp trên dịch vụ local; task Telegram mới có cổng nghiệm thu chính thức.
- Hạn chế còn lại: Task cũ như ATL-26 không được backfill theo phạm vi đã đóng băng.
- Việc chưa hoàn tất: AC-07 chưa thể đóng vì lỗi cấu hình layered typecheck có sẵn ngoài phạm vi thay đổi.
- Rollback point: 3d28633d.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
