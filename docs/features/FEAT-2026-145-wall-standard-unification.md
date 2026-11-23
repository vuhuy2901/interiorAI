---
id: FEAT-2026-145
title: Wall Standard Unification — WALL_STANDARD (H=2.6, T=0.15)
status: FROZEN
version: 1.0
created: 2026-11-21
---

## Scope
Unify ALL wall types in the scene to one standard: WALL_STANDARD = { H: 2.6, T: 0.15 }.
Remove glass partition InstancedMesh. Fix BUILD→LIVE toggle bug. Hide thickness/height from wall panel.

## Non-goals
- Do NOT touch cb() furniture/decor objects (bar counter, shelving, feature accent walls)
- Do NOT convert hardcoded rooms to WallGraph nodes (future feature)
- Do NOT implement polylabel library (use centroid approximation)

## Affected components
- `ai-office-standalone/index.html`:
  - L1 script top: add WALL_H=2.6, WALL_T=0.15, WALL_COL=0x38281d
  - L1393: InstancedMesh height conditional → const h = WALL_H
  - L1427-1448: glassM InstancedMesh → remove (scale all to 0 for safety)
  - L2635: WG WALL_THICKNESS=0.1,WALL_HEIGHT=0.85 → WALL_T, WALL_H
  - L2944: fp2SeedDefaultWalls → all th→WALL_T, all h→WALL_H
  - L836-845: fp2WallProps panel → hide fp2WallTh/fp2WallHt rows
  - WG.addWall: add dev warning if th/ht differ from standard

## Acceptance criteria
1. `WALL_H` and `WALL_T` declared as module-level const
2. All InstancedMesh wall cells same height (no conditional 0.85 vs 2.6)
3. glassM mesh removed or scaled to 0
4. WG.addWall default = WALL_T/WALL_H; seed all segments same
5. fp2WallTh/fp2WallHt inputs hidden in panel
6. Dev warning logged when non-standard wall created
7. BUILD→LIVE toggle works (bug fix already in code)
8. Syntax OK (3 script blocks pass)

## Rollback
Revert to commit 4e1629b9 (before this change).
