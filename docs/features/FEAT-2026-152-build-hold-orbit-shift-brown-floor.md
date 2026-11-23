# [FEAT-2026-152] Giữ O xoay, Shift khóa tường và sàn nâu đồng nhất

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-21 |
| Frozen at | 2026-11-21 11:25 ICT |
| Revision bắt đầu | HTML blob `8db88ab6dc7ce1768bf6adcfcb26d54ba1793e50` |
| Revision cuối | HTML blob `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a` |

## 1. Bối cảnh

BUILD hiện dùng `O` như công tắc bật/tắt xoay, trong khi người dùng cần hành vi nhấn giữ. Vẽ tường cần giữ `Shift` để khóa thẳng. Sàn mặt bằng cũ và các ô sàn chỉnh trong BUILD đang dùng texture và màu khác nhau, tạo mảng màu lệch.

## 2. Mục tiêu

- `O` là phím tạm thời: keydown bật xoay, keyup tắt xoay và trả ngay về công cụ đang chọn.
- Giữ `Shift` khi kéo tường khóa theo trục ngang hoặc dọc gần nhất. Không giữ Shift cho phép tường tự do.
- Toàn bộ sàn mặc định, hành lang và sàn BUILD mặc định dùng chung texture gỗ và tông nâu.
- Bản ứng dụng được phục vụ và kiểm tra tại `http://127.0.0.1:5000/`.

## 3. Phạm vi

### In scope

- Pointer và keyboard routing trong BUILD.
- Nút hiển thị `Giữ O · Xoay 3D` làm chỉ báo và hỗ trợ giữ chuột tương đương.
- Texture/màu của sàn cũ, hành lang và vật liệu sàn mặc định trong BUILD.
- Server tĩnh cổng 5000 cho chính thư mục `ai-office-standalone`.

### Out of scope

- Thay bố cục phòng, tường, cửa và nội thất.
- Thay các lựa chọn vật liệu sàn phụ do người dùng chủ động chọn.
- Thay camera LIVE hoặc schema localStorage.

## 4. Dependency và tài nguyên cần bảo vệ

- `ai-office-standalone/index.html`, Three.js r128, `camOrbit`, FP2 và localStorage hiện hữu.
- Giữ Undo/Redo, Delete, W/V/F/U/E và kéo các handle tường.
- Không dừng dịch vụ khác. Cổng 5000 chỉ phục vụ thư mục standalone.

## 5. Thiết kế và kế hoạch triển khai

1. Đổi `O` từ toggle sang momentary input. Keydown không lặp bật orbit, keyup tắt. Blur/thoát BUILD cũng tắt để tránh trạng thái kẹt.
2. Dùng pointerdown/up của nút `Giữ O` cho thiết bị không có bàn phím. Click đơn không khóa trạng thái.
3. Giữ điều kiện `event.shiftKey` trong ghost tường. Khi đúng, so sánh |dx| và |dz| rồi giữ trục lớn hơn. Khi sai, giữ cả x và z.
4. Định nghĩa một màu sàn nâu dùng chung. Các phòng và hành lang cũ dùng `herringboneTex`; vật liệu `herringbone` trong BUILD dùng cùng màu và texture.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Keyboard/pointer behavior, toolbar copy, floor materials | Điểm vào duy nhất của ứng dụng |

## 7. Acceptance criteria

- [x] AC-01: Giữ O rồi kéo làm thay đổi camera nhưng không thay dữ liệu mặt bằng; thả O tắt orbit ngay.
- [x] AC-02: O không bị kẹt khi lặp keydown, blur cửa sổ, thoát BUILD hoặc chuyển công cụ.
- [x] AC-03: Giữ Shift khi vẽ tạo tường có dx=0 hoặc dz=0; không giữ Shift có thể tạo tường chéo.
- [x] AC-04: Sàn cũ, hành lang và sàn BUILD mặc định cùng texture gỗ và tông nâu; không còn mảng mặc định xanh/xám lệch màu.
- [x] AC-05: `127.0.0.1:5000` trả HTTP 200, giao diện hiển thị nút mới và không có page error do thay đổi.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp và diff | `node --check`, `git diff --check` | Không lỗi |
| Browser behavior | Keydown/keyup O, kéo camera, vẽ Shift và không Shift | AC-01 đến AC-03 |
| Visual | Chụp/quan sát BUILD tại cổng 5000 | Sàn nâu đồng nhất, nút rõ ràng |
| Server | HTTP HEAD cổng 5000 | 200 OK |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Keyup bị mất làm orbit kẹt | Reset ở window blur, visibility change và thoát BUILD |
| Màu nâu che mất texture | Dùng màu tint trung tính vừa phải với texture gỗ hiện có |
| Dữ liệu sàn cũ có material khác | Chỉ đổi default/herringbone; giữ lựa chọn phụ rõ ràng của người dùng |

Rollback point và cách rollback: khôi phục HTML blob đầu phiên của hợp đồng này.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-21 11:25 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-21 23:25 ICT | HTML working tree | Đổi O sang thao tác nhấn giữ, thêm reset khi blur/ẩn trang/đổi công cụ | Nút chuột hỗ trợ cùng hành vi nhấn giữ |
| 2026-11-21 23:27 ICT | HTML working tree | Đồng nhất vật liệu sàn cũ, hành lang và sàn BUILD mặc định | Texture gỗ xương cá, tint nâu `#b88763` |
| 2026-11-21 23:29 ICT | HTML working tree | Phục vụ ứng dụng tại cổng 5000 | Không thay dịch vụ ngoài phạm vi |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-21 23:30 ICT | `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a` | Browser automation | PASS | Giữ O đổi camera, thả O tắt; Shift tạo tường thẳng; không Shift tạo tường chéo; dữ liệu tường/sàn không đổi khi orbit; không có page error |
| 2026-11-21 23:31 ICT | `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a` | Visual BUILD tại cổng 5000 | PASS | Nút `Giữ O · Xoay 3D` hiển thị đúng, sàn mặc định cùng texture và tông nâu |
| 2026-11-21 23:32 ICT | `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a` | `node --check`, `git diff --check`, HTTP HEAD | PASS | Không lỗi cú pháp/diff; `http://127.0.0.1:5000/` trả 200 |

## 14. Kết quả và đóng chức năng

- Kết quả: Hoàn tất hành vi giữ O để xoay, Shift khóa thẳng khi vẽ tường và đồng nhất sàn mặc định màu nâu.
- Hạn chế còn lại: Ánh sáng trong cảnh vẫn tạo độ sáng tối khác nhau trên các phòng, nhưng vật liệu nền đã đồng nhất.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: HTML blob `8db88ab6dc7ce1768bf6adcfcb26d54ba1793e50`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-21 23:32 ICT.
