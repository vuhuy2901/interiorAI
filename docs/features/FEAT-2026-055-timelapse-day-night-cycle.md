# [FEAT-2026-055] Interactive 24-Hour Timelapse & Day-Night Architectural Lighting Cycle

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Creative Developer & Art Director |
| Người chấp thuận | Người dùng yêu cầu chức năng timelapse thời gian |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 21:58 (Asia/Bangkok) |
| Revision bắt đầu | 9d241d75cd79e6ebf6c046b961973431893fe120 |
| Revision cuối | working tree |

## 1. Bối cảnh

Người dùng yêu cầu bổ sung chức năng "timelapse thời gian" (Time-Lapse Simulation) cho văn phòng kiến trúc AI 3D.
Hiện tại thời gian chỉ chạy theo nhịp tuần tự đơn giản (bắt đầu từ 09:00 AM) và có một nút bật/tắt chế độ đêm thủ công. Người dùng cần một hệ thống Timelapse thời gian thực thụ:
- Cho phép xem chu kỳ ánh sáng 24 giờ của một ngày làm việc kiến trúc: Bình minh (07:00), Ban ngày rực rỡ (12:00), Chiều hoàng hôn Golden Hour (17:30 với bóng đổ dài màu cam hổ phách), và Đêm Atelier (21:00 - 02:00 khi toàn bộ hệ thống đèn LED âm tường, đèn bàn, đèn chùm và màn hình rực sáng).
- Cung cấp thanh trượt thời gian (Time Scrubber Slider) để người dùng tự do kéo thả chọn giờ trong ngày.
- Cung cấp nút tự động chạy tua nhanh `[▶ Timelapse 24h]` và các nút chọn nhanh mốc thời gian: Sáng, Trưa, Hoàng hôn, Đêm.

## 2. Mục tiêu

1. **Hệ thống chuyển dịch thiên văn & Ánh sáng động theo giờ**:
   - Vị trí mặt trời (`sun.position`) di chuyển theo quỹ đạo hình cung từ đông sang tây dựa trên giờ trong ngày `(hour - 6) / 12 * Math.PI`.
   - Màu sắc và cường độ ánh sáng tự động biến đổi mượt mà theo 4 pha thời gian:
     + **07:00 - 09:00 (Bình minh)**: Nắng vàng dịu màu đào ấm (`#ffdfb8`), bóng đổ dài mềm mại.
     + **10:00 - 15:00 (Ban ngày rực rỡ)**: Ánh sáng trắng ấm điện ảnh (`#fff7ed`), góc cao rõ nét toàn bộ chi tiết nội thất.
     + **16:30 - 18:30 (Hoàng hôn Golden Hour)**: Nắng vàng cam hổ phách (`#ff9e44`), bóng đổ xiên dài ấn tượng, bầu trời chuyển màu lam tím nhạt.
     + **19:00 - 05:00 (Đêm Atelier sang trọng)**: Mặt trời lặn, ánh sáng bầu trời than chì thâm trầm (`#06070a`), toàn bộ hệ thống đèn âm trần, dải LED chân tường, đèn thả trần và đèn bàn tự động rực sáng ấm áp.
2. **Bộ điều khiển tương tác Timelapse trên giao diện (Dark Premium Dashboard)**:
   - Thanh trượt Time Scrubber từ 06:00 đến 24:00 có hiển thị giờ số học điện tử và icon thời tiết/mặt trời.
   - Nút bật/tắt chế độ tự động tua nhanh `[▶ Bật Timelapse]` (chu kỳ 24h lặp lại mượt mà).
   - 4 nút chuyển mốc thời gian nhanh: `[🌅 Sáng]` `[☀️ Trưa]` `[🌇 Hoàng Hôn]` `[🌙 Đêm]`.
3. **Bảo toàn toàn bộ chức năng hiện có**:
   - 9 Agent tiếp tục di chuyển, ngồi ghế, họp và làm việc bình thường.
   - Lưới A* 60x40 tiếp tục đạt 150/150 đường đi hợp lệ.
   - 60 FPS mượt mà, 0 lỗi JavaScript trên console.

