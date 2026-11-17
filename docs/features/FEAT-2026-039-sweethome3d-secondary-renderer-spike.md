# [FEAT-2026-039] Thử nghiệm Sweet Home 3D làm renderer thứ hai

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex / Antigravity |
| Người chấp thuận | User request 2026-11-14 |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T19:03:00+07:00 |
| Revision bắt đầu | 95c2db708d3e4eea8b12a26b7dedd36c4de63c57 |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Studio hiện dùng Pascal/Three.js và Blender Cycles. Cần đánh giá Sweet Home 3D
như renderer thử nghiệm thứ hai mà không đổi UI, project, revision hoặc dựng một
hệ thống production song song. Upstream xác nhận Sweet Home 3D là GPL-2.0-or-later;
plugin `grimashevich/sweethome3d-mcp-server` 1.2.0 là GPL-2.0 và cung cấp MCP HTTP
trên loopback với lệnh tạo scene, lưu `.sh3d`, xuất OBJ và `render_photo`.

## 2. Mục tiêu

Chứng minh adapter dùng chung có thể đọc ít nhất hai scene Studio, chuyển đổi
tường/cửa/cửa sổ/nội thất theo đơn vị và tọa độ, lưu `.sh3d` + OBJ, tạo ba ảnh
Sunflow cho mỗi scene và lập báo cáo so sánh với render Blender hiện có.

## 3. Phạm vi

### In scope

- Cài Sweet Home 3D bản standalone >=6.0 và MCP plugin 1.2.0 trên máy local.
- Adapter thử nghiệm Studio JSON -> Sweet Home 3D MCP, không hardcode project.
- Registry ghép category Studio với catalog item theo từ khóa/loại; fallback có
  cờ `approximate`, tuyệt đối không mặc định sofa.
- Manifest model gồm catalog identity, source và license/provenance.
- Chạy hai scene, ba camera mỗi scene, lưu `.sh3d`, OBJ, ảnh và timings.
- Báo rõ khả năng MCP của Codex hiện tại và fallback OBJ/manual import.

### Out of scope

- Không thay Studio UI/API contract hoặc renderer Blender mặc định.
- Không tạo project/revision/task Studio mới và không ghi ngược scene.
- Không chạy dịch vụ Sweet Home 3D thường trú sau spike.
- Không cam kết chất lượng photoreal production hoặc đồng nhất vật liệu PBR.
- Không tải model không rõ giấy phép.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Sweet Home 3D standalone, Java bundled, MCP plugin 1.2.0, Sunflow.
- Dữ liệu dùng chung: project/revision Studio chỉ đọc; render gallery Blender chỉ đọc.
- Service/port/database không được ảnh hưởng: 3100, 8000 và PostgreSQL 54329 giữ nguyên;
  MCP chỉ bind `127.0.0.1:9877` trong lúc thử nghiệm.
- Dirty worktree không reset/stash/clean; artifacts vào thư mục export riêng.

## 5. Thiết kế và kế hoạch triển khai

1. Cài bản upstream chính thức, kiểm tra version/hash/license; cài `.sh3p` release.
2. Viết MCP HTTP client có initialize/session/tools-call, timeout và lỗi rõ ràng.
3. Chuẩn hóa Studio scene thành rooms/walls/openings/furniture theo mm; đổi sang cm
   (x sang phải, y xuống dưới) khi gọi Sweet Home 3D.
4. Resolve catalog bằng category aliases; cửa/cửa sổ dùng model opening; nội thất
   thiếu model dùng shape/category gần nhất và ghi `approximate=true`.
