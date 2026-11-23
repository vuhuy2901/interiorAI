# [FEAT-2026-135] Wall Drag Handles — kéo dãn tường trong Build Mode

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File duy nhất | `ai-office-standalone/index.html` |
| Frozen | 2026-11-20 |

---

## 1. Vấn đề hiện tại

Trong Build Mode (FP2.mode === 'wall'), hàm `buildUpdateHandles(e)` đã vẽ **2 orange sphere** tại hai endpoint của wall edge gần con trỏ — nhưng không có logic drag nào. Người dùng **không thể kéo dãn/thu ngắn tường**.

---

## 2. Kiến trúc cần biết (ĐỌC TRƯỚC KHI CODE)

### Data model
- `FP2.floor` — `Set<string>` chứa các key `"c,r"` (c=cột, r=hàng) là ô sàn đã vẽ
- Tường tự sinh từ sàn qua `fp2GetAutoWalls()` → trả về `Set<string>` key `"h,c,r"` (edge ngang dưới ô c,r) và `"v,c,r"` (edge dọc phải ô c,r)
- Để **kéo dài tường** = thêm ô sàn vào `FP2.floor`; **thu ngắn** = xoá ô sàn

### Canvas pointer hooks (đã có sẵn — KHÔNG tạo thêm addEventListener)
```
cv.addEventListener('pointerdown', e => {
  if (FP2.active && FP2._onPointerDown) { FP2._onPointerDown(e); return; }
  ...orbit drag...
});
cv.addEventListener('pointermove', e => {
  if (FP2.active && FP2._onPointerMove) { FP2._onPointerMove(e); if(!drag) return; }
  ...orbit...
});
cv.addEventListener('pointerup', e => { if (FP2.active && FP2._onPointerUp) { FP2._onPointerUp(e); } drag = null; });
```
→ Chỉ cần **overwrite** `FP2._onPointerDown`, `FP2._onPointerMove`, `FP2._onPointerUp` bên trong block đã tồn tại ở cuối `setupFp2UI()` (khoảng dòng 4130+).

### Helper đã có
- `CS` — cell size (world units per cell)
- `cam` — THREE.PerspectiveCamera
- `fp2GetAutoWalls()` — returns Set of edge keys
- `fp2Snapshot()` — push undo history
- `fp2Apply()` — rebuild meshes từ FP2.floor
- `fp2Save()` — persist to localStorage
- `FP2._handleGroup` — THREE.Group, children là các orange sphere handles

### Hàm `buildUpdateHandles(e)` (dòng ~4143)
Hiện xác định `best` = wall edge gần nhất, vẽ 2 sphere tại endpoint. Ta cần **lưu `best` vào biến ngoài** để pointerdown biết handle nào đang hover.

### Hàm `cellFromEvent(e)` — đã có, trả về [c,r] từ screen coords

---

## 3. Phạm vi

### In scope
- Khi `FP2.mode === 'wall'`, hover gần wall edge → hiện 2 orange endpoint handles (đã có)
- **Mousedown gần handle** (trong 1 cell radius) → bắt đầu drag, `cv.setPointerCapture(e.pointerId)`
- **Pointermove trong drag** → tính ô sàn cần thêm/xoá, cập nhật `FP2.floor` liên tục, gọi `fp2Apply()`
- **Pointerup** → finalize: `fp2Snapshot()` (ghi undo) + `fp2Save()`
- Chỉ kéo theo **đúng một trục** (trục vuông góc với wall edge):
  - h-edge (tường ngang) → chỉ kéo theo chiều R (hàng)
  - v-edge (tường dọc) → chỉ kéo theo chiều C (cột)
- Không xoá ô sàn nếu chỉ còn 1 ô (bảo vệ floor tối thiểu)

### Out of scope
- Kéo góc (diagonal)
- Snap to grid animation
- Resize tường ngoài biên map (W×H)
- Undo trong khi đang drag (chỉ undo sau khi thả)

---

## 4. Hướng dẫn implement

### Bước 1 — Lưu `hoveredEdge` trong `buildUpdateHandles`

