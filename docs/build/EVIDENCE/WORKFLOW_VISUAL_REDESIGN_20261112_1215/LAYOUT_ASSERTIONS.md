# Workflow visual layout assertions

Verified on 2026-11-12 at `paperclip` revision `628d46151` plus the documented
working tree.

- ELK direction: `RIGHT`.
- ELK edge routing: `ORTHOGONAL`.
- Node size: 244 x 104 px.
- Pipeline topology: 11 nodes and 11 transitions in the current draft.
- Parallel branch: Furniture and Style/Material Discovery share the geometry
  dependency and rejoin before Lighting/Visualization.
- Lifecycle main lane: Backlog -> To do -> In progress -> In review -> Done.
- Lifecycle outer lanes: Blocked, Cancelled, Resume and Reopen transitions are
  routed outside the main lane.
- Automated assertion: topology signature unchanged, no node overlap, forward
  dependency order preserved, and every generated route segment is orthogonal.

Evidence:

- `pipeline-workflow.png`
- `task-lifecycle.png`
- `inspector-debug.png` (draft inspector and editable fields)

The full pipeline is intentionally fit into one canvas for topology review. Users
can zoom or pan for field-level reading and can collapse either side panel.
