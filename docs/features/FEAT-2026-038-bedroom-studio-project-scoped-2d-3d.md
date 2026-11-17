# [FEAT-2026-038] Bedroom Studio theo dự án/phòng với mặt bằng 2D chính xác và preview 3D

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng (2026-11-16) |
| Ngày tạo | 2026-11-16 |
| Frozen at | 2026-11-16T00:00:00+07:00 |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Bedroom Studio hiện lưu vào hai khóa localStorage toàn cục, không nhận diện dự án/phòng trên URL, tự dùng dữ liệu mẫu, và dùng phép quy đổi pixel cố định cùng khoảng biên 100 mm khi kéo. Hệ quả là dữ liệu có thể lẫn giữa dự án, người dùng không biết ngữ cảnh, và nội thất không thể chạm mặt trong tường.

## 2. Mục tiêu

Đưa Bedroom Studio vào luồng dự án Atelier hiện có: URL và selector xác định rõ projectId/roomId; 2D, sổ quyết định và 3D dùng cùng dữ liệu theo cặp dự án/phòng; thao tác kéo/thả chính xác theo SVG viewBox, snap tường, chống xuyên tường và cảnh báo va chạm; trạng thái lưu và cảnh báo thay đổi chưa lưu hoạt động rõ ràng.

## 3. Phạm vi

### In scope

- Context selector tìm kiếm dự án, selector phòng, breadcrumb và URL `projectId`/`roomId`.
- Tải project/room từ API Atelier hiện có, không tự chọn khi URL thiếu hoặc sai; lưu dữ liệu tạm theo khóa cặp project/room để bảo vệ phân tách trong lúc API scene chưa có schema studio riêng.
- 2D SVG có tọa độ theo viewBox, biên tính theo bounding box đã xoay, snap tường 75 mm ưu tiên lưới, phát hiện va chạm và biểu diễn hướng đồ đạc.
- Preview 3D Three.js dùng cùng room/furniture state, điều khiển camera, top view và ẩn/hiện tường; chuyển 2D/3D/chia đôi không làm mất state.
- Decision Ledger theo cặp project/room, lưu rõ ràng, status đã lưu/đang lưu/chưa lưu/lỗi, và cảnh báo chuyển ngữ cảnh khi có thay đổi.
- Kiểm thử unit cho hình học/context và build frontend.

### Out of scope

