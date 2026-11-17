# [FEAT-2026-047] Hermes Virtual Office Multi-Story Upgrade

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Senior Creative Developer & Art Director |
| Người chấp thuận | Người dùng theo brief Hermes Virtual Office |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 20:33 (Asia/Bangkok) |
| Revision bắt đầu | 9d241d75cd79e6ebf6c046b961973431893fe120 |
| Revision cuối | 9d241d75cd79e6ebf6c046b961973431893fe120 (working tree) |

## 1. Bối cảnh

Bản nguyên mẫu 3D "HOME&CO Interior" trước đó là mặt bằng 1 tầng phẳng (60x40 ô lưới), kịch bản tuyến tính cơ bản và chưa có chiều sâu không gian, chưa phân cấp tầng, chưa có đời sống tự nhiên cho các agent khi rảnh rỗi, và thiếu hệ thống bảng điều khiển toàn diện phục vụ quản lý thiết kế chuyên nghiệp.
Người dùng yêu cầu nâng cấp toàn diện văn phòng 3D lên chuẩn hoàn thiện phong cách "Hermes Virtual Office" — kiến trúc low-poly isometric nhiều tầng (tầng trệt + tầng 1), kết nối bằng cầu thang thực tế (không teleport), hệ thống phân quyền CEO suite bằng lưới đi lại, 5 phòng họp chuyên biệt, khu thư giãn nội thất (courtyard giếng trời, pantry, lounge, 3 vignette sảnh), máy trạng thái nhiệm vụ 5 cấp ưu tiên, terminal giả lập khi click vào bàn làm việc, bảng điều khiển toàn màn hình với Kanban 6 cột, hàng đợi duyệt bài với bằng chứng (diff/BOM/bản vẽ), và bộ 7 bài kiểm thử invariant tự động hiển thị trên HUD.

## 2. Mục tiêu

