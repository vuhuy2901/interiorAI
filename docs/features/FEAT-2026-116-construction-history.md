# Construction history and floor-aware delivery

Status: FROZEN | Version: 1.0 | Owner: Codex | Accepted: user, 2026-11-16

## Context and scope
Replace raw external GLB mesh list with furniture construction history. Keep source geometry and materials intact. Group material parts under source object identities; architectural meshes and small background details stay base. Seed current furniture history, use UI label “Lịch sử”. Replay sequentially, hide pending furniture, reveal at placement, restore on stop/unmount. Keep whole-scene camera. Future newly built furniture enters a durable queue and history only after installation. Correct floor height and opposite-edge entry.

## Components and interfaces
Atelier viewer, inspector, studio page, new construction classification/playback modules; API project-scoped history persistence. Stable source asset hash plus project ID scopes records. No changes to provider credentials, service ports, source GLB or agent execution/approval semantics.

## Acceptance and verification
Selecting only highlights, never starts animation. Replay all runs exactly one item at a time with pause/resume/stop. Base remains visible. Group placement retains original transforms and materials. Worker feet remain at configured floor elevation and enter from opposite edge. History survives reload without duplication; changed assets do not reuse records. Validate focused unit/API tests, UI typecheck and runtime journey where available; report unverified evidence explicitly.

## Risks and rollback
Generic source names need inspected manifest, not semantic guesses. Unknown/merged items remain base until classified. Interrupted playback restores visibility. Revert only feature files/hunks to starting revision; retain history data for forward compatibility. Existing unrelated work is preserved.

## Frozen confirmation
Scope, non-goals, acceptance, dependencies and rollback frozen 2026-11-16 by Codex based on explicit user approval. Start revision recorded during implementation. Verification and final working-tree hashes appended below; do not close without evidence.

## Implementation and verification — 2026-11-16

Start/base revision: `3261214a749365962424c7d266aa2c859dd95253`. Work is uncommitted; existing unrelated edits retained.

- Source GLB inspected with Three GLTFLoader: 77 mesh primitives, grouped into 19 furniture installations. Multi-material dining, kitchen and bookcases grouped; other meshes stay visible base. Source hash explicitly gates this manifest. Floor bounds and height derived after root transforms.
- Label is simply “Lịch sử”. Source history seeded once. Initial legacy Pascal IDs are retained as excluded baseline; later additions enqueue and only move into history on placement. Ledger stored separately in SQLite, without design revision mutations. POST `/api/v1/projects/{project_id}/construction-history`: initialize/complete, active asset hash required, idempotent completion.
- Playback uses its own event/controller lifecycle; selection does not rebuild external scene. Whole-scene front view used to expose both floors below the roof. Cargo copies share original geometry/material without modifying source transforms. Cancellation restores visibility.
- `npm run typecheck` (paperclip/ui): PASS.
- Focused Vitest: 6/6 PASS, including three-item sequential replay, opposite-edge direction, upper-floor walk height, pause, stop, architectural exclusion and selection without playback.
- `python -m pytest tests/test_construction_history.py -q`: 1/1 PASS; persistence isolation, baseline exclusion, pending enqueue and duplicate completion.
- `node scripts/verify-atelier-construction.mjs`: PASS on live Chromium/5173 and API/8000. Verified 19 history records; selection does not start; upper-floor actor height; selected item hidden before placement and visible after placement; pause/resume/stop; replay-all hides later items; reload preserves history; zero page errors.
- Screenshots: `scratch/construction-history-selected.png`, `scratch/construction-history-upper-floor.png`, `scratch/construction-history-placed.png`. Visually inspected the whole-scene front overview and actor on upper floor.
- `git diff --check`: PASS (existing line-ending notices only).
- Backend reloaded using repository `.venv`; global Python lacked ezdxf and failed before startup. Repository environment started successfully on 8000; no service/provider configuration edits.

Working-tree fingerprints (SHA-256): constructionHistory.ts `94387F15681EA8E7900072EB6B7368E7175D2CEBFF19EC6A139E09A508BA0E55`; StudioViewport.tsx `2D6103211087DE95F2ACD3E48F91DFAB061B883DC30328C8D953EBD670ED066E`; construction_history.py `703E22B62E6B4820DEB9904DC63C96F44E8505D373B56EA71FBBDB0DD23EC56C`.

Limits: source-specific manifest; unknown assets need their own inspected groups. Opposite-edge straight routes do not perform obstacle avoidance. Automatic new-item queue verified via isolated persistence tests; no live agent task was created during verification. CI/PR checks were not invoked. Source mesh grouping is preserved; animation is a visualization, not a structural construction simulation.

Status: CLOSED (local acceptance), Codex, 2026-11-16. Rollback: revert only this feature's hunks/new modules to base, retain the ledger table and GLB for compatibility.
