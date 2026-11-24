# [FEAT-2026-132] Send Three.js canvas screenshot directly to AI render

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier UI agent |
| Người chấp thuận | User (task request) |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18T22:27+07:00 |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

The AI render flow (`POST /api/v1/projects/{id}/render/ai`) currently sends only
`{camera}`, so users must go through Blender as an intermediate step. The Three.js
viewport already creates its WebGL renderer with `preserveDrawingBuffer: true`, so the
current canvas can be read directly and sent as `base_image_data_url`.

## 2. Mục tiêu

- Clicking an AI render camera button captures the current 3D viewport canvas and sends it
  as `base_image_data_url` in the same request.
- If capture is unavailable (for example low-spec mode, or the viewport is not mounted),
  the request is sent exactly as before, without `base_image_data_url`.

## 3. Phạm vi

### In scope

- `StudioViewport.tsx`: optional `captureRef` prop; populate it after the renderer is created;
  clear it on effect cleanup.
- `AtelierDesignStudioPage.tsx`: create `captureRef`, pass it to `StudioViewport`, and
  capture the canvas at the start of `triggerAiRender` before the POST.

### Out of scope

- Rendering, camera, lighting, material, or delivery logic.
- Polling logic in `triggerAiRender` (kept intact).
- Other `StudioViewport` consumers (`SupportingPages.tsx`, `ConversationAtelierSidecar.tsx`,
  `Project3DStudioTab.tsx`): they do not pass `captureRef` and are unaffected.
- Backend changes. Whether the server consumes `base_image_data_url` is not changed here.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: React 19 (`MutableRefObject` type), Three.js `WebGLRenderer`.
- Dữ liệu dùng chung: none.
- Service/port/database không được ảnh hưởng: none.

## 5. Thiết kế và kế hoạch triển khai

1. Add optional `captureRef?: React.MutableRefObject<(() => string | null) | null>` to
   `StudioViewportProps` and destructure it.
2. Right after `renderer.domElement` is appended, set `captureRef.current` to a function
   that renders `scene`/`camera` once and returns `toDataURL('image/jpeg', 0.88)`, or `null` on error.
3. In the effect cleanup, set `captureRef.current = null` so the page never calls a disposed renderer.
4. In the page, `const captureRef = useRef<(() => string | null) | null>(null)`, passed as a prop.
5. In `triggerAiRender`, call `captureRef.current?.()` first; add `base_image_data_url` to the
   JSON body only when a non-null value comes back.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Edit | Add `captureRef` prop and populate or clear it |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Edit | Own the ref, pass it, capture in `triggerAiRender` |

## 7. Acceptance criteria

- [ ] AC-01: `StudioViewportProps` has an optional `captureRef`; existing consumers compile unchanged.
- [ ] AC-02: After the renderer is created, `captureRef.current` returns a `data:image/jpeg` URL.
- [ ] AC-03: On effect cleanup, `captureRef.current` is set to `null`.
- [ ] AC-04: `triggerAiRender` includes `base_image_data_url` when capture succeeds and omits it when it returns null.
- [ ] AC-05: Polling and existing `triggerAiRender` behaviour are otherwise unchanged.
- [ ] AC-06: `tsc --noEmit` for the UI project shows no new errors.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Type check | `npx tsc --noEmit -p paperclip/ui/tsconfig.json` (from repo root) | No new errors in the two edited files |
| Diff review | `git diff` / manual read | Only the listed additions, no other changes |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Capture returns a large data URL, so the request body is heavy | JPEG at 0.88 quality, as specified |
| Ref points to a disposed renderer after unmount | Cleared in effect cleanup; capture is wrapped in try/catch |
| Backend ignores `base_image_data_url` | Behaviour is the same as before; the field is optional |

Rollback point and how to roll back: revert the two file edits. No data or schema change.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Atelier UI agent
- Thời điểm: 2026-11-18T22:27+07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| | | | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18T22:27+07:00 | No git repo | `paperclip/ui/node_modules/.bin/tsc --noEmit -p paperclip/ui/tsconfig.json` | Pass (exit 0, no output) | AC-06 |
| 2026-11-18 | No git repo | Backend check: `apps/api/app/services/codex_render.py` `_write_data_url` accepts any `data:image/*;base64` URL up to 8 MB | Compatible with JPEG | Note only |
| Not run | — | Live browser test of the AI render button | Not run | Requires running app and Codex |

## 14. Kết quả và đóng chức năng

- Kết quả:
- Hạn chế còn lại:
- Việc chưa hoàn tất:
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:
