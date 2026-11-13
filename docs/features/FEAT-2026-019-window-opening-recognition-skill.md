# [FEAT-2026-019] Tích hợp AI Skill Nhận Diện Cửa Sổ & Ô Mở Tường Không Cần Nhãn (Window & Wall Opening Recognition)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User (yêu cầu trực tiếp: "cho skill đọc cửa sổ cho dự án") |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 |
| Revision bắt đầu | `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` |
| Revision cuối | `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1` (working tree manifest) |

## 1. Bối cảnh

Trong các bản vẽ thiết kế kiến trúc thực tế (CAD DWG/DXF, PDF, bản quét ảnh raster PNG/JPG), các ô mở cửa sổ, cửa đi, ô thoáng thường không có nhãn văn bản tường minh (thiếu ký hiệu `W`, `W1`, `CS`, chữ "cửa sổ", hoặc không có bảng thống kê cửa kèm theo). Điều này dẫn đến việc AI nhận diện bản vẽ mặt bằng dễ bỏ sót cửa sổ, nhầm lẫn giữa cửa đi và cửa sổ lùa, hoặc tự ý bịa đặt cao độ/kích thước giả định mà không có nguồn gốc đo đạc rõ ràng.

Người dùng cung cấp trọn bộ đặc tả kỹ thuật chi tiết của kỹ năng `atelier-ai-window-opening-recognition` (phiên bản 1.0.0, tiếng Việt) và yêu cầu đưa kỹ năng này vào dự án để hỗ trợ toàn diện các Agent nhận diện ô mở tường.

## 2. Mục tiêu

1. Thiết lập tệp định nghĩa kỹ năng chuẩn `SKILL.md` theo đặc tả người dùng tại `paperclip/packages/skills-catalog/catalog/bundled/interior-design/atelier-ai-window-opening-recognition/SKILL.md`.
2. Đăng ký kỹ năng vào `@paperclipai/skills-catalog`, cập nhật `generated/catalog.json` (tăng catalog từ 41 lên 42 kỹ năng).
3. Đăng ký vào `company_skills` của công ty Atelier AI trong cơ sở dữ liệu Paperclip (tăng từ 34 lên 35 skills).
4. Phân bổ kỹ năng cho các Agent chịu trách nhiệm xử lý mặt bằng và hình học:
   - `Floor Plan Specialist` (`agent_floorplan`)
   - `Geometry & BIM Specialist` (`agent_geometry`)
   - `QA & Validation Specialist` (`agent_qa`)
   - `Chief Architect` (`agent_chief_architect`)
5. Cập nhật hệ thống prompt và tài liệu đa agent (`apps/api/app/services/agent_prompts.py` và `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`).
6. Viết bộ kiểm thử xác thực cấu trúc và nội dung kỹ năng, kiểm thử hồi quy hệ thống.

## 3. Phạm vi

### In scope

- Tạo thư mục kỹ năng mới:
  `paperclip/packages/skills-catalog/catalog/bundled/interior-design/atelier-ai-window-opening-recognition/SKILL.md`
- Cập nhật manifest `paperclip/packages/skills-catalog/generated/catalog.json`.
- Thêm khai báo kỹ năng trong danh sách cấu hình của `paperclip/server/src/routes/atelier-bridge.ts`.
- Nạp bản ghi kỹ năng vào bảng `company_skills` trong PostgreSQL (`port 54329`) và gắn vào các live agent liên quan.
- Đồng bộ danh mục kỹ năng trong `apps/api/app/services/agent_prompts.py` và tài liệu `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`.
- Viết test `tests/test_window_opening_recognition_skill.py`.

### Out of scope

- Không thay đổi model LLM hoặc adapter engine (`codex_local`).
- Không thay đổi schema các bảng cơ sở dữ liệu cốt lõi của Paperclip.
- Không sửa đổi mã nguồn dựng hình 3D hình học của Blender hoặc Pascal MCP.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip backend (`:3100`), PostgreSQL (`:54329`), FastAPI backend (`:8000`).
- Dữ liệu dùng chung: Company ID Atelier AI (`b2e1c8a5-c3c9-412c-99cb-63180c4015dc`), 2 dự án đang hoạt động.
- Không được làm gián đoạn các tiến trình đang chạy (`:3100`, `:8000`, `:54329`).

## 5. Thiết kế và kế hoạch triển khai

