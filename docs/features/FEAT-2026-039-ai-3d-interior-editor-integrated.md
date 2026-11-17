# [FEAT-2026-039] AI 3D Interior Editor tích hợp trong Design Studio hiện hữu

| Trường | Giá trị |
|---|---|
| Trạng thái | IMPLEMENTING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng (2026-11-16) |
| Ngày tạo | 2026-11-16 |
| Frozen at | 2026-11-16T00:00:00+07:00 |
| Revision bắt đầu | `a753015a6` (submodule Paperclip) |
| Revision cuối | Chưa có |

## 1. Bối cảnh

`design-studio` đã dựng SceneGraph Three.js, raycast mesh, chọn object, ánh xạ `entityId`/`partName`, phần vật liệu PBR và Inspector. Tuy nhiên các capability này bị phân tán: Inspector dạng accordion, thao tác transform không có gizmo/undo-redo thống nhất, và picker mới chỉ suy luận named part từ mesh thay vì cung cấp metadata kỹ thuật rõ ràng. Một trang Bedroom Studio 2D riêng không thuộc mục tiêu này.

## 2. Mục tiêu

Biến Design Studio 3D hiện hữu thành editor nội thất tích hợp: chọn object/part trực tiếp, xem và sửa transform/vật liệu có preview, undo/redo, cảnh báo kỹ thuật, autosave an toàn vào SceneGraph/revision hiện hữu, và 2D là một chế độ xem cùng nguồn dữ liệu.

## 3. Phạm vi

### In scope

- Mở rộng `AtelierDesignStudioPage`, `StudioViewport`, `ObjectInspector` và context hiện hữu; không thêm route editor độc lập.
- Toolbar chọn/move/rotate/scale/measure, inspector tabs, collapse, dirty/technical status, undo/redo.
- Raycast trả selection object + part metadata; support material slot/named part khi SceneGraph/GLB cung cấp dữ liệu.
- Material browser dùng PBR catalog hiện hữu; preview chỉ trên part đã chọn và apply-to-same-type có ý định người dùng rõ ràng.
- Transform input mm/degree, visual gizmo, rotation presets, collision/boundary warnings và vị trí tường theo geometry scene hiện hữu.
- Đồng bộ cùng state cho view 2D/3D; save/revision API đã có.
- Cảnh báo giới hạn có cấu trúc nếu asset chỉ có một mesh hoặc không có slot/part metadata; không tạo mã SKU, giá, độ dày hoặc hãng giả.

### Out of scope

- Trang/module 2D hay Decision Ledger độc lập.
- Tự động tách mesh GLB một khối thành các bộ phận vật lý đáng tin cậy.
- Tự áp dụng prompt AI lớn không qua proposal/approval flow đã có.
- Mở rộng Canonical Project schema cho dữ liệu không có nguồn xác thực.

## 4. Dependency và tài nguyên cần bảo vệ

- Three.js renderer/raycast tại `StudioViewport.tsx`; PBR resolver/catalog; endpoint SceneGraph/revision `/api/v1/projects/:id/scene` và `/materials`.
- Không thay đổi ownership, project scope hoặc revision semantics của API.
- Không chỉnh sửa trang Bedroom Studio độc lập thuộc FEAT-038 trong pass này.

## 5. Thiết kế và kế hoạch triển khai

1. Chuẩn hóa type selection part và history thuần, có test geometry/history.
2. Mở rộng raycast metadata và highlight lựa chọn trong viewport; thêm editor interaction toolbar/gizmo.
3. Chuyển Inspector sang tab theo yêu cầu, đưa material/technical provenance rõ ràng và giới hạn asset.
4. Nối undo/redo/dirty/autosave với `AtelierStudioContext` và save revision hiện hữu.
5. Kiểm thử selection part, material isolation, transform, history và build.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-039-ai-3d-interior-editor-integrated.md` | Mới | Hợp đồng/bằng chứng |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Cập nhật | Toolbar, tabs, history, save status |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Cập nhật | Picking metadata, highlight/gizmo/measure |
| `paperclip/ui/src/features/atelier/ObjectInspector.tsx` | Cập nhật | Inspector tabs và metadata part/material |
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Cập nhật | Transactional editor history/autosave state |
| `paperclip/ui/src/features/atelier/*test.ts` | Cập nhật/mới | Regression evidence |

## 7. Acceptance criteria

- [ ] AC-01: `design-studio` là entry point duy nhất cho editor; hiển thị project/room đúng context và không tự tạo data mẫu.
- [ ] AC-02: Click mesh chọn đúng object và part khi metadata có; có outline và Inspector hiện type/id/kích thước/transform/status.
- [ ] AC-03: Material apply chỉ ảnh hưởng part được chọn; metadata chưa xác định hiện rõ là chưa xác định.
- [ ] AC-04: Transform UI/gizmo/keyboard input/rotation presets dùng mm/degree; cảnh báo collision/boundary và không tính label/outline.
- [ ] AC-05: Undo/redo, dirty/autosave/save revision và reload project scope không lẫn dữ liệu.
- [ ] AC-06: 2D/3D share một SceneGraph source, đổi view không mất transform/material.
- [ ] AC-07: Build và focused tests pass; evidence ghi rõ các giới hạn GLB đơn mesh và browser checks chưa chạy nếu có.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Editor unit tests | Vitest focused | Selection/history/geometry/material isolation pass |
| UI build/typecheck | `pnpm --filter @paperclipai/ui typecheck` + `build` | Exit 0 |
| Browser smoke | Open design studio with real scene | Object/part clicks, transforms, material, save, reload correct |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| GLB thiếu semantic part/slot | Hiển thị asset limitation; chỉ expose whole-object/body, không giả part |
| Preview mutation làm rò material | Clone/target material by selected part; test isolation |
| Autosave tạo revision quá nhiều | Debounce and save only dirty scene through existing endpoint |

Rollback point và cách rollback: hoàn nguyên thay đổi FEAT-039 trong submodule Paperclip và contract này; SceneGraph/revision API không đổi schema.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của người dùng.
- Thời điểm: 2026-11-16T00:00:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-16 | Gỡ hoàn toàn route và module Bedroom Studio độc lập; chỉ giữ Design Studio tích hợp | Yêu cầu mới nhất: không dùng module `/ATL/bedroom-studio` | Xóa route/lazy import/sidebar links và các file module; Design Studio hiện hữu là entry point duy nhất | Người dùng yêu cầu trực tiếp | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-16 | `a753015a6` + working tree | Rà soát renderer, raycast, part/material mapping, Inspector và save/revision path | Xác nhận editor hiện hữu đã có nền tảng integration, không cần module 3D song song |
| 2026-11-16 | `a753015a6` + working tree | Gỡ lối điều hướng từ Design Studio sang Bedroom Studio độc lập | Entry point editor được giữ ở Design Studio; phần còn lại đang triển khai |
| 2026-11-16 | `a753015a6` + working tree | Đổi Workflow Manager từ mở thẳng React Flow sang Workflow Library mặc định | React Flow vẫn giữ trong chế độ Tinh chỉnh; Execution/History giữ trace hiện hữu |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-16 | `a753015a6` + working tree | `rg -n "bedroom-studio|AtelierBedroomStudioPage|BedroomDesignStudio" paperclip/ui/src` | PASS — không còn route, import, sidebar link hoặc module reference trong UI source | Local working tree |
| 2026-11-16 | `a753015a6` + working tree | `pnpm --filter @paperclipai/ui typecheck` | PASS | Storybook catalog + TypeScript build exit 0 |
| 2026-11-16 | `a753015a6` + working tree | Workflow Manager UI smoke by source review | PASS — Library mặc định, Tinh chỉnh mở builder, lifecycle không còn ở nav Library | `AtelierWorkflowBuilder.tsx` |

## 14. Kết quả và đóng chức năng

- Kết quả: Chưa triển khai.
- Hạn chế còn lại: Chưa kiểm chứng.
- Việc chưa hoàn tất: Implementation và verification.
- Rollback point: Revision trước FEAT-039.
- Trạng thái `CLOSED` bởi: Chưa áp dụng.
- Thời điểm: Chưa áp dụng.
