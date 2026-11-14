# Enforce native agent handoffs from Studio Chat

Status: VERIFYING
Version: 1.0
Owner: Codex
Approved scope: direct user request on 2026-11-13
Frozen at: 2026-11-13

## 1. Context

The ATL-51 audit proved that all seventeen executions belonged to Chief Architect,
the task had no Paperclip project binding, and no Geometry Agent execution existed.
Studio Chat currently omits `native_tasks`, whose backend default is `false`; that
selects the local compatibility executor and allows one process to run every node.
New canonical projects also do not persist an explicit workflow binding, so routing
can depend on a mutable "latest workflow" fallback.

## 2. Scope

- Make project-scoped Studio Chat use native Paperclip tasks by default and reject
  an explicit request to disable native execution on that production path.
- Keep the legacy unscoped `/api/v1/chat/messages` compatibility path available for
  existing acceptance tests and non-production local preview calls.
- Persist an explicit workflow binding for every newly created canonical project.
- Replace mutable latest-workflow fallback with the stable default published
  workflow when an older unbound project is opened.
- Add focused regression tests proving routing mode, project binding, and distinct
  snapshot agent assignment in native task payloads.
- Bind the existing `proj_564f46a5` to the default published workflow only after
  source verification; do not start a run or create a native task in this pass.

## 3. Non-goals

- Do not rewrite the DAG scheduler, executor registry, Paperclip runtime, or chat UI.
- Do not rewrite ATL-51 history or claim its old Chief-only runs were specialist runs.
- Do not create a project, workflow run, issue, or native task.
- Do not change scene geometry, revision data, dimensions, assets, materials, or
  the source-layout work governed by FEAT-2026-034.
- Do not synchronize the separate Paperclip workflow-builder schema in this pass.

## 4. Affected components

| Component | Change |
|---|---|
| `apps/api/app/db.py` | Stable binding helpers and deterministic fallback |
| `apps/api/app/main.py` | Project creation binding and native-only project Chat routing |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Explicit `native_tasks: true` request |
| `tests/test_native_agent_handoff_enforcement.py` | Focused regression coverage |

## 5. Acceptance criteria

- AC-01: A request through `/api/v1/projects/{project_id}/chat/messages` defaults
  to native execution even when the client omits `native_tasks`.
- AC-02: Project-scoped Studio Chat cannot explicitly select the local all-agent
  compatibility executor.
- AC-03: Studio UI sends `native_tasks: true` explicitly.
- AC-04: A newly created project has a durable `project_workflow_bindings` row.
- AC-05: An older project without a binding resolves to the stable default workflow,
  never whichever test/user workflow happened to be updated last.
- AC-06: Native task creation uses the node's snapshot `agent_id`; a Geometry node
  cannot be assigned to Chief unless the published snapshot explicitly says so.
- AC-07: No run/task/project or scene revision is created during verification.
- AC-08: Existing adapter and workflow contract tests remain passing.

## 6. Risks and rollback

| Risk | Mitigation |
|---|---|
| Existing Studio clients relied on local compatibility execution | Project route returns a clear validation error only when they explicitly request the unsafe mode; current UI is updated atomically |
| Unbound old projects pick an unintended workflow | Use the stable default workflow ID and persist an explicit binding before production use |
| Native provider is unavailable | Surface the real task/runtime blocker; never fall back to Chief/local execution |
| Dirty worktree overlap | Patch only the named hunks and preserve all unrelated changes |

Rollback: reverse only the hunks recorded by this contract. Removing the explicit
binding for `proj_564f46a5` is a single scoped database row deletion if rollback is
required; no workflow/task/scene data is deleted.

## 7. Verification plan

1. Focused pytest for route-mode resolution and project binding.
2. Existing `test_paperclip_task_adapter.py` and workflow runtime contract tests.
3. Paperclip UI typecheck/build for the explicit request field.
4. Read-only database check that `proj_564f46a5` has one binding and no new workflow
   run/native task/scene revision was created.
5. `git diff --check` and scoped diff inspection.

## 8. Change log

| CR | Time | Change | Reason | Approval | Version |
|---|---|---|---|---|---|
| | | | | | |

## 9. Implementation log

| Time | Revision | Work | Notes |
|---|---|---|---|
| 2026-11-13 | Dirty worktree preserved | Began implementation after FROZEN | Scoped to project Chat mode, binding, UI request, and focused tests |
| 2026-11-13 | Base `ce745117d19dbffb0f0bf993a605a38ad02415a6` + scoped uncommitted patch | Implemented native-only project Chat and deterministic workflow binding | No workflow run, native task, project, or scene revision created |

## 10. Verification evidence

| Time | Revision | Check | Result | Evidence |
|---|---|---|---|---|
| 2026-11-13 | Scoped patch | Focused Python regression | PASS | `18 passed in 2.44s` |
| 2026-11-13 | Scoped patch | Python compile and diff check | PASS | Exit 0 |
| 2026-11-13 | Scoped patch | Paperclip UI production build | PASS | Vite transformed 8318 modules and completed in 14.94s |
| 2026-11-13 | Scoped patch | Full UI TypeScript check | BLOCKED by unrelated dirty-worktree change | `UnifiedBOQPage.tsx:135 Cannot find name 'bool'`; production build still passes and changed Studio file has no reported error |
| 2026-11-13 | Live backend PID 2636 | Managed backend reload and mode probe | PASS | Project Chat rejects `native_tasks:false` with HTTP 422; health `ok` |
| 2026-11-13 | Live SQLite | No production side effects | PASS | `proj_564f46a5`: revisions 3→3, runs 0→0, native tasks 0→0; binding now `wf_default_interior_pipeline` |
| 2026-11-13 | Live Paperclip read probe | Current project mapping | BLOCKED | Geometry agent is ready, but `resolve_project('proj_564f46a5')` reports no Paperclip project mapping; creating a new Paperclip project is outside frozen scope and conflicts with the prior no-new-project instruction |

## 11. Closure

- Final revision: base `ce745117d19dbffb0f0bf993a605a38ad02415a6` plus the uncommitted scoped patch listed above.
- Remaining limitations: the current local scene has no corresponding Paperclip Project. A real Geometry Native Task cannot be created with valid project isolation until the user authorizes provisioning exactly one Paperclip Project counterpart or identifies an existing correct project to link.
- Status: VERIFYING

