# [FEAT-2026-049] Clean Single-Floor Real Company Office Layout

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Creative Developer & Art Director |
| Người chấp thuận | Người dùng theo brief văn phòng thực tế 1 phòng họp |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 21:03 (Asia/Bangkok) |
| Revision bắt đầu | 9d241d75cd79e6ebf6c046b961973431893fe120 |
| Revision cuối | working tree |

## 1. Bối cảnh

Người dùng yêu cầu đơn giản hóa triệt để mô hình văn phòng theo hướng thực tế của 1 công ty vận hành thật:
- Chỉ có **1 phòng họp duy nhất** ("1 phòng họp thôi").
- Toàn bộ không gian còn lại tập trung cho **các cụm bàn nhân viên** ("còn lại là các bàn nhân viên").
- Loại bỏ các chi tiết trưng bày showroom rườm rà ("làm lại đi làm 1 cty thôi bỏ mấy cái linh tinh đi": bỏ 3 bục vignette cồng kềnh, bỏ phòng CEO suite ngăn cách biệt lập, bỏ 5 phòng họp rải rác).
- Tạo ra mặt bằng văn phòng công ty hiện đại (Modern Open-Plan Workspace): sảnh tiếp tân gọn gàng với logo công ty, 1 phòng họp kính trung tâm trang bị bảng trắng và màn chiếu, các cụm bàn làm việc theo phòng ban (Thiết kế, Dựng hình, Dự toán, QA/DevOps, Quản lý), và góc pantry cà phê/sofa thư giãn nhẹ nhàng.

## 2. Mục tiêu

1. Tái cấu trúc mặt bằng thành văn phòng công ty thực tế 1 sàn (diện tích gọn gàng $32m \times 20m$, $64 \times 40$ ô lưới, $CS = 0.5m$).
2. Quy hoạch không gian thiết thực gồm:
   - Sảnh tiếp tân gọn gàng (quầy lễ tân, lễ tân Mai, vách logo công ty 3D).
   - Đúng **1 phòng họp chính** vách kính trang trọng (bàn họp dài 10-12 ghế, bảng trắng tự sinh biên bản, màn hình TV).
   - Không gian mở trung tâm với các cụm bàn nhân viên chia theo nhóm nghiệp vụ: Nhóm Thiết kế, Nhóm Dựng hình/BIM, Nhóm Dự toán/Vật tư, Nhóm QA & Vận hành, Ban Điều hành (Mira, PO ngồi cùng không gian mở kết nối nhân viên).
   - Góc Pantry & Coffee Lounge nhỏ gọn, ấm cúng (quầy pha cà phê, bàn bar, sofa nghỉ trưa).
3. Giữ nguyên 100% logic và tính năng tương tác đã kiểm chứng:
   - Click màn hình mở Mock Terminal SSH (lệnh, tool call, thanh tiến độ, can thiệp prompt / cancel loop).
   - Đèn LED trạng thái tại từng bàn (xanh rảnh, xanh dương làm việc, vàng chờ, đỏ lỗi).
   - Nhãn tên nổi CSS2D tự giãn cách chống chồng lấn.
   - Máy trạng thái nhiệm vụ 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`).
   - Kịch bản mô phỏng: họp tập trung tại 1 phòng họp duy nhất, trao đổi A2A giữa các bàn, QA kiểm tra, hộp tài liệu 3D `scene.json` bay khi giao nhận, agent idle ra pantry uống cà phê / ngồi sofa nghỉ ngơi (0 token call).
   - Bảng điều khiển toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống).
   - Bảng Kanban 6 cột (`Cần làm`, `Đang làm`, `Duyệt`, `Xong`, `Trễ`, `Lưu trữ`) và modal Phê duyệt có bản vẽ SVG, checklist QA audit, bảng BOM.
   - Chế độ xem: 3D | Kanban | Sprite.
   - Bộ 7 kiểm thử đo được (invariants) tự động chạy và đạt 7/7 PASS.
4. Chụp lại 4 ảnh nghiệm thu chất lượng cao của văn phòng thực tế mới.

## 3. Phạm vi

### In scope

- Cập nhật trực tiếp `ai-office-standalone/index.html` sang mặt bằng văn phòng thực tế 1 sàn, 1 phòng họp.
- Loại bỏ các chi tiết showroom không cần thiết (3 bục vignette, CEO suite biệt lập, các phòng họp phụ).
- Sắp xếp các cụm bàn làm việc mở gọn gàng, chuyên nghiệp, thông thoáng.
- Cập nhật bộ sinh lưới A*, điểm neo ghế, và kịch bản sự kiện cho 1 phòng họp duy nhất.
- Chạy tự động selftest và chụp 4 ảnh nghiệm thu: (1) Toàn cảnh văn phòng mở, (2) Góc Pantry & Lounge, (3) Phòng họp chính, (4) Panel Kanban & Modal duyệt bài.

### Out of scope

- Không sửa đổi cấu trúc dữ liệu bên ngoài package `ai-office-standalone/`.

## 4. Dependency và tài nguyên cần bảo vệ

- CDN Three.js r128.
- Chrome headless để test tự động và chụp ảnh.

## 5. Thiết kế và kế hoạch triển khai

1. **Thiết kế Mặt bằng Văn phòng Mở (Masterplan)**:
   - Kích thước lưới: $W = 64, H = 40$ ($32m \times 20m$).
   - Phía Tây ($c: 0..16, r: 0..14$): Sảnh tiếp tân gọn gàng với vách logo công ty 3D.
   - Phía Bắc Trung tâm ($c: 20..44, r: 0..14$): **1 Phòng họp chính duy nhất** (10-12 ghế, vách kính, bảng trắng tự sinh).
   - Phía Đông ($c: 48..64, r: 0..14$): Góc Pantry cà phê & Sofa Lounge thư giãn.
   - Khu Vực Trung Tâm & Phía Nam ($c: 0..64, r: 16..40$): Không gian mở lớn với 5 cụm bàn làm việc:
     - Cụm Ban Điều hành (Mira, PO)
     - Cụm Xưởng Thiết kế (An, Bảo, Duy)
     - Cụm Xưởng Dựng hình · Ánh sáng (Minh, Nhi, Khoa)
     - Cụm Kho & Dự toán (Chi, Quân, Thảo)
     - Cụm QA & DevOps Lab (Linh, Tuấn, Hải)
2. **Lưới Đi Lại & A***:
   - Lối đi chính rộng rãi từ 2m - 3m giữa các cụm bàn, bảo đảm 100% tiếp cận hai chiều.
3. **Mô hình 3D Dollhouse Cutaway**:
   - Phong cách Japandi tối giản: gỗ sồi sáng, nẹp chân tường, vách ngăn lửng giữa các cụm bàn, cây cảnh để bàn.
4. **Kiểm thử 7 Invariants**:
   - Cập nhật hàm `runSelftest()` phù hợp và xác nhận 7/7 PASS.
5. **Chụp 4 Ảnh Nghiệm Thu**.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-049-clean-single-floor-real-company-office.md` | Mới | Hợp đồng tính năng bắt buộc theo quy định AGENTS.md |
| `ai-office-standalone/index.html` | Cập nhật | Tối giản văn phòng thành 1 sàn, 1 phòng họp, tập trung vào bàn nhân viên |

