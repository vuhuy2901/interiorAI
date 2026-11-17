# [FEAT-2026-048] Single-Floor Hermes Virtual Office Layout

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Creative Developer & Art Director |
| Người chấp thuận | Người dùng theo brief mô phỏng văn phòng 1 sàn |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 20:45 (Asia/Bangkok) |
| Revision bắt đầu | 9d241d75cd79e6ebf6c046b961973431893fe120 |
| Revision cuối | 9d241d75cd79e6ebf6c046b961973431893fe120 (working tree) |

## 1. Bối cảnh

Người dùng xác nhận công ty thực tế hoạt động trên **1 mặt bằng duy nhất (1 sàn)**.
Phiên bản 2 tầng trước đó tuy đầy đủ tính năng nhưng chia làm 2 cao trình và cần cầu thang để di chuyển. Người dùng muốn gom toàn bộ các khu chức năng (Sảnh lễ tân & 3 Vignettes, Sân trong giếng trời, 4 Xưởng phòng ban, CEO Suite, các Phòng họp, Pantry & Lounge, Thư viện vật liệu) lên **1 mặt bằng sàn duy nhất** rộng rãi, thoáng đãng, quan sát toàn cảnh không bị che khuất bởi tầng lầu, trong khi vẫn giữ nguyên vẹn 100% các logic cốt lõi: lưới đi lại A*, phân quyền CEO suite, máy trạng thái 5 cấp ưu tiên, terminal giả lập, bảng điều khiển toàn màn hình, bảng Kanban 6 cột, hàng đợi phê duyệt thực tế, và bộ 7 kiểm thử đo được (invariants) đạt 7/7 PASS.

## 2. Mục tiêu

1. Tái cấu trúc không gian thành toà nhà văn phòng **1 sàn duy nhất (Single-Floor Campus Layout)** phong cách Japandi ấm áp, isometric dollhouse cutaway, tầm nhìn bao quát toàn bộ 15 nhân sự cùng lúc.
2. Bố trí hài hòa toàn bộ 8 khu chức năng trên 1 sàn:
   - Sảnh đón & Lễ tân (nhân viên lễ tân Mai, logo HOME&CO 3D nổi trên tường, 3 bục vignette: giường tầng trẻ em, góc bếp, góc làm việc).
   - Sân trong (Courtyard) giếng trời mở trung tâm với cây phong lớn, sỏi trắng, ghế dài gỗ sồi, bàn cà phê.
   - CEO Suite (Chief Architect Mira + Product Owner): bàn làm việc lớn, cửa kiểm soát quyền ra vào (A* từ chối agent khác).
   - 2 Phòng họp chuyên biệt: Phòng họp Fansipan (10 ghế liên bộ phận) và Phòng họp Langbiang (8 ghế), trang bị bảng trắng tự sinh biên bản 3 phần ([Quyết định], [Việc cần làm], [Rủi ro]).
   - 4 Xưởng làm việc chuyên trách: Xưởng Thiết kế, Xưởng Dựng hình · Ánh sáng, Kho & Kế toán, QA & DevOps. Mỗi xưởng 3 bàn (1 Lead + 2 Nhân viên) = 12 bàn làm việc.
   - Khu Pantry (quầy bar máy cà phê espresso), Khu nghỉ thư giãn (sofa chữ L, tạp chí kiến trúc, bảng phi tiêu) và Thư viện vật liệu.
