# [FEAT-2026-039] Userscript xem dữ liệu sản phẩm công khai Goofish

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | User (yêu cầu trực tiếp ngày 2026-11-14) |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14 (Asia/Bangkok) |
| Revision bắt đầu | 95c2db708d3e4eea8b12a26b7dedd36c4de63c57 + worktree hiện hữu |
| Revision cuối | Working tree trên `95c2db708d3e4eea8b12a26b7dedd36c4de63c57`; script v1.1.0 SHA-256 `A86665894CFFF2F7ECD8BFD7E36E8E1B308E3D244346F8E6A9CBCC88509E167C` |

## 1. Bối cảnh

Goofish hiển thị thẻ sản phẩm công khai trên trang chủ khi chưa đăng nhập, nhưng
sau đó có thể dựng hộp đăng nhập và lớp phủ tối che giao diện. Người dùng cần
một script độc lập để đọc và hiển thị lại đúng dữ liệu đã có công khai trong DOM,
không giả mạo phiên đăng nhập, không dùng cookie/token và không gọi nhầm API
`loginuser.get` như API chi tiết sản phẩm.

## 2. Mục tiêu

Tạo một Userscript hoàn chỉnh có thể chạy trên `https://www.goofish.com/*`, loại
bỏ riêng lớp phủ/hộp đăng nhập gây che nội dung và dựng bảng xem dữ liệu công
khai gồm URL, ảnh, tên, giá và mô tả/tình trạng có sẵn trong thẻ sản phẩm.

## 3. Phạm vi

### In scope

- Đọc dữ liệu từ các liên kết sản phẩm và phần tử con đã render công khai trong DOM.
- Hiển thị bảng sản phẩm công khai trong một panel cục bộ trên trang.
- Ẩn `ant-modal-mask`, hộp đăng nhập và banner đăng nhập chỉ ở phía giao diện.
- Theo dõi DOM động để cập nhật danh sách khi Goofish tải thêm thẻ sản phẩm.
- Cung cấp nút bật/tắt panel, làm mới dữ liệu và đóng panel.
- Không dùng cookie, token, localStorage hay thông tin đăng nhập.

### Out of scope

- Không đăng nhập, giả mạo đăng nhập, giải CAPTCHA hoặc can thiệp cơ chế xác thực.
- Không gọi API MTop cần chữ ký/token và không tái tạo thuật toán ký request.
- Không mua hàng, nhắn tin, đăng sản phẩm hoặc thực hiện hành động đại diện người dùng.
- Không bảo đảm trường mô tả đầy đủ nếu Goofish không công khai trường đó trong DOM.
- Không sửa code ứng dụng Atelier/Paperclip hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Tampermonkey/Violentmonkey hoặc trình quản lý Userscript tương thích.
- Dữ liệu dùng chung: chỉ đọc DOM của tab Goofish; không đọc cookie/token/storage.
- Service/port/database không được ảnh hưởng: toàn bộ service, port và database của repository.

## 5. Thiết kế và kế hoạch triển khai

1. Dùng metadata Userscript giới hạn trên miền `www.goofish.com`.
2. Trích xuất thẻ `a[href*="/item"]`, chuẩn hóa URL và loại trùng theo `id`.
3. Lấy ảnh từ `img`, tên từ `title`/nội dung tiêu đề, giá từ cụm giá và mô tả
   từ các thuộc tính/tình trạng công khai có sẵn.
4. Render panel dùng Shadow DOM để không xung đột CSS trang.
5. Ẩn lớp phủ/hộp đăng nhập bằng style cục bộ; không sửa trạng thái xác thực.
6. Dùng `MutationObserver` có debounce để phản ánh danh sách tải động.
7. Kiểm tra tĩnh các điều cấm và chạy kiểm thử logic trích xuất tối thiểu.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-039-goofish-public-product-view-userscript.md` | Tạo mới | Hợp đồng và bằng chứng triển khai |
| `scripts/goofish-public-product-view.user.js` | Tạo mới | Userscript hiển thị dữ liệu công khai |

## 7. Acceptance criteria

- [x] AC-01: Script chạy trên `https://www.goofish.com/*` và không cần đăng nhập.
- [x] AC-02: Script không đọc/ghi cookie, token, localStorage hoặc sessionStorage.
- [x] AC-03: Script không gọi `loginuser.get`, không gọi API đăng nhập và không tái tạo chữ ký MTop.
- [x] AC-04: Script nhận diện đúng lớp phủ `ant-modal-mask` và hộp đăng nhập, chỉ ẩn ở UI.
- [x] AC-05: Panel hiển thị URL, ảnh, tên, giá và mô tả/tình trạng công khai khi các trường tồn tại trong DOM.
- [x] AC-06: Dữ liệu được loại trùng theo mã sản phẩm và cập nhật khi DOM thay đổi.
- [x] AC-07: Script có nút làm mới, ẩn/hiện và đóng panel; liên kết sản phẩm mở ở tab mới.
- [x] AC-08: Không sửa file triển khai nào ngoài script mới đã liệt kê.
- [x] AC-09 (CR-001): Toàn bộ thẻ trong panel là liên kết bàn phím/chuột và mở
  đúng URL chi tiết công khai `/item?id=...` ở tab mới.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra cú pháp | `node --check scripts/goofish-public-product-view.user.js` | Exit code 0 |
