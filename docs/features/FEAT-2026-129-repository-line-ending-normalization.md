# [FEAT-2026-129] Normalize app-definition line endings

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19 |

## 1. Phạm vi

Thêm repository attribute cho `paperclip/packages/shared/src/app-definitions/*.json`
để Git xử lý JSON với LF ổn định và không tạo nhiễu CRLF khi ingest hoặc diff.

## 2. Không thuộc phạm vi

- Không thay đổi nội dung JSON app definition.
- Không chạy lại ingest để ghi đè các app definition đang có thay đổi.
- Không thay đổi FurniMesh, Company Builder hoặc runtime.

## 3. Acceptance criteria

- `.gitattributes` có rule `text eol=lf` đúng thư mục app definitions.
- `google.json` và `slack.json` không còn diff sau khi hoàn nguyên.
- `git diff --stat` được ghi nhận sau thay đổi.

## 4. Verification và rollback

Kiểm tra `git diff --check`, `git status --short` và `git diff --stat`.
Rollback bằng cách xóa rule/file `.gitattributes`; không xóa app definition.

## 5. Evidence

| Thời điểm | Revision | Kết quả |
|---|---|---|
| Chưa chạy | Chưa có | Chờ áp dụng rule |

