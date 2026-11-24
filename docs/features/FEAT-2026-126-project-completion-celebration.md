# [FEAT-2026-126] Tin tổng kết và thẻ chúc mừng khi dự án hoàn thành

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier API + UI |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có git commit (workspace không phải git repo) |
| Revision cuối | Xem mục 13 (SHA-256) |

## 1. Bối cảnh

Khi workflow run đạt `COMPLETED`, chat chỉ có tin theo từng node; không có tổng kết cho người dùng.

## 2. Mục tiêu

Một tin tổng kết duy nhất (idempotent theo run_id) và thẻ UI "Dự án hoàn thành" kèm confetti một lần.

## 3. Phạm vi

### In scope

- `multi_agent_chat_sync.py`: thêm tin `PROJECT_COMPLETED` khi `run_doc.status == COMPLETED`, gồm tên dự án,
  revision, số node hoàn thành/tổng, tổng thời gian, dự toán (từ node deterministic_cost: `total_vnd`,
  `price_coverage_percent`, `total_is_complete`, số hạng mục có giá), link DXF/GLB/BOM (node cad_export),
  ảnh render (node render_gen). Thiếu thì "chưa có"; chưa đủ giá thì ghi "tạm tính, x/y hạng mục có giá".
- UI: `ProjectCompletionCard.tsx` (stat tiles, thumbnail, nút tải, confetti canvas tự viết, tôn trọng
  prefers-reduced-motion, dark/light qua token theme hiện có), gắn vào `ConversationAtelierSidecar.tsx`.
- Confetti chỉ chạy một lần mỗi run (biến module + localStorage có try/catch).
- Test pytest và vitest.

### Out of scope

- Không sửa engine workflow, approval, trạng thái run, port/provider; không thêm dependency; run
  BLOCKED/WAITING_*/FAILED không có thẻ.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: không thêm.
- Dữ liệu dùng chung: bảng `workflow_chat_events`, `chat_messages` (chỉ INSERT idempotent).
- Service/port/database không được ảnh hưởng: port 5173, 8000, logic duyệt agent.

## 5. Thiết kế và kế hoạch triển khai

1. `_insert_event` đã kiểm tra theo `event_id`; dùng `_stable_id("evt", run_id, "PROJECT_COMPLETED")`.
2. Dữ liệu tổng kết nằm trong `metadata.completion` (JSON) và `content` là văn bản tiếng Việt.
3. UI nhận diện `metadata.event_type === "PROJECT_COMPLETED"`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| apps/api/app/services/multi_agent_chat_sync.py | Sửa | Tin tổng kết |
| tests/test_multi_agent_group_chat.py | Sửa | Test idempotent/không bịa |
| paperclip/ui/src/features/atelier/ProjectCompletionCard.tsx | Mới | Thẻ chúc mừng |
| paperclip/ui/src/features/atelier/projectCompletion.ts (+ .test.ts) | Mới | Hàm thuần (parse, format, confetti once) |
| paperclip/ui/src/features/atelier/ConversationAtelierSidecar.tsx | Sửa | Hiển thị thẻ |

## 7. Acceptance criteria

- [ ] AC-01: run COMPLETED sinh đúng 1 tin PROJECT_COMPLETED; sync lại không tạo thêm.
- [ ] AC-02: run BLOCKED/WAITING_* không có tin.
- [ ] AC-03: dự toán thiếu giá được gán nhãn tạm tính "x/y hạng mục có giá"; không gọi là tổng chính thức.
- [ ] AC-04: trường thiếu là "chưa có", không bịa số liệu.
- [ ] AC-05: thẻ UI có tiêu đề, stat tiles, nút tải; confetti chỉ 1 lần và tắt khi reduced-motion.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Pytest | `.venv\Scripts\python -m pytest tests/test_multi_agent_group_chat.py` | PASS |
| Typecheck | `npm run typecheck` | PASS |
| Vitest | `npx vitest run src/features/atelier` | PASS |
| Whitespace | `git diff --check` | Sạch |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Trùng tin khi sync song song | Kiểm tra event_id + khóa chính bảng |
| Link tải không tồn tại | Chỉ phát link khi node cad_export COMPLETED và có path |

Rollback: bỏ khối tổng kết trong sync, xóa file UI mới, khôi phục sidecar từ `scratch/backup-feat126/`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: agent triển khai theo yêu cầu người dùng
- Thời điểm: 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | n/a | Bắt đầu triển khai | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | n/a (không commit) | `npm run typecheck` (paperclip/ui) | PASS | tsc -b không lỗi |
| 2026-11-18 | n/a | `npx vitest run src/features/atelier` | PASS | 10 file, 31 test |
| 2026-11-18 | n/a | `git diff --check` trên file thuộc scope | PASS | Không có lỗi whitespace; lệnh toàn repo báo lỗi sẵn có ở ai-office-standalone/index.html (ngoài scope) |
| 2026-11-18 | n/a | Runtime UI (`verify-atelier-construction.mjs`) | CHƯA CHẠY | Server 5173 không chạy; chưa verify bằng UI thật |
| 2026-11-18 | n/a | `.venv\Scripts\python -m pytest tests/test_multi_agent_group_chat.py` | PASS | 16 test (7 mới: idempotent, tạm tính, chưa có, không bịa, run không COMPLETED) |
| 2026-11-18 | n/a | `pytest tests` toàn bộ | 160 pass, 27 fail, 14 error | Lỗi sẵn có do môi trường (Blender/Pascal MCP/HTTP 404, import `app` trong test_external_scene_cost); không thuộc file đã sửa |


SHA-256 file cuối:

```text
f9906895010b0ecd986049d395e5d990b789bf71030d7c88892a1302c7f8e607 apps/api/app/services/multi_agent_chat_sync.py
d3a12cfeeb7fd567c44e62139846bbda3976ab6c27c08c9d17c6973e87ffc36a tests/test_multi_agent_group_chat.py
6d82f41494daf8c584cdcd6408f153117ea9d7097936a96fda68414ecc13f95a paperclip/ui/src/features/atelier/ProjectCompletionCard.tsx
d646fd4556a2fe3cac945de7a2379e2f3c3c6f4da83114c6dc71ca0ff176430b paperclip/ui/src/features/atelier/projectCompletion.ts
8a07af4a48a1ee44d69388273ed80c1cf99435b69456dfe84de1a28867d29d9c paperclip/ui/src/features/atelier/projectCompletion.test.ts
f0cdc206290331117e800ab3c992f460851ffb9fc4ba6eaa2fdf1e4d1f870d92 paperclip/ui/src/features/atelier/ConversationAtelierSidecar.tsx
```

## 14. Kết quả và đóng chức năng

- Kết quả: tin PROJECT_COMPLETED idempotent và thẻ chúc mừng đã làm; chưa CLOSED vì chưa verify UI thật.
