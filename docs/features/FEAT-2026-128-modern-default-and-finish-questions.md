# [FEAT-2026-128] Phong cách mặc định Hiện đại và agent hỏi lựa chọn hoàn thiện

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier API + UI + Paperclip server |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có git commit (workspace không phải git repo); backup tại `scratch/backup-modern-default/` |
| Revision cuối | Xem mục 13 (SHA-256) |

## 1. Bối cảnh

Mọi phương án đều ra Japandi (brief mặc định, ép style khi "thiết kế mới", 3 phương án A/B/C cùng sơn
japandi_ivory, asset pack mặc định sh3d-japandi). Agent tự chọn màu sơn/sàn/trần thay vì hỏi.

## 2. Mục tiêu

1. Mặc định phong cách là Hiện đại (Modern); Japandi chỉ khi người dùng nói rõ.
2. Agent tiếp nhận/Style hỏi tối đa 3 câu/lượt (sơn tường, tường nhấn, trần, sàn, tông gỗ, ánh sáng), 2-4 lựa chọn
   kèm "Tự nhập"; trả lời được lưu thành decision, không hỏi lại; chưa trả lời thì phương án PROVISIONAL.

## 3. Phạm vi

### In scope

- `contracts.py` DesignBrief default + trường `finish_decisions`; `QuestionRequest.decision_key` (optional).
- `main.py` chỉ dòng `style` của `CreateProjectPayload`.
- `orchestrator.py`: nhận diện style, bỏ ép Japandi, 3 phương án theo style, câu hỏi hoàn thiện, lưu decision khi trả lời.
- Module mới `finish_decisions.py`; `house_plan_designer.py`, `research_agent.py`, `agent_prompts.py`, `agent_orchestrator_engine.py` (mặc định sơn).
- `pbrCatalog.ts` và `blender_cycles_renderer.py`: chọn asset pack (Japandi -> sh3d-japandi, còn lại -> sh3d-classic).
- `data/seed/materials_vn.json`: thêm sơn trung tính cho Modern (không đổi/xóa khóa cũ).
- `atelier-clarification-policy.ts`: thêm nhóm câu hỏi hoàn thiện không chặn; `AIDesignAssistant.tsx`: hiển thị nhiều câu hỏi + Tự nhập.
- Test pytest/vitest mới.

### Out of scope

- Seed dự án mẫu trong `db.py`, dữ liệu dự án có sẵn, bảng `project_visibility`, route list/visibility, UI danh sách dự án.
- Đổi tên khóa vật liệu; mở lại câu hỏi đã cấm (địa chỉ, báo giá, VAT, MEP); Cost/BOM hỏi người dùng.
- Seed demo Japandi trong `atelier-bridge.ts`.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: bảng `questions`, `chat_messages`, `proposals`; catalog `data/seed/materials_vn.json`.
- Service/port/database không được ảnh hưởng: API 8000 không bị kill; DB `data/atelier.db` không đổi dữ liệu có sẵn.

## 5. Thiết kế và kế hoạch triển khai

1. Module `finish_decisions.py`: `detect_style`, bảng lựa chọn theo style, `plan_finish_questions`, `record_answer`, `resolve_finishes`.
2. Orchestrator dùng module; câu hỏi lưu bảng `questions` (cơ chế sẵn có); trả lời ghi vào `design_brief.finish_decisions` (VALIDATED).
3. Chưa trả lời: phương án dựng với giá trị đề xuất, tiêu đề "đề xuất, chờ bạn chọn".
4. Chỉ origin agent_concierge/agent_style/agent_ceiling_lighting được hỏi; Cost/BOM/Inventory/QA không.

## 6. File/component dự kiến thay đổi

| File | Loại | Lý do |
|---|---|---|
| apps/api/app/services/finish_decisions.py | mới | logic style + câu hỏi |
| apps/api/app/services/orchestrator.py | sửa | bỏ ép Japandi, hỏi, lưu decision |
| apps/api/app/models/contracts.py, main.py | sửa nhỏ | default Modern |
| house_plan_designer.py, research_agent.py, agent_prompts.py, agent_orchestrator_engine.py | sửa nhỏ | bỏ mặc định Japandi |
| pbrCatalog.ts, blender_cycles_renderer.py | sửa | chọn asset pack |
| data/seed/materials_vn.json | thêm | sơn Modern |
| atelier-clarification-policy.ts (+ test) | sửa | nhóm hoàn thiện |
| AIDesignAssistant.tsx | sửa | nhiều câu hỏi + Tự nhập |

## 7. Acceptance criteria

