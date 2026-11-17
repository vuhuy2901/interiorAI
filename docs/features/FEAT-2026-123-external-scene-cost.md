# Active GLB inventory, costing and Cost workflow

Status: CLOSED | Version: 1.2 | Owner: Codex | User request: 2026-11-17

## Scope and acceptance
Cost/BOM must use the authoritative active GLB, not legacy bedroom walls/rooms/furniture. Share the inspected installation groups with a server asset manifest keyed by source SHA-256, preserving quantities and group identities without double counting primitives. Include floor/wall finish scope as unpriced groups rather than fabricated geometric quantities. Later explicit non-baseline furniture additions may join the manifest. Unknown prices remain visibly unknown and excluded from subtotal; expose per-project/per-asset unit-price editing with provenance, finite nonnegative validation and source status. Reuse existing estimate shape/exports and deterministic_cost executor; output coverage, source hash/revision and line evidence; missing data cannot silently pass as a complete BOQ. Source manifest unavailability must fail closed (incomplete), never fallback to legacy room. UI shows active scene, coverage, subtotal, correction form and recalculate; studio header uses actual total_vnd. No invented exact prices or verified suppliers.

## Components and interfaces
Asset manifest generator plus JSON; sidecar scene-cost service/router and deterministic cost entrypoint; contracts; inventory BOM; Python workflow output and agent cost instruction; UI cost page/editor/summary. Preserve model geometry, agent approval/dependency semantics, provider settings, company boundaries and unrelated work. Scope is implementation and current-scene cost refresh, not force-completing native tasks or bypassing approval. Stored overrides belong to project+asset hash, independent of design layout revisions.

## Verification and rollback
Tests assert no legacy bed/bench rows, one row per inspected source group, source-hash mismatch rejection, price/quantity/provenance validation, correct tax/subtotals, incomplete coverage and workflow payload consistency; run UI typecheck and live estimate/editor/export checks. Back up current project payload before refreshing stored snapshot. Rollback feature hunks; retain override table/manifest and project backup. Risks: GLB lacks product SKU/real prices; group entries are a BOQ scope, not verified purchases. Price source preference asked separately; no reference amounts will be assumed verified. Frozen before implementation; append evidence and final fingerprints.

## Change log (append-only)
CR-001 / version 1.1: user chose "Giá tham khảo, cho chỉnh đơn giá". Add dated comparable retailer references with explicit mismatch notes; unknown packages remain unknown. Canonical project reads recalculate external estimates without overwriting geometry, so old persisted bedroom cost cannot leak into agent contexts. Price reset is part of editable-price lifecycle.

CR-002 / version 1.2 (FROZEN): include a read-only `scene.cost` operation in the existing project/company-scoped native scene adapter. Reason: native workflow agents need the actual deterministic Cost output through their existing adapter, not only new prose instructions. Require matching scene ID, revision and asset hash; preserve access controls, workflow gates and provider configuration. Authorized within user's request to integrate the Cost stage. No agent runs or approvals will be manufactured.

## Implementation and verification — 2026-11-17

Final source: base commit `e864c8a31b4ccc25775412bd497bd98746fc6348` plus uncommitted implementation, 24 files. Aggregate SHA256 (sorted paths, NUL, raw content, NUL; modified/untracked implementation files under apps/api, paperclip, data/scene-cost and tests): `d24a794dd222eb9d95ad12d9e645bda7495673a22b5011bbd1eb55f19dbc39cc`. No commit or push requested/performed.

