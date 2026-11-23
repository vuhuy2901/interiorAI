# [FEAT-2026-163] Gộp công ty agent (FEAT-158..162) vào master và sửa đồng bộ Paperclip

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Claude Code (theo yêu cầu người dùng) |
| Người chấp thuận | Người dùng — chọn phương án A "gộp đầy đủ, không thiếu, không lỗi chức năng" (2026-11-23) |
| Ngày tạo | 2026-11-23 |
| Frozen at | 2026-11-23 |
| Revision bắt đầu | `wip/master-uncommitted-20261123` (`0055891b`) + `feat/furnimesh-connect` (`7aeadb40`) + `feat/office-navigation` (`8eedc84c`) |
| Revision cuối | Nhánh `feat/agent-company-merge`: merge `13e30fd3` + commit sửa lỗi FEAT-2026-163 (blob `index.html` `c26bab2a`) |

## 1. Bối cảnh

- `http://127.0.0.1:5000/` phục vụ `qldapm_fina/ai-office-standalone` (master + thay đổi chưa commit FEAT-150..157 sàn/tường/đèn và FurniMesh).
- Phần công ty agent (cửa chính xác, đồ thị phòng-cửa, bàn tự do, di chuyển như thật, máy trạng thái agent — FEAT-2026-158..162) nằm ở nhánh `feat/office-navigation`, chưa có trên master.
- Hai bên cùng viết lại phần Build trong `index.html` từ gốc chung `340f19bb`: gộp ba chiều có 11 xung đột.
- Kiểm thử trước gộp (2026-11-23) phát hiện:
  1. Danh sách agent Paperclip trong "Tuỳ chỉnh team" luôn báo offline: `GET /api/atelier/bootstrap` mất 2–2,8 s (quá timeout 2 s) và không có CORS → cả khối tải bị bỏ.
  2. Agent tạo từ danh sách không lưu id Paperclip → task giao cho agent đó không bao giờ tới agent 3D (rơi vào agent lõi trùng tên).
  3. Trang ở cổng 5000 không đọc được `/api/companies`, `/agents`, `/issues` (không có CORS) → trạng thái làm việc thật không đồng bộ.
  4. Khi mất API, huy hiệu vẫn hiện "✓ SẴN SÀNG".
  5. Sau khi đặt/xoá bàn, nút Hoàn tác không cập nhật trạng thái enable.

## 2. Mục tiêu

Một nhánh `feat/agent-company-merge` chứa đầy đủ chức năng của cả ba nguồn, đồng bộ trạng thái agent thật từ Paperclip khi trang chạy ở cổng 5000, không mất chức năng nào đã có.

## 3. Phạm vi

### In scope

- Gộp `feat/furnimesh-connect` và `feat/office-navigation` vào snapshot master; giải 11 xung đột `index.html`: giữ UI Build mới của master, ghép công cụ Bàn (FEAT-160), ghost cửa + validate (FEAT-158), khoá/mở cửa, lá cửa tự mở (FEAT-161), Undo/Redo gồm bàn, cảnh báo "Chưa có cửa" (FEAT-159), máy trạng thái (FEAT-162).
- `WG.addOpening` nhận cả hai kiểu gọi (object và tham số rời).
- Endpoint chỉ đọc `GET /api/atelier/office-status` (CORS chỉ cho origin loopback `http://127.0.0.1:*`, `http://localhost:*`).
- Trang dùng `office-status` trước, đường cũ làm dự phòng; huy hiệu báo mất kết nối khi API lỗi.
- Tuỳ chỉnh team: tải danh sách không phụ thuộc bootstrap (timeout dài hơn, lỗi không chặn), thử lại khi mở lại panel, lưu `paperclipAgentId`; agent tùy chỉnh liên kết nhận task theo id (ưu tiên hơn ghép tên agent lõi).
- Cập nhật trạng thái nút Hoàn tác sau thao tác bàn.
- Test `scripts/tests/office-nav.test.mjs`: nhận cả định dạng mới của `fp2SeedDefaultWalls`.

### Out of scope

- Tạo/giao task từ văn phòng 3D (nút "Gửi chỉ thị" giữ nguyên hành vi hiện tại).
- Đổi CORS các route Paperclip khác; đổi số hiệu FEAT trùng (155..157 FurniMesh vs 155..157 sàn) — chỉ ghi chú.
- Ghi đè `master` hoặc thư mục `qldapm_fina` khi người dùng chưa duyệt.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip 3100 (embedded PostgreSQL 54329), Python http.server 5000.
- Dữ liệu dùng chung: localStorage `atelier_fp2_v1`, `atelier_desks_v1`, `atelier_custom_agents` (giữ tương thích, cấu hình cũ không có `paperclipAgentId` vẫn chạy).
- Không ảnh hưởng: DB Paperclip (endpoint chỉ SELECT), thư mục master đang chạy cổng 5000 (bản dự phòng `wip/master-uncommitted-20261123`).

