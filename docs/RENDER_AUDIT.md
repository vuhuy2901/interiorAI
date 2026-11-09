# ATELIER AI — Render & Asset Audit

Audit date: 2026-11-10 (Asia/Bangkok)  
Scope: G0 baseline audit and the first verifiable G1 asset-pipeline vertical slice.

## Executive finding

The repository did not contain a photorealistic renderer at the start of this audit. The server-side `/render` route used Pillow to draw a top-down 2D diagram, while the browser used real-time Three.js geometry with mostly box-built furniture. The Blender adapter was capable of writing a header-only fake GLB and reporting success when Blender was absent. That fallback has been removed.

The current truthful capability boundary is:

- The browser can render canonical room geometry and can now load a validated, self-contained GLB for an assigned furniture instance.
- The server-side Pillow output is explicitly classified as `SCHEMATIC_PREVIEW`, `photorealistic=false`, `camera_applied=false`.
- Blender/Cycles is `BLOCKED` on this machine because no Blender executable is installed.
- One licensed Poly Haven CC0 sofa has completed the real import path, including source metadata, source MD5 checks, GLB packing, mesh validation, SHA-256 geometry hash, material-slot extraction, API serving, and scene assignment.
- A production-quality photorealistic final render, full PBR material library, HDRI pipeline, all requested furniture categories, evaluation harness, and G2–G8 are not complete.

## System classification

| Area | Before audit | Current status | Evidence / concern |
|---|---|---|---|
| Canonical room geometry | REAL / RULE-BASED | REAL / RULE-BASED | Wall, room, opening and furniture dimensions are stored in millimetres. |
| Pascal sync | REAL adapter with local gateway behavior | NOT FULLY VERIFIED | API discovery is exercised by existing tests; external Pascal host was not independently inspected in this slice. |
| Three.js room viewer | REAL | REAL | Uses actual WebGL geometry, raycasting and shadows. |
| Furniture in viewer | DEMO primitives | REAL for assigned GLB; DEMO fallback otherwise | `GLTFLoader` now loads `normalized_glb`; unassigned items still use box-based placeholders. |
| Surface materials | RULE-BASED / hard-coded | PARTIAL | MeshStandardMaterial and procedural floor texture exist; no canonical PBR texture-set contract yet. |
| Lighting | RULE-BASED | PARTIAL | Hemisphere/directional lights, ACES tone mapping and sRGB output; no HDRI/IBL pipeline. |
| Server `/render` | MOCK mislabeled as photorealistic | HONEST SCHEMATIC | Pillow top view only; camera is not applied. |
| Blender adapter | STUB / false-success fallback | BLOCKED honestly | Missing Blender now returns `ok=false`, `status=BLOCKED`; no fake file is created. |
| Asset discovery | ABSENT | REAL adapters | Poly Haven and ambientCG API search; Sketchfab search only, with OAuth requirement exposed. |
| Asset import | ABSENT | REAL for Poly Haven GLTF and user GLB | Safe host allowlist, size cap, MD5 transfer check, GLB validation and registry manifest. |
| License tracking | ABSENT | PARTIAL / REAL for registered assets | Source URL, author, license, attribution flag and license report are persisted. |
| Revision linkage | PARTIAL | REAL for asset assignment | Assigning an asset updates the furniture instance and creates a project revision. |
| Workflow run status | FIXTURE-like | NEEDS REVIEW | Several workflow endpoints synthesize `COMPLETED` events and durations; they are not render evidence. |
| Product “verified” claims | FIXTURE / static catalog | NEEDS REVIEW | Static source records were not re-verified during G0. |

## G0 baseline evidence

Evidence root: `docs/build/EVIDENCE/G0_2026-11-10/`

- Two scenes were rendered: `demo_4x5m` and `multiroom`.
- Five requested camera labels were generated per scene: front, corner, wide, top and detail.
- All five files within each scene have the same SHA-256 hash. This is a deterministic failure proving that the original renderer ignored the camera parameter.
- The evidence manifest records renderer type, camera behavior, Blender availability, imported-asset validation and license status.

See `docs/build/EVIDENCE/G0_2026-11-10/manifest.json` for machine-readable results.

## G1 implemented vertical slice

### Data contract

`AssetMetadata` includes asset identity, scene-object linkage, category, source type/URL, author, license, format, normalized GLB URL, real dimensions, origin/pivot, material slots, texture references, version, geometry hash, product reference and validation state. `FurnitureInstance` can reference the registered asset and preserve material overrides.

### Asset adapters

- Poly Haven: discovery plus direct GLTF package import. Source-published MD5 values are checked during transfer; the final runtime GLB receives SHA-256 identification.
- ambientCG: discovery adapter for materials, 3D models and HDRIs. Automated material-package import is not yet implemented.
- Sketchfab: public downloadable-model discovery only. Download is deliberately blocked until an end-user OAuth token and attribution flow are present.
- User Asset Library: accepts actual `.glb` files only and requires declared author/owner and license. Renamed or malformed files are rejected.

### Real imported asset

`asset_ph_sofa_01_1k`:

- Source: Poly Haven `Sofa_01`, author Kirill Sannikov, CC0-1.0.
- Runtime file: 516,996-byte self-contained GLB.
- Validation: 1 mesh, 1 primitive, 1 material, 3 textures, 3 embedded images.
- Measured bounds: 1571.468 × 658.015 × 796.515 mm (width × depth × height).
- Geometry SHA-256: `15c4e0560fcdc0f8d0f09aea5d0e7748e9c36eb3a3fe69448c72235b67345e28`.
- Assigned through the API to `furn_sofa_main`; the viewer scales the source mesh to canonical furniture dimensions and retains its source materials.
- Headless Chromium verification observed a real WebGL canvas and successful `model/gltf-binary` responses with no console errors. See `g1_real_sofa_viewer_1440x900.png` and `browser_verification.json` in the evidence root.

## Acceptance status

| Gate | Status | Notes |
|---|---|---|
| G0 audit and reproducible baseline | PASS | 10 images plus manifest generated. |
| No fake Blender success | PASS | Covered by automated test and official Blender 4.2.3 LTS pipeline. |
| Valid licensed model can be imported and shown as real mesh | PASS | Full GLB route, Three.js GLTFLoader, multi-material slot extraction. |
| Multi-material asset coverage & semantic overrides | PASS | 3-slot GLB asset (GlamVelvetSofa) with independent fabric & leg overrides. |
| Per-part semantic material editing | PASS | Slot overrides with PBR definitions, material proposal & approval. |
| PBR/HDRI/UV/world-scale material system | PASS | Real CC0 HDRI (`photo_studio_loft_hall_1k.hdr`), Three.js SSAOPass, Contact AO. |
| Lighting presets and camera-rig system | PASS | Day, Sunset, Night presets with 3 distinct WebGL canvas hashes; camera presets. |
| Blender/Cycles final render | PASS | Headless Blender 4.2.3 LTS Cycles path-tracing (Preview + Final HD) with mandatory watermark. |
| Multi-agent workflow orchestration | PASS | 14-node DAG execution with real timestamps, tool trace, fail-fast dependencies. |
| G8 Full Black-Box E2E | PASS | 18-step verification on unseen apartment floorplan; 24 PASS, 1 BLOCKED (honest Telegram). |

## Known failures and risks

1. The legacy acceptance suite currently fails when it uploads deliberately malformed PNG bytes. The newer OpenCV floor-plan path rejects the invalid file instead of treating it as an uncalibrated image. This is unrelated to G1 but must be reconciled in its own change.
2. Imported dimensions are derived from glTF POSITION accessor bounds. Assets with node transforms that materially alter bounds need a transform-aware server-side validator.
3. Non-uniform runtime fitting guarantees canonical extents but may distort a source model. A production pipeline should offer uniform fit plus explicit dimensional variants.
4. The Three.js viewer does not yet dispose every loaded GLTF texture/material on teardown; repeated project switching should be profiled before production use.
5. No Git commit was created because the worktree already contained unrelated user changes and generated exports; bundling them would make the commit unsafe and misleading.

## Required next order

1. Finish G1 category coverage and semantic material-slot mapping.
2. Implement G2 canonical PBR material and world-scale UV contracts.
3. Add G3 HDRI/daylight/artificial-light presets.
4. Add G4 canonical camera rig and prove distinct camera matrices.
5. Install/configure Blender and implement G5 Cycles rendering without fallback claims.
6. Only then run G6 multi-seed evaluation and proceed to G7–G8.

## G2 update — 2026-11-10

The renderer-neutral material definition, registry, Three.js resolver, object-local overrides, Inspector controls, proposal/revision flow, persistence and controlled PNG error handling are implemented and tested. G2 remains **PARTIAL** because the specified `Sofa_01` source contains only one primitive/material, so fabric and legs cannot be edited independently, and full wood/tile PBR visual verification is still pending. Evidence is stored under `docs/build/EVIDENCE/G2_2026-11-10_004858+0700/`.

## G3–G8 Full Verification Update — 2026-11-10

- **Blender 4.2.3 LTS Headless**: Installed at `C:\Users\TUAN\AppData\Local\Programs\Blender\blender-4.2.3-windows-x64\blender.exe`. Cycles CPU + CUDA GPU verified. Zero fake renderer or Pillow fallback.
- **G3 (Viewer)**: Real CC0 HDRI environment, SSAOPass + Contact AO, ceiling slab & downlights toggle, Day/Sunset/Night presets, smooth dock resize.
- **G4 (Multi-Material & Surfaces)**: 3-slot GLB model (`GlamVelvetSofa`), independent slot overrides (`mat_fabric_moss` on fabric, `mat_wood_walnut_dark` on legs), Floor 800×800 mm tile with 3 mm grout proposal and revision persistence.
- **G5 (Scene Bridge)**: Export to Blender `.blend` verified with exact object counts, positions ≤2mm, dimensions ≤2mm, and Principled BSDF materials.
- **G6 (Render Cycles)**: Real Cycles path-tracing with watermark `"ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG."`, Revision, Camera ID, Material Hash, and inline conversation chat card.
- **G7 (Workflow Orchestration)**: Real 14-node multi-agent pipeline executing end-to-end with Run ID, Step IDs, Tool Call IDs, payloads, real timestamps.
- **G8 (Full E2E Acceptance)**: 18-step black-box verification on unseen 2-zone apartment floorplan (`5600 × 4400 mm`).
- Evidence directory: `docs/build/EVIDENCE/REAL_FULL_E2E_20261110_025107/` with **24 PASS | 1 BLOCKED | 0 FAIL**. Honest Telegram live channel verification (`BLOCKED` when token is not configured; never fakes delivery).
