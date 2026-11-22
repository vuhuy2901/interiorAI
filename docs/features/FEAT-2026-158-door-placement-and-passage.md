# [FEAT-2026-158] Cửa chính xác và lưới đi qua cửa

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Sonnet subagent (pha 1) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 |
| Revision bắt đầu | 702c68bb |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Trong `ai-office-standalone/index.html`, cửa (`FP2.wallOpenings`) chỉ có `wallId, offset, type, width, height, elevation`. Thêm cửa bằng một cú click, không kiểm tra vượt mép/chồng nhau. `updateFP2WallBlocked()` chặn mỗi điểm tường bằng khối 4x4 ô (khoảng 2 m) rồi "khoét" lại bằng khối tương tự, kể cả cửa sổ, nên cửa sổ cũng đi xuyên được và bề rộng cửa không chính xác. Kế hoạch gốc: `docs/plans/2026-11-22-office-navigation.md` (mục FEAT-2026-158).

## 2. Mục tiêu

- Đặt cửa có ghost hợp lệ/đỏ kèm lý do, hít về vị trí hợp lệ.
- Mỗi cửa có sẵn dữ liệu hình học (center, normal, width, frontPt, backPt, cells, open).
- Lưới A* chỉ cho đi qua tường tại ô khung cửa đang mở; cửa đóng và cửa sổ chặn.

## 3. Phạm vi

### In scope

- Hàm thuần (không DOM/THREE) trong khối `FEAT-2026-158 CORE`: `validateOpening`, `doorInfo`, `buildDoorGrid`, `astarCells/astarPoints`, `worldToCell`.
- Từ chối đặt cửa khi: vượt mép đoạn tường (chừa >= 0.1 m mỗi đầu; lệch quá 0.3 m so với vị trí hợp lệ gần nhất thì từ chối, <= 0.3 m thì hít), chồng cửa/cửa sổ khác (khe >= 0.05 m), tường ngắn hơn width + 0.2 m.
- Mỗi cửa tính và gắn vào object opening: `center{x,z}`, `normal{x,z}`, `width`, `frontPt`, `backPt` (cách tâm 0.6 m theo +/- normal), `cells` (ô lưới thuộc khung cửa), `open` (mặc định true). `roomA/roomB` để null (điền ở FEAT-159).
- Viết lại `updateFP2WallBlocked()`: ô bị tường chặn tính theo khoảng cách tâm ô tới đoạn tường (<= thickness/2 + 0.3 m); ô thuộc khung cửa (door, sliding-glass) ĐANG MỞ được khoét (chỉ phần của chính tường đó); cửa đóng và cửa sổ không khoét.
- Ghost khi trỏ chuột trên tường ở chế độ door/window/sliding-glass (xanh = hợp lệ, đỏ = không, thông báo lý do); nút Mở/Đóng cửa trong panel tường; debug overlay (phím `N`, mặc định tắt).
- Mọi thay đổi tường/cửa (qua `WG.buildMeshes`) tính lại lưới và dữ liệu cửa ngay.

### Out of scope

- Đồ thị phòng–cửa, `roomA/roomB`, định tuyến nhiều phòng, luật "mọi phòng có cửa" (FEAT-159).
- Bàn, di chuyển agent, cửa tự mở/đóng theo agent (FEAT-160..162).
- Thay đổi hàm `astar()` của game, `isB`, Custom Team, minimap, Visual Quality.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `WG`, `FP2.walls/wallNodes/wallOpenings`, `fp2WallBlocked`, `CS/W/H`.
- Dữ liệu dùng chung: localStorage `atelier_fp2_v1` (openings lưu thêm trường mới, tương thích ngược: opening cũ không có `open` coi là mở).
- Cổng không được ảnh hưởng: 8123, 3100, 3180, 8000. Thử nghiệm dùng 8141.

## 5. Thiết kế và kế hoạch triển khai

1. Khối IIFE `OfficeNav` (pure) đặt sau `astar()`; hàm nhận `state={nodes,walls,openings}` và `cfg={CS,W,H}`.
2. `updateFP2WallBlocked()` gọi `FEAT158.refresh()`: dựng lưới + dữ liệu cửa, copy vào `fp2WallBlocked`.
3. Hook ghost vào `FP2._onPointerMove`, thay đoạn đặt cửa trong `_onPointerDown` bằng `validateOpening`.
4. Thay đổi hành vi cũ (ghi rõ): (a) cửa sổ không còn đi xuyên được; (b) dải chặn quanh tường hẹp hơn (không còn khối 4x4 ô). Cả hai chỉ ảnh hưởng `fp2WallBlocked` (chỉ dùng khi `FP2.active`).

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Thêm khối `FEAT-2026-158 CORE`, viết lại `updateFP2WallBlocked`, `WG.addOpening` (+`open:true`), `updateWallPanel` (nút Mở/Đóng), hook placement/ghost/debug | Triển khai |
| `scripts/tests/office-nav.test.mjs` | Mới | Test Node cho AC |
| `docs/features/FEAT-2026-158-door-placement-and-passage.md` | Mới | Contract |

## 7. Acceptance criteria

- [ ] AC-01: Đặt cửa ở 3 vị trí khác nhau (tường ngang, dọc, không căn lưới): frontPt/backPt nằm hai bên tường, cách tâm cửa 0.6 m, sai số khoảng cách tới đường tâm tường < 0.05 m.
- [ ] AC-02: A* từ ô chứa frontPt tới ô chứa backPt thành công khi cửa mở, thất bại khi cửa đóng.
- [ ] AC-03: Cửa vượt mép, chồng cửa khác, tường quá ngắn bị `validateOpening` từ chối kèm `reason`; vị trí lệch <= 0.3 m được hít về hợp lệ.
- [ ] AC-04: Cửa sổ chặn lưới (A* thất bại qua cửa sổ).
- [ ] AC-05: Trình duyệt: ghost xanh/đỏ hiển thị, debug overlay bật/tắt bằng `N`, 0 lỗi console, Build/FP2 vẫn hoạt động.
- [ ] AC-06: `node --check` toàn bộ script inline pass.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp | trích `<script>` inline rồi `node --check` | exit 0 |
| Logic thuần | `node scripts/tests/office-nav.test.mjs` | tất cả pass |
| Trình duyệt | `python -m http.server 8141` trong `ai-office-standalone`, Chrome MCP | ghost, overlay, 0 lỗi console, ảnh chụp |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Dải chặn hẹp hơn làm agent sát tường | Ngưỡng thickness/2 + 0.3 m; ghi nhận, FEAT-161 xử lý bán kính |
| Mã cửa cũ trong localStorage thiếu trường | Tính lại khi refresh, mặc định `open=true` |
| Hook pointer ảnh hưởng vẽ tường | Hook chỉ chạy khi ở chế độ door/window/sliding-glass và luôn gọi hàm gốc |

Rollback point: commit `702c68bb`; rollback bằng `git revert` commit của FEAT-158.

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
- Rollback point: 702c68bb
- Trạng thái `CLOSED` bởi:
- Thời điểm:
