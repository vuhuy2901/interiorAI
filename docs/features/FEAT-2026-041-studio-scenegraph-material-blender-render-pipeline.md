# [FEAT-2026-041] Luồng khép kín SceneGraph → Dựng 3D đa phần & Validator → Chọn vật liệu PBR → Render Blender Cycles nền

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.2 |
| Owner | Antigravity |
| Người chấp thuận | User |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14T21:10:00+07:00 |
| Revision bắt đầu | 68499c8 |
| Revision cuối | Chưa có |

## 1. Bối cảnh

- `StudioViewport.tsx` đã nạp được bộ 36 model GLB Cổ điển (`CC-0`/`CC-BY`) và dựng nhà búp bê cắt tường `1.12 m`, nhưng:
  1. Sàn hiện tại vẫn dùng `BoxGeometry` theo hộp bao (`roomW × roomD`) thay vì dựng đúng đa giác phòng (`polygon_mm`); các vật thể nhiều phần (đảo bếp, tủ bếp, giường tầng, cầu thang) chưa tách thành các phần có tên (`countertop`, `body`, `doors`, `legs`, `steps`, `frame`, `mattress`) để gán vật liệu riêng; chưa có Validator kiểm tra hình học trước khi dựng.
  2. `ObjectInspector.tsx` hiện đang ủy quyền chọn vật liệu cho AI Copilot thay vì cho phép người dùng bấm trực tiếp vào sàn, tường (mặt trong/ngoài), món đồ hoặc từng phần của món đồ để chọn vật liệu PBR cùng loại bề mặt, áp dụng hàng loạt theo loại, hoặc chọn bộ preset phong cách (`Japandi`, `Modern Minimalist`, `Warm Classic`).
  3. `render_engine.py` hiện tại chỉ vẽ ảnh 2D schematic bằng PIL, chưa có job nền Blender Cycles đọc trực tiếp SceneGraph + vật liệu đã chọn để kết xuất ảnh 3D đúng 100% vật liệu với 2 camera preset (nhà búp bê cắt tường nền trong suốt & góc mắt người 1,4–1,6 m ống kính 24–28 mm), ánh sáng GI + AgX + denoise, lưu metadata + thư viện ảnh dự án + trang Credits tự sinh.

## 2. Mục tiêu

- **Phần 1:** Hoàn thiện dựng mẫu 3D trong `StudioViewport.tsx` (sàn đa giác thật `polygon_mm`, tường có độ dày + lỗ cửa/cửa sổ thật, tách phần có tên cho vật thể nhiều phần, loại bỏ hoàn toàn hộp mặc định vô danh, chạy Validator trước khi dựng và báo lỗi rõ).
- **Phần 2:** Danh mục vật liệu PBR CC0 (`floor`, `wall`, `wood`, `stone`, `fabric`, `metal`, `glass`, `tile`), lưu gán vật liệu theo phần tử & từng phần vào `SceneGraph` + revision, giao diện chọn vật liệu trực tiếp trong `ObjectInspector.tsx` (cập nhật viewport tức thì, nút "Áp dụng cho tất cả phần tử cùng loại", 3 bộ preset phong cách).
- **Phần 3:** Nút "Render" và hệ thống job nền Blender Cycles (`queued` → `running` → `completed` / `failed`), tái tạo đúng SceneGraph + model GLB/tham số + vật liệu PBR đã chọn, hỗ trợ 2 camera preset (`dollhouse` nền trong suốt & `eye_level` 1.4–1.6m lens 24–28mm), Cycles GI + AgX + denoise, lưu PNG + metadata + thư viện ảnh + trang Credits tự sinh.
- **Phần 4:** Tự kiểm tra đổi 1 vật liệu (sàn gỗ → gạch), chạy trên ≥ 2 scene × 2 bộ vật liệu, vòng tự so sánh tối đa 5 lượt, và test tự động (gán → lưu → mở lại → render).

## 3. Phạm vi

