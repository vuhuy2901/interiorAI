# [FEAT-2026-036] Strict source-to-Studio geometry pipeline

| Trường | Giá trị |
|---|---|
| Trạng thái | IMPLEMENTING |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | User request 2026-11-13 |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13T19:00:00+07:00 |
| Revision bắt đầu | ce745117d19dbffb0f0bf993a605a38ad02415a6 |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Studio currently creates a new project by cloning the living-room demo, allows
`FurnitureInstance.category` and `pascal_asset_id` to silently default to
`sofa`, accepts unproven raster scale at 10 mm/pixel, and can persist guessed
door/window/furniture geometry. Studio, Pascal and Blender also contain separate
geometry fallbacks that can diverge. Project `proj_564f46a5` revision 4 is the
first regression case; existing demo scenes and one additional non-bedroom
fixture must remain compatible.

## 2. Mục tiêu

Provide one strict, provenance-aware canonical pipeline from source
measurements to editable Studio/Pascal/Blender geometry. Invalid or ambiguous
measurements must stop before persistence. Existing projects and revisions stay
readable and are never silently migrated. Complete milestones M1 through M7 in
order, with a dedicated commit and green focused tests for each milestone.

## 3. Phạm vi

### In scope

- M1: strict furniture identity, measurement provenance/status, dimension-chain
  validation, and explicit legacy-default flags.
- M2: shared parametric geometry descriptions for supported architectural and
  furniture categories, consumed by Studio, Pascal and Blender.
- M3: deterministic wall anchoring and real wall-bound openings.
- M4: persistence-blocking geometry validation with declared contact exceptions.
- M5: truthful floor-plan intake with confirmed scale and UNKNOWN outputs rather
  than guessed openings or dimensions.
- M6: source overlay evidence and three regression scenes.
- M7: lighting/material/shadow quality only after M1-M6 pass. ControlNet requires
  a separate explicit user approval and is not implicitly authorized here.
- Preserve project `proj_564f46a5` revision 4, then create revision 5 only after
  the relevant validators pass. Use 3100 x 4000 mm for regression case 1; record
  the 600 + 1970 + 520 = 3090 mm chain and never substitute 2278 mm.
- Reimplement ideas independently; do not copy code from the three reference
  repositories.

### Out of scope

- No Studio UI redesign, feature removal, second editor, second project system,
  new production project, or deletion/rewriting of old revisions.
- No automatic coordinate repair, implicit scaling, inferred construction
  dimensions, final bunk-bed safety approval, material/style change, or new
  furniture objects.
- No repository cloning or source copying from Planova,
  ai-floorplan-to-3d, or Janavee01/floorplan.
- No ControlNet implementation without a later approved change request.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Pydantic canonical contracts, SQLite revision store, Pascal MCP,
  Paperclip Studio/Three.js, Blender 4.2.3/Cycles, OpenCV floor-plan intake.
- Dữ liệu dùng chung: `C:/Users/TUAN/Downloads/data/atelier.db`, all current
  project/revision rows, source-plan inputs and render artifacts.
- Service/port/database không được ảnh hưởng: Paperclip 3100 and API 8000 may be
  inspected but are not restarted or repointed without process ownership and a
  rollback path. No destructive database migration.
- Dirty worktree changes outside this contract remain user-owned and must not be
  reset, restored, stashed or included in milestone commits.

## 5. Thiết kế và kế hoạch triển khai

1. M1 introduces strict input contracts and legacy read compatibility. New
   writes reject missing identity. Measurements carry value, source and status;
   dimension chains reject mismatch. Legacy defaults remain readable but are
   flagged in API output and fail strict re-save until reviewed.
2. M2 defines a renderer-neutral parametric geometry descriptor and category
   registry. Studio, Pascal and Blender adapt that descriptor without category
   specific duplicate dimensions.
3. M3 resolves wall/align/offset/distance into canonical transforms and validates
   opening membership before constructing wall cuts.
4. M4 runs strict validation before `save_project` creates a revision. Declared
   contacts are allowed; all other out-of-bounds, overlap, semantic and height
   errors return structured 422 responses.
5. M5 separates source extraction from user confirmation. Unconfirmed scale or
   unreadable dimensions remain UNKNOWN; no door/window is synthesized.
6. M6 creates deterministic overlay/report tooling and regression fixtures for
   the children's bedroom, existing living-room demo and one additional room.
7. M7 improves existing render outputs without altering geometry or UI.

Each milestone is verified and committed before work starts on the next one.
Discovery of a measurement contradiction pauses only the dependent milestone
and records the exact conflicting chains.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `apps/api/app/models/contracts.py` | M1 contracts | Remove unsafe write defaults; add provenance/legacy markers |
| `apps/api/app/services/measurement_validation.py` | M1 new service | Validate statuses and dimension chains |
| `apps/api/app/main.py` | M1/M4/M5 API enforcement | Reject invalid writes before revision persistence |
| `apps/api/app/db.py` | Compatibility only | Flag legacy payloads without rewriting stored JSON |
| `apps/api/app/services/parametric_geometry.py` | M2 new registry | Single renderer-neutral geometry description |
| `packages/pascal-adapter/gateway.mjs` | M1-M3 adapter | Remove sofa fallback; consume canonical geometry/anchors |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | M2-M3 renderer adapter | Consume shared descriptors; no UI changes |
| `apps/api/app/services/blender_mcp.py` | M2/M6/M7 renderer adapter | Consume shared descriptors and produce evidence renders |
| `apps/api/app/services/geometry.py` | M3-M4 validator | Strict boundaries, contacts, semantics and opening checks |
| `apps/api/app/services/floorplan_cv.py` | M5 intake | Remove guessed scale/openings; preserve UNKNOWN provenance |
| `apps/api/app/services/source_overlay.py` | M6 new tool | Produce 40% overlay and measured deviation report |
| focused tests/fixtures | M1-M7 verification | Three-room regression coverage |
| `NOTICE` | only if required | No third-party code planned; update only if that changes |

