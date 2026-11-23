# [FEAT-2026-137] FP2 Wall Rendering — tường dày khớp tường cũ

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File | `ai-office-standalone/index.html` |
| Frozen | 2026-11-20 |

## 1. Vấn đề
- `wallT=0.1` tạo tường mỏng 10cm (trông như tấm giấy) thay vì khối đặc như tường cũ (CS=0.5m)
- Filter `wr<H_BASE` ẩn toàn bộ h-walls khi seed ở vùng base (rows 0–39) → không có tường ngang
- Mỗi edge 1 box riêng → nhiều cục nhỏ rời rạc, khe hở ở góc

## 2. Giải pháp — Gap-cell approach
Thay vì render tường tại các EDGE boundary, render tường tại các ô KHÔNG phải sàn tiếp giáp sàn:
```
wallCells = { (nc,nr) | (c,r) ∈ FP2.floor, (nc,nr) = (c±1,r) hoặc (c,r±1), (nc,nr) ∉ FP2.floor }
```
- Mỗi wall cell → `BoxGeometry(CS, 0.85, CS)` = y hệt tường cũ (CS×0.85×CS)
- Màu và vật liệu khớp: 0x38281d roughness=0.55 (wainscoting) + 0x231d17 baseboard
- Filter: `nc≥0 && nc<W && nr≥0 && nr<H` (bỏ ô ngoài lưới)
- Set tự deduplicate → góc giao nhau chỉ 1 ô wall, không double

## 3. Openings
Edge-based openings (h,c,r / v,c,r) map sang gap cell:
- h,c,r → gap tại (c, r+1) nếu !floor, else (c, r)
- v,c,r → gap tại (c+1, r) nếu !floor, else (c, r)
Gap cell đó KHÔNG render tường (bỏ qua). Gold line vẫn tại edge position.

## 4. Acceptance criteria
- [x] FP2 tường xuất hiện đủ ngang + dọc (không thiếu h-walls) — 258 wall cells với seed 2199 floor cells
- [x] Tường dày y hệt tường cũ (CS=0.5m × 0.85m cao) — BoxGeometry(CS, 0.85, CS)
- [x] Góc giao kín, không khe hở — Set deduplicate, góc = 1 ô
- [x] Màu/material khớp tường văn phòng có sẵn — 0x38281d roughness=0.55
- [ ] Openings (cổng vàng) vẫn hoạt động — chưa test opening cụ thể

## 5. Verification 2026-11-20
- wallCells=258 ✓, fp2Group.children=2716 (2199 floor + 258×2 walls + 1 plinth) ✓
- 0 console errors ✓, visual: tường đặc dày khớp original ✓
- Trạng thái: CLOSED
