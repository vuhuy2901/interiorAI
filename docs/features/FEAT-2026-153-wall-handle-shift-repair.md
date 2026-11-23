# [FEAT-2026-153] Sửa tường bị kéo chéo và đường chọn kéo dài

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng kèm ảnh lỗi |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 18:09 ICT |
| Revision bắt đầu | HTML blob `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a` |
| Revision cuối | HTML blob `29fc44fa26f29f32c8dd3b8fa760a88af24a889d` |

## 1. Bối cảnh

Ảnh lỗi cho thấy tường hành lang có bốn cửa kính trượt đã bị kéo một đầu thành đoạn chéo dài 33,75 m. Lớp chọn tường sáng chạy xuyên mặt bằng làm lỗi càng rõ. Nguyên nhân trong editor là thao tác kéo handle chưa áp dụng khóa `Shift`, dù thao tác vẽ tường đã có khóa này.

## 2. Mục tiêu

- Giữ `Shift` khi kéo handle đầu tường phải giữ tường ngang hoặc dọc theo hướng ban đầu.
- Giữ `Shift` khi kéo handle giữa phải khóa chuyển động theo trục ngang hoặc dọc gần nhất.
- Một cú bấm không đủ khoảng kéo không được làm lệch node tường.
- Khôi phục đoạn tường hành lang đang bị kéo chéo về trạng thái trước đó bằng Undo nếu lịch sử hiện tại còn hợp lệ.
- Làm lớp chọn tường bớt giống một đường sáng xuyên cảnh nhưng vẫn đủ rõ để thao tác.

## 3. Phạm vi

### In scope

- Gesture kéo handle đầu và handle giữa của tường trong BUILD.
- Ngưỡng nhận biết kéo chuột cho handle.
- Hình thức highlight/handle của tường đang chọn.
- Khôi phục thao tác kéo sai hiện tại bằng Undo sau khi xác nhận trực quan.

### Out of scope

- Thay kích thước, vị trí hoặc số lượng cửa kính do người dùng chủ động đặt.
- Thay bố cục phòng, sàn, nội thất hay camera.
- Tự động xóa tường hoặc tự động sửa mọi tường chéo hợp lệ.

## 4. Dependency và tài nguyên cần bảo vệ

- `ai-office-standalone/index.html`, `FP2.wallNodes`, `FP2.walls`, lịch sử Undo/Redo và localStorage hiện hữu.
- Giữ khả năng kéo tường tự do khi không giữ `Shift` và kéo handle giữa để di chuyển toàn đoạn.
- Không xóa tường, cửa hoặc dữ liệu mặt bằng ngoài thao tác Undo đã xác nhận bằng kết quả trực quan.
- Server cổng 5000 phải tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Ghi nhận vị trí chuột bắt đầu và chỉ áp dụng thay đổi node sau khi vượt ngưỡng kéo nhỏ.
2. Với handle đầu, khi giữ `Shift`, khóa node theo trục của đoạn tường ban đầu để đoạn ngang vẫn ngang và đoạn dọc vẫn dọc.
3. Với handle giữa, khi giữ `Shift`, chỉ cho dịch theo trục có độ dịch lớn hơn.
4. Giảm độ dày/độ sáng của dải highlight và để handle tuân theo che khuất chiều sâu.
5. Kiểm thử kéo endpoint, kéo midpoint, click không kéo, Undo và xóa/chọn tường không bị ảnh hưởng.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Gesture và highlight tường | Sửa nguyên nhân thao tác và biểu hiện trực quan |

## 7. Acceptance criteria

- [x] AC-01: Giữ Shift khi kéo endpoint của tường ngang/dọc không thể tạo tường chéo.
- [x] AC-02: Giữ Shift khi kéo midpoint chỉ dịch toàn đoạn theo một trục; không giữ Shift vẫn cho phép dịch tự do.
- [x] AC-03: Click handle hoặc rung chuột dưới ngưỡng không thay đổi dữ liệu tường và không tạo lịch sử Undo rác.
- [x] AC-04: Highlight tường đang chọn không còn là dải sáng dày xuyên cảnh; các handle vẫn chọn và kéo được.
- [x] AC-05: Tường lỗi hiện tại được Undo về đúng hướng nếu kết quả trực quan và chiều dài xác nhận hợp lệ.
- [x] AC-06: Cổng 5000 trả HTTP 200, không có page error mới và Undo/Delete/chọn tường vẫn hoạt động.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp và diff | `node --check`, `git diff --check` | Không lỗi |
| Browser automation | Kéo endpoint/midpoint có và không có Shift, click handle | AC-01 đến AC-03 |
| Visual | Chọn tường dài trong BUILD | AC-04 |
| Live repair | Undo trạng thái tường 33,75 m và quan sát lại | AC-05 |
| Server/log | HTTP HEAD và console errors | AC-06 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Khóa sai hướng của tường chéo hợp lệ | Chỉ giữ trục ban đầu khi đoạn gần ngang/dọc; đoạn chéo dùng khóa theo chuyển động |
| Click bị hiểu là kéo | Dùng ngưỡng pixel trước khi sửa node |
| Undo khôi phục nhầm thao tác | Chỉ giữ kết quả nếu tường về đúng hướng/chiều dài; nếu không, Redo ngay |

Rollback point và cách rollback: khôi phục HTML blob đầu phiên; với dữ liệu live dùng Redo nếu Undo không đúng tường lỗi.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-22 18:09 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 18:10 ICT | Live state | Undo tường hành lang bị kéo chéo 33,75 m | Kết quả được lưu lại qua luồng Undo hiện hữu |
| 2026-11-22 18:13 ICT | HTML working tree | Thêm ngưỡng kéo 5 px và khóa Shift cho endpoint/midpoint | Không Shift vẫn cho phép kéo tự do |
| 2026-11-22 18:14 ICT | HTML working tree | Thu nhỏ handle và giảm dải highlight | Giữ khả năng chọn/kéo, bật depth test mặc định |
| 2026-11-22 18:14 ICT | Runtime | Mở lại server tĩnh cổng 5000 | Phục vụ thư mục `ai-office-standalone` |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 18:10 ICT | Live state | Undo tường lỗi trong trình duyệt | PASS | Đường chéo biến mất, hai dãy tường hành lang trở lại ngang và trạng thái báo `Đã hoàn tác.` |
| 2026-11-22 18:20 ICT | `29fc44fa26f29f32c8dd3b8fa760a88af24a889d` | Browser automation cho handle | PASS | Click không đổi dữ liệu; Shift endpoint giữ trục; Shift midpoint chỉ dịch một trục; không Shift dịch tự do; highlight mảnh và có depth test |
| 2026-11-22 18:23 ICT | `29fc44fa26f29f32c8dd3b8fa760a88af24a889d` | Regression BUILD | PASS | Hold-O orbit, Shift vẽ tường, tường tự do và sàn nâu vẫn đạt |
| 2026-11-22 18:24 ICT | `29fc44fa26f29f32c8dd3b8fa760a88af24a889d` | Parse inline JS, `git diff --check`, HTTP HEAD | PASS | Không lỗi cú pháp/diff; cổng 5000 trả 200 |

## 14. Kết quả và đóng chức năng

- Kết quả: Tường hành lang live đã được khôi phục; kéo handle có khóa Shift và chống rung chuột; lớp chọn không còn là dải sáng dày xuyên cảnh.
- Hạn chế còn lại: Tường chéo chủ động vẫn được hỗ trợ khi không giữ Shift.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: HTML blob `230d61733ba3e0fcf98400e0c36a230f3ea4fa7a`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-22 18:24 ICT.
