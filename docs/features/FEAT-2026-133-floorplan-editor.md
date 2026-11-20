# [FEAT-2026-133] Floor Plan Editor — Nối phòng kiểu game + Trang trí

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| Owner | Claude Sonnet 4.6 |
| Opus plan | 2026-11-20 (a81a60df5bedc4c43) |
| Ngày tạo | 2026-11-20 |
| Frozen at | 2026-11-20T15:00:00+07:00 |
| Base commit | e0a06554 |

---

## 1. Mục tiêu

Thêm vào ai-office-standalone hai tính năng:

1. **Room Builder** — đặt phòng mới vào wing phía nam (60×24 ô) bằng cơ chế "nối ghép" kiểu game: phòng phải chạm vào tường hoặc phòng sẵn có, tự tạo cửa thông khi ghép.
2. **Decoration Placer** — đặt chậu cây, trang trí (6 loại) lên sàn bất kỳ, chỉ visual, không ảnh hưởng pathfinding.

---

## 2. Phạm vi (Phase 1 — MVP, file duy nhất)

### In scope
- Mở rộng grid: `H_BASE = 40`, `WING_ROWS = 24`, `H = 64`; wing khởi động là void (blocked)
- **6 loại phòng** (Room Module): `meet_s`, `storage`, `studio`, `pantry`, `focus`, `corridor`
- **6 loại trang trí** (Decoration): `plant_pot`, `plant_tall`, `plant_corner`, `shelf`, `sculpture`, `lamp_arc`
- UI panel `#fpPanel` (glass, left-side) với 3 tab: 🧱 Phòng | 🌿 Trang Trí | 🔍 Chọn
- Ghost preview theo chuột, snap-to-grid, snap hút (±2 ô)
- Luật ghép: ring module phải có ≥ 2 ô chạm tường gốc hàng 39 hoặc ring module khác
- Cửa tự động loại `open` (ngưỡng đồng) tại điểm ghép khi đặt phòng
- Decoration: click để đặt, không block nav, lưu vào localStorage
- Undo (30 bước in-memory), Delete để xoá module/decor đang chọn, R xoay phòng
- Lưu/tải localStorage key `atelier_fp_v1`
- Nút `🧩 Mặt bằng` trong `#controlsCluster`

### Out of scope
- Door editor tay (Phase 2)
- Desk trong phòng mới (Phase 2)
- Tăng W (Phase 3)
- Backend / sync
- Sửa logic agent gốc, lighting, FurniMesh, Custom Team

---

## 3. Data model

```json
// localStorage key "atelier_fp_v1"
{
  "v": 1,
  "modules": [
    {"id":"m_abc123","type":"meet_s","c":20,"r":39,"rot":0}
  ],
  "doors": [
    {"id":"d_abc124","c":24,"r":39,"dir":"h","len":2,"auto":true}
  ],
  "decors": [
    {"id":"dc_abc125","type":"plant_tall","c":5,"r":28,"rot":0}
  ]
}
```

---

## 4. Room catalog — `FP_CATALOG`

| type | name | w×h (cells) | Màu sàn | Nội thất |
|---|---|---|---|---|
| `meet_s` | Phòng họp | 10×8 | 0x2a1f1a | Bàn 4×2 ở giữa, 4 ghế khối |
| `storage` | Kho | 6×6 | 0x1a1f24 | 2 kệ sát tường trên |
| `studio` | Studio | 12×10 | 0x1a2024 | 2 bàn dài + bảng ghim |
| `pantry` | Pantry | 8×8 | 0x1f2420 | Quầy chữ L |
| `focus` | Phòng tập trung | 6×5 | 0x1f1f28 | 1 bàn + ghế |
| `corridor` | Hành lang | 4×10 | 0x1a1a20 | Trống (2 đầu ngắn mở) |

Rotation: `rot` ∈ {0,1,2,3}. `rot` lẻ → đổi w↔h.

---

## 5. Decoration catalog — `FP_DECOR`

| type | name | mesh | cells bị block |
|---|---|---|---|
| `plant_pot` | Chậu cây nhỏ | Trụ 0.3×0.6 (xanh) + đế 0.4×0.2 (nâu) | 0 (decoration only) |
| `plant_tall` | Cây cao | Trụ 0.4×1.4 + 3 lá (`bx` nghiêng) | 0 |
| `plant_corner` | Cây góc | 3 trụ cao thấp + tán lá bầu | 0 |
| `shelf` | Kệ sách | 0.9×1.2×0.25, 3 ngăn | 0 |
| `sculpture` | Tác phẩm nghệ thuật | Khối abstract đa diện từ 2-3 `bx` | 0 |
| `lamp_arc` | Đèn vòng | Cột mảnh 0.05×1.8 + chóa cung | 0 |

