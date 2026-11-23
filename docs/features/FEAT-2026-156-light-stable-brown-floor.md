# [FEAT-2026-156] Sàn nâu ổn định dưới mọi ánh sáng

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng kèm ảnh lỗi |
| Ngày tạo | 2026-11-22 |
| Frozen at | 2026-11-22 21:46 ICT |
| Revision bắt đầu | HTML blob `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4` |
| Revision cuối | HTML blob `c041e1d409af3a684db63b365d688226b64b5850` |

## 1. Bối cảnh

Ảnh lỗi cho thấy cùng vật liệu `FLOOR_BROWN` nhưng sàn ngoài nắng bị bạc trắng/xanh, phòng bên trái xám lạnh, phòng giữa vàng sáng và phòng bên phải nâu đen. Cả sàn nền lẫn sàn BUILD đang dùng `MeshStandardMaterial` và nhận bóng nên màu bị phụ thuộc mạnh vào đèn, fill light và shadow.

## 2. Mục tiêu

- Sàn nền và sàn mở rộng trong BUILD giữ cùng một tông nâu ở mọi phòng và ngoài vùng có tường.
- Giữ texture gỗ đang dùng nhưng loại bỏ biến màu do ánh sáng/bóng đổ.
- Không thay ánh sáng của tường, nội thất hoặc toàn cảnh.
- Không làm mất texture sau nhiều lần rebuild sàn.

## 3. Phạm vi

### In scope

- Material của `customFloor` và `fp2GetFloorMat`.
- Cờ nhận bóng trên mesh sàn.
- Vòng dispose material/texture của `FP2.group` để bảo vệ texture gỗ dùng chung.

### Out of scope

- Thay hệ thống đèn, tone mapping hoặc màu tường/nội thất.
- Thay hình dạng, diện tích, gesture kéo sàn hay dữ liệu mặt bằng.
- Loại bỏ vân gỗ hiện tại.

## 4. Dependency và tài nguyên cần bảo vệ

- `herringboneTex`, `FLOOR_BROWN`, base floors, FP2 floors và BUILD history.
- Giữ một loại `Sàn gỗ nâu` và gesture kéo chữ nhật của FEAT-2026-155.
- Giữ sửa tường độc lập của FEAT-2026-154.
- Server cổng 5000 tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Dùng `MeshBasicMaterial` cho các mặt sàn nâu để màu/texture không phụ thuộc light direction hoặc shadow.
2. Tắt `receiveShadow` riêng trên các mesh sàn.
3. Giữ tên material `floor` và cùng texture/color để kiểm thử nhận diện.
4. Không dispose texture gỗ dùng chung khi FP2 rebuild; chỉ dispose geometry/material cục bộ.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Floor material và resource lifecycle | Đồng nhất màu thị giác, tránh mất texture |

## 7. Acceptance criteria

- [ ] AC-01: Base floor của mọi phòng và hành lang dùng material không phụ thuộc ánh sáng, cùng `FLOOR_BROWN` và texture gỗ.
- [ ] AC-02: Mọi floor mesh của BUILD dùng cùng material không phụ thuộc ánh sáng; vùng kéo ngoài phòng không còn trắng/xanh.
- [ ] AC-03: Floor mesh không nhận shadow; tường và nội thất vẫn giữ shading hiện hữu.
- [x] AC-04: Rebuild sàn nhiều lần không dispose hoặc làm mất `herringboneTex` dùng chung.
- [x] AC-05: Kéo sàn chữ nhật, Undo/Redo và sửa tường độc lập vẫn hoạt động.
- [x] AC-06: Không có page error mới, cú pháp/diff sạch và cổng 5000 trả HTTP 200.

> AC-01 đến AC-03 được CR-001 supersede và không còn là tiêu chí áp dụng cho version 1.1.

