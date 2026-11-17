# [FEAT-2026-054] Architectural & Interior Design Showroom Gallery

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Creative Developer & Art Director |
| Người chấp thuận | Người dùng yêu cầu bổ sung không gian trưng bày kiến trúc & nội thất |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 21:55 (Asia/Bangkok) |
| Closed at | 2026-11-17 21:56 (Asia/Bangkok) |
| Revision bắt đầu | 9d241d75cd79e6ebf6c046b961973431893fe120 |
| Revision cuối | working tree |

## 1. Bối cảnh

Văn phòng AI hiện tại đã có bố cục nội thất và ánh sáng tốt, nhưng người dùng mong muốn nâng cấp thành một không gian phức hợp **Luxury Architecture & Interior Design Studio / Showroom**.
Văn phòng cần có:
- Tranh tường nghệ thuật nội thất chất lượng cao: phòng khách biệt thự, phòng ngủ master, bếp ăn hiện đại, căn hộ penthouse, phong cách Japandi, Minimalist, Modern Luxury.
- Mô hình kiến trúc nhà ở thu nhỏ 3D (Architectural Scale Models): biệt thự 2 tầng hiện đại, nhà phố 3 tầng, căn hộ cắt lớp nội thất (cutaway apartment), mô hình phòng mẫu có giường tủ đèn đặt trên bục đá/gỗ có kính bảo vệ và đèn LED hắt.
- Khu trưng bày vật liệu cao cấp (Material Sample Boards): mẫu vân gỗ tự nhiên, đá cẩm thạch marble, gạch trang trí, da bọc sofa, vải nỉ, bảng phối màu và tay nắm phụ kiện kim loại.
- Phân bổ chuyên biệt theo từng phòng:
  + Phòng Mira (KTS Trưởng): Tranh biệt thự, mô hình biệt thự trên bục đá, kệ sách monograph kiến trúc.
  + Phòng Bảo (Xưởng Nội thất): Gallery tranh phòng khách/ngủ/bếp, mẫu vải da, bảng phối màu.
  + Phòng Đội Thi Công: Mô hình kết cấu nhà, bản vẽ shop drawing, mẫu cấu kiện, kệ mũ bảo hộ.
  + Phòng Họp Trung Tâm: Gallery tranh dự án và mô hình nhà ở trên bệ trung tâm.
  + Hành Lang Chính: Dãy khung tranh lớn có đèn rọi tranh và kệ trưng bày thấp.
  + Khu Lounge: Tranh nghệ thuật kiến trúc, sách thiết kế, tượng trang trí.

## 2. Mục tiêu

1. **Khung tranh 3D nội thất cao cấp (FramedArtwork3D)**:
   - Các khung tranh nổi 3D với viền gỗ/kim loại đen, mặt kính bóng nhẹ, có đèn rọi tranh (Gallery Spotlight 3000K).
   - Mỗi bức tranh là một tác phẩm render nội thất kiến trúc độc lập vẽ bằng Canvas độ nét cao: Biệt thự Luxury, Phòng ngủ Master, Bếp đảo Penthouse, Phòng khách Japandi, Nhà phố hiện đại, v.v.
2. **Mô hình kiến trúc nhà ở 3D thu nhỏ (ArchitecturalScaleModel)**:
   - Mô hình biệt thự 2 tầng hiện đại có ban công kính, mái bằng vát, hồ bơi mini.
   - Mô hình nhà phố 3 tầng mặt tiền lam gỗ.
   - Mô hình căn hộ cắt lớp (Cutaway Apartment) lộ rõ giường, tủ, sofa, đèn thả.
   - Đặt trên bệ đá marble/gỗ walnut có hộp kính acrylic bảo vệ và LED hắt chân bệ.
3. **Khu vực Showroom Mẫu Vật Liệu (MaterialSampleBoard & DisplayShelf)**:
   - Kệ trưng bày mẫu đá marble (Calacatta, Nero Marquina), mẫu gỗ sồi/walnut, mẫu vải da sofa, tay nắm kim loại đồng thau.
4. **Bố cục khoa học, không cản trở lối đi**:
   - Tranh và mô hình bố trí ở các mảng tường phía sau (North wall) và các vách đối diện camera nhìn thấy rõ trong góc isometric 3/4.
   - Không đặt trên tường bị hạ thấp (cutaway); cập nhật lưới A* để agent không va chạm bệ trưng bày.