Tìm hàm `buildUpdateHandles(e)` (dòng ~4143). Thêm biến ngoài scope:
```js
let hoveredEdge = null; // { type:'h'|'v', ec, er, endpointA:[c,r], endpointB:[c,r] }
```
Cuối hàm, sau khi tìm được `best`, assign:
```js
hoveredEdge = best ? { ...best } : null;
```
Nếu không có `best`, `hoveredEdge = null`.

### Bước 2 — State drag

Thêm biến ngoài scope (gần `hoveredEdge`):
```js
let wallDrag = null;
// wallDrag = {
//   edge: hoveredEdge snapshot,  // edge đang kéo
//   startFloor: Set<string>,     // snapshot FP2.floor khi bắt đầu drag
//   axis: 'row'|'col',           // trục kéo
//   fixedCoord: number,           // hàng/cột cố định của wall
//   startCell: [c,r],            // ô sàn tại điểm mousedown
//   dir: 1|-1                    // hướng kéo tính từ edge
// }
```

### Bước 3 — Overwrite `FP2._onPointerDown` trong block hiện có (dòng ~4100+)

Tìm đoạn:
```js
const _origOnPointerMove = FP2._onPointerMove;
FP2._onPointerMove = function(e){
```
Ngay **trước** dòng này, thêm override cho `_onPointerDown`:

```js
const _origOnPointerDown = FP2._onPointerDown;
FP2._onPointerDown = function(e){
  if(FP2.mode === 'wall' && hoveredEdge && e.button === 0){
    e.stopPropagation();
    cv.setPointerCapture(e.pointerId);
    const snap = new Set(FP2.floor);
    // xác định trục và hướng
    if(hoveredEdge.type === 'h'){
      // h-edge: tường ngang dưới hàng er, kéo theo row
      wallDrag = { edge: {...hoveredEdge}, startFloor: snap, axis:'row', fixedC: hoveredEdge.ec, fixedR: hoveredEdge.er };
    } else {
      // v-edge: tường dọc phải cột ec, kéo theo col
      wallDrag = { edge: {...hoveredEdge}, startFloor: snap, axis:'col', fixedC: hoveredEdge.ec, fixedR: hoveredEdge.er };
    }
    return;
  }
  _origOnPointerDown(e);
};
```

### Bước 4 — Overwrite `FP2._onPointerMove` (đang wrap `_origOnPointerMove`)

Trong wrapper hiện có của `FP2._onPointerMove`, **thêm đầu hàm**:
```js
// Wall drag in progress
if(wallDrag){
  const cell = cellFromEvent(e); if(!cell) return;
  const [nc, nr] = cell;
  // Khôi phục floor về snapshot
  FP2.floor = new Set(wallDrag.startFloor);
  if(wallDrag.axis === 'row'){
    // h-edge: tường ngang ở dưới hàng fixedR
    // Các ô sàn liên quan là hàng fixedR (trên edge) và fixedR+1 (dưới edge)
    // Thêm ô theo hướng kéo
    const targetR = nr <= wallDrag.fixedR ? nr : nr - 1;
    if(targetR >= 0 && targetR < H_BASE + 20){
      // Thêm/xoá các ô cùng cột ec từ fixedR đến targetR
      const r0 = Math.min(wallDrag.fixedR, targetR);
      const r1 = Math.max(wallDrag.fixedR, targetR);
      for(let r = r0; r <= r1; r++){
        FP2.floor.add(`${wallDrag.fixedC},${r}`);
      }
    }
  } else {
    // v-edge: tường dọc phải cột fixedC
    const targetC = nc <= wallDrag.fixedC ? nc : nc - 1;
    if(targetC >= 0 && targetC < W){
      const c0 = Math.min(wallDrag.fixedC, targetC);
      const c1 = Math.max(wallDrag.fixedC, targetC);
      for(let c = c0; c <= c1; c++){
        FP2.floor.add(`${c},${wallDrag.fixedR}`);
      }
    }
  }
  if(FP2.floor.size > 0) fp2Apply();
  return;
}
```

### Bước 5 — Overwrite `FP2._onPointerUp`

```js
const _origOnPointerUp = FP2._onPointerUp;
FP2._onPointerUp = function(e){
  if(wallDrag){
    fp2Snapshot(); fp2Save();
    wallDrag = null;
    return;
  }
  _origOnPointerUp(e);
};
```

