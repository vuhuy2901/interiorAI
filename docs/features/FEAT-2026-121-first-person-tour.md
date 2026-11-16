# Floor-aware first-person tour with draggable visitor

Status: FROZEN | Version: 1.0 | Owner: Codex | Approved by user, 2026-11-16

## Scope and behavior
Upgrade the current external GLB walkthrough. First-person eye height 1.6m; WASD movement, left-drag mouse look, floor 1/2 selector, collision with walls/furniture and floor-edge support. No stairs. “Kéo nhân vật” opens a temporary top-down placement view with a visitor avatar; drag that avatar with mouse to an unoccupied supported position on selected floor, then “Vào góc nhìn thứ nhất”. Escape/exit returns to overview. Visitor and positioning do not change design or history. Keep source geometry/materials and project settings intact. Construction playback and walkthrough use the camera exclusively; entering one stops/exits the other.

## Implementation and affected components
Extend studioCamera with optional navigation constraint callbacks and walk-position setter; keep existing callers compatible. Separate tour geometry/navigation, visitor drag lifecycle and overlay panel from StudioViewport. Actual GLB floor meshes define support; double-sided geometry probes define colliders without changing original materials. Temporary placement hides geometry above selected floor and restores exact visibility on exit. Camera/visitor are viewer state only. Toolbar Walk label becomes “Tham quan”.

## Acceptance and verification
Both floors spawn on supported clear space at floor+1.6m. Keyboard steps cannot cross walls/furniture or slab/atrium edges; sliding along a wall remains possible. Avatar drag uses pointer capture and valid-floor checks, does not move furniture or select objects. Mouse look preserves eye elevation. Floor selection never uses stairs. Escape, blur, project change, unmount and switching camera presets clean up movement/listeners/avatar/temporary visibility. UI instructions and errors explain controls. Verify collision/support/safe spawn tests, camera regressions, UI typecheck and real-scene browser journey including drag, keyboard, floor change and exit.

## Risks, defaults and rollback
Source floors: actual Plane/Cube meshes in current inspected asset; do not infer upper floor from railing. Body radius 0.25m, eye 1.6m, walking speed 2m/s. Small movement substeps prevent tunneling. Geometry probes are conservative near close furniture; unsupported drag positions retain last valid position. Desktop mouse/keyboard is the primary UI; floor/placement/exit buttons remain usable on smaller screens. Rollback only this feature's files/hunks; no DB/API/auth/port changes. Frozen before implementation; append evidence and final working-tree fingerprints below.

## Implementation and acceptance — 2026-11-16

Status: CLOSED (local acceptance). Existing worktree edits preserved; no commit created.

- tourNavigation.ts owns double-sided geometry probes, actual floor support, radius checks, conservative furniture occupancy, safe spawn search and substepped movement/wall sliding. Probe meshes share geometry and own only a disposable probe material; original materials and visibility are unchanged.
- firstPersonTour.ts owns camera/visitor lifecycle, temporary placement visibility, same-floor drag validation/pointer capture, floor selection and Escape. TourControls.tsx supplies instructions and controls. studioCamera retains backwards-compatible free walk when navigation is absent and accepts constrained navigation when attached; movement/look synchronize the camera target for existing snapshots. Source GLB floors are Plane/Cube.
- TypeScript PASS. Focused Vitest 10/10 PASS: geometry support, two-floor eye height, atrium/edge rejection, furniture blocking, thin-wall tunneling prevention, sliding, original material preservation and existing delivery regressions.
- Live Chromium `node scripts/verify-atelier-tour.mjs`: PASS, zero page errors. Actual keyboard input moved visitor, mouse-drag look changed camera target without changing eye height, floor selector moved to upper floor, actual pointer drag repositioned visible avatar, switching back to first-person retained dragged coordinates, Esc restored overview. Replay still dispatched three jobs; entering walkthrough stopped them. Design revision unchanged across journey.
- Initial browser attempt used a fixed 600ms movement window and observed no movement before its assertion; replaced that timing assumption with a condition waiting for observed movement and reran successfully. Reviewed avatar placement and first-person screenshots from upper/ground floors. Also corrected placement blur handling so inactive overview controls are not disabled by browser blur.
- Evidence: `scratch/tour-drag-upper.png`, `scratch/tour-first-person-ground.png`, `scratch/tour-first-person-upper.png`. Initial timing-failure screenshot retained separately at `scratch/tour-check-failure.png`.
- `git diff --check` PASS (pre-existing line-ending notices). No API/backend/configuration changes or service restarts. No full CI/build performed.
- Final working-tree SHA-256: tourNavigation.ts `EAF74309C55402062B27441D7EE6C1A630D7BD874D58895CE3913E5BA2285572`; firstPersonTour.ts `AD1F4A626178A9270668E51D4F0BA57CC9EBCE791B823CBDCA491CB3F1E57C5B`; studioCamera.ts `9449E03EE38863317A017467D99019919DB23547FF441AE28125755D4B34D428`.

Limits: conservative furniture bounds can block narrow gaps/concave furniture openings; no stair traversal, gravity or jump. The inspected GLB's named floor meshes define the supported tour. Desktop mouse/keyboard is the tested input surface.