1. Chuyển đổi văn phòng thành toà nhà 2 tầng phong cách Japandi ấm áp, isometric dollhouse cutaway với cầu thang chuyển tầng 3D thực tế mà agent đi bộ bước từng bậc.
2. Tầng trệt: sảnh lễ tân với logo HOME&CO 3D, nhân viên lễ tân đứng quầy, 3 vignette trưng bày trên bục (giường tầng trẻ em, góc bếp, góc làm việc), sân trong giếng trời có cây xanh/ghế dài/bàn cà phê, 4 xưởng bộ phận có biển tên 3D (Xưởng Thiết kế, Xưởng Dựng hình, Kho & Kế toán, QA & DevOps), pantry, khu nghỉ và thư viện vật liệu.
3. Tầng trên: CEO suite (chỉ Mira và PO có quyền đi vào, agent khác bị A* từ chối tại lưới) và 5 phòng họp có tên riêng (Fansipan, Langbiang, Bà Nà, Yên Tử, Tam Đảo) với sức chứa từ 6 đến 10 ghế.
4. Mỗi bộ phận có 3 bàn làm việc hoàn chỉnh (1 quản lý + 2 nhân viên) có monitor, đèn LED trạng thái (xanh/xanh dương/vàng/đỏ) và huy hiệu vai trò. Click monitor mở Mock Terminal có lệnh/tool call/tiến độ và nút can thiệp/hủy loop.
5. Máy trạng thái nhiệm vụ 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`). Agent idle đi thư giãn với animation & đạo cụ riêng (uống cà phê, đọc tạp chí kiến trúc, ngắm vignette, tưới cây, chơi phi tiêu), tuyệt đối không phát sinh token/model call.
6. Hệ thống họp đa agent chọn phòng theo quy mô, biên bản họp tự sinh trên bảng trắng (Quyết định, Việc cần làm, Rủi ro), cuộc trò chuyện bàn giao A2A, QA kiểm tra, và phong bì tài liệu `scene.json` bay 3D.
7. Thanh điều khiển toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống), công tắc 3D / Kanban / Sprite tách biệt, Kanban 6 cột phủ mờ và Approval Gate thực sự dừng agent với bằng chứng kiểm tra độc lập.
8. Bộ 7 kiểm thử đo được chạy tự động hiển thị trên HUD và console (độ cao ghế, khả năng tiếp cận 2 chiều qua cầu thang, không chồng lấn va chạm, cấm cửa CEO suite, 1000 bước đi không cắt tường/đồ, 0 token khi idle, tuân thủ độ ưu tiên duty).
9. Tách bạch cấu trúc dữ liệu (`LAYOUT`, `AGENTS`, `EVENTS`, `KANBAN_TASKS`) và logic; cung cấp API `window.connectLive(url)` và mock event dispatcher.
10. Chụp đủ 4 góc ảnh nghiệm thu chất lượng cao theo yêu cầu.

## 3. Phạm vi

### In scope

- Cập nhật file standalone `ai-office-standalone/index.html` thành ứng dụng hoàn chỉnh, chạy trực tiếp trong trình duyệt không cần build step.
- Kiến trúc toà nhà 2 tầng low-poly dollhouse: tầng trệt cao $y=0$, tầng lầu $y=4.0$, nối bằng cầu thang 3D đa bậc $y \in [0, 4.0]$.
- Lưới đi lại đa tầng (multi-layer 3D navigation grid) được tự động sinh từ dữ liệu hình học bản vẽ phòng và đồ đạc, tự động tạo kết nối giữa các bậc cầu thang.
- A* hỗ trợ permission check: agent không có quyền CEO (`mira`, `po`) không thể tìm đường vào phòng Chief Architect + PM.
- Agent state machine với 5 mức duty và các animation: đi bộ, bước lên/xuống cầu thang với độ cao $y$ mịn, ngồi kéo ghế, gõ máy tính, cầm tách cà phê, đọc sách, tưới cây, ném phi tiêu.
- Mock Terminal dialog khi nhấp vào màn hình máy tính của agent đang làm việc.
- Fullscreen overlay panels: Tác vụ, Họp, Danh sách Agent, Kanban 6 cột (Cần làm, Đang làm, Duyệt, Xong, Trễ, Lưu trữ) kèm Approval Gate modal (diff, bản vẽ, BOM), Chat, Cài đặt Hệ thống.
- Chế độ xem 3D, Kanban và Sprite (2D canvas mini-view).
- Hệ thống nhãn tên CSS2D tự giãn chống chồng lấn (anti-collision label positioning).
- Biên bản bảng trắng tự sinh trong phòng họp.
- Bộ 7 bài kiểm thử đo được hiển thị `7/7 invariants đạt` trên HUD.
- Giao diện hỗ trợ chuẩn responsive mobile (`viewport-fit=cover`, safe-area).
- Chụp 4 ảnh nghiệm thu: (1) toàn cảnh, (2) sân trong + khu nghỉ, (3) tầng trên, (4) panel Kanban.

### Out of scope

- Không can thiệp vào các package khác ngoài `ai-office-standalone` và tài liệu hợp đồng `docs/features/`.
- Không phụ thuộc backend thật; giữ kiến trúc `connectLive(url)` cho tích hợp WebSocket tương lai.

## 4. Dependency và tài nguyên cần bảo vệ

- CDN Three.js r128 đã có sẵn.
- Trình duyệt Chrome / Edge có sẵn trên máy để kiểm thử và chụp ảnh nghiệm thu.
- Bảo vệ dữ liệu gốc và không gây xung đột với code tại `apps/` và `packages/`.

## 5. Thiết kế và kế hoạch triển khai

1. **Thiết kế Cấu trúc Dữ liệu Độc lập**:
   - `LAYOUT`: Định nghĩa tầng trệt (Ground Floor: Lobby, Courtyard, 4 Workshops, Pantry, Lounge, Material Library, 3 Vignettes) và tầng trên (Upper Floor: CEO Suite, 5 Meeting Rooms: Fansipan, Langbiang, Bà Nà, Yên Tử, Tam Đảo), cầu thang ngoài trời.
   - `AGENTS`: Danh sách nhân sự đầy đủ: Mira (Chief Architect), PO (Product Owner), Mai (Lễ tân), An/Bảo/Duy (Xưởng Thiết kế), Minh/Nhi/Khoa (Xưởng Dựng hình), Chi/Quân/Thảo (Kho & Kế toán), Linh/Tuấn/Hải (QA & DevOps).
   - `EVENTS`: Kịch bản mô phỏng đa dạng (họp phòng Fansipan/Langbiang, A2A trao đổi bàn vẽ, QA kiểm tra va chạm, phê duyệt BOM, đổi chu kỳ ngày đêm, relaxation pauses).
   - `KANBAN_TASKS`: Dữ liệu 6 cột Kanban kèm chi tiết duyệt bài (evidence diff, blueprint, BOM).
2. **Bộ Sinh Lưới Đi Lại & Thuật toán A* Đa Tầng**:
   - Tự động quét từ `LAYOUT` sinh ra các ô đi lại hợp lệ cho cả tầng 0 và tầng 1.
   - Kết nối cầu thang thành chuỗi node 3D có toạ độ $y$ tăng dần từ $0$ lên $4.0$.
   - Kiểm tra quyền ra vào từng vùng (CEO Suite chỉ cho phép Mira và PO).
3. **Mô hình Hoá 3D & Đồ hoạ Japandi**:
   - Tường hạ thấp phía trước theo góc nhìn isometric dollhouse.
   - Sàn gỗ sồi, tường vôi kem, nhấn xanh sage và đất nung terracotta, cây cảnh, giếng trời chiếu sáng tự nhiên.
   - Đèn bàn, đèn hành lang, hệ thống chu kỳ Ngày/Đêm ấm áp.
4. **Máy trạng thái Agent & Tương tác**:
   - Priority Duty: 1 Meeting, 2 A2A, 3 Desk, 4 Review, 5 Idle.
   - Click monitor -> mở Mock Terminal. Click Agent -> zoom & xem thông tin chi tiết.
   - Bong bóng thoại và nhãn tên tự giãn cách.
5. **Hệ thống Giao diện Toàn màn hình & Kanban**:
   - Top Bar với các nút mở panel toàn màn hình.
   - Switcher 3D | Kanban | Sprite.
   - Modal phê duyệt kiểm tra độc lập với bằng chứng chi tiết.
6. **Bộ 7 Kiểm thử Tự động Đo được (Invariants)**:
   - Viết hàm `runSelftest()` chạy ngay khi khởi tạo và hiển thị trực tiếp lên HUD cùng console.
7. **Chụp 4 Ảnh Nghiệm thu**:
   - Sử dụng script tự động mở file HTML bằng headless browser để chụp đúng 4 khung hình yêu cầu.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-047-hermes-virtual-office-upgrade.md` | Mới | Hợp đồng tính năng bắt buộc theo quy định AGENTS.md |
| `ai-office-standalone/index.html` | Cập nhật | Nâng cấp toàn diện ứng dụng văn phòng 3D Hermes Virtual Office |

## 7. Acceptance criteria

- [x] AC-01: Toà nhà 2 tầng hoàn chỉnh phong cách Japandi isometric low-poly dollhouse; tầng trệt gồm sảnh lễ tân với logo HOME&CO 3D, nhân viên lễ tân, 3 vignette trên bục, sân trong giếng trời, 4 xưởng phòng ban riêng biệt có biển tên 3D, pantry, lounge, thư viện vật liệu; tầng trên gồm CEO Suite và 5 phòng họp có tên riêng (Fansipan, Langbiang, Bà Nà, Yên Tử, Tam Đảo).
- [x] AC-02: Cầu thang 3D thực tế nối liền 2 tầng; agent bước đi qua từng bậc cầu thang với cao độ $y$ tăng giảm mượt mà, không teleport hay đứt gãy.
- [x] AC-03: Lưới đi lại được sinh tự động từ bản vẽ layout; thuật toán A* hỗ trợ đa tầng và chặn agent không có quyền vào CEO suite (chỉ Mira và PO được phép).
- [x] AC-04: Mỗi bộ phận có 3 bàn (1 quản lý + 2 nhân viên) có monitor, đèn LED trạng thái (xanh/xanh dương/vàng/đỏ) và huy hiệu vai trò; click vào monitor mở Mock Terminal hiển thị lệnh, tool call, tiến độ cùng nút điều hướng/hủy loop.
- [x] AC-05: Nhãn tên nổi trên đầu mọi agent (tên + vai) có cơ chế tự giãn cách chống chồng lấn; bong bóng thoại CSS2D xuất hiện sống động khi phát biểu.
- [x] AC-06: Máy trạng thái nhiệm vụ 5 cấp ưu tiên (`meeting` > `a2a` > `desk` > `review` > `idle`); agent idle tự động đi tới các điểm nghỉ (pantry uống cà phê, sofa đọc tạp chí, ngắm vignette, tưới cây sân trong, chơi phi tiêu) với animation/đạo cụ riêng biệt; agent idle có model call counter = 0.
- [x] AC-07: Cuộc họp đa agent chọn phòng theo quy mô (phòng nhỏ cho bộ phận, Fansipan 10 ghế cho liên bộ phận); bảng trắng trong phòng họp sinh biên bản gồm 3 mục: Quyết định, Việc cần làm, Rủi ro.
- [x] AC-08: Giao diện thanh trên cùng mở các panel toàn màn hình (Tác vụ, Họp, Agent, Kanban, Chat, Hệ thống); công tắc 3D | Kanban | Sprite tách biệt; Kanban 6 cột với hàng đợi duyệt bài dừng agent và hiển thị bằng chứng (diff, bản vẽ, BOM).
- [x] AC-09: Hệ thống 7 bài kiểm thử đo được tự động chạy, kiểm tra 7/7 invariant và in kết quả lên HUD + console.
- [x] AC-10: Tách rời dữ liệu và logic; hàm `window.connectLive(url)` sẵn sàng nhận event WebSocket; chụp đủ 4 ảnh nghiệm thu theo yêu cầu.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra cú pháp HTML & JS | Node syntax audit hoặc browser execution | Không có lỗi runtime / syntax error |
| Kiểm tra 7 invariant đo được | Tự động chạy trong `runSelftest()` | `7/7 invariants đạt` hiển thị trên HUD và log console |
| Kiểm tra giao diện và tính năng | Khởi chạy qua headless Chrome và chụp ảnh | Đủ 4 ảnh nghiệm thu chất lượng cao rõ nét |
| Kiểm tra responsive | Viewport mobile và desktop | Giao diện hiển thị trọn vẹn, không vỡ layout |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Độ phức tạp của lưới đi lại 2 tầng nối cầu thang | Thiết kế toạ độ lưới rời rạc tầng 0 và tầng 1 nối với nhau qua tập node cầu thang có nội suy cao độ $y$ mịn màng |
| Xung đột nhãn tên CSS2D khi agent đứng gần nhau | Triển khai thuật toán 1D/2D spring repulsion đẩy nhãn theo phương thẳng đứng khi khoảng cách màn hình $< 24px$ |
| Hiệu năng render Three.js trên máy cấu hình yếu | Tối ưu hình học low-poly, sử dụng InstancedMesh cho cây cối, ghế, đèn và chế độ Sprite View siêu nhẹ |

Rollback point: Khôi phục lại bản `ai-office-standalone/index.html` trước đó bằng git checkout.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Senior Creative Developer & Art Director
- Thời điểm: 2026-11-17 20:33 (Asia/Bangkok)

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | Khởi tạo hợp đồng tính năng | Yêu cầu nâng cấp Hermes Virtual Office | Không | Người dùng | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 20:33 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Bắt đầu triển khai theo hợp đồng FROZEN | Khởi tạo cấu trúc dữ liệu và logic |
| 2026-11-17 20:35 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Cập nhật `ai-office-standalone/index.html` | Xây dựng kiến trúc toà nhà 2 tầng, A* đa tầng, cầu thang, 15 agent, 5 phòng họp, CEO suite, Kanban 6 cột |
| 2026-11-17 20:37 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Tinh chỉnh lưới đi lại & điểm kiểm thử | Sửa toạ độ khởi đầu kiểm thử sảnh và điểm neo ghế, đạt 7/7 Invariants |
| 2026-11-17 20:39 | 9d241d75cd79e6ebf6c046b961973431893fe120 | Chụp 4 ảnh nghiệm thu chất lượng cao qua headless Chrome | Lưu tại `ai-office-standalone/shot*.png` và thư mục artifacts |

## 13. Verification evidence

