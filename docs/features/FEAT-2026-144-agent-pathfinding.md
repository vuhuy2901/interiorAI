# [FEAT-2026-144] Agent A* Pathfinding through doors on WallGraph navgrid

| Trạng thái | FROZEN | Phiên bản | 1.0 | Frozen | 2026-11-20 |

## Mục tiêu
Agents di chuyển qua các phòng bằng cách đi qua openings (cửa) trên WallGraph walls.
Currently agents use a floor-cell based path; this upgrade replaces that with an A* on a continuous navgrid that respects walls.

## Thuật toán
1. Build navgrid từ WallGraph: grid CS/2 × CS/2, mark cells as BLOCKED nếu chúng overlap với wall segments
2. Mark PASSABLE gap ở vị trí door openings
3. A* on grid với heuristic = Euclidean distance
4. Smooth path with line-of-sight checks (remove redundant waypoints)

## Implementation
```js
function buildNavGrid(){
  // Grid resolution: GS = CS/2 = 0.25m
  const GS=CS/2, GW=Math.ceil(30/GS), GH=Math.ceil(20/GS);
  const blocked=new Uint8Array(GW*GH); // 0=free, 1=blocked
  for(const wall of FP2.walls.values()){
    // Mark cells covered by wall segment as blocked
    // Use Bresenham-like rasterization of thick wall line
    ...
  }
  // Mark door openings as passable
  for(const op of FP2.wallOpenings){
    // Mark GS cells around opening as free
    ...
  }
  FP2._navGrid={blocked,GW,GH,GS};
}

function astar(x0,z0,x1,z1){
  // Returns [{x,z}] path or null
  ...
}
```

## Integration
- Call `buildNavGrid()` after `WG.buildMeshes()`
- In Agent.update(): use astar() for new path requests
- Fallback: if no path found, use existing direct movement

## Acceptance criteria
- [ ] Agents path around walls (don't walk through walls)
- [ ] Agents pass through door openings
- [ ] No significant performance drop (< 2ms per pathfind for 9 agents)
- [ ] Fallback to direct movement if wall graph empty
