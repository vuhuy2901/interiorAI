# [FEAT-2026-134] Atelier workflow family selection

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | User (2026-11-19, "dong y") |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19 Asia/Saigon |
| Revision bắt đầu | Hiện trạng working tree (có thay đổi FEAT-2026-133 chưa commit) |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Atelier workflow definitions (`atelier-workflow-builder.ts` + `atelier-workflow-orchestration.ts`)
hiện chỉ hỗ trợ **một tên workflow cố định cứng trong code**
(`ATELIER_COMPANY_WORKFLOW_NAME = "Atelier Company Workflow"`, khai báo trùng lặp
ở 2 file). Mỗi company chỉ có đúng 1 họ workflow; publish một version mới tự
động trở thành bản "newest published" được dùng, không có bước chọn riêng.
`createAtelierWorkflowDraft` chỉ fork version mới từ 1 version cũ và kế thừa
đúng `name` của nó — không tạo được workflow độc lập có tên riêng.

Người dùng muốn: tạo thêm workflow khác (ví dụ nhẹ hơn, ít stage hơn), publish
nó, và **chọn** đúng 1 trong các workflow đã publish làm workflow company
đang dùng — các workflow khác vẫn lưu lại để chọn lại sau. Khi publish, cần
có cách "phân giã thành lời" (mô tả người đọc hiểu được) để người chọn biết
workflow đó làm gì trước khi chọn.

Xác nhận quan trọng từ code: `atelier_workflow_runs` đã pin
`workflowDefinitionId` + `workflowVersion` ngay lúc tạo run
(`provisionSpecialistDelivery`), nên đổi workflow active về sau **không ảnh
hưởng run đang chạy/đã tạo**, chỉ áp dụng cho run mới tạo sau đó.

## 2. Mục tiêu

- Nhiều workflow family (tên khác nhau) cùng tồn tại độc lập cho 1 company.
- Company chọn đúng 1 family làm active; run mới luôn dùng published mới
  nhất của family đang active.
- Mỗi lần publish, hệ thống tự sinh mô tả người đọc được (trình tự stage,
  agent phụ trách, phụ thuộc) lưu lại cùng version đó.
- Company chưa từng dùng tính năng này (0 row selection) hoạt động giống
  100% hiện tại — không phá vỡ company cũ.

## 3. Phạm vi

### In scope

- Bảng mới lưu lựa chọn active workflow theo company.
- Hàm tạo workflow family mới với tên tuỳ chọn (không chỉ fork-version).
- Hàm sinh mô tả người đọc được từ `AtelierEditableDefinition`, lưu vào
  cột mới trên `workflows` lúc publish.
- Sửa `ensureAtelierCompanyWorkflowDefinition` đọc bảng selection trước khi
  fallback về tên mặc định hiện tại.
- API board-only: tạo family mới, list family (kèm mô tả + trạng thái
  active), chọn family làm active.
- Test Vitest cho: tạo family mới, publish sinh mô tả đúng, select active
  đổi đúng company/không ảnh hưởng company khác, fallback khi chưa chọn gì,
  run đang chạy không bị đổi definition khi active thay đổi sau đó.

### Out of scope

- UI đồ hoạ chỉnh sửa node/edge (dùng lại editor hiện có nếu có, không xây
  mới trong CR này).
- Xoá/archive family.
- Hệ thống "case workflows" generic (`services/workflows.ts`) — không liên
  quan, không đụng tới.
- Thay đổi hành vi FEAT-2026-133 (specialist delivery workflow đang chạy).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: bảng `workflows`, `companies`; không đổi schema
  `atelier_workflow_runs`/`atelier_workflow_stage_executions`.
- Dữ liệu dùng chung: run/workflow definition hiện có của company test
  (company `0873a79a-...`) không được đổi definition đang pin.
- Service/port/database không được ảnh hưởng: Paperclip :3100, Postgres
  :54329, Python sidecar :8000 — feature này thuần TS/DB, không đụng sidecar.
