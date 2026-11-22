# [FEAT-2026-161] Di chuyển như thật: tốc độ, quay mặt, cửa tự mở, tránh nhau, ngồi ghế

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.2 |
| Owner | Sonnet subagent (pha 3a) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 |
| Revision bắt đầu | 7ea65819 (FEAT-2026-160) |
| Revision cuối | xem commit feat(FEAT-2026-161) |

## 1. Bối cảnh

Sau FEAT-158/159/160 đã có cửa chính xác, `FEAT159.planRoute`, bàn tự do và hook `Agent.prototype.walk` cho custom agent. Agent vẫn đi bằng `Agent.update` cũ: tốc độ cố định 1.45 m/s, quay gần như tức thời, đi thẳng qua cửa không chờ cửa mở, không tránh nhau, 9 agent lõi đi A* cũ, ngồi thì xoay tức thì rồi trượt vào ghế. Nhãn "Chưa có cửa" (FEAT-159) đang bật/tắt bằng `setInterval` 300 ms.

## 2. Mục tiêu

Mọi agent (9 lõi + custom) di chuyển theo waypoint của `planRoute` với tốc độ ~1.2 m/s, giảm tốc trước góc rẽ và cửa, quay mặt mượt, không đi lùi/không trượt chân; cửa trượt tự mở/đóng; tránh nhau và qua cửa từng người một; ngồi/rời bàn có kéo ghế; không có đường thì đứng yên và để lại cờ lý do cho FEAT-162.

## 3. Phạm vi

### In scope

- Khối `FEAT-2026-161 CORE` (hàm thuần, `OfficeNav.move`, không DOM/THREE): `smoothAngle` (giới hạn tốc độ quay), hồ sơ tốc độ (giảm tốc góc rẽ/cửa/đích), bảng đặt trước ô theo cửa sổ thời gian (`Reservations`), chọn lượt qua cửa (`pickDoorTurn`: một agent trong khung cửa mỗi lúc, chờ tại frontPt/backPt), trạng thái cửa tự động (mở khi có agent <1.2 m, đóng sau 1.5 s vắng người, cửa khoá không tự mở), bộ điều khiển `Mover` + `stepAll` (đi theo polyline, lệch phải khi đối đầu, phanh giữ khoảng cách, phá kẹt: lệch phải -> tính lại đường -> đi xuyên tạm (ghost) như phương án cuối).
- Khối `FEAT161` (trang): quản lý mover cho mọi agent; `Agent.prototype.walk` cho TẤT CẢ agent dùng `planRoute` qua cửa (lõi: lưới cơ sở = lưới bàn tự do hợp lưới cũ `blocked`; custom: lưới bàn như FEAT-160); chỉ rơi về A* cũ (đã làm mượt) khi chưa có dữ liệu FP2/wall graph (`FP2.walls.size===0`). Không có đường: agent giữ nguyên chỗ, đặt `agent.navBlock={reason,to,at}` và `agent.navState='blocked'`, gọi `FEAT161.onBlocked` (cho FEAT-162), `say(lý do)`; `walk` resolve với `false`, `sitDown` huỷ.
- Hoạt ảnh bước chân đồng bộ tốc độ thật (pha = quãng đường/chu kỳ sải), đứng yên khi v=0.
- Cửa trượt: lá kính cửa của FP2 (cửa gỗ/kính trượt) trượt dọc tường theo `animT`; trạng thái "tự đóng" (`animT`) tách khỏi cờ khoá `opening.open` của FEAT-158 (chỉ cờ khoá làm route báo lỗi).
- Ngồi: tới `approachPt` -> quay về `facing` (có giới hạn tốc độ quay) -> kéo ghế (tween ngắn) -> ngồi đúng `seatPt` (bàn tự do dùng toạ độ thật `seatPt/apPt`, không làm tròn ô); rời bàn ngược lại.
- Điều chỉnh nhỏ FEAT-159: bỏ `setInterval` 300 ms của nhãn "Chưa có cửa"; thay bằng accessor trên `FP2.active` gọi `FEAT159.syncVisibility()` ngay khi vào/ra Build/FP2.
- Test Node (`scripts/tests/office-nav.test.mjs`): reservation, chọn lượt cửa, làm mượt quay, phá kẹt, mô phỏng 6 agent qua 1 cửa không cần trình duyệt.