## 5. Thiết kế và kế hoạch triển khai

1. Snapshot master (đã có nhánh `wip/master-uncommitted-20261123`), merge FurniMesh, merge navigation, giải xung đột bằng script có kiểm tra (`resolve_merge.py`).
2. Server: thêm route `office-status` cạnh `office-agents` trong `atelier-bridge.ts`.
3. Client: sửa `syncLiveCompanyStatus`, `renderCustomTeamPanel`, submit form, khối UI bàn.
4. Kiểm thử Node + trình duyệt + Vitest server liên quan.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Gộp + sửa | Xung đột, lỗi 1/2/4/5 |
| `paperclip/server/src/routes/atelier-bridge.ts` | Thêm route | Lỗi 3 |
| `scripts/tests/office-nav.test.mjs` | Sửa regex | Định dạng mới |
| `docs/features/FEAT-2026-163-*.md` | Mới | Hợp đồng này |

## 7. Acceptance criteria

- [x] AC-01: Không còn marker xung đột; 3 script inline parse OK; `office-nav.test.mjs` pass toàn bộ (42).
- [x] AC-02: Chức năng master giữ nguyên trong trình duyệt: nút "Tùy chỉnh", kéo mở rộng sàn nâu + đèn tự động, vẽ/xoá tường, đặt cửa gỗ/kính/cửa sổ, nội thất, giữ O xoay, Undo/Redo.
- [x] AC-03: Chức năng FEAT-158..162 trong trình duyệt: công cụ Bàn (đặt, từ chối có lý do, R xoay, Delete, phím B), ghost cửa hợp lệ/đỏ, khoá/mở cửa ảnh hưởng đồ thị, lá cửa tự mở khi agent đi qua, Undo/Redo gồm bàn.
- [x] AC-04: Giao task in_progress cho agent → agent rời phòng nghỉ, đi bằng planRoute qua cửa, ngồi đúng bàn, trạng thái `working`; 0 mẫu vị trí trong ô tường; 9 agent cùng lúc đều tới bàn.
- [x] AC-05: Trang ở cổng 5000/5002 đọc trạng thái thật qua `office-status` (công ty ATL thật, không dùng id cứng).
- [x] AC-06: "Tuỳ chỉnh team" hiện danh sách agent Paperclip khi server chạy; agent tạo từ danh sách nhận task giao cho id của nó, agent lõi trùng tên không nhận task đó.
- [x] AC-07: Mất API → huy hiệu báo mất kết nối, agent giữ trạng thái cục bộ.
- [x] AC-08: Nút Hoàn tác enable sau khi đặt bàn. 0 lỗi console khi tải trang.
- [x] AC-09: FurniMesh: route `/furnimesh` và mục sidebar có mặt; bộ nhận postMessage kiểm tra origin có mặt.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp | parse 3 script inline bằng `new Function` | OK 3 ERR 0 |
| Logic nav | `node scripts/tests/office-nav.test.mjs` | 42 pass, 0 fail |
| Endpoint | `curl` có/không có Origin loopback | 200 + ACAO đúng origin; origin lạ không có ACAO |
| Trình duyệt | Chrome MCP, server 5002 từ worktree, tua mô phỏng bước 0,05 s | AC-02..08 |
| Server | Vitest liên quan atelier | pass |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Hai hệ animation cửa đánh nhau | Chỉ FEAT161 điều khiển lá cửa; `slidingLeaves` để trống |
| Opening không vừa tường (master ẩn) nhưng đồ thị nav vẫn coi là cửa | Ghi chú giới hạn; validate FEAT158 + fit master khi đặt mới |
| Lộ dữ liệu task qua CORS | Chỉ origin loopback, chỉ GET, chỉ trường cần thiết |

Rollback point và cách rollback: không đụng `master`; xoá nhánh `feat/agent-company-merge`. Bản master chưa commit được lưu ở `wip/master-uncommitted-20261123`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude Code theo chỉ thị người dùng (phương án A)
- Thời điểm: 2026-11-23

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Ngày | Nội dung | Lý do | Tác động | Chấp thuận |
|---|---|---|---|---|---|
| CR-1 | 2026-11-23 | Test FEAT-162 AC-05 (kiểm tra chuỗi guard `apiOk`) chấp nhận thêm dạng `if (apiOk) { … AGENT_MAPPINGS.forEach`. | Vòng ánh xạ agent được viết lại để ưu tiên agent tuỳ chỉnh liên kết id; logic guard không đổi. | Chỉ `scripts/tests/office-nav.test.mjs`; hành vi FEAT-162 giữ nguyên. | Trong phạm vi "không lỗi chức năng" người dùng duyệt |
| CR-2 | 2026-11-23 | Sửa kẹt cửa vĩnh viễn trong `OfficeNav.move.arbitrate` (CORE FEAT-161): agent đang xin qua cửa mà đứng trong khung được giao lượt ngay. Thêm test `163 CR-2`. | Phát hiện trong trình duyệt: đổi task khi agent đang trong khung cửa → `busy` luôn true, `holder` luôn null, 6 agent chờ mãi (tái hiện bằng test Node, có cả trên nhánh `feat/office-navigation` gốc). | Chỉ nhánh phân lượt khi có người xin trong khung; các chỉ số sim6/rand90/core9 không đổi. | Trong phạm vi "không lỗi chức năng" người dùng duyệt |

