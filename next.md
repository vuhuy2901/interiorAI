# Việc cần tiếp tục — FEAT-2026-133 Atelier

Cập nhật: 2026-11-19 (Asia/Saigon)

## Trạng thái hiện tại

- Paperclip: `http://127.0.0.1:3100`; Python API: `http://127.0.0.1:8000`; PostgreSQL: `54329`.
- Workflow run hiện có: `512eb2a5-eca4-41ef-bcbc-491637f4e299`.
- Project mới: `0b8cecc9-ccb2-4cb5-892b-de5d2cbfdcfd`; scene: `proj_ef7d0089`.
- Root: `ATL-141`; stage tasks: `ATL-142` đến `ATL-151`.
- Đã xác nhận: `ATL-142` brief `done`, `ATL-143` floorplan `done`, `ATL-144` floorplan QA `ready`; các stage còn lại chờ graph dispatch.
- Nguồn `ATL-139` được giữ nguyên; không tạo run/task mới và không chạy recovery `--apply` lần nữa.

## Bước tiếp theo

Chạy tại `C:\QLDAPM-final`:

```powershell
$base = 'http://127.0.0.1:3100'
$runId = '512eb2a5-eca4-41ef-bcbc-491637f4e299'

# Kiểm tra server; local_trusted nên không cần bearer token cho GET
Invoke-RestMethod "$base/api/health"

# Xem trạng thái 10 stage, chỉ đọc
$workflow = Invoke-RestMethod "$base/api/atelier/workflow/runs/$runId"
$workflow.stages | ForEach-Object {
  [pscustomobject]@{
    node = $_.nodeId
    status = $_.status
    taskId = $_.issueId
    executionRunId = $_.executionRunId
  }
} | Format-Table -AutoSize

# Xem chi tiết ATL-144 đến ATL-151, chỉ đọc
'ATL-144','ATL-145','ATL-146','ATL-147','ATL-148','ATL-149','ATL-150','ATL-151' |
  ForEach-Object { Invoke-RestMethod "$base/api/issues/$_" } |
  Format-List
```

Endpoint workflow là `GET /api/atelier/workflow/runs/{runId}`. Endpoint issue là `GET /api/issues/{identifier}`. Chỉ dùng retry nếu task thực sự `failed`, qua `POST /api/issues/{issueUuid}/retry` với UUID `idempotencyKey` và `observedRunId`; không retry khi chỉ là `ready` hoặc `pending`.

## Việc còn phải hoàn tất

1. Theo dõi QA → geometry → style/furniture song song → cost/render song song → final QA → delivery.
2. Kiểm tra owner, blocker, output/document và canonical scene revision ở mỗi handoff.
3. Để người dùng duyệt output cuối trong UI; không tự accept.
4. Cập nhật feature contract `docs/features/FEAT-2026-133-canonical-specialist-workflow.md`: đổi bảng version thành `1.1`, ghi evidence thực tế và giới hạn còn lại.
5. Không reset/checkout/clean working tree. Không chạy `purge_pg.js`, `clean_sqlite.py` hoặc recovery `--apply`.

## Kiểm thử đã qua

- Focused Vitest: `63 passed / 8 files`.
- Python focused tests: `21 passed`.
- Có integration coverage cho dedupe/restart, full graph, QA rework và final human acceptance.
- Typecheck toàn server còn lỗi rootDir/cross-package vốn có; token gate còn lỗi UI cũ không liên quan.

## Log

- Restart: `interiorAI/.atelier-logs/restart-atelier.log`
- Paperclip: `%USERPROFILE%\\.paperclip\\instances\\default\\logs\\paperclip-stdout.log` và `paperclip-stderr.log`
- API: `interiorAI/.atelier-logs/api-stdout.log` và `api-stderr.log`