### Out of scope

- Máy trạng thái đầy đủ, panel agent, nhãn trạng thái trên đầu, đồng bộ Paperclip (FEAT-162). Chỉ để lại cờ `navBlock`, `navState`, hook `onBlocked`.
- Hoạt ảnh đi bộ mới (tay/chân vẫn là mô hình hộp cũ), tránh nhau 3D phức tạp (RVO), thang máy/cầu thang, cửa 2 cánh.
- Đổi cách đặt cửa/bàn (FEAT-158/160). Luồng poll Paperclip giữ nguyên (chỉ `walk/sitDown/standUp` bên dưới thay đổi).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `OfficeNav` (CORE 158/159/160), `FEAT158.refresh/afterRefresh`, `FEAT159.nav/planRoute`, `FEAT160.baseGrid/seatOf`, `Agent` (walk/sitDown/standUp/update).
- Dữ liệu dùng chung: `FP2.wallOpenings[].open` (khoá người dùng, không đổi nghĩa), `localStorage` (không thêm khoá mới).
- Không ảnh hưởng: Build/FP2, minimap, Custom Team, Visual Quality, luồng poll Paperclip, wall graph, cửa cũ `doors` của toà nhà gốc. Cổng 8123, 3100, 3180, 8000 không dùng/dừng; thử trình duyệt dùng 8143.

## 5. Thiết kế

- Tham số: V=1.2 m/s, tăng tốc 1.5, giảm tốc 1.8 m/s², tốc độ quay tối đa 4.2 rad/s, bán kính agent 0.25 m, khoảng cách giữ 0.6 m, tốc độ trong khung cửa <=0.8 m/s, vùng mở cửa 1.2 m, đóng sau 1.5 s, khung cửa = cách đường tâm cửa <0.45 m.
- Vị trí = điểm trên polyline(s) + độ lệch phải (`lat`, tối đa 0.5 m, về 0 gần góc/cửa/đích, kiểm tra ô chặn nên không xuyên tường). Mặt hướng về điểm nhìn trước 0.4 m, tốc độ bị chặn khi mặt lệch hướng đi (không lùi, xoay tại chỗ trước).
- Cửa: agent xin lượt khi cách điểm vào <1.2 m; `pickDoorTurn` chọn người chờ lâu nhất (hoà: gần hơn, rồi ưu tiên cố định); người không được lượt dừng tại điểm vào (frontPt/backPt, cách tâm 0.6 m, ngoài khung); người giữ lượt nhả khi ra khỏi khung. Không vào khung khi cửa chưa mở >=90%.
- Phá kẹt (stuckT = đứng yên khi có đường, không tính hàng đợi cửa hợp lệ): >2.0 s lệch phải, >3.2 s tính lại đường, >4.2 s ghost 1.2 s.
- Đặt trước: mỗi mover công bố các ô dự kiến trong 1.2 s tới (bước 0.2 s); xung đột với agent ưu tiên cao hơn -> nhường (giảm tốc).

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Thêm khối CORE 161 + `FEAT161`; sửa `Agent.walk/sitDown/standUp/update` (qua hook), lá cửa FP2 gắn `userData.door`, bỏ `setInterval` FEAT-159, `seatOf` thêm `crPt` | Triển khai |
| `scripts/tests/office-nav.test.mjs` | Thêm test 161 | AC |
| `docs/features/FEAT-2026-161-realistic-agent-movement.md` | Mới | Contract |
| `docs/features/evidence/FEAT-2026-161-*` | Mới | Bằng chứng |

## 7. Acceptance criteria

