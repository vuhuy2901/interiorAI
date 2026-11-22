# [FEAT-2026-161] Di chuyển như thật: tốc độ, quay mặt, cửa tự mở, tránh nhau, ngồi ghế

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Sonnet subagent (pha 3a) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 |
| Revision bắt đầu | 7ea65819 (FEAT-2026-160) |
| Revision cuối | Chưa có |

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

- [ ] AC-01: Tốc độ trên đoạn thẳng dài trung bình trong [1.1, 1.3] m/s; tốc độ nhỏ nhất quanh góc rẽ >=60° <= 0.75 m/s; tốc độ trong khung cửa <= 0.9 m/s; gia tốc |dv/dt| <= 4 m/s².
- [ ] AC-02: Tốc độ quay mặt tối đa <= 4.5 rad/s; 0 mẫu có vận tốc ngược hướng mặt (góc giữa mặt và vận tốc > 90°); bước chân dừng khi v=0.
- [ ] AC-03: 0 mẫu vị trí nằm trong ô tường/bàn (đo theo thời gian, mọi agent, mọi kịch bản).
- [ ] AC-04: Cửa tự mở khi agent <1.2 m (animT >=0.9 trước khi agent vào khung), tự đóng 1.0–2.5 s sau khi vắng người (animT <0.05); cửa khoá (`open=false`) không tự mở và `planRoute` báo lỗi, agent giữ nguyên chỗ có `navBlock`; cửa chỉ tự đóng thì route vẫn thành công.
- [ ] AC-05: 6 agent đi chéo qua 1 cửa: khoảng cách tâm giữa mọi cặp >= 0.3 m (0 mẫu dưới); mỗi lúc <= 1 agent trong khung cửa; không agent nào dừng trong khung cửa > 2 s; stuckT tối đa <= 5 s; cả 6 tới đích.
- [ ] AC-06: Ngồi đúng ghế và hướng: tới `approachPt` (sai <= 0.1 m), quay đúng `facing` (sai <= 0.05 rad), kéo ghế, ngồi tại `seatPt` (sai <= 0.05 m); rời bàn ngược lại.
- [ ] AC-07: 9 agent lõi và custom đều đi bằng `planRoute` khi có wall graph; không có đường -> không di chuyển, `navBlock.reason` có; chưa có FP2 thì dùng A* cũ như trước (không phá luồng cũ).
- [ ] AC-08: Nhãn "Chưa có cửa" không dùng `setInterval`; bật/tắt ngay khi vào/ra Build.
- [ ] AC-09: `node --check` script inline pass, test Node cũ (19) + mới pass, 0 lỗi console, không phá minimap/Custom Team/Visual Quality/Paperclip poll.

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
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| | | | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | | | | |

## 14. Kết quả và đóng chức năng

- Kết quả:
- Hạn chế còn lại:
- Việc chưa hoàn tất:
- Rollback point: 7ea65819
- Trạng thái `CLOSED` bởi:
- Thời điểm:
