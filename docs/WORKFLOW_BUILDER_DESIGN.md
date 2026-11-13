# Atelier Workflow Builder Design

## Architecture

The builder edits only draft rows in `workflows`. A published row is immutable.
Creating a draft clones a published definition into a new version row. A run
stores the exact `workflowDefinitionId` and `workflowVersion`, so existing v1
runs remain unchanged when v2 is authored or published.

## Definition contract

Each definition contains stable `nodes`, `edges`, `canvas`, `gatePolicy` and
`stateMachine`. Node order in JSON and x/y position have no execution meaning.
Dependencies come only from edges and are validated as a directed acyclic graph.

Agent Task nodes include `taskType`, `requiredRole`, capability selector,
allowed agent IDs, required inputs/outputs/artifacts, completion criteria, tool
permissions, timeout and bounded retry policy. Human Input and Approval nodes
contain explicit actor/approver requirements. Condition nodes require named
outcomes. Join nodes require at least two incoming paths.

## Lifecycle

1. Clone published v1 to draft v2.
2. Edit v2 with optimistic `updatedAt` conflict protection.
3. Validate on every save and explicitly before test/publish.
4. Test run creates a non-dispatching validation receipt; it does not fabricate agent output.
5. Publish only a valid draft. Publishing freezes the row.
6. New project runs may select the published version explicitly. Existing runs remain bound.
7. Restore creates a new draft from a historical version; it never mutates history.

## UI

- Header: workflow/version/status, validation, save, undo/redo, validate,
  test, publish, history and JSON import/export.
- Left library: only node types supported by the runtime contract.
- Canvas: `@xyflow/react` drag/drop, connect/delete, multi-select, zoom/pan,
  minimap, controls, fit view and snap grid.
- Right inspector: typed node fields and real Agent Registry selectors.
- Modes: Design edits drafts; Execution reads immutable run snapshots.
- Responsive: desktop uses three panes; narrow view uses drawer tabs while
  preserving canvas and keyboard access.

## Native task mapping

Only Agent Task nodes create `issues`. `executionPolicy.atelierWorkflow`
stores run id, node id, task type, role/capability and version. The native task
ID is recorded on the node execution. Retry uses a stable idempotency key and
must reuse the same task mapping.

## Safety

- No migration of active v1 runs occurs automatically.
- No historical task, run, assignee or event is deleted.
- Draft graph changes cannot mutate run snapshots.
- Publish and assignment failures return structured validation issues.