- Thay đổi schema Canonical Project hay tạo dự án/phòng giả.
- Chỉnh sửa 3D trực tiếp hoặc thay thế renderer 3D Studio toàn hệ thống.
- Đồng bộ server-side mới nếu API hiện hữu không có endpoint Studio-scoped phù hợp; persistence client được namespaced nghiêm ngặt và không ghi vào scene backend ngoài schema.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: React, React Router, React Query, API Atelier (`/projects/:projectId/atelier/workspace`, `atelierApi.workspace`), Three.js hiện hữu.
- Dữ liệu dùng chung: Canonical project snapshots và linked scene mappings chỉ đọc trong Studio này.
- Service/database không được ảnh hưởng: API Atelier, database project hiện hữu và các route Studio khác.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm lớp dữ liệu/scoped persistence và hình học thuần có test.
2. Đổi trang Studio thành route-aware, dùng workspace API và yêu cầu context hợp lệ.
3. Thay renderer 2D bằng SVG viewBox-based pointer conversion, snap/collision/rotation-aware bounds và biểu tượng hướng rõ ràng.
4. Thêm preview Three.js nhẹ cùng state 2D và các chế độ xem.
5. Thêm trạng thái save/dirty, cảnh báo chuyển context, và verification.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-038-bedroom-studio-project-scoped-2d-3d.md` | Mới | Hợp đồng và bằng chứng |
| `paperclip/ui/src/features/atelier/BedroomDesignStudio.tsx` | Cập nhật lớn | Context, 2D, ledger, 3D preview |
| `paperclip/ui/src/features/atelier/AtelierBedroomStudioPage.tsx` | Cập nhật | URL context và breadcrumb |
| `paperclip/ui/src/features/atelier/bedroomStudioGeometry.ts` | Mới | Hình học chính xác, testable |
| `paperclip/ui/src/features/atelier/bedroomStudioGeometry.test.ts` | Mới | Regression tests cho bounds/snap/collision |
| `paperclip/ui/src/App.tsx` | Cập nhật nếu cần | Hỗ trợ route URL context |

## 7. Acceptance criteria

- [ ] AC-01: Studio hiển thị tên/mã dự án, tầng/phòng và breadcrumb; URL thiếu/sai context yêu cầu chọn, không fallback ngẫu nhiên.
- [ ] AC-02: Chuyển project/room đổi toàn bộ 2D, 3D và ledger; thay đổi B không ảnh hưởng A; reload giữ context URL.
- [ ] AC-03: Save lifecycle và cảnh báo đổi context khi dirty hoạt động; dữ liệu local fallback luôn namespaced bằng projectId/roomId.
- [ ] AC-04: Bốn loại nội thất chạm đúng mặt trong bốn tường, kể cả sau xoay 90/180/270 độ; zoom không đổi độ chính xác kéo.
- [ ] AC-05: Snap tường 75 mm ưu tiên grid và va chạm thực được báo; label/selection không tham gia collision.
- [ ] AC-06: 2D biểu diễn hướng giường, ghế, bàn, tủ và selection arrow/rotation.
- [ ] AC-07: 2D/3D/chia đôi dùng chung state, cập nhật tức thì, có camera orbit/zoom/pan/top view/ẩn tường.
- [ ] AC-08: Frontend build và unit tests thành công; evidence ghi nhận các tình huống bắt buộc.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Geometry/context unit tests | `pnpm --filter @paperclipai/ui test -- bedroomStudioGeometry` | Bounds, rotation, snap, collision pass |
| Frontend build | `pnpm --filter @paperclipai/ui build` | Exit 0 |
| Route/manual smoke | Mở URL valid, URL thiếu/sai; đổi project/room, reload | Context rõ, không data bleed |
| Drag manual smoke | Kéo four furniture tới bốn tường ở 50/100/200% | Không lắc, đúng biên, snap đúng |
| 2D/3D manual smoke | Đổi mode và chỉnh vị trí/rotation | Giữ và đồng bộ state |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| API workspace không có room/layout chuyên dụng | Chỉ đọc metadata API và scoped persistence; không ghi schema không được hỗ trợ |
| WebGL không khả dụng | 2D vẫn hoạt động và preview báo rõ thay vì mất dữ liệu |
| Dữ liệu local cũ | Không đọc khóa toàn cục cũ để tránh lẫn dự án |

Rollback point và cách rollback: hoàn nguyên các file của FEAT-038 về revision trước triển khai; bản Studio trước không đổi dữ liệu API.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo ủy quyền yêu cầu trực tiếp của người dùng.
- Thời điểm: 2026-11-16T00:00:00+07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-16 | `a753015a6` + working tree | Thay state toàn cục bằng context URL/API workspace và persistence theo cặp projectId/roomId | Không đọc hoặc ghi khóa localStorage cũ để tránh data bleed |
| 2026-11-16 | `a753015a6` + working tree | Thêm SVG viewBox drag, rotated footprint, wall snap/collision, directional symbols và preview Three.js | Không thay đổi Canonical Project schema |
| 2026-11-16 | `a753015a6` + working tree | Thêm breadcrumb theo workspace và geometry regression tests | Build/typecheck đã chạy |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-16 | `a753015a6` + working tree | `pnpm --filter @paperclipai/ui exec vitest run src/features/atelier/bedroomStudioGeometry.test.ts` | PASS — 4/4 | Biên bốn tường, 90°, wall snap, collision |
| 2026-11-16 | `a753015a6` + working tree | `pnpm --filter @paperclipai/ui typecheck` | PASS | TypeScript project check exit 0 |
| 2026-11-16 | `a753015a6` + working tree | `pnpm --filter @paperclipai/ui build` | PASS | Vite build exit 0, 8,328 modules transformed |
| 2026-11-16 | `a753015a6` + working tree | Browser/API manual scenarios AC-01/02/03/07 | NOT RUN | Cần môi trường đăng nhập/API để xác minh quyền truy cập và browser interaction thật |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã triển khai và hoàn tất verification tự động; còn chờ smoke test browser có API/session thật.
- Hạn chế còn lại: API hiện hữu chỉ cung cấp workspace/room metadata, không có endpoint document Studio scoped. Bản thiết kế và ledger được persist cục bộ bằng khóa bất biến `projectId/roomId`, không ghi chéo hoặc tự tạo project giả.
- Việc chưa hoàn tất: Browser/API smoke theo AC-01/02/03/07; không được chuyển `CLOSED` trước khi có bằng chứng này.
- Rollback point: Revision trước FEAT-038.
- Trạng thái `CLOSED` bởi: Chưa áp dụng.
- Thời điểm: Chưa áp dụng.
