# [FEAT-2026-165] Xuất link 3D — Local LAN Preview

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier |
| Người chấp thuận | Chủ dự án (yêu cầu trực tiếp trong phiên 2026-11-24) |
| Ngày tạo | 2026-11-24 |
| Frozen at | 2026-11-24 |
| Revision bắt đầu | master @ f193c74f |
| Revision cuối | Chưa có |

## 1. Bối cảnh

Studio (`paperclip/ui/src/features/atelier`) chỉ xem được scene trên máy chạy editor. Cần chia sẻ scene đã lưu
sang điện thoại cùng Wi-Fi, không cloud. Scene thật nằm ở FastAPI `apps/api` (SQLite `atelier.db`, bảng
`scene_revisions`, đơn vị mm). Viewer hiện tại là Three.js 0.172 viết tay (`StudioViewport.tsx`), không phải
`@pascal-app` editor UI. Paperclip 3100 chạy `local_trusted` (mọi request là admin) nên KHÔNG được mở ra LAN.

## 2. Mục tiêu

Bấm "Xuất link 3D" -> link `http://<LAN-IP>:<port>/preview/<token>` + QR -> điện thoại mở viewer 3D tương tác
đúng revision đã publish; có thể thu hồi ngay.

## 3. Phạm vi

### In scope

- Server preview riêng (FastAPI app thứ hai, uvicorn, cổng mặc định 3200, bind 0.0.0.0) chỉ có route token-gated + viewer tĩnh.
- API quản trị share (create/refresh/revoke/list/network) trên API chính 127.0.0.1:8000.
- Bảng `preview_shares` trong `atelier.db`; token lưu dạng hash SHA-256.
- Package publish: manifest JSON + GLB dùng trong scene (sao chép từ asset library cục bộ), vật liệu đã resolve.
- Dò IP LAN Windows, cho chọn/ghi đè IP, QR (segno, SVG), chẩn đoán mạng/firewall (chỉ hướng dẫn).
- Viewer mobile: orbit/pinch/pan, chọn vật thể, bottom sheet thông tin, reset, fullscreen, danh sách vật thể, mặt bằng 2D.
- Nút + modal trong `AtelierDesignStudioPage`.
- Test tự động backend + test bảo mật/revoke/cô lập revision.

### Out of scope

- Cloudflare/ngrok/internet/VPS/cloud/Telegram/Zalo/WhatsApp/thanh toán/đăng ký tài khoản.
- Mã hóa HTTPS; bearer link chỉ là credential cho LAN tin cậy.
- Tự sửa Windows Firewall.
- Đa tầng thật: schema hiện chỉ có 1 tầng; viewer hiển thị 1 tầng và ghi nhận giới hạn.
- Tải/đồng bộ cả thư viện FurniMesh; GLB từ xa không có bản cục bộ -> chặn publish offline cho asset đó, không thay placeholder.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `segno` (pip, thuần Python) cho QR; three 0.172 vendored từ `paperclip/ui/node_modules/three`.
- Dữ liệu dùng chung: `atelier.db` (chỉ thêm bảng, không đổi bảng cũ), `data/assets/library`.
- Không được ảnh hưởng: Paperclip 3100, API 8000 (route cũ), office 5000, FurniMesh 3180, scene gốc (chỉ đọc).

## 5. Thiết kế và kế hoạch triển khai

