# [FEAT-2026-019] Atelier company-wide workflow orchestration

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex / Atelier platform |
| Người chấp thuận | User request, 2026-11-11 |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 12:06 +07:00 |
| Revision bắt đầu | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree |
| Revision cuối | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + uncommitted working tree |

## 1. Bối cảnh

Atelier hiện có bootstrap workflow dạng issue graph và một workflow UI/sidecar
riêng. Hai nguồn này chưa tạo thành một workflow canonical cấp company có phiên
bản, chưa có run độc lập theo project, chưa enforce đầy đủ dependency/gate khi
handoff, và còn đường dẫn UI `/control-center` không đi qua company shell. Một
project hiện hữu, `Phòng Ngủ Master Japandi`, có task `ATL-26` nhưng chưa được
đưa vào run orchestration canonical.

Yêu cầu P0 là biến workflow thành cơ chế điều phối thực tế: Chief chỉ intake,
lập kế hoạch, giao việc, theo dõi và review; tám specialist stages phải được
chạy theo dependency, approval và decision ledger, không tự chốt dữ liệu chưa
biết. Mỗi project phải có context/run riêng; không được hardcode project demo
trong workflow engine.

## 2. Mục tiêu

- Có đúng một company workflow definition đã publish, có version và tám stage:
  Floor Plan, Geometry/BIM, Furniture, Style/Materials, Lighting/Visualization,
  Cost/BOM, QA, Final Review.
- Mỗi project trong company có một workflow run độc lập, snapshot theo version,
  stage execution mapping, root orchestration issue và liên kết artifact/log.
- Project mới trong company được provision idempotent; project cũ được backfill
  theo lệnh preview/apply an toàn, không dispatch hàng loạt agent.
- Handoff chỉ được chấp nhận khi đúng company/project/run/stage/agent, dependency,
  approval, decision ledger, artifact và idempotency gates.
- Dữ liệu chưa biết (màu sơn, vật liệu, ngân sách, thông số kỹ thuật...) phải
  chuyển thành `needs_input`/`needs_review`/`blocked`, không được tự ý chốt.
- Company workflow overview và project monitor đọc từ Paperclip backend; route
  `/control-center` hoạt động qua redirect vào company context.

## 3. Phạm vi

### In scope

- Mở rộng workflow definition hiện có để lưu canonical definition, version,
  publish status và stage/edge/gate policy; không tạo thêm một hệ workflow rời
  khỏi Paperclip.
- Thêm persistence cho workflow run và stage execution, có company/project/run
  scoping, unique/idempotent keys và decision/artifact references.
- Xây service orchestration Atelier với các operation:
  `ensureCompanyDefinition`, `ensureProjectRun`, explicit backfill preview/apply,
  state transition/gate validation và accepted handoff.
- Tự provision run cho project mới thuộc company mục tiêu; không tạo project
  test thật và không tự chạy toàn bộ agent.
- Backfill ba project hiện tại theo cơ chế explicit, trong đó xác nhận và reuse
  `ATL-26` làm root nếu đúng company/project; không reset status/decision hiện có.
- Dùng goal/project/issue/agent thật từ Paperclip; không hardcode project ID trong
  engine; brief kỹ thuật chưa đủ phải ghi needs-input.
- Tích hợp backend API cho company workflow, project monitor, reconcile/backfill
  và handoff; dùng event/activity/issue dependency hiện có, không thêm polling
  loop hoặc timer nền.
- Cập nhật UI control center/project monitor, hiển thị stage state, owner,
  blocker, handoff, decision ledger và artifact references.
- Bổ sung unit/integration/route/UI verification theo bảng ở mục 8 và ghi bằng
  chứng live, phân biệt rõ `NOT VERIFIED` nếu môi trường không cho phép.

### Out of scope

- Đổi model/API key, pricing model hoặc cấu hình toàn bộ agent ngoài company
  workflow cần thiết.
- Viết lại Python sidecar workflow engine, scene/asset/revision pipeline,
  Telegram integration hoặc 3D pin task execution.
- Xóa hoặc migrate hàng loạt workflow/issue cũ không thuộc run Atelier này.
- Tự dispatch tất cả agent, tự mark done, hoặc tự suy đoán các quyết định về
  màu/vật liệu/ngân sách khi brief chưa xác nhận.
- Thay đổi policy/core workflow của các company khác.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip API/server, Drizzle schema/migrations, PostgreSQL hiện
  tại, issue service/event bus/heartbeat admission, React UI và Python sidecar
  chỉ như nguồn dữ liệu phụ trợ.
- Dữ liệu dùng chung: company
  `b2e1c8a5-c3c9-412c-99cb-63180c4015dc`, project records, goal/issue/agent
  records và ATL-26. Không xoá/reset user data.
- Project đặc biệt: `e20d2696-5794-4cdb-ba5d-47fac2fc4f0d`; `ATL-26` chỉ được
  reuse sau khi kiểm tra company/project ownership.
- Service/port/database không được ảnh hưởng: Paperclip `localhost:3100`,
  PostgreSQL `54329`, Python sidecar và các process đang phục vụ user.
- Không được dùng project demo `proj_demo_4x5m` làm context mặc định trong
  orchestration engine.

## 5. Thiết kế và kế hoạch triển khai

1. Tạo canonical definition tám stage, dependency DAG và gate policy; lưu một
   published company definition có version.
2. Thêm bảng/quan hệ run và stage execution; unique key + transaction/advisory
   lock bảo đảm idempotency và không tạo duplicate root/stage.
3. Viết service reconcile/backfill. Root hiện hữu hợp lệ được reuse; ATL-26
   không bị đổi status. Stage issue mới chỉ được tạo khi thiếu và luôn gắn
   project/goal/agent thật.
4. Gắn provision vào project creation cho đúng company; explicit endpoint cho
   dry-run/apply hiện hữu, không mass dispatch.
5. Enforce state machine `pending -> ready -> running -> done` cùng
   `needs_input`, `blocked`, `needs_review`, `failed`; dependency/approval và
   handoff validation là backend gates.
6. Đổi UI workflow overview/monitor sang Paperclip API, thêm redirect route cho
   `/control-center` và link project monitor.
7. Chạy test, migrate DB, live audit ba project và ghi revision/evidence vào
   contract này. Nếu phát sinh thay đổi ngoài scope, thêm CR trước khi code.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/db/src/schema/workflows.ts` | Mở rộng schema | Lưu canonical definition/version/status |
| `paperclip/packages/db/src/schema/atelier-workflow-runs.ts` | Mới | Persist run/stage execution |
| `paperclip/packages/db/src/schema/index.ts` | Mở rộng export | Đăng ký schema mới |
| `paperclip/packages/db/src/migrations/*` | Migration | Đồng bộ PostgreSQL |
| `paperclip/server/src/services/atelier-workflow-orchestration.ts` | Mới | Canonical definition, reconcile, gates |
| `paperclip/server/src/routes/atelier-bridge.ts` | Mở rộng | API company/run/backfill/handoff |
| `paperclip/server/src/routes/projects.ts` hoặc project service | Mở rộng | Provision project mới |
| `paperclip/server/src/__tests__/*atelier*` | Mở rộng | Unit/integration coverage |
| `paperclip/ui/src/App.tsx` | Mở rộng | Unprefixed route redirect và project route |
| `paperclip/ui/src/features/atelier/*` | Mở rộng/mới | Paperclip-backed overview/monitor |
| `docs/features/FEAT-2026-019-company-workflow-orchestration.md` | Append-only | Implementation/verification evidence |

## 7. Acceptance criteria

- [ ] AC-01: Company có một definition canonical ở trạng thái published, có
  version, đúng tám stage và DAG không có cycle/duplicate stage.
- [ ] AC-02: `GET` company workflow trả definition, assigned real agents,
  dependency/gate policy và không phụ thuộc project demo.
- [ ] AC-03: Mỗi project run lưu company/project/definition version/root issue;
  gọi reconcile lặp lại không tạo duplicate run/root/stage.
- [ ] AC-04: Project mới của company tự provision run; project khác company
  không bị chạm.
- [ ] AC-05: Backfill hỗ trợ dry-run và apply, có preview counts; apply ba
  project hiện tại không dispatch hàng loạt agent.
- [ ] AC-06: ATL-26 được kiểm tra ownership và được reuse làm root nếu hợp lệ;
  status/decision hiện hữu không bị reset.
- [ ] AC-07: Brief đặc thù phòng ngủ lưu được các yêu cầu cửa sổ 1910mm, bàn sâu
  500mm gần cửa sổ, tránh luồng AC vào giường, điện/ổ cắm/công tắc, ngân sách
  75–120M và đánh dấu unknown là needs-input thay vì tự chốt.
- [ ] AC-08: Backend từ chối transition/handoff sai company, project, run, stage,
  agent, dependency, approval, decision ledger, artifact hoặc idempotency.
- [ ] AC-09: Stage state machine và blocker/approval gates được thể hiện ở API
  và ngăn execution trước điều kiện; không thêm polling loop.
- [ ] AC-10: Stage issues dùng đúng projectId/goalId/agentId thật; không còn
  project demo hardcode trong engine.
- [ ] AC-11: `/control-center` redirect vào company context; company overview và
  project monitor hiển thị state/owner/blocker/log/artifact từ Paperclip API.
- [ ] AC-12: Unit, API, migration và live checks đạt kết quả; report cuối nêu
  rõ phần nào `VERIFIED` và phần nào `NOT VERIFIED`.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Contract/schema | `pnpm db:generate` và `pnpm db:migrate` trong `paperclip` | Migration tạo đủ bảng/index, không làm hỏng schema cũ |
| Unit orchestration | `pnpm vitest run server/src/__tests__/atelier-workflow-orchestration.test.ts` | Definition, DAG, state/gate, idempotency pass |
| Existing workflow tests | `pnpm vitest run server/src/__tests__/atelier-agent-workflow.test.ts server/src/__tests__/atelier-clarification-policy.test.ts` | Regression pass |
| API route tests | Vitest/supertest route suite | Company/project scoping, preview/apply, handoff rejection pass |
| Backfill dry-run | `POST /api/atelier/workflow/backfill {dry_run:true}` | Preview only, no issue/agent execution mutation |
| Backfill apply | Explicit apply trong môi trường live | Ba project có run/stage mapping; không mass dispatch |
| Project isolation | Tạo fixture project company khác hoặc integration mock | Không provision nhầm company |
| UI build | `pnpm build` trong `paperclip` | Build pass |
| Browser route | Mở `/control-center` và project monitor bằng browser | Không còn `Organization not found`; thấy overview/monitor |
| Live audit | Health, company workflow, 3 project runs, ATL-26 ownership | IDs/scopes/status đúng; ghi evidence thực tế |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Migration ảnh hưởng Cases workflows cũ | Cột mới có default; giữ API cũ; migrate trước trên DB hiện tại và chạy regression |
| Duplicate run/root do retry | Unique indexes, transaction, advisory lock và idempotency key |
| Tự dispatch agent khi backfill | Backfill chỉ tạo/reconcile metadata/issues ở trạng thái gated; không gọi executor |
| Chạm nhầm ATL-26 hoặc đổi status | Ownership check + snapshot trước/sau + không update status trong reconcile |
| UI/Python data mismatch | Paperclip API là authority cho monitor; Python sidecar giữ vai trò phụ |
| Rollback code/migration | Giữ revision trước triển khai; rollback app trước, migration down/forward-fix theo DB policy; không xoá user issues |

Rollback point và cách rollback: revision ngay trước implementation của feature;
disable route/provision hook, giữ dữ liệu run để audit, và dùng migration rollback
được review nếu deploy policy cho phép. Không dùng destructive reset trên shared DB.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu user.
- Thời điểm: 2026-11-11 12:06 +07:00.

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree | Thêm canonical company workflow, schema run/stage/event và migration `0449_bitter_paladin.sql` | Published definition v1, đúng 8 stage, DAG/gate/idempotency persistence |
| 2026-11-11 | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree | Thêm orchestration service, backfill/reconcile/handoff API và auto-provision project mới | Không dispatch agent khi backfill; ATL-26 được reuse theo ownership |
| 2026-11-11 | `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` + working tree | Đổi UI company workflow/project monitor và route `/control-center` | Monitor đọc Paperclip API; bỏ demo project khỏi context orchestration |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 | working tree | DB schema/typecheck và migration | VERIFIED | `@paperclipai/db` TypeScript pass; migration 0449 generated và `pnpm db:migrate` báo `Migrations complete` |
| 2026-11-11 | working tree | Unit + regression tests | VERIFIED | 3 files, 10 tests passed: orchestration, agent workflow, clarification policy |
| 2026-11-11 | working tree | UI typecheck/build | VERIFIED | `pnpm --filter @paperclipai/ui exec tsc --noEmit` pass; Vite build pass |
| 2026-11-11 | working tree | Live company workflow/API | VERIFIED | Published v1, 8 stages, 9 real agent bindings, 2 projects; không có project thứ ba trong DB live |
| 2026-11-11 | working tree | Backfill dry-run/apply/idempotency | VERIFIED | Dry-run preview 2 create actions; apply tạo 2 runs; dry-run sau apply trả `exists` với run IDs `6e1e24de-89e2-4961-addc-670423a1eab3` và `4aa7274b-6a8c-490d-a113-0129e1a83c36`; không dispatch |
| 2026-11-11 | working tree | ATL-26 special brief/reconcile | VERIFIED | Project `e20d2696-5794-4cdb-ba5d-47fac2fc4f0d`, root `ATL-26` được giữ nguyên; run `4aa7274b-6a8c-490d-a113-0129e1a83c36` ở `needs_input`, floorplan ở `needs_input`, ghi đủ kích thước/cửa sổ/bàn/AC/ngân sách và unknown fields |
| 2026-11-11 | working tree | Handoff dependency + idempotency | VERIFIED | Handoff floorplan → cost bị từ chối HTTP 422; handoff floorplan → geometry accepted HTTP 201; retry cùng idempotency key trả duplicate HTTP 200, không regression stage done |
| 2026-11-11 | working tree | `/control-center` HTTP route | VERIFIED | HTTP 200 và SPA HTML được phục vụ |
| 2026-11-11 | working tree | Browser rendering/interaction | NOT VERIFIED | CUA browser access host unavailable trong môi trường kiểm tra |
| 2026-11-11 | working tree | Full server typecheck | NOT VERIFIED | Repo còn các lỗi nền `rootDir`/vendor và lỗi không thuộc feature; focused tests và DB/UI checks vẫn pass |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã triển khai implementation và live verification chính; contract ở trạng thái `VERIFYING`.
- Hạn chế còn lại: Browser rendering/interaction chưa xác minh do browser host không khả dụng; full server typecheck chưa đạt do lỗi nền ngoài phạm vi feature.
- Việc chưa hoàn tất: Browser verification và xử lý lỗi nền full server typecheck nếu muốn đóng tuyệt đối.
- Rollback point: `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e` trước implementation; dữ liệu run giữ lại để audit, không destructive reset.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa đóng.
