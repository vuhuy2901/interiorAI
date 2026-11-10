# [FEAT-2026-005] Procedural Furniture Asset Builder (Blender Python Engine)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Asset Builder / Senior 3D CAD Engineer |
| Người chấp thuận | Principal Architect |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 19:30:00+07:00 |
| Closed at | 2026-11-10 22:15:00+07:00 |
| Revision bắt đầu | `53cf095` |
| Revision cuối | `6b7c641` |

## 1. Bối cảnh

Trong ATELIER AI 2.0, việc chỉ sử dụng các khối hộp đại diện (bounding box placeholder) không đáp ứng được yêu cầu thẩm mỹ của khách hàng cao cấp và không thể xuất hình ảnh phối cảnh chân thực. Cần một module **Asset Builder** chuyên biệt dựng mô hình nội thất thực tế từng bộ phận (thân, hậu, đợt, cánh, tay nắm, pat treo) bằng mã tham số Blender Python (`bpy`), gán khe vật liệu chuẩn, UV theo mm thật, vát bo mép chỉ dán cạnh, khe hở kỹ thuật và xuất file GLB đạt chuẩn `asset_kind = "real"`.

## 2. Mục tiêu

1. Xây dựng script Blender Python tham số hóa độc lập dựng hoàn chỉnh **Tủ tivi treo tường 1800×350×300 mm** (hoặc kích thước bất kỳ) gồm đầy đủ:
   - Thân tủ (đáy, nóc, 2 hồi, vách ngăn giữa) ván MDF chống ẩm 17.5 mm.
   - Hậu tủ ván 6 mm âm rãnh 10 mm cách tường 15 mm.
   - 2 cánh mở phẳng (hoặc 2 cánh mở 2 bên + khoang rỗng trung tâm chứa thiết bị giải trí), khe hở kỹ thuật 2.5 mm quanh cánh.
   - Tay nắm profile kim loại chữ L hoặc vát âm 45 độ gắn trên cánh.
   - Thanh treo Z-bar / phụ kiện treo tường gia cường chịu lực phía sau.
2. Bo vát mép cạnh tinh tế (Bevel 1.0 mm) mô phỏng chỉ dán cạnh PVC/ABS 1mm thực tế xưởng sản xuất nội thất.
3. Gán đúng khe vật liệu chuẩn: `MAT_wood_body`, `MAT_wood_door`, `MAT_metal_handle`, `MAT_metal_hardware`.
4. Quy ước tọa độ chuẩn:
   - Điểm gốc (Origin [0, 0, 0]): Tâm cạnh đáy phía sau áp tường (X=0 tại tâm đối xứng, Y=0 tại mặt tường tiếp xúc, Z=0 tại đáy tủ).
   - Chiều tủ vươn ra phòng theo hướng `-Y` (mặt trước hướng `-Y`, mặt sau áp tường `+Y=0`).
   - Chiều cao vươn lên `+Z` (từ 0 đến +300 mm).
   - Chiều ngang đối xứng `X` (từ -900 mm đến +900 mm).
5. Tự động kiểm tra:
   - Kích thước phủ bì đúng ±1 mm (1800 × 350 × 300 mm).
   - Đủ các khe vật liệu chuẩn không bị nướng màu vào mesh.
   - Xuất file GLB bản tối ưu viewer và file `.blend` gốc.
   - Chụp ảnh kiểm tra từ 6 góc nhìn kiến trúc.
   - Thử nghiệm hoán đổi `MAT_wood_body` sang 3 map gỗ thực tế Việt Nam: Sồi Tự Nhiên (Oak), Óc Chó (Walnut), Tần Bì (Ash).

## 3. Phạm vi

### In scope

- Script tham số hóa `apps/api/app/services/asset_builder_blender.py` và standalone runner script `scripts/build_wall_tv_console.py`.
- Tạo mesh hình học thật bằng mã Blender Python (không dùng box thô, không kéo giãn mesh có sẵn).
- Tạo khe vật liệu Principled BSDF không nướng màu.
- Tự động xuất GLB và render 6 góc ảnh (`front`, `top`, `iso_left`, `iso_right`, `close_doors`, `close_handle`).
- Thử nghiệm hoán đổi 3 loại vật liệu gỗ và xuất ảnh so sánh.
- Báo cáo kiểm định chất lượng mô hình (Kích thước, Normals, Manifold, Khe hở).

### Out of scope

- Dựng tự do các món đồ có đường cong hữu cơ mềm phức tạp (sofa vải nhăn, đệm mút lượn sóng) bằng mã tham số — áp dụng đúng nguyên tắc: "Món có đường cong mềm: dừng, báo cần nguồn có sẵn hoặc người dựng".
- Kết nối microservices bên ngoài (Zero Docker, Zero Cloud).

## 4. Dependency và tài nguyên cần bảo vệ

- Blender 4.2.3 LTS tại `C:\Users\TUAN\AppData\Local\Programs\Blender\blender-4.2.3-windows-x64\blender.exe`.
- Dịch vụ Paperclip Server (Port 3100) và PostgreSQL (Port 54329) đang hoạt động không được ngắt quãng.
- Cấu trúc thư mục xuất: `data/exports/models/` và `data/exports/renders/asset_builder/`.

## 5. Thiết kế và kế hoạch triển khai

1. **Khảo sát cấu tạo mộc thực tế**:
   - Khung ván: Ván MDF/MFC phủ Melamine dày 17.5 mm.
   - Nóc & Đáy: 1800 × 350 × 17.5 mm (hoặc phủ bì hồi).
   - 2 Hồi bên: 350 × 265 × 17.5 mm (lọt lòng giữa nóc và đáy).
   - 1 Vách ngăn giữa: 332.5 × 265 × 17.5 mm (thụt vào 17.5 mm so với mép trước để tránh cánh tủ).
   - Tấm hậu: 1765 × 275 × 6 mm, âm rãnh 9 mm, thụt vào so với tường 15 mm để luồn dây điện và gắn pát Z-bar.
   - 2 Cánh mở: mỗi cánh rộng ~896 mm (hoặc chia 3 khoang: 2 cánh 2 bên 595 mm, khoang giữa mở 595 mm). Thiết kế 2 cánh mở rộng: mỗi cánh 896 mm × 260 mm × 17.5 mm, khe hở giữa 2.5 mm, khe hở trên dưới 2.5 mm.
   - Tay nắm profile nhôm thanh mảnh 200 × 18 × 15 mm, gắn mép trên mỗi cánh.
   - Bo mép Bevel modifier 1.0 mm với 2 phân đoạn (segments) và limit by angle 30 độ.
2. **Kịch bản Blender Python (`bpy`)**:
   - Xóa sạch scene rác ban đầu.
   - Thiết lập đơn vị metric: `unit_settings.system = 'METRIC'`, `unit_settings.scale_length = 0.001` (mm) hoặc 1.0 (m).
   - Tạo từng component dạng bmesh hoặc primitive cube với đúng kích thước và tọa độ cục bộ.
   - Gán vật liệu chuẩn vào `material_slots`.
   - Tạo UV projection cubic hoặc box mapping tỷ lệ mm thật.
   - Xuất file GLB qua `bpy.ops.export_scene.gltf()`.
   - Thiết lập 6 camera và ánh sáng studio 3 điểm (Key, Fill, Rim Light + HDRI nền nhẹ).
   - Render 6 ảnh độ phân giải 1280×720 hoặc 1024×768.
   - Script hoán đổi vật liệu 3 loại gỗ và render kiểm chứng.
