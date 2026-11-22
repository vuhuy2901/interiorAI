# [FEAT-2026-157] Tab FurniMesh trong AlterAI (ai-office-standalone)

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

- `ai-office-standalone/index.html` đã có loader GLB nhận mô hình qua `postMessage` (`setupFurniMeshLoader`, `loadFurniMeshGlb`, khoảng dòng 5087–5120). Người dùng chưa có cách tự tìm và đặt mô hình FurniMesh vào scene từ chính AlterAI.
- Trình xử lý `message` hiện không kiểm tra `event.origin`.
- Trang đã có tính năng Build và FP2 đang dùng; thay đổi không được làm hỏng các tính năng này.

## 2. Mục tiêu

- Có tab "FurniMesh" trong AlterAI để kết nối MCP, tìm kiếm, xem thumbnail và đặt model vào scene.
- Mọi lỗi (kết nối, tìm kiếm, tải GLB) hiển thị rõ cho người dùng.
- Trình xử lý `postMessage` chỉ chấp nhận origin tin cậy.

## 3. Phạm vi

### In scope

- Tab "FurniMesh" trong `ai-office-standalone/index.html`, gồm:
  - Ô URL MCP, mặc định `http://127.0.0.1:3180/mcp`.
  - Nút Kết nối: gọi MCP JSON-RPC qua `fetch` (`initialize` rồi `tools/list`) và hiển thị trạng thái.
  - Ô tìm kiếm, chọn danh mục (lấy từ `list_furniture_categories`) và lưới thumbnail.
  - Nút "Đặt vào scene" dùng `loadFurniMeshGlb` có sẵn.
  - Cảnh báo file nặng (theo cờ `heavy` của MCP hoặc kích thước đọc được).
  - Hiển thị lỗi rõ ràng.
- Kiểm tra `event.origin` trong trình xử lý `message` hiện có, chỉ chấp nhận origin trong danh sách cấu hình.

### Out of scope

- Thay đổi MCP server (thuộc FEAT-2026-155).
- Tab hoặc trang FurniMesh trong Paperclip UI (thuộc FEAT-2026-156).
- Thay đổi hành vi Build, FP2, tường, sàn hoặc đồ nội thất hiện có.
- Lưu trữ model đã tải về máy.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `setupFurniMeshLoader` và `loadFurniMeshGlb` đã có; MCP server cổng 3180.
- Dữ liệu dùng chung: `localStorage` hoặc state scene hiện có; không đổi định dạng dữ liệu scene.
- Service/port không được ảnh hưởng: API cổng 5000, cổng 8123 (cổng scene), cổng 3180 chỉ dùng cho MCP.
- Giữ nguyên hành vi `postMessage` đang dùng với Paperclip, chỉ thêm kiểm tra origin cho nguồn đã biết.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm tab vào thanh tab hiện có, cùng pattern với tab khác trong file.
2. Hàm `mcpCall(method, params)`: `fetch` POST JSON-RPC 2.0 tới URL MCP; xử lý timeout và lỗi mạng.
3. Kết nối: gửi `initialize`, sau đó `tools/list`, hiển thị số tool và trạng thái.
4. Tìm kiếm: gọi tool `search_furniture` với `query`, `category`; hiển thị thumbnail từ kết quả.
5. Đặt vào scene: gọi `get_model_glb_url` rồi truyền vào `loadFurniMeshGlb`.
6. Cảnh báo: nếu kết quả có `heavy: true` thì hiện cảnh báo và yêu cầu xác nhận trước khi nạp.
7. Origin: danh sách origin tin cậy là cấu hình trong file; so sánh `event.origin` trước khi xử lý `ev.data`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Sửa | Thêm tab FurniMesh, kiểm tra origin |

## 7. Acceptance criteria

