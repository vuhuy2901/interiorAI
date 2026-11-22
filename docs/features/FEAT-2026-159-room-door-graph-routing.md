# [FEAT-2026-159] Đồ thị phòng–cửa, định tuyến nhiều phòng, luật mọi phòng có cửa

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Sonnet subagent (pha 1) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 |
| Revision bắt đầu | a0c8622c (FEAT-2026-158) |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Sau FEAT-158 mỗi cửa có `frontPt/backPt` và lưới đi qua cửa mở. Chưa có khái niệm phòng–cửa để định tuyến nhiều phòng, và phòng kín không cửa không bị cảnh báo. `detectRooms()` sẵn có không tách tường tại điểm chữ T (tường cắt nhau không chia nút), nên mặt bằng mặc định (`fp2SeedDefaultWalls`) không cho ra phòng đúng.

## 2. Mục tiêu

- Đồ thị phòng–cửa (nút = phòng + "phòng ngoài", cạnh = cửa) và `planRoute(from,to)` đi qua chuỗi cửa ngắn nhất, trả danh sách waypoint và cửa.
- Mọi phòng phải có cửa: cảnh báo đỏ trên sàn + danh sách trong panel Build + nút "Thêm cửa tự động".

## 3. Phạm vi

### In scope

- Khối `FEAT-2026-159 CORE` (hàm thuần, mở rộng `OfficeNav`): `planarize` (tách tường tại điểm chữ T/giao nhau, dùng cùng thuật toán duyệt mặt phẳng như `detectRooms`), `detectRooms(state)` (loại mặt ngoài), `pointInRoom` (ưu tiên phòng nhỏ nhất; không thuộc phòng nào = `OUT`), `buildNav` (gán `roomA/roomB`, đồ thị, `noDoor`, `reachable`), Dijkstra theo trạng thái cửa–hướng, `planRoute`, `lineOfSight`, `smoothPath`, `suggestDoor`, `isRoomReachable`.
- `planRoute` trả `{ok:true,waypoints,doors,rooms,length}` hoặc `{ok:false,reason}` với lý do rõ: "<Phòng> chưa có cửa", "Cửa <id> đang đóng", "Không có đường nối ...".
- Gán `roomA/roomB` vào `FP2.wallOpenings` sau mỗi lần tính lại (hook `FEAT158.afterRefresh`).
- UI: nhãn đỏ "Chưa có cửa" trên sàn phòng, danh sách + nút "Thêm cửa tự động" (cửa 0.9 m, đúng tâm đoạn tường dài nhất hợp lệ của phòng, qua `validateOpening`), nút cho tất cả phòng.
- `FEAT159.canAssign(roomId)` để FEAT-160 dùng: phòng chưa tới được thì từ chối.

### Out of scope

- Bàn, gán agent, di chuyển agent theo waypoint, cửa tự mở/đóng, tránh nhau (FEAT-160..162).
- Sửa `detectRooms()` và nhãn "Phòng N" cũ của `rebuildRooms()` (giữ nguyên; tên phòng mới mượn tên từ `FP2.detectedRooms` nếu tâm trùng).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: FEAT-158 (`OfficeNav`, `FEAT158`), `WG`, `FP2.wallOpenings`.
- Dữ liệu dùng chung: localStorage `atelier_fp2_v1` (opening lưu thêm `roomA/roomB`, tính lại khi tải).
- Cổng không được ảnh hưởng: 8123, 3100, 3180, 8000. Thử nghiệm dùng 8141.

## 5. Thiết kế và kế hoạch triển khai

1. Planarize tường -> half-edge -> mặt có diện tích dương = phòng. Cạnh biên của phòng giữ `wallId, s0, s1` để đặt cửa.
2. Dijkstra trên trạng thái (cửa, hướng đi) với chi phí hình học (khoảng cách tới điểm thoát + qua cửa); A* từng chặng trên lưới FEAT-158 rồi làm mượt bằng line-of-sight có đệm ngang 0.15 m.
3. `FEAT158.afterRefresh` gọi `FEAT159.update()` dựng lại `nav`, vẽ nhãn đỏ khi tập phòng thiếu cửa thay đổi, cập nhật panel `#navWarn`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Thêm khối `FEAT-2026-159 CORE` và `FEAT159` page integration | Triển khai |
| `scripts/tests/office-nav.test.mjs` | Thêm test 159 | AC |
| `docs/features/FEAT-2026-159-room-door-graph-routing.md` | Mới | Contract |

## 7. Acceptance criteria

- [ ] AC-01: Mặt bằng 3 phòng nối tiếp (tường chữ T chưa tách): phát hiện đúng 3 phòng, `planRoute` phòng 1 -> 3 qua đúng 2 cửa, đoạn ngoài khung cửa không cắt ô chặn.
- [ ] AC-02: Cửa đóng -> `planRoute` trả `ok:false` và lý do nêu cửa đang đóng.
- [ ] AC-03: Xoá cửa duy nhất của một phòng -> phòng nằm trong `noDoor`, nhãn đỏ + panel hiển thị, route lỗi "chưa có cửa".
- [ ] AC-04: "Thêm cửa tự động" làm phòng tới được lại và route thành công; auto-add lặp lại làm mọi phòng có cửa.
- [ ] AC-05: `pointInRoom` ưu tiên phòng nhỏ nhất khi lồng nhau; ngoài mọi vòng tường = `OUT`.
- [ ] AC-06: `smoothPath` bỏ điểm thừa, không cắt ô chặn.
- [ ] AC-07: Trình duyệt: cảnh báo đỏ + nút hiển thị, bấm nút khắc phục được, 0 lỗi console; `node --check` pass; test Node pass.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp | trích `<script>` inline rồi `node --check` | exit 0 |
| Logic thuần | `node scripts/tests/office-nav.test.mjs` | tất cả pass |
| Trình duyệt | server `8141`, Chrome MCP, tạo phòng kín không cửa | nhãn đỏ, nút, ảnh, 0 lỗi console |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Mặt bằng tường chạm nhưng hở nhỏ không tạo phòng | Không báo phòng; ghi nhận hạn chế |
| Hiệu năng khi kéo tường | Chỉ dựng lại nhãn khi tập phòng thiếu cửa đổi; số tường nhỏ |
| Phòng hình chữ L/đa giác phức tạp: tâm nhãn ngoài đa giác | Dùng điểm trong đa giác gần tâm nhất |

Rollback point: commit `a0c8622c`; rollback bằng `git revert` commit của FEAT-159.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Sonnet subagent (pha 1)
- Thời điểm: 2026-11-22

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
- Rollback point: a0c8622c
- Trạng thái `CLOSED` bởi:
- Thời điểm:
