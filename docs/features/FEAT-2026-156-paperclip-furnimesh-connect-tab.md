# [FEAT-2026-156] Tab FurniMesh và kết nối MCP trong Paperclip UI

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.0 |
| Owner | Claude |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 (thời điểm tạo file, ICT) |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

- Paperclip đã có app catalog với slug `furnimesh` (`paperclip/packages/shared/src/app-definitions/furnimesh.json`) và trang chi tiết app. Trang này đã nhúng `FurniMeshLibraryPanel.tsx`.
- Chưa có mục sidebar riêng để người dùng kết nối FurniMesh MCP, kiểm tra trạng thái và biết các bước cần làm.
- Cổng scene AlterAI đang gán cứng `http://localhost:8123/` trong UI Paperclip, không thể cấu hình.

## 2. Mục tiêu

- Có mục sidebar "FurniMesh" mở trang kết nối riêng.
- Từ trang này, người dùng tạo được connection tới FurniMesh MCP chỉ với một nút.
- Trạng thái kết nối hiển thị rõ và có thể kiểm tra lại.
- Cổng scene AlterAI đọc từ cấu hình, không gán cứng.

## 3. Phạm vi

### In scope

- Mục sidebar "FurniMesh" trong `paperclip/ui/src/components/Sidebar.tsx` (hoặc component sidebar liên quan).
- Trang/tab FurniMesh trong `paperclip/ui/src/pages/` gồm:
  - Nút Kết nối: tạo connection từ app catalog slug `furnimesh`, `serverUrl` mặc định `http://127.0.0.1:3180/mcp`.
  - Chỉ báo trạng thái (chưa kết nối / đang kiểm tra / đã kết nối / lỗi).
  - Nút Kiểm tra kết nối.
  - Hướng dẫn 3 bước.
  - Nhúng `FurniMeshLibraryPanel`.
- Cấu hình cổng scene AlterAI: thay vì hard-code `http://localhost:8123/`, đọc từ setting của Paperclip hoặc biến cấu hình, mặc định giữ nguyên `http://localhost:8123/`.
- Cập nhật contract shared/server/ui nếu cần cho các trường mới.

### Out of scope

- Thay đổi logic MCP server (thuộc FEAT-2026-155).
- Tab FurniMesh trong `ai-office-standalone/index.html` (thuộc FEAT-2026-157).
- Thay đổi luồng OAuth hoặc xác thực của connection hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: app catalog và API connection hiện có của Paperclip server; `FurniMeshLibraryPanel.tsx`.
- Dữ liệu dùng chung: bảng connection hiện có, không đổi schema trừ khi cần và phải ghi vào Change Log.
- Service/port không được ảnh hưởng: Paperclip server, cổng 3180 chỉ dùng cho MCP, cổng 8123 giữ mặc định.
- Tuân thủ `DESIGN.md`: chỉ dùng design token, không hard-code màu.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm route và mục sidebar "FurniMesh" theo đúng pattern các mục sidebar hiện có.
2. Trang gọi API connection hiện có để tạo connection với slug `furnimesh` và `serverUrl`; nếu đã có connection thì hiển thị thay vì tạo mới.
3. Kiểm tra kết nối: gọi endpoint kiểm tra connection của server (hoặc `tools/list` qua proxy server) và hiển thị trạng thái.
4. Hướng dẫn 3 bước: (1) bật MCP (tự động qua script khởi động), (2) bấm Kết nối, (3) bấm Kiểm tra và chọn model.
5. Cổng scene: đưa giá trị vào cấu hình, UI đọc giá trị này khi mở scene.
6. Chạy `pnpm check:token-gates` để xác nhận không có màu hard-code.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/components/Sidebar.tsx` | Sửa | Thêm mục FurniMesh |
| `paperclip/ui/src/pages/` (trang FurniMesh mới) | Thêm | Trang kết nối và hướng dẫn |
| `paperclip/ui/src/App.tsx` hoặc router liên quan | Sửa | Đăng ký route |
| `paperclip/ui/src/pages/apps/app-detail/FurniMeshLibraryPanel.tsx` | Sửa nhẹ | Nhận props trạng thái kết nối |
| `paperclip/packages/shared/src/` (contract, nếu cần) | Sửa | Trường mới cho trạng thái |
| `paperclip/server/src/` (route kiểm tra, nếu cần) | Sửa | Endpoint kiểm tra kết nối |

## 7. Acceptance criteria

- [ ] AC-01: Sidebar có mục "FurniMesh" và mở đúng trang.
- [ ] AC-02: Bấm Kết nối khi chưa có connection thì tạo connection slug `furnimesh` với `serverUrl` `http://127.0.0.1:3180/mcp`.
- [ ] AC-03: Bấm Kết nối khi đã có connection thì không tạo bản trùng.
- [ ] AC-04: Chỉ báo trạng thái hiển thị đúng bốn trạng thái khi MCP tắt, đang kiểm tra, đang chạy và lỗi.
- [ ] AC-05: Nút Kiểm tra kết nối cập nhật trạng thái trong vòng 5 giây hoặc báo lỗi rõ.
- [ ] AC-06: Trang có đủ 3 bước hướng dẫn và nhúng `FurniMeshLibraryPanel`.
- [ ] AC-07: Cổng scene AlterAI đọc từ cấu hình; mặc định vẫn là `http://localhost:8123/`.
- [ ] AC-08: `pnpm check:token-gates` pass; không dùng màu hard-code.
- [ ] AC-09: Build UI và typecheck pass.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Token gate | `cd paperclip && pnpm check:token-gates` | Pass |
| Typecheck/build | `cd paperclip && pnpm -r typecheck` và `cd paperclip/ui && pnpm build` | Pass |
| Test UI/server | Test connection create/check tương ứng | Pass, không tạo bản trùng |
| Thủ công | Mở trang FurniMesh, bấm Kết nối và Kiểm tra với MCP chạy và tắt | Trạng thái đúng |
| Cổng scene | Đổi cấu hình, mở scene | Dùng cổng mới |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tạo connection trùng | Kiểm tra connection hiện có trước khi tạo |
| Thay đổi shared contract ảnh hưởng app khác | Chỉ thêm trường tùy chọn; ghi vào Change Log |
| Vi phạm DESIGN.md | Chạy token gate trước khi commit |

Rollback point và cách rollback: revert commit triển khai của FEAT-2026-156. Baseline là commit `7f14c779`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude theo yêu cầu người dùng
- Thời điểm: 2026-11-22

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

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
| | | | | |

## 14. Kết quả và đóng chức năng

- Kết quả:
- Hạn chế còn lại:
- Việc chưa hoàn tất:
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:

## Evidence (2026-11-22)

- Thêm `paperclip/ui/src/pages/apps/FurniMeshConnect.tsx` (trang /furnimesh: nút Kết nối tạo application + connection `mcp_remote`, không tạo trùng; 4 trạng thái; Kiểm tra kết nối timeout 5 giây; hướng dẫn 3 bước; nhúng FurniMeshLibraryPanel), `furnimesh-config.ts` (URL scene đọc từ localStorage, mặc định `http://localhost:8123/`), route `furnimesh` trong `App.tsx`, mục sidebar "FurniMesh 3D" trong `Sidebar.tsx`, panel đọc URL scene từ cấu hình.
- `tsc --noEmit` (ui): 18 dòng lỗi có sẵn ở file khác, 0 lỗi ở file thuộc FEAT-156. Token gate: 0 vi phạm ở file thuộc FEAT-156.
- Chưa kiểm: chạy thật trên Paperclip (cổng 3100 đang tắt) — sẽ nghiệm thu bằng Chrome ở bước tích hợp; chưa có test tự động cho trang.

## Bổ sung sau nghiệm thu trên trình duyệt (2026-11-22)

- Chạy Paperclip từ worktree ở cổng 3100 và kiểm trên Chrome: trang `/ATL/furnimesh` hiển thị đúng (trạng thái "Chưa kết nối", ô địa chỉ MCP, nút Kết nối / Kiểm tra kết nối, ô địa chỉ scene, hướng dẫn 3 bước), không có lỗi console.
- Sửa 2 lỗi phát hiện khi chạy thật: (1) `furnimesh` chưa nằm trong `BOARD_ROUTE_ROOTS` (`ui/src/lib/company-routes.ts`) nên URL bị hiểu thành tiền tố công ty; (2) sidebar đang dùng thực tế là `CoordinatorSidebar.tsx`, đã thêm mục "FurniMesh 3D" ở đó (cùng `Sidebar.tsx`).
- Chưa bấm nút Kết nối trên dữ liệu thật của người dùng (tạo connection là cấu hình lâu dài) — để người dùng tự bấm.

## Nghiệm thu luồng thật trên Paperclip (2026-11-22)

- Bấm Kết nối trên trang `/ATL/furnimesh` tạo connection thật. Ba lỗi phát hiện và đã sửa: (1) transport `mcp_remote` cần `config.url` (không chỉ `serverUrl`); (2) connection phải tạo với `status: "active"` — nếu là `draft` thì gateway báo `Tool "search_furniture" not found`; (3) kết quả test-call trả `result.content` là chuỗi JSON, panel đã parse thêm trường hợp này.
- Đã kiểm trên Chrome: tìm "sofa" ra lưới mẫu có thumbnail và nút Use in Scene. Gọi gateway bằng API với agent Furniture Planner trả `decision: allowed` và dữ liệu sofa thật.
- Trạng thái ban đầu của trang giờ lấy từ `healthStatus` của connection.
- Chưa kiểm: nút Use in Scene (cần scene AlterAI ở cổng 8123 đang chạy).
