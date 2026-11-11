# [FEAT-2026-010] Tích hợp Cầu nối Đảo chiều Antigravity IDE trực tiếp vào Paperclip Web UI (`:3100`)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Architect / Integration Engineer |
| Người chấp thuận | User & Principal Architect |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 23:35:00+07:00 |
| Revision bắt đầu | `c4c17d9` |
| Revision cuối | Working tree (`FEAT-2026-010` verified) |

## 1. Bối cảnh

Trong `FEAT-2026-009-ide-reverse-bridge-zero-api-cost.md`, cầu nối đảo chiều (IDE Reverse Bridge — Phương án A) đã được triển khai cho FastAPI backend (`:8000`) và bảng SQLite `chat_messages`. Tuy nhiên, qua ảnh chụp màn hình và kiểm tra thực tế từ A–Z trên giao diện **Paperclip Web UI (`http://localhost:3100`)**:
1. Người dùng đang trò chuyện trực tiếp trong giao diện `AgentChat` của Paperclip (`http://localhost:3100/ATL/chats/...`), nơi lưu trữ hội thoại trong PostgreSQL (`:54329`, bảng `issues` và `issue_comments`), chứ không phải bảng SQLite của FastAPI.
2. Trong hộp chọn Model (Model Selector Popover) của `Chief Architect (Kiến Trúc Sư Trưởng)` và 8 Agent chuyên môn trên Paperclip UI, danh sách model hiện chỉ hiển thị các model mặc định của Codex (`gpt-5.6-luna`, `gpt-6.1-sol`,...) mà **chưa hiển thị `antigravity-ide-bridge (Antigravity IDE Bridge — Zero API Cost)`**.
3. Khi người dùng chọn model `antigravity-ide-bridge` (hoặc khi bật chế độ cầu nối IDE) và nhắn tin trên Paperclip Web UI (`:3100`), tin nhắn cần được chuyển thẳng về hàng đợi của **Antigravity IDE Agent** tại chính IDE này (`scripts/ide_bridge.py`), và khi IDE Agent trả lời, câu trả lời phải xuất hiện **ngay lập tức trong bong bóng chat của Paperclip Web UI (`:3100`)** với chi phí API = `$0.00`.
4. Ngoài ra, luồng chat `ATL-14` (`Lighting & Visualization Specialist`) vẫn đang bị kẹt ở trạng thái `blocked` bởi run HTTP cũ (`f2d0c6db`), khiến tin nhắn `"hi"` của người dùng trong `ATL-14` chưa được phản hồi.

## 2. Mục tiêu

1. **Hiển thị trực tiếp trong Model Picker của Paperclip UI (`:3100`)**:
   - Bổ sung model `antigravity-ide-bridge` (nhãn: `Antigravity IDE Bridge (Zero-Cost Local)`) vào danh mục model của adapter `codex_local` và `gemini_local` trong Paperclip (`paperclip/packages/adapters/codex-local/src/index.ts`, `paperclip/packages/adapters/gemini-local/src/index.ts`) để hiển thị ngay trong Popover chọn Model trên giao diện chat `http://localhost:3100`.
2. **Tích hợp thực thi (Execution Hook) từ Paperclip Server về IDE Bridge**:
   - Trong `paperclip/packages/adapters/codex-local/src/server/execute.ts`, khi `model === "antigravity-ide-bridge"` (hoặc `config.ideBridge === true`):
     - Thay vì gọi OpenAI/Codex tốn token, adapter tự động trích xuất tin nhắn mới nhất của người dùng từ Paperclip (`wakeCommentId` / `issueId`) và đẩy thẳng vào hàng đợi **IDE Reverse Bridge** (`POST http://127.0.0.1:8000/api/v1/bridge/paperclip-enqueue` hoặc chờ phản hồi từ IDE Bridge).
     - Hỗ trợ cả 2 chế độ:
       - **Chế độ Đợi Phản Hồi Trực Tiếp từ IDE (`Wait/Poll IDE Resolution`)** hoặc **Phản Hồi Tức Thì (`Instant Bridge Receipt + Direct Comment Injection`)** để lượt chạy (heartbeat run) trên Paperclip hoàn tất sạch sẽ (`status: succeeded`, `costUsd: 0`, `biller: "antigravity-ide"`), không bao giờ làm kẹt hàng đợi (`queued-comments`) của Paperclip!