- [ ] AC-01: Tab "FurniMesh" hiển thị và có đủ ô URL, nút Kết nối, ô tìm kiếm, chọn danh mục, lưới thumbnail.
- [ ] AC-02: Kết nối thành công với MCP đang chạy hiển thị số tool từ `tools/list`.
- [ ] AC-03: Kết nối khi MCP tắt hiển thị lỗi rõ ràng, không treo giao diện.
- [ ] AC-04: Tìm kiếm và chọn danh mục hiển thị lưới thumbnail.
- [ ] AC-05: "Đặt vào scene" nạp GLB qua `loadFurniMeshGlb` và model xuất hiện trong scene.
- [ ] AC-06: Model có cờ `heavy` hiển thị cảnh báo trước khi nạp.
- [ ] AC-07: `postMessage` từ origin không tin cậy bị bỏ qua; từ origin tin cậy vẫn hoạt động như trước.
- [ ] AC-08: Các tính năng Build và FP2 hiện có hoạt động như trước (kiểm tra thủ công theo checklist).

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp JS | Mở file trong trình duyệt, kiểm tra console không có lỗi cú pháp | Không lỗi |
| MCP sống | Chạy MCP cổng 3180, bấm Kết nối | Hiển thị tool list |
| MCP tắt | Tắt MCP, bấm Kết nối | Hiển thị lỗi rõ |
| Đặt vào scene | Chọn một model, bấm Đặt vào scene | Model hiện trong scene |
| Origin | Gửi postMessage từ origin lạ | Bị bỏ qua |
| Hồi quy | Mở Build, FP2 và kiểm tra tường, cửa | Hoạt động như trước |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| File HTML rất lớn, dễ xung đột khi sửa | Chỉ thêm khối code có ranh giới rõ, không sửa khối Build/FP2 |
| Lỗi CORS khi gọi MCP từ trình duyệt | Kiểm tra header của MCP; báo lỗi rõ nếu bị chặn |
| Origin whitelist chặn nhầm Paperclip | Cấu hình origin rõ trong file, ghi vào tài liệu |

Rollback point và cách rollback: revert commit triển khai của FEAT-2026-157. Baseline là commit `7f14c779`.

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
| 2026-11-22 | feat/furnimesh-connect (commit FEAT-157) | Thêm tab/panel FurniMesh (ô URL, Kết nối, tìm kiếm, danh mục động, lưới thumbnail, Đặt vào scene); loader thêm callback done + window.__furniMeshLoad; kiểm tra event.origin với danh sách FURNIMESH_TRUSTED_ORIGINS (origin trang, :3100/:3000/:5173 cho 127.0.0.1 và localhost) | Heavy xác định bằng file_size_bytes (check_asset_compatibility, >20MB) hoặc polycount (>150k) và confirm; MCP không có cờ heavy |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 | như trên | node --check toàn bộ script inline | Đạt | 1 script, không lỗi |
| 2026-11-22 | như trên | Chrome, server tĩnh :8131; không lỗi console | Đạt | Chỉ có log [FurniMesh] loaded |
| 2026-11-22 | như trên | AC-01/04: tab, 8 danh mục động, tìm sofa | Đạt | 12 thẻ, 12 thumbnail |
| 2026-11-22 | như trên | AC-02: Kết nối qua proxy CORS tạm :3181 | Đạt | "Đã kết nối: 6 tool" |
| 2026-11-22 | như trên | AC-03: kết nối thẳng :3180 | Đạt | Lỗi rõ (server hiện chưa có CORS), UI không treo |
| 2026-11-22 | như trên | AC-05: __furniMeshLoad nạp Box.glb | Đạt | Model vào scene |
| 2026-11-22 | như trên | AC-05 qua nút Đặt vào scene với model thật | Chưa đạt | get_furniture_details trả HTTP 404 từ nguồn FurniMesh với mọi model thử; lỗi hiển thị rõ; thuộc FEAT-155 |
| 2026-11-22 | như trên | AC-07: postMessage cùng origin nạp; origin lạ bị bỏ qua | Đạt | Không log, không lỗi |
| 2026-11-22 | như trên | AC-06, AC-08 | Chưa kiểm tra tay | AC-06 chưa gặp model nặng; Build/FP2 không bị sửa, chỉ thêm handler tab |

## 14. Kết quả và đóng chức năng

- Kết quả:
- Hạn chế còn lại: MCP :3180 chưa gửi header CORS nên trình duyệt chặn khi gọi trực tiếp (cần FEAT-155); get_furniture_details đang 404.
- Việc chưa hoàn tất:
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:

## Bổ sung sau nghiệm thu (2026-11-22)

- Sửa lỗi "Đặt vào scene" 404: `place()` giờ ưu tiên `detail_url` thay vì `model_id` khi gọi tool. Đã kiểm qua MCP thật: `detail_url` trả đủ metadata và `glb_url`; `model_id` đơn lẻ vẫn 404.

## Change request CR-157-01 (2026-11-22): gỡ tab FurniMesh khỏi AlterAI

- Lý do: người dùng yêu cầu bỏ phần FurniMesh khỏi `ai-office-standalone/index.html` (trang 8131/8123).
- Thay đổi: gỡ nút tab "FurniMesh", panel `#fmPanel`, CSS `#fm*` và script `setupFurniMeshTab`. Giữ nguyên bộ nhận `postMessage` (`setupFurniMeshLoader`, origin whitelist) vì nút "Use in Scene" của Paperclip (FEAT-156) cần nó.
- Kiểm tra: `node --check` các script inline: 0 lỗi; không còn tham chiếu `fmPanel/fmGrid/fmUrl`.
- Trạng thái AC của FEAT-157 liên quan tab: không còn hiệu lực (đã gỡ theo yêu cầu).
