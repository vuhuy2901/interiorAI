# Browser and data verification

## Browser

- Chrome/Playwright loaded `/ATL/control-center` and waited for rendered React
  Flow nodes before capture.
- Pipeline and Task Lifecycle tabs rendered successfully at 1600 x 1000.
- Node selection opened the right inspector with UTF-8 description and prompt
  fields.
- Draft creation, edit persistence, validation and publish were exercised during
  the browser pass. The temporary verification description was removed afterward.
- A clean v4 draft remains available for further editing; v3 is published.

## Version snapshot

| Version | Status | Nodes | Edges | Note |
|---|---:|---:|---:|---|
| v1 | published | 10 | 10 | Existing baseline |
| v2 | published | 10 | 10 | Existing builder release |
| v3 | published | 11 | 11 | Includes Asset & Material Discovery |
| v4 | draft | 11 | 11 | Clean editable draft |

Both existing project runs remain pinned to workflow version 1:

- `6e1e24de-89e2-4961-addc-670423a1eab3` (`running`)
- `4aa7274b-6a8c-490d-a113-0129e1a83c36` (`needs_input`)

No existing project run was migrated or rewritten.

## Automated checks

- UI typecheck: PASS.
- UI production build: PASS.
- Layout Vitest: 1/1 PASS.
- Workflow builder and orchestration Vitest: 6/6 PASS.
- Known environment warning: repository requests Node >=24.11.0; verification
  host currently uses Node 22.19.0.