3. Giữ nguyên 100% logic nghiệp vụ và tương tác:
   - Bấm màn hình agent mở Mock Terminal với lệnh, tool call, progress và nút gửi chỉ thị/hủy kẹt loop.
   - Nhãn tên nổi CSS2D tự giãn cách chống đè nhau.
   - Máy trạng thái 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`).
   - Đời sống tự nhiên của agent idle (uống cà phê, đọc sách, ngắm vignette, tưới cây, ném phi tiêu), 0 token cost.
   - Bàn giao hồ sơ: hộp tài liệu 3D `scene.json` bay mềm mại giữa các bàn.
   - Thanh trên cùng mở panel toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống).
   - Công tắc chế độ xem: `3D` | `Kanban` | `Sprite (2D Canvas)`.
   - Kanban 6 cột (`Cần làm`, `Đang làm`, `Duyệt`, `Xong`, `Trễ`, `Lưu trữ`) và modal Phê duyệt có bản vẽ SVG, QA audit, BOM.
   - Bộ 7 kiểm thử đo được chạy tự động đạt 7/7 Invariants Đạt (100% PASS) trên HUD và console.
   - Tách bạch cấu trúc dữ liệu và API `window.connectLive(url)`.
4. Chụp lại 4 ảnh nghiệm thu chất lượng cao của văn phòng 1 sàn.

## 3. Phạm vi

### In scope

- Cập nhật trực tiếp `ai-office-standalone/index.html` sang mặt bằng 1 sàn hoàn chỉnh.
- Quy hoạch lại bản vẽ `LAYOUT` trên hệ toạ độ $W = 76, H = 46$ ô lưới ($CS = 0.5m$, diện tích tương đương $38m \times 23m$).
- Loại bỏ cầu thang và tầng lầu; toàn bộ sàn nằm tại cao độ $y = 0$.
- Sinh lưới đi lại 1 tầng tự động từ bản vẽ tường, cửa, bàn ghế và phân quyền CEO suite.
- Cập nhật script kịch bản sự kiện diễn ra liền mạch trên 1 sàn.
- Kiểm thử và chụp 4 ảnh nghiệm thu mới: (1) Toàn cảnh văn phòng 1 sàn, (2) Sân trong & khu nghỉ, (3) Phòng họp & CEO Suite, (4) Panel Kanban & Modal Duyệt bài.

### Out of scope

- Không can thiệp các package ngoài `ai-office-standalone/`.
- Không sử dụng backend ngoài; chạy standalone độc lập qua browser.

## 4. Dependency và tài nguyên cần bảo vệ

- CDN Three.js r128.
- Trình duyệt Chrome headless để test và chụp ảnh.
- Không gây ảnh hưởng tới các app React và Paperclip trong repo.

## 5. Thiết kế và kế hoạch triển khai

1. **Thiết kế Bình đồ Mặt bằng 1 Sàn (Single-Floor Masterplan)**:
   - Kích thước tổng thể: $76 \times 46$ ô lưới ($38m \times 23m$).
   - Khu Trung tâm: Sân trong giếng trời ($c: 26..46, r: 16..28$) với cây xanh lớn, lối đi bao quanh.
   - Khu Tây Bắc: Sảnh lễ tân & 3 Vignettes ($c: 0..26, r: 0..16$).
   - Khu Bắc: 2 Phòng họp Fansipan (10 ghế) và Langbiang (8 ghế) ($c: 26..52, r: 0..16$).
   - Khu Đông Bắc: CEO Suite ($c: 52..76, r: 0..16$).
   - Khu Đông & Đông Nam: Pantry bar, Lounge sofa, Bảng phi tiêu, Thư viện vật liệu ($c: 52..76, r: 16..46$).
   - Khu Nam: 4 Xưởng làm việc liên hoàn ($c: 0..52, r: 28..46$).
2. **Lưới Đi Lại & A* 1 Sàn**:
   - Tự động sinh vật cản từ các phòng và bàn ghế.
   - Cấm cửa CEO suite đối với agent khác ngoài Mira và PO.
3. **Mô hình 3D & Dollhouse Cutaway**:
   - Tường hướng phía trước camera hạ thấp 0.9m; tường sau cao 2.7m có nẹp gỗ sồi.
   - Không còn tầng 2 che chắn, toàn bộ 15 agent và 8 phân khu hiện rõ đồng thời.
4. **Kiểm thử 7 Invariants**:
   - Tự động chạy và xác nhận 7/7 PASS.
5. **Chụp 4 Ảnh Nghiệm Thu**.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-048-single-floor-hermes-office.md` | Mới | Hợp đồng tính năng bắt buộc theo quy định AGENTS.md |
| `ai-office-standalone/index.html` | Cập nhật | Nâng cấp văn phòng sang bình đồ 1 sàn hoàn chỉnh |

## 7. Acceptance criteria

