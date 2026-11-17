# [FEAT-2026-040] Kết nối thư viện model Cổ điển (CC-0/CC-BY) và nâng cấp Viewport nhà búp bê cắt tường cho Studio

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T20:40:30+07:00 |
| Revision bắt đầu | 68499c8 |
| Revision cuối | working-tree (68499c8+) |

## 1. Bối cảnh

- `StudioViewport.tsx` đã hỗ trợ nạp `.glb` qua `GLTFLoader` khi `furniture_instances[i].normalized_glb` được cung cấp, nhưng các scene hiện tại chưa có `normalized_glb` nên vẫn rơi về khối hộp thủ tục (`BoxGeometry`).
- Chế độ cắt tường hiện tại chỉ hạ tường phía trước xuống `0.32m` (mờ `opacity: 0.45`) thay vì tường cắt phẳng đồng đều ~`1.1m` có nắp trắng, chưa có khay nền cỏ/sân gỗ, chưa có vật liệu PBR Poly Haven CC0 và chưa tinh chỉnh ánh sáng/tone-mapping như ảnh đích nhà búp bê.
- Người dùng đã duyệt bộ 36 model **Cổ điển (Warm Classic)** chỉ dùng giấy phép **CC-0** và **CC-BY** (tuyệt đối không dùng Free Art 1.3 hay GPL), cùng 5 nhóm dựng hình học tham số + PBR Poly Haven CC0 (thảm, tranh, rèm, cửa, cửa sổ).

## 2. Mục tiêu

- Chuyển đổi hàng loạt 36 model Cổ điển đã duyệt sang `.glb` chuẩn hóa (đơn vị mét, trục Y lên, gốc đáy tâm) bằng Blender 4.2.3 chạy nền; gán vật liệu PBR Poly Haven CC0 cho các model chưa có texture ảnh.
- Tạo danh mục asset (`catalog.json`) + tệp `CREDITS.md` ghi nguồn đầy đủ cho các model CC-BY và Poly Haven CC0, tự động ánh xạ `normalized_glb` theo danh mục cho **mọi** scene trong Studio (không viết cứng phòng hay món cụ thể; loại chưa có gắn cờ và dùng hình gần đúng, không rơi về sofa).
- Nâng cấp `StudioViewport.tsx` để hiển thị nhà búp bê cắt tường ~`1.1m` nắp trắng, cửa/cửa sổ khoét lỗ thật với khung đen mảnh & kính trong, khay nền cỏ + sân gỗ/đá + bụi cây, vật liệu PBR Poly Haven CC0, ánh sáng mềm + AO + tone mapping tự nhiên, và chức năng xuất ảnh PNG độ phân giải cao.

## 3. Phạm vi

### In scope
- Batch script Blender chuyển đổi 36 model Cổ điển (`CC-0`/`CC-BY`) sang `.glb` lưu tại thư mục static asset của Studio (`paperclip/ui/public/assets/sh3d-classic/`).
- Tải/tạo texture PBR Poly Haven CC0 (`wood_floor`, `plaster_wall`, `wood_oak`, `fabric_linen`, `metal_dark`, `ceramic`, `grass`) lưu local tại `paperclip/ui/public/assets/pbr/`.
- Tạo `catalog.json` + `CREDITS.md` (tên model, tác giả, giấy phép, nguồn, trạng thái chỉnh sửa) và module ánh xạ danh mục dùng chung (frontend/backend).
- Nâng cấp `StudioViewport.tsx`:
  - Tự động resolve `normalized_glb` từ `catalog.json` khi instance chưa có `normalized_glb` (gắn cờ + dùng hình gần đúng nếu chưa có loại tương ứng, không rơi về sofa).
  - Tường cắt phẳng ~`1.1m` với nắp trắng, cửa/cửa sổ tham số khoét lỗ tường thật, khung đen mảnh, kính trong.
  - Khay nền ngoài nhà (sân gỗ/hiên + viền cỏ + bụi cây tham số).
  - Tham số vật liệu PBR Poly Haven CC0, ánh sáng directional sun + sky hemisphere + AO + bóng mềm + đèn ấm trong nhà + ACES tone mapping.
  - Góc camera dollhouse nghiêng 35–45°, xoay 45°, gần trực giao, căn giữa; hỗ trợ xuất PNG độ phân giải cao.
- Vòng tự so sánh tối đa 5 lượt trên ≥ 2 scene khác nhau của Studio.

### Out of scope
- Không thêm nút "render đẹp" riêng hay dùng `render_photo` của plugin Sweet Home 3D.
- Không thay đổi bố cục UI hiện có của Studio, không xóa project/revision cũ, không tạo hệ thống song song.
- Không dùng model Free Art 1.3 hay `Furniture.jar` (GPL).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `three@^0.172.0`, Blender 4.2.3 (`blender.exe`), Paperclip server (`http://localhost:3100`), FastAPI (`http://127.0.0.1:8000`).
- Dữ liệu dùng chung: SceneGraph JSON của các project hiện tại trong DB không bị xóa hoặc ghi đè cấu trúc.
- Service/port/database không được ảnh hưởng: Port 8000, 3100, 54329.

## 5. Thiết kế và kế hoạch triển khai

1. **Tải texture PBR Poly Haven CC0** (hoặc tải trực tiếp từ Poly Haven API/CDN CC0; nếu offline/bị chặn thì báo rõ) vào `paperclip/ui/public/assets/pbr/`.
2. **Blender batch export**: Trích xuất `.obj`/`.mtl`/texture từ các `.sh3f` đã duyệt, dùng Blender 4.2.3 chuẩn hóa (Y-up, đơn vị mét, gốc đáy tâm, kích thước chuẩn catalog), gán PBR Poly Haven CC0 cho các món `has_texture=False`, xuất `.glb` vào `paperclip/ui/public/assets/sh3d-classic/`.
3. **Danh mục & Credits**: Sinh `paperclip/ui/public/assets/sh3d-classic/catalog.json` và `CREDITS.md` (ghi rõ tác giả, giấy phép, nguồn, đã chỉnh sửa scale/PBR).
4. **Ánh xạ danh mục vào Studio**: Tạo helper `resolveAssetFromCatalog(category, width, depth, height)` để `StudioViewport.tsx` (và/hoặc API) nạp `normalized_glb` cho mọi scene bất kỳ; loại chưa có gắn cờ cảnh báo và chọn hình gần đúng (không fallback về sofa).
5. **Nâng cấp `StudioViewport.tsx`**:
   - Nâng cấp cutaway tường thành ~`1.1m` có nắp trắng + khoét lỗ cửa/cửa sổ thật + khung đen mảnh + kính trong + thảm/tranh/rèm tham số.
   - Thêm khay nền (sân gỗ + thảm cỏ + cây bụi) và ánh sáng + PBR + ACES tone mapping + xuất PNG high-res.