1. Ghi nội dung đặc tả đầy đủ vào `paperclip/packages/skills-catalog/catalog/bundled/interior-design/atelier-ai-window-opening-recognition/SKILL.md`.
2. Tạo metadata entry cho `atelier-ai-window-opening-recognition` trong `catalog.json` (tính toán `sizeBytes`, `sha256`, `contentHash`).
3. Cập nhật cấu hình kỹ năng trong `paperclip/server/src/routes/atelier-bridge.ts`.
4. Nạp kỹ năng vào cơ sở dữ liệu live của Paperclip (`company_skills`) và gán cho `Floor Plan Specialist`, `Geometry & BIM Specialist`, `QA Specialist`, `Chief Architect`.
5. Cập nhật `apps/api/app/services/agent_prompts.py` và `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`.
6. Chạy bộ test hồi quy và test kỹ năng mới.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/skills-catalog/catalog/bundled/interior-design/atelier-ai-window-opening-recognition/SKILL.md` | Tạo mới | Định nghĩa kỹ năng nhận diện cửa sổ và ô mở |
| `paperclip/packages/skills-catalog/generated/catalog.json` | Cập nhật | Ghi nhận kỹ năng mới vào catalog |
| `paperclip/server/src/routes/atelier-bridge.ts` | Cập nhật | Cấp quyền kỹ năng mới cho các agent |
| PostgreSQL `company_skills` & `agents` | Dữ liệu runtime | Kích hoạt kỹ năng trong Paperclip UI |
| `apps/api/app/services/agent_prompts.py` | Cập nhật | Bổ sung kỹ năng vào prompt của agent |
| `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Cập nhật | Cập nhật tài liệu kiến trúc kỹ năng |
| `tests/test_window_opening_recognition_skill.py` | Tạo mới | Kiểm thử đơn vị tự động xác thực kỹ năng |

## 7. Acceptance criteria

- [x] AC-01: Tệp `SKILL.md` được tạo đúng định dạng YAML frontmatter (`name: atelier-ai-window-opening-recognition`, `version: 1.0.0`) chứa đầy đủ 9 phần theo đặc tả người dùng.
- [x] AC-02: `catalog.json` chứa 42 skills (bổ sung bản ghi `atelier-ai-window-opening-recognition`).
- [x] AC-03: `company_skills` của công ty Atelier AI trong Paperclip chứa kỹ năng mới (tổng 35 skills).
- [x] AC-04: Các agent `Floor Plan Specialist`, `Geometry & BIM Specialist`, `QA Specialist`, `Chief Architect` được gán kỹ năng mới.
- [x] AC-05: Toàn bộ kiểm thử hồi quy `tests/test_ide_bridge.py` và `tests/test_japandi_bedroom_project.py` tiếp tục pass 10/10.
- [x] AC-06: Bộ test mới `tests/test_window_opening_recognition_skill.py` đạt 100% pass (5/5 tests).

## 8. Rủi ro và kế hoạch rollback

- **Rủi ro**: Lỗi định dạng JSON trong `catalog.json` hoặc xung đột ID kỹ năng trong Paperclip.
- **Rollback**: Xóa tệp `SKILL.md`, hoàn tác `catalog.json` qua `git checkout`, xóa bản ghi kỹ năng trong `company_skills` nếu cần.

## 9. Kế hoạch kiểm thử (Verification plan)

1. Kiểm tra sự tồn tại và tính hợp lệ của tệp `SKILL.md`.
2. Xác minh số lượng kỹ năng trong `catalog.json` (42 skills).
3. Truy vấn API `/api/companies/{id}/skills` để xác nhận kỹ năng hiển thị live.
4. Chạy `pytest tests/test_window_opening_recognition_skill.py tests/test_japandi_bedroom_project.py tests/test_ide_bridge.py`.

## 10. Bằng chứng kiểm thử (Verification evidence)

| Kiểm tra | Lệnh thực thi | Kết quả thực tế | Trạng thái |
|---|---|---|---|
| Kiểm tra file `SKILL.md` | Đọc filesystem | Tồn tại đầy đủ 9 phần + YAML frontmatter | PASS |
| Tái tạo manifest `catalog.json` | `pnpm --filter @paperclipai/skills-catalog run build:manifest` | `Wrote generated/catalog.json with 42 catalog skills.` | PASS |
| Kiểm tra company skills live | `GET /api/companies/b2e1c8a5-c3c9-412c-99cb-63180c4015dc/skills` | 35 skills live, bao gồm `atelier-ai-window-opening-recognition` | PASS |
| Gán kỹ năng cho 4 Agent | `python apps/api/scripts/assign_window_skill.py` | 4/4 agent nhận mã HTTP 200 kèm `atelier-ai-window-opening-recognition` | PASS |
| Kiểm thử đơn vị kỹ năng mới | `pytest tests/test_window_opening_recognition_skill.py` | 5 passed in 0.23s | PASS |
| Kiểm thử toàn bộ hệ thống | `pytest tests/test_window_opening_recognition_skill.py tests/test_japandi_bedroom_project.py tests/test_ide_bridge.py` | 15 passed in 5.68s | PASS |
