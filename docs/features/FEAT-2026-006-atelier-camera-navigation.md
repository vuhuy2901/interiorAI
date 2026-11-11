# [FEAT-2026-006] P0 điều hướng camera ATELIER AI trong Paperclip

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | ATELIER AI P0 |
| Người chấp thuận | Product Owner, yêu cầu P0 trực tiếp ngày 2026-11-10 |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10, giờ Việt Nam |
| Revision bắt đầu | Root f92c6c3a4e2be3a23a5f2cde89cdd74d28510550, Paperclip eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e + thay đổi có sẵn |
| Revision cuối | Paperclip base `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`, working-tree implementation blobs ghi tại mục 13 (chưa commit theo yêu cầu bảo toàn working tree) |

## 1. Bối cảnh

Tiếp tục phần camera của FEAT-2026-004. SVG dùng khung tọa độ cố định, 3D chỉ xoay ngang và dùng kích thước pane cha. Preset và Fit kích hoạt dựng lại scene. Hai module camera từ phiên trước chưa tìm thấy trong hai Git worktree hiện có, stash hoặc các thư mục evidence/scratch đã kiểm tra.

## 2. Mục tiêu

Fit đưa hình học thực vào pane hiện tại, thao tác 2D/3D hoạt động độc lập, và thay đổi camera, lựa chọn hoặc dock không làm mất canvas hoặc tải lại GLB.

## 3. Phạm vi

- Camera 2D, camera 3D, hành vi toolbar và lifecycle của pane thiết kế tích hợp.
- Divider split, khung canvas và vùng cuộn của Inspector/AI Chat.
- Ngoài phạm vi gồm standalone, thay đổi dữ liệu hoặc hình học lưu, database, Docker/triển khai mới và các phần geometry còn lại của FEAT-2026-004.

## 4. Dependency và tài nguyên cần bảo vệ

- React, Three.js và Vite hiện có tại paperclip/ui.
- Bảo vệ các chỉnh sửa chưa commit, project đang lưu, pipeline vật liệu, scene và instance PostgreSQL hiện tại.
- Paperclip dùng scripts/start-paperclip.ps1, cổng 3100 và frontend @paperclipai/ui.

## 5. Thiết kế và kế hoạch triển khai

1. Đo riêng từng pane. Lưu tâm và tỷ lệ 2D độc lập với Inspector. Fit theo polygon và wall bounds có độ dày.
2. Giữ renderer qua 2D/3D/Split. Dùng OrbitControls và bộ Walk theo thời gian, tách Cutaway thành trạng thái hiển thị.
3. Kết nối Fit, Focus Selection và Reset. Chặn camera 3D trong 2D. Dùng pointer capture và cleanup.
4. Xác minh code và build trước khi kiểm tra browser ở cổng 3100.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi |
|---|---|
| StudioViewport.tsx, usePlanCamera.ts, studioCamera.ts | Camera, đo kích thước, lifecycle, controls |
| AtelierDesignStudioPage.tsx, atelier-studio.css | Toolbar và bố cục |
| Camera regression test | Fit theo tỷ lệ pane, zoom con trỏ và thao tác camera |
 
## 7. Acceptance criteria

- [x] AC-01. Wheel neo điểm con trỏ, pan bằng nút giữa/Space, Fit được tọa độ âm hoặc lệch gốc, giữ state khi dock resize.
- [x] AC-02. Orbit hai trục, wheel dolly, pan, Top, Walk liên tục bằng WASD và mouse-look.
- [x] AC-03. Fit, Focus và Reset điều khiển camera thực. Trạng thái active khớp, Walk bị vô hiệu trong 2D, Cutaway tách riêng.
- [x] AC-04. Pane đo độc lập, projection theo pane, không reload GLB hoặc thay canvas khi đổi view/preset/selection/dock, cleanup khi unmount.
- [x] AC-05. Split kéo được, dock cuộn độc lập, thao tác canvas không bị vùng trong suốt chặn.
- [x] AC-06. Typecheck và test liên quan, build @paperclipai/ui, kiểm tra Paperclip tại localhost:3100.

## 8. Verification plan

| Kiểm tra | Cách chạy |
|---|---|
| Typecheck | pnpm --filter @paperclipai/ui typecheck |
| Test | Vitest có mục tiêu và audit liên quan nếu chạy được |
| Build | pnpm --filter @paperclipai/ui build |
| Browser | Health, route Design Studio, zoom/pan/fit, Orbit/Top/Walk, Focus/Reset, drag divider, dock, canvas identity và GLB count |

## 9. Rủi ro và rollback

