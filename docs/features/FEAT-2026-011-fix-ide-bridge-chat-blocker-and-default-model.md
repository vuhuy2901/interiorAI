# [FEAT-2026-011] Sửa lỗi kẹt `executionBlocker` trên `ATL-14` & đồng bộ hoàn toàn Antigravity IDE Bridge

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Architect / Integration Engineer |
| Người chấp thuận | User & Principal Architect |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 23:57:30+07:00 |
| Revision bắt đầu | Working tree (`FEAT-2026-010`) |
| Revision cuối | Working tree (`FEAT-2026-011` verified) |

## 1. Bối cảnh (Root Cause)

Sau khi triển khai `FEAT-2026-010`, luồng chat `ATL-1` (`Chief Architect`) đã hoạt động thành công với model `antigravity-ide-bridge` (`costCents: 0`). Tuy nhiên, trên luồng chat `ATL-14` (`Lighting & Visualization Specialist`), người dùng vẫn gặp thông báo lỗi:
> `Couldn’t finish this attempt. Your message is saved. Retry` — và khi nhắn `"hi"` bị xếp vào hàng đợi không chạy được.

Kiểm tra trực tiếp database & API `GET /api/issues/daa4a6a6-fe38-4679-9110-bfb43eac2e69` cho thấy 2 nguyên nhân gốc:
1. **`issue_recovery_actions` chưa được giải phóng**: Lượt chạy HTTP cũ bị lỗi (`f2d0c6db`, `HTTP adapter missing url`) vẫn để lại bản ghi `issue_recovery_actions` (`id: b88e18a5...`, `cause: legacy_execution_requires_reconciliation`) ở trạng thái active/blocked trên `ATL-14`. Endpoint `POST /api/atelier/ide-bridge/reply` trước đó mới cập nhật `issues` và `agentWakeupRequests` mà chưa giải phóng `issue_recovery_actions` + `automaticRecovery` hold.
2. **Model mặc định của Agent bị ghi đè lại `gpt-5.6-luna`**: Vào lúc `16:48:27Z`, cả 9 Agent bị cập nhật `adapterConfig.model` về `gpt-5.6-luna`, khiến các luồng chat chưa chọn model thủ công (như `ATL-14`) không tự dùng `antigravity-ide-bridge`.

## 2. Phạm vi & Thay đổi

- `paperclip/server/src/routes/atelier-bridge.ts`:
  - Trong `POST /api/atelier/ide-bridge/reply`: tự động giải phóng mọi bản ghi `issueRecoveryActions` đang active/escalated (hoặc có `automaticRecovery.replay = 'blocked'`) của `targetIssue.id` thông qua `issueRecoveryActionService(db).resolveActiveForIssue(...)` và làm sạch `evidence` + `executionRunId`/`checkoutRunId`/`agentWakeupRequests` + xóa `assigneeAdapterOverrides` trỏ model cũ nếu cần.
  - Bổ sung `POST /api/atelier/ide-bridge/unblock` (hoặc tự động hóa khi bootstrap/reply) để gỡ sạch `executionBlocker` / `interruption` cho mọi cuộc hội thoại bị kẹt từ lỗi HTTP cũ.
  - Đặt `adapterConfig.model = "antigravity-ide-bridge"` lại cho toàn bộ 9 Agent ATELIER AI.

## 3. Acceptance criteria

- [x] AC-01: `GET /api/issues/daa4a6a6-fe38-4679-9110-bfb43eac2e69` (`ATL-14`) trả về `executionBlocker: null`, `interruption.state: "resolved"`, `status: "in_review"`.
- [x] AC-02: Toàn bộ 9/9 Agent có `adapterConfig.model === "antigravity-ide-bridge"`.
- [x] AC-03: Khi retry `ATL-14`, heartbeat run (`d9bb90e9`) chạy thành công (`status: "succeeded"`), `model: "antigravity-ide-bridge"`, `costUsd: 0`, không còn lỗi `Couldn’t finish this attempt` / `Your message is saved`.

## 4. Rủi ro & Rollback

- Chỉ gỡ `issueRecoveryActions` thuộc về cuộc hội thoại được trả lời/gỡ kẹt qua IDE Bridge; không đụng tới các task khác có workspace snapshot cần phục hồi thực sự.
- Rollback: Revert thay đổi trong `paperclip/server/src/routes/atelier-bridge.ts`.

## 5. Verification Plan & Evidence

1. Gọi `POST /api/atelier/ide-bridge/unblock` -> Trả về `{"ok":true,"unblocked_identifiers":["ATL-1","ATL-14"]}`.
2. Cập nhật `adapterConfig.model = "antigravity-ide-bridge"` cho 9/9 Agent và kích hoạt lại `ATL-14` (`POST /api/issues/daa4a6a6.../retry`) -> Run `d9bb90e9-25b6-44f9-8a77-ac775151a775` hoàn tất `succeeded`, `costUsd: 0`.
3. Kiểm tra `GET /api/issues/daa4a6a6-fe38-4679-9110-bfb43eac2e69` và `9eabba62-c6da-4a2c-829c-07a3321e86b9` -> Cả `ATL-14` và `ATL-1` đều `blocker=None`, `interruption=resolved`, `status=in_review`.
4. Chạy `python scripts/ide_bridge.py respond` cho `task_5896fde6f0` (`ATL-14`) và `task_8a42a9e96e` (`ATL-1`), xác nhận `ide_bridge.py list` hiển thị cả 2 luồng `🟢 Đã trả lời`.
5. Chạy `python -m pytest tests/test_ide_bridge.py -v` -> `5 passed in 0.55s`.
