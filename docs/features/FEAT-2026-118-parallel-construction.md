# Parallel construction and playback speed

Status: FROZEN | Version: 1.0 | Owner: Codex | Approved: user, 2026-11-16

## Scope, acceptance and components
Implement the accepted three-worker plan: maximum three concurrent distinct objects, FIFO assignment, next work assigned when a worker returns. Fixed green/blue/orange shirts and numbered status rows. A single selected object uses one worker. One animation clock/render per frame. Global 1x/2x/5x applies to all animation phases and walk cycles, supports changing while paused/running, defaults 1x on page reload and stays selected between plays on the same page. Selection never starts animation. Preserve floor/opposite-edge routing, existing grouping, ordered history and idempotent completion.

Affected components: construction history playback/state/actions, worker factory, history panel/CSS, unit tests and live browser verification. API/database, agent runtime, GLB, geometry, credentials and service configuration remain unchanged. Non-goals: obstacle/path collision avoidance or cooperative carrying of one item.

## Implementation and verification
Extract cohesive playback controller from source grouping module. Maintain three job slots and one RAF. Apply placement threshold independently of phase branches so high-speed/frame skips cannot lose placement/completion. Dispose worker-owned resources only; stop/unmount restores source visibility. UI shows colors, job names and phases with speed controls. Validate >=7 jobs, no duplicates or >3 active, refilling freed slots, single-item mode, speed ratios/mid-run changes, pause/stop, upper-floor height, placement threshold and no history duplication; UI typecheck and Chromium real-scene checks.

## Risks, rollback and freeze
Frame skips, concurrent cleanup, asynchronous ledger writes and shared source materials are tested explicitly. Rollback only this pass's hunks/new module; retain history ledger and source asset. Dependencies unchanged. Frozen by Codex based on explicit user-approved plan before code edits. Verification and working-tree fingerprints appended before closing.

## Implementation and verification — 2026-11-16

Status: CLOSED (local acceptance). Existing unrelated dirty worktree retained; no commit created.

- Source grouping and interfaces remain in constructionHistory.ts; extracted constructionPlayback.ts owns three FIFO job slots, one RAF, per-worker phase state and cleanup, placement/completion threshold independent of phase branches, speed scaling and page-local speed preference. Worker factory accepts optional identity/shirt color while preserving existing callers.
- History panel includes 1×/2×/5× controls and three colored numbered status rows plus item-to-worker indicators. API, history order and database schema unchanged. Replay and single-item controls continue using existing command interface.
- UI typecheck: PASS. Focused Vitest: 8/8 PASS, including seven jobs/three slots, unique colors, FIFO refill without waiting for other workers, one render per animation frame, speed ratios and mid-run continuity, pause while changing speed, single-object mode, stop/unmount restoration, source geometry ownership, floor height and exactly-once completion at 5×. Initial FIFO test failed because its scene-derived floor boundary differed from the test's assumed boundary; supplied explicit floor geometry and reran successfully. No failed result treated as acceptance.
- `node scripts/verify-atelier-construction.mjs`: live Chromium/5173 PASS with zero page errors. Confirmed three simultaneous distinct jobs and fixed green/blue/orange colors; 2×/5× controls, pause/resume preserving all progress; single-object/upper-floor placement, curtain and railing replay, stop/reload; 31 retained history entries and 1× after reload.
- Screenshot: `scratch/construction-three-workers.png`, visually inspected status rows, speed controls and full-scene playback. Some worker routes can be occluded by the original architecture/cargo; no obstacle avoidance introduced.
- `git diff --check`: PASS (pre-existing LF/CRLF notices only). Backend and provider/service configuration unchanged in this pass. CI/PR checks not run.
- Working-tree SHA-256: constructionPlayback.ts `F8177F8921CC76FB5BF7707B2F05307C80696FCE93FB675B23E70830479F1832`; ConstructionHistoryPanel.tsx `94DD758DF112D03DFCC25ABA04A15DAEC4DA4C46AF7D5FAFDB6A7D0E57E50511`; furnitureDeliveryAnimation.ts `5E773CCF5DDF0D68F5060C0B8BF7E043BF7A8D505725440936D819F56B685E4A`.

Rollback: restore only the three-worker controller/UI/factory hunks and remove the new playback module, preserving preceding scene-detail grouping and history ledger.
