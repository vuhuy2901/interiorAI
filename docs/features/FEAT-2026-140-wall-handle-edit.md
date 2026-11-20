# [FEAT-2026-140] Wall Handle Edit — kéo endpoint, push/pull

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File | ai-office-standalone/index.html |
| Frozen | 2026-11-20 |
| Implements | Spec §2 Chỉnh sửa tường |

## 1. Tính năng

Khi FP2.mode === 'select' (hoặc 'wall' khi hover tường):
- Click tường → chọn tường → hiện 3 handles:
  - Handle A: sphere tại n0 (startId node), màu 0xff6600
  - Handle B: sphere tại n1 (endId node), màu 0xff6600
  - Handle M: sphere ở midpoint, màu 0xffcc00
- Kéo Handle A/B: di chuyển node đó (tất cả walls nối vào node đó cập nhật)
- Kéo Handle M: di chuyển cả wall song song (cả 2 node dịch cùng vector)
- Delete khi tường đang chọn: xóa wall, dọn orphan nodes

## 2. Data

```js
FP2.selectedWallId = null; // id tường đang chọn
FP2.handleGroup = new T.Group(); // 3 sphere handles
scene.add(FP2.handleGroup);
```

Handle spheres: `new T.Mesh(new T.SphereGeometry(0.12,8,8), M(color))`

## 3. Logic

### Select (click trên wall mesh trong FP2.wallGroup)
- Trong FP2._onClick (hoặc pointerup nếu không drag):
  - Raycast FP2.wallGroup
  - Hit → set FP2.selectedWallId = hit.object.userData.wallId
  - Gọi updateHandles()

### updateHandles()
- Clear FP2.handleGroup
- Lấy wall = FP2.walls.get(selectedWallId)
- n0, n1 từ wallNodes
- Đặt 3 spheres tại n0, n1, midpoint
- Đánh dấu userData: {handleType:'endpoint'|'midpoint', nodeId, wallId}

### Drag handle (pointerdown → pointermove → pointerup)
```js
let handleDrag = null;
// {handleType, wallId, nodeId, startPt, origNodes: Map snapshot}
```

Trong FP2._onPointerDown:
```js
// Raycast FP2.handleGroup TRƯỚC
const hits = raycaster.intersectObjects(FP2.handleGroup.children);
if(hits.length){
  const hud = hits[0].object.userData;
  handleDrag = {handleType: hud.handleType, wallId: hud.wallId, nodeId: hud.nodeId};
  cv.setPointerCapture(e.pointerId); return;
}
```

Trong FP2._onPointerMove:
```js
if(handleDrag){
  const pt = buildPointerPoint(e); if(!pt) return;
  const sx = Math.round(pt.x/(CS/2))*(CS/2), sz = Math.round(pt.z/(CS/2))*(CS/2);
  if(handleDrag.handleType === 'endpoint'){
    FP2.wallNodes.get(handleDrag.nodeId).x = sx;
    FP2.wallNodes.get(handleDrag.nodeId).z = sz;
  } else { // midpoint: move both nodes
    const wall = FP2.walls.get(handleDrag.wallId);
    const n0 = FP2.wallNodes.get(wall.startId), n1 = FP2.wallNodes.get(wall.endId);
    if(!handleDrag._origN0) handleDrag._origN0={x:n0.x,z:n0.z}, handleDrag._origN1={x:n1.x,z:n1.z}, handleDrag._origPt={x:sx,z:sz};
    const dx=sx-handleDrag._origPt.x, dz=sz-handleDrag._origPt.z;
    n0.x=handleDrag._origN0.x+dx; n0.z=handleDrag._origN0.z+dz;
    n1.x=handleDrag._origN1.x+dx; n1.z=handleDrag._origN1.z+dz;
  }
  WG.buildMeshes(); updateHandles(); return;
}
```

Trong FP2._onPointerUp:
```js
if(handleDrag){ fp2Snapshot(); fp2Save(); handleDrag=null; return; }
```

### Delete selected wall
Phím Delete khi FP2.selectedWallId:
```js
if(e.key==='Delete' && FP2.active && FP2.selectedWallId){
  fp2Snapshot(); WG.removeWall(FP2.selectedWallId); FP2.selectedWallId=null;
  WG.buildMeshes(); clearHandles(); fp2Save();
}
```

## 4. Acceptance criteria
- [ ] Click wall → 3 handles xuất hiện (2 đầu + 1 giữa)
- [ ] Kéo handle đầu → wall dài/ngắn, không break walls khác dùng chung node
- [ ] Kéo handle giữa → wall dịch song song cả đoạn
- [ ] Delete → wall biến mất, nodes orphan được dọn
- [ ] Undo (Ctrl+Z) sau kéo → khôi phục