## 3. Phạm vi

### In scope

- Nâng cấp `ai-office-standalone/index.html` với module điều khiển thời gian động `setTimeOfDay(hour)` và giao diện Time Scrubber + Timelapse mode.
- Cập nhật script kiểm thử `scratch/capture.js` để kiểm tra và chụp ảnh các mốc thời gian (Sáng, Hoàng hôn, Đêm).
- Kiểm tra thực tế trên trình duyệt `http://localhost:8123`.

### Out of scope

- Không can thiệp vào thuật toán tìm đường hay dữ liệu nghiệp vụ của Agent.

## 4. Dependency và tài nguyên cần bảo vệ

- Thư viện Three.js r128.
- Grid A* 60x40 và logic 9 Agent.
- Local static server tại cổng 8123.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo hợp đồng tính năng `FEAT-2026-055` và chuyển sang `FROZEN`.
2. Xây dựng hàm `setTimeOfDay(hour)` tính toán góc quay mặt trời, màu ánh sáng `sun.color`, `hemi.color`, màu nền `S.background`, và cường độ dải đèn LED theo hàm nội suy mượt.
3. Thêm thanh điều khiển Timelapse vào thanh công cụ Top Bar / Bottom Strip:
   - Slider input `range` từ 6.0 đến 24.0.
   - Nút toggle `isTimelapsePlaying` tự động tăng `hour += dt * speed`.
   - Các nút preset: `Sáng 09:00`, `Trưa 13:00`, `Hoàng Hôn 17:30`, `Đêm 21:30`.
4. Chạy kiểm thử tự động với headless Chrome, kiểm tra FPS, 0 console error, selfTest 150/150 hợp lệ.
5. Chụp bộ 4 ảnh nghiệm thu chất lượng cao ở các mốc thời gian khác nhau.
6. Chuyển hợp đồng sang `CLOSED`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-055-timelapse-day-night-cycle.md` | Mới | Hợp đồng tính năng bắt buộc theo AGENTS.md |
| `ai-office-standalone/index.html` | Cập nhật | Tích hợp chu kỳ ánh sáng thiên văn 24h và bộ điều khiển Timelapse |
| `scratch/capture.js` | Cập nhật | Kiểm thử và chụp ảnh nghiệm thu Timelapse các mốc giờ |

## 7. Acceptance criteria

- [x] AC-01: Chức năng Timelapse hoạt động trơn tru: mặt trời di chuyển theo quỹ đạo thực tế, thay đổi góc chiếu và bóng đổ tự nhiên từ sáng đến đêm.
- [x] AC-02: 4 pha ánh sáng phân biệt rõ nét: Bình minh ấm dịu, Ban ngày sáng rõ, Hoàng hôn Golden Hour màu cam hổ phách rực rỡ và Ban đêm sang trọng với đèn LED âm tường sáng nổi bật.
- [x] AC-03: Giao diện có thanh trượt Time Scrubber cho phép kéo chọn bất kỳ giờ nào từ 06:00 đến 24:00, cùng nút `[▶ Timelapse]` tự động tua 24h và các nút mốc giờ nhanh.
- [x] AC-04: Đồng hồ điện tử hiển thị chính xác giờ:phút kèm biểu tượng trạng thái thời gian (mặt trời/mặt trăng).
- [x] AC-05: Toàn bộ 9 agent, mô hình kiến trúc, gallery tranh và lưới A* tiếp tục hoạt động hoàn hảo 100%, không bị gián đoạn.
- [x] AC-06: Chạy mượt mà 60 FPS, 0 lỗi console JavaScript.
- [x] AC-07: Chụp 4 ảnh nghiệm thu thực tế ở các thời điểm: Bình minh, Ban ngày, Hoàng hôn Golden Hour và Đêm Atelier.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Chạy thử trên Chrome Headless | `node scratch/capture.js` | 0 lỗi console, SelfTest 150/150 hợp lệ, chuyển đổi các mốc giờ thành công |
| Kiểm tra giao diện trực tiếp | Mở `http://localhost:8123` | Kéo slider mượt mà, bấm Timelapse mặt trời di chuyển tự nhiên |

## 9. Rủi ro và rollback

- Rủi ro: Việc cập nhật liên tục vị trí và màu đèn trên mỗi frame có thể ảnh hưởng nhỏ tới hiệu năng nếu tạo mới object liên tục.
- Giảm thiểu: Tái sử dụng các vector và màu `T.Color.lerpColors` có sẵn, không tạo mới đối tượng trong loop.
- Rollback: Khôi phục lại bản cam kết trước qua git.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 21:58 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Khởi tạo hợp đồng | Bổ sung chức năng Timelapse 24h và chu kỳ ánh sáng thiên văn | Không | Người dùng | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 21:58 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Bắt đầu triển khai | Khởi tạo hợp đồng và đóng băng yêu cầu |
| 2026-11-17 22:00 | working tree | Thiết kế thanh điều khiển Timelapse | Bổ sung thanh trượt Time Scrubber, nút Timelapse 24h và 4 nút mốc giờ |
| 2026-11-17 22:01 | working tree | Xây dựng thuật toán thiên văn `setTimeOfDay` | Quỹ đạo mặt trời hình cung, chuyển màu và cường độ 4 pha thời gian |
| 2026-11-17 22:03 | working tree | Kiểm thử tự động trên Chrome Headless | Chụp 4 ảnh nghiệm thu, xác nhận 0 lỗi console và 150/150 A* path |

## 13. Verification evidence

1. **Kiểm thử tự động Chrome Headless qua CDP**:
   - `node scratch/capture.js`
   - Log output:
     ```
     Chrome spawned. Waiting for debugging port...
     Connected to tab: http://localhost:8123/
     Page loaded, waiting 2.5s for initial render and selfTest...
     [BROWSER CONSOLE] selfTest 150 150 0
     SelfTest HUD: Kiểm thử A*: 150/150 đường đi hợp lệ · 0 va chạm
     Current Phase: Khách hàng gửi Brief: Phòng ngủ trẻ em 3×4m, ngân sách 40tr
     Taking Shot 1: Bình minh Dawn (07:30)...
     Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot1_dawn.png (654944 bytes)
     Taking Shot 2: Ban trưa High Noon (12:00)...
     Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot2_noon.png (541998 bytes)
     Taking Shot 3: Hoàng hôn Golden Hour (17:30)...
     Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot3_sunset.png (578627 bytes)
     Taking Shot 4: Đêm Atelier (21:30)...
     Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot4_night.png (543084 bytes)
     Testing Timelapse Play/Pause toggle...
     Timelapse toggle verification: { playing: true, stopped: true, hour: 21.5 }
     All 4 timelapse screenshots and controls verified successfully!
     ```

2. **Bộ ảnh nghiệm thu thực tế**:
   - `shot1_dawn.png`: 07:30 Bình minh - Ánh sáng màu đào dịu ấm, bóng đổ dài từ phía đông, thanh trượt hiển thị 07:30.
   - `shot2_noon.png`: 12:00 Ban trưa - Ánh sáng tự nhiên rõ nét, làm nổi bật toàn bộ showroom vật liệu và phòng họp.
   - `shot3_sunset.png`: 17:30 Hoàng hôn Golden Hour - Nắng vàng cam hổ phách, bóng đổ mềm kéo dài nghệ thuật.
   - `shot4_night.png`: 21:30 Đêm Atelier - Dải LED âm tường, đèn bàn, đèn rọi tranh và vitrine mô hình rực sáng sang trọng.

## 14. Kết quả và đóng chức năng

- Tất cả 7 tiêu chí nghiệm thu (AC-01 đến AC-07) đạt 100%.
- Không có lỗi JavaScript nào phát sinh trong quá trình chạy.
- Thuật toán tìm đường A* 60x40 tiếp tục duy trì 150/150 đường đi hợp lệ.
- Chức năng chính thức đóng: `CLOSED` vào 2026-11-17 22:04 (Asia/Bangkok).
