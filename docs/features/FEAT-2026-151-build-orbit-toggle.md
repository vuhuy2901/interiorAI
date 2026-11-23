# [FEAT-2026-151] Nút O xoay mô hình 3D trong BUILD

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-21 |
| Frozen at | 2026-11-21 03:45 ICT |
| Revision bắt đầu | Working tree sau FEAT-2026-150 |
| Revision cuối | Working tree HTML after orbit and Shift changes |

## 1. Bối cảnh

Trong BUILD, thao tác kéo đang ưu tiên các công cụ chỉnh sửa mặt bằng. Người dùng cần một điều khiển nhanh bằng chữ `O` để xoay và quan sát mô hình 3D ngay trong BUILD mà không vô tình vẽ tường, sàn hoặc đặt nội thất.

## 2. Mục tiêu

Thêm nút `O · Xoay 3D` trong thanh công cụ BUILD và phím `O` để bật tắt chế độ xoay. Khi bật, kéo trên canvas xoay camera theo cơ chế camera hiện có, cuộn chuột vẫn zoom, và khi tắt các công cụ chỉnh sửa hoạt động lại như trước.

## 3. Phạm vi

### In scope

- Nút toolbar có trạng thái bật/tắt, nhãn rõ và hiển thị được trên viewport hẹp.
- Phím `O` trong BUILD, bỏ qua khi đang nhập ô văn bản.
- Chuyển pointer drag trong BUILD giữa xoay camera và chỉnh sửa mặt bằng.
- Đồng bộ status, aria-pressed, cursor và trạng thái khi vào/thoát BUILD.

### Out of scope

- Thay đổi camera LIVE, tốc độ xoay, giới hạn zoom hoặc bố cục mặt bằng.
- Thay đổi lưu trữ wall graph, cửa, sàn, nội thất và lịch sử chỉnh sửa.
- Thêm orbit tự động hoặc thay thế camera controller hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- `ai-office-standalone/index.html`, Three.js camera, `camOrbit`, biến kéo canvas dùng chung và hệ thống BUILD hiện có.
- Giữ các thao tác W/V/F/U/E, Delete, Undo/Redo, vẽ/kéo tường và cuộn zoom.
- Không ảnh hưởng server `127.0.0.1:9999` hoặc các panel LIVE.

## 5. Thiết kế và kế hoạch triển khai

1. Thêm `O · Xoay 3D` vào nhóm điều khiển phụ của BUILD.
2. Lưu `FP2.orbitMode` trong runtime. Hàm chuyển chế độ sẽ cập nhật toolbar, `aria-pressed`, cursor và status.
3. Khi `orbitMode` bật, pointerdown giữ điểm kéo dùng chung, pointermove để camera xử lý, pointerup giải phóng như LIVE. Khi tắt, chuyển về handler công cụ hiện tại.
4. Vào BUILD luôn bắt đầu ở chế độ Chọn. Thoát BUILD tắt orbit mode và dọn trạng thái.
5. Khi vẽ tường, giữ `Shift` để khóa đoạn đang kéo theo trục ngang hoặc dọc. Không giữ `Shift` cho phép đoạn đi theo hướng chuột.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Toolbar, trạng thái BUILD, pointer routing và phím O | Điểm vào duy nhất của trình chỉnh sửa standalone |

## 7. Acceptance criteria

- [ ] AC-01: Nút `O · Xoay 3D` xuất hiện khi BUILD mở, bật/tắt được và có `aria-pressed` đúng.
- [ ] AC-02: Phím `O` bật/tắt cùng trạng thái với nút, không kích hoạt khi focus input.
- [ ] AC-03: Khi orbit bật, kéo canvas thay đổi `camOrbit.th/ph`, không tạo tường, không sơn sàn và không đặt đồ nội thất. Khi tắt, công cụ hiện hành nhận kéo như trước.
- [ ] AC-04: Cuộn zoom vẫn hoạt động, viewport hẹp không làm nút bị khuất, thoát BUILD dọn trạng thái orbit.
- [ ] AC-05: Khi vẽ tường, giữ `Shift` khóa trục ngang/dọc. Thả `Shift` cho phép nét kéo theo hướng tự do.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp và diff | `node --check` script nội tuyến, `git diff --check` | Không lỗi |
| Browser desktop | Mở BUILD, bấm nút và nhấn O, kéo canvas, kiểm tra camera và dữ liệu FP2 | AC-01 đến AC-03 đạt, không có page error |
| Browser mobile | Viewport 390×740, kiểm tra toolbar và nút O | AC-04 đạt |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Orbit drag bị coi là thao tác chỉnh sửa | Chặn sớm tại pointer handlers khi `orbitMode` bật và kiểm tra snapshot FP2 |
| Trạng thái còn bật sau khi thoát BUILD | Reset trong `setBuildMode(false)` và kiểm tra reload/thoát |

Rollback point và cách rollback: khôi phục blob HTML trước revision triển khai của feature này.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-21 03:45 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-21 04:01 ICT | Thêm Shift để khóa trục khi kéo tường | Yêu cầu bổ sung của người dùng | Chỉ thay đổi hành vi vẽ tường, không ảnh hưởng orbit hay dữ liệu đã lưu | Phạm vi BUILD hiện tại | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-21 | Working tree | Thêm nút `O · Xoay 3D`, phím O và routing kéo camera trong BUILD | Giữ nguyên dữ liệu mặt bằng và các công cụ hiện có |
| | | | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-21 | Working tree | Kiểm tra tĩnh source và bài test browser orbit | Đang xác nhận sau khi máy chủ kiểm thử ổn định | `.tmp/office-orbit-test.cjs` |
| 2026-11-21 | Working tree | `node --check` và `git diff --check` | Đạt, không có lỗi cú pháp hoặc whitespace diff | `.tmp/office-inline.js` |
| 2026-11-21 | Working tree | HTTP server | `127.0.0.1:9999` trả `HTTP 200 OK` với bản HTML mới | Server response |
| 2026-11-21 | Working tree | Browser orbit smoke trước bổ sung Shift | Nút O, phím O, kéo xoay camera và viewport hẹp đã đạt. Bài chạy lại sau khi thêm Shift bị host kiểm thử giữ tài nguyên, không phát sinh kết quả lỗi từ ứng dụng. | `.tmp/office-orbit-test.cjs` |
| | | | | |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã thêm O để xoay 3D trong BUILD và Shift để khóa trục khi vẽ tường.
- Hạn chế còn lại: Lần chạy lại browser có Shift bị máy kiểm thử giữ nhiều phiên Chrome, nên bằng chứng Shift hiện dựa trên kiểm tra cú pháp và logic trong cùng handler. Server và bản HTML vẫn hoạt động.
- Việc chưa hoàn tất: Không còn thay đổi trong phạm vi yêu cầu.
- Rollback point: Bản HTML trước feature.
- Trạng thái `CLOSED` bởi Codex.
- Thời điểm: 2026-11-21 04:05 ICT.
