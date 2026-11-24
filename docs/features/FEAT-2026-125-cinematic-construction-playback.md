# [FEAT-2026-125] Animation dựng nhà điện ảnh hơn

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.0 |
| Owner | Atelier UI |
| Người chấp thuận | Yêu cầu trực tiếp của người dùng |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 |
| Revision bắt đầu | Chưa có git commit (workspace không phải git repo) |
| Revision cuối | Xem mục 13 (SHA-256) |

## 1. Bối cảnh

Replay "agent dựng nhà" (FEAT-2026-116, FEAT-2026-122, đã CLOSED, không sửa) cho worker đi tuyến tính,
đồ hiện ra tức thì khi đặt, camera cố định. Cần mượt và có chất điện ảnh hơn mà không phá acceptance cũ.

## 2. Mục tiêu

Replay mượt hơn: easing, quay mặt mượt, đồ hạ xuống/fade-in khi đặt, vòng sáng "đặt xong", camera
dịch nhẹ về món đang đặt, khoảng nghỉ giữa các món, nhãn "Đang lắp: <tên> (i/N)".

## 3. Phạm vi

### In scope

- File mới `constructionMotion.ts`: hàm thuần (easeInOutCubic, landing pose, ring, camera blend, clamp).
- `constructionPlayback.ts`: easing + slerp, proxy hạ xuống (clone mesh + clone material tạm; mesh gốc
  giữ nguyên transform/material, chỉ bật `visible` như cũ), ring đặt xong, camera cinematic (option,
  mặc định bật, tôn trọng prefers-reduced-motion), khoảng nghỉ, thông tin i/N trong state.
- `constructionHistory.ts`: mở rộng type state (`replay`).
- `StudioViewport.tsx`: truyền camera/controls; gắn nhãn overlay.
- Component nhỏ `ConstructionLabel.tsx`.
- Test mới `constructionMotion.test.ts`; bổ sung test playback.

### Out of scope

- Không đổi transform/material gốc của đồ; không sửa logic lưu lịch sử (`save`), API, port, provider,
  approval của agent; không sửa FEAT-116/122; không refactor ngoài phạm vi.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: three (có sẵn). Không thêm package.
- Dữ liệu dùng chung: construction history (chỉ gọi `save` như cũ, đúng một lần mỗi món).
- Service/port không được ảnh hưởng: 5173, 8000.

## 5. Thiết kế và kế hoạch triển khai

1. Di chuyển/xoay: easeInOutCubic; quaternion slerp tới hướng mục tiêu (hệ số 1-exp(-12dt)).
2. Đặt đồ (p 0.56 đến 0.66): proxy group (mesh copy dùng chung geometry, material clone transparent) hạ từ
   +0.15m, scale 0.96 đến 1, opacity 0 đến 1; tại p=0.66 hiện mesh gốc, ẩn proxy, dispose material clone.
3. Ring: RingGeometry + MeshBasicMaterial trong 0.6s, tự dispose.
4. Camera: sau `fit`, lưu pose gốc; blend theo tiến độ, tối đa 30% khoảng cách tới món, clamp trong bounds
   nguồn và dưới mái; stop/unmount trả về pose gốc. Tắt bằng `cinematicCamera.enabled=false`.
5. Nhịp: nghỉ 0.5s (thời gian replay) giữa các món trong một slot; tổng thời gian không chậm hơn 30%.
6. Nhãn: state có `replay {done,total}`; `ConstructionLabel` nghe `stateEvent`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| paperclip/ui/src/features/atelier/constructionMotion.ts | Mới | Hàm thuần có test |
| paperclip/ui/src/features/atelier/constructionPlayback.ts | Sửa | Áp dụng hiệu ứng |
| paperclip/ui/src/features/atelier/constructionHistory.ts | Sửa | Type state |
| paperclip/ui/src/features/atelier/ConstructionLabel.tsx | Mới | Overlay nhãn |
| paperclip/ui/src/features/atelier/StudioViewport.tsx | Sửa | Truyền camera, gắn nhãn |
| constructionMotion.test.ts, constructionHistory.test.ts | Mới/Sửa | Test |