- Không reset/checkout/clean working tree (có thay đổi FEAT-2026-133 chưa
  commit cần giữ).

## 5. Thiết kế và kế hoạch triển khai

1. Migration: thêm bảng `atelier_workflow_selections`
   (`company_id` uuid PK references companies, `workflow_name` text not null,
   `updated_at` timestamptz not null default now(), `updated_by_user_id` text)
   và cột `published_summary` text nullable trên `workflows`.
2. `atelier-workflow-builder.ts`:
   - `createAtelierWorkflowFamily(db, companyId, { name, prompt, definition, actorUserId })`:
     chặn trùng tên (company, name) đã tồn tại; insert version=1, status="draft".
   - `describeAtelierWorkflowDefinition(definition)`: BFS/topological từ node
     START theo edges, sinh text dạng
     `"Bước {n}: {node.name} ({node.type}, agent: {requiredRole|capability}) — phụ thuộc: {tên node nguồn hoặc 'Start'}"`
     nối bằng newline; node không tới được từ Start thì bỏ qua (đã bị
     `validateAtelierWorkflowDefinition` chặn ở publish nên không xảy ra).
   - `publishAtelierWorkflowDraft`: gọi `describeAtelierWorkflowDefinition`
     trước update, lưu vào `publishedSummary` cùng lúc đổi status.
   - `listAtelierWorkflowFamilies(db, companyId)`: group theo `name`, lấy
     version mới nhất mỗi tên + status/publishedSummary, kèm cờ
     `isActive` so với bảng selection (hoặc so với tên mặc định nếu company
     chưa có selection).
3. `atelier-workflow-orchestration.ts`:
   - `ensureAtelierCompanyWorkflowDefinition`: query bảng selection theo
     companyId trước; nếu có row, dùng `workflow_name` đó thay hằng số; nếu
     không có row, giữ nguyên logic cũ (hằng số + auto-seed).
   - `selectAtelierWorkflowFamily(db, companyId, workflowName, actorUserId)`:
     xác nhận family đó có ít nhất 1 version `status="published"`
     (companyId, name) — nếu không có, trả lỗi `unprocessable`
     (`workflow_family_not_publishable`); nếu có, upsert vào bảng selection.
4. Route (`atelier-bridge.ts`, board-only qua `assertBoard`):
   - `POST /atelier/workflow/families` → `createAtelierWorkflowFamily`.
   - `GET /atelier/workflow/families` → `listAtelierWorkflowFamilies`.
   - `POST /atelier/workflow/families/:name/select` → `selectAtelierWorkflowFamily`.
5. Không đổi route/hàm publish/draft/restore hiện có ngoài việc thêm field
   `publishedSummary` vào kết quả publish.
