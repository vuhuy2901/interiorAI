# [FEAT-2026-002] Paperclip là entrypoint mặc định trên cổng 3100

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.0 |
| Owner | DevOps / Windows Development Environment |
| Người chấp thuận | Product Owner (yêu cầu trực tiếp) |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 |
| Revision bắt đầu | `f92c6c3` + working tree cleanup chưa commit |
| Revision cuối | Working tree 2026-11-10 (chưa commit) |

## 1. Bối cảnh

Workspace đang ưu tiên hoặc bị một tác vụ ngoài khởi chạy ATELIER AI standalone
trên cổng 5173. Điểm vào mong muốn là Paperclip hiện có tại
`http://localhost:3100`.

## 2. Mục tiêu

Khi người dùng chủ động mở/chạy workspace, chỉ một startup entrypoint kiểm tra
Paperclip hiện có, khởi động đúng deployment nếu cần, chờ readiness và mở
`http://localhost:3100`; frontend/backend standalone không tự chạy.

## 3. Phạm vi

### In scope

- Audit toàn bộ workspace startup, VS Code task, script, Docker Compose và task
  nền liên quan.
- Xác minh deployment Paperclip thực tế trước khi chọn Docker Compose hay local.
- Tạo hoặc sửa một script startup thống nhất có timeout và kiểm tra port/HTTP.
- Chỉ thay cấu hình VS Code thuộc workspace này.
- Dừng đúng runtime standalone nếu còn tồn tại và đã xác minh.

### Out of scope

- Cài, clone hoặc tạo Paperclip mới.
- Tạo database, volume hoặc Compose project song song.
- Đổi port 3100.
- Xóa source, dữ liệu, workflow, project, task, agent hoặc Git history.
- Docker prune/reset hoặc kill tiến trình không xác định.

## 4. Dependency và tài nguyên cần bảo vệ

- `paperclip/` hiện có và toàn bộ cấu hình của nó.
- PostgreSQL Paperclip tại `C:\Users\TUAN\.paperclip\instances\default\db`.
- Scheduled task PostgreSQL hiện có nếu được xác minh thuộc Paperclip.
- Workflow Runs, Projects, Tasks, Agents, scene files và assets.
- FastAPI/Pascal dùng chung chỉ được giữ hoặc dừng dựa trên dependency thực tế.

## 5. Kế hoạch triển khai

1. Audit read-only mọi nguồn auto-start và runtime/port hiện tại.
2. Xác minh Paperclip đang chạy bằng Docker Compose hay local runtime.
3. Chọn entrypoint phù hợp với deployment đã có, không tạo deployment khác.
4. Vô hiệu hóa đúng startup standalone đã xác minh.
5. Cập nhật workspace task và startup script tối thiểu.
6. Kiểm tra các nhánh: đã chạy, chưa chạy, port bị chiếm và Docker/runtime lỗi.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `scripts/start-paperclip.ps1` | Mới hoặc cập nhật | Entrypoint thống nhất |
| `.vscode/tasks.json` | Có điều kiện | Chỉ nếu workspace có/được phép auto-start |
| Script startup cũ đã xác minh | Có điều kiện | Loại bỏ đường dẫn standalone |
| File contract này | Cập nhật log/evidence | Truy vết triển khai |

## 7. Acceptance criteria

- [x] AC-01: Không có runtime standalone lắng nghe cổng 5173 sau khi mở workspace.
- [x] AC-02: Entrypoint mặc định là `http://localhost:3100`.
- [x] AC-03: Paperclip đã healthy thì không restart hoặc tạo instance khác.
- [x] AC-04: Paperclip chưa chạy thì khởi động đúng deployment hiện có và chờ readiness.
- [x] AC-05: Port 3100 bị chiếm bởi ứng dụng khác thì báo lỗi và không kill.
- [x] AC-06: Runtime/Docker không sẵn sàng thì báo hướng dẫn, không reset/tạo stack.
- [x] AC-07: Không có thay đổi dữ liệu Paperclip hoặc dự án khác.
- [x] AC-08: Mở trình duyệt chỉ sau khi Paperclip sẵn sàng.

## 8. Verification plan