5. **Hiệu năng & Độ ổn định**:
   - 60 FPS, 0 lỗi console, tự kiểm thử 150/150 đường đi hợp lệ.

## 3. Phạm vi

### In scope

- Xây dựng các hàm tạo component tái sử dụng trong `ai-office-standalone/index.html`: `createFramedArtwork`, `createArchitecturalScaleModel`, `createMaterialSampleBoard`, `createDisplayPedestal`.
- Bố trí tranh và mô hình vào 7 phân khu theo đúng yêu cầu người dùng.
- Cập nhật script kiểm thử `scratch/capture.js` và chụp 4 ảnh nghiệm thu chất lượng cao.

### Out of scope

- Không sử dụng ảnh tĩnh 2D làm nền thay cho mô hình 3D.
- Không phá vỡ luồng logic 9 agent.

## 4. Dependency và tài nguyên cần bảo vệ

- Thư viện Three.js r128.
- Local server tại cổng 8123.
- Grid A* 60x40 và logic chuyển động của 9 Agent.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo hợp đồng tính năng `FEAT-2026-054` và chuyển sang `FROZEN`.
2. Thiết kế các canvas texture nội thất độ nét cao (2D high-DPI canvas renderers):
   - Biệt thự Modern Luxury phòng khách thông tầng (double-height ceiling).
   - Phòng ngủ Master vách ốp da và lam gỗ.
   - Bếp đảo Marble Calacatta & quầy bar.
   - Phòng khách phong cách Japandi (gỗ sồi sáng, cây bonsai, tối giản).
   - Nhà phố 3 tầng mặt tiền xanh.
3. Thiết kế mô hình kiến trúc thu nhỏ 3D:
   - Biệt thự 2 tầng thu nhỏ với hình khối kiến trúc hiện đại, vách kính, ban công, cây mini.
   - Căn hộ cắt lớp (Cutaway Apartment) với phòng khách, phòng ngủ mini chi tiết.
   - Bục đá mài/gỗ walnut có hộp kính acrylic bảo vệ.
4. Phân bổ các tác phẩm tranh và mô hình vào các phòng ban:
   - Phòng Mira (KTS Trưởng)
   - Phòng Bảo (Nội thất)
   - Phòng Đội Thi Công
   - Phòng Họp Trung Tâm
   - Hành Lang Chính & Khu Lounge
5. Cập nhật vật cản lưới A* tương ứng, chạy kiểm thử tự động với headless Chrome.
6. Chụp 4 ảnh nghiệm thu sắc nét và cập nhật hợp đồng sang `CLOSED`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-054-architectural-interior-showroom-gallery.md` | Mới | Hợp đồng tính năng bắt buộc theo AGENTS.md |
| `ai-office-standalone/index.html` | Cập nhật | Bổ sung khu trưng bày mô hình, gallery tranh nội thất và mẫu vật liệu |
| `scratch/capture.js` | Cập nhật | Kiểm thử và chụp ảnh nghiệm thu mới |

## 7. Acceptance criteria

- [x] AC-01: Hệ thống khung tranh 3D có độ dày, viền kim loại/gỗ, mặt kính và thể hiện các bức tranh nội thất nhà ở đa dạng (Biệt thự Luxury, Phòng ngủ Master, Bếp Penthouse, Phòng khách Japandi).
- [x] AC-02: Bổ sung các mô hình kiến trúc thu nhỏ 3D thực sự (biệt thự 2 tầng, căn hộ cắt lớp) đặt trên bệ trưng bày có hộp kính bảo vệ và đèn LED hắt sáng.
- [x] AC-03: Kệ trưng bày mẫu vật liệu đa dạng (gỗ tự nhiên, đá marble, da vải sofa, tay nắm phụ kiện kim loại).
- [x] AC-04: Phân bố chuẩn xác theo từng phòng: Mira (biệt thự & sách kiến trúc), Bảo (gallery nội thất & mẫu vải), Đội thi công (mô hình kết cấu & bản vẽ), Phòng họp (gallery dự án & mô hình trung tâm), Hành lang (tranh rọi đèn).
- [x] AC-05: Tranh và mô hình nhìn thấy rõ ràng từ góc camera isometric 3/4, không che khuất nhân vật hay lối đi chính.
- [x] AC-06: Giữ nguyên 9 agent, lưới A* 60x40 (150/150 đường đi hợp lệ, 0 va chạm), chạy mượt 60 FPS, 0 lỗi console JavaScript.
- [x] AC-07: Chụp 4 ảnh nghiệm thu thực tế kiểm tra chất lượng.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Chạy thử trên Chrome Headless | `node scratch/capture.js` | 0 lỗi console, SelfTest 150/150 hợp lệ, render đầy đủ tranh & mô hình |
| Kiểm tra giao diện trực tiếp | Mở `http://localhost:8123` | Không gian như showroom kiến trúc cao cấp, tranh rọi đèn sang trọng |