6. UI: ngoài phạm vi chi tiết hoá (xem Out of scope), nhưng nếu còn thời
   gian sau khi API xong, thêm 1 danh sách đơn giản (không editor) hiển thị
   family + publishedSummary + nút "Chọn làm active" tại trang quản trị
   Atelier workflow hiện có — ghi nhận là optional, không chặn AC.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/db/src/schema/workflows.ts` | Sửa | Thêm cột `publishedSummary` |
| `paperclip/packages/db/src/schema/atelier_workflow_selections.ts` | Mới | Bảng lựa chọn active workflow theo company |
| `paperclip/packages/db/src/schema/index.ts` | Sửa | Export bảng mới |
| `paperclip/server/src/services/atelier-workflow-builder.ts` | Sửa | Thêm `createAtelierWorkflowFamily`, `describeAtelierWorkflowDefinition`, `listAtelierWorkflowFamilies`; sửa `publishAtelierWorkflowDraft` |
| `paperclip/server/src/services/atelier-workflow-orchestration.ts` | Sửa | Đọc selection trong `ensureAtelierCompanyWorkflowDefinition`; thêm `selectAtelierWorkflowFamily` |
| `paperclip/server/src/routes/atelier-bridge.ts` | Sửa | 3 route mới board-only |
| `paperclip/server/src/__tests__/atelier-workflow-builder.test.ts` | Sửa | Test family mới, describe, publish summary |
| `paperclip/server/src/__tests__/atelier-workflow-orchestration.test.ts` | Sửa (nếu tồn tại) hoặc file test mới | Test selection + fallback + không ảnh hưởng run đang pin |

## 7. Acceptance criteria

- [ ] AC-01: Tạo được workflow family mới với tên khác, độc lập với family
      mặc định, không ảnh hưởng family cũ.
- [ ] AC-02: Publish 1 version sinh `publishedSummary` đúng thứ tự
      stage/agent/phụ thuộc, đọc được bằng mắt thường.
- [ ] AC-03: Chọn 1 family làm active cho company A không ảnh hưởng company
      B; company chưa chọn gì (0 row) vẫn ra đúng hành vi cũ (auto-seed tên
      mặc định).
- [ ] AC-04: Chọn family chưa có version published nào bị chặn (422), không
      đổi selection hiện có.
- [ ] AC-05: Run đã tạo trước khi đổi active workflow tiếp tục dùng đúng
      `workflowDefinitionId`/`workflowVersion` đã pin, không bị đổi.
- [ ] AC-06: Run mới tạo sau khi đổi active dùng đúng family mới được chọn.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit builder | `pnpm exec vitest run server/src/__tests__/atelier-workflow-builder.test.ts --maxWorkers 1` | Pass, gồm test mới cho family/describe/summary |
| Unit orchestration | `pnpm exec vitest run server/src/__tests__/atelier-workflow-orchestration.test.ts --maxWorkers 1` (hoặc file mới tương đương) | Pass, gồm selection/fallback/pin-run |
| Regression FEAT-2026-133 | `pnpm exec vitest run server/src/__tests__/atelier-specialist-delivery.test.ts server/src/__tests__/atelier-bridge-proxy-headers.test.ts --maxWorkers 1` | Vẫn 10/10 pass, không bị ảnh hưởng |
| Migration | `pnpm db:generate` rồi `pnpm -r typecheck` (hoặc low-memory variant) | Sinh migration hợp lệ, typecheck qua |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Company cũ bị đổi hành vi ngoài ý muốn | Giữ fallback nguyên vẹn khi chưa có selection row; test riêng AC-03 |
| Run đang chạy bị đổi definition giữa chừng | Xác nhận bằng code (đã pin ở tạo run) + test AC-05 |
| Chọn family rỗng/chưa publish | Chặn ở `selectAtelierWorkflowFamily`, test AC-04 |
| Migration ảnh hưởng dữ liệu `workflows` hiện có | Cột mới nullable, không required; không đổi dữ liệu cũ |

Rollback point: trước khi migration áp dụng lên DB thật, chỉ cần không chạy
migration + revert các file TS trên; vì mọi thay đổi additive, company cũ
không bị ảnh hưởng nếu rollback bằng cách không chọn family mới nào.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: User ("dong y", 2026-11-19)
- Thời điểm: 2026-11-19

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-19 | (a) Phát hiện UI workflow editor hoàn toàn không có nút Publish — thêm nút Publish. (b) Nút "Tạo workflow" cũ thực chất chỉ tạo version mới của CÙNG family mặc định, không tạo family độc lập — sửa để mở form tạo family thật qua API mới. (c) 3 route tra theo id (`GET /:id`, `/validate`, `/test`) lọc ngầm theo tên family mặc định, sẽ 404 với family khác — sửa dùng lookup theo id+company, không lọc tên. (d) Thêm `id` vào kết quả `listAtelierWorkflowFamilies` để UI mở đúng version. | User test qua UI thật: tạo xong cứ báo "bản nháp", không publish được | `publishAtelierWorkflowDraft` không đổi hành vi; chỉ thêm lookup mới không lọc tên cho 3 route | User ("hãy sửa lại cho tôi", 2026-11-19) | 1.0 (không bump, đây là sửa trong cùng lần implement trước khi đóng) |
| CR-002 | 2026-11-19 | `listAtelierWorkflowFamilies` lấy `status` từ row version MỚI NHẤT bất kể trạng thái; company test có "Atelier Company Workflow" với v12 là draft dở (sửa từ trước, không publish) khiến family bị báo "chưa publish" dù có v-cũ-hơn đã published, nút "Chọn làm active" bị mờ không bấm được. Sửa: tách `status` (của row mới nhất, để hiển thị đúng đang có draft dở hay không) khỏi `hasPublishedVersion`/`publishedVersion` (có version published nào không, bất kể version nào mới nhất); UI dùng `hasPublishedVersion` để enable nút chọn. | User báo trực tiếp ("sao nó mờ mờ kh cho chọn") | Không đổi schema; chỉ đổi shape object trả về của `listAtelierWorkflowFamilies` (thêm field, không xoá) | User (2026-11-19) | 1.0 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-19 | | Viết feature contract | |
| 2026-11-19 | | Schema: bảng `atelier_workflow_selections`, cột `workflows.published_summary`, migration `0450_feat_2026_134_...sql` | Additive, nullable |
| 2026-11-19 | | `atelier-workflow-builder.ts`: `createAtelierWorkflowFamily`, `describeAtelierWorkflowDefinition`, `listAtelierWorkflowFamilies`, `resolveActiveAtelierWorkflowName`, `selectAtelierWorkflowFamily`; `publishAtelierWorkflowDraft` lưu `publishedSummary` | |
| 2026-11-19 | | `atelier-workflow-orchestration.ts`: `ensureAtelierCompanyWorkflowDefinition` đọc selection trước khi fallback tên mặc định | Giữ nguyên hành vi company chưa opt-in |
| 2026-11-19 | | 3 route board-only trong `atelier-bridge.ts`: `GET/POST /atelier/workflow/families`, `POST /atelier/workflow/families/:name/select` | |
| 2026-11-19 | | Test mới: `atelier-workflow-family-selection.test.ts` (embedded Postgres, 8 test, AC-01..AC-06) + 2 test đơn vị `describeAtelierWorkflowDefinition` trong `atelier-workflow-builder.test.ts` | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-19 | | `packages/db`: `npx tsc --noEmit` | Pass, không lỗi | |
| 2026-11-19 | | `npx drizzle-kit generate` | Sinh đúng 1 migration additive (CREATE TABLE + ADD COLUMN nullable), `check-migration-numbering`/`check-migration-safety` pass | `0450_feat_2026_134_atelier_workflow_family_selection.sql` |
| 2026-11-19 | | `server/`: `npx tsc --noEmit` | Không lỗi nào trong các file đã sửa; lỗi còn lại là rootDir/cross-package pre-existing đã biết (next.md), không liên quan | |
| 2026-11-19 | | `pnpm exec vitest run server/src/__tests__/atelier-workflow-builder.test.ts server/src/__tests__/atelier-workflow-family-selection.test.ts --maxWorkers 1` | 14/14 pass (10 builder + 8 family mới, trùng 4 cũ) | |
| 2026-11-19 | | `pnpm exec vitest run` toàn bộ atelier test liên quan (10 file, gồm cả FEAT-2026-133) | 76/78 pass; 2 fail là lỗi pre-existing không liên quan (đã xác nhận bằng cách tạm revert code CR-003, lỗi vẫn giống nhau, ghi trong next.md) | |

## 14. Kết quả và đóng chức năng

- Kết quả: Chưa hoàn tất.
- Hạn chế còn lại:
- Việc chưa hoàn tất: Implementation.
- Rollback point:
- Trạng thái `CLOSED` bởi:
- Thời điểm:
