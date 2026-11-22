# Kế hoạch: Văn phòng điều hướng thật — bàn, cửa, phòng, agent đi như người

Ngày: 2026-11-22 · Nhánh: `feat/office-navigation` (từ `feat/wall-graph-p1-codex` @340f19bb) · Worktree: `C:\Users\TUAN\Downloads\qldapm_fina_wt_wall139`
File chính: `ai-office-standalone/index.html` (Three.js r128, không build). Code mới đặt trong các khối IIFE có tiêu đề `FEAT-2026-1xx`, không rải rác.

## Nguyên tắc bắt buộc (áp dụng mọi FEAT)

1. **Mọi phòng phải có ít nhất 1 cửa.** Phòng kín không cửa = lỗi thiết kế, phải hiện cảnh báo và có nút sửa.
2. **Agent không bao giờ đi xuyên tường.** Chỉ qua tường tại ô cửa đang mở.
3. **Agent không đứng/đi chắn trong khung cửa** quá thời gian qua cửa; không dừng chờ giữa ngưỡng.
4. Không phá tính năng có sẵn: Build/FP2, wall graph, A*, Custom Team, minimap, Visual Quality. 0 lỗi console.
5. Mỗi FEAT có contract `docs/features/FEAT-2026-1xx-*.md` FROZEN trước khi code (AGENTS.md), evidence + revision khi xong, commit riêng, kết thúc commit bằng `Co-Authored-By`.
6. Kiểm tra cú pháp toàn bộ `<script>` inline bằng `node --check` trước mỗi commit. Test logic thuần (A*, đồ thị phòng–cửa, kiểm tra cửa) bằng script Node trích từ file hoặc hàm thuần tách riêng, chạy không cần trình duyệt.
7. Thử trên trình duyệt bằng server tĩnh riêng (vd `python -m http.server 8141` trong `ai-office-standalone`), KHÔNG dùng/dừng cổng 8123, 3100, 3180, 8000. Tắt server thử khi xong.

## Thứ tự

| Pha | FEAT | Nội dung | Phụ thuộc |
|---|---|---|---|
| 1 | 158 | Cửa chính xác + lưới đi qua cửa | — |
| 1 | 159 | Đồ thị phòng–cửa, định tuyến nhiều phòng, luật "mọi phòng có cửa" | 158 |
| 2 | 160 | Bàn làm việc đặt tự do, gắn agent | 159 |
| 3 | 161 | Di chuyển như thật: quay hướng, tránh nhau, qua cửa, ngồi ghế | 159, 160 |
| 3 | 162 | Máy trạng thái agent đầy đủ + panel + đồng bộ Paperclip | 161 |

## FEAT-2026-158 — Cửa chính xác

- Thêm cửa: ghost theo con trỏ trên tường, hít về vị trí hợp lệ; từ chối (ghost đỏ + lý do) khi: cửa vượt mép đoạn tường (chừa ≥0.1 m mỗi đầu), chồng cửa khác, tường quá ngắn.
- Mỗi cửa tính sẵn và lưu: `center` (x,z), `normal` (pháp tuyến tường), `width`, `frontPt` và `backPt` (cách tâm 0.6 m theo ±normal), `cells` (các ô lưới thuộc khung cửa), `open` (bool, mặc định true), `roomA`/`roomB` (điền ở FEAT-159).
- `updateFP2WallBlocked()` phải **khoét** các ô thuộc cửa đang mở (bề rộng thật của cửa, đủ để agent bán kính ~0.25 m đi qua); cửa đóng thì chặn. Mọi thay đổi tường/cửa → tính lại lưới + cửa ngay.
- Debug overlay (phím tắt, mặc định tắt): tô ô bị chặn, ô cửa, điểm front/back.
- AC đo được: đặt cửa ở 3 vị trí → frontPt/backPt nằm hai bên tường, sai số < 0.05 m; A* từ frontPt tới backPt thành công khi mở, thất bại khi đóng.

## FEAT-2026-159 — Đồ thị phòng–cửa + định tuyến + mọi phòng có cửa