Decoration KHÔNG block nav (không gọi B()). Lưu FP.decorGroup riêng.

---

## 6. FP core architecture

```
window.FP = {
  state: { v, modules[], doors[], decors[] },   // source of truth
  occ:   Int16Array(W*H),    // -1=free, >=0=module index
  ring:  Uint8Array(W*H),    // 1=wall ring of module
  group:       T.Group,      // module meshes
  decorGroup:  T.Group,      // decor meshes (separate dispose)
  lotMesh:     T.Mesh,       // wing floor indicator (shown when FP.active)
  ghost:       T.Group,      // preview ghost
  history:     string[],     // JSON snapshots, max 30
  openedBase:  Set<string>,  // base wall cells hidden by doors
  active:      false,
  mode:        'room'|'decor'|'select',
  selType:     null,         // selected catalog type
  selModule:   null,         // id of selected placed module/decor
  rot:         0,
}

// Key functions:
fpApply()           // reset wing nav → apply modules → apply doors → rebuildNear → build mesh
fpSave()            // JSON.stringify(FP.state) → localStorage
fpLoad()            // parse + validate → FP.state
fpValidateModule()  // returns {ok, reason, shared[]}
fpValidateDoor()    // returns {ok, reason}
fpBuildMeshes()     // dispose + rebuild FP.group
fpBuildDecors()     // dispose + rebuild FP.decorGroup
fpRelocateAgents()  // BFS agents off blocked cells
rebuildNear()       // refactored from inline near[] calc
```

---

## 7. UI layout

```
[🧩 Mặt bằng] button in #controlsCluster (before ⟲ Reset)

#fpPanel (position:fixed; left:14px; top:60px; width:272px; glass)
  ┌─ 🧩 Mở Rộng Văn Phòng              ×  ─┐
  │  [🧱 Phòng] [🌿 Trang Trí] [🔍 Chọn]   │
  ├──────────────────────────────────────────┤
  │  PALETTE (2-col grid of cards)           │
  │  [Icon+name+size] selected=gold border   │
  ├──────────────────────────────────────────┤
  │  ⟳ Xoay (R)  ↶ Hoàn tác  🗑 Xoá        │
  │  Đã đặt: 3/16 phòng                     │
  │  [status line — green OK / red reason]  │
  └──────────────────────────────────────────┘

Chế độ Chọn (🔍):
  - Click module/decor trong scene → hiện tên + nút Di chuyển + Xoá
  - Di chuyển: gỡ item → biến thành ghost theo chuột
```

---

## 8. Interaction flow

```
Vào FP mode:
  FP.active = true → hiện #fpPanel, hiện lotMesh (sàn grid vàng nhạt ở wing)
  Camera tween: target=(15,0.5,22), r*=1.6, phi=0.6

Ghost (pointermove khi FP.active):
  fpCellFromEvent() → ray intersect plane y=0 → cell [c,r]
  ghost center = [c - floor(w/2), r - floor(h/2)]
  snap hút: thử ±2 ô → chọn vị trí hợp lệ gần nhất
  ghost color: 0x34d399 (ok) / 0xf87171 (invalid)
  shared cells: nhấp nháy vàng 0xfbbf24

Click để đặt:
  mode=room: fpValidateModule → push + auto-door → fpApply → fpSave → push history
  mode=decor: validate trên sàn hợp lệ → push decor → fpBuildDecors → fpSave

Phím: R=xoay, Ctrl+Z=undo, Del=xoá sel, Esc=cancel ghost/thoát
```

---

## 9. Mesh specs

**Tường module** (ring cells, trừ ô cửa và tường gốc):
- 1 InstancedMesh tường gỗ: cao 0.85, `walnutWallMat` (tái sử dụng)
- 1 InstancedMesh len chân: cao 0.09, `bbMat`
- 1 InstancedMesh LED top: `ledMat`, push vào `ledGroup.children`

**Sàn module**: `fpFloor(c0,r0,c1,r1,color,tex,parent)` — clone logic customFloor, không sửa gốc

**Slab nền**: `bx` màu `0x111318`, cao `plinthH`, đáy y=-0.38, phủ cả footprint

**Cửa auto (open)**: ngưỡng đồng `bx(_, 0.004, _, len*CS, 0.004, CS, 0xd4af37, FP.group)`