1. `apps/api/app/services/lan_preview.py`: DB share, build package, token, dò IP, QR.
2. `apps/api/app/preview_app.py`: app preview giới hạn (manifest/assets/viewer), kiểm tra token+trạng thái mỗi request.
3. Route quản trị trong `main.py` (loopback-only guard theo `request.client.host`).
4. `apps/api/preview_viewer/` viewer tĩnh (three vendored, không CDN).
5. UI: nút + `LocalPreviewModal.tsx`; phát hiện "chưa lưu" bằng so sánh scene local với bản server.
6. Script `scripts/start-preview.ps1`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| apps/api/app/services/lan_preview.py | Mới | Logic share/package/LAN |
| apps/api/app/preview_app.py | Mới | Server preview giới hạn |
| apps/api/app/main.py | Sửa nhỏ | Route quản trị share |
| apps/api/preview_viewer/* | Mới | Viewer mobile |
| apps/api/tests/test_lan_preview.py | Mới | Test |
| paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx, LocalPreviewModal.tsx | Sửa/Mới | Nút + modal |
| scripts/start-preview.ps1 | Mới | Khởi động |

## 7. Acceptance criteria

- [ ] AC-01: Publish tạo bản ghi + package từ revision đã lưu; link dùng IP LAN, không phải localhost.
- [ ] AC-02: Manifest/GLB/metadata chỉ trả với token hợp lệ đang active; token sai/đã thu hồi -> 403/404 cho mọi endpoint.
- [ ] AC-03: Sửa scene gốc sau publish không đổi preview tới khi Refresh.
- [ ] AC-04: Server preview không phơi bày route API chính/đường dẫn nội bộ; không có directory listing; chống path traversal.
- [ ] AC-05: Viewer render GLB thật, orbit/zoom/pan, chọn vật thể hiện metadata thật hoặc "Not available".
- [ ] AC-06: Mặt bằng 2D vẽ từ hình học thật của cùng revision.
- [ ] AC-07: Thiếu GLB cục bộ -> báo lỗi rõ, không placeholder giả.
- [ ] AC-08: Kiểm thử trên điện thoại thật: trạng thái NOT VERIFIED nếu chưa làm, kèm bước thủ công.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Unit/integration backend | `python -m pytest apps/api/tests/test_lan_preview.py` | Pass |
| Typecheck UI | `pnpm --filter ./paperclip/ui typecheck` (hoặc `tsc -b` trong paperclip/ui) | Không lỗi mới |
| Test sẵn có | `python -m pytest apps/api/tests`, `node scripts/tests/office-nav.test.mjs` | Không hồi quy |
| E2E trình duyệt | Mở link bằng Chrome, thao tác | Scene thật hiển thị |
| LAN thật | Điện thoại cùng Wi-Fi | NOT VERIFIED nếu không có thiết bị |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Lộ API admin ra LAN | Server preview là app riêng, chỉ mount route preview |
| Firewall chặn cổng | Chẩn đoán + hướng dẫn, không tự đổi firewall |
| GLB lớn trên mobile | Giới hạn pixel ratio, báo kích thước package |

Rollback: xóa file mới, bỏ route trong main.py, `DROP TABLE preview_shares`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Claude (Sonnet 5.5) theo yêu cầu chủ dự án
- Thời điểm: 2026-11-24

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-24 | master @ f193c74f (chưa commit) | Backend lan_preview.py, preview_app.py, route admin, viewer tĩnh, LocalPreviewModal, start-preview.ps1 | Viewer + modal do fork; backend/test do Sonnet 5.5 |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-24 | uncommitted | pytest test_lan_preview.py | PASS 12/12 | publish, token hash, revoke, cô lập revision, traversal, loopback guard |
| 2026-11-24 | uncommitted | Publish thật proj_demo_4x5m | PASS | url http://192.168.1.180:3200/preview/..., 4 GLB, 8.96 MB, bind 0.0.0.0:3200 |
| 2026-11-24 | uncommitted | Revoke qua curl | PASS | page/manifest/GLB: 200 -> 404 |
| 2026-11-24 | uncommitted | Viewer Chrome qua IP LAN (Haiku QA + Sonnet kiểm lại) | PASS | glbLoaded 4, glbFailed 0; chạm chọn bàn trà, kệ TV; 2D toggle |
| 2026-11-24 | uncommitted | node scripts/tests/office-nav.test.mjs | PASS 43/43 | không hồi quy |
| 2026-11-24 | uncommitted | Điện thoại thật (AC-08) | NOT VERIFIED | Chưa có thiết bị; touch pinch/2-finger pan, layout 390px chưa kiểm |

## 14. Kết quả và đóng chức năng

- Kết quả: tính năng chạy end-to-end trên desktop qua IP LAN; chưa đóng (CLOSED) vì AC-08 chưa kiểm trên điện thoại.
- Hạn chế còn lại: 1 tầng; scene dùng external_scene GLB bị chặn; GLB không tối ưu texture (copy nguyên bản); HTTP không mã hóa.
- Việc chưa hoàn tất: test điện thoại thật; khởi động lại API 8000 để nạp route mới; UI chưa thử trong Paperclip thật (chỉ typecheck không lỗi ở file mới).
- Rollback point: master @ f193c74f
- Trạng thái `CLOSED` bởi:
- Thời điểm:
