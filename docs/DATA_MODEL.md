# ATELIER AI — Canonical Project Schema & Data Model (`v1.0`)

## 1. Design Philosophy

`CanonicalProjectSchema` is the **Single Source of Truth (SSOT)** for all geometric, surface, financial, and conversational state in ATELIER AI.
- **Internal Linear Units**: Millimeters (`mm`), integer/float precision (`0.5 mm` tolerance).
- **Pascal Scene Graph Mapping**: Bidirectional deterministic conversion (`1000 mm ↔ 1.0 m`, `[x, y_plan]` in `mm` ↔ `[x, z]` in `m` with `+Y` up).
- **Surface-Level Material Assignment (Section 7B Mandatory)**:
  - Each `Wall` separates `face_a_material_id` and `face_b_material_id` (plus `is_accent_wall_a` / `is_accent_wall_b`), mapped to Pascal `WallNode.slots.a` and `WallNode.slots.b`.
  - Each `Room` specifies `floor_material_id`, `ceiling_material_id`, `wall_base_material_id`, `wall_tile_zone` (with `tile_height_mm` for kitchen/bathroom dado/splashbacks, mapped to Pascal `WallFaceRegion`), and `skirting_material_id` (mapped to Pascal `WallNode.skirting` and `slots.aSkirting`/`bSkirting`).

---

## 2. Core Entities

### 2.1 `CanonicalProject`
| Field | Type | Description |
|---|---|---|
| `project_id` | `str` (UUID) | Stable project identifier |
| `name` | `str` | Project title (e.g., `"Căn hộ 1PN Japandi 4x5m"`) |
| `revision` | `int` | Monotonically increasing revision counter (optimistic concurrency) |
| `units` | `Literal["mm"]` | Canonical internal unit (`mm`); display unit configurable (`mm`, `cm`, `m`, `ft`) |
| `scale_calibrated` | `bool` | Whether at least one reference edge or CAD vector scale has been verified |
| `scale_reference` | `ScaleCalibration \| None` | Reference segment `[p1, p2]`, `real_length_mm`, `mm_per_px`, `confirmed_by_user` |
| `floors` | `List[FloorLevel]` | Multi-story levels (`elevation_mm`, `height_mm`, `slab_thickness_mm`) |
| `rooms` | `List[RoomZone]` | Enclosed spaces with surface assignments & clear areas |
| `walls` | `List[WallSegment]` | Structural and partition walls with per-face materials |
| `openings` | `List[DoorOpening]` | Hinged, sliding, double, folding doors & cased openings |
| `windows` | `List[WindowOpening]` | Fixed, casement, sliding, floor-to-ceiling windows |
| `furniture_instances` | `List[FurnitureInstance]` | Placed 3D objects with catalog SKU, dimensions, rotation, clearance bounds |
| `materials` | `List[SurfaceMaterial]` | Paint, tile, wood flooring, skirting, ceiling finishes used in project |
| `estimate_snapshot` | `CostEstimateSnapshot \| None` | Latest deterministic BOQ & cost breakdown |
| `design_brief` | `DesignBrief` | User preferences, likes/dislikes, budget ceiling, household profile |
| `pascal_scene_json` | `Dict[str, Any]` | Synchronized `@pascal-app/core` scene graph (`nodes`, `rootNodeIds`, `collections`) |
| `approval_state` | `Literal["DRAFT", "WAITING_FOR_INPUT", "WAITING_FOR_APPROVAL", "APPROVED"]` | Current governance status |

### 2.2 Surface Material Schema (`SurfaceMaterial` — Section 7B)
- **Paint (`category = "paint"`)**:
  - `id`, `name`, `brand` (e.g. `"Dulux"`, `"Jotun"`), `color_code`, `hex_color`, `finish_type` (`"matte" | "eggshell" | "satin"`), `roughness` (`0.2`–`0.9`), `coverage_m2_per_liter` (e.g. `12.0`), `coats_required` (`1` primer + `2` topcoats), `can_size_liters` (`5` or `18`), `unit_price_vnd`, `pascal_material_ref`.
- **Tiles & Flooring (`category = "tile" | "wood_floor"`)**:
  - `id`, `name`, `brand`, `tile_width_mm`, `tile_length_mm` (e.g. `600x600`, `800x800`, `150x900`), `texture_url`, `hex_color`, `roughness` (`0.15` glossy, `0.7` matte), `layout_pattern` (`"straight" | "staggered" | "herringbone"`), `m2_per_box` (e.g. `1.44`), `waste_rate` (`0.06` for straight/staggered, `0.11` for herringbone), `price_per_box_vnd`, `adhesive_kg_per_m2`, `grout_kg_per_m2`, `pascal_material_ref`.

### 2.3 Deterministic Surface & BOQ Formulas (`CostEngine`)
1. **Net Wall Paint Area ($A_{\text{paint}}$)**:
   $$A_{\text{paint}} = \max\left(0, \sum A_{\text{wall\_face}} - \sum A_{\text{openings}} - \sum A_{\text{tile\_zone}}\right)$$
   - Primer liters: $L_{\text{primer}} = \frac{A_{\text{paint}} \times 1}{\text{coverage}}$, Cans = $\lceil L_{\text{primer}} / \text{can\_size} \rceil$
   - Topcoat liters: $L_{\text{top}} = \frac{A_{\text{paint}} \times \text{coats}}{\text{coverage}}$, Cans = $\lceil L_{\text{top}} / \text{can\_size} \rceil$
2. **Floor & Wall Tile Boxes ($B_{\text{tile}}$)**:
   $$A_{\text{gross}} = A_{\text{net}} \times (1 + \text{waste\_rate}), \quad B_{\text{tile}} = \left\lceil \frac{A_{\text{gross}}}{\text{m2\_per\_box}} \right\rceil$$
   - Automatically adds tile adhesive (`keo dán gạch`), grout (`keo chà ron`), and skirting length ($L_{\text{skirting}} = \text{Room Perimeter} - \sum W_{\text{doors}}$).

---

## 3. Conversational & Multi-Agent Schemas (Sections 5A & Supplement)

- **`AIConnection`**: `id`, `name`, `kind` (`"model_api" | "cli_agent" | "mcp_server" | "custom_agent" | "local_ai"`), `provider` (`"gemini" | "openai" | "anthropic" | "pascal_mcp" | "ollama" | "custom_http" | "cli"`), `endpoint_url`, `model_default`, `status` (`"connected" | "disconnected" | "error"`), `capabilities`, `last_checked_at` (API keys stored encrypted/masked in server secrets table, never returned in plaintext).
- **`AgentDefinition` (Agent Registry)**: `id`, `name`, `role`, `description`, `connection_id`, `model_name`, `connection_type`, `system_prompt`, `prompt_version`, `allowed_mcp_tools`, `permissions` (`read`, `propose`, `commit`), `ask_if_uncertain`, `confidence_threshold`, `max_questions_per_stage`, `approval_required`, `token_limit`, `budget_limit_usd`, `timeout_sec`, `max_retries`, `fallback_model`, `enabled`.
- **`QuestionRequest` (`ask_user` interrupt)**: `question_id`, `project_id`, `run_id`, `origin_agent`, `context`, `question_text`, `why_needed`, `choices` (`2–4` options + `"Để AI đề xuất"`), `allow_free_text`, `blocking`, `resume_token`, `status` (`"PENDING" | "ANSWERED" | "SKIPPED"`).
- **`SceneProposal` (`Proposal` & `SceneDiff`)**: `proposal_id`, `project_id`, `base_revision`, `origin_agent`, `title`, `summary`, `options` (Layout/Style options A/B/C with pros/cons and budget), `scene_diff` (`added`, `modified`, `removed` walls/openings/furniture/materials), `cost_delta_vnd`, `budget_warning`, `preview_canonical`, `status` (`"PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED"`).
