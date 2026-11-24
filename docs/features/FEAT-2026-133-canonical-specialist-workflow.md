# FEAT-2026-133 — Canonical specialist delivery workflow

| Field | Value |
|---|---|
| Status | FROZEN |
| Contract version | 1.6 |
| Owner | Codex |
| Authorized by | User: Please implement the plan (2026-11-19) |
| Frozen at | 2026-11-19 Asia/Saigon |
| Starting revision | 7c38201065266b130fe5c517085954e6939abc7e plus existing user worktree |
| Final revision | Pending verification |

## Context and goal

ATL-139 was completed by Chief without a native project or specialist subtasks.
Multiple bootstrap/orchestration paths disagree on the graph. Make Paperclip the
single delivery control plane, preserve existing data, and enforce actual stage ownership.

## Scope and components

- Versioned snapshot: brief -> floorplan -> floorplan_qa -> geometry ->
  furniture/style -> cost/render -> final_qa -> delivery (10 tasks, eight agents).
- Native intake, project/scene binding, idempotent provisioning and durable wakes.
- Stage output/handoff validation, independent QA, correction and final completion.
- Authenticated scene operation ownership through bridge, proxy, MCP and sidecar.
- Reversible specialist decisions, provenance and explicit final approval.
- UI/API workflow views and instructions follow the same persisted snapshot.
- Rebuild ATL-139 in a new project from source brief/attachment and evidenced user
  preferences, retaining original task/scene as history.
- Changes belong to Atelier services/routes, sidecar workflow/auth services, shared
  API contracts and Atelier UI. Preserve unrelated dirty worktree changes.

Non-goals: delete old projects/tasks, replace generic Paperclip execution/budget
controls, change models/accounts, or claim commercial quote/structural approval.

## Acceptance criteria

1. One intake produces one project/root/run and ten correctly owned subtasks;
   retries, concurrent requests and restart do not duplicate or drop work.
2. Every run pins its definition, bindings and decision policy. Only satisfied
   dependency stages dispatch; valid handoff advances automatically once.
3. Chief cannot perform specialist writes; identity is verified, never trusted
   from body agent_id. QA is independent and read-only.
4. Evidence includes canonical scene/revision and persisted outputs. Invalid,
   cross-project, stale or wrong-owner handoffs cannot complete tasks/root.
5. Concurrent specialist writes preserve both changes via revision checks.
6. Routine reversible choices proceed with source/assumption records; changed
   brief, safety, financial commitments and final acceptance retain human gates.
7. Failed QA routes correction to its owner and invalidates affected downstream
   evidence. Quota waits/restart/cancellation preserve task linkage and visibility.
8. Old graph entrypoints delegate to the canonical owner; bootstrap creates no
   design work. Existing runs retain compatibility.
9. Original ATL-139 remains available; new run has source links, no inherited
   specialist completion and explicitly checks dimensional discrepancies.

## Implementation and verification

Reuse existing workflow run/stage/event storage, durable wake service, revision
CAS and intake receipt. Add narrow contracts rather than parallel schedulers.
Exercise graph, admission, auth, real DB dedup/restart and proxy boundaries with
focused Vitest/Python tests; typecheck affected packages and inspect live API.
Run controlled end-to-end acceptance on the rebuilt project after checks pass.
Record commands, failures and results append-only below.

## Risks and rollback

Existing user edits and live agents are shared resources. Do not reset worktree
or overwrite old scenes. Feature-gate the new dispatch; disable it on failure,
retain all task/run records, and restore only changes attributable to this feature.
Direct local filesystem access is outside application-level actor isolation.

## Freeze confirmation

Scope, non-goals, resources, acceptance, rollback and verification are frozen under
the approved plan. No additional approval is required for these implementation steps.

## Change log

CR-001 (2026-11-19, contract 1.1): Live acceptance exposed root-level
`purge_pg.js` and `clean_sqlite.py` deleting every project except a hardcoded
singleton. PostgreSQL cleanup disables FK triggers, leaving orphan workflow
runs. The scripts subsequently disappeared independently of this implementation.
Retire both entrypoints and selectively recover source/new workflow records
from existing backups/receipts without overwriting retained projects or waking
old tasks. This is required by the approved data-preservation criteria; the user
confirmed that no other cleanup was intentionally running.

