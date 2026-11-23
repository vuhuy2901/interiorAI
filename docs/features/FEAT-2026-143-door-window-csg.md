# [FEAT-2026-143] Door/Window on Wall — snap, slide, visual cut

| Trạng thái | FROZEN | Phiên bản | 1.0 | Frozen | 2026-11-20 |

## Mục tiêu
Đặt cửa ra vào / cửa sổ trên wall segment; visual cut qua UV clipping hoặc 2 panel flanking.

## Data model
Thêm vào FP2:
```js
FP2.wallOpenings = []; // [{id,wallId,offset,type:'door'|'window',width,height,elevation}]
```
Save trong fp2Save v:4 với wallOpenings array.

## UI
- Khi mode='wall' → toolbar hiện thêm sub-buttons "Cửa" / "Cửa sổ"
  - FP2.wallSubMode = 'wall'|'door'|'window'
- Khi wallSubMode='door'/'window' + hover tường:
  - Ghost: 2 half-panels flanking cursor + frame outline
  - Click: đặt opening tại offset trên wall gần nhất
  - Slide: kéo opening dọc tường để di chuyển

## Rendering WG.buildOpenings()
Thay vì BoxGeometry cho cả wall:
1. Tính danh sách openings trên wall này (sorted by offset)
2. Tạo n+1 wall panels giữa các openings
3. Mỗi panel: BoxGeometry(thickness, panelH, segLen)
4. Opening gap: frame mesh (4 thin BoxGeometry quanh lỗ)

## Acceptance criteria
- [ ] Hover tường ở door mode → ghost opening hiện
- [ ] Click đặt cửa → wall bị chia thành panels + opening gap
- [ ] Kéo opening → trượt dọc tường
- [ ] Delete opening → wall liền trở lại
- [ ] fp2Save v:4 lưu và load đúng openings
