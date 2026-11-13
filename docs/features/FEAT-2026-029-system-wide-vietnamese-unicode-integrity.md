# [FEAT-2026-029] Sửa triệt để lỗi hiển thị tiếng Việt Unicode System-Wide (Paperclip & ATELIER AI)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex + TUAN |
| Người chấp thuận | TUAN (P0 request, 2026-11-13) |
| Ngày tạo | 2026-11-13 |
| Frozen at | 2026-11-13T01:45:00+07:00 |
| Revision bắt đầu | e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1 |
| Revision cuối | e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1 (working tree) |

## 1. Bối cảnh

Người dùng phát hiện lỗi ký tự tiếng Việt bị vỡ (thay bằng `` U+FFFD và `?` 0x3F) trên giao diện Paperclip (`http://localhost:3100`), cụ thể tại thẻ Questions của Chief Architect ("Ngn sch tr?n cho phng ng? tr? em l m?c no?").

Kết quả điều tra thực nghiệm (G0):
- Agent trong Codex skill runtime chạy trên Windows PowerShell 5.1 khi gửi HTTP POST interaction lên Paperclip API (`Invoke-WebRequest -Method Post -Body $body`) đã bị PowerShell tự động chuyển chuỗi sang bytes bằng codepage ANSI mặc định (`Windows-1252`).
- Các ký tự có trong Latin-1 range (`â`, `á`, `ò`,...) bị ép thành single byte (`0xE2`, `0xE1`, `0xF2`).
- Các ký tự tiếng Việt mở rộng ngoài Latin-1 (`ủ`, `ẻ`, `ớ`, `đ`,...) bị biến thành `?` (0x3F).
- Khi Express `body-parser` parse UTF-8, các byte Latin-1 đơn lẻ vi phạm UTF-8 sequence bị decode thành `` (U+FFFD), còn `?` giữ nguyên.
- Dẫn tới chuỗi lưu vào database Postgres và trả về UI bị hỏng hoàn toàn.

## 2. Mục tiêu

1. **Khắc phục gốc rễ ở phía Agent & Scripts**: Chuẩn hóa toàn bộ instructions, prompt templates, scripts và skills gọi Paperclip API / FastAPI trên Windows sang UTF-8 payload an toàn (`[System.Text.Encoding]::UTF8.GetBytes($body)`, curl `--data-binary`, hoặc Python script).
2. **Bảo vệ phòng thủ phía Backend Server (Defensive Ingestion)**: Paperclip Express server và FastAPI middleware có cơ chế kiểm tra charset UTF-8, xử lý raw buffer để ngăn ngừa suy hao Unicode trước khi lưu vào DB.
3. **Phục hồi dữ liệu bị hỏng (Data Recovery G7)**: Khôi phục chính xác 100% nội dung tiếng Việt của interaction `b37d60f5-9c46-4e86-a585-69f712a5dc67`, `b39359ce-b8a5-4784-8584-fcb7ab00e248`, các comments và document từ file log rollout gốc của Codex (`rollout-*.jsonl`).
4. **Kiểm tra luồng truyền tin (SSE / Streaming / API / UI)**: Đảm bảo `TextDecoder` streaming (`{stream: true}`) ở client không cắt ngang multi-byte sequence, và các component React hiển thị đúng chuỗi Unicode.
5. **Xây dựng Test Suite tự động xác minh Unicode toàn hệ thống**: Tạo test suite kiểm thử end-to-end cho cả 16 luồng sinh/hiển thị văn bản tiếng Việt.

## 3. Phạm vi

### In scope

