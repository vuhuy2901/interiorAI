# [FEAT-2026-040] Workflow Manager Library và Designer theo nhu cầu

| Trường | Giá trị |
|---|---|
| Trạng thái | IMPLEMENTING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng (2026-11-16) |
| Ngày tạo | 2026-11-16 |
| Frozen at | 2026-11-16T00:00:00+07:00 |
| Revision bắt đầu | `a753015a6` + working tree |
| Revision cuối | Chưa có |

## Phạm vi

- Workflow Library là màn hình mặc định; React Flow chỉ mở khi chọn Tinh chỉnh.
- Giữ API/database/workflow engine và execution trace hiện có; không tạo engine song song.
- Đưa Execution/History thành khu vực quản lý rõ ràng; không xóa dữ liệu lifecycle cũ.
- Không tự động activate workflow khi chọn card.

## Acceptance criteria

- [ ] Mở `/workflows` thấy Library trước, không thấy React Flow chiếm toàn màn hình.
- [ ] Chọn workflow chỉ mở chi tiết; Tinh chỉnh mới mở React Flow.
- [ ] Published/Draft, số bước, dự án và execution history được hiển thị từ API hiện có.
- [ ] Existing v5/v6, undo/redo, validate, save và run không bị mất.

## Verification

| Kiểm tra | Kết quả |
|---|---|
| `pnpm --filter @paperclipai/ui typecheck` | PASS |
| Source review Library default / Designer on demand | PASS |
| Backend multi-workflow/project activation API | Chưa có endpoint tương ứng; cần pass backend riêng |

## Implementation log

| Thời điểm | Revision | Công việc |
|---|---|---|
| 2026-11-16 | `a753015a6` + working tree | Thêm Workflow Library mặc định và đưa Designer về chế độ Tinh chỉnh |

## Limitations

API hiện tại `/api/atelier/workflow/definitions` trả tập version của workflow authority hiện hữu, chưa có model multi-workflow assignment/version activation cho từng project. Phần UI không tạo dữ liệu giả; backend contract này cần được mở rộng trước khi claim đầy đủ các acceptance criteria multi-workflow.
