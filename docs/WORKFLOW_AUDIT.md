# Atelier Workflow Audit

Audit date: 2026-11-12 (Asia/Bangkok)

## Executive finding

Atelier đã có nền tảng workflow thực, không chỉ có UI: bảng `workflows`,
`atelier_workflow_runs`, `atelier_workflow_stage_executions` và
`atelier_workflow_events`; native tasks nằm trong `issues`; native executions
nằm trong heartbeat runs. Tuy nhiên definition v1 hiện được dựng từ hằng số
`ATELIER_CANONICAL_STAGES` gồm đúng 8 stage. API chỉ hỗ trợ read, reconcile,
backfill và handoff. Không có API tạo draft, sửa graph, validate, publish hoặc
version history. UI vì vậy chỉ có thể hiển thị 8 card tĩnh.

## Repository and runtime

- Root revision: `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1`.
- Paperclip revision: `628d46151f244213059e9882176c739b4b08e8e4`.
- Branch: `feat/atelier-2.0-paperclip`.
- Existing user/unrelated files were preserved. No reset, checkout or bulk add was used.
- Runtime health: `status=ok`, `bootstrapStatus=ready`, deployment
  `local_trusted`, port 3100.
- Runtime warning: Node.js 22.19.0 is below repository requirement 24.11.0.
- Latest database backup observed by health endpoint is stale. No database
  deletion or reset is authorized by this feature.

## Existing workflow authority

### Definition and versioning

- `workflows` already stores `scope`, `version`, `status` and JSONB `definition`.
- Unique key `(company_id, name, version)` can represent immutable published versions.
- v1 is published with id `f212642d-7e83-4aa6-930c-d7e384b44954`.
- Runtime payload reports 8 stages, 8 dependency edges and agent bindings.
- Missing: draft lifecycle, optimistic revision guard, validation report,
  published immutability enforcement and version-management API.

### Project bindings and execution

- `atelier_workflow_runs` binds project, definition id and exact version.
- `atelier_workflow_stage_executions` maps a stage to one native task and agent.
- `atelier_workflow_events` supplies idempotent event/audit storage.
- `ensureAtelierProjectWorkflow` creates native root/child tasks through
  `issueService`; dependency issue IDs are persisted.
- `acceptAtelierStageHandoff` checks graph adjacency, agent binding, other
  dependencies, approval presence, decision ledger and output-reference presence.
- Missing: output-schema validation, artifact existence checks, generic graph
  support, condition/join/retry semantics, execution admission guard and recovery.

### Agent registry and task assignment

- Existing agents contain real IDs, roles, status, free-text capabilities,
  tool permissions, skills and `metadata.atelierAgentKey`.
- `assertAssignableAgent` protects lifecycle/org-chain eligibility, not domain capability.
- Atelier role checks exist only in canonical handoff/reconcile paths.
- A generic task create/reassign API can therefore select a live but
  domain-incompatible agent unless another task-specific policy intervenes.
- Heartbeat admission verifies ownership and lifecycle, but does not currently
  validate Atelier node role, workflow version, dependency or approval policy.

## Root cause of the read-only screen

1. `atelierCanonicalWorkflowDefinition()` returns an in-memory constant.
2. `GET /api/atelier/company-workflow` returns that constant rather than the
   persisted definition snapshot.
3. No mutation routes exist for workflow drafts.
4. `validateCanonicalGraph` requires exactly eight stages.
5. `AtelierWorkflowMonitor.tsx` consumes only a read payload and renders cards.

## Reuse decisions

- Reuse native `workflows` rows as version snapshots.
- Reuse native `issues` for Agent Task nodes and blocked dependencies.
- Reuse heartbeat runs for actual execution and tool-call evidence.
- Reuse Agent Registry fields and enrich them with a typed Atelier capability projection.
- Reuse activity log plus `atelier_workflow_events` for policy decisions.
- Use `@xyflow/react`, already installed, for the visual editor.
- Do not infer execution order from canvas position; only graph edges are authoritative.

## Gaps prioritized

P0: typed schema/validator, immutable publish, draft clone, capability routing,
assignment guard and execution admission guard.

P1: visual editor, inspector, validation display, version history, execution
monitor, test run and import/export.

P2: advanced compensation/outbox coverage and richer conditional expression UI
after core P0/P1 verification.
