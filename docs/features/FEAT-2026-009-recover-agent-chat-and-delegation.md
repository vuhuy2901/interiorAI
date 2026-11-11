# [FEAT-2026-009] Khôi phục AI Chat và kiểm tra giao việc đa agent

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | ATELIER AI runtime |
| Người chấp thuận | Product Owner, yêu cầu trực tiếp ngày 2026-11-10 |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10, giờ Việt Nam |
| Revision bắt đầu | Root `74912c56ffa7c3f78bd2667dfeb4248ef94dfc94`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree hiện có |
| Revision cuối | Root `c4c17d960016f5e97ab723a9d0d7073a8a990f18`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`; source hashes ghi tại evidence |

## 1. Bối cảnh và mục tiêu

Hội thoại ATL-1 bị giữ ở trạng thái `blocked` bởi run HTTP cũ `4f55e3c1-1a4c-4dfb-b0fd-f41dedb49c3a` dù roster đã chuyển sang Codex. UI báo “Retry is waiting for execution checks”; ba tin nhắn mới được lưu nhưng không có run mới. Mục tiêu là khôi phục hàng đợi chat, nhận phản hồi AI thật và xác minh Chief Architect giao việc được cho specialist.

## 2. Phạm vi

- Retry/reconcile ATL-1 qua API chính thức, giữ nguyên các comment đã lưu.
- Theo dõi run mới đến trạng thái cuối và xác minh có agent comment trả về chat.
- Gửi một yêu cầu điều phối kiểm thử và xác minh Chief tạo/giao công việc cho agent chuyên môn.
- Chỉ sửa source nếu API chuẩn không thể xử lý và có bằng chứng root cause cụ thể.

## 3. Non-goals

- Không xóa lịch sử chat hoặc run cũ.
- Không đổi model, roster 9 agent, database schema hoặc company khác.
- Không thực hiện thay agent các thay đổi thiết kế/CAD có tác động ngoài bài kiểm tra điều phối.

## 4. Affected components

- Paperclip ATL-1 issue/chat, retry queue và heartbeat runs.
- Issue/task records được Chief tạo trong bài kiểm tra delegation.
- Native heartbeat environment tại `paperclip/server/src/services/heartbeat/runtime-execution.ts` và kiểm thử hồi quy liên quan.
- Evidence tại `docs/build/EVIDENCE/FEAT-2026-009/`.

## 5. Acceptance criteria

- [x] ATL-1 không còn `retryWait=execution_recovery` của run HTTP cũ.
- [x] Một run Codex mới dùng `gpt-5.6-luna` kết thúc thành công.
- [x] AI Chat nhận ít nhất một comment mới từ Chief Architect sau các tin nhắn bị kẹt.
- [x] Chief Architect tạo hoặc giao ít nhất một task cho specialist trong roster 9 agent.
- [x] Paperclip health vẫn `ok`, không agent có `errorReason`.

## 6. Rủi ro và rollback

- Retry có thể tiêu thụ token hoặc xử lý nhiều tin nhắn đã lưu; giới hạn ở một lượt và theo dõi run.
- Delegation test có thể tạo task; task phải có tiêu đề test rõ ràng và có thể archive/cancel nếu cần.
- Rollback: giữ toàn bộ lịch sử; nếu retry thất bại, không lặp vô hạn và ghi lại receipt/run để xử lý có mục tiêu.

## 7. Verification plan

1. POST retry với idempotency key mới và observed run cũ.
2. Poll issue, heartbeat run và comments đến trạng thái cuối.
3. Gửi yêu cầu delegation sau khi chat đã trả lời; kiểm tra issue assignment mới.
4. Kiểm tra `/api/health`, canonical agents và error state.

## 8. Change Log

### CR-001 — Inject run JWT vào native heartbeat (được chấp thuận)

- Lý do: API retry chuẩn đã khôi phục chat và Codex trả lời thành công, nhưng Chief không thể giao việc vì native heartbeat chỉ nhận agent identity key pair, không nhận `PAPERCLIP_API_KEY`. Run JWT hiện chỉ được tạo cho nhánh `legacy`, trong khi roster hiện chạy native runtime.
- Phạm vi thay đổi: tạo run-scoped JWT cho mọi local adapter hỗ trợ JWT và đưa nó vào native `runnerEnvironment`; giữ nguyên nhánh legacy hiện hữu; thêm kiểm thử hồi quy xác minh token tồn tại và có run scope.
- Tác động: native local agent có thể gọi Paperclip API theo đúng quyền run hiện tại; không mở rộng quyền, không dùng board key, không đổi schema.
- Rủi ro: token có thể bị chiếu nhầm vào runtime không hỗ trợ. Giảm thiểu bằng điều kiện `adapter.supportsLocalAgentJwt`, cơ chế redaction hiện hữu và test authorization.
- Rollback: hoàn nguyên thay đổi trong runtime environment và test; chat vẫn hoạt động nhưng delegation qua API sẽ tiếp tục bị chặn.
- Chấp thuận: Product Owner yêu cầu trực tiếp khôi phục chat và tiếp tục giao việc cho các agent khác ngày 2026-11-10.

## 9. Implementation log

1. Reconcile recovery action của run HTTP lỗi và đưa ATL-1 khỏi `blocked` về hàng đợi thực thi hợp lệ.
2. Xác minh Chief trả lời các tin nhắn đã lưu bằng Codex `gpt-5.6-luna`.
3. Phát hiện native heartbeat không nhận run JWT và server cũ được supervisor khởi động lại mà không nạp `paperclip/.env`.
4. Mở CR-001, mint JWT cho mọi adapter local có `supportsLocalAgentJwt` và đưa token vào native `runnerEnvironment`; thêm regression test kiểm tra claims theo run.
5. Dừng đúng supervisor/process cũ đã xác minh, khởi động một Node 24 Local-Lite với `--env-file=../.env`; không tạo repository hay database mới.
6. Khôi phục cấu hình 9 agent từ model bridge ngoài phạm vi về `gpt-5.6-luna`, reasoning low.
7. Chief tạo ATL-15 đến ATL-18; từng task là top-level, có project, assignee specialist và `plan` revision thực. Bốn specialist đã nhận run Luna riêng.

## 10. Verification evidence và closure

- Live health: `ok`, Paperclip `0.3.1`, `authReady=true` trên PID 27244.
- Chat recovery run: `fe9ece90-89de-4884-93d6-e1293d764fd4`; comment Chief: `ad7d8c4b-1f77-4e29-9f48-186e2d098916`.
- Delegation run: `e4bf478d-37d7-4015-899d-274f9c66ffa1`, `succeeded`, model `gpt-5.6-luna`.
- Tasks: ATL-15 Geometry/BIM, ATL-16 Furniture, ATL-17 Style/Materials, ATL-18 Cost/BOM. Tất cả có `parentId=null`, cùng project `8b2fe984-4bc2-4af2-a65f-7dfe64fb2274` và có plan revision.
- Focused Vitest bị chặn trước khi collect test vì embedded PostgreSQL từ chối chạy dưới tài khoản Windows elevated hiện tại.
- Server typecheck bị chặn trước server layers bởi ACPX generated profile có line ending stale; không tự regenerate vì ngoài phạm vi và worktree đang có thay đổi người dùng.
- Live acceptance qua API đã pass; evidence đầy đủ tại `docs/build/EVIDENCE/FEAT-2026-009/chat-and-delegation.json`.
- Hợp đồng đóng ngày 2026-11-10. Mọi thay đổi hành vi tiếp theo cần reopen bằng change request hoặc tạo feature contract mới.
