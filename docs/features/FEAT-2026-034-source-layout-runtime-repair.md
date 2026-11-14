# Source layout and native task runtime repair

Status: FROZEN
Version: 1.1
Owner: Codex
Approved scope: user request 2026-11-13
Frozen at: 2026-11-13

## Scope and components
Repair canonical-to-Pascal coordinate preservation in packages/pascal-adapter/gateway.mjs and native task context in apps/api/app/services/paperclip_task_adapter.py. Audit the existing children's bedroom scene against the original image before changing its revision. No new project or duplicate Geometry task. No scheduler rewrite, automatic layout, final rendering or safety approval.

### Change request 1 — Studio semantic geometry and opening orientation

Reason: live inspection on 2026-11-13 proved that the Studio renderer draws every unsupported furniture category as a solid box and draws every door/window horizontally regardless of its host wall. Correct canonical coordinates alone therefore cannot satisfy the source-layout acceptance criteria. Impact: extend the frozen scope to `paperclip/ui/src/features/atelier/StudioViewport.tsx` and focused renderer tests only. Approval: the user's repeated request to repair the currently open 2D/3D scene and the latest screenshot showing these exact defects. The non-goals remain unchanged.

### Change request 2 — Source-wall anchoring and corrected brief

Reason: the user supplied a corrected coordinate contract on 2026-11-13: 2300×4000 mm, top-left origin, wall anchors, one eight-step bunk stair, and explicit object dimensions/heights. Impact: extend the frozen scope to optional `wall`, `align`, `offset_mm`, and `wall_distance_mm` fields on canonical furniture plus deterministic anchor resolution in the Pascal adapter. The live revision must use these values and preserve the prior revision. Approval: the user's explicit correction in this chat. The 2300 mm envelope conflicts with the source drawing's 1970 mm bed plus the separate 600/520 mm chains and with the 860 mm door swing beside a 2000 mm right-aligned wardrobe; the implementation must retain the requested envelope but report those conflicts instead of claiming a 20 mm source-overlay pass.

### Change request 3 — Real wall openings and operable door/window visuals

Reason: revision 3 proves that the Studio still renders each wall as one solid box, overlays the window as a thick floating box, and has no 3D door leaf. Impact: extend the frozen scope to split wall meshes around canonical openings, embed a thin glass/frame assembly in the resulting window cut, render an inward-swinging hinged door and improve the matching 2D symbols. No layout, project data, materials, object placement or Studio controls may change. Approval: the user's screenshot and explicit request on 2026-11-13.

### Change request 4 — Correct right-wall bunk/stair anchoring and render evidence

Reason: the user clarified from the source drawing that the bunk-bed and its full-width stair terminate flush at the right wall. Revision 3 incorrectly treated the `520 mm` desk/tap depth as an additional right-side clearance, leaving the bunk bounds at `x=610..2580` in a 3100 mm room. The source dimension `1970` already includes the `1450 + 520` horizontal chain, so the extra 520 mm must not be added again. Impact: preserve revision 3, create one new scene revision with bunk and stair anchored to the right wall (`wall=right`, zero wall distance), keep their vertical relationship unchanged, and produce Blender Cycles top/corner preview evidence. This does not approve the unresolved total room width, materials, bunk safety, construction dimensions, or final render. Approval: the user's attached source drawing and explicit correction on 2026-11-13.

## Acceptance criteria
- Preserve zero coordinates and rotation from canonical inputs.
- Resolve opening wall references from canonical wall IDs before legacy indices. Reject ambiguous references instead of assigning arbitrary walls.
- Reject absent room polygon rather than substituting a demo room.
- Native task description carries local/native project IDs, backend URL, discovery and scene entry points, and published snapshot node configuration.
- Door and window graphics follow the angle of their referenced wall in both 2D and 3D.
- Door and window openings remove wall geometry across their actual width and height; window glass is flush with the wall and a hinged door has a visible inward-opening leaf.
- Bunk bed, desk, wardrobe, bookshelf and staircase categories render as recognizable functional geometry rather than one solid fallback box.
- The live children's-bedroom revision places the west-wall entry, south wardrobe, east desk/window, north-east bunk/stair and north-west bookshelf according to the source drawing; inferred envelope and heights remain explicitly provisional.
- Bunk and stair right bounds equal the room's inner right boundary with zero clearance; the stair remains directly above the bunk with no overlap or gap caused by coordinate conversion.
- Blender Cycles top and corner preview renders are persisted in the existing project's Render Gallery and identify the exact scene revision.
- Validate regression cases and record live scene verification separately. Completion requires source overlay, 2D and isometric evidence and an editable scene revision.

