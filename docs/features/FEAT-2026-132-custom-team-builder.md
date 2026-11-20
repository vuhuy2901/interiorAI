# [FEAT-2026-132] Custom Team Builder — Tuỳ chỉnh Agent trong AI Office

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Claude Sonnet 4.6 |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-20 |
| Frozen at | 2026-11-20T11:00:00+07:00 |
| Revision bắt đầu | `a0f6bfa457ba2888202041ce86e735e508f404f3` |

## 1. Bối cảnh

Người dùng muốn có thể thêm các agent của riêng họ vào văn phòng 3D — đặt tên,
chức danh, màu sắc, mô tả công việc — và lưu giữa các lần tải trang.
Hiện tại mảng `AG` cứng hoá 9 agent; không có cơ chế thêm/xoá runtime.

## 2. Mục tiêu

Cung cấp UI "Tuỳ chỉnh Team" cho phép thêm tối đa 4 custom agent vào scene 3D
với tên, chức danh, màu, mô tả; lưu vào `localStorage`; phục hồi khi tải lại trang.

## 3. Phạm vi

### In scope
- Pre-tạo 4 bàn/ghế dự phòng (custom slots) ở vị trí trống trong các phòng hiện có.
- Nút `✏️ Team` trong `#controlsCluster` mở panel "Tuỳ Chỉnh Team".
- Panel: hiển thị danh sách custom agent, form thêm (tên, tên ngắn, chức danh, mô tả,
  màu picker), nút xoá, giới hạn 4 agent.
- Dữ liệu lưu `localStorage` key `atelier_custom_agents` (JSON array).
- Khi thêm: instantiate `Agent` vào slot tương ứng, cập nhật `agents`/`A`/status strip.
- Khi xoá: remove mesh+label khỏi scene, cập nhật array.
- Reload trang: load từ localStorage và spawn lại.

### Out of scope
- Không cho kéo-thả vị trí bàn.
- Không lưu backend/server.
- Không sửa logic lighting/PBR/FurniMesh/pascal/camera.
- Không thêm quá 4 custom slots.

## 4. File thay đổi

| File | Loại |
|---|---|
| `ai-office-standalone/index.html` | Thêm CSS + HTML panel + JS custom team |
| `docs/features/FEAT-2026-132-custom-team-builder.md` | Contract |

## 5. Acceptance criteria

- [ ] AC-01: Nút `✏️ Team` hiển thị trong top-right controls bar.
- [ ] AC-02: Mở panel → thấy danh sách (trống nếu chưa có) + form thêm.
- [ ] AC-03: Thêm agent → agent xuất hiện trong scene 3D (nhân vật + pill label).
- [ ] AC-04: Reload trang → custom agent được phục hồi từ localStorage.
- [ ] AC-05: Xoá agent → biến mất khỏi scene và khỏi localStorage.
- [ ] AC-06: Tối đa 4 agent, khi đạt tối đa form bị ẩn/disable.
- [ ] AC-07: Không làm hỏng các agent gốc (AG), lighting, FurniMesh.

## 6. Xác nhận đóng băng

- [x] Phạm vi rõ, non-goals rõ.
- [x] Không cần rollback phức tạp (localStorage-only, không push).
- Trạng thái: `FROZEN` — 2026-11-20T11:00:00+07:00
