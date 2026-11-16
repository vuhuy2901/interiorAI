# Installation history: scene details

Status: FROZEN, version 1.0, 2026-11-16. Owner: Codex. Approved by explicit user request.

## Scope and acceptance
Extend the previous installation history to curtains, railings and other scene details. Keep wall and floor geometry as fixed base. Preserve all source transforms, materials and meshes. Existing history must retain order; already-present newly classified source groups should be added to history without being mistaken for new agent builds. New actual items continue to queue. Identify source mixed groups and preserve architectural parts. Retain floor-aware opposite-edge animation, select-only highlight and replay controls.

## Components, risk and rollback
Source grouping manifest, installation history API initialization migration, grouping and persistence tests, live browser acceptance script. No settings/credential changes. Source names are generic; inspect geometry before assigning names. Rollback only this pass's hunks; retain ledger records and source asset. Unknown exterior backdrop geometry is not an installable building object and stays environment.

## Verification
UI typecheck; focused grouping/animation tests; API history migration tests; source mesh coverage; live browser selection, replay and reload checks. Append evidence before closing.

## Evidence and final state — 2026-11-16

Status: CLOSED (local verification). Prior feature remains unchanged historically; this contract extends its grouping.

- Rendered source nodes separately into `scratch/scene-detail-contact-sheet.png` and inspected them. Corrected old cabinet label: node_0002 is the ground-floor curtain. Cube010–014 are railing parts, not floor; upper worker floor now derives from the actual Cube slab. Selected only Material.004 in node_0010, preserving its concrete Material.002 wall.
- Source coverage: 31 installation groups. Only eight mesh primitives remain fixed: slab, floor, four wall primitives and two exterior environment meshes. Curtains, complete railing, window frames, pictures, rugs and ceiling included. No geometry removed or source GLB modified.
- Existing ledger initialization updates names/floor metadata, adds newly classified source items directly to history, and promotes previously queued source items without duplication; later agent furniture remains pending until installed.
- TypeScript: PASS. Focused Vitest: 7/7 PASS; API migration test: 1/1 PASS. Earlier grouping fixture failed because it still classified Cube010 railing as base; corrected fixture and added explicit railing/curtain/mixed-wall-frame assertions, then all tests passed.
- Live Chromium verification: 31 history entries, zero page errors; selection-only, upper-floor animation, hidden-before-placement/reveal, pause/resume/stop, replay all, reload persistence all passed. API restarted successfully in repository virtual environment on 8000.
- Working-tree SHA-256: constructionHistory.ts `D3AED4B4E783654F888E819EF316F56DB4335D560535FF0F26206F4772BB16DA`; construction_history.py `829F730FD212BA67F7CF3BA69B669B5AFA064FE09C8776B559425929C26C3E42`. No commit created.
- Limitation retained: combined right window frame spans both floors as one original mesh and installs as one group from the lower floor; geometry is not split. Exterior environment stays fixed. Paths remain straight from the opposite edge.
