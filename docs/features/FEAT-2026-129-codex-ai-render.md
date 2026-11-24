# [FEAT-2026-129] Render ảnh đẹp bằng Codex CLI (Blender dựng khung, Codex tạo ảnh photoreal)

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier API + UI |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có git commit (workspace không phải git repo); backup tại `scratch/backup-codex-render/` |
| Revision cuối | Xem mục 13 (SHA-256) |

## 1. Bối cảnh

Render Blender hiện là script cố định, ảnh ra toàn màu trắng như mô hình thạch cao. Đã chứng minh
`codex exec` (codex-cli 0.166.0, đăng nhập ChatGPT, tool image_generation + view_image) biến ảnh khung
Blender thành ảnh photoreal giữ đúng bố cục.

## 2. Mục tiêu

1. `GET /api/v1/projects/{id}/render-brief` trả brief Markdown deterministic + hash + missing_decisions.
2. `POST /api/v1/projects/{id}/render/ai` tạo job nền; `GET /api/v1/render/ai/{job_id}` xem trạng thái.
3. Workflow `render_gen` tùy chọn tạo job AI khi `ATELIER_AI_RENDER=codex` (mặc định tắt).
4. UI nút "Render đẹp bằng AI (Codex)" với poll, so sánh trước/sau, tải ảnh.
5. Tài liệu prompt Render Agent `docs/agents/render-agent-codex.md`.

## 3. Phạm vi

### In scope

- Module mới `render_brief.py`, `codex_render.py` (service + APIRouter), include router trong `main.py` (1 dòng).
- Bảng mới `ai_render_jobs` (CREATE TABLE IF NOT EXISTS).
- `agent_orchestrator_engine.py` nhánh `render_gen`: thêm bước tùy chọn sau Blender.
- UI: `AtelierPhotorealRenderPage.tsx`, `photorealRender.ts` (thêm hàm/kiểu API).
- Test pytest mới (mock subprocess, DB tạm), vitest nếu cần.

### Out of scope

- Đổi luồng Blender, approval gate, scale gate, port, runtime agent trong DB.
- Gọi codex thật trong test tự động. Chạy thật đúng 1 lần thủ công cho `proj_kid_bedroom`.
- Ảnh AI không dùng làm căn cứ thi công/BOQ.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Codex CLI đã đăng nhập; Blender (ảnh khung); catalog `data/seed/materials_vn.json`.
- Dữ liệu dùng chung: DB `data/atelier.db` (chỉ thêm bảng mới, không ghi bảng cũ); thư mục `data/exports/renders`.
- Không ảnh hưởng: API cổng 8000 (không kill), không đổi dữ liệu dự án.

## 5. Thiết kế và kế hoạch triển khai

1. `render_brief.build_render_brief(project)`: Markdown cố định thứ tự, HEX từ catalog; finish_decisions ưu tiên;
   thiếu thì "CHƯA CHỐT" + `missing_decisions`; hash sha256.
2. `codex_render`: job lưu `ai_render_jobs`; thread nền; `threading.Lock` toàn cục (1 codex một lúc, job sau xếp hàng);
   `subprocess.run([...list...], shell=False, timeout=600)`, `-s workspace-write -C <job_dir>`, không bypass sandbox;
   text dự án đưa vào prompt như dữ liệu có giới hạn độ dài; lấy output trong job_dir, fallback `~/.codex/generated_images`
   mới hơn thời điểm bắt đầu; đóng nhãn bằng PIL; lưu `renders/<project>_rev<r>_ai_<job>.png`.
3. Lỗi (không cài, chưa đăng nhập, timeout, không có file) -> FAILED có thông báo rõ, không giả thành công.
4. Ảnh phục vụ qua route sẵn có `/api/v1/renders/{filename}`.

## 6. File/component dự kiến thay đổi

| File | Loại | Lý do |
|---|---|---|
| apps/api/app/services/render_brief.py | mới | brief |
| apps/api/app/services/codex_render.py | mới | job + router |
| apps/api/app/main.py | sửa 1 dòng include | mount router |
| apps/api/app/services/agent_orchestrator_engine.py | sửa nhánh render_gen | tùy chọn env |
| paperclip/ui/src/features/atelier/photorealRender.ts, AtelierPhotorealRenderPage.tsx | sửa | nút + so sánh |
| tests/test_codex_ai_render.py | mới | test |
| docs/agents/render-agent-codex.md | mới | prompt agent |

## 7. Acceptance criteria