CR-002 (2026-11-19, contract 1.2): Live run showed two agent-side failures:
(a) Geometry agent tried multiple wrong formats for scene writes (operations,
patch, scene:{}) instead of the CanonicalProject schema required by
PUT /api/v1/projects/{id}/scene. All attempts returned 502 because the
proxy caught sidecar validation failures. The agent should use bound
Pascal MCP tools (create_room, add_wall, add_door, add_window, update_node)
via POST /api/v1/mcp/call, or read-then-PUT the full CanonicalProject.
(b) QA agents (floorplan_qa, final_qa) checked scene state that belongs to
downstream stages (geometry, furniture), causing infinite rework loops with
Floor Plan. QA scopes must match predecessor responsibilities. Also,
corrections[].nodeId must be workflow node keys, not issue identifiers.
Fix: enrich specialistTaskInstructions with per-stage API schemas and QA
scope guidance. User approved this change.

CR-003 (2026-11-19, contract 1.3): Live ATL-145 retries kept returning HTTP 502
"Failed to reach ATELIER CAD/BOQ sidecar" / "fetch failed" from
`POST /api/v1/mcp/call`, even for `verify_scene` calls that succeeded instantly
via `curl`. CR-002's assumption that this 502 came from sidecar schema
rejection was incomplete. Root cause, confirmed by reproduction: the Geometry
agent issues its HTTP calls through PowerShell's `Invoke-WebRequest`, which
auto-adds an `Expect: 100-continue` header on POST/PUT bodies. The Atelier
proxy (`atelier-bridge.ts` `proxyHandler`) forwards nearly all incoming
headers verbatim to the sidecar via Node's `fetch`, which rejects any request
carrying an `expect` header with `TypeError: fetch failed` (`cause: "expect
header not supported"`), caught by the handler's generic catch block and
turned into a 502. Reproduced: `curl` without `Expect` -> 200; `curl -H
"Expect: 100-continue"` -> 502 `fetch failed`; direct Node `fetch` with an
`expect` header -> same `fetch failed` error, in under 1 second per call
(ruling out a timeout/lock-contention explanation).
Fix: in `proxyHandler`, drop additional hop-by-hop/unsupported headers before
forwarding (`expect`, `keep-alive`, `te`, `trailer`, `upgrade`,
`proxy-connection`, `proxy-authorization`) alongside the existing `host`,
`connection`, `content-length` exclusions; include `error.cause` in the 502
`detail` so a future proxy failure is diagnosable from the response alone
without reproducing it manually. User approved this change before
implementation.

CR-004 (2026-11-19, contract 1.4): After CR-003 removed the 502s, ATL-145
still blocked on two confirmed-by-code-reading issues, neither related to
CR-003: (a) CR-002's own instruction to use bound Pascal MCP tools
(create_room, add_wall, add_door, add_window, update_node, delete_nodes) as
the way to create durable geometry was wrong. Reading
`apps/api/app/main.py` `api_mcp_call_tool` (`POST /api/v1/mcp/call`) and
`packages/pascal-adapter/gateway.mjs`'s `call_tool` action shows the MCP
gateway only mutates an ephemeral in-process `SceneBridge` built from the
request's `sceneSnapshot` and returns the resulting `sceneJson` in the
response; `api_mcp_call_tool` never calls `save_project()` with it, so no
mutation is ever written to the canonical project, and `sync_canonical_to_pascal`
is one-directional (canonical -> Pascal only, confirmed by grep: no reverse
sync function exists). `cad_export.py`'s `export_project_to_dxf/glb/ifc` read
`project.walls`/`project.rooms`/`project.furniture_instances` directly, never
`pascal_scene_json`, so MCP-tool-created geometry can never appear in an
export or BOQ regardless of persistence. The only durable write path is
`PUT /api/v1/projects/{id}/scene` with a full `CanonicalProject` body (this is
how the initial 5 rooms/18 walls reached revision 3). The stair was lost
because the agent followed CR-002's instruction literally. (b) The agent also
called `GET /projects/{id}/export/{fmt}`, which doesn't exist (404); the real
endpoint is `GET /api/v1/exports/{project_id}/{fmt}`.
Fix: correct `stageGuide.geometry` in `atelier-specialist-delivery.ts` to
require `PUT /scene` with the full `CanonicalProject` body (including
`furniture_instances`/structural fields for stairs) for every durable
mutation, restrict MCP tools to `verify_scene`/`check_collisions` validation
only, and give the correct export path. No persistence behavior was added to
`POST /api/v1/mcp/call` sidecar code: reconciling Pascal's node graph with the
canonical schema well enough to persist is a separate, materially larger
change (two different schemas) and is out of scope here per the non-goals
(routine reversible choices proceed without new approval, but this would be a
new sidecar write path, not a routine choice). User approved continuing
after this finding ("tiếp tục đi").

CR-005 (2026-11-19, contract 1.5): ATL-145's remaining blocker after CR-004
had two parts; user decided the stair is deferred (acceptable to leave
unmodeled at this stage), and asked whether GLB export can be enabled in
headless mode. Verified by direct call: `GET /api/v1/exports/proj_ef7d0089/glb`
returns 200 with a 7608-byte file right now, alongside dxf (200, 24809
bytes) and ifc (200, 1620 bytes); no server change was needed. Reading
`cad_export.py`'s `export_project_to_glb` shows it is pure Python (manual
glTF 2.0 JSON + `struct.pack` binary buffer) with no Blender/GPU/headless
rendering dependency at all. The "headless" limitation the agent reported is
a different subsystem entirely: `blender_mcp.py`/`blender_cycles_renderer.py`
is the Render stage's (ATL-149) photoreal Blender Cycles driver, unrelated to
Geometry's CAD export. The agent conflated the two, most likely because the
word "headless" appears elsewhere in the codebase in that unrelated context.
Fix: add explicit guidance to `stageGuide.geometry` that
GET /api/v1/exports/{project_id}/{dxf,glb,ifc} all work today with no driver
dependency, and that any "Blender headless" limitation belongs to the
separate Render stage, not Geometry. Stair creation is deferred per user
decision; the handoff document must record it as an explicitly deferred item
(not silently dropped) with the reason (no sourced measurement evidence for
riser/going dimensions), so final_qa does not treat it as an unexplained gap.

CR-006 (2026-11-19, contract 1.6): After Geometry completed, Style/Furniture/
Cost auto-completed, but Render (ATL-149) reported "blocked by renderer
sidecar" / "no render job or inspectable image artifact". Reproduced by
calling `POST /api/v1/projects/proj_ef7d0089/render-jobs` directly (preview
and final mode): both returned `status: COMPLETED` with a real Blender
Cycles PNG (449501 and a similar size in bytes respectively), confirmed on
disk and downloadable via `GET /api/v1/renders/{file_name}` (200). The
renderer sidecar is fully functional; there is no outage. Root cause: `main.py`
`RenderScenePayload` defaults to `async_exec: false` (synchronous), and
`api_enqueue_project_render_job` blocks for the full render duration (measured
18.2s for preview, 31.7s for final) before responding. A render job this
session itself created earlier (`rjob_7e76ab820d`) was found via `cache_hit:
true` to have completed successfully at the same time the agent's "blocked"
comment reported no artifact — consistent with the agent's tool-call timing
out client-side before the synchronous server response returned, while the
server kept running and finished the job moments later. `stageGuide` in
`atelier-specialist-delivery.ts` had no `render` entry at all, so the Render
agent had zero API guidance for this endpoint.
Fix: add a `render` entry to `stageGuide` instructing the agent to call with
`"async_exec": true` (or `"wait_for_completion": false`) to get `job_id`
immediately, then poll `GET /api/v1/projects/{project_id}/render-jobs` or
`GET /api/v1/render-jobs/{job_id}` in a separate call until `status` is
`COMPLETED`, rather than one blocking synchronous call. Since ATL-149 is
already provisioned, the corrected guidance was also delivered via a comment
on the existing task (the prompt-text code fix only applies to newly
provisioned tasks, confirmed in CR-004/005). User asked to look into this
directly ("lại block giúp tôi đi").

## Implementation and verification evidence

CR-003 verification: added `server/src/__tests__/atelier-bridge-proxy-headers.test.ts`
asserting the proxy strips `expect` (and other hop-by-hop headers) before
calling the upstream sidecar (including through the existing
`fetchAtelierSidecar` HMAC-signing wrapper that the proxy actually calls), and
that an upstream fetch failure's `cause` is surfaced in the 502 response
detail. `pnpm exec vitest run server/src/__tests__/atelier-bridge-proxy-headers.test.ts
server/src/__tests__/atelier-specialist-delivery.test.ts --maxWorkers 1`: 2+8
= 10 passed. Confirmed the fix is isolated: reverted only the CR-003 diff,
reran `atelier-bridge-no-demo-fallback.test.ts`, got the same 2 pre-existing
failures (ide-bridge/reply 500 vs 422; scene access 403 vs 422) with and
without the fix, so those are unrelated pre-existing working-tree issues, not
caused or fixed by CR-003; recorded in next.md, left unfixed (out of scope).
Live retry of ATL-145 after restart: CR-003 confirmed (502s gone, verify_scene
returns valid=true at revision 3-4); CR-004 found a second, unrelated blocker
(MCP tool mutations not persisted; wrong export path) before Geometry could
complete. CR-004 verification: re-ran
`atelier-specialist-delivery.test.ts` + `atelier-bridge-proxy-headers.test.ts`
(10 passed) after the prompt-text edit to confirm no existing assertion on
the old `stageGuide.geometry` wording broke. Live retry of ATL-145 with the
corrected prompt: pending confirmation after restart.