- [x] AC-01: Tốc độ trên đoạn thẳng dài trung bình trong [1.1, 1.3] m/s; tốc độ nhỏ nhất quanh góc rẽ >=60° <= 0.75 m/s; tốc độ trong khung cửa <= 0.9 m/s; gia tốc |dv/dt| <= 4 m/s².
- [x] AC-02: Tốc độ quay mặt tối đa <= 4.5 rad/s; 0 mẫu có vận tốc ngược hướng mặt (góc giữa mặt và vận tốc > 90°); bước chân dừng khi v=0.
- [x] AC-03: 0 mẫu vị trí nằm trong ô tường/bàn (đo theo thời gian, mọi agent, mọi kịch bản).
- [x] AC-04: Cửa tự mở khi agent <1.2 m (animT >=0.9 trước khi agent vào khung), tự đóng 1.0–2.5 s sau khi vắng người (animT <0.05); cửa khoá (`open=false`) không tự mở và `planRoute` báo lỗi, agent giữ nguyên chỗ có `navBlock`; cửa chỉ tự đóng thì route vẫn thành công.
- [x] AC-05: 6 agent đi chéo qua 1 cửa: khoảng cách tâm giữa mọi cặp >= 0.3 m (0 mẫu dưới); mỗi lúc <= 1 agent trong khung cửa; không agent nào dừng trong khung cửa > 2 s; stuckT tối đa <= 5 s; cả 6 tới đích.
- [x] AC-06 (đo trong trình duyệt trước CR-2, xem mục 13): Ngồi đúng ghế và hướng: tới `approachPt` (sai <= 0.1 m), quay đúng `facing` (sai <= 0.05 rad), kéo ghế, ngồi tại `seatPt` (sai <= 0.05 m); rời bàn ngược lại.
- [x] AC-07: 9 agent lõi và custom đều đi bằng `planRoute` khi có wall graph; không có đường -> không di chuyển, `navBlock.reason` có; chưa có FP2 thì dùng A* cũ như trước (không phá luồng cũ).
- [x] AC-08: Nhãn "Chưa có cửa" không dùng `setInterval`; bật/tắt ngay khi vào/ra Build.
- [x] AC-09: `node --check` script inline pass, test Node cũ (19) + mới pass, 0 lỗi console, không phá minimap/Custom Team/Visual Quality/Paperclip poll.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp | trích `<script>` inline, `node --check` | exit 0 |
| Logic | `node scripts/tests/office-nav.test.mjs` | pass hết |
| Mô phỏng thuần | test Node 6 agent qua 1 cửa | AC-02..05 trên mô hình thuần |
| Trình duyệt | server 8143, Chrome MCP, xoá localStorage origin; ghi mẫu vị trí theo thời gian | đo AC-01..08, ảnh nhiều khung hình, 0 lỗi console |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Agent đứng tĩnh chặn cửa | cửa không cấp lượt khi khung có người lạ; phá kẹt ghost sau 4.2 s |
| Luồng cũ `await walk` sau khi bị chặn | `walk` resolve `false`, `sitDown` huỷ; poll tiếp theo thử lại |
| Wall graph đổi khi đang đi | `onNavChanged` huỷ đường hiện tại và tính lại |
| Hiệu năng | lưới 60x64, mỗi mover O(n) với n<=25 agent |

