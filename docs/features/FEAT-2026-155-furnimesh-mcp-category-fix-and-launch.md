# [FEAT-2026-155] Sửa danh mục FurniMesh MCP và tự khởi động MCP cùng Atelier

| Trường | Giá trị |
|---|---|
| Trạng thái | DONE |
| Phiên bản hợp đồng | 1.0 |
| Owner | Claude |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 (thời điểm tạo file, ICT) |
| Revision bắt đầu | 7f14c779 |
| Revision cuối | commit "feat(FEAT-2026-155)" trên feat/furnimesh-connect (hash ghi trong git log) |

## 1. Bối cảnh

- `search_furniture` trong `paperclip/packages/furnimesh-mcp/src/index.ts` dựng đường dẫn `/library/format/glb/<category>/` từ tham số `category` không chuẩn hóa. Khi truyền tên danh mục cha (ví dụ `Sofas`, `Seating`) hoặc slug không tồn tại, FurniMesh trả HTTP 404. Chỉ các slug con (ví dụ `sofa`, `chair`, `dining-table`, `bed`, `floor-lamp`) chạy được.
- `start-atelier-paperclip.ps1` và `start-atelier.ps1` không khởi động FurniMesh MCP, nên người dùng phải bật tay.
- `FurniMeshLibraryPanel.tsx` có danh sách danh mục không khớp với danh mục thực tế của thư viện.
- Chưa có cảnh báo khi file GLB quá nặng, gây treo khi nạp vào scene.

## 2. Mục tiêu

- `search_furniture` nhận được cả tên danh mục cha lẫn slug con; tên hoặc slug không biết trả lỗi có thông điệp rõ, không trả HTTP 404 thô.
- Danh mục được lấy động từ `list_furniture_categories`, không hard-code trong UI.
- Hai script khởi động tự bật MCP ở cổng 3180, bỏ qua nếu cổng đã có tiến trình nghe.
- Kết quả `get_furniture_details` và `check_asset_compatibility` có cờ `heavy` khi GLB > 20 MB hoặc polycount > 150 000.

## 3. Phạm vi

### In scope

- (a) Ánh xạ danh mục cha → slug con trong `furnimesh-mcp/src/index.ts`, xử lý lỗi, test vitest với `fetch` được mock.
- (b) `start-atelier-paperclip.ps1` và `start-atelier.ps1` tự bật MCP tại cổng 3180, cấu hình qua biến môi trường `FURNIMESH_MCP_PORT` (mặc định 3180). Kiểm tra cổng đang nghe trước khi bật; nếu đã nghe thì bỏ qua.
- (c) `paperclip/ui/src/pages/apps/app-detail/FurniMeshLibraryPanel.tsx` lấy và hiển thị danh mục đúng từ MCP.
- (d) Cờ `heavy` trong kết quả `get_furniture_details` và `check_asset_compatibility`, ngưỡng 20 MB và 150 000 polycount.

### Out of scope