### In scope
- **Phần 1:**
  - `paperclip/ui/src/features/atelier/sceneValidator.ts`: Kiểm tra trước khi dựng (vật ngoài đa giác phòng, giao cắt/chồng nhau trừ tiếp xúc hợp lệ, chiều cao hợp lý theo loại, cửa/cửa sổ thuộc đúng tường).
  - `paperclip/ui/src/features/atelier/StudioViewport.tsx` & `assetCatalog.ts`: Sàn dựng bằng `THREE.Shape` + `ExtrudeGeometry` theo đúng `polygon_mm`; tách các phần có tên (`countertop`, `body`, `doors`, `legs`, `frame`, `mattress`, `steps`) cho đảo bếp, tủ bếp, giường tầng, cầu thang và gắn `userData.partName` cho từng submesh của GLB; loại bỏ hoàn toàn fallback hộp mặc định.
- **Phần 2:**
  - `paperclip/ui/public/assets/pbr/pbr_catalog.json` & `paperclip/ui/src/features/atelier/pbrCatalog.ts`: Danh mục vật liệu PBR CC0 đầy đủ (`id`, `name`, `surface_type`, `textures`, `repeat_scale_m`, `base_color`, `source`, `license`).
  - `paperclip/ui/src/features/atelier/ObjectInspector.tsx` & `AtelierDesignStudioPage.tsx`: Giao diện chọn vật liệu trực tiếp cho sàn, tường (mặt trong/ngoài), món nội thất & từng phần của món; nút "Áp dụng cho tất cả phần tử cùng loại"; bộ preset phong cách (`Japandi`, `Modern Minimalist`, `Warm Classic`); lưu vào `SceneGraph` (`surface_material_overrides`, `wall.face_a_material_id`/`face_b_material_id`, `furniture.part_materials`) theo revision.
- **Phần 3:**
  - `apps/api/app/services/blender_cycles_renderer.py` & `apps/api/app/main.py`: Job nền Blender 4.2.3 Cycles headless đọc `SceneGraph` + `pbr_catalog.json` + `sh3d-classic/catalog.json`, hỗ trợ camera `dollhouse` (nghiêng 40°, xoay 45°, cắt tường 1.12m, nền trong suốt + nền khay) và `eye_level` (cao 1.5m, tiêu cự 26mm), AgX tone mapping, denoise, xuất PNG + metadata JSON + `CREDITS.md` vào thư viện ảnh dự án.
  - Giao diện nút "Render" & trạng thái job + thư viện ảnh kết xuất + modal/trang Credits trong Studio.
- **Phần 4:**
  - Script test tự động + chụp kiểm chứng 2 scene × 2 bộ vật liệu + test đổi riêng sàn gỗ → gạch.

### Out of scope
- Không thay đổi bố cục tổng thể của Studio ngoài khu vực chọn vật liệu/Render trong thanh công cụ & Inspector; không xóa project/revision cũ.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Blender 4.2.3 (`blender.exe`), Three.js `0.172.0`, FastAPI (`127.0.0.1:8000`), Vite UI (`localhost:5173`).
- Dữ liệu dùng chung: Bảo toàn toàn bộ project và revision hiện có trong SQLite/JSON.

## 5. Thiết kế và kế hoạch triển khai

1. **Phần 1:** Viết `sceneValidator.ts`, nâng cấp `StudioViewport.tsx` (sàn đa giác `ExtrudeGeometry`, vật thể nhiều phần có tên `partName`, click chọn phần tử + phần con, hiển thị kết quả Validator), chụp ảnh minh họa và báo cáo Phần 1.
2. **Phần 2:** Tạo `pbr_catalog.json` + `pbrCatalog.ts` (đầy đủ 8 nhóm bề mặt CC0), nâng cấp `ObjectInspector.tsx` để bấm chọn phần tử/phần con → đổi vật liệu tức thì + áp dụng hàng loạt + chọn preset phong cách (`Japandi`, `Modern Minimalist`, `Warm Classic`) + lưu theo revision, chụp ảnh minh họa và báo cáo Phần 2.
3. **Phần 3:** Xây dựng `blender_cycles_renderer.py` + API `/api/v1/projects/{id}/render-jobs` + UI nút "Render" & thư viện ảnh + trang Credits tự sinh, chạy render thực tế và báo cáo Phần 3.
4. **Phần 4:** Chạy kiểm thử tự động đổi 1 vật liệu (sàn gỗ → gạch), chạy 2 scene × 2 bộ vật liệu, vòng tự so sánh và báo cáo Phần 4.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/sceneValidator.ts` | Tạo mới | Validator kiểm tra hình học trước khi dựng |
| `paperclip/ui/src/features/atelier/pbrCatalog.ts` | Tạo mới | Danh mục vật liệu PBR CC0 & bộ preset phong cách |
| `paperclip/ui/public/assets/pbr/pbr_catalog.json` | Tạo mới | File danh mục vật liệu PBR dùng chung cho Viewport & Blender |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Sửa đổi | Sàn đa giác, tách phần vật thể, cập nhật PBR theo phần, hiển thị Validator |
| `paperclip/ui/src/features/atelier/ObjectInspector.tsx` | Sửa đổi | Giao diện chọn vật liệu theo bề mặt/phần tử/phần con, preset, nút Render & Credits |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Sửa đổi | Kết nối lưu gán vật liệu vào SceneGraph/revision và gọi Render job |
| `apps/api/app/services/blender_cycles_renderer.py` | Tạo mới | Bộ cầu nối catalog 3D (`sh3d-classic`) + vật liệu PBR (`pbr_catalog.json`) + trang Credits tự sinh cho Blender Cycles |
| `apps/api/app/services/blender_mcp.py` | Sửa đổi | Tích hợp `blender_cycles_renderer.py` vào hàng đợi job nền Blender Cycles (`dollhouse` nền trong suốt & `eye_level`, metadata JSON) |
| `apps/api/app/models/contracts.py` | Sửa đổi | Bổ sung `part_materials` cho `FurnitureInstance` và `active_style_preset` cho `CanonicalProject` |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Sửa đổi | Lưu trạng thái `selectedPartName` và các hàm cập nhật vật liệu PBR theo phần tử/loại/preset |
| `apps/api/app/main.py` | Sửa đổi | Endpoint tạo/tra cứu Render job, thư viện ảnh và Credits |

## 7. Acceptance criteria

- [ ] AC-01 (Phần 1): Sàn dựng đúng đa giác `polygon_mm`, vật thể nhiều phần tách submesh có tên (`countertop`, `body`, `doors`, `legs`, `frame`, `mattress`, `steps`), hết hộp mặc định, Validator phát hiện và báo rõ lỗi trước khi dựng.
- [ ] AC-02 (Phần 2): Danh mục vật liệu PBR CC0 đủ 8 loại bề mặt; chọn vật liệu cho sàn, tường (trong/ngoài), từng phần của món đồ cập nhật ngay trên viewport, có áp dụng hàng loạt & bộ preset phong cách, lưu theo revision.
- [ ] AC-03 (Phần 3): Job nền Blender Cycles render đúng 100% vật liệu đã chọn, hỗ trợ camera `dollhouse` (kèm nền trong suốt) & `eye_level`, GI + AgX + denoise, lưu PNG + metadata + trang Credits.
- [ ] AC-04 (Phần 4): Đổi 1 vật liệu (sàn gỗ → gạch) chỉ đổi đúng phần đó trên ảnh render; chạy ≥ 2 scene × 2 bộ vật liệu; pass test tự động gán → lưu → mở lại → render.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra Phần 1 | Playwright chụp viewport + test `sceneValidator` | Sàn đa giác, submesh có tên, validator hoạt động |
| Kiểm tra Phần 2 | Đổi vật liệu trên UI / chọn preset | Viewport cập nhật tức thì, lưu vào revision |
| Kiểm tra Phần 3 | Gọi job render Blender Cycles (`dollhouse` & `eye_level`) | Ảnh PNG + metadata JSON + Credits sinh đúng |
| Kiểm tra Phần 4 | Pytest / script E2E đổi sàn gỗ → gạch + 2 scene × 2 bộ vật liệu | Ảnh chỉ đổi đúng sàn, roundtrip lưu/mở lại khớp 100% |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Render Cycles CPU/GPU tốn thời gian | Cấu hình adaptive sampling + OpenImageDenoise hợp lý để ảnh sạch trong ~15–25 giây/ảnh |
| Đa giác phòng có tọa độ ngược chiều kim đồng hồ | Chuẩn hóa hướng đa giác2D (`THREE.Shape` / Blender mesh polygon) trước khi extrude |

Rollback point: `68499c8`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity
- Thời điểm: 2026-11-14T21:10:00+07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-01 | 2026-11-14T21:52:00+07:00 | Bổ sung `blender_mcp.py`, `contracts.py`, `AtelierStudioContext.tsx` vào danh sách file | Tận dụng hàng đợi render job sẵn có trong `blender_mcp.py` và lưu `part_materials` vào schema dự án | Giữ nguyên giao diện & dữ liệu cũ, mở rộng schema tương thích ngược | Antigravity (auto per user rule) | 1.1 |
| CR-02 | 2026-11-14T22:34:00+07:00 | Đóng gói `sh3d-japandi` (Ứng viên A + bổ sung `bath_jay_hardy` decimated, `led_tv`, `bench`, `rangeHood`, `Ottoman_01`/`stool2`, `console_table` tham số; không dùng Contributions/Free Art/GPL), giữ `sh3d-classic` làm gói phụ chọn theo phong cách; sửa bộ ánh xạ ưu tiên loại cụ thể trước loại chung + unit test >= 5 trường hợp; sửa đếm động trong Credits | Theo chốt của người dùng trước Phần 3–4 | Thêm gói tài nguyên `sh3d-japandi`, mở rộng `assetCatalog.ts`, `blender_cycles_renderer.py`, `pbr_catalog.json`, thêm `apps/api/tests/test_asset_resolver.py` | User approved | 1.2 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14 | `68499c8` (+WT) | Đóng gói Gói A `sh3d-japandi` (42 GLB: 29 CC-0, 13 CC-BY; loại 5 Contributions/Free Art/GPL, decimate `bath_tub` 30.646 -> 17.569 mặt), dựng `console_table` tham số; giữ `sh3d-classic` (36 GLB) làm gói phụ. | Gói chọn động theo `active_style_preset` trong `assetCatalog.ts` & `blender_cycles_renderer.py`. |
| 2026-11-14 | `68499c8` (+WT) | Sửa ưu tiên từ khóa cụ thể thắng category chung (`bunk_bed`, `bookshelf`, `kitchen_island`, `console_table`, `range_hood`, v.v.); sửa tiêu đề Credits dùng số đếm động. | Test 5 ca trong `test_asset_resolver.py`. |
| 2026-11-14 | `68499c8` (+WT) | Thêm `POST /api/v1/projects/{id}/materials` + fallback trong `AtelierStudioContext.handleSaveScene` để lưu vật liệu & preset phong cách trên scene kế thừa mà không nới lỏng validator hình học `PUT /scene`. | Giữ nguyên `measurement_validation.py`. |
| 2026-11-14 | `68499c8` (+WT) | Nâng cấp Blender Cycles renderer & Studio UI: ánh xạ `rug/tham` thành bề mặt `fabric`, cắt bán phần (`bmesh.ops.bisect_plane`) tủ cao mặt tiền > 1.14 m theo hướng `eye_m` ở preset dollhouse, sửa `StudioViewport` `Array.from(unmappedFurnitureIds)`, sửa `main.py` `ROOT_DIR`, sửa `/credits` không ghi đè file trong `public/` gây Vite reload, sửa light-theme modal Render/Credits. | Đã xác minh live qua API + Playwright + Cycles. |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-14 | `68499c8` (+WT) | `pytest apps/api/tests/test_asset_resolver.py tests/test_strict_scene_contracts.py tests/test_g2_material_system.py tests/test_japandi_bedroom_project.py tests/test_catalog_asset_validation.py -v` | `20 passed in 15.54s` | Output `task-2322` (tách riêng: `tests/test_blender_camera_framing.py` có 2 test string cũ kiểm `f.category === 'bed'` / fallback cứng bị lỗi do đã chuyển sang catalog resolver, 3 test framing khác pass). |
| 2026-11-14 | `68499c8` (+WT) | `pnpm --filter @paperclipai/ui exec tsc --noEmit` | 0 lỗi TS trong `StudioViewport.tsx`, `AtelierDesignStudioPage.tsx`, `AtelierStudioContext.tsx`; exit 1 do 1 lỗi tiền tồn tại ngoài phạm vi `UnifiedBOQPage.tsx(135,21): Cannot find name 'bool'` | Log `task-2327` |
| 2026-11-14 | `68499c8` (+WT) | Contact sheet Gói A & decimate `bath_tub` (`build_japandi_pack.py`) | Đạt 42 GLB `<= 25.000` mặt, `bath_tub` 30.646 -> 17.569 mặt không méo | `japandi_final_contact_sheet.png`, `bath_tub_decimate_check.png`. |
| 2026-11-14 | `68499c8` (+WT) | Phần 3 Studio UI (`/ATL/design-studio` Material Picker, Modal Credits, Modal Render) | Render đầy đủ, đọc ảnh trực tiếp không trắng/spinner | `part3_studio_material_ui.png`, `part3_credits_modal_ui.png`, `part3_render_modal_ui.png`. |
| 2026-11-14 | `68499c8` (+WT) | Phần 3 Blender 4.2 Cycles (`proj_demo_4x5m`, `sh3d-japandi`, 3 preset) | Pass (`dollhouse` 34.55s, `eye_level` 23.89s) | `part3_cycles_dollhouse.png`, `part3_cycles_dollhouse_transparent.png`, `part3_cycles_eye_level.png`. |
| 2026-11-14 | `68499c8` (+WT) | Phần 4 đổi 1 phần tử sàn gỗ -> gạch & so pixel (`verify_part4.py`) | `changed_pixels(>16/255)=4.06%, mean_max_channel_diff=1.44` (chỉ vùng sàn + GI bounce đổi) | `part4_floor_oak.png`, `part4_floor_tile.png`, `part4_floor_pixel_diff.png`. |
| 2026-11-14 | `68499c8` (+WT) | Phần 4 Roundtrip gán vật liệu -> `POST /materials` -> `GET` reload -> Cycles render (`verify_part4.py`) | `Roundtrip PASS: hash=13aa1f053ebd rev=5 MAE=0.013/255` | Output `verify_part4.py` (`task-1869`). |
| 2026-11-14 | `68499c8` (+WT) | Phần 4 Ma trận 2 scene × 2 preset (`japandi` / `warm_classic`) × 2 camera + ghép Trước/Sau/Đích (`verify_part4.py`, `verify_bedroom_fixes.py`) | Đạt sau vòng tự sửa phòng ngủ (thảm vải, tủ cắt 1.14 m) | `part4_matrix_2x2x2.png`, `part4_before_after_target.png`. |

## 14. Kết quả và đóng chức năng

- Kết quả: Chờ người dùng duyệt ảnh (giữ trạng thái hợp đồng `FROZEN`, chưa đóng `CLOSED` / chưa ghi nghiệm thu).
- Hạn chế còn lại:
  - Một số mesh gốc `bed_double.glb` (CC-0) có nếp gấp UV/pháp tuyến góc chân ga giường hơi sẫm nhẹ ở góc nhìn `eye_level`.
  - Kính mờ cửa sổ dùng trong `eye_level` khúc xạ ánh sáng dịu thay vì cảnh ngoại thất chi tiết bên ngoài.
  - Hai test kiểm chuỗi cứng cũ trong `tests/test_blender_camera_framing.py` (`test_blender_fallback_builds_semantic_furniture_instead_of_one_box`, `test_pascal_gateway_and_studio_cover_master_bedroom_categories`) vẫn kỳ vọng logic nhánh cứng `f.category === 'bed'` cũ trước khi chuyển sang catalog-driven resolver.
  - Repository còn một lỗi TS tiền tồn tại ngoài phạm vi ở `UnifiedBOQPage.tsx(135,21)` (`bool`).