- [ ] AC-01: DesignBrief().style và CreateProjectPayload.style là "Modern".
- [ ] AC-02: "tân cổ điển" -> Classic; câu không nêu style -> Modern; Japandi chỉ khi nói rõ.
- [ ] AC-03: dự án mới không nêu màu sinh câu hỏi sơn, sàn, trần (lượt 1) rồi ánh sáng, nhấn, tông gỗ (lượt sau); mỗi câu 2-4 lựa chọn + Tự nhập; tối đa 3/lượt.
- [ ] AC-04: trả lời được lưu, phương án dùng đúng giá trị, không hỏi lại.
- [ ] AC-05: Cost/BOM không sinh câu hỏi.
- [ ] AC-06: asset pack: Modern -> sh3d-classic, Japandi -> sh3d-japandi (TS và Python).
- [ ] AC-07: test có sẵn liệt kê trong mục 8 PASS (sửa kỳ vọng Japandi cũ nếu cần, ghi lý do), typecheck sạch.

## 8. Verification plan

| Kiểm tra | Lệnh | Kết quả mong đợi |
|---|---|---|
| Pytest mới | `.venv\Scripts\python -m pytest tests/test_modern_default_finish_questions.py` | PASS |
| Pytest có sẵn | test_eight_agent_workflow, test_multi_agent_group_chat, test_workflow_input_sync, apps/api/tests/test_asset_resolver, test_japandi_bedroom_project | PASS |
| Vitest | pbrCatalog asset pack; atelier-clarification-policy | PASS |
| Typecheck | `npm run typecheck` ui (và server) | sạch |
| `git diff --check` | file đã sửa | sạch |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Modern dùng pack Classic tạm thời | ghi trong báo cáo; chỉ có 2 pack |
| Server 8000 cần restart | ghi chú |

Rollback: khôi phục từ `scratch/backup-modern-default/`, xóa `finish_decisions.py` và test mới.

## 10. Xác nhận đóng băng

- [x] Phạm vi, AC, rollback, verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: agent triển khai theo yêu cầu người dùng
- Thời điểm: 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | n/a | Triển khai theo mục 5 | Xem mục 13 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | n/a | pytest mới tests/test_modern_default_finish_questions.py | PASS 21/21 | chạy thật |
| 2026-11-18 | n/a | pytest test_eight_agent_workflow, test_multi_agent_group_chat, test_workflow_input_sync, test_japandi_bedroom_project | PASS (cùng 21 test mới: 65 passed) | chạy thật |
| 2026-11-18 | n/a | apps/api/tests/test_asset_resolver.py | FAIL 3 (không do thay đổi này: thiếu thư mục paperclip/ui/public/assets nên catalog rỗng; kỳ vọng pack mặc định đã sửa và pass tới dòng kiểm tra số lượng) | chạy thật |
| 2026-11-18 | n/a | vitest pbrCatalog.assetPack.test.ts; vitest atelier-clarification-policy.test.ts | PASS 2/2; PASS 8/8 | chạy thật |
| 2026-11-18 | n/a | npm run typecheck ui | exit 0 | server: lỗi có sẵn do thiếu @paperclipai/plugin-sdk, không có lỗi ở file đã sửa |
| 2026-11-18 | n/a | git diff --check | Không chạy được (workspace không phải git repo); thay bằng quét khoảng trắng cuối dòng trên dòng thêm: sạch | |

SHA-256 file chính:
  - `apps/api/app/services/finish_decisions.py`: `160620cebf9887b1e87100a8c2480a1d3a0af7327be5c66eed96de8b5b2fb282`
  - `tests/test_modern_default_finish_questions.py`: `6f0147c07aa78862b2e19f59217d9ac3d01589c127d5aba9a33c7b09c39930fd`
  - `apps/api/app/services/orchestrator.py`: `53877c5196abf61620d5ed8b95ecb20f2888f3b794cb92036daec3b52f61e204`
  - `apps/api/app/models/contracts.py`: `ba15ba3043bdb45c18926f0dee3abcc7d0e60f9bcd5e6bbe6a9132b0fc8840a4`
  - `paperclip/server/src/services/atelier-clarification-policy.ts`: `481de7df1ad52786f8d044a3aa7d513eb828645d30b4a3b115fe6f7e452765cb`
  - `paperclip/ui/src/features/atelier/pbrCatalog.ts`: `b19814ea77019713ad8b95cd186c5078ec7f94eda2fb127e0d29d74eb3b785bc`
  - `paperclip/ui/src/features/atelier/AIDesignAssistant.tsx`: `7a28cb5f58bbcc852bc0e4e7410a97d36d002fc261474b5675b60448383f0283`
  - `apps/api/app/services/blender_cycles_renderer.py`: `b7e558f040a3abf135d03606d98937f69bc4c33b47405457191877f44d2fc9a4`
  - `data/seed/materials_vn.json`: `beff7d7e76899c503f20543f8eeb91b29a2883ced881070d6bf677be8844d97a`

## 14. Kết quả và đóng chức năng

- Kết quả: AC-01..AC-06 đạt; AC-07 đạt một phần (xem test_asset_resolver).
- Ghi chú sự cố: lệnh `pytest tests/test_acceptance.py` (không thuộc kế hoạch) đã ghi vào data/atelier.db làm proj_demo_4x5m rev 2->3, scale_calibrated False; backup gốc: data/atelier-before-hide-projects-20261118-190449.db.