## Risks and rollback
Legacy invalid geometry may now fail visibly. Preserve existing files and revisions. Roll back only this pass's patch hunks, never unrelated worktree changes. API discovery does not prove every execution can access the backend. Unknown dimensions retain provisional status.

## Verification plan
Run Python adapter regression tests, node syntax validation, and canonical zero-coordinate/wall-reference regression checks. Inspect source image, project data and rendered scene before accepting visual equivalence. Record exact revision and unverified acceptance criteria below.

## Evidence
2026-11-13 source revision ce745117d19dbffb0f0bf993a605a38ad02415a6 plus uncommitted patch. `python -m pytest tests/test_paperclip_task_adapter.py tests/test_pascal_source_layout.py -q`: 6 passed in 6.93s. `node --check packages/pascal-adapter/gateway.mjs`: passed.

After change requests 1–2: the focused Python suite passes 7 tests in 7.28s and the gateway syntax check passes. The Pascal host rejects authored geometry with the explicit capability code `scripts_unavailable`; the adapter now records that limitation and never substitutes a guessed catalog asset. Studio semantic geometry remains the active rendering path. Paperclip UI typecheck reached an unrelated pre-existing error at `ui/src/features/atelier/UnifiedBOQPage.tsx:135` (`Cannot find name 'bool'`); no error in `StudioViewport.tsx` was reported before that stop.

After change request 3: `openingGeometry.test.ts` passes 2/2 focused tests, the complete Paperclip UI production build succeeds, and `git diff --check` passes for the renderer files. Live browser verification on `proj_564f46a5` revision 3 confirms the west-wall door has a real opening, frame and inward-open leaf; the east-wall window is a thin framed two-pane assembly embedded in a wall cut instead of a floating box. Top-view and split-view screenshots were inspected in the running Studio at `/ATL/design-studio`.

Source image visually inspected at data/runs/run_c2792ebd38/inputs/34-thiet-ke-mat-bang-phong-ngu-tre-em-co-giuong-tang.jpg. Live proj_kid_bedroom revision 2 still contains seeded 3600x3200 polygon, south-wall door and incorrectly located furniture. Seed origin found in apps/api/app/db.py. No live geometry revision changed in this pass. Overlay, functional furniture geometry, Studio screenshots, zero-coordinate end-to-end validation and live backend reload of the Python task adapter remain pending. Status remains FROZEN with implementation in progress, not CLOSED.

The currently open project `proj_564f46a5` remains at revision 2 and has not been mutated while total width is unresolved. The source includes incompatible horizontal chains: `228 + 600 + 1450 = 2278 mm`, while the bed-side chain `600 + 1970 + 520 = 3090 mm` matches the existing approximately 3100 mm envelope. A 2300 mm room also forces the 2000 mm right-aligned wardrobe into the 860 mm west-door swing zone. Live revision, overlay and screenshots therefore remain pending explicit width confirmation.

After change request 4: preserved revision 3 and created editable revision 4 for `proj_564f46a5`. The bunk and the single eight-step stair moved from center `x=1595 mm` (right bound `2580 mm`) to `x=2115 mm` (right bound `3100 mm`) in the current provisional 3100 mm envelope. Both now carry `wall=right` and `wall_distance_mm=0`; their vertical bounds remain contiguous (`stair y=0..400`, `bunk y=400..1630`). Spatial QA reports zero collisions, zero boundary violations, zero door-swing warnings, and a 790 mm minimum walkway. Blender Cycles 4.2.3 preview jobs `rjob_4d8702a318` (top) and `rjob_91c60105b5` (corner) completed on GPU CUDA and persisted against revision 4; scene verification passed exact object counts and <=2 mm position/dimension checks. Semantic fallback verification records 7 bunk meshes and 8 stair meshes instead of one box each. Focused camera/semantic-render tests pass 3/3. This evidence proves the requested right-wall contact in the current envelope; it does not resolve the conflicting total-width chains or constitute construction/final-render approval.
