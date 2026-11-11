# Quy trình tài liệu cho từng chức năng

Mỗi chức năng phải có một file Markdown riêng, đóng vai trò là **hợp đồng triển
khai** giữa yêu cầu, code và kiểm thử. Không bắt đầu sửa code rồi mới viết tài
liệu hợp thức hóa sau.

## 1. Vị trí và tên file

Tạo file tại:

```text
docs/features/FEAT-YYYY-NNN-ten-chuc-nang.md
```

Ví dụ:

```text
docs/features/FEAT-2026-001-import-floorplan.md
```

Dùng `TEMPLATE.md` làm mẫu. Một file chỉ mô tả một chức năng hoặc một thay đổi
có ranh giới rõ ràng.

## 2. Vòng đời bắt buộc

1. **DRAFT** — ghi mục tiêu, phạm vi, phần không làm, dependency, rủi ro và kế
   hoạch kiểm thử. Chưa sửa code.
2. **FROZEN** — chốt acceptance criteria và danh sách file/component dự kiến.
   Đây là điều kiện bắt buộc trước khi triển khai.
3. **IMPLEMENTING** — chỉ thực hiện nội dung đã chốt. Ghi revision bắt đầu.
4. **VERIFYING** — chạy kiểm thử đã định nghĩa, ghi lệnh và kết quả thực tế.
5. **CLOSED** — ghi revision cuối, kết quả, hạn chế còn lại và rollback point.

Luồng chuẩn:

```text
DRAFT → FROZEN → IMPLEMENTING → VERIFYING → CLOSED
```

## 3. Quy tắc chống sửa yêu cầu trước/sau

- Không sửa code trước khi tài liệu ở trạng thái `FROZEN`.
- Sau khi `FROZEN`, không xóa hoặc viết lại lịch sử yêu cầu để khớp với code.
- Nếu phát hiện cần đổi phạm vi, thêm mục `CR-NNN` vào Change Log, ghi lý do,
  ảnh hưởng, người chấp thuận và phiên bản mới; sau đó mới tiếp tục code.
- Sau khi `CLOSED`, mọi thay đổi hành vi phải mở change request mới hoặc tạo
  file feature phiên bản mới. Không chỉnh âm thầm cả code lẫn acceptance
  criteria cũ.
- Bằng chứng kiểm thử là append-only: kết quả sai vẫn được giữ và bổ sung lần
  chạy mới, không xóa kết quả cũ.

## 4. Definition of Ready

Chỉ được bắt đầu code khi file có đủ:

- ID, owner, trạng thái và phiên bản.
- Bối cảnh và mục tiêu đo được.
- In-scope và out-of-scope.
- Dependency và tài nguyên dùng chung cần bảo vệ.
- Acceptance criteria có thể kiểm tra.
- Kế hoạch triển khai, rollback và verification.
- Xác nhận `FROZEN` kèm ngày giờ.

## 5. Definition of Done

Chỉ được đóng chức năng khi:

- Code khớp toàn bộ acceptance criteria đã chốt.
- Không có thay đổi ngoài phạm vi chưa được ghi trong Change Log.
- Kiểm thử đã chạy trên revision cuối và được ghi lại.
- Tài liệu vận hành/API liên quan đã cập nhật.
- Rủi ro, giới hạn và việc chưa hoàn tất được nêu rõ.
- Có rollback point và revision cuối.

## 6. Trường hợp khẩn cấp

Hotfix có thể dùng file rút gọn nhưng vẫn phải tạo trước khi sửa code, tối thiểu
gồm: sự cố, phạm vi, tiêu chí khôi phục, rollback và verification. Sau khi hệ
thống ổn định, bổ sung đầy đủ file trong cùng ngày làm việc.
