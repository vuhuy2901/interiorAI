# [FEAT-2026-141] Room Detection — tự nhận diện phòng khi tường khép kín

| Trạng thái | FROZEN | Phiên bản | 1.0 | Frozen | 2026-11-20 |

## 1. Tính năng

Khi walls tạo thành vòng khép kín → tự tạo Room {id, name, wallLoop, area, labelMesh}.
Room label "Tên phòng – XXm²" hiện ở centroid.

## 2. Thuật toán (planar graph face detection)

```js
function detectRooms(){
  // Build adjacency: nodeId → [wallId, neighborNodeId][]
  const adj = new Map();
  for(const [nid] of FP2.wallNodes) adj.set(nid,[]);
  for(const w of FP2.walls.values()){
    adj.get(w.startId).push({wallId:w.id, next:w.endId});
    adj.get(w.endId).push({wallId:w.id, next:w.startId});
  }
  // Find all minimal cycles using left-turn traversal
  const usedEdges = new Set(); // "wallId:direction"
  const rooms = [];
  for(const startNode of FP2.wallNodes.keys()){
    for(const {wallId, next} of adj.get(startNode)||[]){
      const key = wallId+':'+startNode;
      if(usedEdges.has(key)) continue;
      const loop = traceLoop(startNode, wallId, next, adj, usedEdges);
      if(loop && loop.length >= 3){
        const area = polygonArea(loop.map(nid=>FP2.wallNodes.get(nid)));
        if(area > 0.1) rooms.push({wallLoop:loop, area});
      }
    }
  }
  return rooms;
}

function traceLoop(startNode, firstWall, firstNext, adj, usedEdges){
  const loop = [startNode];
  const edgesUsed = [];
  let cur = firstNext, prev = startNode, curWall = firstWall;
  for(let i=0;i<100;i++){
    const ekey = curWall+':'+prev;
    if(usedEdges.has(ekey)) return null;
    edgesUsed.push(ekey);
    loop.push(cur);
    if(cur === startNode) break;
    // Turn left: pick next edge with minimum left turn angle
    const neighbors = adj.get(cur).filter(e=>e.next!==prev);
    if(!neighbors.length) return null;
    // Find leftmost turn
    const inAngle = Math.atan2(
      FP2.wallNodes.get(cur).x - FP2.wallNodes.get(prev).x,
      FP2.wallNodes.get(cur).z - FP2.wallNodes.get(prev).z
    );
    neighbors.sort((a,b)=>{
      const aa = Math.atan2(FP2.wallNodes.get(a.next).x-FP2.wallNodes.get(cur).x, FP2.wallNodes.get(a.next).z-FP2.wallNodes.get(cur).z);
      const ab = Math.atan2(FP2.wallNodes.get(b.next).x-FP2.wallNodes.get(cur).x, FP2.wallNodes.get(b.next).z-FP2.wallNodes.get(cur).z);
      return ((aa-inAngle+3*Math.PI)%(2*Math.PI)) - ((ab-inAngle+3*Math.PI)%(2*Math.PI));
    });
    const chosen = neighbors[0];
    prev = cur; cur = chosen.next; curWall = chosen.wallId;
  }
  if(loop[loop.length-1]!==startNode) return null;
  for(const ek of edgesUsed) usedEdges.add(ek);
  return loop;
}

function polygonArea(pts){
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++) a+=pts[j].x*pts[i].z-pts[i].x*pts[j].z;
  return Math.abs(a)/2;
}
```

## 3. Room data + labels

```js
FP2.detectedRooms = []; // [{wallLoop, area, name, labelMesh}]
FP2.roomLabelGroup = new T.Group(); scene.add(FP2.roomLabelGroup);

function rebuildRooms(){
  // Clear label meshes
  FP2.roomLabelGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();});
  while(FP2.roomLabelGroup.children.length) FP2.roomLabelGroup.remove(FP2.roomLabelGroup.children[0]);
  FP2.detectedRooms = detectRooms();
  FP2.detectedRooms.forEach((r,i)=>{
    if(!r.name) r.name = 'Phòng '+(i+1);
    // Floor mesh (ShapeGeometry từ wallLoop)
    const pts = r.wallLoop.slice(0,-1).map(nid=>FP2.wallNodes.get(nid));
    const shape = new T.Shape(pts.map(p=>new T.Vector2(p.x,p.z)));
    const geo = new T.ShapeGeometry(shape);
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({color:0x2a1f14,opacity:0.3,transparent:true,side:T.DoubleSide}));
    mesh.rotation.x=-Math.PI/2; mesh.position.y=0.002;
    FP2.roomLabelGroup.add(mesh);
    // Label (canvas texture)
    const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
    const cz = pts.reduce((s,p)=>s+p.z,0)/pts.length;
    const label = makeRoomLabel(r.name, r.area.toFixed(1));
    label.position.set(cx,0.5,cz);
    FP2.roomLabelGroup.add(label);
  });
}
```

Room labels: canvas texture sprite (giống cách hiện tại).

## 4. Trigger rebuildRooms

Gọi `rebuildRooms()` ở cuối:
- `WG.buildMeshes()` 
- `fp2Apply()`

## 5. Acceptance criteria
- [ ] 7 phòng seeded tự động được detect
- [ ] Vẽ wall mới khép kín vòng → phòng mới xuất hiện ngay
- [ ] Xóa wall phá vòng → phòng biến mất
- [ ] Label "Phòng X – Ym²" hiện ở centroid
- [ ] No console errors với T/X junction

## 6. Verification evidence

- 2026-11-20: JavaScript syntax validation passed: `OK: 3 ERR: 0`.
- 2026-11-20: Required implementation markers passed: `handleGroup`, `rebuildRooms`, `detectRooms`, `fp2WallProps`, select tab, and `handleDrag` all present.
- Implementation revision: `9db7dd3c35c6646c73ae0b5f621eae4f57e3c6d8`.
