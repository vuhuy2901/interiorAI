# [FEAT-2026-013] Dọn dẹp các script nháp tạm thời trong scratch và cache build

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |
| Revision bắt đầu | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |
| Revision cuối | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |

## 1. Bối cảnh

Trong các đợt kiểm thử audit, debug live agent và xác thực asset builder (FEAT-2026-005, FEAT-2026-010, FEAT-2026-011, FEAT-2026-012), nhiều file script nháp tạm thời (`scratch/audit_asset_builder.py`, `scratch/inspect_agents.py`, `scratch/inspect_atl1.py`, `scratch/inspect_paperclip_live.py`, `scratch/query_live_agents.py`, `scratch/test_trap_asset_builder.py`, `scratch/verify_world_bounds.py`) và cache Python/pytest (`.pytest_cache/`, `__pycache__/`) được sinh ra và chưa được dọn dẹp, gây rác workspace và làm rối danh sách file untracked.

Người dùng yêu cầu dọn sạch nhóm script nháp tạm thời và cache build này.

## 2. Mục tiêu

1. Dọn sạch 100% các file script nháp tạm thời không theo dõi (untracked) trong thư mục `scratch/`.
2. Dọn sạch thư mục `.pytest_cache/` và toàn bộ các thư mục `__pycache__/` trong dự án.
3. Bảo toàn tuyệt đối các file test đã được commit trong `scratch/`, toàn bộ mã nguồn của hệ thống và tính năng database backup trong `paperclip`.

## 3. Phạm vi

### In scope

- Xóa các untracked script trong `scratch/`:
  - `scratch/audit_asset_builder.py`
  - `scratch/inspect_agents.py`
  - `scratch/inspect_atl1.py`
  - `scratch/inspect_paperclip_live.py`
  - `scratch/query_live_agents.py`
  - `scratch/test_trap_asset_builder.py`
  - `scratch/verify_world_bounds.py`
- Xóa cache:
  - Thư mục `.pytest_cache/` ở thư mục gốc.
  - Toàn bộ các thư mục `__pycache__/` trong `apps/`, `scripts/`, `tests/` và các gói liên quan.

### Out of scope

- Các file script/test đã theo dõi trong Git nằm tại `scratch/` (`generate_test_samples.py`, `run_full_system_audit.mjs`, `run_test_e2e_001.mjs`, `run_test_e2e_001_real.mjs`, `test_agent_prompt_system.mjs`, `test_atelier_continuous_upgrades.mjs`, `test_telegram_agent_command_center.mjs`, `test_unified_integration.mjs`).
- Toàn bộ mã nguồn cốt lõi của tính năng Paperclip database backup (`paperclip/packages/db/src/backup*`, `paperclip/server/src/services/*backup*`, `scripts/backup-db.sh`, v.v.).
- Thư mục `data/backup_pre_paperclip/` và các nhánh Git backup (theo lựa chọn phạm vi của người dùng).

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Python 3.11+, Pytest, FastMCP, Paperclip runtime.
- Dữ liệu dùng chung: Cấu hình IDE bridge, data catalog, seed samples.
- Service/port/database không được ảnh hưởng: Không chạm vào tiến trình Paperclip (`:3100`), PostgreSQL (`:54329`) hay backend FastAPI (`:8000`).

## 5. Thiết kế và kế hoạch triển khai

1. Kiểm tra danh sách chính xác các file untracked trong `scratch/` trước khi xóa.
2. Xóa các file script nháp tạm thời trong `scratch/`.
3. Quét và xóa thư mục `.pytest_cache/` và các thư mục `__pycache__/`.
4. Chạy kiểm tra `pytest tests/test_ide_bridge.py` để chứng minh hệ thống hoạt động hoàn hảo sau dọn dẹp.
5. Kiểm tra `git status` để xác nhận workspace sạch sẽ.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `scratch/audit_asset_builder.py` | Delete | Script audit tạm thời |
| `scratch/inspect_agents.py` | Delete | Script inspect tạm thời |
| `scratch/inspect_atl1.py` | Delete | Script inspect tạm thời |
| `scratch/inspect_paperclip_live.py` | Delete | Script inspect tạm thời |
| `scratch/query_live_agents.py` | Delete | Script inspect tạm thời |
| `scratch/test_trap_asset_builder.py` | Delete | Script test nháp tạm thời |
| `scratch/verify_world_bounds.py` | Delete | Script test nháp tạm thời |
| `.pytest_cache/` | Delete | Cache chạy test pytest |
| `**/__pycache__/` | Delete | Bytecode cache của Python |

## 7. Acceptance criteria

- [x] AC-01: Không còn file nháp untracked nào trong `scratch/`.
- [x] AC-02: Thư mục `.pytest_cache/` và các thư mục `__pycache__/` được dọn sạch.
- [x] AC-03: Bộ test chính `pytest tests/test_ide_bridge.py` vẫn pass 100%.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra scratch untracked | `git status -s scratch/` | Không còn file `??` trong `scratch/` |
| Kiểm tra cache | `python -c "import os; ..."` | 0 thư mục `__pycache__` và không còn `.pytest_cache` |
| Kiểm tra regression | `pytest tests/test_ide_bridge.py` | 6/6 passed |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Xóa nhầm file test quan trọng | Chỉ xóa các file untracked được liệt kê cụ thể, không dùng lệnh xóa hàng loạt không kiểm soát |

Rollback point và cách rollback:
- Các file untracked được ghi log chi tiết; các file tracked trong git không bị xóa nên không ảnh hưởng commit history.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity Assistant & User confirmation
- Thời điểm: 2026-11-11 10:56:30 +07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 | c4c17d9 | Khởi tạo hợp đồng dọn dẹp | FROZEN |
| 2026-11-11 | c4c17d9 | Xóa 7 file nháp untracked trong `scratch/` | Hoàn thành |
| 2026-11-11 | c4c17d9 | Xóa thư mục `.pytest_cache` và các thư mục `__pycache__` | Hoàn thành |
| 2026-11-11 | c4c17d9 | Chạy bộ test `tests/test_ide_bridge.py` | 6/6 PASSED |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 | c4c17d9 | `git status -s scratch/` | PASS (0 untracked files) | Trống |
| 2026-11-11 | c4c17d9 | Quét cache Python & pytest | PASS (0 directories) | Đã xóa 6 thư mục cache |
| 2026-11-11 | c4c17d9 | `pytest tests/test_ide_bridge.py` | PASS (6 passed in 12.86s) | Task 112 log |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã dọn sạch 7 file script nháp tạm thời và toàn bộ cache bytecode/pytest; toàn bộ mã nguồn và test suite chính hoạt động bình thường 100%.
- Hạn chế còn lại: Không.
- Rollback point: c4c17d9
