# [FEAT-2026-162] Trạng thái agent đầy đủ: máy trạng thái, panel, nhãn, đồng bộ Paperclip

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.0 |
| Owner | Sonnet subagent (pha 3b) |
| Người chấp thuận | Opus (phiên chính) theo `docs/plans/2026-11-22-office-navigation.md` |
| Ngày tạo | 2026-11-23 |
| Frozen at | 2026-11-23 |
| Revision bắt đầu | 2eacf01c (FEAT-2026-161 v1.2, CR-4) |
| Revision cuối | xem commit feat(FEAT-2026-162) |

## 1. Bối cảnh

Sau FEAT-161 mọi agent đi bằng `planRoute` và để lại hook `agent.navState`, `agent.navBlock`, `FEAT161.onBlocked`, `FEAT161.onNavChanged`. Trạng thái hiển thị hiện chỉ là `agent.state` (`idle|working|thinking|meeting|error`, do `setStatus` đặt) cộng chuỗi cứng ở panel (`agent.state === 'meeting' ? ...`) nên không nói được agent đang ở phòng nào, đi đâu, bao giờ tới, vì sao bị chặn. Luồng poll Paperclip (`syncLiveCompanyStatus`) đã có dữ liệu issue/agent; khi `issues` lỗi mà `agents` có, luồng cũ coi như "không có task" và đẩy agent về rảnh (trạng thái sai khi mất API).

## 2. Mục tiêu

Mỗi agent có một máy trạng thái rõ ràng `no_desk, idle, walking(target), waiting_door, blocked(reason), sitting, working(task), meeting, leaving`; mọi chuyển trạng thái đi qua đúng một hàm có kiểm tra hợp lệ và log vòng ngắn; panel agent và nhãn trên đầu hiển thị phòng hiện tại, đích, ETA, bàn, task, lý do bị chặn (cập nhật <= 1 s); trạng thái làm việc đồng bộ với Paperclip qua luồng poll hiện có và không sai khi API lỗi.

## 3. Phạm vi

### In scope

- Khối `FEAT-2026-162 CORE` (hàm thuần, `OfficeNav.state`, không DOM/THREE): danh sách trạng thái, bảng chuyển hợp lệ, `canTransition`, `path` (đường chuyển ngắn nhất qua bảng), `createMachine`, `setState` (kiểm tra hợp lệ, `blocked` bắt buộc có `reason`, log vòng cố định 40 mục, cập nhật thông tin cùng trạng thái không ghi log), `etaSeconds` (độ dài còn lại / tốc độ), `deriveFromNav` (ánh xạ `navState/navBlock` + trạng thái vật lý sang trạng thái máy), `statusText/tagText` (chuỗi tiếng Việt đọc được), `paperclipIntent` (từ kết quả poll -> `working|idle|null`; `null` = không đổi).
- Khối trang `FEAT162`: `FEAT162.setAgentState(agent, state, info)` (cũng gán `window.setAgentState`) là đường duy nhất đổi `agent.ms`; tick <= 0.25 s suy ra trạng thái từ mover FEAT-161/ngồi/`agent.state` kinh doanh (qua `path` khi cần bước trung gian); móc `FEAT161.onBlocked`; bọc `Agent.prototype.standUp` (đặt `leaving`) và `setStatus` (đồng bộ ý định công việc); lý do chặn đọc được ("Phòng Họp chưa có cửa", "Cửa o2 bị khoá", "Chờ cửa o2").
- Panel agent (drawer): thay chuỗi trạng thái cứng bằng nguồn mới; thêm các dòng phòng hiện tại (`pointInRoom`), đích, ETA, bàn, task, lý do bị chặn; tự làm mới <= 1 s khi đang mở. Nhãn nhỏ cạnh tên trên đầu agent (trong pill hiện có) cập nhật <= 1 s. `agent.state` kinh doanh giữ nguyên ngữ nghĩa cho chip/đếm Bận-Rảnh.
- Đồng bộ Paperclip trong `syncLiveCompanyStatus` hiện có (không thêm request): agent có issue `in_progress` -> về bàn -> `working(task)`; không có -> `idle`. Nếu `agents` hoặc `issues` không phải mảng (API lỗi/tắt) bỏ qua bước ánh xạ, giữ trạng thái cục bộ, không ném lỗi, báo nhẹ một lần.
- Test Node `scripts/tests/office-nav.test.mjs`: bảng chuyển hợp lệ/không hợp lệ, `blocked` có reason, ETA giảm dần khi đi (mô phỏng mover), mất API không đổi trạng thái sai, log vòng không vượt cỡ.

