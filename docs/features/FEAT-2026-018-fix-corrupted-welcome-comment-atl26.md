# [FEAT-2026-018] Sửa comment kickoff ATL-26 bị mất ký tự công thức

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |

## 1. Bối cảnh (bug fix)
Comment kickoff của Chief Architect trên ATL-26 bị hỏng: PowerShell nội suy `$4`, `$16`... khi đăng, nên mất số và còn sót `\times`, `\text`. Dấu tiếng Việt vẫn đúng (UTF-8 OK).

## 2. Phạm vi
- In scope: sửa nội dung 1 comment (id `b138c8f7...`) trên Paperclip bằng văn bản thuần, không LaTeX, đăng qua Python UTF-8.
- Non-goals: không đổi code, không đổi thiết kế, không áp dụng phương án mới của user.

## 3. Thành phần ảnh hưởng
Chỉ dữ liệu comment trong Paperclip DB.

## 4. Acceptance criteria
Comment không còn `\times`, `\text`, `$`; có đủ 4.190 × 4.040 mm, 16,9 m², giường 1,8 × 2,0 m.

## 5. Rủi ro / Rollback
Rủi ro thấp. Rollback: nội dung cũ đã ghi ở trên (chỉ là bản lỗi), không cần khôi phục.

## 6. Kế hoạch kiểm thử
GET lại comment và kiểm tra bằng chuỗi.

## 7. Bằng chứng
(ghi sau khi chạy)

PATCH comment trả 404 (Paperclip không hỗ trợ sửa). Đã đăng comment đính chính bằng Python UTF-8, POST 201. Comment gốc lỗi vẫn còn trong lịch sử. Trạng thái: CLOSED.