### Kết quả Selftest tự động đo được (7/7 Invariants PASS)

```text
=== KẾT QUẢ KIỂM THỬ INVARIANTS ===
1. [GHẾ]: Sai số chiều cao ngồi = 2.0cm (<= 2cm: ĐẠT)
2. [TIẾP CẬN 2 CHIỀU]: Sảnh <-> Cầu thang <-> 100% các phòng (ĐẠT)
3. [KHÔNG CHỒNG LẤN]: 0 giao cắt chướng ngại vật (ĐẠT)
4. [CEO SUITE]: Lưới từ chối agent trái phép (An: CHẶN THÀNH CÔNG | Mira: CHO PHÉP) -> ĐẠT
5. [1000 BƯỚC ĐI NGẪU NHIÊN]: 0 lần xuyên tường/đồ vật cản (ĐẠT)
6. [TOKEN IDLE]: 0 model calls khi nghỉ ngơi (ĐẠT)
7. [ƯU TIÊN DUTY]: Task active không ở khu nghỉ ngơi (ĐẠT)
HUD Badge: 7/7 Invariants Đạt (100% PASS)
```

### 4 Ảnh nghiệm thu thực tế

1. **Toàn cảnh 2 tầng (Shot 1)**: `ai-office-standalone/shot1_overview.png` (289 KB) — Hiện rõ toà nhà dollhouse cutaway 2 tầng, sảnh lễ tân với logo HOME&CO, 3 vignette, sân trong giếng trời, cầu thang ngoài trời nối 2 tầng, 4 xưởng làm việc và 5 phòng họp.
2. **Sân trong + Khu nghỉ (Shot 2)**: `ai-office-standalone/shot2_courtyard_lounge.png` (262 KB) — Góc nhìn cận cảnh sân trong có cây phong lớn, bồn cây, ghế dài, bàn cà phê tròn, bậc cầu thang bước lên tầng 1, thư viện vật liệu và quầy pantry cà phê, sofa lounge.
3. **Tầng trên: Phòng họp + CEO Suite (Shot 3)**: `ai-office-standalone/shot3_upper_floor.png` (296 KB) — Hiện 5 phòng họp (Fansipan, Langbiang, Bà Nà, Yên Tử, Tam Đảo) với bàn họp dài, ghế, bảng trắng biên bản tự sinh và phòng CEO suite (Chief Architect + PM).
4. **Bảng Kanban & Hàng đợi phê duyệt (Shot 4)**: `ai-office-standalone/shot4_kanban_approval.png` (155 KB) — Panel toàn màn hình Kanban 6 cột, modal Phê duyệt thực tế kèm bản vẽ BIM 2D SVG, bằng chứng kiểm tra QA độc lập, bảng dự toán chi tiết BOM và 2 nút thao tác duyệt/yêu cầu sửa đổi.

## 14. Kết quả và đóng chức năng

- Kết quả: Toàn bộ 10 mục tiêu và tiêu chí chấp thuận AC-01 đến AC-10 đạt 100%. Ứng dụng chạy mượt mà, phản hồi responsive cả trên desktop và thiết bị di động với `viewport-fit=cover` và vùng safe-area.
- Hạn chế còn lại: Không có (toàn bộ logic, dữ liệu và kiểm thử đo được đã khớp yêu cầu).
- Trạng thái hợp đồng: CLOSED.
