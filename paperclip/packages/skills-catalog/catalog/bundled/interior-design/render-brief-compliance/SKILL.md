---
name: render-brief-compliance
description: Kiểm tra ảnh render bám đúng render brief, Scene revision và các quyết định vật liệu; giữ rõ phần đề xuất chưa chốt.
key: paperclipai/bundled/interior-design/render-brief-compliance
defaultInstall: true
recommendedForRoles:
  - render-engineer
  - 3d-artist
  - architect
tags:
  - interior-design
  - rendering
  - brief
  - provenance
---

# Render Brief Compliance

## Owner

- **Primary Agent**: `Render Agent — Phối cảnh AI (Codex)` (`agent_render`)

## Trigger

- Trước khi gửi ảnh Blender hoặc AI vào Render Gallery.
- Khi Final QA đối chiếu một ảnh với Scene revision hiện hành.

## Requirements

- Đọc canonical project, scene revision và `render-brief.md` trước khi render.
- Giữ nguyên camera/framing, số lượng vật thể, cửa, cửa sổ và tỷ lệ phòng từ ảnh khung.
- Đối chiếu `brief_hash` và `revision` trên từng ảnh; lệch một trong hai là FAIL.
- Nếu brief có `missing_decisions`, vẫn cho phép ảnh minh họa nhưng phải gắn cảnh báo
  `ảnh dựa trên đề xuất chưa chốt` và không coi ảnh là căn cứ thi công.

## Output

```json
{
  "brief_hash": "sha256",
  "revision": 2,
  "missing_decisions": [],
  "warnings": [],
  "status": "PASS|WARN|FAIL"
}
```