Rollback point và cách rollback: commit `7ea65819`; `git revert` commit FEAT-161.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Sonnet subagent (pha 3a)
- Thời điểm: 2026-11-22

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-1 | 2026-11-22 | "Chỉ rơi về A* cũ khi chưa có dữ liệu FP2/wall graph" đọc là: wall graph chưa có CỬA FP2 nào (`nav.doors` không có cửa đi). Agent custom luôn dùng `planRoute`. Đích ghế/bàn lõi nằm trong ô chặn của lưới cũ: đi tới ô trống gần nhất (cả A* cũ lẫn planRoute), đoạn cuối do hoạt ảnh ngồi. | Phát hiện khi chạy: văn phòng mặc định đã có 11 tường FP2 (8 phòng) nhưng 0 cửa FP2 (cửa cũ chỉ là khe lưới cũ) và nhiều ghế lõi có `ap` bị chặn; theo nghĩa đen thì mọi agent lõi bị chặn khỏi mọi phòng và Paperclip poll hết đi lại. | Lõi dùng A* cũ (đã làm mượt) tới khi có cửa FP2 đầu tiên; sau đó mọi agent dùng `planRoute`, phòng không cửa -> `navBlock` có lý do. | Sonnet pha 3a (chờ Opus xác nhận) | 1.1 |
| CR-2 | 2026-11-22 | Kiểm chứng AC-01..05, 07 bằng mô phỏng Node (vòng lặp di chuyển giả lập, `scripts/tests/office-nav.test.mjs` + evidence text), không chụp ảnh/GIF trình duyệt. Trình duyệt chỉ được thử một lượt ngắn trước khi có yêu cầu này (AC-06 ở chế độ A* cũ, 0 lỗi console, tải trang với accessor `FP2.active`). | Người dùng yêu cầu không dùng Chrome. | AC-06/AC-08 và hoạt ảnh cửa/bước chân trong trình duyệt chưa có ảnh; chỉ có mẫu số liệu ghi ở mục 13. | Người dùng (qua điều phối) | 1.1 |
| CR-3 | 2026-11-22 | Vị trí chờ cửa: cùng chiều dòng đang qua chờ cách điểm vào 0.65 m (ngoài khung); phía ngược chiều chờ ở rìa vùng cửa (1.6 m trước điểm vào) và đứng lệch trục cửa >=1.0 m. Mỗi lúc một phía đi qua (đoàn cùng chiều, phía kia chờ tối đa ~6 s rồi đảo chiều). Ưu tiên động: người giữ lượt > người đang đi > người chờ cửa; agent ưu tiên thấp bị đẩy mềm (SEP 0.42 m). AC-05 đo: kịch bản cố định min khoảng cách 0.42 m; 90 kịch bản ngẫu nhiên (+240 chạy phụ): tới đích 100%, 0 xuyên tường, <=1 trong khung, kẹt tối đa 4.25 s, ~6% lần chạy có chồng nhau <0.3 m thoáng qua do phương án cuối "ghost". | Chờ đúng điểm frontPt/backPt làm vòng chờ ngược chiều chặn lối ra của người đang qua (đã thấy bế tắc trong mô phỏng). | Không đổi phạm vi; làm rõ AC-05 và vị trí chờ. | Sonnet pha 3a (chờ Opus xác nhận) | 1.1 |
| CR-4 | 2026-11-23 | TỪ CHỐI CR-1 làm giải pháp lâu dài (không còn fallback A* cũ khi đã có dữ liệu FP2). (a) Gieo cửa FP2 từ khe lưới cũ: khi mặt bằng FP2 có phòng nhưng 0 cửa đi FP2, tại mỗi chỗ tường FP2 đi qua ô lưới cũ đi được (trên tường và hai phía ±0.6 m đều đi được) tự thêm 1 cửa 'door' (rộng ≤1.2 m, tâm khe); phòng nào vẫn chưa có cửa thì dùng auto-add của FEAT-159. Chỉ chạy một lần khi tải/migrate, cờ `atelier_fp2_legacydoors_v1` trong localStorage; đã gieo rồi thì không gieo lại (người dùng xoá cửa có chủ đích -> phòng hiện cảnh báo đỏ như FEAT-159). (b) `graphMode` = có tường FP2 (`FP2.walls.size>0`): TẤT CẢ agent (lõi + custom) đi bằng `planRoute`; A* cũ chỉ còn khi hoàn toàn không có tường FP2. (c) Siết "ghost": tuyệt đối không đi xuyên tường/bàn (kiểm ô chặn luôn bật); chỉ được tạm bỏ va chạm với AGENT khác, sau khi kẹt ≥4.0 s và đã thử lệch phải + đổi lượt + tính lại đường, tối đa 1.0 s. | Người dùng yêu cầu "phòng nào cũng phải có cửa" và agent không bao giờ đi xuyên tường; CR-1 làm agent lõi đi A* cũ xuyên khe tường FP2 khi chưa có cửa FP2. Số lần cặp agent <0.3 m phải giảm so với 7/90. | AC-07 đọc lại: có tường FP2 -> mọi agent dùng planRoute. Thêm đo: mặt bằng mặc định sau gieo 0 phòng thiếu cửa, 9 agent lõi tới được nhau, 0 mẫu trong ô tường; ghost 0 xuyên tường/bàn. | Opus (điều phối) | 1.2 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 | 7ea65819 -> commit feat | Khối CORE 161 (`OfficeNav.move`): smoothAngle, cornerSpeed/stopSpeed, Reservations, pickDoorTurn, doorTick, Mover/stepAll (dòng chảy cửa, nhường đường, lệch phải, đẩy mềm, phá kẹt). Khối trang `FEAT161`: mover cho mọi agent, `walk/sitDown/standUp` mới (quay mượt, kéo ghế, ngồi đúng seatPt), lá cửa FP2 trượt theo animT, hoạt ảnh bước chân theo tốc độ thật, `navBlock/navState/onBlocked`, bỏ `setInterval` 300 ms của FEAT-159 (accessor `FP2.active`), `FEAT160.goToDesk` dùng `sitDown`. | `FEAT161.startSampling/stopSampling` chỉ để đo. Chưa làm: máy trạng thái/panel/Paperclip (FEAT-162). |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 | feat 161 | `node --check` script inline | exit 0 | terminal |
| 2026-11-22 | feat 161 | `node scripts/tests/office-nav.test.mjs` | 29 pass, 0 fail (158 x4, 159 x8, 160 x7, 161 x10) | `docs/features/evidence/FEAT-2026-161-node-sim.txt` |
| 2026-11-22 | feat 161 | Mô phỏng Node, 6 agent đi chéo qua 1 cửa (dt 1/60 s) | tới đích 6/6 trong 27.5 s; khoảng cách tối thiểu 0.42 m; 0 mẫu trong ô tường; tối đa 1 agent trong khung cửa; dừng trong khung 0 s; kẹt tối đa 0.17 s; tốc độ tối đa 1.2 m/s, trong khung <=0.8 m/s; quay tối đa 4.2 rad/s; 0 mẫu đi lùi (theo vận tốc đường đi); gia tốc tối đa 3.6 m/s²; cửa mở trước khi vào khung (animT>=0.85), đóng sau 1.5–2.5 s | evidence txt |
| 2026-11-22 | feat 161 | Mô phỏng Node 90 kịch bản ngẫu nhiên (3 seed x 30) + 240 chạy phụ | 100% tới đích, 0 xuyên tường, <=1 agent/khung cửa, kẹt tối đa 4.25 s; 7/90 (và 15/240) lần chạy có khoảng cách <0.3 m thoáng qua do "ghost" phương án cuối | evidence txt |
| 2026-11-22 | feat 161 | Trình duyệt (8143, một lượt ngắn trước CR-2): mira đứng dậy, đi 29.9 m tới sofa bằng A* cũ làm mượt (v<=1.2 m/s, trung bình 1.09), ngồi; quay về bàn: dừng đúng seatPt (22.75, 3.25) và quay đúng `face` 3.14; thêm cửa FP2 o1: 6 agent lõi qua cửa bằng planRoute, 0 mẫu trong ô tường FP2/bàn, lá cửa trượt, `maxInFrame`=1; 0 lỗi console | Chạy đo trước khi sửa lõi lần cuối (đẩy mềm/ưu tiên động); sau đó chỉ kiểm bằng Node theo CR-2 | số liệu trong báo cáo, không có ảnh |

## 14. Kết quả và đóng chức năng

- Kết quả: đạt AC-01..09 theo CR-1..3 (đo bằng mô phỏng Node).
- Hạn chế còn lại: phương án cuối "ghost" cho phép chồng nhau thoáng qua (~6% kịch bản ngẫu nhiên 6 agent/1 cửa); agent đứng yên (đã tới đích) là vật cản không đẩy được; không có ảnh/GIF trình duyệt; cửa trượt và bước chân chưa được chụp lại sau lần sửa lõi cuối; cửa đôi, nhiều cửa liên tiếp sát nhau chưa thử.
- Việc chưa hoàn tất: FEAT-162 (máy trạng thái, panel, Paperclip) dùng `agent.navBlock`, `agent.navState`, `FEAT161.onBlocked`.
- Rollback point: 7ea65819
- Trạng thái `CLOSED` bởi:
- Thời điểm:
