# [FEAT-2026-012] Tăng tốc Cầu nối Hybrid Zero-Cost (`< 0.5s` Fast-Path + Always-On Antigravity IDE Daemon)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Architect / Integration Engineer |
| Người chấp thuận | User & Principal Architect |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 00:50:00+07:00 |
| Revision bắt đầu | Working tree (`FEAT-2026-011`) |
| Revision cuối | Working tree (`FEAT-2026-012` verified) |

## 1. Bối cảnh & Mục tiêu

Ở `FEAT-2026-011`, cầu nối `antigravity-ide-bridge` trên Paperclip Web UI (`:3100`) hoạt động ổn định với chi phí `$0.00`, nhưng mọi tin nhắn gửi từ trình duyệt đều chỉ trả về tin nhắn giữ chỗ (*"Agent sẽ xử lý..."*) và đợi người dùng quay lại IDE nhắn nhắc thủ công -> gây cảm giác "mãi không trả ra câu trả lời" và chậm.

Người dùng yêu cầu:
> *"ide luôn bật cho nó chạy trong dự án làm sao cho nhanh tăng tốc độ lên đi"*

Giải pháp kiến trúc **Hybrid 2 Tầng (Zero API Cost `$0.00`)**:
1. **Tầng 1 — Fast-Path Cục Bộ Tức Thì (`< 0.5 giây`)**:
   - Bên trong `enqueue_paperclip_turn` (`apps/api/app/services/ide_bridge_service.py` + `apps/api/app/main.py`), các yêu cầu hội thoại nhanh (chào hỏi, hỏi thông tin dự án/phòng/kích thước, kiểm tra ánh sáng, dự toán BOQ xác định, kiểm tra va chạm/thông thủy, vật liệu, chỉnh sửa cảnh qua `orchestrator.process_user_chat_message`) được xử lý **ngay lập tức** bằng dữ liệu thực từ `proj_demo_4x5m`, `cost_engine`, `geometry` và `orchestrator` — trả kết quả thật trực tiếp trong `immediate_reply` (trên Paperclip UI xuất hiện ngay sau `< 1s`), không còn tin nhắn giữ chỗ chờ đợi.
2. **Tầng 2 — Always-On Antigravity IDE Daemon (Tác vụ Chuyên sâu)**:
   - Các tác vụ cần năng lực Agent đầy đủ trong IDE (dựng mô hình 3D Blender tham số mới, chụp 6 góc, viết/sửa code, kiểm toán P0–P3 độc lập, điều phối đa task Paperclip phức tạp, hoặc khi người dùng yêu cầu gọi IDE) được đưa vào hàng đợi `PENDING` và được **Daemon định kỳ (`schedule` cron `* * * * *`, `IsDaemon: true`)** trong Antigravity IDE tự động quét, thực thi và đẩy ngược kết quả + file `.glb`/ảnh về Paperclip UI.

## 2. Phạm vi

### In scope
- `apps/api/app/services/ide_bridge_service.py`:
  - Phân loại thông minh `is_deep_ide_task(text)` vs Fast-Path Studio Response theo vai trò của từng trong 9 Agent (`Chief Architect`, `Lighting & Visualization Specialist`, `Geometry & BIM Specialist`, `Cost, BOM & Inventory Manager`, `Furniture Planner`, `Style & Materials Consultant`, `Floor Plan Specialist`, `Product & Sourcing Researcher`, `QA & Validation Specialist`).
  - Cho phép `enqueue_paperclip_turn` chạy async/gọi `process_user_chat_message` khi có lệnh chỉnh sửa cảnh tự nhiên (đổi sơn, gạch, sofa, duyệt phương án...) hoặc tổng hợp số liệu thật (`estimate`, `spatial_quality`, `bom`) tức thì.
  - Ghi nhận Fast-Path turn vào `ide_bridge_tasks` với trạng thái `RESOLVED` (`handled_by: "Hybrid Fast-Path Studio Engine ($0.00)"`) để kiểm toán đầy đủ mà không làm tắc hàng đợi `PENDING`.
- `apps/api/app/main.py`: Cập nhật route `/api/v1/bridge/paperclip-enqueue` thành `async def` để gọi được `await ide_bridge_service.enqueue_paperclip_turn_async(payload)`.
- `tests/test_ide_bridge.py`: Bổ sung kiểm thử cho cả nhánh Fast-Path (`< 0.5s` trả lời thật theo vai trò) và nhánh Deep IDE Queue (`PENDING` cho tác vụ Blender/Code/Audit).
- Bật standing daemon `schedule` (`* * * * *`, `IsDaemon: true`) theo xác nhận của người dùng để tự động xử lý hàng đợi IDE khi chạy nền.

### Out of scope
- Không dùng API key trả phí bên ngoài (`$0.00`).
- Không bịa đặt số liệu, giá cả hay kích thước; chỉ lấy từ `CanonicalProject`, `cost_engine`, `geometry` hoặc catalog thực.

## 3. Acceptance criteria

- [x] AC-01: Gửi tin nhắn Fast-Path (`"giới thiệu bạn là ai"`) tới `POST /api/v1/bridge/paperclip-enqueue` trả về câu trả lời chuyên môn có số liệu thật của `proj_demo_4x5m` (`Phòng Số 1`, `5,080×3,680×2,800 mm`, `Revision #44`) trong **`444.8 ms` (`< 1.0s`)**, trạng thái `RESOLVED`, `cost_usd: 0.0`.
- [x] AC-02: Gửi tác vụ chuyên sâu (`test_paperclip_deep_ide_task_routes_to_pending_queue`) đưa vào hàng đợi `PENDING` (`mode: "deep_ide_queue"`, `queued_for_ide: true`) để IDE Daemon xử lý.
- [x] AC-03: Đồng bộ và trả lời trực tiếp cho tin nhắn thực tế `"giới thiệu bạn là ai"` trên `ATL-14` (`task_b0827d4f89` -> `msg_32afe5a6cb`).
- [x] AC-04: `python -m pytest tests/test_ide_bridge.py -v` -> **6/6 PASSED (`1.55s`)**.

## 4. Rủi ro & Rollback

- Nếu `process_user_chat_message` gặp ngoại lệ với một prompt lạ, fallback an toàn về tổng hợp dữ liệu dự án thực hoặc đẩy vào `PENDING` IDE queue để không bao giờ làm crash heartbeat run.
- Rollback: Khôi phục `apps/api/app/services/ide_bridge_service.py` và `apps/api/app/main.py`.

## 5. Verification Plan & Evidence

1. Benchmark trực tiếp `POST http://127.0.0.1:8000/api/v1/bridge/paperclip-enqueue`: `BENCH_MS: 444.8`, `mode=fast_path`, `queued=False`, `cost=0.0`.
2. Chạy `python -m pytest tests/test_ide_bridge.py -v`: `6 passed in 1.55s`.
3. Kiểm tra `python scripts/ide_bridge.py respond` cho `task_b0827d4f89` (`ATL-14`) đồng bộ lên Paperclip PostgreSQL (`Đã đồng bộ: True`).
4. Kích hoạt standing IDE daemon (`schedule` cron `* * * * *`, `IsDaemon: true`) chạy ngầm trong phiên IDE để tự động quét và xử lý các Deep IDE tasks.