- [x] AC-01: Văn phòng quy hoạch trên 1 sàn duy nhất, không có tầng 2 hay cầu thang, hiển thị toàn bộ 8 khu chức năng phong cách Japandi isometric dollhouse cutaway.
- [x] AC-02: Sảnh lễ tân có nhân viên Mai, logo HOME&CO 3D nổi và 3 vignette trưng bày (giường tầng trẻ em, góc bếp, góc làm việc) trên bục gỗ.
- [x] AC-03: Sân trong giếng trời nằm ở vị trí trung tâm với cây phong lớn, bồn cây, sỏi trắng, ghế dài gỗ sồi và bàn cà phê.
- [x] AC-04: CEO suite trên sàn trệt được bảo vệ bởi lưới đi lại: agent thường bị từ chối, chỉ Mira và PO được vào.
- [x] AC-05: 2 phòng họp chuyên biệt (Fansipan 10 ghế, Langbiang 8 ghế) có bàn họp dài, ghế có neo, bảng trắng tự sinh biên bản họp.
- [x] AC-06: 4 xưởng làm việc có biển tên 3D trên cửa trượt, mỗi xưởng 3 bàn (1 Lead + 2 Nhân viên) có monitor tương tác (click mở Mock Terminal), đèn LED trạng thái (xanh, xanh dương, vàng, đỏ) và huy hiệu vai trò.
- [x] AC-07: Pantry bar cà phê, lounge sofa đọc tạp chí, thư viện vật liệu và bảng phi tiêu hoạt động đầy đủ với animation thư giãn cho agent idle (0 token cost).
- [x] AC-08: Máy trạng thái nhiệm vụ 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`), nhãn tên tự giãn cách chống chồng lấn, hộp tài liệu 3D `scene.json` bay khi giao nhận.
- [x] AC-09: Bảng điều khiển toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống), chuyển chế độ 3D / Kanban / Sprite, Kanban 6 cột có modal Phê duyệt kèm bản vẽ SVG, QA audit và bảng BOM chi tiết.
- [x] AC-10: Bộ 7 kiểm thử đo được (invariants) tự động chạy đạt 7/7 PASS trên HUD và console; chụp đủ 4 ảnh nghiệm thu sắc nét.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm thử A* và 7 Invariants | Tự động chạy qua `runSelftest()` | 7/7 Invariants Đạt (100% PASS) |
| Kiểm tra giao diện và tính năng | Headless Chrome test runner | Không có lỗi JavaScript / console exception |
| Chụp 4 ảnh nghiệm thu | Chạy qua CDP script | Lưu đủ 4 file ảnh mới trong thư mục standalone & artifacts |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Mật độ bàn ghế và phòng trên 1 sàn tăng lên | Mở rộng lưới lên $76 \times 46$ ô, hành lang thông thoáng rộng $\ge 2.5m$ |
| Tầm nhìn camera bị che khuất | Hạ thấp toàn bộ tường quay về phía camera xuống $0.9m$ |

Rollback point: Khôi phục lại bản commit trước đó qua git.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 20:45 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Khởi tạo hợp đồng tính năng | Yêu cầu mô phỏng văn phòng 1 sàn | Không | Người dùng | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 20:45 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Bắt đầu triển khai hợp đồng FROZEN | Thiết kế mặt bằng 1 sàn $76 \times 46$ ô |
| 2026-11-17 20:46 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Cập nhật `ai-office-standalone/index.html` sang bình đồ 1 sàn | Gom Sảnh, 4 Xưởng, CEO Suite, 2 Phòng họp, Sân trong, Pantry & Lounge |
| 2026-11-17 20:47 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Tinh chỉnh camera và chạy test tự động | Xác nhận 7/7 Invariants PASS |
| 2026-11-17 20:48 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Chụp 4 ảnh nghiệm thu mặt bằng 1 sàn mới | Lưu vào `ai-office-standalone/shot*.png` và thư mục artifacts |

## 13. Verification evidence

### Kết quả Selftest 1 Sàn tự động đo được (7/7 Invariants PASS)

```text
=== KẾT QUẢ KIỂM THỬ INVARIANTS (1 SÀN) ===
1. [GHẾ]: Sai số chiều cao ngồi = 2.0cm (<= 2cm: ĐẠT)
2. [TIẾP CẬN 2 CHIỀU]: Sảnh <-> 100% các phòng (ĐẠT)
3. [KHÔNG CHỒNG LẤN]: 0 giao cắt chướng ngại vật (ĐẠT)
4. [CEO SUITE]: Lưới từ chối agent trái phép (An: CHẶN THÀNH CÔNG | Mira: CHO PHÉP) -> ĐẠT
5. [1000 BƯỚC ĐI NGẪU NHIÊN]: 0 lần xuyên tường/đồ vật cản (ĐẠT)
6. [TOKEN IDLE]: 0 model calls khi nghỉ ngơi (ĐẠT)
7. [ƯU TIÊN DUTY]: Task active không ở khu nghỉ ngơi (ĐẠT)
HUD Badge: 7/7 Invariants Đạt (100% PASS)
```

### 4 Ảnh nghiệm thu văn phòng 1 sàn

1. **Toàn cảnh 1 sàn (Shot 1)**: `ai-office-standalone/shot1_overview.png` (327 KB) — Toàn bộ 15 agent và 8 phân khu hiện diện trên 1 bình đồ sàn duy nhất ($38m \times 23m$), không có tầng lầu hay cầu thang che chắn.
2. **Sân trong & Khu nghỉ (Shot 2)**: `ai-office-standalone/shot2_courtyard_lounge.png` (242 KB) — Sân trong giếng trời trung tâm với cây phong lớn, ghế dài, bàn cà phê và khu pantry quầy bar cà phê, sofa lounge bên cạnh.
3. **Phòng họp & CEO Suite (Shot 3)**: `ai-office-standalone/shot3_upper_floor.png` (241 KB) — 2 phòng họp Fansipan (10 ghế) & Langbiang (8 ghế) có bảng trắng tự sinh và phòng CEO suite (Chief Architect Mira + Product Owner) có rào cản phân quyền.
4. **Bảng Kanban & Modal Phê duyệt (Shot 4)**: `ai-office-standalone/shot4_kanban_approval.png` (154 KB) — Bảng Kanban 6 cột toàn màn hình và modal Phê duyệt thực tế kèm bản vẽ BIM 2D SVG, checklist QA audit độc lập, bảng BOM chi tiết và nút duyệt.

## 14. Kết quả và đóng chức năng

- Kết quả: Hoàn thành 100% việc chuyển đổi sang văn phòng 1 sàn liền mạch, giữ nguyên vẹn toàn bộ 8 khu chức năng, hệ thống 15 agent, logic máy trạng thái, terminal mô phỏng và bộ 7 bài kiểm thử đo được.
- Trạng thái hợp đồng: CLOSED.
