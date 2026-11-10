# [FEAT-2026-009] IDE Reverse Bridge — Zero API Cost Agent Dispatch

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Architect / Integration Engineer |
| Người chấp thuận | User & Principal Architect |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 23:15:00+07:00 |
| Closed at | 2026-11-10 23:20:00+07:00 |
| Revision bắt đầu | `74912c5` |
| Revision cuối | `c80b422` |

## 1. Bối cảnh

Chi phí sử dụng các Cloud LLM API (Google Gemini API, OpenAI GPT-4, Anthropic Claude) tính phí theo số lượng token per-request có thể trở nên rất tốn kém khi người dùng trao đổi liên tục trong các phiên thiết kế kiến trúc và nội thất. Trong khi đó, người dùng đã có phiên làm việc với AI Agent mạnh mẽ (Antigravity) ngay trong IDE với đầy đủ quyền truy cập hệ thống cục bộ (Blender 4.2 LTS, database SQLite/PostgreSQL, CAD engine, Python runtime) mà không phát sinh thêm chi phí per-token.

Cần một cơ chế **Cầu nối Đảo chiều (IDE Reverse Bridge)** để:
- Người dùng gõ tin nhắn thoải mái trên Giao diện Web (hoặc Telegram).
- Yêu cầu được chuyển thẳng về phiên IDE này để AI Agent trong IDE tiếp nhận và xử lý triệt để (chạy Blender 3D, bóc tách khối lượng, xuất GLB, kiểm tra hình học).
- AI Agent trong IDE đẩy kết quả và mô hình 3D ngược trở lại cơ sở dữ liệu để Web UI và Telegram hiển thị trực tiếp cho người dùng với chi phí API bằng 0.

## 2. Mục tiêu

1. Tạo kết nối `conn_ide_bridge` trong hệ thống đăng ký Agent & Connection của ATELIER AI.
2. Xây dựng dịch vụ hàng đợi cầu nối `apps/api/app/services/ide_bridge_service.py` lưu trữ và điều phối các yêu cầu hội thoại `PENDING_IDE`.
3. Cung cấp API endpoints trong FastAPI:
   - `GET /api/v1/bridge/tasks`: Lấy danh sách câu hỏi / yêu cầu chờ xử lý.
   - `POST /api/v1/bridge/tasks/{task_id}/resolve`: Trả kết quả (text, model 3D GLB, render ảnh, proposal) về bảng `chat_messages` để Web UI cập nhật tức thì.
   - `GET /api/v1/bridge/status`: Kiểm tra trạng thái hoạt động của cầu nối.
4. Xây dựng CLI công cụ điều phối `scripts/ide_bridge.py`:
   - `list`: Liệt kê các câu hỏi đang chờ từ Web/Telegram.
   - `respond`: Gửi câu trả lời và tài sản 3D ngược lại Web UI.
   - `watch`: Lắng nghe tin nhắn mới theo thời gian thực.
5. Đảm bảo toàn bộ quy trình vận hành với chi phí API ngoài = **0 VNĐ**.

## 3. Phạm vi

### In scope

- Module `apps/api/app/services/ide_bridge_service.py` tích hợp với database SQLite `chat_messages` và `projects`.
- Endpoints trong `apps/api/app/main.py`.
- Script điều phối `scripts/ide_bridge.py`.
- Cấu hình kích hoạt `IDE_BRIDGE_MODE=1` hoặc cấu hình qua bảng `connections`.
- Kiểm thử tự động luồng: Web gửi tin nhắn -> Hàng đợi tiếp nhận -> Script trả lời kèm file GLB -> Web nhận tin nhắn.

### Out of scope

- Không can thiệp hoặc thay đổi các logic CAD/BIM cốt lõi của Pascal hay Blender.
- Không yêu cầu cài đặt thêm Redis hay RabbitMQ (dùng hàng đợi SQLite/In-memory nội bộ).

## 4. Dependency và tài nguyên cần bảo vệ

- Paperclip Server trên cổng `3100` (PID 30468).
- Embedded PostgreSQL trên cổng `54329` (PID 27740).
- FastAPI backend trên cổng `8000`.
- Bảng `chat_messages` và `projects` không bị xóa hoặc làm sai lệch schema.

## 5. Thiết kế và kế hoạch triển khai

1. **Schema & Bridge Service (`ide_bridge_service.py`)**:
   - Khi `IDE_BRIDGE_MODE=1` hoặc khi agent có kết nối là `conn_ide_bridge`:
   - Tin nhắn người dùng được lưu vào bảng `chat_messages` với metadata `{"bridge_status": "PENDING_IDE"}`.
   - Đưa task vào hàng đợi `BridgeQueue` (in-memory + database fallback).
2. **Endpoints FastAPI (`apps/api/app/main.py`)**:
   - Thêm router `/api/v1/bridge/*`.
3. **CLI Bridge Tool (`scripts/ide_bridge.py`)**:
   - Cung cấp giao diện dòng lệnh thuận tiện cho Agent trong IDE tương tác.