Xung đột chọn vật thể với pan được xử lý qua button/pointer capture. Geometry ngoài gốc được kiểm tra bằng bounds. Docker Engine không phản hồi và script local dừng do scheduled task PostgreSQL không xác minh được. Ghi rõ giới hạn nếu chưa xác minh được live.

Rollback bằng cách đảo phần diff camera của FEAT-2026-006 và xóa các file mới thuộc hợp đồng. Giữ các thay đổi đã tồn tại trong working tree.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung được bảo vệ.
- [x] Có rollback và verification plan.
- Chốt FROZEN trước khi sửa code.

## 11. Change Log

Chưa có.

## 12. Implementation log

1. 2026-11-10: xác minh workspace chính và nested repository `paperclip`; khôi phục được toàn bộ patch camera đang dở trực tiếp từ working tree hiện tại, không cần tái tạo từ nguồn khác.
2. 2026-11-10: typecheck, test camera và build đầu tiên đều pass; browser audit phát hiện pane SVG 2D giữ intrinsic aspect-ratio cao hơn pane và bị container cắt. Tiếp tục sửa trong phạm vi AC-01/AC-05, đồng thời hoàn thiện Space + kéo khi con trỏ đang ở canvas.
3. 2026-11-10: thêm ràng buộc `minHeight: 0`/`overflow: hidden` cho pane và vùng SVG; chuyển Space listener sang `window` nhưng chỉ kích hoạt khi SVG có focus hoặc con trỏ hover. Không thay đổi yêu cầu đã đóng băng.

## 13. Verification evidence

- `pnpm --filter @paperclipai/ui typecheck` — PASS, exit 0.
- `pnpm --filter @paperclipai/ui exec vitest run src/features/atelier/cameraNavigation.test.ts` — PASS, 1 file/3 test.
- `pnpm --filter @paperclipai/ui build` — PASS, 8309 modules, build 14.76s; chỉ còn warning Vite/CSS/chunk đã có của repository.
- `node scripts/check-token-gates.mjs` — PASS, cả 4 gate sạch. Lệnh tổng `pnpm check:token-gates` còn fail tại generated palette sync ngoài phạm vi camera.
- Browser headless Edge tại `http://127.0.0.1:3100/design-studio` — PASS: HTTP/health 200; SVG sau sửa cao 590.5px trong pane 688.5px (trước sửa intrinsic 1234.45px và bị cắt); wheel zoom, Space+drag pan, Fit round-trip; Orbit đổi vị trí từ `[21.857,11.542,24.003]` sang `[2.387,26.179,16.963]`; dolly, Top, Walk W liên tục từ z `8.975` tới `7.223`, Focus thay đổi framing; canvas identity giữ nguyên qua camera/Inspector; không console error hoặc response lỗi.
- Browser layout — PASS: split pane 2D đổi 375.5px → 490.5px; Inspector và AI Chat đều scroll 0 → 300 độc lập; không horizontal overflow tại 1024×768 và 390×844.
- Evidence: `docs/build/EVIDENCE/FEAT-2026-006/camera-patch-final-browser-audit.json`, `camera-patch-final-design-studio.png`, `camera-patch-contained-2d.png`.
- Docker CLI có mặt nhưng Docker Engine `desktop-linux` không chạy. Paperclip thực tế đang chạy bằng `node --import tsx src/start-local-lite.ts`; health trả commit/branch đúng và Vite nạp `/src/main.tsx` từ working tree. Đây không chặn kiểm thử frontend local.

Implementation blob IDs trên Paperclip base `eac39d0bf1c3ab82ddf5bc67dba9aff1a352148e`:

- `usePlanCamera.ts`: `fbf3db3bf1ce282f524d7ddc12314989b806d5a7`
- `studioCamera.ts`: `a0c9e6fb45e338a79ad7cf44c1f4df0f616e56a9`
- `StudioViewport.tsx`: `ceafe067549c38ff1728ad89d1a1f1479c743d61`
- `AtelierDesignStudioPage.tsx`: `19c992786b4f15e470a571963fd4fa2d2fe7dc91`
- `atelier-studio.css`: `9c6f3dcbdd344be417001c37dc0f706d86751fe2`
- `cameraNavigation.test.ts`: `b13d6b4bc771cdc6b74d54f75aa4eade928c5093`

## 14. Kết quả và đóng chức năng

Hoàn tất P0 camera trong workspace chính. Không tạo repository/worktree/standalone mới, không commit và không ghi đè các thay đổi chưa commit có sẵn. Rollback point là Paperclip base nêu trên cộng danh sách blob triển khai ở mục 13.