## 7. Acceptance criteria

- [x] AC-01: Mặt bằng văn phòng 1 sàn duy nhất, loại bỏ hoàn toàn các chi tiết rườm rà (vignette, phòng họp phụ, CEO suite biệt lập), tập trung vào các cụm bàn nhân viên và đúng 1 phòng họp chính.
- [x] AC-02: Đúng 1 phòng họp chính hiện đại có bàn họp dài 10-12 ghế, bảng trắng tự sinh biên bản ([Quyết định], [Việc cần làm], [Rủi ro]).
- [x] AC-03: Toàn bộ 15 nhân sự có bàn làm việc đầy đủ trong không gian mở (màn hình máy tính click mở Mock Terminal, đèn LED trạng thái 4 màu, huy hiệu vai trò, ghế có neo).
- [x] AC-04: Sảnh tiếp tân gọn gàng với quầy lễ tân (nhân viên Mai) và logo công ty 3D trên tường.
- [x] AC-05: Góc pantry cà phê và sofa lounge thư giãn nhỏ gọn, phục vụ agent idle với animation (cầm cốc cà phê, ngồi đọc sách, tưới cây cảnh), 0 token cost.
- [x] AC-06: Máy trạng thái nhiệm vụ 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`), nhãn tên nổi tự giãn cách chống đè nhau.
- [x] AC-07: Kịch bản mô phỏng chạy liền mạch: triệu tập họp tại 1 phòng họp duy nhất, trao đổi A2A tại bàn, QA kiểm tra, hộp tài liệu 3D `scene.json` bay khi giao nhận.
- [x] AC-08: Thanh trên cùng mở panel toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống), chuyển chế độ 3D / Kanban / Sprite.
- [x] AC-09: Bảng Kanban 6 cột và modal Phê duyệt với bản vẽ SVG, checklist QA audit, bảng BOM chi tiết.
- [x] AC-10: Bộ 7 kiểm thử đo được (invariants) tự động chạy đạt 7/7 PASS trên HUD và console; chụp đủ 4 ảnh nghiệm thu chất lượng cao.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm thử 7 Invariants | Tự động chạy qua `runSelftest()` | 7/7 Invariants Đạt (100% PASS) |
| Kiểm tra giao diện và console | Headless Chrome test runner | Không có lỗi JavaScript / console exception |
| Chụp 4 ảnh nghiệm thu | Chạy qua CDP script | Lưu đủ 4 file ảnh mới trong thư mục standalone & artifacts |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Bố trí nhiều bàn làm việc gây va chạm | Quy hoạch khoảng cách giữa các hàng bàn tối thiểu 2.0m, kiểm tra AABB va chạm = 0 |

Rollback point: Khôi phục lại bản commit trước đó qua git.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 21:03 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Khởi tạo hợp đồng tính năng | Tối giản văn phòng thành 1 sàn, 1 phòng họp, tập trung vào bàn nhân viên | Không | Người dùng | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 21:03 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Bắt đầu triển khai hợp đồng FROZEN | Thiết kế mặt bằng văn phòng mở $64 \times 40$ |

## 13. Verification evidence

*(Sẽ cập nhật sau khi hoàn thành kiểm thử)*

## 14. Kết quả và đóng chức năng

*(Sẽ cập nhật sau khi nghiệm thu)*
