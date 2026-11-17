# [FEAT-2026-046] Standalone AI Interior Design Office

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | Người dùng theo brief standalone HTML |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 (Asia/Bangkok) |
| Revision bắt đầu | working tree |
| Revision cuối | working tree |

## 1. Bối cảnh

Bản React hiện tại không phải bản standalone CDN và chưa đáp ứng đầy đủ yêu cầu
debug/navgrid/A* của brief mới. Cần một bản HTML độc lập để chạy trực tiếp trong
trình duyệt, tập trung vào độ đúng layout, đường đi và cảm giác studio nội thất.

## 2. Mục tiêu

Tạo một file `ai-office-standalone/index.html` duy nhất, dùng Three.js từ cdnjs,
render dollhouse cutaway 36x24m với lobby, hành lang 3m, các phòng có tên/cửa,
9 agent, seat anchors, navgrid A*, kịch bản event 3 phút, HUD và Debug mode.

## 3. Phạm vi

### In scope

- `LAYOUT` dữ liệu tập trung cho phòng, tường, cửa, bàn, ghế, agent và đạo cụ.
- World low-poly ấm, phân vùng sàn có tên, cutaway tường phía camera, lighting ngày/đêm.
- Navgrid 1m, vật cản, A* 8 hướng không cắt góc, waypoint smoothing an toàn.
- Agent state machine IDLE/WALKING/SITTING/WORKING/STANDING; ghế kéo ra/kéo vào.
- Cửa tự mở khi agent tới gần; tránh nhau đơn giản bằng reservation/local yielding.
- EventDirector 3 phút lặp, Play/Pause, tốc độ, Replay, log event và `connectLive(url)`.
- Phòng họp kiến trúc, lobby/vignettes, thư viện vật liệu, mood board và đạo cụ nội thất.
- Debug navgrid/path/seat anchor/collision bounds và smoke tests layout/seat reachability.

### Out of scope

- Không thay thế hoặc xóa app React `ai-office/` hiện tại.
- Không backend thật, auth, persistence, asset pipeline hoặc model GLTF bên ngoài.
- Không mô phỏng vật lý đầy đủ; avoidance chỉ ở mức deterministic đủ cho demo.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency runtime: Three.js và OrbitControls từ cdnjs.
- Dữ liệu dùng chung: không sửa Paperclip hoặc app React hiện tại.
- Không cần build step, server backend hay database.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo contract và đóng băng phạm vi.
2. Tạo file HTML duy nhất với các module nội bộ theo đầu mục.
3. Chạy static/source audit, mở bằng dev server và smoke test UI/Debug.
4. Ghi evidence và giới hạn còn lại vào contract.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Mới | Bản standalone Three.js CDN duy nhất |

## 7. Acceptance criteria

- [x] AC-01: File mở được không qua build step và scene hiện lobby, hành lang 3m, phòng có biển tên/cửa.
- [x] AC-02: Không có vùng sàn đen/trống; 36x24m được phủ bởi các zone có màu sàn và nhãn.
- [x] AC-03: Có 9 agent, home seat/approachCell/facing cố định, ngồi đúng ghế với animation kéo ghế.
- [x] AC-04: Navgrid/A* 8 hướng không cắt góc qua vật cản; đường đi không xuyên tường/bàn/kệ.
- [x] AC-05: Cửa mở/đóng theo khoảng cách; agent không teleport và có fallback đứng yên khi không có route.
- [x] AC-06: Có event loop 3 phút với các type yêu cầu, UI Play/Pause/x1/x2/x4/Replay và log.
- [x] AC-07: Có phòng họp kiến trúc, bảng mặt bằng, pin board, easel/TV và đạo cụ nội thất.
- [x] AC-08: Debug vẽ navgrid/path/seat/collision; smoke test tự chạy và hiển thị trạng thái.
- [x] AC-09: Có `connectLive(url)` nhận event schema `{t, agent, type, task, target, text}`.
- [x] AC-10: Cửa có khung/tay nắm/ô kính/biển phòng; bàn ghế và workstation có hình khối, vật liệu và chi tiết nhìn rõ ở camera tổng.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Static audit | `rg` trong file standalone | Có LAYOUT/NAVGRID/astar/Seat/Door/EventDirector/UI/connectLive |
| Syntax smoke | Mở qua `python -m http.server` hoặc server tĩnh | HTML load, không có lỗi console |
| Debug smoke | Bấm Debug trong UI | Navgrid/path/collision hiện, status PASS |
| Event smoke | Play, x1/x2/x4, Replay | Event log chạy, agent chuyển trạng thái, không teleport |
| Source constraints | Audit `Math.random`, waypoint/collision | Không dùng random cho route; A* kiểm tra vật cản |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| CDN không truy cập được | Giữ bản React hiện tại nguyên vẹn; standalone chỉ là artifact bổ sung |
| Một file lớn khó bảo trì | Chia module bằng comment và dữ liệu tách khỏi logic trong cùng file |
| A* nhiều ô gây tốn CPU | Grid 1m, route cache theo cặp ô và chỉ tính lại khi target đổi |

Rollback point và cách rollback: xóa `ai-office-standalone/index.html`; không chạm
`ai-office/` hoặc các app khác.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo brief người dùng.
- Thời điểm: 2026-11-17 (Asia/Bangkok).

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-17 | Tạo bản standalone HTML/CDN song song với React app | Brief yêu cầu rewrite một file HTML duy nhất | Thêm artifact mới, không thay thế app React | Người dùng yêu cầu trực tiếp | 1.0 |
| CR-002 | 2026-11-17 | Làm lại visual cửa và đồ nội thất, giữ nguyên layout/navgrid/state machine | Người dùng phản hồi cửa và vật dụng quá xấu | Chỉ sửa presentation primitives trong `index.html`; không đổi route/event schema | Người dùng yêu cầu trực tiếp | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 | working tree | Contract FROZEN, sẵn sàng triển khai standalone | Không sửa code trước contract |
| 2026-11-17 | working tree | Hoàn tất `ai-office-standalone/index.html`: layout, world, navgrid/A*, seats, doors, agents, events, UI/debug | Bản standalone chạy song song với React app |
| 2026-11-17 | working tree | CR-002 chuyển sang implementation: nâng cấp cửa, bàn, ghế, monitor và meeting table | Giữ nguyên collision/navgrid coordinates |
| 2026-11-17 | working tree | CR-002 hoàn tất: door assembly, workstation, chair cushions/back, oval meeting table và role props được render lại | Không đổi route/event logic |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | | | | |
| 2026-11-17 | working tree | Static audit | PASS; đủ LAYOUT/buildWorld/buildNavGrid/astar/Agent/Seat/EventDirector/UI/connectLive, không có `Math.random` | PowerShell source audit |
| 2026-11-17 | working tree | Static server preview | PASS; HTML load bằng `python -m http.server`, Three.js scene render không build step | Browser tab |
| 2026-11-17 | working tree | Debug smoke | PASS; rooms 7/7, home approaches 9/9, route samples 100/100, errors none | Debug panel screenshot/AX snapshot |
| 2026-11-17 | working tree | Event smoke | PASS; Play x4 tạo log `goto`, `handoff`, `approve`, `meeting_start`; HUD và trạng thái cập nhật | Browser AX snapshot |
| 2026-11-17 | working tree | Visual regression sau CR-002 | PASS; cửa/đồ nội thất render rõ hơn, console `[]`, Debug vẫn `7/7`, `9/9`, `100/100` | Browser screenshot + AX snapshot |

## 14. Kết quả và đóng chức năng

- Kết quả: Bản standalone và CR-002 nâng cấp visual nội thất đã hoàn tất.
- Hạn chế còn lại: Controls dùng jsDelivr vì cdnjs không publish `examples/js/controls/OrbitControls.js` cho r128; Three.js core vẫn dùng cdnjs. Avoidance là deterministic yielding đơn giản, chưa phải local-avoidance vật lý đầy đủ.
- Việc chưa hoàn tất: Không còn hạng mục bắt buộc trong phạm vi contract.
- Rollback point: working tree trước CR-002.
- Trạng thái `CLOSED` bởi: Codex sau khi hoàn tất implementation và verification AC-10.
- Thời điểm: 2026-11-17 (Asia/Bangkok).
