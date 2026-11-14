# [FEAT-2026-037] Xây dựng Frontend Thiết Kế Phòng Ngủ Trực Quan, Khắc Phục Lỗi Font Tiếng Việt & Decision Ledger

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Full-Stack Engineer + Frontend Architect |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng (2026-11-13) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13T19:35:00+07:00 |
| Revision bắt đầu | `ce74511` |
| Revision cuối | `ce74511` (local working tree) |

## 1. Bối cảnh

Người dùng phản ánh tình trạng Agent trước đây chỉ trả lời bằng văn bản, bảng Markdown hoặc Decision Ledger dạng chữ thuần túy thay vì triển khai trực tiếp giao diện Frontend sản phẩm tương tác thực tế. Ngoài ra, giao diện còn gặp lỗi hiển thị font chữ tiếng Việt (lỗi dấu, ký tự thay thế hoặc dùng font dự phòng không chuẩn) và chưa có màn hình trực quan chuyên biệt cho dự án Thiết Kế Phòng Ngủ (kích thước tham khảo 4.190 × 4.040 mm).

## 2. Mục tiêu

1. Triển khai hoàn chỉnh giao diện Frontend trực quan, hiện đại, chuẩn Studio Kiến trúc (theo phong cách Architectural Daylight White & Design System của Atelier) cho không gian Phòng Ngủ.
2. Cung cấp đầy đủ 4 phân vùng bắt buộc:
   - **A. Design Workspace**: Sơ đồ mặt bằng 2D tương tác (SVG/Canvas), hiển thị trực quan các khối nội thất (giường 1.800×2.000 mm, tủ áo đề xuất, bàn làm việc & kệ sách đề xuất, hạng mục 700 mm đầu giường chưa xác định rõ), cho phép chọn, kéo thả/điều chỉnh kích thước và vị trí, phân biệt trực quan trạng thái Confirmed / Proposed / Unknown.
   - **B. Bedroom Design Brief**: Thể hiện đầy đủ các thông số phòng ngủ 4.190 × 4.040 mm, giường 1.800 × 2.000 mm, cảnh báo bắt buộc: *"Tất cả kích thước trên cần được xác nhận trước khi dùng làm dữ liệu thi công chính thức"*.
   - **C. Decision Ledger**: Bảng quyết định trực quan với trạng thái Confirmed / Proposed / Unknown, nút "Chỉnh sửa" và "Xác nhận", lưu trữ trạng thái người dùng đã chọn, không tự tiện biến đề xuất thành bắt buộc.
   - **D. Visual Preview**: Cập nhật thời gian thực khi người dùng chỉnh sửa dữ liệu, vẽ hình học SVG trực quan, không dùng markdown/ảnh giả mạo.
3. Sửa triệt để lỗi font tiếng Việt bằng cách nhúng Google Fonts `Inter` và `JetBrains Mono` (hỗ trợ Unicode tiếng Việt đầy đủ) vào `index.html`, chuẩn hóa font stack trong CSS và các thẻ SVG text.
4. Tích hợp định tuyến rõ ràng (`/bedroom-studio` và trong menu điều hướng), đảm bảo responsive và kiểm thử thực tế bằng headless browser screenshot.

## 3. Phạm vi

### In scope

- Nhúng font Google Fonts `Inter` (300, 400, 500, 600, 700) và `JetBrains Mono` (400, 500, 600) với subset tiếng Việt vào `paperclip/ui/index.html`.
- Cấu hình CSS font-family chuẩn xác trong `index.css`, `atelier-studio.css` và các component SVG.
- Triển khai component `BedroomDesignStudio.tsx` và trang `AtelierBedroomStudioPage.tsx` trong `paperclip/ui/src/features/atelier/`.
- Tích hợp route `/bedroom-studio` trong `paperclip/ui/src/App.tsx`, menu điều hướng trong `CoordinatorSidebar.tsx` và `Sidebar.tsx`.
- Đồng bộ dữ liệu phòng ngủ với dự án `proj_bedroom_japandi_4x4m` hoặc lưu trữ trạng thái tương tác cục bộ (`localStorage`).
- Build kiểm thử bằng `pnpm --filter @paperclipai/ui build`.
- Chụp ảnh màn hình thực tế nghiệm thu bằng Playwright Chromium.

