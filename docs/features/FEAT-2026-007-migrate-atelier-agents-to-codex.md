# [FEAT-2026-007] Chuyển toàn bộ ATELIER agents sang Codex local

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.2 |
| Owner | ATELIER AI runtime |
| Người chấp thuận | Product Owner, yêu cầu trực tiếp ngày 2026-11-10 |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10, giờ Việt Nam |
| Revision bắt đầu | Root `74912c56ffa7c3f78bd2667dfeb4248ef94dfc94`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree hiện có |
| Revision cuối | Root `74912c56ffa7c3f78bd2667dfeb4248ef94dfc94`, Paperclip `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`; live config snapshot `docs/build/EVIDENCE/FEAT-2026-007/after-adapters.json` |

## 1. Bối cảnh và mục tiêu

13 agent ATELIER hiện hữu đang dùng adapter `http` trỏ tới dịch vụ port 8000 không hoạt động; Chief Architect và Ceiling & Lighting Specialist đang ở trạng thái lỗi `HTTP adapter missing url`. Chuyển toàn bộ agent hiện hữu sang adapter Codex local dùng Codex CLI đã cài và đăng nhập trên Windows host.

## 2. Phạm vi

- Sao lưu cấu hình adapter hiện tại của toàn bộ agent trong company ATELIER.
- Kiểm tra môi trường Codex local trước khi cập nhật hàng loạt.
- Chuyển `adapterType` sang `codex_local`, dùng model tiết kiệm do Product Owner chỉ định (`gpt-5.6-luna`) với `modelReasoningEffort=low` và cấu hình CLI local cho workflow không tương tác.
- Giữ nguyên tên, vai trò, hierarchy, capabilities, skills, permissions, ngân sách và metadata nghiệp vụ.
- Xóa trạng thái lỗi cũ khi API cho phép và xác minh canonical configuration sau cập nhật.

## 3. Non-goals

- Không tạo hoặc xóa agent.
- Không đổi prompt nghiệp vụ, skill, quyền, hierarchy, database schema hoặc source implementation.
- Không tạo API key mới, không chuyển sang dịch vụ HTTP/standalone và không thay đổi company khác.

## 4. Affected components

- Paperclip live configuration: `PATCH /api/agents/:id` cho 13 agent hiện hữu của company ATELIER.
- Adapter test: `POST /api/companies/:companyId/adapters/codex_local/test-environment`.
- Evidence/rollback snapshot trong `docs/build/EVIDENCE/FEAT-2026-007/`.

## 5. Acceptance criteria

- [x] AC-01. Cả 13 agent hiện hữu có `adapterType=codex_local` và model Codex hợp lệ.
- [x] AC-02. Không agent nào còn endpoint HTTP port 8000 trong adapter config.
- [x] AC-03. Codex CLI được phát hiện, đăng nhập hợp lệ và environment test pass.
- [x] AC-04. Tên, role, reportsTo, skills/runtimeConfig, permissions và metadata nghiệp vụ được giữ nguyên.
- [x] AC-05. Chief Architect không còn lỗi adapter HTTP; tất cả agent ở lifecycle có thể chạy.
- [x] AC-06. Có snapshot trước/sau và rollback mapping đầy đủ.

## 6. Risks

- Cập nhật một phần giữa batch có thể để lại cấu hình hỗn hợp. Giảm thiểu bằng snapshot, cập nhật tuần tự, kiểm tra response từng agent và rollback chính xác những agent đã đổi nếu có lỗi.
- Codex subscription/login có thể không truyền vào process Paperclip. Phải chạy environment test trước khi batch.
- Agent chạy có thể phát sinh token usage; chỉ chạy probe tối thiểu cần thiết để xác minh adapter.

## 7. Rollback

Khôi phục từng agent từ snapshot trước thay đổi bằng `PATCH /api/agents/:id`, gồm `adapterType=http` và nguyên vẹn `adapterConfig` cũ. Không rollback các trường nghiệp vụ ngoài adapter.

## 8. Verification plan

1. `codex --version` và `codex login status`.
2. Paperclip adapter environment test cho `codex_local`.
3. GET canonical agent list/config sau batch và đối chiếu snapshot bất biến.
4. Clear error/wakeup probe tối thiểu cho Chief Architect nếu environment test pass.
5. Kiểm tra `/api/health` và UI agent list.

## 9. Change log

### CR-001 — Sửa số lượng agent thực tế

- Lý do: API canonical trả chính xác 13 agent; nhãn “14 Nodes” trong UI là số node workflow, không phải số agent.
- Ảnh hưởng: batch và acceptance đổi từ 14 thành toàn bộ 13 agent hiện hữu; ý định “toàn bộ agent” không đổi.
- Chấp thuận: yêu cầu trực tiếp của Product Owner là toàn bộ agent; hiệu chỉnh số lượng theo dữ liệu canonical ngày 2026-11-10.

### CR-002 — Chuyển model sang GPT-5.6 Luna tiết kiệm

- Lý do: Product Owner yêu cầu rõ `gpt-5.6-luna` là model tiết kiệm nhất cho toàn bộ agent.
- Ảnh hưởng: thay target từ `gpt-6.1-sol/high` sang `gpt-5.6-luna/low`; cấu hình thử ban đầu trên Chief Architect phải được cập nhật lại trước batch.
- Chấp thuận: chỉ đạo trực tiếp ngày 2026-11-10. OpenAI Docs xác nhận GPT-5.6 Luna dành cho workload nhạy chi phí và hỗ trợ reasoning effort thấp.

## 10. Implementation log

- Lưu rollback snapshot của 13 adapter HTTP tại `docs/build/EVIDENCE/FEAT-2026-007/before-adapters.json`.
- Chạy adapter environment test cho Codex CLI local: command được phát hiện, phiên Codex đã đăng nhập và hello probe pass.
- Cập nhật tuần tự 13 agent sang `codex_local`, `engine=cli`, `model=gpt-5.6-luna`, `modelReasoningEffort=low`; giữ nguyên `atelierAgentKey` và toàn bộ trường nghiệp vụ ngoài adapter.
- Xóa trạng thái lỗi HTTP cũ của Chief Architect và Ceiling & Lighting Specialist.
- Không sửa source implementation Paperclip trong feature này.

## 11. Verification evidence

- Canonical API sau batch: 13/13 `codex_local`, 13/13 `gpt-5.6-luna`, 13/13 `low`, 0 endpoint port 8000, 0 `errorReason`.
- Paperclip `/api/health`: `status=ok`, version `0.3.1`, commit `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`.
- Chief Architect heartbeat run `cf338acf-1396-448a-994a-9f313c665bfe`: `succeeded`, `exitCode=0`, model `gpt-5.6-luna`, billing `subscription_included`.
- Snapshot trước: `docs/build/EVIDENCE/FEAT-2026-007/before-adapters.json`.
- Snapshot sau: `docs/build/EVIDENCE/FEAT-2026-007/after-adapters.json`.

## 12. Closure

Đóng ngày 2026-11-10 sau khi environment probe, canonical config audit và heartbeat runtime thực đều pass. Rollback vẫn khả dụng từ snapshot trước thay đổi.
