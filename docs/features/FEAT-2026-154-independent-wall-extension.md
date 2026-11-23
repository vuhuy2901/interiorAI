# [FEAT-2026-154] Kéo dài một tường không làm méo tường bên cạnh

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 18:30 ICT |
| Revision bắt đầu | HTML blob `29fc44fa26f29f32c8dd3b8fa760a88af24a889d` |
| Revision cuối | HTML blob `19199b4f6df8730a4aff38d172047be459126c9f` |

## 1. Bối cảnh

Hai đoạn tường gặp nhau ở góc đang dùng chung một wall node. Khi người dùng kéo endpoint của một đoạn để nối dài tới hành lang, editor di chuyển node chung nên endpoint của tường cạnh bên cũng di chuyển và đoạn đó bị kéo chéo.

## 2. Mục tiêu

- Kéo endpoint chỉ thay đổi đoạn tường đang chọn.
- Nếu endpoint đang được dùng chung, editor tự tách một node riêng cho đoạn đang kéo khi thao tác thực sự bắt đầu.
- Kéo midpoint cũng di chuyển riêng đoạn đang chọn, không kéo theo các tường nối cạnh bên.
- Undo khôi phục đầy đủ node chung và hình học trước thao tác.

## 3. Phạm vi

### In scope

- Topology của wall node khi kéo endpoint hoặc midpoint trong BUILD.
- Gesture, Undo/Redo, save/restore và mesh rebuild liên quan trực tiếp.
- Kiểm thử hai đoạn tường vuông góc dùng chung một điểm.

### Out of scope

- Tự nối lại khe hở sau khi người dùng chủ động kéo đoạn tường ra khỏi góc.
- Thay hành vi khi vẽ tường mới hoặc khi kéo tường không có node chung.
- Tự sửa các mặt bằng cũ ngoài thao tác kéo mới.

## 4. Dependency và tài nguyên cần bảo vệ

- `FP2.wallNodes`, `FP2.walls`, bộ đếm `WG._nid`, Undo/Redo và localStorage.
- Không thay dữ liệu cửa, sàn, nội thất hoặc tường không tham gia gesture.
- Giữ khóa Shift và ngưỡng chống rung của FEAT-2026-153.
- Server cổng 5000 tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Khi move gesture vượt ngưỡng 5 px, kiểm tra từng endpoint của tường đang kéo.
2. Nếu endpoint còn được một tường khác dùng, tạo node mới tại cùng tọa độ và đổi endpoint chỉ trên tường đang chọn.
3. Cập nhật danh sách node của gesture sang node mới trước khi áp dụng delta.
4. Không tách node khi chỉ click, khi gesture bị hủy hoặc khi endpoint không dùng chung.
5. Dùng snapshot hiện hữu để Undo/Redo khôi phục topology và bộ đếm ID.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Wall move topology | Tách node dùng chung khi kéo riêng một đoạn |

## 7. Acceptance criteria

- [x] AC-01: Với hai tường vuông góc dùng chung node, kéo endpoint của tường A chỉ đổi tường A; mọi node của tường B giữ nguyên.
- [x] AC-02: Kéo midpoint của tường A chỉ di chuyển tường A; tường B không bị kéo theo.
- [x] AC-03: Click handle không kéo không tạo node mới và không thay bộ đếm/history.
- [x] AC-04: Shift vẫn giữ đoạn tường ngang/dọc thẳng sau khi node được tách.
- [x] AC-05: Undo trả lại đúng node chung; Redo áp dụng lại topology đã tách.
- [x] AC-06: Không có page error mới, kiểm thử BUILD cũ vẫn đạt và cổng 5000 trả HTTP 200.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit/browser state | Tạo hai tường chữ L dùng node chung, kéo endpoint và midpoint | AC-01, AC-02 |
| Click/Shift | Click handle; kéo endpoint với Shift | AC-03, AC-04 |
| History | Undo rồi Redo sau thao tác | AC-05 |
| Regression | Chạy bộ test BUILD và handle hiện hữu | AC-06 |
| Static/server | Parse inline JS, `git diff --check`, HTTP HEAD | Không lỗi, 200 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Node rác khi gesture không đổi | Chỉ tách sau khi vượt ngưỡng kéo; snapshot khôi phục khi hủy |
| Mất liên kết ngoài ý muốn | Chỉ đổi `startId`/`endId` của đúng wall đang kéo |
| Bộ đếm ID sai sau Undo | `WG.toJSON/fromJSON` đã lưu `_nid`; kiểm thử Undo/Redo |

Rollback point và cách rollback: khôi phục HTML blob `29fc44fa26f29f32c8dd3b8fa760a88af24a889d`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-22 18:30 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 18:31 ICT | HTML working tree | Thêm bước tách shared node khi move gesture bắt đầu có delta | Chỉ đổi endpoint của wall đang kéo |
| 2026-11-22 18:31 ICT | HTML working tree | Hỗ trợ cả endpoint và midpoint | Tường liền kề giữ nguyên topology và tọa độ |
| 2026-11-22 18:32 ICT | HTML working tree | Khôi phục snapshot nếu gesture tách node nhưng quay về delta 0 | Tránh node rác |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-22 18:33 ICT | `19199b4f6df8730a4aff38d172047be459126c9f` | Browser test với hai tường chữ L dùng node chung | PASS | Endpoint và midpoint tách riêng wall đang kéo; tường cạnh giữ nguyên; click không kéo không tách node |
| 2026-11-22 18:33 ICT | `19199b4f6df8730a4aff38d172047be459126c9f` | Undo/Redo và Shift | PASS | Undo ghép lại node chung và `_nid`; Redo tách lại; Shift giữ tường thẳng |
| 2026-11-22 18:34 ICT | `19199b4f6df8730a4aff38d172047be459126c9f` | Regression BUILD | PASS | Hold-O orbit, Shift vẽ tường, kéo tự do và sàn nâu vẫn đạt; không có page error |
| 2026-11-22 18:34 ICT | `19199b4f6df8730a4aff38d172047be459126c9f` | Parse inline JS, `git diff --check`, HTTP HEAD | PASS | Không lỗi cú pháp/diff; cổng 5000 trả 200 |

## 14. Kết quả và đóng chức năng

- Kết quả: Kéo dài hoặc di chuyển một đoạn tường không còn kéo méo tường cạnh bên dùng chung điểm góc.
- Hạn chế còn lại: Khi kéo tách khỏi góc, editor giữ khe hở đúng theo vị trí người dùng chọn và không tự tạo đoạn nối mới.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: HTML blob `29fc44fa26f29f32c8dd3b8fa760a88af24a889d`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-22 18:34 ICT.
