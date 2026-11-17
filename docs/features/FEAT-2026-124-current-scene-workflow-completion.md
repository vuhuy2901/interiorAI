# Complete current imported-scene workflow with inspectable evidence

Status: CLOSED | Version: 1.2 | Date: 2026-11-17 | Owner: Codex

## Request and acceptance
User requests finishing the existing workflow through Done and explicitly requires all 34 current GLB BOQ groups priced before acceptance. Prior preference is sourced reference prices editable by user. Produce a complete reference BOQ where defensible source/quantity exists; do not invent supplier-confirmed quotes, SKU matches, measurements, QA clearance or approval. Missing inputs remain explicit. Recover original tasks using current GLB evidence rather than repeatedly asking the old bedroom brief. Done requires actual scoped output and the required review/approval, not a blanket status rewrite.

## Scope
Read-only current-scene inventory/geometry/material/light audit; reproducible artifacts bound to asset hash/revision; reference-price research and measured quantities where defensible; current task/run/context alignment through existing scoped APIs. Repair workflow evidence/status synchronization where necessary, preserve dependency gates and company/project boundaries. Existing configuration, model geometry, provider credentials, Telegram settings and unrelated local changes remain intact. No purchase, deployment, mass task deletion or fabricated agent executions.

## Plan and affected components
Inspect native stage gates/issues/recovery, GLB grouping and live scene; collect material/geometry quantities and supplier references; generate stage evidence and BOQ; implement narrowly scoped tested synchronization if required; replay/check the real workflow and present final review. Candidate areas: scene-cost service/data, an audit/evidence script, native Atelier workflow services/routes/tests and documentation. Read matching Paperclip rules before editing those components.

## Verification and rollback
Back up configured SQLite and preserve native task/run state before writes. Test finite quantities/prices, source/hash/revision identity, complete reference coverage without false verified claims, dependency/approval guards and idempotent task synchronization. Validate via live scoped endpoints and UI. Record exact source revision, evidence paths, final per-task states and remaining blockers. Roll back only feature hunks; use API history/backups for scoped record recovery. Risks: merged GLB objects lack real SKU identities, hidden/unmeasured surfaces, historical native tasks may belong to another project, and user approval may still be needed after a concrete complete estimate is available.

## Approved scope clarification
User selected full 34-item pricing before acceptance and explicitly selected moving existing ATL-2…ATL-13 workflow into the native project containing the current GLB. Existing workflow identity/origin IDs must stay stable, so startup reconciliation must respect the root task's persisted project binding and not move it back to Studio or create duplicate tasks. Preserve old comments as history; old-room completion does not constitute current-GLB evidence.

User also explicitly selected estimate-first with no current budget cap. Add an explicit budget mode to brief/estimate contracts so old 120-million bedroom data cannot be interpreted as a confirmed GLB budget. Use the existing design-brief API and revision semantics; no geometry mutation. Root completion derives from all stages (including final review), reopening if a stage reopens; never keep a falsely completed parent.

CR-001 / version 1.1, FROZEN: user approved the concrete 34-row comparable valuation (~565.81 million VND including assumed tax), and acceptance is explicitly model/software, not original-SKU procurement or physical construction certification. Persist approval only for reviewed revision 19 and cost snapshot. Publish source-bound evidence, keep original run history, and do not forge native agent runs.

CR-002 / version 1.2, FROZEN: native project monitor currently fails because this legacy issue workflow has no native workflow-run record. Add a company/project-scoped read adapter over the actual root/child issues, marked `source=issue_workflow`, rather than creating synthetic execution rows. Company overview must link this existing workflow; write/handoff APIs still require real native runs. UI labels distinguish the task-derived view and do not show Done stages as waiting on dependencies.


## Completion evidence (2026-11-17)
- User accepted all 34 comparable reference groups for model/software acceptance only. Acceptance is pinned to scene revision 19, cost snapshot `est_glb_6c54791f391a888f`, and GLB SHA256 `19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f`.
- Existing root ATL-7 and ten stages ATL-8, ATL-2, ATL-3, ATL-9, ATL-4, ATL-10, ATL-11, ATL-12, ATL-5, ATL-13 are Done in native project `eb654960-2510-46d6-ade9-ea68a70bf64f`. Existing identities and historical runs are preserved. Evidence was collected with deterministic tools, not fabricated native agent runs.
- 34/34 priced reference lines; subtotal 523,895,528 VND, assumed VAT 41,911,642 VND, total 565,807,170 VND. Estimate-first budget mode prevents old 120-million budget being treated as a current constraint.
- Each task has a current-scene acceptance document and scoped approved work products. Original Studio work products are preserved as superseded history. Parent completion requires every stage Done and reopens when stages reopen.
- Artifacts: `data/exports/proj_bedroom_japandi_4x4m_workflow_review/`: source-audit.json, reference-quote-proposal.json, reference-quote-34.xlsx, per-task acceptance markdown, native before/after snapshots, native-acceptance-result.json. These local artifacts are intentionally ignored by Git; native task documents remain accessible through the app.
- Current-scene render `rjob_5c9840b4cf` completed at revision 19, 960x540, 24 samples; downloaded PNG was inspected and receipt hash checked. Source model has 77 meshes, 22 materials, 23 textures; source transforms remain unchanged.
- Tests: Python targeted acceptance/cost/runtime suites 26 passed; native targeted workflow/orchestration/scene suites 28 passed; UI typecheck passed; git diff --check passed. Playwright desktop/mobile read-only verification passed: ten Done stages, root Done, 34 priced rows, current GLB loaded, zero page errors. Screenshots: `docs/qa/workflow-completion/`.
- Post-restart live checks: company-workflow, default workflow reconciliation and project monitor all HTTP 200; project binding and Done states retained. Fixed company overview's stale default company lookup by resolving the actual ATL company. Native run write/handoff gates remain unchanged.
- During relocation, concurrent startup reconciliation initially reverted two bindings; respecting the persisted root project and replaying migration resolved this. No duplicate workflow or synthetic execution rows were created.

## Limits and rollback
Commercial quote complete is false; construction QA certified is false. Comparable products/materials do not prove original SKUs or procurement availability. Original kitchen equipment, transport, shop drawings, physical clearance and railing safety are outside accepted scope. Model quantities are not site measurements; tax is an assumption. Future scene/price revisions require fresh acceptance.
Original native snapshots and per-task prior work products are preserved before migration/acceptance. Existing SQLite rollback copy is `C:/QLDAPM-final/data/atelier-cost-rollback-20261117-004411.db`; configured live database stays `C:/QLDAPM-final/data/atelier.db`. Restore scoped records from backups rather than replacing unrelated later data. No provider/Telegram configuration changes, commits or pushes were performed.
Source baseline: `e864c8a31b4ccc25775412bd497bd98746fc6348`; implementation remains uncommitted alongside preserved pre-existing work. Full repository-wide server typecheck was not run; targeted suites and UI typecheck were run.
