# [FEAT-2026-008] Thu gọn ATELIER còn 9 agent chủ đạo

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | ATELIER AI runtime |
| Người chấp thuận | Product Owner, yêu cầu trực tiếp ngày 2026-11-10 |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10, giờ Việt Nam |
| Revision bắt đầu | Root `74912c56ffa7c3f78bd2667dfeb4248ef94dfc94`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree hiện có |
| Revision cuối | Root `74912c56ffa7c3f78bd2667dfeb4248ef94dfc94`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`; source hashes và live snapshot ghi trong `after-consolidation.json` |

## 1. Bối cảnh

ATELIER hiện có 13 agent, trong đó bốn cặp chức năng bị chia quá nhỏ: Material với Style & Material; Shopping với Product & Market Research; Inventory/BOM với Cost Estimator; Rendering với Ceiling & Lighting. Product Owner yêu cầu giữ khoảng 8–10 agent chủ đạo.

## 2. Mục tiêu

Giữ 9 agent có ranh giới trách nhiệm rõ, hợp nhất năng lực của bốn agent trùng vào bốn agent chủ đạo, sau đó loại bỏ bốn bản ghi dư mà không làm mất cấu hình rollback.

## 3. Phạm vi

### In scope

- Giữ Chief Architect, Floor Plan, Geometry/BIM, Furniture, Style & Material, Ceiling & Lighting, Product & Market Research, Cost Estimator và QA.
- Hợp nhất Material Consultant vào Style & Material Consultant.
- Hợp nhất Shopping Researcher vào Product & Market Researcher.
- Hợp nhất Design Inventory & BOM Manager vào Cost Estimator.
- Hợp nhất Rendering Specialist vào Ceiling & Lighting Specialist.
- Cập nhật tên/title/capabilities/runtime skills/permissions của bốn agent nhận chức năng.
- Sao lưu cấu hình đầy đủ trước thay đổi và xác minh canonical roster sau thay đổi.

### Out of scope

- Không đổi model `gpt-5.6-luna`, reasoning `low`, hierarchy gốc hoặc Codex adapter.
- Không sửa database schema, Python standalone, prompt file hoặc company khác.
- Không đổi Chief Architect, Floor Plan, Geometry/BIM, Furniture hoặc QA ngoài việc roster giảm còn 9.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip local API và Codex local adapter.
- Dữ liệu dùng chung: agent identity, issue assignment, heartbeat/cost history và hierarchy.
- Service/port/database không được ảnh hưởng: Paperclip `localhost:3100`; không thao tác trực tiếp database.

## 5. Thiết kế và kế hoạch triển khai

1. Chụp snapshot đầy đủ của 13 agent và kiểm tra run/issue đang gắn với bốn agent dự kiến loại bỏ.
2. Mở rộng bốn agent nhận chức năng, giữ nguyên adapter và metadata định danh hiện có.
3. Chỉ xóa bốn agent nguồn nếu không có blocker lịch sử; nếu API chặn vì history thì terminate thay vì cưỡng ép xóa.
4. Kiểm tra roster còn 9, không lỗi, hierarchy khỏe và các năng lực hợp nhất xuất hiện trên agent đích.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| Paperclip live agent configuration | Update/delete có kiểm soát | Thu gọn roster và hợp nhất trách nhiệm |
| `paperclip/server/src/routes/atelier-bridge.ts` | Thu gọn bootstrap specs | Bảo đảm bốn agent đã gộp không được tạo lại khi restart |
| `paperclip/server/src/services/atelier-telegram/task-manager.ts` | Cập nhật fallback render | Chuyển yêu cầu phối cảnh sang agent Lighting & Visualization mới |
| `docs/build/EVIDENCE/FEAT-2026-008/` | Snapshot trước/sau | Rollback và audit |
| File contract này | Evidence/closure | Tuân thủ repository agreement |

## 7. Acceptance criteria

- [x] AC-01: Canonical roster còn đúng 9 agent chủ đạo.
- [x] AC-02: Bốn năng lực Material, Shopping, BOM và Rendering đã hiện diện trên agent đích tương ứng.
- [x] AC-03: 9/9 agent vẫn dùng `codex_local`, `gpt-5.6-luna`, reasoning `low`.
- [x] AC-04: Không agent nào có `errorReason`; hierarchy của roster còn lại hợp lệ.
- [x] AC-05: Có snapshot đầy đủ trước/sau và mapping rollback cho bốn phép hợp nhất.
- [x] AC-06: Paperclip health vẫn `ok`.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Preflight references | GET issues và heartbeat runs | Không có work đang chạy trên bốn agent nguồn |
| Canonical roster | GET company agents | 9 agent, đúng tên và cấu hình |
| Adapter audit | Đếm adapter/model/effort | 9/9 Codex Luna low |
| Runtime health | GET `/api/health` | `status=ok` |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Xóa agent có lịch sử cần giữ | Tôn trọng conflict của API và terminate nếu bị chặn |
| Mất năng lực khi hợp nhất | Chụp cấu hình nguồn, hợp nhất capabilities/skills/permissions trước khi loại bỏ |
| Ghi đè cấu hình Codex | PATCH tối thiểu, không gửi adapter fields |

Rollback point: snapshot trước thay đổi; khôi phục các agent bị xóa từ payload đã lưu và hoàn nguyên bốn agent đích theo snapshot.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo chỉ đạo Product Owner.
- Thời điểm: 2026-11-10, giờ Việt Nam.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-10 | Cho phép sửa source bootstrap Paperclip và Telegram routing | Audit phát hiện live-only deletion không bền vững; restart có thể tạo lại bốn agent | Thêm hai source component vào phạm vi, không đụng Python standalone | Product Owner yêu cầu roster thực sự còn 8–10 agent chủ đạo | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-10 | Paperclip `eac39d0b` + working tree | Snapshot 13 agent và preflight references | 0 issue, 0 heartbeat run trên bốn agent nguồn |
| 2026-11-10 | như trên | Hợp nhất bốn cặp chức năng và cập nhật Chief điều phối 8 specialist | Adapter/model không đổi |
| 2026-11-10 | như trên | Terminate rồi xóa bốn agent nguồn qua API lifecycle | Không cưỡng ép database |
| 2026-11-10 | như trên | Thu gọn bootstrap source còn 9 specs và đổi Telegram render fallback | Restart xác nhận agent cũ không tái tạo |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-10 | Paperclip `eac39d0b` + hashes | Canonical roster sau restart | PASS: 9 agent, 0 key cũ | `docs/build/EVIDENCE/FEAT-2026-008/after-consolidation.json` |
| 2026-11-10 | như trên | Adapter/model audit | PASS: 9/9 Codex local, Luna, low | cùng snapshot |
| 2026-11-10 | như trên | Hierarchy/error/health | PASS: 0 error, 0 unhealthy, health `ok` | cùng snapshot |
| 2026-11-10 | source hashes trong snapshot | Import hai module bằng Node 24 + tsx | PASS: `module-compile PASS` | terminal evidence |
| 2026-11-10 | working tree | `git diff --check` hai source file | PASS | terminal evidence |
| 2026-11-10 | baseline hiện có | `pnpm --filter @paperclipai/server typecheck` | BLOCKED trước phần server bởi stale generated ACPX profiles/line endings; shell mặc định Node 22 cũng dưới yêu cầu 24.11 | Không quy lỗi cho hai file thay đổi; module compile riêng PASS |

## 14. Kết quả và đóng chức năng

- Kết quả: Roster ATELIER còn 9 agent chủ đạo; bốn năng lực trùng đã hợp nhất và bootstrap bền vững sau restart.
- Hạn chế còn lại: Full repository typecheck vẫn bị baseline ACPX generated profiles và default Node 22 chặn; kiểm tra module trực tiếp bằng Node 24 đã pass.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: `docs/build/EVIDENCE/FEAT-2026-008/before-consolidation.json` và database backup Paperclip hiện hữu.
- Trạng thái `CLOSED` bởi: Codex sau canonical API audit và restart verification.
- Thời điểm: 2026-11-10, giờ Việt Nam.
