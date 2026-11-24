# FEAT-2026-130 — Render workflow, AI gallery & 3D Office status

**Status:** FROZEN  
**Version:** 1.0.0  
**Frozen:** 2026-11-18  
**Owner:** Atelier API / Paperclip UI

## Goal

Đưa Render Agent — Phối cảnh AI (Codex) vào workflow render hiện hữu, giữ
Blender là ảnh nền tảng, lưu ảnh AI/Blender trong gallery theo revision và
brief hash, đồng thời hiển thị trạng thái thật trong trang Ảnh render và 3D
Office. Khi Codex không khả dụng, workflow vẫn hoàn tất với Blender và ghi rõ
AI không khả dụng; tuyệt đối không tạo dữ liệu AI giả.

## Scope

- `render_gen` dùng cấu hình node `ai_render: auto|off`, mặc định `auto`,
  `required_views` cho `isometric`, `entrance`, `hero`, timeout và output/handoff
  có job id, ảnh, revision, brief hash.
- Render-brief thiếu quyết định vẫn được render với giá trị đề xuất và cảnh báo
  “ảnh dựa trên đề xuất chưa chốt”.
- Final QA kiểm tra revision của scene và `brief_hash`; sai thì FAIL.
- API gallery hợp nhất render Blender và AI, lọc revision/kind, cover lưu ở bảng
  riêng và truy xuất được cả dự án ẩn theo id.
- UI route “Ảnh render”, AI-vs-Blender compare/download/cover/re-render/polling,
  liên kết từ Design Studio và completion card.
- Cập nhật Render Agent profile/contract/catalog skills và panel 3D Office cho
  đủ skill, trạng thái job thật, thumbnail thành công và lỗi thất bại.
- Test mới dùng DB tạm; không gọi Codex thật trong bộ kiểm thử.

## Non-goals

- Không thay thế pipeline Blender/Codex hiện hữu.
- Không thay đổi SceneGraph, không dùng ảnh AI làm căn cứ thi công, không tự
  chốt các quyết định thiết kế còn thiếu.
- Không thay đổi payload dự án để lưu cover; không thêm polling nền mới ngoài
  polling UI đã có cho job cụ thể.

## Acceptance criteria

1. `render_gen` default `ai_render=auto`; `off` không gọi Codex. Blender hoàn
   tất thì workflow COMPLETED dù AI unavailable/timeout, với trạng thái và lý do
   AI rõ ràng.
2. Auto tạo job cho các `required_views`, ghi job/image/brief hash/revision vào
   output và handoff; missing decisions vẫn render cùng cảnh báo đề xuất.
3. Final QA FAIL nếu `brief_hash` không khớp brief hiện hành hoặc revision ảnh
   không khớp scene.
4. `GET /api/v1/projects/{id}/renders` trả item chuẩn `{id, kind, view/camera,
   revision, brief_hash, created_at, url, base_url, status, is_cover}`, hỗ trợ
   `revision` và `kind`; PUT cover dùng bảng riêng.
5. Route Ảnh render có grid revision mới trước, nhãn AI/Blender, xem lớn,
   before/after, tải xuống, đặt cover, render lại AI và polling 5 giây.
6. Render Agent có tên/version/skills đúng contract; catalog có hai skill mới
   đúng format; 3D Office đổi tên và hiển thị skill + trạng thái AI theo job.
7. Các test liên quan chạy được, UI typecheck/vitest được ghi nhận; file thay
   đổi có SHA-256 trong báo cáo nghiệm thu.

## Files / interfaces

- `apps/api/app/services/agent_orchestrator_engine.py`
- `apps/api/app/services/codex_render.py`
- `apps/api/app/services/render_brief.py`
- `apps/api/app/db.py`
- `apps/api/app/services/agent_prompts.py`
- `apps/api/app/services/multi_agent_chat_sync.py`
- `apps/api/app/main.py`
- `docs/agents/render-agent-codex.md`
- `paperclip/ui/src/App.tsx`
- `paperclip/ui/src/features/atelier/AtelierRenderGalleryPage.tsx`
- `paperclip/ui/src/features/atelier/ProjectCompletionCard.tsx`
- `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx`
- `paperclip/ui/public/ai-office/index.html`
- `paperclip/packages/skills-catalog/skills/render-brief-compliance/SKILL.md`
- `paperclip/packages/skills-catalog/skills/codex-ai-photoreal-render/SKILL.md`
- `tests/test_render_workflow_gallery.py`

## Risks and rollback

- Codex availability, cost and long-running jobs: disabled per node config or
  falls back to Blender; no real Codex call in tests.