### Out of scope

- Không thay đổi kiến trúc cơ sở dữ liệu backend của dự án khác.
- Không tự ý chốt đơn giá hoặc sinh bảng dự toán BOQ cuối cùng khi người dùng chưa xác nhận dữ liệu.
- Không xóa bỏ các tính năng hiện có của Paperclip.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Vite, React 19, Tailwind/Lucide icons, Paperclip UI, FastAPI 8000.
- Bảo vệ nguyên vẹn các file API backend và database SQLite/Postgres.

## 5. Thiết kế và kế hoạch triển khai

1. **Bước 1**: Cập nhật `paperclip/ui/index.html` thêm Google Fonts CDN cho `Inter` và `JetBrains Mono` với tham số `display=swap` và hỗ trợ tiếng Việt.
2. **Bước 2**: Chuẩn hóa font-family trong CSS và sửa các thẻ SVG `<text>` để dùng font chữ chuẩn, không bị cắt cụt ký tự.
3. **Bước 3**: Xây dựng module `BedroomDesignStudio.tsx` chứa đầy đủ Design Workspace 2D, Bedroom Design Brief, Decision Ledger và Visual Preview.
4. **Bước 4**: Tạo trang `AtelierBedroomStudioPage.tsx` và đăng ký route `/bedroom-studio` trong `App.tsx` cùng liên kết trong sidebar.
5. **Bước 5**: Chạy build `pnpm --filter @paperclipai/ui build` đảm bảo không có lỗi TypeScript hay cú pháp.
6. **Bước 6**: Chạy kịch bản Playwright để kiểm tra hiển thị, chụp screenshot nghiệm thu thực tế trên cả Desktop và Tablet/Mobile.

## 6. File hoặc component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/index.html` | Cập nhật | Nhúng font Inter và JetBrains Mono hỗ trợ tiếng Việt |
| `paperclip/ui/src/features/atelier/BedroomDesignStudio.tsx` | Mới | Giao diện phòng ngủ 2D, Brief, Decision Ledger |
| `paperclip/ui/src/features/atelier/AtelierBedroomStudioPage.tsx` | Mới | Trang chứa Studio thiết kế phòng ngủ |
| `paperclip/ui/src/App.tsx` | Cập nhật | Thêm route `/bedroom-studio` |
| `paperclip/ui/src/components/CoordinatorSidebar.tsx` | Cập nhật | Thêm mục menu "Thiết kế Phòng ngủ" |
| `paperclip/ui/src/components/Sidebar.tsx` | Cập nhật | Thêm mục menu "Thiết kế Phòng ngủ" |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Cập nhật | Sửa font SVG và xử lý hiển thị nhãn tiếng Việt không bị đè |

## 7. Acceptance criteria

- [x] AC-01: Font tiếng Việt hiển thị sắc nét, không bị lỗi dấu, không bị ô vuông hay lỗi font fallback.
- [x] AC-02: Giao diện Phòng Ngủ có Design Workspace 2D hiển thị đúng kích thước phòng 4.190 × 4.040 mm với tường, cửa ra vào, cửa sổ và đồ nội thất.
- [x] AC-03: Đồ nội thất phân biệt rõ: Giường ngủ (tham khảo 1.800×2.000 mm), Tủ áo (Đề xuất), Bàn làm việc & kệ sách (Đề xuất), Hạng mục 700 mm đầu giường (Chưa xác định).
- [x] AC-04: Bedroom Design Brief thể hiện cảnh báo bắt buộc: *"Tất cả kích thước trên cần được xác nhận trước khi dùng làm dữ liệu thi công chính thức."*
- [x] AC-05: Decision Ledger hiển thị danh sách quyết định với 3 trạng thái Confirmed / Proposed / Unknown, kèm nút "Chỉnh sửa" và "Xác nhận", cho phép người dùng thay đổi và lưu trạng thái.
- [x] AC-06: Bản vẽ mặt bằng 2D cập nhật tức thì (Visual Preview) khi người dùng điều chỉnh kích thước/vị trí hoặc xác nhận đồ nội thất.
- [x] AC-07: Build Frontend thành công 100% không có lỗi.
- [x] AC-08: Chụp ảnh screenshot thực tế xác nhận giao diện hoạt động và hiển thị tiếng Việt hoàn hảo.

