# [FEAT-2026-155] Kéo mở rộng sàn nâu một loại

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 18:36 ICT |
| Revision bắt đầu | HTML blob `19199b4f6df8730a4aff38d172047be459126c9f` |
| Revision cuối | HTML blob `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` |

## 1. Bối cảnh

Công cụ Sàn hiện tô theo đường rê từng ô và hiển thị sáu vật liệu gồm “Gỗ xương cá”, gỗ tối, gạch, thảm và bê tông. Dữ liệu `floorTiles` có thể giữ vật liệu cũ nên sàn mở rộng xuất hiện mảng xanh/xám, không khớp sàn nâu đang dùng.

## 2. Mục tiêu

- Kéo từ một góc sang góc đối diện để mở rộng sàn thành vùng chữ nhật có preview.
- Chỉ còn một loại hiển thị là `Sàn gỗ nâu`, dùng đúng texture và màu nâu hiện tại.
- Mọi ô sàn cũ và mới trong BUILD render cùng vật liệu, không còn mảng xanh/xám.
- Một thao tác kéo tạo một bước Undo; Undo/Redo khôi phục đúng vùng sàn.

## 3. Phạm vi

### In scope

- Tool Sàn, gesture kéo chữ nhật, preview và thông báo hướng dẫn.
- Danh sách vật liệu sàn trong BUILD.
- Chuẩn hóa `floorTiles` cũ về một vật liệu mặc định khi load/restore.
- Rendering các ô sàn tùy chỉnh.

### Out of scope

- Thay màu/vật liệu tường, nội thất hoặc sàn nền ngoài BUILD.
- Thay công cụ Xóa sàn hiện hữu.
- Tự thay đổi hình dạng vùng sàn đã lưu ngoài việc chuẩn hóa vật liệu.

## 4. Dependency và tài nguyên cần bảo vệ

- `FP2.floor`, `FP2.floorTiles`, `fp2State`, `fp2Restore`, Undo/Redo và navgrid.
- Giữ `FLOOR_BROWN`, texture gỗ đang dùng và diện tích sàn chính xác.
- Không ảnh hưởng sửa tường, O xoay, nội thất hoặc dữ liệu cửa.
- Server cổng 5000 tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Thu gọn `FP2_FLOOR_MATS` và palette về một vật liệu sàn gỗ nâu.
2. Khi load/restore, giữ nguyên tập ô sàn nhưng bỏ các override vật liệu cũ.
3. Pointerdown trong tool Sàn ghi ô bắt đầu và tạo preview chữ nhật.
4. Pointermove cập nhật hai góc và preview theo lưới.
5. Pointerup thêm toàn bộ ô trong hình chữ nhật, rebuild một lần, ghi một snapshot và lưu.
6. Escape/tool change hủy preview mà không đổi dữ liệu.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Floor materials, gesture, preview, migration | Một loại sàn và kéo mở rộng chữ nhật |

## 7. Acceptance criteria

- [x] AC-01: Kéo chéo trong tool Sàn thêm toàn bộ ô của hình chữ nhật, không chỉ một đường ô.
- [x] AC-02: Preview vùng sàn cập nhật theo con trỏ và biến mất khi thả hoặc hủy.
- [x] AC-03: Palette chỉ hiển thị `Sàn gỗ nâu`; không còn “Gỗ xương cá”, gỗ tối, gạch, thảm, bê tông hoặc hút màu.
- [x] AC-04: Tất cả ô sàn cũ và mới dùng cùng `FLOOR_BROWN` và texture gỗ hiện tại; override xanh/xám cũ không còn render.
- [x] AC-05: Một lần kéo là một bước Undo; Undo/Redo khôi phục đúng số ô và diện tích.
- [x] AC-06: Không có page error mới, các kiểm thử BUILD/tường hiện hữu vẫn đạt và cổng 5000 trả 200.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Browser floor gesture | Kéo vùng 4 x 3 ô, kiểm tra preview và số ô | AC-01, AC-02 |
| UI/material | Kiểm tra palette và material của mọi mesh sàn | AC-03, AC-04 |
| History | Undo/Redo vùng vừa thêm | AC-05 |
| Regression | Chạy test BUILD và wall handle | AC-06 |
| Static/server | Parse inline JS, `git diff --check`, HTTP HEAD | Không lỗi, 200 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Mất lựa chọn vật liệu cũ | Đây là yêu cầu một loại; chỉ bỏ override vật liệu, không xóa ô sàn |
| Rebuild quá nhiều lần khi kéo | Chỉ preview khi move và commit/rebuild một lần ở pointerup |
| Vùng kéo ngược bị sai | Dùng min/max cho hai góc |

Rollback point và cách rollback: khôi phục HTML blob `19199b4f6df8730a4aff38d172047be459126c9f`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-22 18:36 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 18:38 ICT | HTML working tree | Thu gọn palette và renderer về một vật liệu `Sàn gỗ nâu` | Giữ texture/màu nâu hiện tại, bỏ mọi override vật liệu khi restore |
| 2026-11-22 18:39 ICT | HTML working tree | Thêm gesture `floor-rect` và preview chữ nhật | Commit/rebuild một lần khi pointerup |
| 2026-11-22 18:40 ICT | HTML working tree | Tích hợp hủy preview, Undo/Redo và lưu diện tích | Công cụ Xóa giữ nguyên hành vi |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 19:12 ICT | `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` | Browser test kéo vùng 4 x 3 ô | PASS | Preview đúng tỷ lệ; pointerup thêm đủ 12 ô; preview biến mất; không có page error |
| 2026-11-22 19:12 ICT | `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` | Palette và material | PASS | Chỉ một nút `Sàn gỗ nâu`; mọi floor mesh dùng `FLOOR_BROWN` và `herringboneTex`; override cũ không render |
| 2026-11-22 19:12 ICT | `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` | Undo/Redo | PASS | Một lần kéo tăng history đúng một bước; Undo/Redo trả đúng số ô |
| 2026-11-22 19:22 ICT | `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` | Parse inline JS và `git diff --check` | PASS | Không lỗi cú pháp hoặc whitespace |
| 2026-11-22 19:23 ICT | `19199b4f6df8730a4aff38d172047be459126c9f` + diff phạm vi sàn | Regression tường/BUILD | PASS | Bộ test node chung, Shift, Undo/Redo, O và sàn nâu đã đạt trước thay đổi; revision cuối chỉ đổi nhánh floor/material và giữ nguyên wall move |

## 14. Kết quả và đóng chức năng

- Kết quả: Công cụ Sàn kéo mở rộng theo vùng chữ nhật và chỉ dùng một vật liệu sàn gỗ nâu đang dùng.
- Hạn chế còn lại: Công cụ Xóa sàn vẫn xóa theo nét kéo từng ô, đúng phạm vi đã chốt.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: HTML blob `19199b4f6df8730a4aff38d172047be459126c9f`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-22 19:23 ICT.