### Out of scope

- Hoạt ảnh mới, đổi cách đi (FEAT-161), đổi quy tắc đặt cửa/bàn (158/160), đổi API Paperclip hoặc thêm endpoint/request.
- Chuỗi trạng thái kinh doanh `error/thinking` (vẫn do poll đặt như cũ), thống kê công ty, minimap.
- Hiển thị trong trình duyệt bằng ảnh (người dùng cấm Chrome); kiểm bằng Node.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `FEAT161` (`movers`, `onBlocked`, `navState/navBlock`, `_navTarget`), `FEAT159` (`nav`, `roomName`), `FEAT160` (`desks`, `deskLabel`), `OfficeNav.pointInRoom`, `Agent.setStatus/standUp/update`, `syncLiveCompanyStatus`.
- Dữ liệu dùng chung: không thêm khoá localStorage; không đổi `agent.state` kinh doanh.
- Không ảnh hưởng: Build/FP2, minimap, Custom Team, Visual Quality, cổng 8123, 3100, 3180, 8000 (không bật server; API 3100 chỉ được đọc qua luồng poll cũ).

## 5. Thiết kế và kế hoạch triển khai

1. CORE 162: trạng thái, bảng chuyển, `canTransition`, `path` (BFS), `createMachine/setState` (log vòng 40), `etaSeconds`, `deriveFromNav`, `statusText/tagText`, `paperclipIntent`.
2. Bảng chuyển hợp lệ (tập đích): `no_desk`: idle, walking, blocked, meeting, leaving; `idle`: no_desk, walking, sitting, working, blocked, meeting, leaving; `walking`: idle, waiting_door, blocked, sitting, working, meeting, leaving, no_desk; `waiting_door`: walking, blocked, idle; `blocked`: idle, walking, no_desk, sitting, working, leaving; `sitting`: idle, working, walking, meeting, leaving, blocked, no_desk; `working`: sitting, idle, walking, blocked, meeting, leaving, no_desk; `meeting`: idle, walking, sitting, working, leaving; `leaving`: walking, idle, no_desk, blocked. Ví dụ không hợp lệ: no_desk->sitting/working, idle->waiting_door, waiting_door->sitting/working/meeting/leaving, sitting->waiting_door, leaving->sitting/working/meeting.
3. `FEAT162` trang: tick suy ra trạng thái; chuyển trạng thái không hợp lệ được tách thành các bước hợp lệ qua `path` (không bao giờ ghi trạng thái bất hợp lệ).
4. Panel/nhãn: `FEAT162.info(agent)` trả `{state,label,room,target,eta,desk,task,reason}`; drawer và pill dùng chung.
5. Paperclip: guard `apiOk` quanh vòng ánh xạ trong poll; `setStatus` hiện có tiếp tục đặt `agent.state`, FEAT162 đồng bộ ý định `working/idle`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Thêm khối CORE 162 + `FEAT162`; sửa `openAgentDrawer`, `syncLiveCompanyStatus` (guard API), móc `Agent.setStatus/standUp/update/updatePill` | Triển khai |
| `scripts/tests/office-nav.test.mjs` | Thêm test 162 | AC |
| `docs/features/FEAT-2026-162-agent-state-machine.md` | Mới | Contract |
| `docs/features/evidence/FEAT-2026-162-*` | Mới | Bằng chứng |

## 7. Acceptance criteria

