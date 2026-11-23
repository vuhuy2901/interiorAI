# [FEAT-2026-139] Wall Graph P1 — WallNode+Wall data model + line-segment rendering

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File | `ai-office-standalone/index.html` |
| Frozen | 2026-11-20 |
| Implements | Spec §1 (sửa lỗi) + §2 data model |

---

## 0. Kiến trúc tham chiếu (ĐỌC TRƯỚC KHI CODE)

**File duy nhất:** `ai-office-standalone/index.html` — vanilla Three.js (CDN), không có build system, không React.

**Hằng số quan trọng (line ~978):**
```js
const T = THREE, CS = 0.5, W = 60, H_BASE = 40, WING_ROWS = 24, H = H_BASE + WING_ROWS;
```
- CS = 0.5m = cell size
- W×H = 60×64 cells = 30m×32m grid

**Helpers (dùng lại):**
- `bx(x,y,z,w,h,d,c,p,opt)` — tạo BoxGeometry mesh thêm vào parent p
- `cyl(x,y,z,r,l,c,rz,p,opt)` — tạo CylinderGeometry
- `M(color, opt)` — material cache

**FP2 hiện tại (cần sửa):**
```js
FP2 = {
  floor: Set<"c,r">,        // ô sàn đã tô
  openings: Set<"h,c,r"|"v,c,r">, // cổng mở (cần giữ lại hoặc migrate)
  furniture: Array,         // đồ đạc (giữ nguyên)
  group: THREE.Group,       // mesh tường+sàn
  decorGroup: THREE.Group,  // mesh đồ đạc
  ...
}
```

**fp2BuildMeshes() (line ~2706):** Hiện tạo tường từ gap-cell → XOÁ HOÀN TOÀN logic tường trong hàm này.

**fp2GetAutoWalls() (line ~2538):** Sinh edge-keys từ FP2.floor boundary → KHÔNG GỌI NỮA trong đường render tường.

**Existing wall heights:** Tường nội thất h=0.85m, outer h=2.6m — dùng lại WallGraph.DEFAULT_HEIGHT = 0.85m.

---

## 1. Data model mới

Thêm vào FP2 object:

```js
FP2.wallNodes = new Map();   // id → {id, x, z}
FP2.walls     = new Map();   // id → {id, startId, endId, thickness, height, materialId}
FP2.wallGroup = new THREE.Group(); // mesh cho wall graph
scene.add(FP2.wallGroup);    // thêm vào scene ngay sau FP2.group
```

**WallNode:** `{id: string, x: number, z: number}` (world coords, không phải cell)

**Wall:** `{id: string, startId: string, endId: string, thickness: number, height: number, materialId: 'walnut'|'glass'|'concrete'}`

**Defaults:**
```js
const WALL_THICKNESS = 0.1;   // 10cm — bằng existing glass partition thickness
const WALL_HEIGHT = 0.85;     // 0.85m — bằng existing interior wall height
const WALL_COLOR = 0x38281d;  // walnut dark — bằng existing
const WALL_BB_COLOR = 0x231d17; // baseboard
```

---

## 2. Hàm quản lý WallGraph