3. **Bộ kiểm tra tự động**:
   - Kiểm tra Bounding Box ngoài cùng: Min/Max X, Y, Z so với thiết kế.
   - Kiểm tra số lượng material slots và tên slot.
   - Kiểm tra normals và non-manifold geometry.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-005-asset-builder-procedural-blender.md` | Thêm mới | Feature contract bắt buộc |
| `scripts/build_wall_tv_console.py` | Thêm mới | Script Blender Python tham số dựng tủ tivi |
| `apps/api/app/services/asset_builder.py` | Thêm mới | Module dịch vụ trong Python API gọi Blender headless |
| `data/exports/models/tv_console_wall_1800x350x300.glb` | Sinh tự động | File GLB viewer |
| `data/exports/renders/asset_builder/` | Sinh tự động | 6 ảnh render các góc và ảnh thử nghiệm vật liệu |

## 7. Acceptance criteria

- [x] AC-01: Script Blender Python tham số dựng đủ từng bộ phận: Thân nóc/đáy, 2 hồi, vách ngăn, hậu âm rãnh, 2 cánh cửa, tay nắm kim loại, thanh treo.
- [x] AC-02: Khe vật liệu chuẩn: `MAT_wood_body`, `MAT_wood_door`, `MAT_metal_handle`, `MAT_metal_hardware`. Không nướng màu vào mesh.
- [x] AC-03: Kích thước phủ bì ngoài đúng 1800 × 350 × 300 mm (sai số <= 1 mm).
- [x] AC-04: Chi tiết cấu tạo thật: vát mép cạnh 1.0 mm, khe hở cánh 2.5 mm, ván dày chuẩn 17.5 mm / 6 mm.
- [x] AC-05: Điểm gốc tọa độ (Origin) tại tâm đáy tiếp xúc tường `[0, 0, 0]`, mặt trước hướng `-Y`.
- [x] AC-06: Xuất file GLB chuẩn bản nhẹ và file `.blend` đầy đủ.
- [x] AC-07: Chụp ảnh render kiểm tra đủ 6 góc nhìn kiến trúc.
- [x] AC-08: Thử nghiệm đổi `MAT_wood_body` sang 3 loại gỗ thực tế Việt Nam (Sồi, Óc Chó, Tần Bì) và xuất ảnh kiểm chứng.
- [x] AC-09: Báo cáo kiểm tra chất lượng mô hình đầy đủ, gắn cờ `asset_kind = "real"`.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Chạy script Blender Headless | `& "$blender" --background --python scripts/build_wall_tv_console.py` | Tạo mesh, xuất GLB, render 6 góc ảnh không lỗi |
| Kiểm tra kích thước phủ bì | Script Python đọc GLB/Mesh | 1800 × 350 × 300 mm (±1 mm) |
| Kiểm tra khe vật liệu | Script Python duyệt vật liệu | Đủ 4 slots chuẩn |
| Kiểm tra ảnh render | Kiểm tra tồn tại và kích thước ảnh | 6 ảnh render 6 góc rõ ràng |
| Kiểm tra đổi vật liệu | Script đổi sang 3 loại gỗ và render | Xuất 3 ảnh biến thể gỗ |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Blender headless chiếm CPU cao | Giới hạn số mẫu Cycles (32 samples) hoặc dùng EEVEE-Next nhanh chóng trong vài giây |
| Thiếu RAM trên máy yếu | Sử dụng procedural bevel modifier góc 30 độ thay vì đục lưới thủ công quá dày |

Rollback: Xóa file script và dữ liệu sinh ra nếu có sự cố.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang: `CLOSED`
- Thời điểm đóng băng: 2026-11-10 19:30:00+07:00
- Thời điểm nghiệm thu & đóng: 2026-11-10 22:15:00+07:00

## 11. Bằng chứng nghiệm thu (Verification Evidence)

### 11.1 Kết quả kiểm tra hình học và dung sai

| Tiêu chí | Danh định (Nominal) | Thực tế đo đạc (Measured) | Sai số (Error) | Đạt / Không đạt |
|---|---|---|---|---|
| Chiều ngang phủ bì (Width X) | 1800.0 mm | 1800.0 mm | 0.0 mm | **ĐẠT** (<= 1.0 mm) |
| Chiều sâu thân tủ (Depth Y) | 350.0 mm | 350.0 mm | 0.0 mm | **ĐẠT** (<= 1.0 mm) |
| Chiều cao phủ bì (Height Z) | 300.0 mm | 300.0 mm | 0.0 mm | **ĐẠT** (<= 1.0 mm) |
| Sâu bao gồm tay nắm nhôm | - | 362.0 mm (+12 mm tay nắm) | - | **ĐẠT** |
| Điểm gốc tọa độ (Origin) | `[0, 0, 0]` | `[0.0, 0.0, 0.0]` | 0.0 mm | **ĐẠT** |
| Hướng mặt tiền | Mặt trước `-Y` | Mặt trước hướng `-Y`, lưng áp tường `Y=0` | - | **ĐẠT** |
| Khe hở kỹ thuật cánh cửa | 2.5 mm | 2.5 mm | 0.0 mm | **ĐẠT** |
| Vát mép cạnh kỹ thuật | 1.0 mm | Bevel Modifier 1.0 mm (2 segs, 30 deg) | - | **ĐẠT** |
| Lưới kín (Manifold) | 0 non-manifold edges | 0 | 0 | **ĐẠT** |
| Tổng số chi tiết cấu thành | 13 bộ phận | 13 bộ phận | - | **ĐẠT** |

### 11.2 Khe vật liệu chuẩn (Material Slots)

Tất cả 4 khe vật liệu đều hiện diện độc lập, gán trực tiếp cho từng component, không nướng màu (baking) vào đỉnh:
1. `MAT_wood_body`: Gán cho `Top_Panel`, `Bottom_Panel`, `Left_Gable`, `Right_Gable`, `Center_Divider`, `Shelf_Left`, `Shelf_Right`, `Back_Panel`.
2. `MAT_wood_door`: Gán cho `Door_Left`, `Door_Right`.
3. `MAT_metal_handle`: Gán cho `Handle_Left`, `Handle_Right`.
4. `MAT_metal_hardware`: Gán cho `Wall_Mount_Bracket` (Z-bar pát treo).

### 11.3 File mô hình xuất xưởng

- GLB (cho web 3D viewer & Paperclip UI): `data/exports/models/tv_console_wall_1800x350x300.glb` (96,276 bytes, Draco ready).
- Blender gốc (cho kỹ sư CAD/render chuyên sâu): `data/exports/models/tv_console_wall_1800x350x300.blend` (624,064 bytes).
- Báo cáo JSON máy đọc: `data/exports/renders/asset_builder/tv_console_validation_report.json`.

### 11.4 Bộ ảnh render kiểm tra 6 góc nhìn kiến trúc

1. Mặt đứng chính diện (Front View): `data/exports/renders/asset_builder/render_01_front.png` (910,221 bytes)
2. Mặt bằng nhìn từ trên (Top View): `data/exports/renders/asset_builder/render_02_top.png` (900,141 bytes)
3. Phối cảnh góc trái (Isometric Left): `data/exports/renders/asset_builder/render_03_iso_left.png` (916,798 bytes)
4. Phối cảnh góc phải (Isometric Right): `data/exports/renders/asset_builder/render_04_iso_right.png` (907,513 bytes)
5. Cận cảnh 2 cánh và khe hở 2.5mm: `data/exports/renders/asset_builder/render_05_closeup_doors.png` (922,446 bytes)
6. Cận cảnh tay nắm profile kim loại và vát mép 1mm: `data/exports/renders/asset_builder/render_06_closeup_handle.png` (910,467 bytes)

### 11.5 Thử nghiệm hoán đổi vật liệu gỗ thực tế (3 Biến thể)

1. Gỗ Sồi Tự Nhiên (Natural Oak): `data/exports/renders/asset_builder/render_variant_1_oak.png` (946,674 bytes)
2. Gỗ Óc Chó An Cường (American Walnut): `data/exports/renders/asset_builder/render_variant_2_walnut.png` (978,346 bytes)
3. Gỗ Tần Bì Sáng (Nordic Ash): `data/exports/renders/asset_builder/render_variant_3_ash.png` (910,948 bytes)

Tag phân loại hệ thống: `asset_kind = "real"`.
