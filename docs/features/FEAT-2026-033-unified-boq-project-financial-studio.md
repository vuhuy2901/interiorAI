# [FEAT-2026-033] Hợp nhất BOM và BOQ, Quản lý dự toán bằng AI theo Project

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | TUAN & Codex / ATELIER AI |
| Người chấp thuận | TUAN (Chủ Project) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13 15:50 +07:00 |
| Revision bắt đầu | interiorAI `ce74511`, paperclip `80c9633dc` |
| Revision cuối | Đang cập nhật khi nghiệm thu |

## 1. Bối cảnh

Hiện tại hệ thống ATELIER AI đang tồn tại 2 trang riêng biệt:
1. Trang "Danh mục nội thất / BOM" (`/inventory-bom`): bóc tách vật tư và nội thất rời.
2. Trang "Bảng dự toán BOQ" (`/cost-estimation`): tính toán dự toán dựa trên snapshot cố định, chưa có bộ chọn Project linh hoạt, chưa phân nhóm chuẩn theo thực tế thi công Việt Nam, chưa gắn liền với đề xuất vật liệu của Materials AI và nhà cung cấp thực tế từ Shopping/Sourcing AI, và chưa cho phép người dùng lựa chọn cấu thành chi tiết (loại cốt ván, bề mặt, mã màu, nhà cung cấp) từng hạng mục có lưu vết quyết định.

Ngoài ra, menu điều hướng đang hiển thị hai mục riêng gây phân tán trải nghiệm người dùng. Cần hợp nhất toàn bộ về một trung tâm quản lý duy nhất: **BẢNG DỰ TOÁN KHỐI LƯỢNG & NGÂN SÁCH (BOQ)** theo từng Project.

## 2. Mục tiêu

1. **Hợp nhất giao diện**: Loại bỏ mục menu "Danh mục nội thất" độc lập khỏi tất cả thanh điều hướng (Sidebar, CoordinatorSidebar); chuyển hướng route `/inventory-bom` về `/cost-estimation`.
2. **Project Selector**: Đặt bộ chọn công trình ngay đầu trang BOQ, cho phép chuyển đổi tức thì giữa các Project (Phòng ngủ trẻ em, Japandi master bedroom, Demo 4x5m...). Dữ liệu bóc tách và dự toán tải riêng biệt theo từng Project được chọn, tuyệt đối không lấy dữ liệu mẫu hiển thị đè lên dự án khác.
3. **Phân nhóm hạng mục chuẩn xây dựng - nội thất**:
   - Nhóm 1: Nội thất may đo theo thiết kế & Nội thất mua sẵn (Furniture & Millwork)
   - Nhóm 2: Gỗ, ván & vật liệu cấu thành nội thất (Board materials & Laminates)
   - Nhóm 3: Gạch, đá, vật liệu lát ốp & sàn (Flooring & Wall Cladding)
   - Nhóm 4: Sơn, tường & trần (Paint & Ceilings)
   - Nhóm 5: Cửa, cửa sổ & kính (Doors & Glazing)
   - Nhóm 6: Điện, chiếu sáng (Lighting & Electrical)
   - Nhóm 7: Phụ kiện cơ khí, phụ kiện nội thất (Hardware & Fittings)
   - Nhóm 8: Thiết bị, trang trí & cây xanh (Appliances & Decor)
   - Nhóm 9: Nhân công, vận chuyển & chi phí khác (Labor & Logistics)
4. **Quy trình AI Đề xuất — Người dùng chốt — AI tìm báo giá — Cost AI tính toán**:
   - Panel chi tiết hạng mục khi click: xem kích thước từ Scene, các phương án do Materials AI đề xuất (loại cốt ván, bề mặt Melamine/Laminate/Veneer, màu vân gỗ, độ dày...).
   - Cho phép người dùng chọn phương án hoặc tùy chỉnh, lưu rõ vết: `material_spec`, `selected_option`, `proposed_by_agent`, `approved_by`, `approved_at`, `decision_version`. Không ghi chung chung "Gỗ / Nệm vải / Da".
   - Shopping AI tìm kiếm các phương án báo giá có nguồn thật (đơn vị, SKU, nhà cung cấp, ngày tra cứu) hoặc cho phép người dùng nhập báo giá thực tế.
   - Cost AI tự động tính toán minh bạch từng chi phí (diện tích ván, dán cạnh, phụ kiện ray/bản lề, gia công, lắp đặt, hao hụt).