```js
// Thêm sau FP2 object definition (khoảng line 2590)

const WG = {
  _nid: 0,
  _wid: 0,

  addNode(x, z) {
    // Snap: nếu đã có node trong bán kính 0.15m thì dùng lại
    for (const n of FP2.wallNodes.values()) {
      if (Math.hypot(n.x - x, n.z - z) < 0.15) return n.id;
    }
    const id = 'n' + (++this._nid);
    FP2.wallNodes.set(id, { id, x, z });
    return id;
  },

  addWall(x0, z0, x1, z1, thickness, height) {
    if (Math.hypot(x1 - x0, z1 - z0) < 0.2) return null; // quá ngắn
    const startId = this.addNode(x0, z0);
    const endId   = this.addNode(x1, z1);
    if (startId === endId) return null;
    // Không tạo tường trùng
    for (const w of FP2.walls.values()) {
      if ((w.startId===startId&&w.endId===endId)||(w.startId===endId&&w.endId===startId)) return w.id;
    }
    const id = 'w' + (++this._wid);
    FP2.walls.set(id, {
      id, startId, endId,
      thickness: thickness ?? WALL_THICKNESS,
      height: height ?? WALL_HEIGHT,
      materialId: 'walnut'
    });
    return id;
  },

  removeWall(wallId) {
    const w = FP2.walls.get(wallId); if (!w) return;
    FP2.walls.delete(wallId);
    // Xoá node mồ côi
    const usedNodes = new Set();
    for (const wall of FP2.walls.values()) { usedNodes.add(wall.startId); usedNodes.add(wall.endId); }
    for (const nid of [w.startId, w.endId]) {
      if (!usedNodes.has(nid)) FP2.wallNodes.delete(nid);
    }
  },

  buildMeshes() {
    // Xoá mesh cũ
    FP2.wallGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material._shared) o.material.dispose(); });
    while (FP2.wallGroup.children.length) FP2.wallGroup.remove(FP2.wallGroup.children[0]);

    for (const wall of FP2.walls.values()) {
      const n0 = FP2.wallNodes.get(wall.startId);
      const n1 = FP2.wallNodes.get(wall.endId);
      if (!n0 || !n1) continue;
      this._buildWallMesh(wall, n0, n1);
    }
  },

  _buildWallMesh(wall, n0, n1) {
    const dx = n1.x - n0.x, dz = n1.z - n0.z;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz); // rotation Y để căn theo hướng tường
    const cx = (n0.x + n1.x) / 2;
    const cz = (n0.z + n1.z) / 2;
    const h = wall.height, t = wall.thickness;

    // Main wall body
    const mesh = new T.Mesh(
      new T.BoxGeometry(t, h, len),
      M(WALL_COLOR, { roughness: 0.55 })
    );
    mesh.position.set(cx, h / 2, cz);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.userData.wallId = wall.id;
    FP2.wallGroup.add(mesh);

    // Baseboard strip
    const bb = new T.Mesh(
      new T.BoxGeometry(t + 0.02, 0.08, len + 0.02),
      M(WALL_BB_COLOR, { roughness: 0.5, metalness: 0.6 })
    );
    bb.position.set(cx, 0.04, cz);
    bb.rotation.y = angle;
    FP2.wallGroup.add(bb);
  },

  toJSON() {
    return {
      nodes: [...FP2.wallNodes.values()],
      walls: [...FP2.walls.values()],
      _nid: this._nid,
      _wid: this._wid
    };
  },

  fromJSON(data) {
    if (!data) return;
    FP2.wallNodes = new Map(data.nodes.map(n => [n.id, n]));
    FP2.walls     = new Map(data.walls.map(w => [w.id, w]));
    this._nid = data._nid || 0;
    this._wid = data._wid || 0;
  }
};
```

---

## 3. Vẽ tường bằng drag (Wall Draw Tool)

**Khi FP2.mode === 'wall':**

Thay thế toàn bộ logic pointerdown/pointermove/pointerup trong wall mode (hiện đang dùng wall drag handles) bằng draw-segment mode:

```js
let wallDraw = null;
// {startX, startZ, ghostMesh}

// Trong FP2._onPointerDown (wall mode):
if (FP2.mode === 'wall' && e.button === 0) {
  const pt = buildPointerPoint(e); if (!pt) return;
  const sx = snapGrid(pt.x), sz = snapGrid(pt.z);
  wallDraw = { startX: sx, startZ: sz };
  // ghost mesh
  wallDraw.ghost = createWallGhost(); // BoxGeometry placeholder
  FP2.wallGroup.add(wallDraw.ghost);
  cv.setPointerCapture(e.pointerId);
  return;
}

// Trong FP2._onPointerMove:
if (wallDraw) {
  const pt = buildPointerPoint(e); if (!pt) return;
  const ex = snapAxis(wallDraw.startX, snapGrid(pt.x));
  const ez = snapAxis(wallDraw.startZ, snapGrid(pt.z));
  updateWallGhost(wallDraw, ex, ez);
  return;
}

// Trong FP2._onPointerUp:
if (wallDraw) {
  const pt = buildPointerPoint(e); if (!pt) { wallDraw = null; return; }
  const ex = snapAxis(wallDraw.startX, snapGrid(pt.x));
  const ez = snapAxis(wallDraw.startZ, snapGrid(pt.z));
  FP2.wallGroup.remove(wallDraw.ghost);
  fp2Snapshot();
  WG.addWall(wallDraw.startX, wallDraw.startZ, ex, ez);
  WG.buildMeshes();
  fp2Save();
  wallDraw = null;
  return;
}
```

**Helpers:**
```js
// Snap về lưới CS/2 = 0.25m
function snapGrid(v) { return Math.round(v / (CS / 2)) * (CS / 2); }

// Snap theo trục: nếu |dx| > |dz| thì giữ z cố định, ngược lại giữ x cố định
function snapAxis(s0, s1, z0, z1_candidate) {
  // Trả về {x, z} đã khoá trục
}
```

---

## 4. Tắt auto-wall từ sàn

Trong `fp2BuildMeshes()` xoá TOÀN BỘ đoạn gap-cell wall (FEAT-2026-137):
```js
// XOÁ: const wallCells = new Set(); ... for (const wk of wallCells) { bx(...) }
```
Giữ lại: sàn tiles + plinth + opening gold lines.

Gọi `WG.buildMeshes()` thay thế ở cuối `fp2Apply()`.

---

## 5. Lưu/đọc localStorage

Trong `fp2Save()`:
```js
function fp2Save() {
  try {
    localStorage.setItem(FP2_KEY, JSON.stringify({
      v: 3,  // tăng version
      floor: [...FP2.floor],
      openings: [...FP2.openings],
      furniture: FP2.furniture,
      rooms: FP2.rooms || {},
      wallGraph: WG.toJSON()   // thêm wall graph
    }));
  } catch {}
}
```

Trong `fp2Load()`:
```js
if (raw && raw.v === 3) {
  FP2.floor = new Set(raw.floor || []);
  FP2.openings = new Set(raw.openings || []);
  FP2.furniture = raw.furniture || [];
  FP2.rooms = raw.rooms || {};
  WG.fromJSON(raw.wallGraph);
} else {
  fp2SeedDefaultRooms();
  fp2SeedDefaultWalls(); // seed wall graph từ 7 rooms (xem mục 6)
}
```

---

## 6. Seed wall graph từ layout gốc

```js
function fp2SeedDefaultWalls() {
  // 7 phòng + hành lang theo layout gốc
  // Toạ độ world = cell * CS
  // Vẽ tường theo perimeter của từng room
  const rooms = [
    [0,0,8,8],     // ops: c0..15, r0..15 → x=0..7.5, z=0..7.5
    [8,0,20,8],    // meet
    [20,0,30,8],   // mira
    [0,8,30,11],   // corridor
    [0,11,10,20],  // design
    [10,11,19,20], // bim
    [19,11,26,20], // cost
    [26,11,30,20], // qa
  ];
  // Mỗi room: vẽ 4 cạnh tường (nếu chưa có node ở đó thì tạo mới)
  // WG.addWall dùng lại node bị snap 0.15m tự động
  const rDef = [
    // [x0,z0,x1,z1] theo world coords (cell * CS)
    [0,0, 7.5,0],   [7.5,0, 7.5,7.5], [7.5,7.5, 0,7.5], [0,7.5, 0,0],   // ops top-bottom-left-right
    // ... (đủ 4 cạnh mỗi phòng)
  ];
  // Thực tế: generate từ segment definitions
  const segs = [
    // Horizontal walls (z cố định)
    [0,0, 30,0],     // top outer
    [0,7.5, 30,7.5], // bottom top-rooms / top corridor
    [0,8.5, 30,8.5], // top bottom-rooms / bottom corridor
    [0,20, 30,20],   // bottom outer
    // Vertical walls (x cố định)
    [0,0, 0,20],     // left outer
    [30,0, 30,20],   // right outer
    [7.5,0, 7.5,7.5], // ops/meet divider
    [20,0, 20,7.5],  // meet/mira divider
    [10,8.5, 10,20], // design/bim
    [19,8.5, 19,20], // bim/cost
    [26,8.5, 26,20], // cost/qa
  ];
  for (const [x0,z0,x1,z1] of segs) {
    WG.addWall(x0, z0, x1, z1, WALL_THICKNESS, WALL_HEIGHT);
  }
}
```

**Lưu ý:** World coords = cell_index * CS. Phòng ops là c=0..14, r=0..14 nên x=0..7.0m, z=0..7.0m.
Cần tính lại CHÍNH XÁC từ fp2SeedDefaultRooms() segment definitions:
```
ops:   c0=0,r0=0,c1=15,r1=15 → x=[0, 7.5], z=[0, 7.5]
meet:  c0=16,r0=0,c1=39,r1=15 → x=[8, 19.5], z=[0, 7.5]
mira:  c0=40,r0=0,c1=60,r1=15 → x=[20, 30], z=[0, 7.5]
corridor: c0=0,r0=16,c1=60,r1=22 → x=[0,30], z=[8, 11]
design: c0=0,r0=23,c1=19,r1=40 → x=[0, 9.5], z=[11.5, 20]
bim:   c0=20,r0=23,c1=37,r1=40 → x=[10, 18.5], z=[11.5, 20]
cost:  c0=38,r0=23,c1=51,r1=40 → x=[19, 25.5], z=[11.5, 20]
qa:    c0=52,r0=23,c1=60,r1=40 → x=[26, 30], z=[11.5, 20]
```

Seed segments từ bounding boxes trên.

---

## 7. Phím tắt giữ nguyên

Phím W → `FP2.mode = 'wall'` (đã có, khoảng line 4017)

---

## 8. Out of scope (KHÔNG LÀM TRONG FEAT-2026-139)
- Room detection (FEAT-2026-140)
- Door/window CSG (FEAT-2026-141)
- Handle-based edit (push/pull) — P2
- Miter joints tại góc — P2
- Agent pathfinding
- Build/Live mode toggle
- Chuyển hardcoded rooms thành WallNode+Wall objects

---

## 9. Acceptance criteria

- [ ] Tường vẽ bằng drag: pointerdown → kéo → thả = 1 wall segment line thẳng (không phải bậc thang)
- [ ] Tường dày WALL_THICKNESS=0.1m (dạng slab mỏng) HOẶC có thể dùng CS=0.5 cho rõ — theo §1 "độ dày = tường văn phòng cũ"
- [ ] FP2.floor paint mode: sàn vẫn tô được, KHÔNG sinh tường tự động
- [ ] WG.buildMeshes() render đúng (không ghost từ gap-cell cũ)
- [ ] fp2Save/fp2Load với v=3 lưu+đọc được wallGraph
- [ ] Seed default walls khi localStorage trống: 11 segment khớp 7-room layout
- [ ] 0 console error, không break furniture/paint/erase/undo

---

## 10. Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| version collision với v=2 | fp2Load check `raw.v===3` riêng; v=2 → migrate hoặc seed |
| Wall ghost không xoá được khi pointerleave | Thêm pointerleave handler → cancel wallDraw |
| Seed wall coords sai (off-by-CS) | Verify trong test: snapshot FP2.wallNodes và so sánh với fp2SeedDefaultRooms |