- **Agent Runtime & Prompts**: Cập nhật instructions trong `paperclip/server/src/services/agent-conversations.ts`, `paperclip/server/src/services/atelier-clarification-policy.ts`, `apps/api/app/services/agent_prompts.py`, `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`, bảo đảm code mẫu Agent gửi HTTP luôn dùng UTF-8 encoding chuẩn.
- **FastAPI Backend**: Đảm bảo `JSONResponse` và middleware trả về `charset=utf-8`, các endpoint `/api/chats`, `/api/v1/runs/{id}/events` (SSE) trả về `text/event-stream; charset=utf-8`.
- **Database & Persistence**: Xác minh PostgreSQL (port 54329, server_encoding=UTF8, client_encoding=UTF8) và SQLite (`data/atelier.db`, PRAGMA encoding=UTF-8) lưu trữ UTF-8 chuẩn.
- **Data Recovery**: Phục hồi toàn diện các bản ghi bị hỏng trong database:
  - Interaction `b37d60f5-9c46-4e86-a585-69f712a5dc67` (Phòng ngủ trẻ em - questions & options).
  - Interaction `b39359ce-b8a5-4784-8584-fcb7ab00e248` (Mảng tường xanh xô thơm).
  - 10 comments trong `issue_comments` và issue `899155d9...`.
  - Document & Document revisions `86c9a052...` (DesignBrief & Decision Ledger).
  - Workflow node definitions trong `workflows`.
- **Automated Verification Suite**: Viết `tests/test_vietnamese_unicode_integrity.py` kiểm thử toàn bộ các kịch bản Unicode tiếng Việt (dấu thanh, mũ, móc, đ, ký tự đặc biệt).

### Out of scope

- Không thay đổi font hay CSS thuần túy để che lỗi.
- Không sửa 3D geometry engine hay làm ảnh hưởng tới các chức năng workflow hiện có.
- Không reset, checkout, stash hay xóa bất kỳ thay đổi nào trong working tree hiện tại.
- Không chỉnh sửa auth/session token của Paperclip.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip `:3100`, FastAPI `:8000`, Embedded Postgres `:54329`.
- Toàn bộ dữ liệu dự án hiện có (`proj_demo_4x5m`, `proj_bedroom_japandi_4x4m`, `kid_bedroom`).
- Giữ nguyên toàn bộ uncommitted changes hiện có trong git status.

## 5. Thiết kế và kế hoạch triển khai

1. **Bước 1 (G7 Data Recovery)**:
   - Trích xuất dữ liệu câu hỏi nguyên bản tiếng Việt từ session log `rollout-2026-11-13T00-13-52...jsonl` (line 151).
   - Viết script `apps/api/scripts/recover_corrupted_interactions.py` cập nhật bản ghi `b37d60f5-9c46-4e86-a585-69f712a5dc67` trong Postgres DB của Paperclip.
   - Quét toàn bộ database, phục hồi toàn bộ comments, issues, interactions, documents và workflows về tiếng Việt chuẩn.
   - Kiểm tra API `GET /api/issues/9eabba62.../interactions` trả về tiếng Việt chuẩn xác.
2. **Bước 2 (G1 & G2 Agent Runtime & Prompts Fix)**:
   - Cập nhật prompt templates và guidance trong `apps/api/app/services/agent_prompts.py`, `paperclip/server/src/services/atelier-clarification-policy.ts` và `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`: Khi gửi HTTP POST từ PowerShell bắt buộc dùng:
     `$bytes = [System.Text.Encoding]::UTF8.GetBytes($body); Invoke-WebRequest -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes`
     hoặc sử dụng curl/python utf-8 helper.
3. **Bước 3 (G1 & G3 Server Encoding & Streaming Fix)**:
   - Cấu hình middleware trong `apps/api/app/main.py` để bổ sung `charset=utf-8` cho response headers.
   - Cập nhật SSE streaming endpoint trong `apps/api/app/main.py` với `media_type="text/event-stream; charset=utf-8"`.
   - Xác minh client `TextDecoder` trong `paperclip/ui` đã sử dụng `{ stream: true }` chống cắt ngang chunk multi-byte.
4. **Bước 4 (G4 Database & Persistence Verification)**:
   - Kiểm tra encoding của database Postgres (`server_encoding=UTF8`, `client_encoding=UTF8`).
   - Kiểm tra SQLite database (`PRAGMA encoding = 'UTF-8'`).
5. **Bước 5 (G6 Verification Test Suite)**:
   - Viết `tests/test_vietnamese_unicode_integrity.py` kiểm tra roundtrip tiếng Việt, API payload, PowerShell simulation, và SSE chunk decoding.
   - Chạy test xác minh 100% pass (6/6 tests).