3. **Nâng cấp `ide_bridge_service.py` & `scripts/ide_bridge.py` để đồng bộ 2 chiều với Paperclip (`:3100`)**:
   - Tự động quét cả các tin nhắn từ Paperclip PostgreSQL (`http://127.0.0.1:3100/api/companies/:companyId/chats` & `/api/issues/:issueId/comments`) lẫn FastAPI SQLite.
   - Khi chạy `python scripts/ide_bridge.py respond --task-id ... --message "..."`, script không chỉ ghi vào SQLite + cập nhật Scene 3D mà còn **bắn trực tiếp câu trả lời của Agent vào luồng chat Paperclip (`:3100`)** (thông qua endpoint cầu nối chuyên dụng `POST /api/atelier/ide-bridge/reply` trên Paperclip Server, ghi trực tiếp vào bảng `issue_comments` của PostgreSQL với đúng `authorAgentId` của Agent đang chat và cập nhật trạng thái hội thoại).
4. **Gỡ kẹt và trả lời toàn bộ tin nhắn đang chờ trên Paperclip (`ATL-1` và `ATL-14`)**:
   - Gỡ trạng thái `blocked` của `ATL-14` (`Lighting & Visualization Specialist`) và gửi phản hồi cho các tin nhắn `"hi"` của người dùng.

## 3. Phạm vi

### In scope
- `paperclip/packages/adapters/codex-local/src/index.ts`: Thêm `antigravity-ide-bridge` vào danh sách `models` và danh sách hỗ trợ effort/fast mode.
- `paperclip/packages/adapters/codex-local/src/server/execute.ts`: Bắt nhánh `model === "antigravity-ide-bridge"` để chuyển tiếp sang IDE Bridge với chi phí $0.
- `paperclip/server/src/routes/atelier-bridge.ts`: Thêm các endpoint `/atelier/ide-bridge/pending` và `/atelier/ide-bridge/reply` để đọc/ghi comment của Agent trực tiếp vào bảng `issue_comments` của Paperclip PostgreSQL và phát sự kiện cập nhật giao diện thời gian thực (`insertIssueComment`).
- `apps/api/app/services/ide_bridge_service.py`, `apps/api/app/main.py`, `scripts/ide_bridge.py`: Kết nối trực tiếp với Paperclip (`:3100`) để `ide_bridge.py list` thấy ngay tin nhắn trên Paperclip Chat và `ide_bridge.py respond` hiển thị ngay câu trả lời lên Paperclip Chat UI.
- `tests/test_ide_bridge.py`: Bổ sung kiểm thử tích hợp Paperclip IDE Bridge.

### Out of scope
- Không xóa lịch sử chat hoặc các task hiện có của Paperclip.
- Không thay đổi cấu trúc cơ sở dữ liệu PostgreSQL của Paperclip.