4. **Kiểm thử E2E (End-to-End)**:
   - Viết test gửi tin nhắn giả lập từ Web UI, CLI IDE đọc và giải quyết, xác nhận Web UI có câu trả lời với trạng thái `RESOLVED`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-007-ide-reverse-bridge-zero-api-cost.md` | Thêm mới | Feature contract bắt buộc |
| `apps/api/app/services/ide_bridge_service.py` | Thêm mới | Quản lý hàng đợi và điều phối cầu nối IDE |
| `apps/api/app/main.py` | Sửa đổi | Bổ sung các endpoints `/api/v1/bridge/*` |
| `apps/api/app/db.py` | Sửa đổi | Đăng ký `conn_ide_bridge` trong danh sách kết nối |
| `scripts/ide_bridge.py` | Thêm mới | Công cụ CLI cho IDE Agent đọc và trả lời Web |
| `tests/test_ide_bridge.py` | Thêm mới | Kiểm thử tự động toàn diện |

## 7. Acceptance criteria

- [x] AC-01: Kết nối `conn_ide_bridge` được đăng ký và kích hoạt trong hệ thống (`apps/api/app/db.py`).
- [x] AC-02: Khi người dùng gửi tin nhắn trên Web (`/api/v1/chat/messages`), tin nhắn được chuyển vào hàng đợi `PENDING_IDE` mà không gọi Cloud API.
- [x] AC-03: Lệnh `python scripts/ide_bridge.py list` hiển thị chính xác các tin nhắn đang chờ.
- [x] AC-04: Lệnh `python scripts/ide_bridge.py respond` đẩy câu trả lời và mô hình 3D ngược vào database, chuyển trạng thái sang `RESOLVED`.
- [x] AC-05: Giao diện Web đọc được câu trả lời từ bảng `chat_messages` qua `/api/v1/chat/history`.
- [x] AC-06: Chi phí token cho các truy vấn qua IDE bridge = 0 USD.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| Kiểm tra đăng ký connection | `GET /api/v1/connections` | Xuất hiện `conn_ide_bridge` với status `CONNECTED` | **ĐẠT** |
| Kiểm tra gửi tin nhắn từ Web | `POST /api/v1/chat/messages` | Trả về task đang chờ IDE xử lý | **ĐẠT** |
| Kiểm tra danh sách task | `python scripts/ide_bridge.py list` | Thấy task vừa gửi | **ĐẠT** |
| Kiểm tra phản hồi từ IDE | `python scripts/ide_bridge.py respond ...` | Tin nhắn assistant xuất hiện trong lịch sử chat | **ĐẠT** |
| Chạy pytest kiểm thử | `pytest tests/test_ide_bridge.py` | Tất cả 4 test case đều PASS (0.23s) | **ĐẠT** |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tin nhắn bị treo nếu IDE không online | Thêm cơ chế timeout tự động báo "IDE Bridge đang offline" sau 120s |
| Trùng lặp task ID | Dùng UUID hex duy nhất cho mỗi bridge task |

Rollback: Xóa file script và revert các thay đổi endpoint nếu gặp lỗi.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang: `CLOSED`
- Thời điểm đóng băng: 2026-11-10 23:15:00+07:00
- Thời điểm nghiệm thu & đóng: 2026-11-10 23:20:00+07:00

## 11. Bằng chứng nghiệm thu (Verification Evidence)

1. **Pytest Verification**:
   ```text
   tests/test_ide_bridge.py::test_conn_ide_bridge_is_registered PASSED      [ 25%]
   tests/test_ide_bridge.py::test_enqueue_and_list_bridge_task PASSED       [ 50%]
   tests/test_ide_bridge.py::test_resolve_bridge_task_delivers_to_chat_messages PASSED [ 75%]
   tests/test_ide_bridge.py::test_bridge_status_reports_zero_cost PASSED    [100%]
   4 passed in 0.23s
   ```
2. **Khảo sát trạng thái Endpoint**:
   - `GET /api/v1/bridge/status` trả về: `{"enabled": true, "token_cost_usd": 0.0, "bridge_type": "antigravity_reverse_bridge"}`.
3. **Thực thi luồng E2E thực tế**:
   - Gửi tin nhắn qua API Web: `"Giao cho Geometry Agent dựng kệ trang trí phòng khách 1m2"`.
   - Hệ thống tạo task `task_8a865ff496` đưa vào hàng đợi chờ IDE Agent.
   - IDE Agent xử lý và chạy lệnh:
     `python scripts/ide_bridge.py respond --task-id task_8a865ff496 --message "Antigravity IDE Agent đã hoàn thành thiết kế..." --glb "data/exports/models/tv_console_wall_1800x350x300.glb"`
   - Bảng `chat_messages` được cập nhật tin nhắn của assistant với ID `msg_3a0411092c`, đính kèm mô hình GLB và chi phí $0.00.
   - Giao diện Web kiểm tra qua `/api/v1/chat/history` hiển thị đầy đủ tin nhắn.
