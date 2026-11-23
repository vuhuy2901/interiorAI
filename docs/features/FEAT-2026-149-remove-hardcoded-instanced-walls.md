---
id: FEAT-2026-149
title: Remove hardcoded InstancedMesh walls (wm, bbMesh, wallLedMesh)
status: FROZEN
version: 1.0
created: 2026-11-21
---

## Scope
Remove the three old room-perimeter InstancedMesh objects from the scene:
- `wm` (walnut wall blocks)
- `bbMesh` (baseboard trim)
- `wallLedMesh` (LED kickboard strip)

These are built from the hardcoded `wall` Map and are separate from the FP2 WallGraph.
Only the FP2 WallGraph walls remain visible.

## Non-goals
- Do NOT remove the `wall` Map or `wk` array (still used by B() cache and door-index logic)
- Do NOT remove `setBaseWallVisible()` — replace body with no-op
- Do NOT touch furniture, floor tiles, or FP2 system

## Affected components
- `ai-office-standalone/index.html`:
  - L1422: `S.add(wm)` → remove / set invisible
  - L1434: `S.add(bbMesh)` → remove / set invisible
  - L1445: `ledGroup.add(wallLedMesh)` → remove / set invisible
  - `setBaseWallVisible()`: replace body with no-op comment

## Acceptance criteria
1. Scene renders with no hardcoded block walls visible
2. FP2 WallGraph walls still render correctly
3. No JS errors on page load
4. Syntax OK (3 script blocks pass)

## Rollback
Revert this commit.