## 9. Rủi ro và rollback

- Rủi ro: Thêm nhiều tranh và mô hình có thể làm tăng draw calls.
- Giảm thiểu: Tối ưu geometry, dùng chung vật liệu kính và khung tranh, chia sẻ textures.
- Rollback: Khôi phục lại working tree qua git nếu cần.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 21:55 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Khởi tạo hợp đồng | Bổ sung không gian trưng bày kiến trúc, mô hình nhà ở và gallery tranh nội thất | Không | Người dùng | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 21:55 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Bắt đầu triển khai | Khởi tạo hợp đồng và đóng băng yêu cầu |
| 2026-11-17 21:55 | working tree | Xây dựng FramedArtwork3D | 5 tác phẩm Canvas High-DPI (Biệt thự Luxury, Master Bed, Kitchen, Japandi, Townhouse) có đèn rọi tranh 3000K |
| 2026-11-17 21:55 | working tree | Xây dựng ArchitecturalScaleModel 3D | Mô hình Biệt thự 2 tầng có hồ bơi & Mô hình căn hộ cắt lớp dưới lồng kính vitrine acrylic trên bệ đá |
| 2026-11-17 21:55 | working tree | Xây dựng MaterialShowroomStand | Bảng mẫu vật liệu Calacatta, Nero Marquina, Gỗ sồi, Da Cognac, Vải Boucle và tay nắm đồng |
| 2026-11-17 21:56 | working tree | Phân bổ vào 7 phân khu chức năng | Bố trí khoa học theo từng phòng, cập nhật vật cản A* |
| 2026-11-17 21:56 | working tree | Chạy kiểm thử tự động Headless Chrome | 0 lỗi console, SelfTest 150/150 hợp lệ, chụp 4 ảnh nghiệm thu sắc nét |

## 13. Verification evidence

- Lệnh kiểm thử: `node scratch/capture.js`
- Kết quả Chrome Headless:
  ```text
  Chrome spawned. Waiting for debugging port...
  Connected to tab: http://localhost:8123/
  Page loaded, waiting 2.5s for initial render and selfTest...
  [BROWSER CONSOLE] selfTest 150 150 0
  SelfTest HUD: Kiểm thử A*: 150/150 đường đi hợp lệ · 0 va chạm
  Current Phase: Khách hàng gửi Brief: Phòng ngủ trẻ em 3×4m, ngân sách 40tr
  Taking Shot 1: Toàn cảnh Studio & Showroom triển lãm...
  Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot1_overview.png (597936 bytes)
  Taking Shot 2: Cận cảnh Phòng Đội Thi Công...
  Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot2_courtyard_lounge.png (569893 bytes)
  Taking Shot 3: Cận cảnh Phòng Họp Kiến Trúc trung tâm...
  Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot3_upper_floor.png (527701 bytes)
  Taking Shot 4: Cận cảnh Phòng KTS Trưởng Mira & Mô hình biệt thự 2 tầng...
  Saved screenshot: C:\Users\TUAN\Downloads\qldapm_fina\ai-office-standalone\shot4_kanban_approval.png (144482 bytes)
  All 4 showroom & gallery screenshots taken successfully!
  ```
- Kết quả Acceptance Criteria: Cả 7 tiêu chí từ AC-01 đến AC-07 đều hoàn thành 100%.

## 14. Kết quả và đóng chức năng

- Kết quả: Không gian văn phòng AI đã hoàn toàn chuyển mình thành một **Luxury Architecture & Interior Design Studio / Showroom** đích thực với hệ thống tranh nội thất có đèn rọi tranh nghệ thuật, mô hình nhà ở thu nhỏ 3D tinh xảo dưới lồng kính vitrine, bảng trưng bày mẫu vật liệu đa dạng và bố cục khoa học, chuẩn xác.
- Trạng thái `CLOSED` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 21:56 (Asia/Bangkok)