**Ẩn tường gốc**: sau tường build (dòng ~1360):
```js
const wallIdx = new Map(wk.map((k,i)=>[k,i]));
function setBaseWallVisible(key, vis) {
  const i = wallIdx.get(key); if (i===undefined) return;
  const s = vis ? 1 : 0;
  for (const m of [wm,bbMesh,wallLedMesh,glassM]) {
    const mat = new T.Matrix4(); m.getMatrixAt(i,mat);
    if (!vis) mat.scale(new T.Vector3(0,0,0));
    else { /* restore from wallMatCache[i] */ }
    m.setMatrixAt(i,mat); m.instanceMatrix.needsUpdate=true;
  }
}
// Cache ngay sau khi tạo wm,bbMesh,wallLedMesh,glassM:
const wallMatCache = new Array(wk.length);
wk.forEach((_,i)=>{ const m=new T.Matrix4(); wm.getMatrixAt(i,m); wallMatCache[i]=m.clone(); });
```

---

## 10. fpApply() thứ tự

```
1. Reset wing: for r in 40..63: blocked[r*W+c]=1, occ=-1, ring=0 (c=0..59)
2. Restore base walls: for key of openedBase: blocked=1, setBaseWallVisible(key,true); clear set
3. Apply modules: validate each → interior→blocked=0,occ=i; ring→blocked=1,ring=1; decor_cells→blocked=1
4. Apply doors: validate each → cells→blocked=0; if base wall→setBaseWallVisible(key,false)+openedBase.add
5. rebuildNear()
6. fpBuildMeshes() — dispose+rebuild FP.group
7. fpBuildDecors() — dispose+rebuild FP.decorGroup
8. refreshGridOverlay() — if gm exists
9. fpRelocateAgents() — BFS ≤8 cells
```

---

## 11. File changes (index.html)

| # | Vị trí | Thay đổi | Dòng |
|---|---|---|---|
| 1 | CSS dòng ~710 | #fpPanel, .fp-card, .fp-tabs, .fp-actions, mobile | +90 |
| 2 | HTML dòng ~752 | nút btnFloorplan | +1 |
| 3 | HTML dòng ~780 | #fpPanel skeleton | +30 |
| 4 | JS dòng ~902 | H_BASE, WING_ROWS, H=64, blk(0,40,59,63) | +4, ~2 edit |
| 5 | JS dòng ~1191 | 4 chỗ H→H_BASE (plinth, cove, ground) | ~4 edit |
| 6 | JS dòng ~1361 | wallIdx, wallMatCache, setBaseWallVisible | +30 |
| 7 | JS dòng ~2421 | rebuildNear() function wrapper | ~3 edit |
| 8 | **NEW** sau dòng ~2479 | FP core: catalog, state, occ/ring, validate, apply, build | +450 |
| 9 | JS dòng ~3257 | FP.down, hover guard, click guard | ~12 edit |
| 10 | JS dòng ~3420 | refreshGridOverlay() helper + first call | +20 |
| 11 | **NEW** sau dòng ~3446 | FP UI: panel render, ghost, lot, camera, keyboard | +270 |
| 12 | loop() dòng ~3531 | snap animate, FP.anim | +12 |

**Tổng: ~910 dòng mới/sửa**

---

## 12. Acceptance criteria

- [ ] AC-01: Mở trang lần đầu (localStorage trống) → cảnh 100% giống bản gốc, không console error
- [ ] AC-02: Click 🧩 → panel mở, hiện lưới wing vàng phía nam camera mở rộng
- [ ] AC-03: Chọn Phòng họp → ghost xanh khi kề tường hàng 39, ghost đỏ khi "treo lơ lửng"
- [ ] AC-04: Đặt phòng → phòng hiện 3D, có ngưỡng cửa đồng, `astar` tìm được path qua cửa
- [ ] AC-05: Chọn Chậu cây → click sàn → cây xuất hiện, không ảnh hưởng pathfinding
- [ ] AC-06: Reload → layout và trang trí giữ nguyên
- [ ] AC-07: Ctrl+Z undo, Delete xoá, R xoay hoạt động
- [ ] AC-08: 9 agent gốc + Custom Team không bị ảnh hưởng
- [ ] AC-09: FPS không giảm >10% với 16 phòng + 20 decor (preset High)

---

## 13. Rollback

Xoá `atelier_fp_v1` → cảnh trở về gốc (H=64 nhưng wing là void, không ảnh hưởng visual).
Revert 1 commit để xoá hoàn toàn tính năng.

---

## Xác nhận đóng băng

- [x] Opus 5.5 đã phân tích grid, xác nhận H-expansion là safe
- [x] Phạm vi rõ, non-goals rõ
- [x] Contract đủ chi tiết để implement không cần hỏi thêm
- Trạng thái: `FROZEN` — 2026-11-20T15:00:00+07:00