- [x] AC-01: Mọi cặp (from,to) trong 9x9 trạng thái cho kết quả `canTransition` đúng bảng mục 5; `setState` từ chối chuyển không hợp lệ (trạng thái không đổi, trả `ok:false`); `path` luôn cho chuỗi chỉ gồm chuyển hợp lệ giữa hai trạng thái bất kỳ.
- [x] AC-02: `blocked` không có `reason` bị từ chối; có `reason` thì lưu; lý do từ `planRoute`/cửa khoá ("... chưa có cửa", "Cửa X bị khoá") hiển thị nguyên văn trong `statusText`.
- [x] AC-03: ETA (`etaSeconds`) giảm đơn điệu khi agent đi (mô phỏng mover), bằng độ dài còn lại / 1.2 m/s trong sai số 15%, về 0 khi tới.
- [x] AC-04: Log vòng không vượt 40 mục; cập nhật cùng trạng thái (đổi đích/ETA) không sinh log; không `console.log` mỗi chuyển.
- [x] AC-05: `paperclipIntent`: API lỗi/không thấy agent -> `null` (không đổi); có issue in_progress -> working(task); không có -> idle. Mô phỏng mất API giữa chừng: trạng thái cục bộ giữ nguyên.
- [x] AC-06: Mọi nơi trong trang đổi trạng thái agent chỉ qua `setAgentState` (không gán `ms.state` trực tiếp ngoài CORE); chuỗi `agent.state === 'meeting' ? ...` ở panel được thay bằng `FEAT162.statusText`.
- [x] AC-07: `node --check` script inline pass; test Node cũ (34) + mới pass; không phá Build/FP2, minimap, Custom Team, Visual Quality; 0 lỗi cú pháp.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp | trích `<script>` inline, `node --check` | exit 0 |
| Logic | `node scripts/tests/office-nav.test.mjs` | pass hết |
| ETA/mô phỏng | test Node với `Nav.move` | AC-03 |
| Mất API | test Node `paperclipIntent` + mô phỏng poll | AC-05 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tick suy ra trạng thái xung đột với `walk/sitDown` đang chạy | Chỉ đọc cờ (`movers`, `sitting`, `isTransitioning`, `navBlock`), giữ trạng thái cũ trong khoảng chuyển; không điều khiển agent |
| Làm chậm vòng lặp | Tick mỗi agent <= 4 lần/giây, cập nhật DOM chỉ khi chuỗi đổi |
| Đổi hành vi poll | Chỉ thêm guard khi dữ liệu API không phải mảng; ánh xạ khi API tốt giữ nguyên |
| `selectedAgent` chưa khai báo lúc khởi tạo | Truy cập trong try, chỉ sau khi trang chạy |

Rollback point và cách rollback: commit `2eacf01c`; `git revert` commit feat FEAT-162.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Sonnet subagent (pha 3b)
- Thời điểm: 2026-11-23

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-23 | commit feat 162 | CORE 162 (`OfficeNav.state`: bảng chuyển, `canTransition/path/goTo/setState` log vòng 40, `etaSeconds`, `deriveFromNav`, `statusText/tagText`, `paperclipIntent`); trang `FEAT162` (tick <=0.25 s, nhãn trong pill <=0.5 s, panel làm mới <=0.5 s, `window.setAgentState`, móc `FEAT161.onBlocked`, bọc `Agent.update/setStatus/standUp`); `openAgentDrawer` dùng `FEAT162.statusText/panelLines`; `syncLiveCompanyStatus` thêm guard `apiOk` + `FEAT162.notePoll`. | `agent.state` kinh doanh giữ nguyên cho chip/đếm Bận-Rảnh. |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-23 | feat 162 | `node --check` script inline; `node scripts/tests/office-nav.test.mjs` | 42 pass, 0 fail (34 cũ + 8 mới của 162). Bảng 9x9: 61 hợp lệ, 20 bất hợp lệ đều bị từ chối, trạng thái không đổi; `path/goTo` đúng với cả 81 cặp; blocked không reason bị từ chối, reason thật từ planRoute ("... chưa có cửa", cửa đóng/khoá) hiển thị nguyên văn; ETA đơn điệu giảm 75 mẫu (20 m -> 16.67 s); log vòng 40; mất API giữa chừng không đổi trạng thái. Smoke Node của khối trang `FEAT162` (stub): idle -> walking -> blocked -> working -> leaving chạy đúng, panelLines đúng. Trình duyệt: không thử (Chrome bị cấm). | `docs/features/evidence/FEAT-2026-162-node-sim.txt` |

## 14. Kết quả và đóng chức năng

- Kết quả: đạt AC-01..07 bằng mô phỏng/test Node; panel, nhãn đầu agent và đồng bộ Paperclip đã nối vào trang.
- Hạn chế còn lại: chưa kiểm bằng trình duyệt thật (Chrome bị cấm), hiển thị panel/nhãn và poll thật chưa có ảnh; `blocked` do nav giữ tới lần đi kế tiếp của agent; `thinking/error` kinh doanh vẫn do poll đặt như cũ.
- Việc chưa hoàn tất: nghiệm thu trong trình duyệt (cần người dùng/Haiku đo), đóng CLOSED.
- Rollback point: 2eacf01c
- Trạng thái `CLOSED` bởi:
- Thời điểm:
