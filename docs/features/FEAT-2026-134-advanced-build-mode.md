# [FEAT-2026-134] Advanced Office Builder — Phase 1: Build Mode Foundation

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| Nguồn | Vision spec ATELIER Advanced Office Builder (pasted 2026-11-20) |
| Base commit | d032c595 |
| Frozen | 2026-11-20T16:00:00+07:00 |

---

## 1. Mục tiêu Phase 1

Chuyển FP2 (free-draw floor) thành một Build Mode thực sự — tích hợp vào toolbar chính, có wall handles để kéo dãn tường, có object selection + inspector panel.

**Không** xây lại scene. **Không** thay material. **Không** đụng vào AG agents gốc, Paperclip, lighting.

---

## 2. Phạm vi

### In scope
- **Build Mode toggle**: nút "🏗 Build" và "▶ Simulate" ở top toolbar (thay nút 🏗️ hiện tại)
- **Build Mode toolbar** (horizontal, dưới top bar khi active): Select | Wall | Floor | Furniture | Erase | Undo | Redo | Save
- **Wall handles**: hover gần wall edge trong FP2 → hiện 2 endpoint circles (orange) → drag để extend/shorten floor theo hướng đó
- **Object selection**: click furniture trong FP2 → hiện wireframe highlight → inspector panel phải
- **Inspector panel** (right side, 220px): tên object, vị trí (c,r), rotation, nút Rotate/Delete
- **Room auto-detection**: flood-fill từ FP2 floor cells → phát hiện enclosed areas → hiện label tên phòng → user có thể đổi tên
- **Status bar** (bottom): active tool | snapping | selection info

### Out of scope
- SketchUp-style full wall geometry system (Phase 2)
- Agent workstation creation from editor (Phase 3)
- Material picker / wall thickness editor (Phase 2)
- Moving/transforming existing AG agent desks (Phase 3)
- Physics/collision validation (Phase 2)

---

## 3. UI Layout

```
┌────────────────────────────────────────────────────────┐
│  [HOME&CO] [▶ Simulate] [🏗 Build ●] [cam] [preset]... │  ← top bar (existing + toggle)
├────────────────────────────────────────────────────────┤
│  [↖ Chọn] [🧱 Tường] [🖌 Sàn] [🪑 Đồ đạc] [🗑 Xoá]  │  ← build toolbar (only in build mode)
│                     [↶] [↷] [💾]                       │
├──────────────┬─────────────────────────┬───────────────┤
│              │                         │               │
│  (future:    │     3D SCENE            │  INSPECTOR    │
│   asset lib) │                         │  (220px)      │
│              │                         │               │
├────────────────────────────────────────────────────────┤
│  Tool: Chọn | Snap: ON | Chọn: Bàn làm việc (2,42)   │  ← status bar
└────────────────────────────────────────────────────────┘
```

---

## 4. Wall Handles — cơ chế extend

Khi `FP2.mode === 'wall'` và user hover near một edge của auto-wall:

1. Tìm edge gần nhất (đã có trong `fp2GetAutoWalls()`)
2. Tính 2 endpoints của edge đó (ví dụ: edge `h,20,42` → endpoints ở (20,43) và (21,43))
3. Render 2 sphere handles màu orange `0xf97316` tại mỗi endpoint
4. Khi drag handle:
   - Nếu drag theo hướng vuông góc với edge → thêm/bớt hàng floor cells
   - Nếu drag theo hướng song song → thêm/bớt cột floor cells ở đầu đó
5. Live preview bằng ghost cells màu xanh/đỏ
6. MouseUp → commit thay đổi vào `FP2.floor`, gọi `fp2Apply()`, save

---

## 5. Object Selection — Inspector

```
Inspector panel (right, 220px, glass):
┌─────────────────────┐
│ Bàn làm việc        │
│ ─────────────────── │
│ Vị trí: c=20, r=42  │
│ Xoay: 90°           │
│ ─────────────────── │
│ [⟳ Xoay] [🗑 Xoá]  │
└─────────────────────┘
```

- Click furniture mesh trong scene → `FP2._selFurnId` set
- Highlight bằng wireframe box (BoxHelper hoặc EdgesGeometry màu gold)
- Inspector hiện thông tin từ `FP2.furniture[]`
- Nút Xoay: `rot = (rot+1)%4`, rebuild furniture, save
- Nút Xoá: remove từ array, rebuild, save
- Click đất trống → deselect

---

## 6. Room Detection

Sau mỗi `fp2Apply()`:
1. BFS từ mỗi floor cell
2. Nhóm các cells liên thông (connected components)
3. Mỗi group = 1 "room" nếu có ≥ 4 cells
4. Render label (CanvasTexture) ở tâm group: hiện diện tích (m²) + tên nếu đã đặt
5. Click vào label → hiện input đổi tên trong inspector
6. Room names lưu trong `FP2.rooms: {groupId: name}`

---

## 7. Build Mode toolbar hoạt động

Khi build mode active:
- `FP2.mode` điều khiển active tool (giống cũ)
- Toolbar nằm dưới top bar, `position:fixed; top:44px; left:0; right:0`
- Mỗi nút có icon + label ngắn, active = gold border
- Keyboard: S=select, W=wall, F=floor, U=furniture, E=erase, Ctrl+Z=undo, Ctrl+Y=redo

---

## 8. File changes

| # | Vị trí | Thay đổi | Dòng ước |
|---|---|---|---|
| 1 | CSS | #buildToolbar, #fpInspector, #buildStatus, .build-btn | +80 |
| 2 | HTML | #buildToolbar div, #fpInspector div, #buildStatus bar, thay btnFp2 | +50 |
| 3 | JS FP2 core | fp2ApplyRooms(), fp2DetectRooms(), wall handle logic | +150 |
| 4 | JS FP2 UI | Build mode toggle, toolbar click handlers, inspector render, handle mesh | +200 |
| 5 | JS loop() | Animate handles, inspector sync | +20 |

**Tổng: ~500 dòng**

---

## 9. Acceptance criteria

- [ ] AC-01: Nút "▶ Simulate" / "🏗 Build" toggle rõ ràng, smooth transition
- [ ] AC-02: Horizontal toolbar hiện khi Build mode, ẩn khi Simulate mode
- [ ] AC-03: Hover wall edge → 2 orange handles → drag → floor extend theo hướng đó
- [ ] AC-04: Click furniture → wireframe highlight + inspector panel
- [ ] AC-05: Inspector nút Rotate/Delete hoạt động, inspector sync với scene
- [ ] AC-06: Floor cells liên thông được detect thành room, hiện label diện tích
- [ ] AC-07: Click label → đổi tên room → persist
- [ ] AC-08: Status bar cuối trang hiện active tool và selection info
- [ ] AC-09: Existing AG agents, lighting, Paperclip không bị ảnh hưởng

---

## 10. Rollback

Xoá `atelier_fp2_v1` → scene về gốc. Revert 1 commit để xoá hoàn toàn.
