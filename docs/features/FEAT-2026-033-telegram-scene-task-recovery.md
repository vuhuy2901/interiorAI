# FEAT-2026-033 — Telegram scene context and task recovery

Status: FROZEN. Version: 1.0. Owner: Codex / Nam.
Frozen: 2026-11-15. Starting revision: 3d28633d74942afcf640b5eb3930a908abc03712.
Authorization: user's attached end-to-end repair request, including applying one new bedroom bench.

## Context and scope
ATL-15 is blocked requesting bedroom data although canonical scene
proj_bedroom_japandi_4x4m exists. Its native project points to the living-room demo
and has no initialized workspace. Telegram forwards lifecycle status without
distinguishing execution/recovery. Identifier lookup parses UUID suffix as issue number.

Fix Telegram task lookup, project/scene context delivery and truthful activity
reporting; repair the actual project/scene binding through supported APIs. Execute
the necessary design/QA work with real agents and Pascal tools. Add a new bench
idempotently, preserve existing furniture and verify persisted geometry and UI.
Include narrowly required API/scene mutation or renderer fixes if evidenced.

Non-goals: merge branches, deploy publicly, replace the control plane, fabricate
agent outcomes, erase old tasks or existing furniture, change unrelated user edits.

## Ownership and components
- paperclip/server/src/services/atelier-telegram: context, lookup, status delivery.
- Atelier bridge / Python project linking and scene APIs: canonical scoped binding
  and revision-safe mutation, only if existing contracts are insufficient.
- Existing agent configuration/task APIs: supply correct scene/tool context and resume.
- Relevant server/Python tests; docs/testing evidence and real viewport screenshot.
- UI renderer only if an actual bench cannot render with existing geometry.

## Acceptance criteria
- [x] Task identifiers/UUIDs resolve exactly inside the configured company.
- [x] Agent receives canonical bedroom identity/revision; no living-room fallback.
- [x] Task waits and completed runs are not represented as ongoing design progress.
- [x] Necessary real agent tasks and handoffs have inspectable execution evidence.
- [x] One new bench exists near the bed foot, with no duplicate on retry and no
  unrelated object loss; scale, collision and access are checked against real geometry.
- [ ] Scene persists and appears in the actual 3D viewport after reload.
- [x] Targeted regression checks pass; broader failures/limitations remain recorded.

## Verification
Inspect health, task/run logs, project workspace and canonical scene before/after.
Run focused Vitest/Pytest for changed behavior plus existing acceptance checks.
Use actual Pascal gateway tools and record responses; do not substitute mock evidence.
Exercise real agent tasks and supported handoffs. Open browser, reload, save screenshot.
Record scene ID, revision, bench ID/transform, task/run IDs and exact test commands.

## Protection, risk and rollback
Preserve current dirty user files, existing PG/SQLite data, credentials and unrelated
services. Network work stays outside DB transactions. No broad migrations planned.
Scene writes use existing locks/revisions. Capture original scene and use supported
revision restore if needed; revert only this feature's edits for code rollback.
Do not reset repository or mark tasks done through direct SQL. Required user/input
gates remain explicit; latest request authorizes this bench application.

## Change log and evidence (append-only)
- v1.0 frozen before implementation. Evidence pending.
- 2026-11-15 — Telegram context implementation handoff (uncommitted working tree
  based on `3d28633d74942afcf640b5eb3930a908abc03712`; parent records final commit).
  Added `/projects` and `/project <native ID>`, chat/company-scoped persisted native
  selection, five-second demand-driven Python workspace validation, and bounded
  canonical IDs/URLs/revision instructions in task descriptions. Ambiguous,
  foreign, missing, malformed or offline context fails before creation/wake.
  Single-project fallback still requires a valid linked scene. Configuration
  writes are serialized atomic replacements; strict selection persistence errors
  do not claim success. Existing pairing/allowlist authorization remains in force.
  Creation uses `issueService(db).create(companyId, ...)` with `todo`, normal wake
  dispatch and result-based acknowledgments. Replies validate the scoped exact
  task before comment insertion and retain the original task after a project switch.
  `/report` and `/progress` report actual company-wide work, without demo claims.
- Supported board configuration (no Telegram impersonation, credentials update,
  message send, or poller restart): `POST /api/atelier/telegram/project-selection`
  with `{"chatId":<authorized-chat-id>,"nativeProjectId":"eb654960-2510-46d6-ade9-ea68a70bf64f"}`.
  Requires board/company access and the chat already in `allowedChatIds`.
  Success returns `ok`, `chatId`, and validated `context` (expected scene
  `proj_bedroom_japandi_4x4m`, with current observed revision). Context failures
  return 422; unauthorized actors/chats return 403. The endpoint was not called
  against live state by the context implementation agent.
- Verification on Windows, Node/Vitest, from `paperclip/server`:
  `pnpm exec vitest run --config vitest.config.ts src/services/atelier-telegram/project-selection-config.test.ts src/services/atelier-telegram/project-context.test.ts src/__tests__/atelier-telegram-project-selection.test.ts src/__tests__/atelier-telegram-project-selection-route.test.ts src/__tests__/atelier-telegram-task-lookup.test.ts src/__tests__/atelier-telegram-status-reporting.test.ts`
  passed **6 files / 56 tests**. Includes Laplace lookup/status tests, isolated
  PostgreSQL concurrent issue allocation, cross-company rejection, chat isolation,
  offline/missing/ambiguous scene handling, actual stalled HTTP cancellation,
  command/reply authorization and board-route restrictions. After the final atomic
  config-write change, reran
  `pnpm exec vitest run --config vitest.config.ts src/services/atelier-telegram/project-selection-config.test.ts`:
  **1 file / 1 test passed**, using disposable real filesystem storage and checking
  reload, concurrent checkpoint/selection writes, and failed persistence rollback.
  Scoped `git diff --check` passed. No live restart/mutation or UI edits performed
  by this agent. Broad build/typecheck/CI and live acceptance remain parent-owned;
  this evidence does not close the feature or claim live replay success.
- 2026-11-15 final local evidence: real Furniture ATL-15 implementation and QA
  ATL-17/ATL-18 completed through native task APIs. POST handoff replay returns
  the same ATL-18. Bedroom revision 1 -> 2, original seven objects and room shell
  preserved, new bench `bench_atl15_japandi` at (2095,2450,0) mm, size1200x400x450.
  Real Pascal node `item_gut0zyozqsat9m8u`, five parts/60 triangles. A second
  gateway process reopens the saved scene with eight items and fourteen artifacts.
  Found/fixed the invalid `loadScene` call (actual SDK API is `loadJSON`), removed
  snapshot fallback, registered the missing project 3D routes, and repaired startup
  of the already-existing embedded PostgreSQL cluster without a scheduled launcher.
  Targeted checks: 44 Python, 90 server Vitest, 5 UI Vitest passed; UI typecheck and
  diff check passed. Full server typecheck/required broad CI are not green/complete.
  Native implementation status is not visual acceptance: Computer Use stopped on
  Windows URL-policy enforcement, so no screenshot or browser reload verification.
  Existing door/wardrobe conflict and 45mm minimum pair spacing remain; the new
  bench has no solid collision and 790mm to the wardrobe, not a whole-room pass.
  Feature remains FROZEN / acceptance incomplete. Full report and exact commands:
  `docs/FEAT-2026-033-REPAIR-REPORT.md`.
