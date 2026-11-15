# Báo cáo sửa Telegram, multi-agent và ghế băng phòng ngủ

Ngày kiểm chứng: 15/11/2026. Code làm việc trên `master`, gốc
`3d28633d74942afcf640b5eb3930a908abc03712`; chưa commit/push trong đợt sửa này.

**Kết quả:** ghế đã được agent thêm thật vào dữ liệu phòng ngủ, lưu revision 2,
retry không nhân đôi, QA dữ liệu độc lập hoàn tất. Chưa nghiệm thu toàn bộ yêu cầu:
chưa có ảnh chụp viewport thật và chưa chứng nhận toàn phòng đạt yêu cầu lối đi.

## A. Lỗi, nguyên nhân và cách sửa

| Lỗi thực tế | Sửa và bằng chứng |
| --- | --- |
| ATL-15 hỏi lại dữ liệu phòng ngủ, đang gắn native project phòng khách; scene phòng ngủ có sẵn nhưng chưa liên kết workspace | Khởi tạo workspace, liên kết scene có sẵn qua API, chuyển task về native project phòng ngủ. Telegram lưu lựa chọn dự án riêng cho từng chat và gửi URL/ID/revision chuẩn vào task. Không đoán scene đầu tiên. |
| UUID/identifier task bị diễn giải theo số ở cuối, có nguy cơ trả nhầm task | Tra cứu chính xác UUID, identifier hoặc số task trong đúng company. Regression test gồm trường hợp khác company và UUID không tồn tại. |
| Task đã lưu hoặc đã kết thúc lượt chạy vẫn được báo như đang xử lý | Dùng display status của control plane; ack tạo task chỉ xác nhận queued/running khi có kết quả dispatch tương ứng. Comment có chữ `status` không được coi là cập nhật trạng thái. |
| Handoff tạo task nhưng không gọi cơ chế đánh thức agent | Tạo task qua issue service, chỉ enqueue task mới có dependency đã giải quyết; retry idempotent không enqueue trùng. Kiểm thử 14 trường hợp và handoff thật ATL-15 → ATL-18. |
| Scene adapter dùng sai identity/endpoint; validation từng trả kết quả cố định | Read dùng canonical `project_id`; validate trả phép kiểm tra hình học thật. Thêm API add-only có revision, khóa theo scene và receipt idempotency. Chức năng chưa hỗ trợ trả lỗi rõ ràng. |
| Ghi scene/MCP không có đường thêm ghế bền vững | Tạo geometry ghế bằng `add_object` thật; kiểm tra MCP thành công trước khi SQLite CAS. Lưu node mapping, script/GLB artifacts và receipt trong cùng revision. Không giữ transaction database trong lúc chờ MCP. |
| Tải lại Pascal dùng `bridge.loadScene`, hàm không có trong SDK; exception bị nuốt và dùng scene mặc định | Dùng `loadJSON`, không fallback nếu snapshot lỗi. Kiểm tra tiến trình Pascal mới vẫn có node ghế, 8 item và 14 artifact. |
| Hình học nhầm thảm hoặc các đồ khác cao độ là va chạm; giá trị mặc định có thể giả làm khoảng hở đo được | Loại thảm mỏng khỏi kiểm tra vật thể rắn, xét độ cao và trả unknown nếu không đo được. Kiểm tra thêm mới tách khỏi cảnh báo baseline. Khoảng cách giữa hai món không tự chứng minh lối tiếp cận. |
| Renderer chưa có ghế băng riêng; z và tọa độ 0 bị xử lý sai | Ghế có seat/frame/legs và kích thước đo bằng THREE bounds; dùng z làm cao độ đáy và toán tử nullish cho tọa độ. |
| Tab `3d-studio` có navigation nhưng thiếu đăng ký route | Thêm route có/không company prefix, giữ alias `studio`; bỏ nút dùng scene demo thay project chưa liên kết, bỏ scene archived khỏi lựa chọn. |
| Script chạy đòi `start_pg.cmd` không tồn tại sau khi dừng server | Cho Paperclip mở lại cluster embedded PostgreSQL đã tồn tại. Khởi động thật thành công, giữ nguyên dữ liệu. |