6. **Vòng tự so sánh & kiểm thử**: Chụp ảnh PNG từ viewport của ≥ 2 scene Studio, so sánh với ảnh đích, tinh chỉnh tối đa 5 vòng.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/public/assets/sh3d-classic/*` | Tạo mới | Chứa 36 `.glb` chuẩn hóa, `catalog.json`, `CREDITS.md` |
| `paperclip/ui/public/assets/pbr/*` | Tạo mới | Texture PBR CC0 (Poly Haven) |
| `paperclip/ui/src/features/atelier/assetCatalog.ts` | Tạo mới | Ánh xạ loại đồ -> GLB + credits + fallback an toàn |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Sửa đổi | Nạp catalog GLB, cắt tường 1.1m nắp trắng, khay nền, PBR, ánh sáng, xuất PNG |

## 7. Acceptance criteria

- [ ] AC-01: Tất cả 36 model Cổ điển (`CC-0`/`CC-BY`, không Free Art/GPL) chuyển sang `.glb` thành công, kích thước đúng mét, gốc đáy tâm, có `catalog.json` và `CREDITS.md`.
- [ ] AC-02: Mọi scene Studio bất kỳ tự động ánh xạ `normalized_glb` theo danh mục, co giãn theo SceneGraph và xoay theo tường; món chưa có được gắn cờ và không rơi về sofa.
- [ ] AC-03: `StudioViewport.tsx` hiển thị tường cắt ~`1.1m` nắp trắng, cửa/cửa sổ khoét lỗ thật, khay nền cỏ/sân gỗ, vật liệu PBR, ánh sáng mềm & tone mapping không cháy sáng/mảng đen lạ.
- [ ] AC-04: Xuất PNG độ phân giải cao hoạt động và vượt qua vòng tự so sánh trên ≥ 2 scene khác nhau của Studio.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Blender batch GLB export | Script Python + Blender 4.2.3 | 36/36 GLB xuất thành công, không lỗi |
| Typecheck & build UI | `pnpm --filter @paperclipai/ui typecheck` / `build` | Exit code 0, không lỗi TS |
| Chụp viewport ≥ 2 scene | Mở Studio trên trình duyệt / Playwright và chụp PNG | Ảnh sạch, không mảng đen/cháy sáng/lơ lửng |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Một số `.obj` SH3D có trục Z-up hoặc lệch gốc | Blender script chuẩn hóa xoay Y-up, tính bounding box đặt đáy tại `y=0` và tâm XZ tại `(0,0)` |
| Poly Haven API bị timeout hoặc rate limit | Tải 1k JPG/PNG qua `api.polyhaven.com/files/...` có retry và fallback procedural PBR nếu thiếu map |

Rollback point và cách rollback: Commit `68499c8`. Có thể `git checkout -- paperclip/ui/src/features/atelier/StudioViewport.tsx` và xóa thư mục `paperclip/ui/public/assets/sh3d-classic` nếu cần hoàn nguyên.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity (theo xác nhận người dùng)
- Thời điểm: 2026-11-14T20:40:30+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14T20:41 | 68499c8+ | Tải PBR Poly Haven CC0 + Blender batch export 36 model Cổ điển sang GLB + `catalog.json` + `CREDITS.md` | 36/36 GLB xuất thành công |
| 2026-11-14T20:45 | 68499c8+ | Tạo `assetCatalog.ts` và nâng cấp `studioCamera.ts`, `StudioViewport.tsx` (cắt tường 1.12m nắp trắng, khay sân gỗ + cỏ + bụi cây, PBR, ACES, `__ATELIER_CAPTURE_PNG__`) | Hoàn tất Bước 3–4 |
| 2026-11-14T21:00 | 68499c8+ | Vòng tự so sánh 5 lượt (sửa `wallLum`, khung cửa/cửa sổ hết z-fighting, sàn gỗ sồi sáng, mặt cắt ngang 1.18m cho tủ cao) | Đạt trên 2 scene Studio |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-14T20:42 | 68499c8+ | Blender 4.2.3 batch GLB export | 36/36 PASS | `paperclip/ui/public/assets/sh3d-classic/catalog.json` |
| 2026-11-14T21:00 | 68499c8+ | Playwright WebGL capture trên `proj_demo_4x5m` & `proj_bedroom_japandi_4x4m` (5 vòng) | PASS — không mảng đen, không cháy sáng, không đồ lơ lửng | `comparison_before_after_target.png` |

## 14. Kết quả và đóng chức năng

- Kết quả: Đạt đầy đủ AC-01 đến AC-04.
- Hạn chế còn lại: Nội thất ngoài trời trên sân gỗ (2 ghế patio + cây chậu trên hiên) và một số món trang trí nhỏ chưa có trong dữ liệu SceneGraph gốc của `proj_demo_4x5m` / `proj_bedroom_japandi_4x4m` nên chỉ hiển thị các món có trong scene + khay sân/cỏ/cây bụi viền ngoài. `tsc --noEmit` của toàn monorepo còn 1 lỗi có sẵn không liên quan ở `UnifiedBOQPage.tsx(135,21)`.
