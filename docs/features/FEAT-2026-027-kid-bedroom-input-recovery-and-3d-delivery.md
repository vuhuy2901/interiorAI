# [FEAT-2026-027] Khôi phục input và triển khai 3D Phòng Ngủ Trẻ Em

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex + TUAN |
| Người chấp thuận | TUAN (yêu cầu ngày 2026-11-13) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13 |
| Revision bắt đầu | Chưa có |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Input mặt bằng cho dự án **Phòng Ngủ Trẻ Em — Giường Tầng & Góc Học Tập** chưa truy cập được qua shell Paperclip vì thiếu phiên xác thực. Nguồn local được yêu cầu là `C:\\Users\\TUAN\\Downloads\\ATELIER_INPUTS\\kid_bedroom_floorplan.jpg`. Không được dùng ảnh demo hoặc thay đổi xác thực để thay thế input.

## 2. Mục tiêu

Xác minh và nhập đúng ảnh mặt bằng, tạo hoặc dùng đúng một project, sau đó thực thi workflow từ nhận diện mặt bằng đến render Cycles và kiểm tra PNG còn truy cập được sau reload.

## 3. Phạm vi

### In scope

- Ưu tiên kiểm tra, giải mã, đo kích thước và SHA-256 của file local được chỉ định.
- Nếu không có file local, chỉ kiểm tra attachment bằng phiên Paperclip được cấp hợp lệ.
- Tạo hoặc tái sử dụng duy nhất project Phòng Ngủ Trẻ Em và gắn ảnh bằng API/import hợp lệ.
- Nhận diện mặt bằng, dựng geometry/scene, bố trí giường tầng, cầu thang, giá sách, bàn học, tủ áo; camera isometric; Blender Cycles render; persistence Gallery.
- Ghi rõ trạng thái độc lập của input, project, recognition, geometry, rendering và persistence.

### Out of scope

- Không thay editor Three.js + Blender Cycles.
- Không dùng dữ liệu demo hay ảnh thay thế.
- Không sửa auth, middleware, cookie, token hoặc xoá/thay thế project khác.
- Không sửa hoặc commit thay đổi ngoài phạm vi hiện có của người dùng/agent khác.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip tại `http://localhost:3100`, ATELIER API, Pascal MCP, Blender Cycles.
- Dữ liệu dùng chung: database project, render Gallery, worktree đang có thay đổi chưa commit.
- Service/port/database không được ảnh hưởng: không reset, clean, stash, checkout hoặc restore repository; không thay auth.

## 5. Thiết kế và kế hoạch triển khai

1. Xác minh local input; chỉ khi không có mới kiểm tra Paperclip attachment qua phiên hợp lệ.
2. Nếu không có input hợp lệ, đánh dấu riêng bước Input Access là BLOCKED và dừng trước recognition.
3. Nếu có input, kiểm tra project trùng trước khi tạo, import floorplan qua endpoint hợp lệ, lưu định danh/hash.
4. Chạy workflow có artifact bắt buộc: scaled floorplan → recognition → scene → layout → approval → isometric Cycles → QA/gallery persistence.
5. Kiểm tra file PNG thông qua endpoint chính thức, reload trang và đọc lại Gallery/job.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-027-kid-bedroom-input-recovery-and-3d-delivery.md` | Hợp đồng và bằng chứng | Theo dõi feature và verification |
| ATELIER database/uploads/exports | Dữ liệu runtime có chủ đích | Chỉ khi input hợp lệ và project được xác minh |

## 7. Acceptance criteria

- [ ] AC-01: Có nguồn ảnh hợp lệ, filename, kích thước, SHA-256 và cách truy cập được ghi nhận.
- [ ] AC-02: Không dùng token/cookie bí mật, không tắt xác thực và không thay ảnh demo.
- [ ] AC-03: Có chính xác một project mục tiêu, không tạo bản trùng.
- [ ] AC-04: Ảnh nguồn đã import và vẫn truy cập được sau reload.
- [ ] AC-05: Recognition/geometry chỉ chạy khi input hợp lệ; không có input thì chỉ Input Access là BLOCKED.
- [ ] AC-06: Nếu triển khai được, scene bao gồm giường tầng, cầu thang, giá sách, bàn học, tủ áo; render isometric bằng Cycles.
- [ ] AC-07: PNG render có thể mở/tải và vẫn tồn tại sau reload Gallery.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Input local | `Test-Path`, ACL, decode ảnh, SHA-256 | Đọc được JPG hoặc ghi BLOCKED |
| Attachment fallback | Paperclip UI phiên hợp lệ | Chỉ dùng attachment chính thức nếu có |
| Import/reload | API hợp lệ + GET lại project/upload | Input vẫn tồn tại |
| Workflow | Run trace/artifact IDs | Agent/node và handoff có bằng chứng |
| Render persistence | GET Gallery/job, mở PNG, reload | PNG tồn tại và tải được |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Thiếu nguồn ảnh | Chặn riêng input, không suy diễn geometry |
| Dự án trùng | Tìm theo tên/provenance trước khi tạo |
| PNG mất sau COMPLETED | Kiểm tra file và endpoint sau reload trước khi công nhận |
| Đè thay đổi đang làm | Không đụng file/diff ngoài phạm vi |

Rollback point và cách rollback: Xoá riêng project/runtime artifact mới được tạo trong feature này chỉ khi người dùng yêu cầu; không rollback worktree đang có.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex, theo yêu cầu đã được người dùng phê duyệt.
- Thời điểm: 2026-11-13.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13 | Uncommitted | Khởi tạo contract và kiểm tra local input | File local được chỉ định không tồn tại |
| 2026-11-13 | Uncommitted | Kiểm tra Paperclip bằng phiên UI đã đăng nhập | Không có project hoặc attachment tìm được với tên Phòng Ngủ Trẻ Em |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13 | Uncommitted | Local Windows file | BLOCKED | `Test-Path C:\\Users\\TUAN\\Downloads\\ATELIER_INPUTS\\kid_bedroom_floorplan.jpg` = false |
| 2026-11-13 | Uncommitted | Paperclip native attachment/project lookup | BLOCKED | Tìm `Phòng Ngủ Trẻ Em` trong Paperclip chỉ trả về task không liên quan; danh sách project hiện chỉ có Studio 4×5m và Master Japandi |
| 2026-11-13 | Uncommitted | Bảo vệ repository | PASS | Đã đọc `git status --short` và `git diff --stat`; không reset/clean/stash/checkout/restore hay sửa file người dùng đang làm |

## 14. Kết quả và đóng chức năng

- Kết quả: Đang thực hiện.
- Hạn chế còn lại: Không có nguồn ảnh hợp lệ ở đường dẫn local hoặc attachment Paperclip hiện tại.
- Việc chưa hoàn tất: Input Access BLOCKED; vì vậy Project creation, recognition, geometry, camera, render và persistence chưa được khởi chạy theo đúng quy tắc không suy diễn từ dữ liệu thiếu.
- Rollback point: Không áp dụng trước khi tạo runtime artifact.
- Trạng thái `CLOSED` bởi: Chưa áp dụng.
- Thời điểm: Chưa áp dụng.
