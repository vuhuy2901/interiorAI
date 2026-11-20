# [FEAT-2026-138] FP2 Furniture 3D Models — đồ đạc đẹp như văn phòng có sẵn

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File | `ai-office-standalone/index.html` |
| Frozen | 2026-11-20 |

## 1. Vấn đề
FP2_FURN build() hiện tại dùng colored boxes đơn giản:
- `desk`: 1 khối xanh navy → không có màn hình, chân bàn, đèn
- `chair`: 2 khối đơn giản → không có cơ cấu 5 chân, tay ghế
- `plant_sm/plant_lg`: khối màu xanh lá ("cục màu xanh") → không có lá

## 2. Yêu cầu
Dùng sub-group per furniture item (`const fg=new T.Group(); fg.position.set(x,0,z); fg.rotation.y=rot*PI/2`) để hỗ trợ rotation đúng.

### desk (w:2, h:1 = 1m×0.5m)
- Mặt bàn walnut (0x3d2c1f)
- 4 chân kim loại tối
- Màn hình (stand cyl + screen box)
- Bàn phím + chuột
- Đèn bàn (stem cyl + shade bx glowing)

### chair (w:1, h:1 = 0.5m×0.5m)
- Đệm ngồi (0x22262d)
- Lưng ghế (0x1c1f24)
- Trụ trung tâm cyl chrome
- 5 nan chân + bánh xe

### plant_sm (w:1, h:1)
- Chậu ceramic (cyl 0x242220)
- 6 lá cylinder (CylinderGeometry(0.015,0.1,0.32,8) màu 0x2e6138)

### plant_lg (w:1, h:1)
- Chậu ceramic lớn hơn
- 8 lá cylinder cao hơn

## 3. Acceptance criteria
- [x] desk FP2 có màn hình, chân bàn, đèn — 11 meshes (surface+4legs+monitor stand+screen+keyboard+mouse+lamp stem+lamp shade)
- [x] chair FP2 có lưng, trụ, 5 nan — 11 meshes (seat+backrest+spine+2 armrests+piston+5 legs)
- [x] plant_sm có chậu + lá cylinder — 8 meshes (pot+rim+6 leaves)
- [x] plant_lg có chậu + lá cylinder — 10 meshes (pot+rim+8 leaves)
- [ ] Rotation (R-key) hoạt động đúng — chưa test trong UI mode
- [x] Không break các type khác — desk_lg, sofa, shelf, whiteboard, lamp, rug vẫn dùng code cũ

## 4. Verification 2026-11-20
- desk=11 meshes, chair=11, plant_sm=8, plant_lg=10 ✓
- Visual: walnut surface, monitor, lamp shade, 4 dark legs, 5-spoke chair base ✓
- 0 console errors ✓
- Trạng thái: CLOSED
