# [FEAT-2026-045] Văn phòng 3D mô phỏng nhân viên AI

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.5 |
| Owner | Codex |
| Người chấp thuận | Người dùng theo yêu cầu trong `Pasted text.txt` |
| Ngày tạo | 2026-11-17 |
| Frozen at | 2026-11-17 (Asia/Bangkok) |
| Revision bắt đầu | working tree |
| Revision cuối | working tree |

## 1. Bối cảnh

Repo hiện có Paperclip UI và các pipeline Atelier lớn. Yêu cầu mới cần một demo
độc lập, chạy không cần backend, mô phỏng 9 nhân viên AI trong một văn phòng 3D
và minh họa luồng handoff, trạng thái, thống kê, giờ làm việc và tăng ca.

## 2. Mục tiêu

Tạo app Vite + React + TypeScript độc lập trong `ai-office/`, có thể khởi chạy
bằng `npm install && npm run dev`, render được scene 3D 9 bàn/9 agent, phát mock
event lặp vô hạn, di chuyển agent mượt, hiển thị handoff effect, panel chi tiết
agent, thống kê hôm nay, ánh sáng theo giờ và trạng thái overtime.

## 3. Phạm vi

### In scope

- Ứng dụng độc lập `ai-office/` với React Three Fiber, Drei, Zustand và Postprocessing.
- Scene văn phòng 20x20, 9 bàn lưới 3x3 và 9 agent với màu vai trò cố định.
- Movement/turning/walk-cycle/status animation dùng `THREE.MathUtils.lerp`, clamp dt và hash phase.
- Mock event bridge theo schema yêu cầu; store lịch sử 50 event/agent và stats.
- Handoff trực tiếp: agent cầm hồ sơ đi tới bàn người nhận, bàn giao, rồi đi bộ về bàn cũ; không còn hồ sơ bay.
- Camera focus, OrbitControls, time lighting, overtime point lights và CSS panels.
- Vibe cozy indie studio: sàn gỗ, ánh vàng cam, pastel agents, cây/cốc/giấy và UI sáng mềm.
- Studio nội thất hoàn chỉnh hơn: tường Bắc/Tây với blueprint/material board, bàn maquette trung tâm, màn hình workstation và đạo cụ theo vai trò.
- Ghế cho từng workstation; agent dùng tâm ghế làm anchor, ngồi khi ở bàn và đứng/đi khi handoff.
- Zoning cố định 4 khu với vách ngăn thấp; mỗi agent có `homePos`/`deskPos` bất biến và kịch bản họp giao ban.
- Cấu hình Vite/TypeScript/package.json/index.html và hướng dẫn chạy trong README.

### Out of scope

- Kết nối backend thật, auth, persistence hoặc API production.
- Tích hợp vào route/entrypoint Paperclip hiện hữu.
- Tạo model 3D ngoài primitive Three.js hoặc dùng thư viện animation bên ngoài Three.js.
- Backend thật, auth, persistence hoặc kết nối event production.
- Xuất toàn bộ nội dung file vào chat; source of truth là cây file trong workspace.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: React, React DOM, Three, `@react-three/fiber`, `@react-three/drei`,
  `@react-three/postprocessing`, Zustand; Vite/TypeScript toolchain.
