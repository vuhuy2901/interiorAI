# [FEAT-2026-157] Tự động thêm đèn ấm cho sàn mở rộng

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.3 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-23 |
| Frozen at | 2026-11-23 11:43 ICT |
| Revision bắt đầu | HTML blob `c041e1d409af3a684db63b365d688226b64b5850` |
| Revision cuối | HTML blob `25c1067d8cabfd1baa833374578fe35ee80f1fff` |

## 1. Bối cảnh

Sàn kéo mở rộng đã thành mặt liền nhưng vùng mới nằm ngoài hệ đèn cố định của văn phòng cũ nên thiếu ánh sáng ấm. Người dùng cần vùng sàn mới tự có ánh đèn đẹp giống không khí văn phòng hiện hữu.

## 2. Mục tiêu

- Tự phân bố đèn ấm trên các ô sàn do người dùng thêm ngoài footprint sàn mặc định.
- Đèn tự cập nhật khi kéo thêm sàn, Undo/Redo, xóa hoặc khôi phục dữ liệu.
- Giữ hiệu năng bằng đèn không cast shadow và giới hạn số lượng.
- Nguồn sáng hoàn toàn ẩn; chỉ thấy quầng vàng ấm mềm trên bề mặt, không có chấm hay mô hình đèn trần.

## 3. Phạm vi

### In scope

- Nhận diện ô sàn mặc định và ô sàn mở rộng.
- Nhóm ô mở rộng theo vùng 4–5 m và tạo warm point light tại tâm vùng.
- Nguồn PointLight ẩn, lớp quầng sáng trong suốt sát mặt sàn và lifecycle rebuild sạch.
- Kiểm thử ánh sáng tự sinh, mật độ, màu, Undo/Redo và clear.

### Out of scope

- Thay hệ đèn thủ công của văn phòng cũ.
- Đèn cast shadow hoặc bake lightmap.
- Công cụ chỉnh vị trí/cường độ từng đèn bằng tay.
- Tự sinh trần hoặc dây điện cho vùng sàn mới.

## 4. Dependency và tài nguyên cần bảo vệ

- `FP2.floor`, seed footprint, `fp2Apply`, Undo/Redo và `FP2.group` hiện hữu.
- Không thay vật liệu sàn liền, UV, màu tường/nội thất hoặc wall graph.
- Không tăng số shadow-casting lights.
- Server cổng 5000 tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Đưa danh sách segment sàn mặc định thành hằng dùng chung và cung cấp hàm nhận diện base cell.
2. Tạo `FP2.floorLightGroup` độc lập trong scene.
3. Với các floor cell không thuộc base footprint, gom bucket 8×8 cell, lấy centroid và tạo PointLight màu vàng ấm.
4. Giới hạn tối đa 24 đèn, không cast shadow, không tạo fixture; dùng lớp gradient trong suốt sát sàn để quầng vàng vẫn rõ dưới ánh sáng ban ngày.
5. Rebuild nhóm đèn trong `fp2Apply` sau mọi thay đổi floor.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Floor seed, dynamic light group, rebuild lifecycle | Tự chiếu sáng vùng sàn mở rộng |

## 7. Acceptance criteria

- [x] AC-01: Sàn mặc định không tạo thêm dynamic light; chỉ ô sàn được thêm mới tham gia.
- [x] AC-02: Mỗi bucket 8×8 cell của vùng mở rộng tạo tối đa một đèn ấm tại centroid.
- [x] AC-03: Dynamic lights dùng màu ấm, khoảng chiếu phù hợp, `castShadow=false` và tổng số không quá 24.
- [x] AC-04: Không có fixture/chấm đèn trần; chỉ có lớp gradient vàng trong suốt sát mặt sàn và rebuild dọn sạch nguồn cũ.
- [x] AC-05: Kéo sàn tạo đèn; Undo/xóa loại đèn; Redo/restore tạo lại đúng.
- [x] AC-06: Sàn liền, sửa tường, O/Shift và server cổng 5000 không bị ảnh hưởng.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Browser state | Seed mặc định, thêm vùng 12×20 cell và kiểm tra group | AC-01 đến AC-04 |
| History | Kéo, Undo, Redo và clear trong test isolated | AC-05 |
| Visual | Chụp vùng sàn mở rộng có ánh vàng ấm | Có quầng sáng ấm, không có chấm/fixture đèn |
| Regression | Floor drag, wall handle và BUILD inputs | AC-06 |
| Static/server | Parse JS, `git diff --check`, HTTP HEAD | Không lỗi, 200 |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Quá nhiều PointLight làm chậm WebGL | Bucket 8×8 cell, tối đa 24, không cast shadow |
| Đèn trùng văn phòng cũ | Loại toàn bộ base footprint khỏi nguồn sinh đèn |
| Chấm đèn gây hiểu nhầm là đèn trần | Không tạo geometry/mesh; chỉ giữ nguồn sáng ẩn |

