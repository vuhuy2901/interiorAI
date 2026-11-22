# [FEAT-2026-160] Bàn làm việc đặt tự do, gán agent 1-1, migrate DESK_POOL

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.0 |
| Owner | Sonnet subagent (pha 2) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 |
| Revision bắt đầu | a9d1cab8 (FEAT-2026-159) |
| Revision cuối | xem commit feat(FEAT-2026-160) |

## 1. Bối cảnh

Sau FEAT-158/159 đã có cửa chính xác, đồ thị phòng–cửa, `planRoute`, `canAssign`. Bàn làm việc vẫn là 16 vị trí cố định (`DESK_POOL`) gắn với custom agent qua `poolIdx`; bàn dựng bằng `createDetailedDesk` trên ô cố định và chặn lưới cũ `blocked`.

## 2. Mục tiêu

Bàn đặt tự do trong chế độ Build (hít lưới 0.25 m, xoay 90°), kiểm tra hợp lệ (tường/bàn khác/khung cửa/lối đi/phòng chưa có cửa), lưu có version, gán agent ↔ bàn 1-1, agent đi về bàn bằng `planRoute`, migrate `DESK_POOL` cũ.

## 3. Phạm vi

### In scope

- Khối `FEAT-2026-160 CORE` (hàm thuần, mở rộng `OfficeNav.desk`): hình học bàn (`geom`: body 2.0x1.0 m, ghế 0.56 m cách tâm 0.75 m, `seatPt`, `approachPt` cách tâm 1.25 m, `facing`), `snap` 0.25 m, OBB-SAT, lưới vật cản bàn (`baseGrid`, trừ ô `approachPt` của chính bàn), `validate`, `serialize/parse` (version), `migratePool`.
- Luật hợp lệ: trong phòng khép kín và `approachPt` cùng phòng; phòng có cửa/tới được (như `canAssign`); không chồng tường (OBB tường), khung cửa (vùng quanh cửa gồm `frontPt/backPt`), bàn/ghế khác; sau khi đặt, A* từ `approachPt` tới điểm trong-phòng của một cửa mở của phòng phải thành công (cửa gần nhất trước, thử lần lượt), và mọi bàn khác cùng phòng vẫn tới được cửa.
- Page `FEAT160`: công cụ "Bàn" (toolbar + tab Build, phím B), ghost xanh/đỏ + lý do (`#navMsg`), R xoay, click đặt/chọn, Delete xoá, panel danh sách bàn với chọn agent, lưu `localStorage` key `atelier_desks_v1` (`v:1`), mesh bàn/ghế tự do, undo/redo qua `fp2Snapshot`.
- Gán agent ↔ bàn (panel bàn: select agent; drawer agent: select bàn); xoá bàn -> agent "chưa có bàn"; agent được gán đi tới `approachPt` bằng `FEAT159.planRoute(...,{useBase:true})` rồi quay `facing`. `useBase:true` dùng lưới bàn (FEAT-160).
- Hook `Agent.prototype.walk` cho custom agent: dùng `planRoute` (qua cửa); không có đường thì rơi về A* cũ.
- Migrate: custom agent có `poolIdx` thành bàn tự do (cùng vị trí `DESK_POOL`) ở lần tải đầu; không mất agent.

### Out of scope

- Animation ngồi/kéo ghế, tránh nhau, cửa tự mở (FEAT-161), máy trạng thái (FEAT-162).
- 9 agent lõi (AG) giữ bàn cố định cũ; chỉ custom agent (`dp_*`) gán bàn tự do.
- Đổi kích thước bàn, bàn nhiều kiểu, kéo bàn đã đặt (xoá rồi đặt lại).

## 4. Dependency và tài nguyên cần bảo vệ

- FEAT-158 `OfficeNav`, FEAT-159 `FEAT159.nav/planRoute/canAssign`, `fp2Snapshot`.
- localStorage: `atelier_custom_agents` (giữ nguyên), `atelier_fp2_v1` (giữ nguyên), mới `atelier_desks_v1`.
- Cổng không được ảnh hưởng: 8123, 3100, 3180, 8000. Thử nghiệm dùng 8142.

## 5. Thiết kế

Hình học: tâm (x,z) hít 0.25 m, `rot` 0..3, θ=rot·90°, `s=(sinθ,cosθ)`; body OBB nửa-kích-thước (1.0 theo trục rộng, 0.5 theo `s`); `seatPt=tâm+0.75s`; `approachPt=tâm+1.25s`; `facing=θ+π` (agent quay mặt về bàn). Lưới bàn: ô giao body (strict) bị chặn. `planRoute` thêm `cfg.base` = lưới bàn khi `useBase`.

## 6. File dự kiến thay đổi

| File | Loại | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Thêm khối CORE + FEAT160, sửa `createDetailedDesk` (tuỳ chọn `free`), `spawnCustomAgent`, snapshot/undo/redo, toolbar, drawer | Triển khai |
| `scripts/tests/office-nav.test.mjs` | Thêm test 160 | AC |
| `docs/features/FEAT-2026-160-free-placement-desks.md` | Mới | Contract |

## 7. Acceptance criteria

- [x] AC-01: `geom` cho rot 0..3 cho `seatPt/approachPt/facing` đúng, `approachPt` không bị ô bàn của chính nó chặn.
- [x] AC-02: Đặt 10 bàn ở 3 phòng đều hợp lệ; `serialize` -> `parse` giữ nguyên; trình duyệt: tải lại giữ nguyên 10 bàn.
- [x] AC-03: Bị từ chối kèm lý do: chắn khung cửa (gồm vùng front/back), chồng tường, chồng bàn khác, phòng chưa có cửa, ngoài phòng, mất lối đi.
- [x] AC-04: Bàn là vật cản của `planRoute` khi `useBase`; đường tới `approachPt` qua đúng cửa, không cắt ô bàn/tường.
- [x] AC-05: Gán 1-1 (gán lại làm bàn/agent cũ mất liên kết); xoá bàn -> agent chưa có bàn; agent mới đi về `approachPt` qua cửa và quay `facing` (trình duyệt).
- [x] AC-06: Migrate `poolIdx` thành bàn tự do, không mất agent, idempotent.
- [x] AC-07: Undo/redo Build ghi nhận đặt/xoá bàn. `node --check` pass, test Node pass, 0 lỗi console.

## 8. Verification plan

| Kiểm tra | Cách chạy | Kỳ vọng |
|---|---|---|
| Cú pháp | trích `<script>` inline, `node --check` | exit 0 |
| Logic | `node scripts/tests/office-nav.test.mjs` | pass hết (cũ 12 + mới) |
| Trình duyệt | server 8142, Chrome MCP, xoá localStorage origin | đặt bàn, từ chối, gán, tải lại, ảnh, 0 lỗi |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tường dựng sau làm bàn lệch/hỏng | `onNavChanged` tính lại phòng + gắn cờ cảnh báo, không tự xoá |
| A* mỗi lần ghost di chuyển | cache theo (x,z,rot,phiên bản) |
| Legacy `walk` trong phòng không đường | rơi về A* cũ, ghi `console.warn` |

Rollback point: commit `a9d1cab8`; `git revert` commit FEAT-160.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Sonnet subagent (pha 2)
- Thời điểm: 2026-11-22

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 | 3f493b6f -> commit feat | Khối CORE `OfficeNav.desk`, `FEAT160` (bàn, gán, migrate, undo), công cụ Bàn, panel, drawer agent | Bổ sung trong lúc làm (không đổi phạm vi): kiểm tra lối đi thêm (a) mọi bàn cùng phòng còn tới được cửa, (b) các cửa của phòng còn nối với nhau (A* bị giới hạn trong đa giác phòng, không đi vòng ra ngoài). `useBase` của `FEAT159.planRoute` nay là lưới bàn tự do. Bàn tự động cho agent mới ở slot DESK_POOL chỉ khi hợp lệ, nếu không agent ở trạng thái chưa có bàn. |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | 2026-11-22 | feat 160 | `node --check` script inline | exit 0 | terminal |
| 2026-11-22 | feat 160 | `node scripts/tests/office-nav.test.mjs` | 19 pass, 0 fail (158 x4, 159 x8, 160 x7) | terminal |
| 2026-11-22 | feat 160 | Trình duyệt 8142 (xoá localStorage, 2 custom agent poolIdx 0 và 3): migrate thành D1, D2 giữ agent; thêm cửa tự động; đặt 12 bàn (4/2/4 ở 3 phòng) + 1 bàn bằng click chuột; ghost đỏ "Chồng lên tường", ghost xanh hợp lệ | Gán dp_3 sang bàn D3 phòng 1: đi R5->R3->R2->R1 qua cửa o5,o3,o2, 0 mẫu vị trí trong ô chặn, tới đúng approachPt (1.25, 2), quay facing 3.14; gán 1-1; xoá bàn -> agent chưa có bàn, undo khôi phục; tải lại giữ nguyên 13 bàn và gán agent; 0 lỗi console | `docs/features/evidence/FEAT-2026-160-ghost-red-wall.jpg`, `FEAT-2026-160-ghost-green-valid.jpg`, `FEAT-2026-160-reload-13-desks.jpg` |

## 14. Kết quả và đóng chức năng

- Kết quả: đạt AC-01..07.
- Hạn chế còn lại: 9 agent lõi giữ bàn cố định cũ; không kéo/di chuyển bàn đã đặt (xoá và đặt lại); agent đã gán vẫn bị luồng cũ (Paperclip poll) cho ngồi, animation ngồi thuộc FEAT-161; tường dựng sau có thể làm bàn lệch: chỉ cảnh báo đỏ trong panel và viền đỏ, không tự xoá.
- Việc chưa hoàn tất:
- Rollback point: a9d1cab8
- Trạng thái `CLOSED` bởi:
- Thời điểm:
