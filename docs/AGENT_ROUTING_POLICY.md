# Atelier Agent Routing Policy

## Policy source

Routing combines the workflow node contract with the existing Paperclip Agent
Registry. An agent is eligible only when all checks pass:

1. Same company and project access.
2. Lifecycle/status is assignable.
3. Agent ID exists and is enabled.
4. Required role or role alias matches.
5. Required capability is explicitly granted.
6. Task type is in the agent's allowed task types.
7. Required tools do not exceed agent tool permissions.
8. Workflow run/version/node binding matches.
9. Dependencies, artifacts and approvals are satisfied.

Failure rejects the assignment or execution. The system never silently chooses
an unrelated agent. The response includes a stable code, failed checks and
eligible alternatives. The decision is written to workflow events/activity log.

## Capability projection

Existing `metadata.atelierAgentKey`, role, permissions, runtime skills and
capability text are projected into a typed registry. Explicit
`metadata.atelierCapabilities` overrides inferred defaults. Defaults are scoped
to known Atelier agent keys and never grant every task type.

## Separation of duties

- Chief Architect coordinates and performs intake/final synthesis only.
- QA validates but cannot implement production changes by default.
- A node author cannot self-approve an approval gate unless explicitly listed
  as an authorized approver and separation-of-duties policy permits it.
- Missing capability produces `blocked` or `rejected`, not reassignment by guess.

## Enforcement points

- Definition validation before save/publish.
- Native task creation and reassignment for workflow-bound tasks.
- Checkout/execution admission immediately before a run starts.
- Completion/handoff before downstream nodes become ready.

## Audit event shape

Every routing decision records actor, task/node/run/version, requested agent,
policy checks, decision, reason and alternatives. Secrets and credential values
are never included.