- [ ] AC-01: brief đủ mục, hash ổn định, thiếu decision thì báo, không ép Japandi, finish_decisions ưu tiên.
- [ ] AC-02: job thành công lưu file có nhãn, COMPLETED; timeout/không có file thì FAILED.
- [ ] AC-03: một job codex một lúc (lock); args là list, không shell, không bypass sandbox.
- [ ] AC-04: `ATELIER_AI_RENDER` không đặt thì hành vi workflow không đổi.
- [ ] AC-05: UI typecheck + vitest pass; 4 file test hiện có vẫn pass.
- [ ] AC-06: chạy thật 1 lần cho proj_kid_bedroom, ghi đường dẫn ảnh.

## 8. Verification plan

| Kiểm tra | Lệnh | Mong đợi |
|---|---|---|
| pytest | `.venv\Scripts\python -m pytest tests/test_codex_ai_render.py tests/test_modern_default_finish_questions.py tests/test_project_visibility.py tests/test_multi_agent_group_chat.py tests/test_eight_agent_workflow.py` | PASS |
| UI | `npm run typecheck`; `npx vitest run src/features/atelier` | PASS |
| E2E | gọi service trực tiếp 1 lần | ảnh PNG có nhãn |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Tốn quota ChatGPT, ~2-3 phút/ảnh | Chỉ chạy khi người dùng bấm; lock 1 job |
| Ảnh gửi lên OpenAI | Ghi rõ trong UI/tài liệu |
| Prompt injection từ tên đồ | Cắt độ dài, đưa như dữ liệu, sandbox workspace-write |

Rollback: khôi phục file từ `scratch/backup-codex-render/`, xóa module mới; bảng `ai_render_jobs` có thể bỏ.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude (theo yêu cầu người dùng)
- Thời điểm: 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | n/a | Triển khai theo contract | xem mục 13 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | n/a | pytest test_codex_ai_render + 4 file chỉ định | PASS 62 passed | mock Popen, DB tạm |
| 2026-11-18 | n/a | `npm run typecheck` (paperclip/ui) | PASS | không lỗi |
| 2026-11-18 | n/a | `npx vitest run src/features/atelier` | PASS 34 tests | 11 file |
| 2026-11-18 | n/a | Chạy thật 1 lần proj_kid_bedroom (service trực tiếp) | PASS COMPLETED 106.7 giây | `data/exports/renders/proj_kid_bedroom_rev2_ai_aijob_bc4dc55971.png`; ảnh khung Blender (eye_level) trống nên có cảnh báo và đổi prompt |

SHA-256:

| File | SHA-256 |
|---|---|
| apps/api/app/services/render_brief.py | 5afc7fa9f414966c425979121ce337136198c9b647b3e61909e55e7cadfe32d6 |
| apps/api/app/services/codex_render.py | c8e4c1b8302e0162275183475bedad02fac1d9171881633df584224940e3b22c |
| apps/api/app/main.py | c36fcb2f1012b2df6d4d47c3668bb5a17da8c6d9d8f3e18ad4cbb455fcf96346 |
| apps/api/app/services/agent_orchestrator_engine.py | a67e06dda50313cb8a342120242b95a2ff0ac99dd8813d824d8bd57c0f33a866 |
| tests/test_codex_ai_render.py | c8d1192c55e996063484bfd3e7b13c0678f571cd7a8ab74050727c18941c6c69 |
| docs/agents/render-agent-codex.md | 27d2cef23373dfcfbce25c73f8dfcdf3f21d17eab830bc65b7d017a841019b02 |
| paperclip/ui/src/features/atelier/AtelierPhotorealRenderPage.tsx | 3579458f414a67e1d60695c37bf732eecce2671462262099e3eb7c97b1fab9d8 |
| paperclip/ui/src/features/atelier/photorealRender.ts | 9a76786f64c89df6941bb64deebff6485943c3a6bcbb9543cbbb2128fe127bae |
| paperclip/ui/src/features/atelier/atelier-studio.css | a70fa80235b7d8c560653543066a78819f3e55aa401a38a05a4dfdac975e7e74 |
| ảnh AI proj_kid_bedroom | 45dbe1fe6da238c23c25b60ce99c7f9bb1dfe5e26eaa69c53cdfefd02f93aed8 |

## 14. Kết quả và đóng chức năng

- Kết quả: AC-01..AC-06 đạt (AC-04 bằng đọc mã: nhánh chỉ chạy khi env = codex).
- Hạn chế còn lại: server 8000 cần restart để nạp router mới; ảnh khung Blender `eye_level` của proj_kid_bedroom đang trống nên ảnh AI dựng từ brief; mỗi ảnh tốn hạn mức ChatGPT (~2-3 phút) và ảnh khung gửi lên OpenAI.
- Việc chưa hoàn tất: chưa kiểm UI trên trình duyệt thật; trạng thái chưa CLOSED.
- Rollback point: `scratch/backup-codex-render/`.