5. Batch tạo scene, xác minh state/count/dimensions, lưu home và export OBJ.
6. Render overhead, entrance và hero close-up; ghi duration, resolution, output hash.
7. Chạy hai project khác nhau và so sánh màu, sáng, thời gian với Blender hiện có.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/services/sweethome3d_bridge.py` | adapter thử nghiệm | Convert scene và gọi MCP |
| `apps/api/scripts/run_sweethome3d_spike.py` | CLI | Chạy scene bất kỳ, không gắn UI |
| `tests/test_sweethome3d_bridge.py` | unit tests | Units, mapping, fallback, payloads |
| `data/exports/sweethome3d-spike/` | generated artifacts | `.sh3d`, OBJ, ảnh, manifests/report |
| `NOTICE` | attribution | Ghi upstream/license, không copy source |

## 7. Acceptance criteria

- [ ] AC-01: Sweet Home 3D và plugin báo đúng version/license; health MCP đạt.
- [ ] AC-02: Converter không chứa project ID, room dimensions hoặc furniture ID cố định.
- [ ] AC-03: Hai scene chuyển đổi đủ wall/opening/furniture, sai số đơn vị <=10 mm.
- [ ] AC-04: Không category nào rơi về sofa; fallback được gắn cờ và có lý do.
- [ ] AC-05: Mỗi model dùng có catalog identity và license/provenance trong manifest.
- [ ] AC-06: Mỗi scene có `.sh3d`, OBJ và ba ảnh render độ phân giải cao.
- [ ] AC-07: Báo cáo so sánh Sweet Home 3D/Blender có màu, ánh sáng, thời gian.
- [ ] AC-08: Studio/project/revision cũ không đổi; không có service SH3D thường trú sau test.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit | `pytest tests/test_sweethome3d_bridge.py` | Mapping/units/fallback PASS |
| Install | executable version + plugin `/health` | Version >=6, plugin 1.2.0 healthy |
| Scene state | MCP `get_state` after conversion | Counts/dimensions match manifest |
| Artifact | load/save/export + SHA-256 | Files exist and non-empty |
| Render | 3 `render_photo` calls per scene | Six images valid, timings recorded |
| Regression | project/revision hashes before/after | No Studio mutation |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Installer/plugin không tương thích | Dùng standalone upstream; fallback OBJ/manual import |
| Catalog item khác theo locale/version | Resolve theo category/name, lưu chosen item, flag approximate |
| MCP không callable từ host agent | Dùng HTTP client local theo protocol; không khai MCP giả |
| Sunflow chậm hoặc treo | Timeout theo render, chạy tuần tự, giữ Blender làm chuẩn |
| GPL ảnh hưởng codebase | Không copy source/plugin vào repo; chỉ attribution và adapter độc lập |

Rollback point và cách rollback: xóa adapter/artifacts theo danh sách rõ ràng, gỡ `.sh3p`
và Sweet Home 3D bằng uninstaller; Studio/Blender/database không cần rollback.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của user.
- Thời điểm: 2026-11-14T01:45:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua Change Log.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-14T19:03:00+07:00 | Khắc phục lỗi ảnh đen Sunflow (`-Duser.timezone=Asia/Bangkok` + quản lý `ceilingVisible` + đèn `HomeLight`), mở rộng converter tổng quát từ Studio SceneGraph sang Sweet Home 3D (sàn gỗ, màu tường, vật liệu riêng từng món, đèn trần/đèn bàn, decor thư viện: thảm, cây, tranh, rèm, sách; độ phân giải ≥1920×1080, chất lượng cao, ≥3 góc camera tự động). | User yêu cầu tìm đúng nguyên nhân ảnh đen (Bước 1–2) và nâng cấp bộ chuyển đổi/thiết lập thẩm mỹ cho mọi scene Studio (Bước 3–4). | Chỉ sửa `apps/api/app/services/sweethome3d_bridge.py`, `apps/api/scripts/run_sweethome3d_spike.py`, `tests/test_sweethome3d_bridge.py`, và artifacts trong `data/exports/sweethome3d-spike/`. Không đụng UI/DB Studio. | User request 2026-11-14 | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14T01:45:00+07:00 | 95c2db7 | Contract frozen | Chưa cài hoặc sửa implementation |
| 2026-11-14T12:xx:00+07:00 | Worktree chưa commit | Cài Sweet Home 3D 7.5 và plugin MCP 1.2.0; thêm bridge, CLI và tests | Studio/database không bị ghi |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| | | | | |
| 2026-11-14 | Worktree chưa commit | Cài và health | PASS | Sweet Home 3D 7.5; plugin MCP 1.2.0 trả `/health={status:ok}` |
| 2026-11-14 | Worktree chưa commit | Unit | PASS | `pytest -q tests/test_sweethome3d_bridge.py`: 5 passed |
| 2026-11-14 | Worktree chưa commit | Conversion | PASS | Hai scene đọc theo API và tạo được `.sh3d` + OBJ ZIP; không có Studio write |
| 2026-11-14 | Worktree chưa commit | Render | FAIL / plugin limitation | Sáu PNG 1600×1200 từ lượt cuối có cùng SHA-256, là ảnh đen; không đạt AC-06/07 |

## 14. Kết quả và đóng chức năng

- Kết quả: PARTIAL — adapter/export đạt, renderer ảnh chưa đạt.
- Hạn chế còn lại: Sweet Home 3D MCP 1.2.0 `render_photo` phát ảnh đen lặp lại khi chạy batch local; backend Studio 8000 đã dừng sau thử nghiệm nên chưa lấy lại được bảng so sánh timing Blender qua API.
- Việc chưa hoàn tất: AC-06, AC-07; cần sửa hoặc thay thế đường `render_photo` trước khi cân nhắc renderer này cho Studio.
- Rollback point: `95c2db708d3e4eea8b12a26b7dedd36c4de63c57`
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