- Dùng `detectRooms()` sẵn có. Thêm "phòng ngoài" (hành lang/không gian mở ngoài mọi vòng tường) làm một nút.
- Hàm thuần `pointInRoom(x,z)` → id phòng (point-in-polygon, ưu tiên phòng nhỏ nhất khi lồng nhau).
- Mỗi cửa gán `roomA`/`roomB` bằng `pointInRoom(frontPt)`/`pointInRoom(backPt)`. Đồ thị: nút = phòng, cạnh = cửa (trọng số = khoảng cách).
- **Luật mọi phòng có cửa:** sau mỗi lần tính lại, phòng nào không có cạnh → nhãn đỏ "Chưa có cửa" trên sàn + danh sách trong panel Build + nút "Thêm cửa tự động" (đặt cửa 0.9 m vào đoạn tường dài nhất của phòng giáp phòng khác/không gian ngoài, đúng tâm đoạn hợp lệ). Không cho gán agent/bàn vào phòng chưa tới được.
- Định tuyến `planRoute(from, to)`: tìm chuỗi cửa ngắn nhất trên đồ thị (Dijkstra), rồi A* từng chặng: from → frontPt cửa 1 → backPt cửa 1 → … → to. Kết quả: danh sách waypoint + danh sách cửa phải qua. Không có đường → `{ok:false, reason}` (vd "Phòng Họp chưa có cửa", "Cửa X đang đóng").
- Làm mượt đường: bỏ điểm thừa bằng kiểm tra line-of-sight trên lưới (không cắt qua ô chặn).
- AC: mặt bằng 3 phòng nối tiếp → agent đi phòng 1→3 qua đúng 2 cửa; xoá cửa duy nhất của 1 phòng → cảnh báo đỏ + route trả lỗi rõ; nút "Thêm cửa tự động" làm phòng tới được lại. Test Node tự động cho các trường hợp này.

## FEAT-2026-160 — Bàn làm việc đặt tự do

- Chế độ Build có công cụ "Bàn làm việc": ghost theo con trỏ, hít lưới 0.25 m, R xoay 90°, đỏ khi chồng tường/bàn/khung cửa hoặc chặn mất lối đi tới cửa (kiểm bằng A* từ điểm tiếp cận tới cửa gần nhất của phòng).
- Bàn lưu: `id, x, z, rot, roomId, seatPt, approachPt, facing, agentId|null`. Bàn là vật cản trên lưới (trừ approachPt).
- Gán agent ↔ bàn (panel bàn: chọn agent; panel agent: chọn bàn). Xoá bàn → agent "chưa có bàn". Migrate `DESK_POOL` cũ thành bàn tự do khi lần đầu tải. Lưu localStorage có version.
- AC: đặt 10 bàn ở 3 phòng, tải lại trang giữ nguyên; bàn đặt chắn cửa bị từ chối; agent mới tạo đi đúng về bàn được gán.

## FEAT-2026-161 — Di chuyển như thật

- Agent theo waypoint của `planRoute`, tốc độ ~1.2 m/s, giảm tốc trước góc rẽ và cửa, xoay mặt mượt theo hướng đi (không quay giật, không đi lùi).
- Cửa trượt tự mở khi agent cách < 1.2 m, đóng sau khi không còn ai trong vùng cửa ~1.5 s (cửa bị khoá thì không mở → route lỗi).
- Tránh nhau: đặt trước ô (reservation) theo thời gian ngắn; gặp nhau ở cửa → một bên chờ tại frontPt (không chờ trong khung cửa); đối đầu trong hành lang → lệch sang phải.
- Ngồi: tới approachPt → quay về `facing` → kéo ghế (animation ngắn) → ngồi; rời bàn ngược lại.
- AC: 6 agent đi chéo qua 1 cửa không xuyên nhau, không kẹt > 5 s; video/ảnh nhiều khung hình làm bằng chứng.

## FEAT-2026-162 — Trạng thái đầy đủ

- Máy trạng thái: `no_desk, idle, walking(target), waiting_door, blocked(reason), sitting, working(task), meeting, leaving`. Chuyển trạng thái chỉ qua một hàm `setAgentState`, có log ngắn.
- Panel agent: phòng hiện tại, đích đến, ETA, bàn, task, lý do bị chặn. Nhãn nhỏ trên đầu agent.
- Đồng bộ Paperclip (nếu API 3100 có): agent có issue `in_progress` → đi về bàn → `working`; không có → `idle`. Lỗi API → giữ trạng thái cục bộ, báo nhẹ, không văng lỗi.
- AC: đổi trạng thái hiển thị đúng trong panel ≤ 1 s; tắt API vẫn chạy.

## Phân công

- Lập kế hoạch, duyệt contract, nghiệm thu cuối: Opus (phiên chính).
- Viết contract + code từng pha: Sonnet subagent (mỗi pha một agent, tuần tự).
- Kiểm thử lặp, chụp ảnh, đo AC: Haiku subagent.
- Không push, không merge; người dùng gộp.