## B. File thay đổi thuộc đợt sửa này

- `apps/api/app/main.py`: đăng ký router thêm đồ; giữ các chỉnh sửa đang có của người dùng.
- `apps/api/app/services/scene_furniture.py`: schema, kiểm tra vật thể, MCP, CAS, receipt và readback.
- `apps/api/app/services/geometry.py`: kiểm tra thảm/cao độ/khoảng hở thực.
- `packages/pascal-adapter/canonical-furniture.mjs`, `gateway.mjs`, `package.json`, `package-lock.json`: geometry được biên dịch thật, import/export snapshot và artifacts.
- `paperclip/server/src/routes/atelier-scene.ts`, `atelier-bridge.ts`: scene adapter có scope native project; native project typing và handoff.
- `paperclip/server/src/services/atelier-workflow-handoff.ts`: dispatch có kiểm tra dependency/deduplication.
- `paperclip/server/src/routes/atelier-telegram.ts`: board API chọn project cho chat.
- `paperclip/server/src/services/atelier-telegram/{config,types,project-context,task-manager,poller,task-status}.ts`: lựa chọn dự án, ngữ cảnh, tạo task và báo trạng thái.
- `paperclip/server/src/services/atelier-clarification-policy.ts`: đọc scene trước khi hỏi lại; hoàn tất review và native disposition đúng phạm vi. Bundle của Furniture và QA được cập nhật qua API có kiểm tra hash, không ghi đè tùy tiện.
- `paperclip/ui/src/App.tsx`, `features/atelier/Project3DStudioTab.tsx`, `StudioViewport.tsx`, `proceduralFurniture.ts`: route, scope và hình học ghế. Những file có chỉnh sửa từ trước được giữ lại.
- `scripts/start-paperclip.ps1`, `restart-atelier-after-update.ps1`, `test-isolated-backend.py`: khởi động, restart có kiểm tra owner/live runs, kiểm thử không đụng database dự án thật.
- Các regression tests `atelier-scene`, `atelier-workflow-handoff`, `atelier-telegram-*`, `project-context`, `project-selection-config`, `proceduralFurniture`, `tests/test_scene_furniture.py` và feature spec `docs/features/FEAT-2026-033-telegram-scene-task-recovery.md`.

Không nhận các thay đổi đang có từ trước trong `AtelierDesignStudioPage`,
`AtelierStudioContext`, `ObjectInspector`, `.venv`, `apps/web` là toàn bộ công việc
của đợt sửa này. Không reset, stage toàn bộ hoặc push những file đó.

## C. Agent và task thực tế

| Task | Agent | Kết quả thực tế |
| --- | --- | --- |
| ATL-17 | QA & Validation Specialist | `done`: review bố trí trước khi ghi; sửa phương án y=2900 thành y=2450, z=0 để giữ khoảng trống 790 mm trước tủ. |
| ATL-15 | Furniture Planner | `done` cho bước triển khai: POST thêm ghế thật, POST lại cùng envelope nhận `replayed=true`, GET xác minh revision 2 và 8 món. |
| ATL-18 | QA & Validation Specialist | `done` cho review dữ liệu: kiểm tra độc lập baseline, geometry, node/artifact, vật thể cũ và cảnh báo. PASS trong phạm vi thêm ghế, không phê duyệt toàn phòng. |

Run ghi ghế: `7b7708c0-aec5-497c-be3e-69ff14ec0865` (`succeeded`).
Run hoàn tất disposition ATL-15: `389480cc-57d2-40e4-acdb-e23e24edfaec` (`succeeded`).
Run QA sau ghi: `a3c440dd-723f-432c-851b-a968eceb8588` (`succeeded`).