5. **Toàn vẹn số học & Không cộng trùng**:
   - Tránh cộng trùng giá thành phẩm với vật liệu cấu thành (BOM chi tiết nằm lồng trong hạng mục thành phẩm).
   - Kiểm tra đúng đơn vị (m², m, lít, thùng, tấm, cái, bộ).
   - Tính toán minh bạch thuế VAT 8% và nhân công.
6. **Bảo toàn dữ liệu & Export**:
   - Lưu trữ bền vững trong cơ sở dữ liệu SQLite/PostgreSQL, reload trang không mất lựa chọn.
   - Xuất Excel (`.xlsx`) và CSV đầy đủ phân loại, chủng loại ván, màu vân, nhà cung cấp và căn cứ giá.

## 3. Phạm vi

### In scope
- Cập nhật Sidebar và điều hướng trong `paperclip/ui` (xóa mục "Danh mục nội thất", trỏ redirect nếu người dùng vào `/inventory-bom`).
- Xây dựng component `UnifiedProjectBOQView` (hoặc nâng cấp `CostEstimationPage` & `AtelierPages.tsx`) với Project Selector, Filter theo khu vực/phòng, phân nhóm 9 danh mục, lồng ghép BOM chi tiết.
- Panel trượt (Detail Drawer/Modal) cho từng hạng mục để xem đề xuất Materials AI, chọn vật liệu, xem và chọn báo giá Shopping AI, phê duyệt giá và xem công thức chi phí.
- Endpoint API Backend (`apps/api`):
  - Lấy BOQ thống nhất theo `project_id`: `/api/v1/projects/{project_id}/unified-boq` (kết hợp geometry takeoff, BOM breakdown, material proposals, pricing quotes, cost lines).
  - Cập nhật quyết định vật liệu và phê duyệt giá: `POST /api/v1/projects/{project_id}/boq-items/{item_id}/select-material` và `approve-quote`.
  - Xuất Excel chi tiết có cột vật liệu, mã màu, nhà cung cấp: `/api/v1/exports/{project_id}/unified-boq/xlsx`.
- Đồng bộ Scene 3D: áp dụng màu sắc và vật liệu chốt trở lại Scene/Project nếu tương thích.
- Kiểm thử tự động trên ít nhất 2 Project (`proj_kid_bedroom` và `proj_japandi_bedroom` hoặc `proj_demo_4x5m`).

### Out of scope
- Không xóa các bảng SQLite hay database cũ; giữ nguyên tương thích ngược.
- Không can thiệp vào các API 3D engine Pascal hay Blender Cycles đã ổn định.
- Không tạo agent mới độc lập mà tận dụng đúng roster agent hiện có (Chief Architect, Floorplan, Materials AI, Shopping AI, Cost AI, QA Validation).

## 4. Dependency và tài nguyên cần bảo vệ
- Database SQLite `data/atelier.db` và cơ sở dữ liệu Paperclip.
- Không làm gián đoạn cổng đang chạy (FastAPI 8000, Paperclip 3100, Postgres 54329).
- Giữ nguyên các kịch bản workflow đã được kích hoạt.

## 5. Thiết kế và kế hoạch triển khai

1. **Thiết kế Data Contract & Backend API**:
   - Bổ sung data structures trong `apps/api/app/models/contracts.py`: `UnifiedBOQItem`, `MaterialProposalOption`, `SupplierQuoteOption`, `UnifiedProjectBOQ`.
   - Viết service `apps/api/app/services/unified_boq_engine.py` tổng hợp từ `cost_engine`, `inventory_bom`, `materials_vn.json`, `catalog_vn.csv`.
   - Đăng ký endpoint trong `apps/api/app/main.py`.
2. **Nâng cấp Giao diện Frontend (`paperclip/ui`)**:
   - Cập nhật `Sidebar.tsx` và `CoordinatorSidebar.tsx`: gỡ bỏ "Danh mục nội thất", giữ lại "Bảng Dự Toán (BOQ)".
   - Cập nhật router trong `App.tsx` (redirect `/inventory-bom` -> `/cost-estimation`).
   - Xây dựng giao diện `UnifiedProjectBOQPage` trong `paperclip/ui/src/features/atelier/`:
     - Header: Project Selector (đổi project đổi toàn bộ dữ liệu), Room/Area filter, Tổng dự toán & Ngân sách.
     - Accordion / Bảng phân nhóm 9 danh mục thực tế.
     - Dòng hạng mục hiển thị: Tên, Quy cách, Kích thước, Đơn vị, Khối lượng, Vật liệu đã chọn (Kèm huy hiệu Agent đề xuất & Người duyệt), Trạng thái giá (Chưa có giá / Tham khảo / Phê duyệt), Thành tiền.
     - Drawer/Modal chi tiết: Lựa chọn đề xuất từ Materials AI (cốt ván, bề mặt, mã vân), danh sách báo giá từ Shopping AI (nhà cung cấp, đơn giá, link/nguồn, nút chọn hoặc nhập báo giá mới), nút Phê duyệt quyết định, hiển thị công thức chi tiết.
3. **Cập nhật Export Excel & CSV**:
   - Hỗ trợ xuất bảng BOQ hợp nhất với đầy đủ các trường thông tin vật liệu, nhà cung cấp, người phê duyệt và công thức.
4. **Kiểm thử & Nghiệm thu**:
   - Viết test suite `tests/test_unified_boq_project_management.py`.
   - Kiểm tra trên ít nhất 2 dự án (Phòng ngủ trẻ em `proj_kid_bedroom` và `proj_demo_4x5m`).
   - Xác nhận reload trang vẫn giữ nguyên lựa chọn và không bị ghi đè dữ liệu.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-033-unified-boq-project-financial-studio.md` | Tạo mới | Feature contract bắt buộc theo quy định làm việc |
| `apps/api/app/models/contracts.py` | Cập nhật | Bổ sung model cho BOQ hợp nhất, đề xuất vật liệu, báo giá |
| `apps/api/app/services/unified_boq_engine.py` | Tạo mới | Lõi bóc tách hợp nhất BOM + BOQ, tính toán chi phí và quản lý quyết định |
| `apps/api/app/main.py` | Cập nhật | REST API cho BOQ hợp nhất, lưu lựa chọn vật liệu, phê duyệt giá và xuất Excel |
| `paperclip/ui/src/components/Sidebar.tsx` | Cập nhật | Bỏ link Danh mục nội thất, giữ Bảng dự toán |
| `paperclip/ui/src/components/CoordinatorSidebar.tsx` | Cập nhật | Bỏ link Danh mục nội thất |
| `paperclip/ui/src/App.tsx` | Cập nhật | Điều hướng `/inventory-bom` về `/cost-estimation` |
| `paperclip/ui/src/features/atelier/UnifiedBOQPage.tsx` | Tạo mới | Giao diện hợp nhất BOQ theo Project, phân nhóm 9 danh mục, drawer chi tiết vật liệu & báo giá |
| `paperclip/ui/src/features/atelier/AtelierPages.tsx` | Cập nhật | Kết nối `AtelierCostEstimationRoute` vào `UnifiedBOQPage` |
| `tests/test_unified_boq_project_management.py` | Tạo mới | Unit/Integration test kiểm thử chấp nhận quy trình 10 bước |

## 7. Acceptance criteria

- [ ] **AC-01**: Menu điều hướng không còn mục "Danh mục nội thất"; truy cập `/inventory-bom` được điều hướng an toàn sang trang Bảng dự toán BOQ `/cost-estimation`.
- [ ] **AC-02**: Trang BOQ có Project Selector ngay đầu trang, chuyển đổi giữa các Project tải đúng dữ liệu riêng của từng Project (không bị lấy dữ liệu demo hiển thị cho project khác).
- [ ] **AC-03**: Phân chia rõ ràng thành các nhóm hạng mục công trình thực tế (Nội thất may đo & mua sẵn, Ván gỗ cấu thành, Gạch đá ốp lát, Sơn tường trần, Cửa kính, Điện chiếu sáng, Phụ kiện, Thiết bị, Nhân công vận chuyển). Chỉ hiển thị nhóm có trong Project.
- [ ] **AC-04**: BOM cấu thành nằm lồng trong từng hạng mục nội thất tương ứng; không cộng trùng giá thành phẩm với vật liệu cấu thành.
- [ ] **AC-05**: Materials AI đưa ra các đề xuất vật liệu chi tiết (loại cốt ván, bề mặt phủ, màu/vân gỗ, độ dày, thương hiệu) cho từng hạng mục nội thất (ví dụ Tủ quần áo: MDF chống ẩm phủ Melamine vân óc chó, Plywood Laminate...). Không ghi chung chung "Gỗ / Nệm vải / Da".
- [ ] **AC-06**: Người dùng có thể chọn hoặc tùy chỉnh vật liệu; hệ thống lưu vết đầy đủ (Agent đề xuất, Người duyệt, Thời điểm, Phiên bản). Không tự đổi vật liệu khi đã chốt.
- [ ] **AC-07**: Shopping AI cung cấp các phương án báo giá thực tế có nhà cung cấp, đơn giá, SKU, link/nguồn. Phân biệt rõ: Giá minh họa, Giá tham khảo có nguồn, Giá báo chính thức, Giá đã phê duyệt. Nếu chưa có giá thật, hiển thị "Chưa có báo giá", không dùng giá mẫu làm tổng chính thức.
- [ ] **AC-08**: Cost AI tính toán dự toán dựa trên lựa chọn thực tế với công thức minh bạch (diện tích ván, dán cạnh, phụ kiện ray/bản lề, hao hụt, lắp đặt, thuế VAT 8%). Khi thay đổi vật liệu/kích thước, chỉ tính lại hạng mục bị ảnh hưởng và tổng tiền.
- [ ] **AC-09**: Đồng bộ với Scene 3D: nhận đúng kích thước hình học từ Scene, không tạo dòng trùng, không làm mất lựa chọn vật liệu và giá đã chốt.
- [ ] **AC-10**: Kiểm thử chấp nhận hoàn tất trên ít nhất 2 Project khác nhau (bao gồm Project phòng ngủ trẻ em `proj_kid_bedroom`), reload trang bảo toàn mọi lựa chọn và xuất Excel thể hiện đầy đủ chi tiết kỹ thuật và nguồn giá.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra đơn vị & backend | `python -m pytest tests/test_unified_boq_project_management.py -v` | 100% tests PASS |
| Kiểm tra API REST | `curl -s http://127.0.0.1:8000/api/v1/projects/proj_kid_bedroom/unified-boq` | Trả về JSON cấu trúc 9 nhóm, đầy đủ đề xuất và báo giá |
| Kiểm tra build frontend | `cd paperclip; pnpm --filter @paperclipai/ui build` (hoặc kiểm tra component) | Giao diện biên dịch không lỗi |
| Kiểm tra luồng UI thực tế | Thao tác chọn Tủ quần áo, chọn MDF Melamine óc chó, chọn NCC, kiểm tra lưu vết và tính toán | Lưu trạng thái, reload giữ nguyên, export Excel chính xác |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Mất tương thích với frontend cũ nếu API endpoint thay đổi | Cung cấp endpoint mới `/unified-boq` song song với việc giữ các endpoint cũ `/estimates` và `/inventory` |
| Trùng lặp chi phí giữa BOM vật liệu và thành phẩm | Tách biệt ranh giới tính toán: chỉ tính tiền ở cấp độ thành phẩm hoặc cấp độ vật tư cấu thành (không tính cả hai) |
| Người dùng refresh bị mất lựa chọn vật liệu | Lưu trạng thái quyết định của người dùng trực tiếp vào SQLite `data/atelier.db` theo từng `project_id` |

Rollback point: Commit `ce74511` trong `interiorAI` và `80c9633dc` trong `paperclip`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: TUAN & Codex / ATELIER AI
- Thời điểm: 2026-11-13 15:50 +07:00

## 11. Change Log

- 2026-11-13: Khởi tạo hợp đồng v1.0 và đánh dấu FROZEN trước khi triển khai theo Repository Working Agreement.