## 12. Verification evidence

Ngày 2026-11-23, worktree `qldapm_fina_wt_merge`, Paperclip chạy từ worktree tại 3100, trang phục vụ ở `http://127.0.0.1:5002/`.

| Kiểm tra | Kết quả |
|---|---|
| Parse 3 script inline (`new Function`) | OK 3, ERR 0 |
| `node scripts/tests/office-nav.test.mjs` | 43 pass, 0 fail (42 cũ + `163 CR-2`); sim6/rand90/core9 không đổi so với nhánh gốc |
| Vitest `server/src/__tests__/atelier-workflow-builder.test.ts` | 6/6 pass |
| Vitest `packages/furnimesh-mcp` | 6/6 pass |
| Pytest `tests/test_asset_pipeline.py tests/test_pascal_scene_asset_bridge.py` | 8 passed |
| `tsc --noEmit` server | không có lỗi mới ở route `office-status` (2436 lỗi có sẵn, ngoài phạm vi) |
| `GET /api/atelier/office-status` Origin `http://127.0.0.1:5002` / `http://localhost:5000` | 200, `Access-Control-Allow-Origin` = đúng origin; Origin `https://evil.example` không có ACAO |
| Trang đọc dữ liệu thật | company `b2e1c8a5…` (ATL), dự án "Căn hộ Studio Phòng Khách 4×5m — Japandi Minh Họa", "⚡ ĐANG CHẠY (7 TASK)", "26 hoàn thành", agent mang mã task thật |
| AC-02 master (trình duyệt, sự kiện chuột thật) | mở rộng sàn +120 ô, +6 đèn, sàn gộp 1 mesh; đặt nội thất; vẽ + xoá tường; giữ O xoay bật/tắt |
| AC-03 FEAT-158..162 | Bàn: đặt "Bàn D1 · Phòng 5", từ chối "Chồng lên tường", Ctrl+Z/Ctrl+Y; cửa gỗ: ghost "Vị trí hợp lệ", đặt được, chồng cửa bị từ chối; Khoá/Mở khoá → đồ thị `open=false`, world `locked=true`; 7 cửa mặc định không trùng, 7 lá cửa do FEAT161 điều khiển |
| AC-04 (tua mô phỏng bước 0,05 s vì cửa sổ test bị Chrome giới hạn ~1,3 fps ở cả 5000/5001/5002) | 1 agent: tới bàn Phòng 3 sau 17,55 s, 0 ô tường, ~1,24 m/s; 9 agent cùng lúc: tất cả `working` tại bàn sau 51,5 s, 0 ô tường; đổi task 8 lần giữa đường: không kẹt, tất cả về bàn |
| AC-06 | danh sách 10 agent Paperclip; agent tạo từ "Product & Sourcing Researcher" lưu `paperclipAgentId`, nhận ATL-TEST9 và về Bàn D2 làm việc; agent lõi "Research Agent" không nhận; option đã liên kết bị disable |
| AC-07 | mất API: huy hiệu "⚠️ MẤT KẾT NỐI PAPERCLIP", agent giữ trạng thái |
| AC-08 | `fp2Snapshot` gọi `refreshStatus` → nút Hoàn tác bật sau khi đặt bàn; 0 lỗi console khi tải |
| AC-09 | route `/furnimesh` trong `App.tsx`, mục sidebar, `FURNIMESH_TRUSTED_ORIGINS` có trong trang |

Giới hạn còn lại:
- Một lần đo thấy khoảng cách hai agent = 0 m trong lượt 9 agent đầu tiên; chạy lại 5 lượt (gồm đổi task giữa đường) không tái hiện.
- Agent lõi trùng tên với agent Paperclip đã được agent tuỳ chỉnh liên kết sẽ không còn nhận trạng thái từ Paperclip (giữ trạng thái cuối).
- Opening không vừa tường (master ẩn khi vẽ) vẫn được đồ thị điều hướng tính là cửa.
- Số hiệu FEAT-2026-155..157 bị dùng hai lần (FurniMesh và sàn/đèn).
- Nút "Gửi chỉ thị" chỉ hiển thị lời thoại, không tạo task (như master).