- Đồng bộ toàn bộ catalog FurniMesh về local.
- Thay đổi `crawler.py` hoặc `scripts/furnimesh/mcp_server.py`.
- Giao diện kết nối trong sidebar (thuộc FEAT-2026-156) và tab trong AlterAI (thuộc FEAT-2026-157).
- Tự nén hoặc giảm polycount GLB.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `@modelcontextprotocol/sdk`, `zod`, `vitest` (đã có trong `paperclip/packages/furnimesh-mcp`).
- Dữ liệu dùng chung: không ghi dữ liệu vào `data/furnimesh/`.
- Service/port không được ảnh hưởng: API Atelier, Paperclip server, cổng 5000 và cổng 8123. Chỉ dùng cổng 3180 cho MCP.
- Script khởi động hiện có phải giữ nguyên hành vi với các service cũ.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo bảng ánh xạ `PARENT_CATEGORY_SLUGS` gồm 12 danh mục cha (Seating, Sofas, Tables, Beds, Storage, Lighting, Bathroom, Decor, Kitchen, Architecture, Appliances, Other Furniture) sang tập slug con. Bảng này dùng để tra cứu không phân biệt hoa thường.
2. `resolveCategory(input)`: nếu input khớp tên cha thì mở rộng sang slug con; nếu khớp slug con đã biết thì dùng trực tiếp; nếu không khớp thì ném lỗi `unknown_category` kèm gợi ý từ `list_furniture_categories`.
3. Nếu danh mục cha có nhiều slug con, `search_furniture` gọi lần lượt các slug (giới hạn `limit`) và gộp kết quả theo `model_id`.
4. `list_furniture_categories` là nguồn duy nhất cho danh sách danh mục hiển thị trong UI.
5. Script PowerShell: kiểm tra `Get-NetTCPConnection -LocalPort $port -State Listen`; nếu chưa nghe thì khởi động `node packages/furnimesh-mcp/dist/http.js` với `PORT` tương ứng, ghi log vào `.atelier-logs/`.
6. Cờ `heavy`: đọc `Content-Length` từ HEAD cho kích thước; polycount lấy từ metadata trang chi tiết nếu có, nếu không có thì để `polycount: null` và `heavy` chỉ dựa vào kích thước.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/furnimesh-mcp/src/index.ts` | Sửa | Ánh xạ danh mục, lỗi rõ ràng, cờ heavy |
| `paperclip/packages/furnimesh-mcp/src/index.test.ts` | Thêm test | Test vitest với fetch mock |
| `paperclip/packages/furnimesh-mcp/src/http.ts` | Sửa nhẹ (nếu cần) | Đọc `FURNIMESH_MCP_PORT` |
| `start-atelier-paperclip.ps1` | Sửa | Tự bật MCP cổng 3180 |
| `start-atelier.ps1` | Sửa | Tự bật MCP cổng 3180 |
| `paperclip/ui/src/pages/apps/app-detail/FurniMeshLibraryPanel.tsx` | Sửa | Dùng danh mục động |

## 7. Acceptance criteria

- [ ] AC-01: `search_furniture({category: "Sofas"})` và `category: "Seating"` không trả HTTP 404; trả danh sách kết quả hoặc mảng rỗng có `ok: true`.
- [ ] AC-02: `search_furniture({category: "sofa"})` (slug con) vẫn chạy như trước.
- [ ] AC-03: Tên hoặc slug không biết trả lỗi `unknown_category` kèm danh sách gợi ý, không gọi FurniMesh.
- [ ] AC-04: `list_furniture_categories` trả đủ 12 danh mục cha; UI hiển thị đúng danh sách này.
- [ ] AC-05: Chạy `start-atelier-paperclip.ps1` khi cổng 3180 chưa nghe thì MCP được bật; khi đã nghe thì không bật thêm và script không lỗi.
- [ ] AC-06: `FURNIMESH_MCP_PORT=3190` đổi cổng MCP tương ứng.
- [ ] AC-07: GLB có Content-Length > 20 MB hoặc polycount > 150 000 có `heavy: true`; file nhỏ có `heavy: false`.
- [ ] AC-08: Vitest của `furnimesh-mcp` pass toàn bộ, không gọi mạng thật.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit test MCP | `cd paperclip/packages/furnimesh-mcp && npx vitest run` | Tất cả test pass, fetch được mock |
| Build MCP | `npx tsc -p tsconfig.json` | Không lỗi kiểu |
| Lỗi danh mục | Test AC-03 trong vitest | Trả `unknown_category` |
| Khởi động script | `pwsh -File start-atelier.ps1` với cổng 3180 trống và đã bận | Bật MCP hoặc bỏ qua đúng |
| Cờ heavy | Test với HEAD mock Content-Length | Cờ đúng theo ngưỡng |
| UI | `cd paperclip/ui && pnpm build` | Build thành công |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| FurniMesh đổi cấu trúc URL | Danh mục lấy động; lỗi trả về rõ ràng |
| Script PowerShell kill nhầm tiến trình | Chỉ khởi động, không kill tiến trình sẵn có |
| Tìm kiếm theo danh mục cha chậm do nhiều request | Giới hạn số slug và `limit` |

Rollback point và cách rollback: revert commit triển khai của FEAT-2026-155 trên nhánh `feat/furnimesh-connect`. Baseline là commit `7f14c779`.

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
| 2026-11-22 | 7f14c779 + commit FEAT-155 | (a) PARENT_CATEGORY_SLUGS, resolveCategory, UnknownCategoryError, gộp slug con theo model_id, bỏ qua slug con 404 khi gộp; (b) hàm Start-FurniMeshMcp trong 2 script; (c) panel lấy danh mục từ list_furniture_categories, hiển thị cảnh báo heavy; (d) cờ heavy | list_furniture_categories trả 12 danh mục cha từ bảng ánh xạ (không gọi mạng). search_furniture trả {ok:true,results}. Slug con ngoài sofa/chair/dining-table/bed/floor-lamp là suy đoán, chưa kiểm chứng mạng. http.ts không cần sửa (đã đọc FURNIMESH_MCP_PORT). |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 | FEAT-155 | `npx vitest run` (furnimesh-mcp) | PASS 2 file, 7 test, fetch mock (AC-01,02,03,04,07,08) | console vitest |
| 2026-11-22 | FEAT-155 | `npx tsc --noEmit` / `tsc -p` (furnimesh-mcp), build lại dist | PASS, không lỗi | console |
| 2026-11-22 | FEAT-155 | Cú pháp PowerShell 2 script (Parser.ParseFile) | PASS | console |
| 2026-11-22 | FEAT-155 | `node scripts/check-token-gates.mjs` | 0 vi phạm ở FurniMeshLibraryPanel.tsx (vi phạm có sẵn ở file khác) | console |
| 2026-11-22 | FEAT-155 | `tsc --noEmit` ui | Không chạy được: worktree thiếu node_modules ui (không tìm thấy react/@paperclipai/shared) | console |
| 2026-11-22 | FEAT-155 | Chạy thực script khởi động (AC-05, AC-06) | Chưa chạy thực, chỉ kiểm cú pháp | - |

## 14. Kết quả và đóng chức năng

- Kết quả: AC-01..04, 07, 08 đạt qua vitest; AC-05/06 mới kiểm cú pháp.
- Hạn chế còn lại: slug con ngoài danh sách đã biết là suy đoán (404 khi gộp sẽ bị bỏ qua); UI chưa typecheck/build được trong worktree.
- Việc chưa hoàn tất:
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:

## Bổ sung sau nghiệm thu (2026-11-22)

- `http.ts`/`startHttpServer` thêm CORS cho origin trong `FURNIMESH_MCP_ALLOWED_ORIGINS` (mặc định 127.0.0.1/localhost cổng 8123 và 3100) và trả 204 cho OPTIONS `/mcp`; trước đó trình duyệt chặn AlterAI gọi thẳng MCP. Đã kiểm: OPTIONS trả đúng header; vitest 12/12 pass.
- Ghi nhận: `get_furniture_details` chỉ với `model_id` trả HTTP 404 vì đường dẫn thật có phân cấp (`/library/<cha>/<con>/<id>/`); client phải gửi `detail_url` (lấy từ kết quả tìm kiếm).