## 8. Verification plan

| Kiểm tra | Lệnh / Cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra build | `pnpm --filter @paperclipai/ui build` | Exit code 0, không có lỗi TypeScript |
| Kiểm tra route | Mở `http://localhost:3100/bedroom-studio` | Trang tải thành công, không báo 404 |
| Kiểm tra screenshot | Chạy script Playwright chụp ảnh giao diện | Ảnh chụp đầy đủ 4 phân vùng, chữ tiếng Việt sắc nét |

## 9. Rủi ro và rollback

- Rủi ro: Vite dev middleware có thể cần cache refresh.
- Giảm thiểu: Chạy build tĩnh và kiểm tra trực tiếp qua browser.
- Rollback: `git checkout -- paperclip/ui/` nếu có sự cố.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang: `FROZEN`
- Thời điểm: 2026-11-13T19:35:00+07:00

## 11. Change Log

Không có thay đổi ngoài phạm vi.

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13 19:31 | `ce74511` | Nhúng Google Fonts Inter & JetBrains Mono vào `paperclip/ui/index.html` | Khắc phục triệt để lỗi font tiếng Việt |
| 2026-11-13 19:32 | `ce74511` | Chuẩn hóa font stack trong `index.css`, `atelier-studio.css` và SVG text trong `StudioViewport.tsx` | Font không bị vỡ hoặc rơi vào font hệ thống không hỗ trợ tiếng Việt |
| 2026-11-13 19:33 | `ce74511` | Xây dựng `BedroomDesignStudio.tsx` và `AtelierBedroomStudioPage.tsx` | Đầy đủ 4 khu vực: Workspace 2D, Brief, Decision Ledger, Visual Preview |
| 2026-11-13 19:34 | `ce74511` | Đăng ký route `/bedroom-studio` trong `App.tsx`, menu điều hướng trong `CoordinatorSidebar.tsx`, `Sidebar.tsx` và `AtelierDesignStudioPage.tsx` | Dễ dàng truy cập một chạm từ mọi nơi |
| 2026-11-13 19:36 | `ce74511` | Build kiểm thử `@paperclipai/ui` và chạy test Playwright | Build thành công 100%, 0 console error, chụp screenshot thực tế |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 19:34 | `ce74511` | Build Frontend: `pnpm --filter @paperclipai/ui build` | Thành công 100% | `✓ built in 11.48s`, exit code 0 |
| 2026-11-13 19:36 | `ce74511` | E2E Browser Test trên Desktop (1440x900) | PASS | `scratch/bedroom_studio_desktop.png` |
| 2026-11-13 19:36 | `ce74511` | Tương tác chốt quyết định & cập nhật thời gian thực | PASS | `scratch/bedroom_studio_interactive.png` |
| 2026-11-13 19:36 | `ce74511` | Kiểm tra cuộn & hiển thị Decision Ledger cards | PASS | `scratch/bedroom_studio_ledger.png` |
| 2026-11-13 19:37 | `ce74511` | E2E Browser Test trên Mobile (390x844) | PASS | `scratch/bedroom_studio_mobile.png` |
| 2026-11-13 19:36 | `ce74511` | Kiểm tra font tiếng Việt trên 3D Studio chính (`/design-studio`) | PASS | `scratch/design_studio_verified.png` |

## 14. Kết quả và đóng chức năng

- **Kết quả**: Giao diện Studio Thiết Kế Phòng Ngủ đã hoạt động thực tế 100% tại `http://localhost:3100/bedroom-studio`. Người dùng có thể xem sơ đồ 2D, kéo thả/chỉnh sửa kích thước nội thất, xem Brief với cảnh báo kỹ thuật bắt buộc, lọc và xác nhận từng mục trong Decision Ledger mà không bị ép buộc chuyển đề xuất thành bắt buộc. Font tiếng Việt hiển thị sắc nét chuẩn xác với Google Fonts Inter.
- **Hạn chế còn lại**: Việc xuất mô hình 3D sang Blender Cycles hoặc IFC tuân theo hợp đồng FEAT-036 riêng biệt của pipeline hình học.