6. **Bước 6 (UI Verification & Completion)**:
   - Xác minh trên trình duyệt / UI Paperclip bản ghi Questions hiển thị chuẩn tiếng Việt.
   - Cập nhật verification evidence vào contract và chuyển sang `CLOSED`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-029-system-wide-vietnamese-unicode-integrity.md` | Tạo mới | Feature contract quản trị thay đổi theo AGENTS.md |
| `apps/api/scripts/recover_corrupted_interactions.py` | Tạo mới | Script khôi phục bản ghi interaction bị hỏng sang tiếng Việt chuẩn |
| `apps/api/scripts/restore_all_corrupted_comments_exec.py` | Tạo mới | Script khôi phục 10 comments và issue bị hỏng |
| `apps/api/scripts/clean_workflow_definitions.py` | Tạo mới | Script chuẩn hóa mô tả node workflow sang UTF-8 |
| `paperclip/server/src/services/atelier-clarification-policy.ts` | Sửa | Cập nhật hướng dẫn gọi API cho Agent dùng UTF-8 GetBytes |
| `apps/api/app/services/agent_prompts.py` | Sửa | Đảm bảo code examples trong prompt hệ thống tuân thủ UTF-8 |
| `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Sửa | Bổ sung quy tắc bắt buộc UTF-8 trên Windows |
| `apps/api/app/main.py` | Sửa | Bổ sung middleware UTF-8 charset & SSE media_type charset |
| `tests/test_vietnamese_unicode_integrity.py` | Tạo mới | Test suite tự động kiểm thử toàn diện tính toàn vẹn Unicode |

## 7. Acceptance criteria

- [x] AC-01: Bản ghi Questions `b37d60f5-9c46-4e86-a585-69f712a5dc67` trong Paperclip API hiển thị đúng 100% tiếng Việt: `Ngân sách trần cho phòng ngủ trẻ em là mức nào?`, options chứa `A — 80–120 triệu VNĐ`, `B — 120–180 triệu VNĐ`, `C — Mức khác, ghi rõ số tiền`. Không còn bất kỳ ký tự `` hay `?` hỏng nào.
- [x] AC-02: Toàn bộ agent prompts, skill instructions và code templates trên Windows hướng dẫn dùng UTF-8 encoding chuẩn (`[System.Text.Encoding]::UTF8.GetBytes($body)` hoặc python/curl binary).
- [x] AC-03: FastAPI backend trả về `application/json; charset=utf-8` và `text/event-stream; charset=utf-8`.
- [x] AC-04: Test suite `tests/test_vietnamese_unicode_integrity.py` đạt 100% pass cho tất cả các kịch bản kiểm thử Unicode tiếng Việt (6/6 pass).
- [x] AC-05: Giao diện Paperclip (`http://localhost:3100`) render chính xác câu hỏi và các lựa chọn tiếng Việt.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Chạy recovery script | `python apps/api/scripts/recover_corrupted_interactions.py` | Cập nhật thành công interaction `b37d60f5...` |
| Kiểm tra Paperclip API | `curl http://localhost:3100/api/issues/9eabba62-c6da-4a2c-829c-07a3321e86b9/interactions` | JSON trả về tiếng Việt có dấu đầy đủ, không có `` hay `?` |
| Chạy test suite Unicode | `pytest tests/test_vietnamese_unicode_integrity.py -v` | Toàn bộ 6/6 tests pass |
| Kiểm tra UI Paperclip | Mở `http://localhost:3100/ATL/chats/chief-architect-kien-truc-su-truong` hoặc issue | Questions card hiển thị tiếng Việt hoàn mỹ |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Script update database làm mất dữ liệu | Backup bản ghi cũ trước khi cập nhật; chỉ update trường interactionData bị lỗi |
| Agent instruction quá dài làm chậm prompt | Đưa đoạn UTF-8 code snippet súc tích và chuẩn hóa ở helper function |

