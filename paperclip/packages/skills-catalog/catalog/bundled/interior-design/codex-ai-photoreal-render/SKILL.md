---
name: codex-ai-photoreal-render
description: Nâng ảnh khung Blender thành ảnh nội thất photoreal bằng Codex khi được bật, giữ nguyên bố cục và ghi provenance job/image.
key: paperclipai/bundled/interior-design/codex-ai-photoreal-render
defaultInstall: true
recommendedForRoles:
  - render-engineer
  - 3d-artist
  - designer
tags:
  - interior-design
  - rendering
  - codex
  - photoreal
  - blender
---

# Codex AI Photoreal Render

## Owner

- **Primary Agent**: `Render Agent — Phối cảnh AI (Codex)` (`agent_render`)

## Trigger

- Node `render_gen` có `ai_render: auto` hoặc người dùng chọn “Render lại bằng AI”.

## Workflow

1. Render Blender làm ảnh khung của canonical Scene revision.
2. Đưa ảnh khung và brief đã giới hạn độ dài vào Codex job riêng.
3. Chỉ chấp nhận ảnh có job id, `brief_hash`, revision, view/camera và file thật.
4. Codex unavailable/timeout/error là trạng thái thật; giữ ảnh Blender và không tạo ảnh giả.
5. Đặt nhãn ảnh minh họa AI, lưu gallery và chuyển bằng chứng cho Final QA.

## Guardrails

- Không thêm/bớt/di chuyển đồ, cửa hoặc cửa sổ; không đổi tỷ lệ phòng.
- Không dùng ảnh AI để đo kích thước, lập BOM hoặc thay thế SceneGraph.
- Nếu `brief_hash` hoặc revision không khớp, Final QA phải FAIL.

## Output

```json
{
  "job_id": "aijob_…",
  "view": "hero",
  "revision": 2,
  "brief_hash": "sha256",
  "status": "COMPLETED|UNAVAILABLE|FAILED",
  "image_url": "/api/v1/renders/…"
}
```