- Existing dirty worktree: source files are copied to
  `scratch/backup-render-workflow/` before edits; rollback is file-level from
  that backup, without reset or commit.
- API schema compatibility: new cover table is additive and created lazily;
  existing render jobs and project payloads remain unchanged.

## Verification log

- `python -m pytest tests/test_render_workflow_gallery.py -q` → **7 passed**.
- `.venv/Scripts/python.exe -m pytest tests/test_eight_agent_workflow.py tests/test_multi_agent_group_chat.py tests/test_modern_default_finish_questions.py tests/test_project_visibility.py tests/test_codex_ai_render.py tests/test_render_workflow_gallery.py -q` → **69 passed**.
- `pnpm run typecheck` in `paperclip/ui` → **passed**.
- `pnpm exec vitest run src/features/atelier` in `paperclip/ui` → **12 files / 42 tests passed**.
- `pnpm --filter @paperclipai/skills-catalog validate` → **Catalog manifest valid, 49 skills**.
- UI visual screenshot verification was **not run**: port 5173 was not listening; existing API/UI ports 8000/3100 were left running.
- No real Codex call was made. Codex unavailable/timeout paths are covered by mocks and preserve Blender completion.
- SHA-256 (working-tree files): `db.py` C879187337BD4F23FBEE692CDD7919F84B78442993E370439B9CE95DF5EB2A68; `agent_orchestrator_engine.py` 7B2B2ECDF3EC562879719C81BFC6FDFD50343CBEC20FE3EAA3C53DE57D6B1095; `codex_render.py` D21E8FD8D136C170F326053EB740A1957A0C704925131802213B928BB3926B5C; `render_brief.py` D5A9FDBDCBB17C7CCED9D22E8940F51278FA7F369D3D81D292C9DD0406C36A0B; `agent_prompts.py` 408E9D2D9F54F6CE30F1F68AA05B1D542D6B9300031CAACA01B5B928E013BE29; `multi_agent_chat_sync.py` 746D400DC1B4F8F30E0A3FB6F83A550181D7EC730691C2F4645F02002441E937; `AtelierRenderGalleryPage.tsx` 4699B49D8E19849B57AB78051A5B7CF1ACE153441D5CE4C4BC9FC079DD5F60C9; `ai-office/index.html` 61812F097A50323F4EA41E1C42D02569E44305F48F8A826F80A9232E1E4BC1C2; `render-brief-compliance/SKILL.md` BBCA9B602995AA54025EFDC3A64CD05B973B517658073A580E0870272C4E528E; `codex-ai-photoreal-render/SKILL.md` A8B286FEBCAF0C64C133235F13DB4D741499B4E19AB4279E631CA0E074DF3835.

No commit is part of this task. Rollback source copies are in
`scratch/backup-render-workflow/`.

## Post-freeze user-directed patch — AI-only render surface

- The Design Studio render page now captures the current Three.js/WebGL preview
  and sends it as `base_image_data_url` to the AI render endpoint. The AI job no
  longer calls Blender to create its base image.
- The render compare page and gallery no longer expose Blender controls, labels,
  filters, or a Blender-vs-AI render action. The gallery requests `kind=ai`.
- A stale API process on port 8000 was intentionally not restarted because it is
  shared with the running workspace. Its old OpenAPI snapshot can still return
  `404 Not Found` for `/render/ai` until the API is restarted/reloaded.
- Verification after this patch: the six-test-suite regression remains
  **69 passed**; Atelier UI vitest remains **12 files / 42 tests passed**; UI
  typecheck passes; focused render tests are **20 passed**.

## Latest master-prompt extension — production Render Agent

The production Render Studio now uses the repository's actual Cycles bridge as
the primary Render Agent path. It adds read-only SceneAnalysis, geometry QA,
camera/lighting/quality planning, async job control, deterministic output QA,
revision/material-hash evidence and gallery publication. The previous AI-only
surface remains available as an optional enhancement route; it is not used as
the geometry source of truth.

Verification for the extension: **73 backend tests passed**, **12 Atelier UI
test files / 42 tests passed**, UI typecheck passed, and the skills catalog
manifest remains valid with **49 skills**.

Real smoke evidence: `proj_demo_4x5m`, Scene revision `2`, Hero camera, Draft
quality completed with renderer `BLENDER_CYCLES`; output QA passed at
`data/exports/renders/proj_demo_4x5m_rev2_eye_level_preview_92198cdc_a55dd2.png`
(960×540, metadata contains ProjectID/Revision/Camera/MaterialHash).