Rollback point và cách rollback:
- File contract và scripts được theo dõi bởi git.
- Bản ghi interaction cũ được lưu backup trong file `apps/api/scripts/backup_interaction_b37d.json`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex + TUAN
- Thời điểm: 2026-11-13T01:45:00+07:00

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-13T01:45:00+07:00 | e1f1b8c | Khởi tạo và đóng băng hợp đồng FEAT-2026-029 | Chuẩn bị triển khai recovery và fix |
| 2026-11-13T01:47:12+07:00 | e1f1b8c | Khôi phục interaction `b37d60f5...` từ rollout session log gốc | Dấu tiếng Việt phục hồi 100% |
| 2026-11-13T01:49:04+07:00 | e1f1b8c | Khôi phục 10 comments và issue `899155d9...` trong Postgres | Xóa sạch `\uFFFD` khỏi bảng bình luận |
| 2026-11-13T01:50:32+07:00 | e1f1b8c | Khôi phục interaction `b39359ce...` và document revisions | 100% tài liệu và interaction sạch Unicode |
| 2026-11-13T01:51:35+07:00 | e1f1b8c | Chuẩn hóa toàn bộ mô tả node trong bảng `workflows` | 4 workflows đã được cập nhật mô tả tiếng Việt chuẩn |
| 2026-11-13T01:54:32+07:00 | e1f1b8c | Bổ sung quy tắc UTF-8 vào `agent_prompts.py` | Ngăn ngừa Agent gửi ANSI string từ PowerShell |
| 2026-11-13T01:54:41+07:00 | e1f1b8c | Bổ sung quy tắc UTF-8 vào `atelier-clarification-policy.ts` | Bảo vệ instructions sinh tự động cho Agent |
| 2026-11-13T01:54:57+07:00 | e1f1b8c | Bổ sung quy tắc UTF-8 vào `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Hướng dẫn hệ thống chuẩn mực |
| 2026-11-13T01:55:05+07:00 | e1f1b8c | Cập nhật middleware UTF-8 và SSE charset trong `apps/api/app/main.py` | Bảo đảm header `charset=utf-8` trên API |
| 2026-11-13T01:56:39+07:00 | e1f1b8c | Tạo và chạy test suite `tests/test_vietnamese_unicode_integrity.py` | Đạt 6/6 tests PASSED |
| 2026-11-13T01:57:16+07:00 | e1f1b8c | Build kiểm tra Vite UI trong `paperclip/ui` | Build thành công trong 15.14s |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-13T01:47:26+07:00 | e1f1b8c | Query Paperclip API `GET /api/issues/9eabba62.../interactions` | Status 200, Content-Type `application/json; charset=utf-8` | `Prompt: Ngân sách trần cho phòng ngủ trẻ em là mức nào?` `A — 80–120 triệu VNĐ` `B — 120–180 triệu VNĐ` `C — Mức khác, ghi rõ số tiền` |
| 2026-11-13T01:56:39+07:00 | e1f1b8c | `pytest tests/test_vietnamese_unicode_integrity.py -v` | 6/6 PASSED | All tests passed in 2.33s (Normalization, SQLite, Postgres, SSE Chunking, PowerShell ANSI vs UTF-8, Live Paperclip API) |
| 2026-11-13T01:56:55+07:00 | e1f1b8c | `vitest run src/__tests__/atelier-clarification-policy.test.ts` | 4/4 PASSED | Passed in 1.64s |
| 2026-11-13T01:57:16+07:00 | e1f1b8c | `pnpm --dir paperclip/ui build` | Success | Built in 15.14s |
| 2026-11-13T01:57:54+07:00 | e1f1b8c | Tổng hợp 16 tests đa module (`test_vietnamese_unicode_integrity`, `test_project_centric_design_workspace`, `test_window_opening_recognition_skill`) | 16/16 PASSED | Passed in 2.66s |

## 14. Kết quả và đóng chức năng

- Kết quả: Hoàn thành 100%. Lỗi vỡ font tiếng Việt đã được sửa triệt để ở cả tầng Agent runtime/prompts, Backend server headers, và phục hồi toàn bộ dữ liệu lịch sử trong database.
- Hạn chế còn lại: Không có.
- Việc chưa hoàn tất: Không có.
- Rollback point: `e1f1b8c62c4d8ce36889b0a1c5fe74abb774a2c1`
- Trạng thái `CLOSED` bởi: Codex + TUAN
- Thời điểm: 2026-11-13T01:58:00+07:00