## 4. Affected components

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-010-paperclip-ui-ide-reverse-bridge.md` | Thêm mới | Hợp đồng tính năng bắt buộc theo `AGENTS.md` |
| `paperclip/packages/adapters/codex-local/src/index.ts` | Sửa đổi | Hiển thị `antigravity-ide-bridge` trong Model Picker trên Paperclip UI |
| `paperclip/packages/adapters/codex-local/src/server/execute.ts` | Sửa đổi | Thực thi cầu nối Zero-Cost khi model là `antigravity-ide-bridge` |
| `paperclip/server/src/routes/atelier-bridge.ts` | Sửa đổi | Thêm API `/api/atelier/ide-bridge/pending` & `/api/atelier/ide-bridge/reply` |
| `apps/api/app/services/ide_bridge_service.py` | Sửa đổi | Đồng bộ 2 chiều với Paperclip `:3100` |
| `apps/api/app/main.py` | Sửa đổi | Thêm route nhận webhook từ Paperclip adapter |
| `scripts/ide_bridge.py` | Sửa đổi | Hỗ trợ đồng bộ và trả lời trực tiếp vào Paperclip Chat (`:3100`) |
| `tests/test_ide_bridge.py` | Sửa đổi | Bổ sung unit/integration test cho luồng Paperclip Bridge |

## 5. Acceptance criteria

- [x] AC-01: API `GET http://127.0.0.1:3100/api/companies/:companyId/adapters/codex_local/models` trả về model `antigravity-ide-bridge` (`Antigravity IDE Bridge (Zero-Cost)`) ở vị trí đầu tiên để hiển thị ngay trong Popover chọn model của Paperclip UI.
- [x] AC-02: Endpoint `GET http://127.0.0.1:3100/api/atelier/ide-bridge/pending` liệt kê chính xác các hội thoại Paperclip (`ATL-1`, `ATL-14`,...) và tin nhắn mới nhất của người dùng.
- [x] AC-03: Endpoint `POST http://127.0.0.1:3100/api/atelier/ide-bridge/reply` chèn trực tiếp câu trả lời của Agent (`authorAgentId`, `authorType: "agent"`) vào bảng `issue_comments` của Paperclip, đồng thời giải phóng mọi hàng đợi bị kẹt (`executionRunId` / `blocked`).
- [x] AC-04: Khi chạy `python scripts/ide_bridge.py list`, hiển thị đầy đủ các tin nhắn đang chờ từ Paperclip UI (`:3100`).
- [x] AC-05: Khi chạy `python scripts/ide_bridge.py respond --task-id ... --message "..."`, câu trả lời lập tức xuất hiện trong `GET http://127.0.0.1:3100/api/issues/:issueId/comments` và hiển thị trên giao diện Paperclip Web UI (`:3100`).
- [x] AC-06: Khi một Agent được cấu hình model `antigravity-ide-bridge` và người dùng nhắn tin trên Paperclip UI, lượt chạy kết thúc thành công (`succeeded`) với `costUsd: 0`, ghi nhận task vào hàng đợi IDE Bridge và cho phép IDE Agent trả lời trực tiếp.

## 6. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Lượt chạy (heartbeat run) của Paperclip giữ khóa `executionRunId` nếu chờ quá lâu | Nếu IDE chưa phản hồi trong cửa sổ chờ ngắn (hoặc chế độ async), trả về bản tin tiếp nhận tức thì từ IDE Bridge và để `ide_bridge.py respond` đẩy tiếp câu trả lời chi tiết qua `/api/atelier/ide-bridge/reply` |
| Cache của trình duyệt giữ danh sách model cũ | Đặt `antigravity-ide-bridge` vào catalog gốc của `@paperclipai/adapter-codex-local` và hỗ trợ chuyển model mặc định của Agent qua API |

Rollback: Khôi phục các file trong `paperclip/` và `apps/api/` về commit `c4c17d9`.

## 7. Verification plan & Evidence

1. **Kiểm tra API danh sách model của Paperclip (`GET /api/companies/:companyId/adapters/codex_local/models`)**:
   - Kết quả: Trả về `{'id': 'antigravity-ide-bridge', 'label': 'Antigravity IDE Bridge (Zero-Cost)'}` ở vị trí đầu tiên (`index 0`).
   - Đã cập nhật `adapterConfig.model = "antigravity-ide-bridge"` làm mặc định cho toàn bộ **9/9 Agent** (`Chief Architect`, `Lighting & Visualization Specialist`, `Geometry & BIM Specialist`,...).
2. **Kiểm tra gỡ kẹt và trả lời cho `ATL-1` (`Chief Architect`) và `ATL-14` (`Lighting & Visualization Specialist`) qua `scripts/ide_bridge.py`**:
   - Chạy `python scripts/ide_bridge.py list` -> Tự động phát hiện `ATL-14` (`Lighting & Visualization Specialist`) đang cần trả lời tin nhắn `"hi"` và đồng bộ vào `ide_bridge_tasks` (`task_e859b953c3`).
   - Chạy `python scripts/ide_bridge.py respond --task-id task_e859b953c3 ...` và `python scripts/ide_bridge.py respond --task-id ATL-1 ...` -> Cả 2 luồng hội thoại `ATL-1` và `ATL-14` trên PostgreSQL (`:54329`) đều nhận được comment trả lời của Agent và chuyển sang trạng thái `🟢 Đã trả lời` (`in_review`, `needs_reply: false`).
3. **Chạy `pytest tests/test_ide_bridge.py -v`**:
   - Kết quả: **5/5 PASSED** (`0.12s`).

## 8. Change Log

- **2026-11-10**: Hoàn thành tích hợp và kiểm chứng từ A–Z, đóng hợp đồng (`CLOSED`).
