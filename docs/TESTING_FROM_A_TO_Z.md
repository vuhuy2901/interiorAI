# ATELIER AI — Bộ kiểm thử từ A đến Z

## 1. Chuẩn bị lần đầu

Mở PowerShell tại `C:\QLDAPM-final\interiorAI`:

```powershell
.\test-atelier.ps1 -Mode setup
```

Lệnh này tạo/cập nhật `.venv`, cài dependency Python, frontend và Pascal MCP adapter. Browser E2E dùng Google Chrome hoặc Microsoft Edge đã cài trên máy; nếu không có, hãy chạy `.\.venv\Scripts\python -m playwright install chromium`.

## 2. Các mức kiểm thử tự động

### Quick — dùng sau mỗi thay đổi nhỏ

```powershell
.\test-atelier.ps1 -Mode quick
```

Kiểm tra compile/import backend và riêng luồng Telegram Task Progress.

### Backend/API

```powershell
.\test-atelier.ps1 -Mode api
```

Bao phủ health, Pascal MCP, project mẫu, DXF round-trip, scale gate, chat/proposal, approve/reject, vật liệu, BOQ, catalog fit-check, quyền Agent, che secret, export và Telegram progress.

### Frontend

```powershell
.\test-atelier.ps1 -Mode frontend
```

Chạy TypeScript compiler và Vite production build. Test thất bại nếu có lỗi type, import hoặc bundle.

### Browser E2E

```powershell
.\test-atelier.ps1 -Mode e2e
```

Tự khởi động API/Vite nếu cần, mở Chromium headless, gửi chat, chuyển qua các phân hệ và chụp ảnh responsive vào `docs/screenshots/`.

### Full regression

```powershell
.\test-atelier.ps1 -Mode full
```

Chạy toàn bộ Quick → API → Frontend → Browser E2E. Nếu chỉ cần CI không có trình duyệt:

```powershell
.\test-atelier.ps1 -Mode full -SkipE2E
```

## 3. Test thủ công Telegram thật

1. Tạo bot bằng BotFather và lấy Bot Token.
2. Nhắn một tin cho bot, lấy Chat ID của tài khoản/nhóm cần nhận thông báo.
3. Chạy backend và frontend.
4. Vào `AI Control Center` → `📲 Telegram Progress`.
5. Nhập Bot Token và Chat ID, bật **Bật gửi Telegram thật**, chọn chế độ cập nhật rồi lưu.
6. Bấm **Gửi thử luồng tiến độ**.
7. Xác nhận Telegram nhận thẻ `ATL-XXXX`, progress bar đi từ 0% đến 100%.
8. Giao việc “Đổi sofa hiện tại sang sofa nhỏ hơn 1.8m”.
9. Xác nhận thẻ dừng ở `95% — WAITING_FOR_APPROVAL`, có nút phê duyệt/từ chối.
10. Phê duyệt trên Web; xác nhận cùng thẻ chuyển thành `COMPLETED 100%` và có Revision mới.

## 4. Ma trận nghiệm thu

| Nhóm | Kết quả mong đợi |
|---|---|
| Backend health | HTTP 200, `status=ok` |
| Pascal MCP | Kết nối, tối thiểu 75 tools |
| Dữ liệu dự án | 4 tường, 1 cửa, 1 cửa sổ, tỷ lệ đã khóa |
| DXF | Round-trip 4000×5000 mm, sai số ≤1 mm |
| Human-in-the-loop | Thiếu tỷ lệ → `WAITING_FOR_INPUT` |
| Proposal | Chat tạo proposal và diff đúng |
| Approval | Revision tăng, project cập nhật |
| BOQ | Sơn, sàn, gạch, len chân tường được tính |
| Security | Agent bị chặn tool trái quyền; secret luôn `REDACTED` |
| Export | GLB, IFC, DAE, CSV, XLSX tải được |
| Telegram offline | Delivery log có trạng thái `SIMULATED` |
| Telegram task | `ATL-XXXX`, 95% chờ duyệt → 100% hoàn tất |
| Frontend | TypeScript + Vite build thành công |
| E2E | Chat và điều hướng UI chạy; ảnh 1440/1024/768/390 được tạo |

## 5. Kiểm tra API thủ công

Swagger: `http://127.0.0.1:8000/docs`

Các endpoint quan trọng:

- `GET /api/v1/health`
- `POST /api/v1/tasks/dispatch`
- `GET /api/v1/tasks/progress`
- `GET/PUT /api/v1/telegram/config`
- `POST /api/v1/telegram/test`
- `POST /api/v1/proposals/{proposal_id}/approve`
- `POST /api/v1/workflows/{workflow_id}/runs`

## 6. Cách đọc lỗi

- Dừng ở **compile/import**: lỗi Python hoặc dependency backend.
- Dừng ở **pytest**: API/nghiệp vụ không đạt assertion; đọc phần traceback đầu tiên.
- Dừng ở **production build**: lỗi TypeScript/import/frontend bundle.
- Dừng ở **Playwright**: dịch vụ chưa lên, selector UI thay đổi hoặc thiếu Chromium.
- `Application Control blocked Rollup`: chạy lại `npm install`; postinstall sẽ chuyển Rollup sang WASM.
- Pascal MCP không kết nối: chạy `npm --prefix packages/pascal-adapter install` rồi test lại.