## 7. Acceptance criteria

- [ ] AC-01: New writes cannot omit furniture category or use an implicit sofa
  asset; errors identify the field and entity.
- [ ] AC-02: Every authored measurement carries source and
  CONFIRMED/INFERRED/UNKNOWN status; UNKNOWN is not construction geometry.
- [ ] AC-03: Dimension-chain mismatch returns the exact chain, expected total,
  actual total and delta; no scaling or persistence occurs.
- [ ] AC-04: Existing revisions remain byte-for-byte unchanged and readable;
  legacy default values are explicitly flagged.
- [ ] AC-05: Supported categories use one parametric geometry description across
  Studio, Pascal and Blender; stairs are one object with multiple steps.
- [ ] AC-06: Wall-anchored transforms use only wall, align, offset and
  wall_distance_mm; doors/windows reference and cut the correct wall.
- [ ] AC-07: Invalid boundary, overlap, semantic, height or opening data blocks a
  new revision. Declared bunk/stair contact is the only case-1 exception.
- [ ] AC-08: Floor-plan intake never assumes 10 mm/pixel and never synthesizes
  unproven doors/windows.
- [ ] AC-09: Regression fixtures for three rooms pass strict validation and
  overlays report <=20 mm deviation where source dimensions are confirmed.
- [ ] AC-10: Children's-bedroom revision 4 is preserved and revision 5 is created
  only after the source-aligned 3100 x 4000 mm scene passes M1-M6 checks.
- [ ] AC-11: Creating a project from an arbitrary image produces neither a
  default sofa nor an automatically placed opening.
- [ ] AC-12: M7 does not alter canonical geometry. ControlNet is not executed
  without explicit later approval.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| M1 contracts | focused pytest for strict/legacy/chain cases | reject unsafe writes; preserve legacy reads |
| M2 registry | descriptor snapshots plus adapter/renderer tests | identical semantic parts and extents |
| M3 anchors/openings | coordinate and wall-cut tests | exact transforms and host-wall membership |
| M4 persistence gate | API tests against temporary DB | invalid PUT creates no revision |
| M5 intake | raster fixtures with/without scale evidence | UNKNOWN/no guessed openings when unconfirmed |
| M6 regression | three fixtures + overlay pixel/mm report | validators pass and confirmed deviation <=20 mm |
| M7 render | Cycles verification and visual inspection | improved image; unchanged geometry hash |
| Compatibility | read old project/revision snapshots | old data opens; legacy flags visible |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Strict Pydantic fields break legacy reads | Separate legacy-read normalization from strict-write validation |
| Dirty worktree contaminates commits | Stage only contract-owned files/hunks; inspect every staged diff |
| Three renderers drift | Shared descriptor snapshots and hash/extents checks |
| Source dimensions contradict | Stop and report exact chains; never infer a replacement |
| Validator blocks normal contact | Explicit contact contracts with narrow category/entity scope |
| External license ambiguity | No source copying; independent implementation only |
| Revision corruption | Validate before save; preserve revision 4 and use revision 5 only after pass |

Rollback point and cách rollback: each milestone commit is independently
revertible. Revert only the relevant milestone commit; never reset the worktree
or delete database rows. Revision 4 remains the live recovery point until
revision 5 passes M1-M6.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex, theo yêu cầu trực tiếp của user.
- Thời điểm: 2026-11-13T19:00:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-13T19:40:00+07:00 | Tạm dừng M2-M7 system hardening; thực hiện một presentation revision cho đúng project phòng trẻ em hiện tại, cho phép sai số bố cục 100-200 mm và chọn số hợp lý khi nguồn mâu thuẫn. Ưu tiên semantic furniture, materials, lighting, decor và ba render; không thêm validator/refactor. | Người dùng đổi mục tiêu từ hồ sơ kỹ thuật sang ảnh trình bày và yêu cầu không dừng hỏi số đo. | M1 vẫn giữ nguyên. Revision cũ được bảo toàn. Phạm vi pass này chỉ gồm scene data/revision và render outputs; không thay UI, workflow hay project identity. | User request 2026-11-13 | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13T19:00:00+07:00 | ce745117 | Contract frozen | No implementation files changed by this contract yet |
| 2026-11-13T19:20:00+07:00 | M1 commit (this revision) | Strict identity, measurement evidence, legacy flags and dimension-chain gate | No database rows or scene revisions changed |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13T19:18:00+07:00 | M1 working tree | Focused strict contract tests | PASS | `7 passed in 3.91s` |
| 2026-11-13T19:20:00+07:00 | M1 working tree | Strict + Pascal + smart-fit + project compatibility suite | PASS | `21 passed in 10.25s` |
| 2026-11-13T19:20:00+07:00 | M1 working tree | Python compile, Node syntax, diff check | PASS | No syntax or whitespace errors; line-ending warnings only |

## 14. Kết quả và đóng chức năng

- Kết quả: Chưa hoàn tất.
- Hạn chế còn lại: M1-M7 chưa triển khai.
- Việc chưa hoàn tất: Toàn bộ milestone implementation and verification.
- Rollback point: ce745117d19dbffb0f0bf993a605a38ad02415a6
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
