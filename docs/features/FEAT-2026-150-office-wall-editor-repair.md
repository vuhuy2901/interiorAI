# [FEAT-2026-150] Khôi phục trình chỉnh sửa tường và cửa văn phòng

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.1 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu chỉnh sửa trực tiếp của người dùng |
| Ngày tạo | 2026-11-21 |
| Frozen at | 2026-11-21 00:54 ICT |
| Revision bắt đầu | HEAD `7bdd862a909994e3d7cfad0f045629eb92156f8d`, blob hiện hành của HTML `959550f522ddaadf0b10ce89fbb8a2ce6cc9dfd7` |
| Revision cuối | Working tree tại HEAD `7bdd862a909994e3d7cfad0f045629eb92156f8d`, blob HTML `8fcabfd382199b905789f8aea9a006ac231dda83` |

## 1. Bối cảnh

Bản văn phòng standalone dùng đồ thị tường và dữ liệu lưu cục bộ. Cửa cũ có thể vượt kích thước tường, jamb cửa sổ dùng sai mốc cao độ và khung cửa không có mã tường để raycast chọn đúng. Các bộ xử lý FP2 và BUILD trùng nhau, nên công cụ, lịch sử và trạng thái hiển thị có thể lệch. Công cụ xóa hiện ưu tiên ô sàn.

## 2. Mục tiêu

Đặt cửa vừa tường, khôi phục thao tác xóa tường qua nút, phím và công cụ xóa, đồng thời làm mới giao diện tùy chỉnh văn phòng để dễ chọn, sửa và kiểm tra kết quả.

## 3. Phạm vi

- **In scope:** Kích thước và hình học cửa gỗ, cửa kính trượt, cửa sổ mới và đã lưu trong các phiên bản FP2 đang hỗ trợ. Chọn, kéo chỉnh, vẽ và xóa tường đồ thị, dọn cửa gắn với tường và cập nhật lịch sử/lưu trữ. Thanh công cụ, bảng vật liệu bên trái, thuộc tính tường, trạng thái và các phím liên quan trong BUILD.
- **Out of scope:** Bố cục mặc định mới, thiết kế lại mô phỏng LIVE, thay thư viện 3D, thay kiến trúc phát hiện phòng/pathfinding, thay đổi backend hoặc cách triển khai. Giữ chức năng chỉnh sàn và nội thất hiện có.

## 4. Dependency và tài nguyên cần bảo vệ

- HTML standalone, Three.js hiện hữu, camera và raycasting của FP2.
- Giữ khóa và schema localStorage đang dùng, giữ mặt bằng đã lưu và thay đổi chưa commit. Kiểm thử xóa trên dữ liệu trình duyệt riêng.
- Kiểm chứng ứng dụng standalone tại `127.0.0.1:9999` khi có thể, giữ các dịch vụ khác.

## 5. Thiết kế và kế hoạch triển khai

1. Dùng mặc định cửa gỗ và kính trượt cao 2,00 m, cửa đi sát sàn. Giới hạn cả khung trong chiều cao và chiều dài tường. Áp dụng khi dựng bản đã lưu và khi đặt mới, giữ loại cửa và kích thước thấp hợp lệ. Chặn đặt mới đè lên cửa hiện có.
2. Gắn mã tường lên mọi phần nhìn thấy của tường và cửa. Dùng một đường xóa chung, hoàn tác/làm lại một lần mỗi lệnh và dùng trạng thái đã lưu khi tải lại. Các công cụ BUILD cùng dùng một cơ chế chọn, trạng thái và phím tắt. Giữ xóa sàn khi bắt đầu nét xóa ở sàn.
3. Giữ mặt bằng 3D là nội dung chính, dùng giao diện tối đồng nhất với điểm nhấn xanh ngọc, bố cục gọn, bảng thuộc tính theo ngữ cảnh và điều khiển có nhãn tiếng Việt, trạng thái focus rõ, bố cục viewport hẹp.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Đồ thị tường, lưu/lịch sử, sự kiện FP2 và giao diện BUILD | Sửa lỗi qua điểm vào thực tế |
| Kiểm thử Node cục bộ nếu cần | Bài kiểm thử hồi quy hoặc kịch bản kiểm chứng riêng | Đo kích thước và thao tác dữ liệu |