| Kiểm tra | Cách chạy | Kết quả mong đợi |
|---|---|---|
| Audit startup | Tìm cấu hình và process command line | Xác định đúng nguồn cũ |
| Already running | Chạy entrypoint khi 3100 healthy | Không restart, mở đúng URL |
| Stopped | Chạy entrypoint khi Paperclip tắt | Khởi động đúng deployment |
| Port conflict | Mô phỏng/analyze an toàn | Báo PID/container, không kill |
| Standalone guard | Kiểm tra process và cổng 5173 | Không tự chạy |
| Data safety | So sánh DB/path và Git diff | Không đổi dữ liệu/Paperclip ngoài scope |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Chọn sai Docker/local deployment | Xác minh compose labels, process và config trước khi sửa |
| Restart Paperclip không cần thiết | HTTP identity + health check trước startup |
| Dừng nhầm service dùng chung | Không kill nếu dependency chưa rõ |
| VS Code tạo terminal trùng | Dùng task instance limit và kiểm tra readiness |

Rollback: khôi phục các file startup/task từ Git diff; không rollback database.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Product Owner request / Codex
- Thời điểm: 2026-11-10

## 11. Change Log

Chưa có change request.

## 12. Implementation log

- Audit xác định runtime cũ trên 5173 do tác vụ agent Antigravity bên ngoài
  workspace khởi chạy; tác vụ đó đã được dừng. Không có VS Code task, Startup
  entry hay root package script cũ cần xóa thêm.
- Xác định deployment thực tế là source local `paperclip/` dùng PostgreSQL nhúng
  tại `C:\Users\TUAN\.paperclip\instances\default\db`, không phải Docker
  Compose. Docker Desktop không chạy và không có Compose project hoạt động, nên
  không tạo container, volume hoặc database mới.
- Thêm `scripts/start-paperclip.ps1` làm entrypoint duy nhất. Script:
  - nhận diện Paperclip bằng `GET /api/health` (`status=ok`,
    `deploymentMode=local_trusted`, có version);
  - tái sử dụng PostgreSQL nhúng và chỉ gọi scheduled task đã xác minh nếu cổng
    54329 chưa sẵn sàng;
  - kiểm tra xung đột 3100 và tuyệt đối không kill owner không hợp lệ;
  - khởi động server local ẩn, chờ health có timeout rồi mới mở browser;
  - không cài dependency, không tạo DB/Compose và không tự chạy FastAPI 8000.
- Thêm `.vscode/tasks.json` với `runOn=folderOpen` và `instanceLimit=1`.
- Chuyển `start-atelier.ps1` và `start-atelier-paperclip.ps1` thành wrapper an
  toàn tới entrypoint mới; stop tự động bị vô hiệu hóa để tránh dừng service dùng
  chung.
- Cập nhật quick start trong `README.md`.

## 13. Verification evidence

- PowerShell parser: `scripts/start-paperclip.ps1` không có lỗi cú pháp.
- `.vscode/tasks.json`: parse JSON thành công.
- Cold start: khi 3100 chưa lắng nghe, script khởi động đúng server trong
  `paperclip/`; `/api/health` trả `status=ok`, `deploymentMode=local_trusted`,
  `serverVersion=0.3.1`.
- Already-running: trước và sau lần chạy thứ hai listener giữ nguyên PID `28176`
  và start time `2026-11-10T11:55:28.3705841+07:00`; không restart/duplicate.
- Port conflict thực tế: tạm dừng đúng Paperclip đã xác minh, bind HTTP test
  process PID `13608` vào 3100, launcher trả exit code 1 và test process vẫn
  chạy. Sau test đã dừng riêng PID test và khôi phục Paperclip thành công.
- Trạng thái cuối: Paperclip `ok` trên 3100 (listener PID `17484` tại thời điểm
  kiểm tra), 0 listener trên 5173, PostgreSQL PID `2880`, scheduled task
  `AtelierEmbeddedPostgres=Ready`, database path tồn tại.
- FastAPI dùng chung trên 8000 giữ nguyên PID `3116`; launcher mới không start
  hoặc stop service này.
- Hai wrapper tương thích đều trả thành công khi Paperclip đã healthy.
- `git diff --check` không có whitespace error (chỉ có cảnh báo line-ending
  LF/CRLF của Git trên Windows).

## 14. Kết quả và đóng chức năng

Hoàn tất ngày 2026-11-10. Workspace có một startup path mặc định tới Paperclip
trên cổng 3100, không còn startup path tới standalone 5173, không tạo deployment
hoặc dữ liệu song song. Lần đầu mở workspace bằng VS Code có thể cần chọn
**Allow Automatic Tasks in Folder**; các lần sau task sẽ tự kiểm tra/start và chỉ
mở browser sau readiness.
