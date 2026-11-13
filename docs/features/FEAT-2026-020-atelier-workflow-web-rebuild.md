# [FEAT-2026-020] Làm lại giao diện Atelier workflow và trạng thái lỗi

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier platform |
| Người chấp thuận | User request, 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 10:45 +07:00 |
| Revision bắt đầu | `628d46151f244213059e9882176c739b4b08e8e4` + working tree |
| Revision cuối | `628d46151f244213059e9882176c739b4b08e8e4` + working tree |

## 1. Bối cảnh

Web Atelier hiện hiển thị workflow bằng hai khối card và một bảng đơn giản,
thiếu phân cấp vận hành, phản hồi tải/lỗi chưa đủ rõ, và không giúp người dùng
nhanh chóng nhận biết project nào cần hành động. Kiểm tra runtime ngày
2026-11-12 ghi nhận `/api/health` trả 503 và `/api/atelier/company-workflow`
trả 500; UI phải hiển thị lỗi có hướng xử lý thay vì trạng thái mơ hồ.

## 2. Mục tiêu

- Làm lại Company Workflow và Project Workflow Monitor thành giao diện điều
  phối rõ ràng, responsive, dùng được trên desktop và màn hình hẹp.
- Hiển thị ngay tổng quan trạng thái, project cần chú ý, workflow stages và
  blocker/dependency bằng ngôn ngữ nhất quán.
- Có loading skeleton, empty state, error state có nút thử lại; không để lỗi
  API biến thành màn hình trắng hoặc spinner vô hạn.
- Không thay đổi hợp đồng API, dữ liệu workflow, quyền truy cập hoặc logic
  orchestration hiện có.

## 3. Phạm vi

### In scope

- Làm lại hai route `/control-center` và `/projects/:projectId/workflow`.
- Bổ sung tính toán hiển thị tổng quan từ payload hiện có.
- Cải thiện trạng thái loading/error/empty và thao tác refresh.
- Tuân thủ token layer và rule UI của Paperclip; kiểm tra responsive và
  accessibility cơ bản.

### Out of scope

- Sửa schema, route, authorization hoặc workflow orchestration backend.
- Thay đổi cơ chế bootstrap, database, Node runtime hoặc startup script.
- Thêm thư viện UI mới, thêm ảnh/asset ngoài hệ thống hiện có.
- Thay đổi điều kiện dependency, approval, handoff hoặc decision ledger.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: React/Vite hiện có, router hiện có, API `/api/atelier/*`, token
  trong `ui/src/index.css`.
- Dữ liệu dùng chung: company workflow definitions, project workflow runs,
  stage status và blocker reason.
- Service/port/database không được ảnh hưởng: Paperclip `3100`, embedded
  PostgreSQL `54329`, mọi API dưới `/api/atelier/*`.

## 5. Thiết kế và kế hoạch triển khai

1. Giữ architectural white và accent teal hiện có; ưu tiên cấu trúc vận hành,
   không thêm gradient/glass decoration.
2. Company view: header hành động, status summary, stage rail, project queue;
   các project cần input/blocker nổi bật trước.
3. Project view: breadcrumb/back, run identity, stage timeline/list, blocker
   explanation và dependency details.
4. Tách helper hiển thị status để mọi trạng thái dùng cùng vocabulary/icon.
5. Thêm trạng thái lỗi có mã lỗi ngắn, hướng dẫn retry và không che mất nội
   dung đã tải trước đó.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/AtelierWorkflowMonitor.tsx` | Sửa giao diện và state | Làm lại hai màn hình workflow |
| `paperclip/ui/src/features/atelier/*` (nếu cần helper cục bộ) | Bổ sung nhỏ | Tái sử dụng status/loading/error presentation |
| `paperclip/ui/src/index.css` (chỉ khi cần token thiếu) | Bổ sung token | Tuân thủ token-only UI |
| `docs/features/FEAT-2026-020-atelier-workflow-web-rebuild.md` | Ghi evidence | Theo dõi revision và verification |

## 7. Acceptance criteria

- [ ] AC-01: Company workflow route hiển thị rõ definition/version, tổng quan
  trạng thái, stage flow và danh sách project từ payload thật.
- [ ] AC-02: Project workflow route hiển thị run metadata, stage status, owner,
  dependency và blocker reason trên desktop và mobile.
- [ ] AC-03: Loading có skeleton; API lỗi có thông báo tiếng Việt dễ hiểu và nút
  thử lại; empty data có hướng dẫn tiếp theo.
- [ ] AC-04: Không thay đổi endpoint/API payload, navigation contract hoặc
  orchestration behavior.
- [ ] AC-05: UI build, typecheck/token gate và kiểm tra route liên quan chạy đạt.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Typecheck UI | `pnpm --filter @paperclipai/ui typecheck` | Pass |
| Build UI | `pnpm --filter @paperclipai/ui build` | Pass |
| Token gate | `pnpm check:token-gates` | Pass hoặc không phát sinh violation mới |
| API smoke | `Invoke-RestMethod http://127.0.0.1:3100/api/health` và route Atelier | Ghi nhận trạng thái thực tế; UI vẫn có error state khi API lỗi |
| Visual smoke | Mở `/control-center` và project workflow ở desktop/mobile | Không tràn layout, trạng thái đọc được, retry hoạt động |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| UI mới lệch token hoặc phá layout shell | Chỉ sửa feature component, chạy token gate/build |
| API đang unhealthy làm visual smoke không có dữ liệu | Dùng mock/fallback state qua test hoặc kiểm tra error state; không sửa backend ngoài scope |
| Payload null/khác kỳ vọng | Defensive rendering và empty state |

Rollback point và cách rollback: revert revision triển khai FEAT-2026-020; không
đụng dữ liệu hoặc migration backend.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 10:45 +07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-12 11:20 +07:00 | Ngừng mở rộng UI tĩnh dưới contract này; mọi thay đổi Workflow Builder tiếp theo chuyển sang FEAT-2026-021 | Yêu cầu mới bổ sung versioning, editor và backend governance, vượt phạm vi redesign monitor | FEAT-020 giữ nguyên evidence; FEAT-021 sở hữu các thay đổi tiếp theo | User request, 2026-11-12 | 0.2 |
| 2026-11-12 10:52 +07:00 | `628d46151` + working tree | Làm lại Company Workflow và Project Workflow Monitor; thêm loading, error, empty states và status summary | Giữ nguyên API/backend; UI đọc dữ liệu thật và retry được | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-12 10:53 +07:00 | `628d46151` + working tree | `pnpm --filter @paperclipai/ui typecheck` | PASS | UI typecheck hoàn tất, Storybook catalog 346 files / 3186 stories |
| 2026-11-12 10:54 +07:00 | `628d46151` + working tree | `pnpm --filter @paperclipai/ui build` | PASS | Vite build thành công; chỉ còn warning CSS/Vite đã có |
| 2026-11-12 10:54 +07:00 | `628d46151` + working tree | `node scripts/check-token-gates.mjs` | PASS | 4 gates CLEAN |
| 2026-11-12 10:56 +07:00 | `628d46151` + working tree | `/api/health` và `/api/atelier/company-workflow` | PASS | `status=ok`, `bootstrap=ready`, 2 projects, 8 stages, definition v1 |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã triển khai lại hai màn hình workflow với hierarchy vận hành, summary, pipeline, project queue, loading/error/empty states và retry.
- Hạn chế còn lại: Runtime Node đang là 22.19.0, dưới yêu cầu >=24.11.0 của Paperclip.
- Việc chưa hoàn tất: visual smoke qua browser thật chưa chạy được vì browser access host không khả dụng trong phiên này.
- Rollback point: revision triển khai FEAT-2026-020.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa có.
