# [FEAT-2026-043] Khôi phục Paperclip khi nạp PBR catalog

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.2 |
| Owner | Codex |
| Người chấp thuận | Người dùng yêu cầu sửa màn hình “Paperclip couldn’t start” |
| Ngày tạo | 2026-11-14 |
| Frozen at | 2026-11-14 22:48 ICT |
| Revision bắt đầu | Working tree hiện tại; không thay đổi dữ liệu dự án |
| Revision cuối | Chưa có |

## 1. Sự cố và mục tiêu

Paperclip API tại cổng 3100 vẫn khỏe nhưng UI không mount. Trình duyệt xác nhận
`/public/assets/pbr/pbr_catalog.json?import` được yêu cầu như JavaScript nhưng
máy chủ trả `text/html`, gây lỗi MIME và kích hoạt màn hình startup fallback.

Mục tiêu: sửa duy nhất cơ chế nạp PBR catalog để UI khởi động lại bình thường.

## 2. Phạm vi

### In scope

- Sửa nguồn nạp catalog trong `paperclip/ui/src/features/atelier/pbrCatalog.ts`.
- Sửa cùng lỗi static import cho hai furniture catalog trong
  `paperclip/ui/src/features/atelier/assetCatalog.ts`.
- Kiểm tra catalog tải được, UI mount, API health còn tốt và reload thành công.

### Out of scope

- Không sửa project, scene, revision, workflow, agent hoặc database.
- Không refactor thư viện vật liệu hay giao diện Studio.
- Không xóa hoặc ghi đè các thay đổi chưa commit khác.

## 3. Dependency và tài nguyên cần bảo vệ

- Giữ nguyên `paperclip/ui/public/assets/pbr/pbr_catalog.json` làm nguồn catalog.
- Bảo vệ Paperclip 3100, backend 8000 và toàn bộ dữ liệu đang chạy.

## 4. Thiết kế và file thay đổi

Thay static module import không hợp lệ bằng việc tải JSON từ URL public hợp lệ
`/assets/pbr/pbr_catalog.json`, kiểm tra HTTP response trước khi sử dụng.

| File | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/pbrCatalog.ts` | Hotfix nạp dữ liệu | Loại bỏ module request sai MIME |
| `paperclip/ui/src/features/atelier/assetCatalog.ts` | Hotfix nạp dữ liệu | Hai catalog SH3D gặp cùng lỗi MIME |
| `paperclip/ui/src/features/atelier/catalogData.ts` | Adapter dữ liệu public dùng chung | Nạp ba JSON public một lần mà không nhân bản dữ liệu |

## 5. Acceptance criteria

- [ ] AC-01: Không còn request module tới `/public/assets/pbr/pbr_catalog.json?import`.
- [ ] AC-02: PBR catalog trả JSON hợp lệ từ `/assets/pbr/pbr_catalog.json`.
- [ ] AC-03: `#root` của Paperclip mount và startup fallback không hiển thị.
- [ ] AC-04: Reload vẫn thành công; Paperclip health vẫn `ok`.
- [ ] AC-05: Không thay đổi dữ liệu project/workflow/scene.

## 6. Rủi ro, rollback và verification

- Rủi ro: catalog public thiếu hoặc JSON hỏng sẽ chặn module; giảm thiểu bằng
  kiểm tra response rõ ràng và xác minh trực tiếp trên trình duyệt.
- Rollback: hoàn tác duy nhất thay đổi trong `pbrCatalog.ts`.
- Verification: kiểm tra HTTP catalog, chạy build/typecheck UI hẹp nếu khả dụng,
  mở trang bằng Chromium, kiểm tra page errors, root mount và reload thật.

## 7. Xác nhận đóng băng

- [x] Phạm vi/non-goals rõ ràng.
- [x] Acceptance criteria kiểm tra được.
- [x] Dữ liệu dùng chung và rollback đã xác định.
- Trạng thái chuyển sang `FROZEN` bởi Codex lúc 2026-11-14 22:48 ICT.

## 8. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-14 22:51 ICT | Mở rộng hotfix cho hai SH3D furniture catalog | Sau lần sửa đầu, browser trace phát hiện cùng lỗi tại `sh3d-japandi` và `sh3d-classic` | Thêm một file UI vào phạm vi; không đổi dữ liệu/hành vi nghiệp vụ | Yêu cầu khôi phục Paperclip của người dùng | 1.1 |
| CR-002 | 2026-11-14 22:54 ICT | Dùng adapter tải catalog public dùng chung | Vite vẫn biến relative `?raw` import thành `/public/...` và trả HTML; cần giữ JSON ở public cho Blender nhưng nạp qua URL `/assets/...` | Thêm module dữ liệu nhỏ, không đổi schema catalog | Yêu cầu khôi phục Paperclip của người dùng | 1.2 |

## 9. Verification evidence

Sẽ ghi bổ sung sau khi triển khai.

