# Simplify construction list presentation

Status: FROZEN | Version: 1.0 | Owner: Codex | User approved: 2026-11-16

Scope: remove the three numbered worker status cards, worker assignments and colored dots from history rows. Restore object-only history presentation, using generic installation status for active objects. Keep concurrent animation, shirt colors, speed and playback controls unchanged. Affected components: history panel and unused worker presentation CSS only. No API/schema/configuration changes.

Acceptance: no worker names or colored assignment indicators appear in the panel; object names, floor and generic status remain; 1x/2x/5x and replay/pause/stop still work. Verify UI typecheck and focused browser assertions. Risk: accidentally removing shared controller state; mitigate by UI-only edits. Rollback only this pass's panel/CSS hunks. Frozen before implementation; append results below.

## Verification — 2026-11-16

Status: CLOSED (local). Removed worker cards, assignment labels and colored dots; active objects display generic “Đang thi công”. Removed unused worker presentation CSS. Controller/actor state unchanged.

- UI typecheck and git diff --check: PASS (existing line-ending notices only).
- Live Chromium: PASS; 31 history entries, no worker-name text/cards/dots, replay still starts three distinct objects and 5x control still applies. First shell-fed browser command was interrupted while waiting; reran with ASCII-safe selectors and observed successful completion.
- Working-tree fingerprint: ConstructionHistoryPanel.tsx SHA-256 `0AE8E0ED0C7D621E15A3772A41569FD491DD03FEF22D1F9B83F0412F144514AF`. No commit created; unrelated work retained.