Rollback point và cách rollback: khôi phục HTML blob `c041e1d409af3a684db63b365d688226b64b5850`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex.
- Thời điểm: 2026-11-23 11:43 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-23 11:51 ICT | Giảm cường độ và bán kính đèn tự động | Visual QA trên dữ liệu thật cho thấy các vùng đèn chồng nhau làm sàn nâu bị ngả trắng | Chỉ tinh chỉnh PointLight và kỳ vọng test; giữ nguyên mật độ, màu ấm, fixture, Undo/Redo | Yêu cầu trước đó của người dùng phải giữ cùng màu sàn nâu và yêu cầu hiện tại về ánh sáng ấm | 1.1 |
| CR-002 | 2026-11-23 12:00 ICT | Bỏ toàn bộ fixture/chấm đèn nhìn thấy và tăng sắc vàng ấm của nguồn sáng ẩn | Người dùng chỉ muốn quầng ánh sáng như phòng cũ, không muốn mô hình đèn trần | Bỏ InstancedMesh fixture; giữ PointLight ẩn, mật độ, giới hạn 24 và Undo/Redo; cập nhật kiểm thử | Phản hồi trực tiếp của người dùng kèm ảnh | 1.2 |
| CR-003 | 2026-11-23 12:05 ICT | Thêm lớp quầng vàng gradient trong suốt sát mặt sàn | PointLight ẩn đúng yêu cầu nhưng bị ánh sáng ban ngày lấn, quầng chưa rõ như phòng cũ | Thêm glow plane không có hình bóng đèn/chấm trắng; giữ nguồn sáng ẩn và giới hạn 24 | Visual QA trên đúng dữ liệu mặt bằng của người dùng | 1.3 |

Hợp đồng được mở lại và đóng băng ở phiên bản 1.3 trước khi thực hiện CR-003.

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-23 11:45 ICT | Working tree | Thêm base-floor classifier và `FP2.floorLightGroup` | Không thay hệ đèn văn phòng cũ |
| 2026-11-23 11:46 ICT | Working tree | Gom sàn mở rộng theo bucket 8×8 cell, sinh PointLight và downlight emissive | Tối đa 24 đèn, không cast shadow |
| 2026-11-23 11:48 ICT | Working tree | Bổ sung kiểm thử tự sinh đèn và Undo/Redo | Giữ nguyên kiểm thử sàn liền và vật liệu nâu |
| 2026-11-23 11:51 ICT | Working tree | Thực hiện CR-001: giảm cường độ từ 0.9 xuống 0.38 và bán kính từ 7.5 m xuống 5 m | Giảm cộng sáng giữa các vùng, giữ sàn nâu và ánh ấm nhẹ |
| 2026-11-23 12:00 ICT | Working tree | Thực hiện CR-002: bỏ Cylinder/InstancedMesh fixture, đổi sang PointLight ẩn màu vàng cam | Không còn chấm/mô hình đèn trần |
| 2026-11-23 13:00 ICT | Working tree | Thực hiện CR-003: thêm gradient glow trong suốt sát sàn | Quầng vàng rõ dưới ánh sáng ban ngày mà không tạo bóng đèn |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-23 11:48 ICT | HTML blob `9e24006d7947475725ca0bcd82199be97aadf7ba` | Floor drag + auto warm lights + Undo/Redo | PASS | `.tmp/office-floor-drag-test.cjs` |
| 2026-11-23 11:48 ICT | Cùng revision | Wall handles + Shift + Undo/Redo | PASS | `.tmp/office-wall-handle-test.cjs` |
| 2026-11-23 11:48 ICT | Cùng revision | Hold-O orbit + Shift + brown floor | PASS | `.tmp/office-build-inputs-test.cjs` |
| 2026-11-23 11:49 ICT | Cùng revision | Visual screenshot | PASS | `.tmp/office-browser/port-5000-floor-drag.png` |
| 2026-11-23 11:49 ICT | Cùng revision | `git diff --check` và HTTP HEAD cổng 5000 | PASS | Không lỗi khoảng trắng; HTTP 200 |
| 2026-11-23 11:52 ICT | HTML blob `f8a4d38c4326d660b3a94f505a56ed7e3e9cc571` | CR-001 floor light + Undo/Redo | PASS | Auto light intensity 0.38, distance 5 m; sàn liền và màu nâu ổn định |
| 2026-11-23 11:52 ICT | Cùng revision | Regression wall handles và BUILD inputs | PASS | Shift, giữ O, tường độc lập, Undo/Redo đều đạt |
| 2026-11-23 11:52 ICT | Cùng revision | `git diff --check` và HTTP HEAD cổng 5000 | PASS | Không lỗi khoảng trắng; HTTP 200 |
| 2026-11-23 13:01 ICT | HTML blob `25c1067d8cabfd1baa833374578fe35ee80f1fff` | Floor drag + nguồn sáng ẩn + glow + Undo/Redo | PASS | 0 fixture mesh; một glow InstancedMesh trong suốt; tối đa 24 nguồn |
| 2026-11-23 13:01 ICT | Cùng revision | Visual trên dữ liệu mặt bằng thật | PASS | Không còn chấm trắng; quầng vàng cam mềm hiện rõ trên sàn mới |
| 2026-11-23 13:02 ICT | Cùng revision | Wall handles và BUILD inputs | PASS | Shift, giữ O, tường độc lập, Undo/Redo đều đạt |
| 2026-11-23 13:02 ICT | Cùng revision | `git diff --check` và HTTP HEAD cổng 5000 | PASS | Không lỗi khoảng trắng; HTTP 200 |

## 14. Kết quả và đóng chức năng

- Kết quả: Sàn mở rộng tự có quầng ánh sáng vàng ấm từ nguồn ẩn; không còn chấm trắng hay mô hình đèn trần; hiệu ứng tự đồng bộ khi thêm, xóa, Undo, Redo hoặc restore.
- Hạn chế còn lại: Tối đa 24 vùng sáng tự động và không cast shadow để bảo vệ hiệu năng; chưa có điều khiển thủ công từng vùng.
- Việc chưa hoàn tất: Không có trong phạm vi hợp đồng.
- Rollback point: HTML blob `c041e1d409af3a684db63b365d688226b64b5850`.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-23 13:02 ICT.