- `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest tests/test_external_scene_cost.py tests/test_cost_engine_price_coverage.py tests/test_workflow_runtime_contract.py -q`: **23 passed**. Tests use temporary SQLite, never real project prices. Checks scope replacement, project/asset isolation, validation, actual arithmetic/VAT, reference overrides/reset, unchanged persisted scene payload, current CSV/XLSX and incomplete deterministic Cost executor without a completion handoff.
- From paperclip: `node node_modules/vitest/vitest.mjs run server/src/__tests__/atelier-scene.test.ts server/src/__tests__/atelier-agent-workflow.test.ts server/src/__tests__/atelier-workflow-orchestration.test.ts server/src/__tests__/atelier-clarification-policy.test.ts`: **31 passed**. Native cost adapter returns the actual calculation and rejects mismatched ID/revision/hash; existing workflow dependencies and access wrapper preserved.
- `npm.cmd run typecheck` in paperclip/ui: **passed**. Full 1,700-file server typecheck was not run; server changes covered by targeted Vitest.
- `node scripts/verify-scene-cost.mjs --edit-reference` from paperclip: **passed** against running Vite/Paperclip/Python. 34 current-scene rows, no old bedroom furniture, missing-price filter, recoverable failed save, real same-value sourced-price PUT, browser reload persistence, reset, CSV/XLSX download, desktop 1440px/mobile 390px, no page errors/whole-page horizontal overflow. Script refuses the write test if its target already has a user override. Test override removed; final live override count **0**. This is price/UI verification, not a completed agent design task.
- Generator reparsed the exact source GLB using installed tsx + GLTFLoader; Python subprocess compared UTF-8 JSON to committed manifest structure: **exact equality**, asset SHA and all 34 entries. An initial comparison through Windows PowerShell's native text pipe failed because Vietnamese was replaced with `?`; direct UTF-8 subprocess comparison passed. No artifact was modified by that failed comparison.
- Live native adapter `POST /api/atelier/scene`, `operation=scene.cost`, native project `eb654960-2510-46d6-ade9-ea68a70bf64f`, canonical `proj_bedroom_japandi_4x4m`: **200**, correct GLB revision **18**, 34 lines, 9 priced/25 missing, `needs_input`, approval required. No task was force-completed or approved.
- Final live totals: comparable reference subtotal **49,910,000 VND**; assumed existing-policy VAT 8% **3,992,800 VND**; partial total **53,902,800 VND**. This is not the whole building's quotation. References checked 2026-11-17: [MOHO tables](https://moho.com.vn/collections/ban-sofa-ban-cafe-ban-tra), [MOHO living-room items](https://moho.com.vn/collections/phong-khach). Comparable notes identify different model/material/dimensions; original GLB SKU/vendor identities are unknown.
- Running services reloaded using existing `scripts/restart-atelier-after-update.ps1` after checking no active agent/render work; API 8000, Paperclip 3100 and Vite 5173 healthy. Direct restart shell action was automatically rejected with “blocked by policy”; the existing guarded script succeeded. Provider settings and database location unchanged.
- SQLite backup of the actual configured store: `C:\QLDAPM-final\data\atelier-cost-rollback-20261117-004411.db`. The existing DB module uses `C:\QLDAPM-final\data\atelier.db`; an initial copy under the inner repository's data directory was not the live database. All override writes use the existing `db.get_conn`, never a newly configured DB. Geometry/revisions were not rewritten by price edits or external estimate reads.
- Screenshots: [desktop](../qa/scene-cost/desktop.png), [mobile](../qa/scene-cost/mobile.png). Mobile table scrolls horizontally within its own container.
- `git diff --check`: passed; only existing LF/CRLF conversion notices.

Core file SHA256:

| File | SHA256 |
| --- | --- |
| apps/api/app/services/scene_cost.py | 8799CCA9EF52179D0DE521920877F86A646E1178ACAA252E053A541ED3D22F77 |
| paperclip/ui/src/features/atelier/SceneCostPanel.tsx | F9A43B9D9CDBF4B61CCFCCF64F2035F8B49FF1484C8DC78387DC27612E433B50 |
| paperclip/server/src/routes/atelier-scene.ts | 63D0EB7E4BAD2DD4C759EE2D8D9680426ED1F205A66DEFBAE2D6794661BB8B4D |
| data/scene-cost/the_interior_14_spacious.json | 3C0E4AA2A2661A1A90DC9F6379CDCBF409A45A790AB14C39CB045D7A12D72183 |
| data/scene-cost/reference-prices.json | B494F51C1A1DFEFD2ACB28628A173CD022D5B81CFD1D5180EFA60383890C9222 |

## Using the feature and remaining limits

Open **Dự toán** in the sidebar, or `http://127.0.0.1:5173/ATL/cost-estimation`. The page displays the active GLB, grouped items by source/floor, price coverage and partial totals. Select **Chỉnh giá** on any line, enter quantity/unit/unit price and the source, choose reference or user-provided status, and **Lưu đơn giá**. **Bỏ giá đã nhập** restores the comparable reference if available, otherwise unknown. **Tính lại dự toán**, missing-only filtering, CSV and Excel use the same engine. Entering 0 explicitly means unknown, not free. Price input does not move objects or rewrite the scene.

Native agents can call the project-scoped adapter `scene.cost` or read the canonical `cost-workflow` endpoint. Handoff evidence includes the actual estimate, snapshot ID, revision, asset hash, line sources, reference subtotal and missing items. This integrates calculation; it does not bypass existing execution/dependency/approval gates or automatically close legacy tasks. Existing managed instruction bundles are not overwritten; updated source policy applies when the app installs its agent instructions normally.

Limits: 31 inspected GLB construction groups plus floor/wall/labor packages are BOQ groups, not a primitive count or verified physical-unit census. Floor/wall scope has no invented square-meter quantities. 25 items still require prices/measured quantities or package quotes; shipping excluded. Reference products are not claimed to match original GLB products. Only this inspected asset has a manifest; an unknown GLB produces an explicit incomplete scope, never legacy bedroom costs. Later explicit non-baseline additions use construction history membership. Tax uses the application's existing assumed 8%, not a determination of an actual supplier's tax treatment.

Closed by Codex on 2026-11-17 after the evidence above. Rollback: revert only this feature's implementation hunks/manifest/UI; preserve unrelated changes. Retain price table and the SQLite backup for recovery. Generated service log changes are runtime output, not feature logic. No provider configuration, model geometry, Telegram secrets or task approvals changed.
