# Architectural Visualization & Rendering Agent

Production contract for the single `agent_render` coordinator. The agent reads
the current `CanonicalProject`, never mutates the SceneGraph, and never presents
an image-model output as a replacement for the scene's geometry.

## Execution contract

```text
Scene Inspector
  -> Geometry Validator
  -> Smart Camera Planner
  -> Architectural Lighting
  -> PBR Material Specialist
  -> Render Engine Controller
  -> Render Quality Inspector
  -> Scene Integrity Guardian
  -> Render Asset Manager
  -> Workflow Integration
```

Each stage is deterministic or evidence-backed and writes to the render plan/job
artifact, not to the canonical scene. The plan is bound to `scene_id`, revision,
material hash, camera preset and quality preset.

## Reusable skill contracts

| Skill | Input | Output | Safety boundary |
|---|---|---|---|
| `scene-inspector` | `project_id` | `SceneAnalysis` | read-only canonical scene |
| `geometry-validator` | `SceneAnalysis` | collision/bounds/clearance result | never auto-moves furniture |
| `smart-camera-planner` | scene bounds + furniture | camera preset/spec | never changes geometry |
| `architectural-lighting` | windows, room, preset | lighting preset/spec | no unverified MEP edits |
| `pbr-material-specialist` | material refs/overrides | resolved material hash | preserves approved IDs/textures |
| `render-engine-controller` | plan + quality | async Cycles job | queue, timeout, cancel, cache |
| `render-quality-inspector` | output image + expected metadata | QA report | missing/blank/invalid image fails |
| `scene-integrity-guardian` | plan/job metadata | revision/hash gate | stale revision is rejected |
| `render-asset-manager` | completed job | URL, metadata, gallery item | stores by project/revision |
| `workflow-integration` | job + QA | handoff/status | cannot claim success without artifact |

## API

- `POST /api/v1/projects/{project_id}/render/agent/plan`
- `POST /api/v1/projects/{project_id}/render/agent`
- `GET /api/v1/render/agent/{job_id}`
- `POST /api/v1/render/agent/{job_id}/cancel`
- `GET /api/v1/projects/{project_id}/render/agent/capabilities`

The job delegates actual image generation to the existing Blender/Cycles scene
bridge and PBR resolver. Codex AI remains an optional enhancement route and is
not the source of truth for dimensions, object placement, quantity takeoff or
construction evidence.

## Presets

- Cameras: `hero`, `wide`, `corner`, `detail`, `top_down`, `isometric`.
- Lighting: `daylight`, `evening`, `luxury`, `studio`, `soft_minimalist`.
- Quality: `draft` 960×540, `standard` 1920×1080, `high` 2560×1440,
  `ultra` 3840×2160.

## Evidence and failure policy

Every completed job must include the current scene revision, material hash,
plan hash, render URL and quality report. A job with unavailable Blender/Cycles,
stale revision, missing output, blank output, or invalid resolution remains
`BLOCKED`/`FAILED`; it is never replaced by a fake image.