Đây là chuỗi task/handoff tăng thêm trên dự án có sẵn, không phải một lần chạy
workflow tổng thể mới. Không tạo hoặc bịa một `workflow_run_id` riêng; các run ID
trên là heartbeat execution thật của agent. Các task cũ không liên quan chưa được
đổi thành done để làm đẹp phần trăm tiến độ.

## D. Diễn biến workflow và recovery

1. Đọc task/run/scene, sửa liên kết native project → canonical bedroom.
2. Chạy QA độc lập trước khi thêm. Bố trí 600 mm sau giường của yêu cầu cũ chỉ còn
   340 mm trước tủ, nên dùng bố trí đã review theo yêu cầu hiện tại.
3. Khởi động lại bản sửa. Lần restart công cụ bị policy từ chối; người dùng chạy
   script và gặp thiếu launcher PostgreSQL. Sửa startup, khởi động cluster cũ thành công.
4. `resume:true` trên task `in_review` bị API từ chối đúng quy tắc. Chuyển bước
   triển khai về `todo` bằng API công việc kèm chỉ đạo đầy đủ; agent được dispatch.
5. Agent ghi ghế và kiểm tra replay. Lượt đầu chỉ viết `needs_review` trong comment
   nên control plane chạy recovery; làm rõ phạm vi implementation và yêu cầu ghi
   disposition qua API. Agent đã thực hiện, task kết thúc thật, không sửa trực tiếp DB.
6. POST `/api/atelier/workflow/handoff` từ ATL-15 tới QA tạo ATL-18 và tự dispatch.
   Gửi lại cùng payload trả `duplicate=true`, cùng task ID; không tạo task mới.
7. QA ATL-18 hoàn tất. Readback riêng của parent và load lại bằng Pascal mới đều đạt.
   Kiểm tra cuối: không còn live agent run; Telegram `polling`, `lastError=null`.

## E. Kiểm thử

Từ root repo:

```powershell
.venv\Scripts\python.exe scripts/test-isolated-backend.py tests/test_acceptance.py tests/test_workflow_runtime_contract.py tests/test_concurrent_dag_scheduler.py tests/test_japandi_bedroom_project.py tests/test_scene_furniture.py -q
```

**44 passed**, một warning pytest về anyio đã được import. Dùng SQLite/data/export
tạm, không ghi lên dữ liệu dự án thật; có bài chạy Pascal thật và reload snapshot.

Từ `paperclip/server`:

```powershell
pnpm.cmd exec vitest run src/__tests__/atelier-scene.test.ts src/__tests__/atelier-clarification-policy.test.ts src/__tests__/atelier-telegram-project-selection-route.test.ts src/__tests__/atelier-telegram-project-selection.test.ts src/__tests__/atelier-telegram-task-lookup.test.ts src/__tests__/atelier-telegram-status-reporting.test.ts src/services/atelier-telegram/project-context.test.ts src/services/atelier-telegram/project-selection-config.test.ts src/__tests__/atelier-workflow-handoff.test.ts
```

**90 passed / 9 files**; các bài database dùng PostgreSQL thử nghiệm riêng.

Từ `paperclip/ui`:

```powershell
pnpm.cmd exec vitest run src/features/atelier/proceduralFurniture.test.ts src/features/atelier/cameraNavigation.test.ts
pnpm.cmd exec tsc --noEmit -p tsconfig.json
```

**5 passed / 2 files**, UI typecheck đạt sau sửa route. Tổng các bài trên: **139 passed**.
`git diff --check` đạt. Script PowerShell mới parse được và startup thực tế đã đạt.

Giới hạn kiểm thử:

- Full server `tsc --noEmit -p tsconfig.json` chưa đạt: nhóm lỗi runner nằm ngoài
  `rootDir` (TS6059), vendor imports/type issues. Log ở
  `.atelier-logs/feat033/server-typecheck.log`; lần cuối không có lỗi được báo trong
  các file Atelier đã sửa. Không tuyên bố toàn bộ build sạch.
- `pnpm.cmd verify --explain` yêu cầu broader CI do thay dependency package;
  exit 2 không phải kết quả pass CI. Các job build/release/docker/browser/platform
  chưa được xác minh. Không merge/push trong đợt này.
- `tests/verify_e2e_browser.py` được nhắc trong yêu cầu không tồn tại trong checkout.
  Test runtime thực tế là `test_workflow_runtime_contract.py`; không giả báo đã chạy
  file không tồn tại.

## F. Bằng chứng dữ liệu và phần trực quan còn thiếu

Các bằng chứng cục bộ đã lưu trong `.atelier-logs/feat033/`:

- `bedroom-before.json`, `bedroom-after.json`: baseline 7 món và dữ liệu sau ghi 8 món.
- `live-scene-evidence.json`: so sánh tất cả đồ cũ và room/wall/opening/window, node ghế,
  kích thước, vị trí, collision/gap; chỉ metadata Pascal node IDs được tái sinh.
- `qa-handoff.json`: task, parent và handoff thật.
- `reopened-scene-evidence.json`: Pascal mới load snapshot, vẫn 8 item, đúng node ghế,
  14 artifacts và cảnh báo `door_blocked` được giữ nguyên.

**Không có screenshot viewport được xác minh.** Computer Use dừng do không xác định
được URL hiện tại đủ chắc chắn để thi hành policy trên Windows. Không dùng cơ chế
khác để vượt chặn, không dùng ảnh dựng thay screenshot. Geometry/unit tests và HTTP
thành công không chứng minh renderer trên trình duyệt thực tế đã hiển thị đúng.

## G. Hệ thống và cách mở lại

- Ứng dụng: `http://127.0.0.1:3100`.
- Phòng ngủ: `http://127.0.0.1:3100/ATL/projects/eb654960-2510-46d6-ade9-ea68a70bf64f/3d-studio`.
  Route được sửa trong mã, chưa được điều khiển trực tiếp để xác minh viewport.
- Canonical scene: `proj_bedroom_japandi_4x4m`, revision **2**.
- Ghế mới: `bench_atl15_japandi`; Pascal node `item_gut0zyozqsat9m8u`.
- Tọa độ canonical: **(2095, 2450, 0) mm**; xoay **0°**; kích thước **1200 × 400 × 450 mm**.
- Pascal: vị trí **[2.095, 0, 2.45] m**; 5 parts, 60 triangles; artifact thật được lưu.
- Khoảng hở: giường **150 mm**, tủ **790 mm**, bàn phấn **878.08 mm**, kệ TV **1120 mm**.
- Giá ghế: **chưa có giá**; `price_vnd=0` là quy ước chưa biết, không phải hàng miễn phí.
- Cảnh báo baseline: vùng mở cửa vướng tủ; min pair gap **45 mm** trong toàn scene.
  Không di chuyển đồ không liên quan để xóa cảnh báo; chưa chứng nhận đường di chuyển toàn phòng.

Khởi động bình thường từ `C:\QLDAPM-final\interiorAI`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-paperclip.ps1
```

Sau khi đổi mã cần restart, khi không có agent đang chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-atelier-after-update.ps1
```

Telegram hiện chọn native project phòng ngủ. Có thể dùng `/projects` rồi
`/project <native-project-id>` để đổi dự án; `/task ATL-15` và `/task ATL-18` để xem
các bước đã hoàn tất. `/progress` là tổng công việc của công ty, không phải phần trăm
riêng của thao tác thêm ghế.

**Chưa đánh dấu nghiệm thu toàn bộ feature:** còn kiểm tra viewport và ảnh chụp thật;
CI toàn repo và các cảnh báo bố trí cũ cũng chưa được đóng.