- [x] AC-01R: Base floor và sàn BUILD dùng cùng một `MeshStandardMaterial` nâu có texture, roughness và phản ứng ánh sáng.
- [x] AC-02R: Sàn BUILD dùng một mesh liền với các quad chạm cạnh, không còn khe `CS-0.02` tạo lưới.
- [x] AC-03R: UV liên tục theo tọa độ thế giới; floor mesh nhận ánh sáng và bóng.
- [x] AC-04R: Rebuild nhiều lần không dispose texture gỗ dùng chung.
- [x] AC-05R: Gesture kéo chữ nhật, Undo/Redo và sửa tường độc lập vẫn hoạt động.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Material inspection | Kiểm tra type/color/map/receiveShadow của base và FP2 floors | AC-01 đến AC-03 |
| Rebuild stress | Gọi rebuild nhiều lần rồi kiểm tra texture và renderer | AC-04 |
| Browser regression | Kéo sàn, Undo/Redo và wall shared-node test | AC-05 |
| Visual | Chụp BUILD với vùng sàn trong/ngoài phòng | Không còn mảng trắng/xanh do ánh sáng |
| Static/server | Parse inline JS, `git diff --check`, HTTP HEAD | AC-06 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Sàn mất bóng làm cảnh phẳng hơn | Chỉ đổi mặt sàn; tường/nội thất vẫn đổ bóng tạo chiều sâu |
| Texture dùng chung bị giải phóng | Không dispose material map trong vòng rebuild FP2 |
| Material test cũ phụ thuộc StandardMaterial | Giữ `name='floor'`, color và map ổn định |

Rollback point và cách rollback: khôi phục HTML blob `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-22 21:46 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-23 10:55 ICT | Thay material không nhận sáng bằng material giống sàn cũ có ánh sáng/bóng; thêm mesh sàn liền không khe ô | Người dùng làm rõ ưu tiên: sàn mới phải phẳng như sàn cũ, không lưới, màu đẹp và có ánh đèn đầy đủ | Supersede thiết kế bước 1-2 và AC-01 đến AC-03; giữ mục tiêu một vật liệu và bảo vệ texture | Yêu cầu trực tiếp kèm ảnh | 1.1 |

### CR-001 — Acceptance delta

- AC-01R: Base floor và sàn BUILD dùng cùng một `MeshStandardMaterial` nâu có texture, roughness và phản ứng ánh sáng.
- AC-02R: Sàn BUILD được render bằng một mesh liền với các quad chạm cạnh, không dùng `CS-0.02` tạo khe lưới.
- AC-03R: UV của sàn BUILD liên tục theo tọa độ thế giới để vân gỗ không ngắt thành từng ô; floor mesh nhận ánh sáng và bóng.
- AC-04R: Rebuild nhiều lần không dispose texture gỗ dùng chung.
- AC-05R: Gesture kéo chữ nhật, Undo/Redo và sửa tường độc lập vẫn hoạt động.

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-22 21:49 ICT | HTML working tree | Thử material không nhận sáng và bảo vệ texture dùng chung | Bị CR-001 supersede trước khi đóng |
| 2026-11-23 11:08 ICT | HTML working tree | Khôi phục material nhận sáng/bóng dùng chung cho base và BUILD | Cùng color, texture, roughness, metalness và emissive nhẹ |
| 2026-11-23 11:10 ICT | HTML working tree | Thay từng PlaneGeometry có khe bằng một BufferGeometry liền | Mỗi cell là quad chạm cạnh, UV liên tục theo tọa độ thế giới |
| 2026-11-23 11:11 ICT | HTML working tree | Bảo vệ texture dùng chung trong vòng dispose | Chỉ dispose material/geometry cục bộ |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-23 11:14 ICT | `c041e1d409af3a684db63b365d688226b64b5850` | Browser floor test | PASS | Kéo vùng chữ nhật, một mesh liền, số index bằng `cellCount*6`, material Standard nhận shadow, Undo/Redo đúng |
| 2026-11-23 11:14 ICT | `c041e1d409af3a684db63b365d688226b64b5850` | Rebuild stress | PASS | Rebuild ba lần, `herringboneTex` không phát sự kiện dispose, map/color còn nguyên |
| 2026-11-23 11:20 ICT | `c041e1d409af3a684db63b365d688226b64b5850` | Wall và BUILD regression | PASS | Shared-node wall, Shift, Undo/Redo, Hold-O và free wall đều đạt |
| 2026-11-23 11:22 ICT | `c041e1d409af3a684db63b365d688226b64b5850` | Parse JS, diff và HTTP | PASS | Cú pháp/diff sạch; cổng 5000 trả HTTP 200 |

## 14. Kết quả và đóng chức năng

- Kết quả: Sàn kéo mới là mặt liền không khe lưới, dùng cùng vật liệu nâu có ánh sáng/bóng và vân gỗ liên tục như sàn cũ.
- Hạn chế còn lại: Cường độ sáng vẫn thay đổi tự nhiên theo vị trí đèn và bóng, nhưng không còn đường lưới xanh do khe giữa các ô.
- Việc chưa hoàn tất: Không có trong phạm vi version 1.1.
- Rollback point: HTML blob `33ec2aa7eb1160eb5f08482d49bca8c47a33b7a4`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-23 11:22 ICT.