- Dữ liệu dùng chung: không sửa `paperclip/ui`, backend, dữ liệu seed hoặc scripts hiện hữu.
- Service/port/database không được ảnh hưởng: app chỉ dùng Vite dev server port mặc định.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo contract này và đóng băng phạm vi trước khi sửa implementation.
2. Tạo app standalone với scene, agent, event, effect và UI modules theo cấu trúc yêu cầu.
3. Cài dependency trong `ai-office`, chạy typecheck/build và smoke test dev server.
4. Ghi evidence, hạn chế và revision cuối vào contract.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office/package.json` | Mới | Dependency và lệnh chạy |
| `ai-office/tsconfig.json` | Mới | TypeScript config |
| `ai-office/vite.config.ts` | Mới | Vite React config |
| `ai-office/index.html` | Mới | HTML entry |
| `ai-office/README.md` | Mới | Hướng dẫn chạy |
| `ai-office/src/App.tsx` | Mới | Composition chính |
| `ai-office/src/office/*` | Mới | Scene, camera, lighting |
| `ai-office/src/agents/*` | Mới | Avatar, movement, config |
| `ai-office/src/effects/*` | Xóa khỏi runtime | Loại bỏ HandoffEffect và useHandoffStore cũ |
| `ai-office/src/events/*` | Mới | Event bridge/store/mock |
| `ai-office/src/ui/*` | Mới | Panel và stats |
| `ai-office/src/main.tsx`, `src/index.css` | Mới | Bootstrap và CSS |

## 7. Acceptance criteria

- [x] AC-01: `ai-office` cài được dependency và chạy bằng `npm run dev`.
- [x] AC-02: Scene hiển thị sàn hộp gỗ 20x20, 9 bàn đúng bố cục 3x3, camera/orbit controls và lighting vàng cam mềm.
- [x] AC-03: 9 agent có màu vai trò pastel, bảng tên, task bubble/status icon, ContactShadows và animation idle/working/waiting/blocked/done.
- [x] AC-04: Movement có gia tốc, giảm tốc, quay góc ngắn nhất, clamp dt 0.05 và walk-cycle không giật.
- [x] AC-05: Mock events phát theo timestamp tua nhanh, lặp vô hạn; store cập nhật history/stats/overtime đúng schema.
- [x] AC-06: Event có handoff cập nhật `agentTargets`/`agentStates`; sender cầm hồ sơ đi tới recipient, hiển thị handing, đợi 1.5s, rồi returning về bàn cũ và về idle.
- [x] AC-07: AgentPanel, TodayStats, nút đóng panel, camera focus và nút `Tua +2h` hoạt động.
- [x] AC-08: Không còn Bloom/Vignette/HandoffEffect; ContactShadows, cây, cốc, chồng giấy và UI cozy hiển thị; mọi timeout được clear.
- [x] AC-09: Typecheck và production build thành công.
- [x] AC-10: Tường Bắc/Tây, `BlueprintWall` và `MaterialBoard` render đúng với shadow nhẹ, giữ tông pastel/ấm.
- [x] AC-11: Bàn maquette trung tâm có kính mờ và `MiniRoom` chuyển 2D/3D/lighting theo agent working hiện tại.
- [x] AC-12: Mỗi desk có monitor; monitor working phát emissive và geometry nhỏ; status khác tắt emissive bằng lerp.
- [x] AC-13: Agent chief_architect/floor/qa có đạo cụ vai trò tương ứng; vật thể mới cast/receive shadow và transition hiển thị mượt.
- [x] AC-14: Mỗi workstation có `Chair` gồm mặt ghế, lưng tựa và 4 chân, có cast/receive shadow.
- [x] AC-15: Agent dùng anchor tâm ghế; `isSitting` chỉ true khi gần anchor và transit state không phải walking/handing/returning.
- [x] AC-16: Sitting animation hạ body, gập chân, đưa tay gõ phím; standing/walk cycle trả lại pose mượt với lerp 0.1–0.15.
- [x] AC-17: Khi sitting, velocity dừng về 0; handoff vẫn đi tới recipient và quay về đúng tâm ghế cũ.
- [ ] AC-18: `agentConfig.ts` có 9 agent với `homePos`/`deskPos` cố định theo 4 khu; không dùng random cho movement.
- [ ] AC-19: OfficeScene có vách ngăn thấp, không gian Chief/Meeting/Design/Engineering và decor đặc trưng từng khu.
- [ ] AC-20: Meeting event từ chief chuyển toàn bộ agent tới meeting anchors, chief working/agents waiting trong 4 giây, rồi tất cả walking về homePos.
- [ ] AC-21: Handoff thường vẫn đi tới đúng recipient desk và luôn quay về homePos; agent chỉ ngồi khi ở homePos và không transit.
- [x] AC-22: Các vách ngăn được chia đoạn tạo cửa mở trung tâm; có hành lang trực quan nối 4 khu và không có dải sàn hành lang bị vách chắn ngang.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cài dependency | `npm install` trong `ai-office` | Exit 0, lockfile được tạo |
| Typecheck | `npm run typecheck` | Không có lỗi TypeScript |
| Production build | `npm run build` | Vite tạo `dist/` thành công |
| Dev smoke | `npm run dev -- --host 127.0.0.1` | Server trả HTML app |
| Source audit | `rg` các constraint trong `src/` | Có clamp dt, lerp, cleanup, mock bridge và handoff remove |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| WebGL hoặc ContactShadows không khả dụng | App vẫn render scene lõi; build không phụ thuộc runtime GPU cụ thể |
| Mock event phát nhanh trong lúc agent đang handoff | Store khóa sender theo state và timeout cleanup; lịch sử vẫn giới hạn 50 |
| Bố cục overlay khó đọc ở viewport hẹp | CSS media query, panel có max-width và stats co giãn |
| App standalone lệch khỏi UI Paperclip | Giữ toàn bộ thay đổi trong `ai-office/` |

Rollback point và cách rollback: xóa thư mục `ai-office/` và file contract này nếu
chưa cần giữ demo; không chạm các thư mục Paperclip hiện hữu.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-17 (Asia/Bangkok)

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-17 | Thay handoff effect bay bằng agent tự đi bộ cầm hồ sơ, đổi visual sang cozy indie studio, bỏ postprocessing | Yêu cầu cập nhật mới nhất của người dùng | Sửa store/avatar/scene/lighting/CSS/App; xóa runtime effects cũ | Người dùng yêu cầu trực tiếp | 1.1 |
| CR-002 | 2026-11-17 | Thêm tường/bản vẽ/material board, bàn maquette/MiniRoom, monitor workstation và đạo cụ vai trò | Yêu cầu nâng cấp thành studio thiết kế nội thất thực thụ | Sửa `OfficeScene`, `AgentAvatar`, thêm components scene/props, giữ nguyên transit logic | Người dùng yêu cầu trực tiếp | 1.2 |
| CR-003 | 2026-11-17 | Thêm ghế từng desk và sitting/standing animation; chuyển agent anchor về tâm ghế, dừng velocity khi ngồi | Yêu cầu mới nhất của người dùng | Sửa `agentConfig`, `useAgentMovement`, `AgentAvatar`, `OfficeScene`, giữ nguyên handoff state machine | Người dùng yêu cầu trực tiếp | 1.3 |
| CR-004 | 2026-11-17 | Viết lại zoning 4 khu, homePos/deskPos cố định và meeting state machine 4 giây | Yêu cầu mới nhất của người dùng về không gian có tổ chức | Sửa `agentConfig`, `useEventStore`, `AgentAvatar`, `OfficeScene`; giữ nguyên contract event/handoff | Người dùng yêu cầu trực tiếp | 1.4 |
| CR-005 | 2026-11-17 | Mở hành lang trung tâm, chia vách ngăn thành các đoạn có cửa và thêm lối đi trực quan vào 4 khu | Người dùng phản hồi các phòng chưa có đường đi/lối đi rõ ràng | Sửa `OfficeScene`; giữ nguyên anchor, handoff và meeting state machine | Người dùng yêu cầu trực tiếp | 1.5 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-17 | working tree | Bắt đầu triển khai standalone app | Sau khi contract FROZEN |
| 2026-11-17 | working tree | CR-001 được chấp nhận và chuyển implementation sang agent handoff trực tiếp/cozy indie studio | Giữ nguyên cấu trúc `ai-office/` |
| 2026-11-17 | `9d241d75` + working tree | Hoàn tất store transit, avatar đi/bàn giao/về, cozy scene/decor/UI và xóa effects cũ | Đã triển khai theo CR-001 |
| 2026-11-17 | working tree | CR-002 được chấp nhận và chuyển implementation sang studio nội thất có tường/bản vẽ/maquette/monitor | Giữ nguyên logic agent transit của CR-001 |
| 2026-11-17 | working tree | CR-003 được chấp nhận và chuyển implementation sang anchor tâm ghế + sitting/standing pose | Không thay đổi event schema hoặc handoff flow |
| 2026-11-17 | `9d241d75` + working tree | Hoàn tất Chair component, chair anchors, sit/stand pose và velocity stop | Đã triển khai theo CR-003 |
| 2026-11-17 | working tree | CR-004 được chấp nhận và chuyển implementation sang zoning cố định + meeting state machine | Không dùng random movement |
| 2026-11-17 | `9d241d75` + working tree | Hoàn tất agentConfig zoning/anchor, store meeting phase, meeting decor, return-to-home và mapping ID tương thích mock | CR-004 implementation complete |
| 2026-11-17 | working tree | Hoàn tất các khe cửa trung tâm và 4 nhánh hành lang màu gỗ sáng, giữ nguyên đường đi/state machine | CR-005 implementation complete |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-17 | `9d241d75` + working tree | `npm install` | PASS; dependency lock cập nhật, 0 vulnerabilities | `ai-office/package-lock.json` |
| 2026-11-17 | `9d241d75` + working tree | `npm run typecheck` | PASS | Exit code 0 |
| 2026-11-17 | `9d241d75` + working tree | `npm run build` | PASS; Vite tạo `dist/`; chỉ còn cảnh báo bundle Three.js >500 kB | `ai-office/dist/` |
| 2026-11-17 | `9d241d75` + working tree | Dev preview `http://127.0.0.1:5173/` | PASS; 9 agent, sàn gỗ, pastel palette, ContactShadows và decor hiển thị | Browser preview tab |
| 2026-11-17 | `9d241d75` + working tree | Mock handoff smoke | PASS; DOM xuất hiện `Bàn giao cho An`/`Bàn giao cho Chi`; sau đó agent tiếp tục cycle | Browser DOM snapshot |
| 2026-11-17 | `9d241d75` + working tree | Runtime console | PASS; tab sạch không có error/warning sau khi pin React 19.2 + R3F 9.4.2 + Drei 10.7.6 | Browser dev logs `[]` |
| 2026-11-17 | `9d241d75` + working tree | Time control | PASS; `Tua +2h` đổi `09:00` thành `11:00` | Browser DOM assertion |
| 2026-11-17 | `9d241d75` + working tree | `npm run typecheck` sau CR-002 | PASS | Exit code 0 |
| 2026-11-17 | `9d241d75` + working tree | `npm run build` sau CR-002 | PASS; `dist/` tạo thành công; cảnh báo bundle Three/Drei >500 kB | `ai-office/dist/` |
| 2026-11-17 | `9d241d75` + working tree | Dev preview sau CR-002 | PASS; tường, blueprint, material board, glass maquette, MiniRoom, monitors và decor hiển thị | Browser preview tab |
| 2026-11-17 | `9d241d75` + working tree | Runtime console sau CR-002 | PASS; không có error/warning trong tab sạch khi mock stream chạy | Browser dev logs `[]` |
| 2026-11-17 | `9d241d75` + working tree | Source audit sau CR-002 | PASS; có `BlueprintWall`, `MaterialBoard`, `MiniRoom`, `ContactShadows`, monitor emissive lerp và role props | `rg` audit trên `ai-office/src` |
| 2026-11-17 | `9d241d75` + working tree | `npm run typecheck` sau CR-003 | PASS | Exit code 0 |
| 2026-11-17 | `9d241d75` + working tree | `npm run build` sau CR-003 | PASS; `dist/` tạo thành công; cảnh báo bundle Three/Drei >500 kB | `ai-office/dist/` |
| 2026-11-17 | `9d241d75` + working tree | Dev preview sau CR-003 | PASS; chair hiển thị, agent pose ngồi tại desk và scene vẫn render đủ studio props | Browser preview tab |
| 2026-11-17 | `9d241d75` + working tree | Handoff + sitting smoke | PASS; DOM xuất hiện `Bàn giao cho...`, console `[]`; transit flow tiếp tục sau khi thêm chair anchor | Browser DOM/dev logs |
| | | | | |
| 2026-11-17 | `9d241d75` + working tree | `npm run typecheck` sau CR-004 | PASS | Exit code 0 |
| 2026-11-17 | `9d241d75` + working tree | `npm run build` sau CR-004 | PASS; Vite build thành công; còn cảnh báo bundle Three/Drei >500 kB | `ai-office/dist/` |
| 2026-11-17 | `9d241d75` + working tree | Source audit sau CR-004 | PASS; không có `Math.random`, mọi `useFrame` clamp `dt` 0.05, transition dùng lerp, timeout có cleanup | `rg` audit trên `ai-office/src` |
| 2026-11-17 | `9d241d75` + working tree | Zoning/anchor preview | PASS; 4 khu với vách ngăn thấp, 9 desk/chair cố định, role-to-ID mapping khớp mock | Browser screenshot + AX snapshot |
| 2026-11-17 | `9d241d75` + working tree | Meeting smoke | PASS; Chief và 8 agent tới bàn họp, hiện đúng task/bubble, chờ 4 giây, toàn bộ quay về homePos và khôi phục task | Browser AX snapshots; dev logs `[]` |
| 2026-11-17 | working tree | Corridor preview | PASS; 4 vách được chia đoạn, cửa trung tâm thông thoáng, hành lang sáng nối Bắc/Nam/Tây/Đông, không có error/warning | Browser screenshot + dev logs `[]` |

## 14. Kết quả và đóng chức năng

- Kết quả: CR-001, CR-002, CR-003 và CR-004 đã hoàn tất.
- Kết quả: CR-001, CR-002, CR-003, CR-004 và CR-005 đã hoàn tất.
- Hạn chế còn lại: Bundle Three/Drei lớn hơn 500 kB sau minify; không ảnh hưởng chức năng, có thể code-split ở contract riêng.
- Việc chưa hoàn tất: Không còn hạng mục bắt buộc trong phạm vi CR-005.
- Rollback point: `9d241d75` + working tree trước CR-005.
- Trạng thái `CLOSED` bởi: Codex sau khi hoàn tất implementation và verification AC-22.
- Thời điểm: 2026-11-17 (Asia/Bangkok).
