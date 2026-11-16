# Remove the dark delivery platform

Status: FROZEN | Version: 1.0 | Owner: Codex | User request: 2026-11-16

Context: the delivery worker creates a dark rectangular trolley mesh below carried furniture. Remove that decorative platform from the worker factory. Scope: platform mesh only; cargo, actors, source furniture, shadows, scheduling and history unchanged. Acceptance: carried furniture has no trolley rectangle beneath it; worker/cargo animation continues normally. Verify relevant worker/playback tests and UI typecheck. Rollback: restore trolley mesh block. No API, data or configuration changes. Frozen before implementation.

Verification 2026-11-16: removed trolley geometry/material and its insertion into the worker. Focused worker/playback tests 8/8 PASS; UI typecheck PASS; git diff --check PASS (existing line-ending notices). No new browser visual capture in this pass. Working-tree SHA-256 furnitureDeliveryAnimation.ts: `06C886834F278EA32D36192E289BD505FF75771134A830EA5899FAE2868593EE`. Status: CLOSED (local), Codex. No commit created.
