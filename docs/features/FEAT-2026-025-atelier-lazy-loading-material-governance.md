# [FEAT-2026-025] Sửa loading vật liệu và giảm tải Atelier frontend

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 0.3 |
| Owner | Codex / Atelier frontend |
| Người chấp thuận | Yêu cầu người dùng 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 23:45 +07:00 |
| Revision bắt đầu | `628d46151` + FEAT-2026-021..024 working tree |
| Revision cuối | `628d46151` + working-tree implementation 2026-11-13 |

## 1. Bối cảnh

`AtelierStudioProvider` đọc `nextProjects[0].id` trong khi API trả
`project_id`, khiến project đầu tiên không được chọn và trang vật liệu chờ vô
hạn. Provider cũng tải catalog và project bundle trên mọi route của Paperclip,
gây network/CPU dư thừa và cảm giác lag.

## 2. Mục tiêu

- Trang Material Catalog tự chọn project hợp lệ và thoát loading.
- Route không dùng Atelier không phát request catalog/scene Atelier.
- Dữ liệu nặng chỉ tải theo nhóm route cần thiết, không tạo vòng fetch lặp.
- AI chỉ đề xuất vật liệu; thay đổi persisted vẫn qua user action/approval gate.

## 3. Phạm vi

### In scope

- Sửa `project_id` selection và chống active project không còn trong list sạch.
- Route-aware lazy loading trong Atelier provider.
- Tách core project bundle và optional catalog/control-plane fetch khi có thể.
- Loading/error state rõ ràng cho trang vật liệu.
- Browser/network evidence và focused tests/typecheck/build.
- Gỡ trang/picker catalog vật liệu khỏi navigation; URL cũ chuyển về Design
  Studio để người dùng yêu cầu AI tìm màu và tạo material proposal.
- Gỡ picker sơn/sàn preset khỏi Inspector; thay bằng hướng dẫn mở AI Copilot để
  AI tìm màu, đề xuất vật liệu và gửi proposal chờ duyệt.

### Out of scope

- Thay renderer Three.js, nén lại toàn bộ asset GLB/texture hoặc redesign UI.
- Cho AI tự áp dụng vật liệu không cần duyệt.
- Xóa catalog, project hoặc evidence cũ.
- Xóa catalog kỹ thuật nội bộ mà AI/renderer cần để resolve màu, PBR và nguồn.

## 4. Dependency và tài nguyên cần bảo vệ

- `AtelierStudioContext`, Material Catalog, Studio viewport và chat sidecar.
- API `/api/v1/*`, proposal/approval và scene revision hiện tại.
- Không thay đổi material governance ở backend.

## 5. Thiết kế và kế hoạch triển khai

1. Dẫn route intent từ router vào provider.
2. Tải project list trước; chọn bằng `project_id`; sau đó tải bundle đúng project.
3. Chỉ tải catalog cho Studio/material/chat routes; control-plane data cho route
   thực sự dùng.
4. Chặn request stale bằng AbortController và không fetch lặp cùng resource.
5. Verify browser, request inventory và material approval behavior.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | bug/perf fix | Chọn project và lazy-load |
| `paperclip/ui/src/features/atelier/AtelierPages.tsx` | UX fix | Loading/error đúng ngữ cảnh |
| `paperclip/ui/src/components/Sidebar.tsx` | navigation cleanup | Gỡ entry catalog thủ công |
| `paperclip/ui/src/components/CoordinatorSidebar.tsx` | navigation cleanup | Gỡ entry catalog ở streamlined shell |
| `paperclip/ui/src/App.tsx` | route cleanup | Redirect URL cũ về Design Studio |
| `paperclip/ui/src/features/atelier/ObjectInspector.tsx` | interaction cleanup | Gỡ picker preset thủ công, giữ AI proposal |
| focused tests/evidence | test | Chống loading vô hạn và request dư |

## 7. Acceptance criteria

- [x] AC-01: Material Catalog hiển thị project và catalog, không kẹt loading.
- [x] AC-02: Project đầu tiên được chọn bằng `project_id` và chỉ thuộc danh sách
  không fixture.
- [x] AC-03: Route không thuộc Atelier không gọi catalog/project legacy.
- [x] AC-04: Không có vòng fetch lặp khi active project ổn định.
- [x] AC-05: AI proposal không tự persist material; user/approval vẫn là gate.
- [x] AC-06: UI typecheck/build và browser smoke pass.
- [x] AC-07: Sidebar không còn Material Catalog; URL cũ redirect về Design
  Studio; catalog nội bộ vẫn tồn tại cho AI proposal/renderer.
- [x] AC-08: Inspector không còn danh sách/picker preset sơn và sàn; người dùng
  được hướng sang AI Copilot và proposal vẫn chờ phê duyệt trước khi áp dụng.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| UI typecheck/build | pnpm focused | PASS |
| Browser materials | Playwright | content visible, 3 projects sạch |
| Network audit | Playwright request log | không loop; route thường không tải Atelier |
| Governance audit | source/API inspection | proposal/approval gate giữ nguyên |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Chat sidecar thiếu scene | Chat route nằm trong route intent |
| Điều hướng SPA không kích hoạt load | Dùng router location, không đọc pathname một lần |
| Response cũ ghi đè project mới | AbortController/identity check |

Rollback: revert FEAT-2026-025; backend và dữ liệu không đổi.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 23:45 +07:00.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-12 23:53 +07 | Gỡ trang catalog vật liệu khỏi UI, chuyển interaction sang AI proposal | Người dùng xác nhận không cần vật liệu preset/manual picker | Sidebar + route; backend catalog giữ nội bộ; approval không đổi | User request | 0.2 |
| CR-002 | 2026-11-13 00:18 +07 | Gỡ picker preset sơn/sàn còn lại trong Design Studio Inspector | Browser verification cho thấy picker thủ công vẫn xuất hiện sau khi gỡ route | ObjectInspector chỉ giữ hướng dẫn AI Copilot; backend catalog và approval không đổi | User request và browser evidence | 0.3 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13 | working tree | Sửa `project_id`, route-aware lazy load và ref guards | Route thường không tải Atelier |
| 2026-11-13 | working tree | Gỡ catalog route/nav và manual material/PBR picker | AI Copilot là entry point; approval giữ nguyên |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 | working tree | UI typecheck | PASS | pnpm focused typecheck |
| 2026-11-13 | working tree | UI production build | PASS | Vite build, 8315 modules |
| 2026-11-13 | working tree | Browser route/nav/picker audit | PASS | `PERFORMANCE_AND_DATA_AUDIT.md` |
| 2026-11-13 | working tree | AI Copilot button | PASS, mở panel Chief Architect | Browser screenshot observation |

## 14. Kết quả và đóng chức năng

- Kết quả: Không còn catalog/picker thủ công; AI Copilot chịu trách nhiệm tìm màu và tạo proposal chờ duyệt. Fetch dư và loading vô hạn đã được sửa.
- Hạn chế còn lại: Bundle chính vẫn lớn và Node hiện tại là 22.19.0 trong khi repo khuyến nghị 24.11.0 trở lên.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: `628d46151` + working tree hiện tại.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-13 00:32 +07:00.