## 7. Acceptance criteria

- [ ] AC-01: easeInOutCubic(0)=0, (1)=1, đơn điệu, đối xứng.
- [ ] AC-02: landing pose kết thúc đúng (offset 0, scale 1, opacity 1).
- [ ] AC-03: sau hoàn tất, mesh gốc visible, transform và material tham chiếu không đổi.
- [ ] AC-04: stop giữa chừng khôi phục visibility gốc, dispose proxy/ring, trả camera về pose gốc.
- [ ] AC-05: acceptance cũ (tuần tự, pause/resume/stop, chân worker đúng sàn, selection không chạy animation, lưu hoàn tất đúng 1 lần) vẫn PASS.
- [ ] AC-06: camera nằm trong bounds nguồn, dưới mái, tắt được bằng option.
- [ ] AC-07: nhãn "Đang lắp: <tên> (i/N)" hiện khi replay, ẩn khi xong.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Typecheck | `npm run typecheck` (paperclip/ui) | PASS |
| Vitest | `npx vitest run src/features/atelier` | PASS |
| Runtime | `node scripts/verify-atelier-construction.mjs` nếu server chạy | PASS + screenshot |
| Whitespace | `git diff --check` | Sạch |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Camera xuyên tường | Giới hạn 30%, clamp bounds, option tắt |
| Rò GPU resource | Dispose trong cleanup/stop/unmount, có test |
| Chậm hơn | Gap 0.5s, kiểm tra tỉ lệ |

Rollback: xóa `constructionMotion.ts`, `ConstructionLabel.tsx` và khôi phục các file sửa từ
`scratch/backup-feat125/`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: agent triển khai theo yêu cầu người dùng
- Thời điểm: 2026-11-18

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-18 | n/a | Bắt đầu triển khai | |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-18 | n/a (không commit) | `npm run typecheck` (paperclip/ui) | PASS | tsc -b không lỗi |
| 2026-11-18 | n/a | `npx vitest run src/features/atelier` | PASS | 10 file, 31 test |
| 2026-11-18 | n/a | `git diff --check` trên file thuộc scope | PASS | Không có lỗi whitespace; lệnh toàn repo báo lỗi sẵn có ở ai-office-standalone/index.html (ngoài scope) |
| 2026-11-18 | n/a | Runtime UI (`verify-atelier-construction.mjs`) | CHƯA CHẠY | Server 5173 không chạy; chưa verify bằng UI thật |
| 2026-11-18 | n/a | Test mới constructionMotion.test.ts | PASS | easing, landing, camera, label, stop khôi phục, option tắt camera, tốc độ |


SHA-256 file cuối:

```text
453cbf41432c732188f8ce8d186871f1abb5f73ab72ea4c7cd9e1e594a496406 paperclip/ui/src/features/atelier/constructionMotion.ts
f473b7ba655819a67fe9b09733a1e8c5fd57fe6c8111a7500c5d6745f38820ac paperclip/ui/src/features/atelier/constructionPlayback.ts
2f06e05303431bd41223d5481c1391d77e0342fd295549ca84e56b93ba8e7cea paperclip/ui/src/features/atelier/constructionHistory.ts
3e97e43879f740b6f96df4e1287651fdc9375ec2339117411fa926031c8af451 paperclip/ui/src/features/atelier/ConstructionLabel.tsx
cc609df365164a7b0f0f869950cbb41a43838b09768f6cedb39c18f6785c8d7f paperclip/ui/src/features/atelier/StudioViewport.tsx
efa0994b1c3d062d1b8811e83204251322ece1d9b9c7ed8fa0e1299a0e61c3c6 paperclip/ui/src/features/atelier/constructionMotion.test.ts
```

## 14. Kết quả và đóng chức năng

- Kết quả: đã làm easing, slerp, proxy hạ xuống + fade, ring, camera, nghỉ giữa món, nhãn i/N. Chưa CLOSED vì chưa verify UI thật.