## 7. Acceptance criteria

- [x] AC-01. Cửa đi mới và cửa quá cao đã lưu nằm sát sàn, cao tối đa 2,00 m và khung nằm trong tường. Cửa sổ giữ khoảng bậu hợp lệ, khung không có phần dư. Tường ngắn và lần đặt chồng được xử lý an toàn.
- [x] AC-02. Có thể chọn tường qua thân hoặc cửa. Xóa qua nút thuộc tính, Delete hoặc công cụ Xóa loại bỏ đúng một đoạn cùng cửa gắn trên nó. Mặt bằng giữ kết quả sau tải lại, một lần hoàn tác/làm lại khôi phục/thực thi lại đúng một thao tác.
- [x] AC-03. Công cụ và trạng thái đồng bộ giữa nút và phím. Giao diện BUILD có nhãn rõ, bảng thuộc tính hữu dụng và bố cục gọn ở cửa sổ hẹp. Thoát BUILD đóng các điều khiển chỉnh sửa.
- [x] AC-04. Vẽ/kéo tường đồ thị và chỉnh sửa sàn/nội thất vẫn dùng được. Mặt bằng trống đã lưu không tự tạo lại tường.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Cú pháp và diff | `node --check` trên script nội tuyến, `git diff --check` có phạm vi | Không lỗi mới |
| Kích thước và lưu trữ | Fixture phiên bản đang hỗ trợ, kiểm tra mesh và vòng lưu/đọc | Giới hạn đúng, bảo toàn dữ liệu hợp lệ |
| Browser | Chạy standalone ở cổng 9999, dùng BUILD, chuột, phím và tải lại trên dữ liệu kiểm thử | AC-02 đến AC-04, kiểm tra desktop và hẹp, không có exception do thay đổi |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Mất thay đổi chưa commit do sửa chung file | Dùng bản sao HTML trước khi sửa và chỉ đảo phần thay đổi của hợp đồng |
| Tường cùng chung nút hoặc có nhiều cửa | Xóa theo ID và giữ nút còn được tường khác dùng, kiểm tra bố trí cửa theo đoạn |
| Dữ liệu cũ có cửa sát mép hoặc kích thước vượt giới hạn | Dựng hình theo giới hạn đoạn hiện tại, hỗ trợ đọc nguyên schema |

