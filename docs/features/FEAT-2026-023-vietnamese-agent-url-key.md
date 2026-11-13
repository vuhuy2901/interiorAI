# [FEAT-2026-023] Sửa URL agent tiếng Việt bị tách chữ

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier frontend |
| Người chấp thuận | Yêu cầu người dùng 2026-11-12 |
| Ngày tạo | 2026-11-12 |
| Frozen at | 2026-11-12 16:20 +07:00 |
| Revision bắt đầu | `628d46151` + working tree hiện tại |
| Revision cuối | `628d46151` + working-tree implementation 2026-11-13 |

## 1. Bối cảnh

`normalizeAgentUrlKey` chỉ giữ ký tự ASCII `a-z`; ký tự tiếng Việt có dấu bị
xóa thành delimiter. Vì vậy `Kiến Trúc Sư Trưởng` sinh URL
`ki-n-tr-c-s-tr-ng` dù nội dung hiển thị không bị lỗi font.

## 2. Mục tiêu

Tên tiếng Việt tạo URL không dấu, liền từ và dễ đọc; URL cũ vẫn resolve được
trong giai đoạn chuyển tiếp.

## 3. Phạm vi

### In scope

- Chuẩn hóa Unicode NFD, bỏ combining marks và ánh xạ `đ/Đ` trước slugify.
- Unit test tiếng Việt, ASCII, UUID và dữ liệu rỗng.
- Giữ khả năng resolve route cũ đã bookmark bằng fallback tương thích.

### Out of scope

- Đổi tên agent, nội dung chat hoặc database schema.
- Sửa toàn bộ slug của mọi entity ngoài agent.

## 4. Dependency và tài nguyên cần bảo vệ

- `@paperclipai/shared` dùng chung cho server và UI.
- Không thay agent ID, task, chat hoặc company scope.
- App port 3100 tiếp tục hoạt động.

## 5. Thiết kế và kế hoạch triển khai

1. Tách canonical transliteration khỏi regex slug hiện tại.
2. Thêm legacy normalizer chỉ dùng khi resolve reference cũ.
3. Test canonical URL và backward compatibility.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/shared/src/agent-url-key.ts` | bug fix | Transliterate Unicode |
| focused shared/server tests | test | Chống regression và giữ URL cũ |
| `paperclip/server/src/services/agents.ts` | compatibility | Resolve canonical + legacy ref |
| `paperclip/ui/src/pages/AgentChat.tsx` | compatibility | Match bookmark slug cũ từ roster |

## 7. Acceptance criteria

- [x] AC-01: `Kiến Trúc Sư Trưởng` chuẩn hóa thành `kien-truc-su-truong`.
- [x] AC-02: Tên ASCII giữ hành vi hiện tại.
- [x] AC-03: URL cũ `ki-n-tr-c-s-tr-ng` vẫn resolve đúng agent duy nhất.
- [x] AC-04: Typecheck/test liên quan pass và browser mở URL canonical.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Shared unit test | focused Vitest | PASS |
| Server resolver test | focused Vitest/API | URL mới và cũ cùng resolve |
| Browser | Chrome/Playwright | URL canonical tải chat |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| URL bookmark cũ hỏng | Legacy matcher trong resolver |
| Collision sau transliteration | Resolver tiếp tục từ chối match mơ hồ |

Rollback: revert các thay đổi FEAT-2026-023; agent ID và dữ liệu không đổi.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng.
- Thời điểm: 2026-11-12 16:20 +07:00.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-12 16:24 +07 | Thêm fallback ở trang AgentChat | Client hiện chỉ gọi detail API cho UUID nên server fallback chưa đủ giữ bookmark slug cũ | Một UI matcher, không đổi dữ liệu | Codex, bắt buộc để đạt AC-03 | 0.2 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-12 | working tree | Canonical Vietnamese slug + legacy resolver/UI fallback | Không đổi agent ID hoặc dữ liệu chat |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-12 | working tree | Shared Vitest | PASS 3/3 | `agent-url-key.test.ts` |
| 2026-11-13 | working tree | Old/new agent API | PASS, cùng ID `802d1324-f1a7-45d8-8963-d31684328127` | API snapshot |
| 2026-11-12 | working tree | Browser canonical chat | PASS | `docs/build/EVIDENCE/CHAT_PROJECT_WORKFLOW_AUDIT_20261112/chat-canonical.png` |

## 14. Kết quả và đóng chức năng

- Kết quả: Canonical URL dùng `chief-architect-kien-truc-su-truong`; bookmark cũ vẫn resolve cùng agent.
- Hạn chế còn lại: Không có trong phạm vi hợp đồng.
- Việc chưa hoàn tất: Không có.
- Rollback point: `628d46151` + working tree hiện tại.
- Trạng thái `CLOSED` bởi: Codex.
- Thời điểm: 2026-11-13 00:32 +07:00.