---

## 5. Vị trí chèn code trong file

Tìm dòng:
```
const _origOnPointerMove = FP2._onPointerMove;
```
(khoảng dòng 4130). Chèn toàn bộ code bước 2→5 ngay trước dòng đó, bên trong block `(function setupFp2UI(){ ... })()`.

Biến `hoveredEdge` và `wallDrag` cần khai báo ngay sau dòng:
```
function buildClearHandles(){
```
→ trước `function buildUpdateHandles(e){` (khoảng dòng 4139).

---

## 6. Acceptance criteria

- [ ] Wall mode: hover cạnh tường → 2 orange sphere xuất hiện
- [ ] Mousedown trên/gần sphere → bắt đầu drag (cursor không xoay camera)
- [ ] Pointermove → floor cells tăng/giảm real-time, tường 3D cập nhật liên tục
- [ ] Pointerup → trạng thái được lưu localStorage + undo stack
- [ ] Undo (Ctrl+Z) sau drag → khôi phục floor về trước drag
- [ ] 0 console error, không break chế độ paint/furniture/erase

---

## 7. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Drag làm xoay camera hoặc can thiệp paint/furniture/erase | Chỉ bắt drag khi Build Mode + wall mode + pointer nằm trong bán kính 1 cell của endpoint; dùng các hook `_onPointer*` hiện có |
| Kéo vượt biên hoặc xoá hết floor | Clamp theo `W × H`; không xoá khi floor chỉ còn 1 ô |
| Undo ghi nhầm trạng thái sau drag | Snapshot `startFloor` trước khi persist; khôi phục live floor sau khi `fp2Snapshot()` ghi history |

Rollback point: revision nền `7bdd862a909994e3d7cfad0f045629eb92156f8d`; hoàn tác thay đổi chỉ trong `ai-office-standalone/index.html`.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Syntax | Parse từng inline `<script>` bằng Node `new Function` | Không có syntax error |
| Wall drag behavior | Mở standalone trong browser; vào Build → Wall; hover, drag endpoint theo row/col | 2 handle orange, floor/mesh cập nhật live, không orbit camera |
| Persistence/undo | Thả chuột, reload và Ctrl+Z | localStorage giữ trạng thái mới; Ctrl+Z trả floor về trước drag |
| Regression | Thử paint, furniture, erase và quan sát console | Không có console error hoặc thay đổi ngoài phạm vi |

## 9. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-20 | Base `7bdd862a909994e3d7cfad0f045629eb92156f8d` + target SHA-256 `BE31DB735A516CCC5C41BE204F2817E87A353881AC35AA31844AF16D87AED33C` | Implement hover state, endpoint proximity, constrained wall drag, floor updates, persistence and undo | Chỉ sửa implementation file đã frozen; các thay đổi không liên quan trong worktree được giữ nguyên |

## 10. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-20 | Target SHA-256 `BE31DB735A516CCC5C41BE204F2817E87A353881AC35AA31844AF16D87AED33C` | Parse 3 inline scripts bằng Node `new Function` | PASS | Cả 3 script báo `syntax OK` |
| 2026-11-20 | Target SHA-256 `BE31DB735A516CCC5C41BE204F2817E87A353881AC35AA31844AF16D87AED33C` | Chrome headless smoke test qua HTTP server | BLOCKED BY ENVIRONMENT | Three.js CDN bị `ERR_NETWORK_ACCESS_DENIED`, dẫn tới `THREE is not defined`; chưa thể xác nhận browser runtime |

## 11. Kết quả và trạng thái

- Kết quả: Đã triển khai drag handle theo một trục, giới hạn biên map, floor tối thiểu, localStorage và undo trước drag.
- Hạn chế còn lại: Browser smoke test cần môi trường cho phép tải Three.js CDN.
- Việc chưa hoàn tất: Chưa đóng trạng thái `CLOSED` cho đến khi chạy được browser smoke test với dependency Three.js.
- Rollback point: Base revision `7bdd862a909994e3d7cfad0f045629eb92156f8d`.