| Kiểm tra điều cấm | `rg -n "cookie|localStorage|sessionStorage|loginuser\\.get|document\\.cookie|GM_cookie|token" scripts/goofish-public-product-view.user.js` | Không có truy cập dữ liệu xác thực; từ khóa nếu có chỉ nằm trong chú thích cảnh báo |
| Kiểm tra endpoint/DOM | Đối chiếu bằng Cloud Browser trên trang chủ và URL `/item?id=...` | Thẻ công khai có ảnh/tên/giá; click mở `/item` tab mới; modal che chi tiết khi chưa đăng nhập |
| Kiểm tra selector | Đối chiếu DOM Cloud Browser | Lớp phủ là `.ant-modal-mask`, nền đen trong suốt, z-index 1000 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Goofish đổi class hash | Ưu tiên selector theo `href`, `title`, cấu trúc và nhiều fallback |
| Ẩn nhầm modal không liên quan | Chỉ áp dụng selector modal đăng nhập có lớp/iframe đặc trưng và nút bật/tắt rõ ràng |
| Mô tả không đầy đủ | Gắn nhãn dữ liệu là phần công khai có sẵn trong DOM, không hứa dữ liệu chi tiết API |
| MutationObserver gây tải | Debounce và giới hạn số thẻ render |

Rollback point và cách rollback: xóa riêng
`scripts/goofish-public-product-view.user.js` và hợp đồng này; không cần rollback
database hay service.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex
- Thời điểm: 2026-11-14 (Asia/Bangkok)

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-14 | Cho phép bấm toàn bộ thẻ panel để mở trang chi tiết | Người dùng yêu cầu thẻ phải click được như trang thông thường | Chỉ đổi markup/CSS của thẻ panel; không đổi nguồn dữ liệu hay xác thực | User (yêu cầu trực tiếp) | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-14 | 95c2db7 + worktree | Tạo và đóng băng hợp đồng trước triển khai | Chưa sửa implementation |
| 2026-11-14 | 95c2db7 + worktree | Tạo Userscript DOM-only, panel Shadow DOM, bộ lọc lớp phủ và cập nhật động | Đúng phạm vi frozen |
| 2026-11-14 | 95c2db7 + worktree | Chuyển VERIFYING rồi CLOSED | Không có thay đổi ứng dụng hiện hữu |
| 2026-11-14 | 95c2db7 + worktree | Reopen CR-001 và đóng băng hợp đồng 1.1 | Chưa sửa implementation CR-001 |
| 2026-11-14 | 95c2db7 + worktree | Thay thẻ tĩnh bằng liên kết toàn thẻ, thêm hover/focus và tăng version script lên 1.1.0 | Đúng phạm vi CR-001 |
| 2026-11-14 | 95c2db7 + worktree | Đóng lại CR-001 | AC-09 đạt |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-14 | Browser observation | Trang chủ chưa đăng nhập | PASS | Thẻ `/item?id=...` công khai có `img`, `title`, giá và metadata tình trạng |
| 2026-11-14 | Browser observation | Lớp phủ đăng nhập | PASS | `.ant-modal-mask`, fixed, `rgba(0,0,0,0.45)`, z-index 1000 |
| 2026-11-14 | Browser observation | Luồng click | PASS một phần | Anchor sản phẩm có `target="_blank"`; trang chi tiết chưa đăng nhập hiển thị lỗi dữ liệu rồi modal đăng nhập |
| 2026-11-14 | Browser asset inventory | Phân biệt request chi tiết và tài khoản | PASS | Chi tiết: `mtop.taobao.idle.pc.detail/1.0`; tài khoản: `mtop.taobao.idlemessage.pc.loginuser.get/1.0` |
| 2026-11-14 | 95c2db7 + worktree | `node --check scripts/goofish-public-product-view.user.js` | PASS | Exit code 0 |
| 2026-11-14 | 95c2db7 + worktree | Static check lần 1 | FAIL (giữ bằng chứng) | Lệnh one-liner bị lỗi escape regex của PowerShell; không phải lỗi script |
| 2026-11-14 | 95c2db7 + worktree | Static policy/selector check lần 2 | PASS | Không có truy cập dữ liệu xác thực/network API; đủ metadata và selector bắt buộc |
| 2026-11-14 | 95c2db7 + worktree | `git diff --check -- <hai file>` | PASS | Exit code 0 |
| 2026-11-14 | 95c2db7 + worktree | Clickable-card one-liner lần 1 và 2 | FAIL (giữ bằng chứng) | Lỗi escape `${...}`/dấu `<` qua PowerShell; không phải lỗi script |
| 2026-11-14 | 95c2db7 + worktree | `node --check scripts/goofish-public-product-view.user.js` sau CR-001 | PASS | Exit code 0 |
| 2026-11-14 | 95c2db7 + worktree | Kiểm tra markup bằng `Select-String -SimpleMatch` | PASS | Có v1.1.0, `.card`, `target="_blank"` và nhãn mở trang chi tiết |
| 2026-11-14 | 95c2db7 + worktree | `git diff --check -- <hai file>` sau CR-001 | PASS | Exit code 0 |

## 14. Kết quả và đóng chức năng

- Kết quả: Bản 1.1.0 đã hoàn tất; toàn bộ thẻ panel mở URL chi tiết sản phẩm ở tab mới.
- Hạn chế còn lại: Trang chi tiết ẩn danh có thể trả trạng thái lỗi hoặc modal;
  script chỉ hiển thị trường mà trang đã công khai trong DOM/metadata.
- Việc chưa hoàn tất: Không có trong phạm vi CR-001.
- Rollback point: Xóa hai file mới trên working tree dựa trên revision
  `95c2db708d3e4eea8b12a26b7dedd36c4de63c57`.
- Trạng thái `CLOSED` bởi: Codex
- Thời điểm: 2026-11-14 (Asia/Bangkok)