Rollback point và cách rollback: blob HTML đầu phiên ở trên; áp dụng ngược diff riêng của hợp đồng, giữ phần sửa có sẵn và dữ liệu trình duyệt.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi Codex lúc 2026-11-21 00:54 ICT.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-21 01:06 ICT | Đưa bảy cửa kính dựng sẵn vào các đoạn hành lang mặc định còn trùng tọa độ, thay lớp mesh độc lập bằng cửa của đồ thị, giữ hoạt ảnh ở LIVE. Dùng cờ migration bổ sung trong schema hiện hữu. | Ảnh kiểm tra lần đầu cho thấy cửa dựng sẵn còn đứng riêng dù đoạn tường đã bị xóa. Nhãn agent cũng chặn chuột khi thao tác với một đoạn tường. | Dữ liệu cũ được chuyển một lần. Không tạo lại đoạn đã xóa, không thêm cửa đè lên cửa có sẵn và không chặn thao tác BUILD bằng nhãn mô phỏng. Kiểm tra thêm điều kiện migration và tải lại sau xóa. | Phạm vi sửa cửa và xóa tường trong yêu cầu hiện tại | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-21 | `959550f522ddaadf0b10ce89fbb8a2ce6cc9dfd7` | Bắt đầu triển khai | Bản sao trước khi sửa tại `.tmp/office-before-feat-150.html` |
| 2026-11-21 | `8fcabfd382199b905789f8aea9a006ac231dda83` | Hoàn tất giới hạn kích thước cửa, migration cửa mặc định, thao tác tường và UI BUILD | Giữ nguyên khóa lưu mặt bằng `atelier_fp2_v1` |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-21 01:05 ICT | Bản trung gian 1.0 | Chrome desktop với fixture v3 | Cửa cũ, chọn qua cửa, xóa với nút/phím/tẩy, lịch sử và reload đạt. Một nhãn agent chặn chuột ở vị trí tường ngắn. Ảnh cũng phát hiện cửa dựng sẵn nằm ngoài đồ thị. | `.tmp/office-browser/desktop.png`, CR-001 |
| 2026-11-21 01:09 ICT | Bản trung gian 1.1 | Chrome desktop và viewport 390 px | Desktop qua toàn bộ luồng. Nút vào chỉnh sửa bị đẩy ngoài màn hình 390 px bởi cụm điều khiển cũ. Đã chỉnh cụm điều khiển xuống dòng và chạy lại. | `.tmp/office-wall-browser-test.cjs` |
| 2026-11-21 01:12 ICT | `8fcabfd382199b905789f8aea9a006ac231dda83` | Cú pháp và diff | `node --check` trên script nội tuyến và `git diff --check` đều thành công. | SHA-256 HTML `685B9DA18BBD2D79CE2C85316C662A0777DB17E3411C527EED8F6B77133D5740` |
| 2026-11-21 01:13 ICT | `8fcabfd382199b905789f8aea9a006ac231dda83` | Chrome 1360×850 và 390×740, fixture v3 | Kiểm tra hình học cửa, chọn qua cánh cửa, ba thao tác xóa, lịch sử, tải lại, vẽ, kéo tường, vật liệu sàn, nội thất, thoát BUILD và mặt bằng trống đều đạt. Không có exception của trang. | `.tmp/office-wall-browser-test.cjs`, `.tmp/office-browser/desktop.png`, `.tmp/office-browser/mobile.png` |
| 2026-11-21 01:13 ICT | `8fcabfd382199b905789f8aea9a006ac231dda83` | Chrome với mặt bằng mới và fixture v5 | Mặt bằng mới có 7 cửa gắn tường, giữ hoạt ảnh LIVE. Mặt bằng cũ giữ cửa người dùng, migration bỏ vị trí chồng và tải lại không tạo trùng. Xóa đoạn hành lang xóa các cửa cùng đoạn. | `.tmp/office-wall-migration-test.cjs`, `.tmp/office-browser/office.png` |
| 2026-11-21 01:13 ICT | `8fcabfd382199b905789f8aea9a006ac231dda83` | HTTP và chạy trực tiếp qua CDN | `127.0.0.1:9999` trả 200 và HTML khớp SHA-256. Chrome tải Three.js r128 trực tiếp và mở trình sửa với 11 tường mặc định, không có exception. Lần thử trước với nhiều phiên Chrome chạy đồng thời chạm giới hạn đợi 5 giây; chạy lại riêng với thiết lập đồ họa Low đã đạt. | Chrome và `.tmp/office-served-9999.html` |

## 14. Kết quả và đóng chức năng

- Kết quả: AC-01 đến AC-04 và CR-001 đạt trên bản phục vụ ở cổng 9999.
- Hạn chế còn lại: Migration cửa dựng sẵn chỉ áp dụng khi còn đoạn hành lang mặc định khớp tọa độ. Đoạn đã di chuyển hoặc xóa được giữ theo bản tùy chỉnh của người dùng.
- Việc chưa hoàn tất: Không có trong phạm vi.
- Rollback point: blob HTML đầu phiên `959550f522ddaadf0b10ce89fbb8a2ce6cc9dfd7` và bản sao cục bộ. Hoàn tác phần thay đổi của hợp đồng, giữ dữ liệu đã tùy chỉnh.
- Trạng thái `CLOSED` bởi Codex.
- Thời điểm 2026-11-21 01:13 ICT.
