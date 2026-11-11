# Repository Working Agreement

## Feature documentation is mandatory

Every new feature, behavior change, integration, migration, or material cleanup
must have one feature contract in `docs/features/` before implementation starts.
Use `docs/features/TEMPLATE.md` and follow `docs/features/README.md`.

Rules:

1. Do not edit implementation files before the feature contract contains the
   scope, non-goals, affected components, acceptance criteria, risks, rollback,
   and verification plan.
2. Mark the contract `FROZEN` before implementation. A frozen contract is the
   source of truth for that implementation pass.
3. Do not silently rewrite frozen requirements during or after implementation.
   Append a numbered change request with its reason, impact, and approval, then
   update the contract version before changing code.
4. Keep implementation inside the frozen scope. Unrelated work requires a
   separate feature contract.
5. Record verification evidence and the exact final revision in the same file.
6. After status becomes `CLOSED`, do not modify behavior under that contract.
   Reopen it with a change request or create a new version/feature file.
7. Bug fixes may use a short contract, but they may not skip the contract.

Existing nested `AGENTS.md` files remain applicable. Where instructions differ,
follow the stricter rule.
