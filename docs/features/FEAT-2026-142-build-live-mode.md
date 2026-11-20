# [FEAT-2026-142] BUILD/LIVE Mode + Phím tắt + Panel thuộc tính tường

| Trạng thái | FROZEN | Phiên bản | 1.0 | Frozen | 2026-11-20 |

## 1. BUILD/LIVE toggle

Nút "BUILD / LIVE" thay nút 🏗️ hiện tại (hoặc thêm bên cạnh):
- BUILD mode: FP2.active=true, lưới hiện, tools hiện
- LIVE mode: FP2.active=false, lưới ẩn, agent hoạt động bình thường

## 2. Phím tắt (thêm vào keyboard handler)

| Phím | Tác dụng |
|---|---|
| W | mode='wall' |
| F | mode='paint' (sàn) |
| V | mode='select' |
| E | mode='erase' |
| R | xoay ghost furniture |
| Delete | xóa tường/furniture đang chọn |
| Ctrl+Z | undo |
| Ctrl+Y / Ctrl+Shift+Z | redo |

## 3. Panel thuộc tính tường

Khi selectedWallId:
- Hiện panel nhỏ góc trên phải FP2 (hoặc dưới palette)
- Hiện: Length (readonly), Thickness (input), Height (input)
- Thay đổi → update wall data → WG.buildMeshes()

## 4. Mode 'select' tab

Thêm tab "🔲 Chọn" vào FP2 panel (data-mode="select").
Khi mode='select': click tường → hiện handles (FEAT-2026-140 logic).

## 5. Acceptance criteria
- [ ] BUILD/LIVE toggle hoạt động
- [ ] Phím W/F/V/E/R/Del/Ctrl+Z/Y hoạt động trong FP2
- [ ] Panel thuộc tính hiện khi chọn tường
- [ ] Mode 'select' tab hoạt động
