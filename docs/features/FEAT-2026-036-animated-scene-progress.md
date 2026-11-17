# [FEAT-2026-036] Nhân vật minh hoạ tiến trình bố trí nội thất

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 0.1 |
| Owner | Codex |
| Người chấp thuận | Người dùng: “được, giờ bạn thực hiện đúng theo plan nhé” |
| Ngày tạo | 2026-11-15 |
| Frozen at | 2026-11-15 (Asia/Saigon) |
| Revision bắt đầu | Chưa triển khai; baseline khảo sát 46719ac78a0869782721d389ab6f58e4cde1f42a |
| Revision cuối | Feature code commit `c0d4690391bc65b4d8c08d7220969f136f442f1b` (chưa push; còn VERIFYING) |

## 1. Bối cảnh
StudioViewport dùng Three.js trực tiếp; UI có Motion. Người dùng muốn thấy nhân vật chạy tới vị trí bố trí và món đồ xuất hiện sau khi được tạo thành công. Chưa sửa implementation. Mô phỏng riêng dùng dữ liệu giả để duyệt chuyển động, không phản ánh tiến độ dự án thật.

## 2. Mục tiêu
Đọc được tiến trình qua căn phòng; một nhân vật đơn giản thực hiện chuỗi chạy → đặt → rời đi. Món đồ xuất hiện là chính đối tượng 3D của Studio, giữ đúng mẫu/GLB (nếu có), vật liệu, vị trí, hướng và kích thước canonical.

## 3. Phạm vi
### In scope
- Một nhân vật 3D tối giản dựng từ hình khối, bốn trạng thái idle/run/place/exit; concept hình ảnh chỉ là tham khảo nếu cần.
- Khi nhân vật đặt đồ, hiển thị đúng mesh mà Studio đang dùng cho đồ đó: GLB thật với material overrides, hoặc procedural furniture hiện hành nếu chính Studio dùng loại này. Không tạo mô hình thay thế riêng cho animation.
- Đồ mới được persist trong phiên theo dõi kích hoạt animation; trạng thái xử lý/chờ/hoàn tất có nhãn ngắn.
- Chạy tới cạnh đồ, tránh tường và đồ đã có; không tìm được đường thì hiện đồ bằng highlight, không xuyên tường.
- Mỗi lượt khoảng 2–3 giây; hàng đợi tối đa 3 lượt, sự kiện dồn được gom để kết quả mới nhất hiện trong tối đa 10 giây.
- Tắt chuyển động, reduced motion, đồng bộ khi quay lại tab/chuyển dự án/reconnect.
### Out of scope
- Thay workflow, QA/approval, logic tạo đồ, BOQ hoặc model AI.
- Rig nhân vật chi tiết, bê vật thể thật, nhiều nhân vật, audio, vật lý, multiplayer.
- Làm lại toàn bộ giao diện, animation sửa/xóa đồ ở bản đầu, lưu nhân vật vào scene xuất file.

## 4. Dependency và tài nguyên cần bảo vệ
- Three.js, React, context/query và luồng cập nhật canonical hiện có.
- Dữ liệu canonical, revision, furniture IDs, các dịch vụ 3100/8000, database và task được giữ nguyên.
- Không xóa tài nguyên có sẵn nếu chưa được người dùng cho phép.
- Product Design chưa xác nhận kết nối; kế hoạch không phụ thuộc plugin này.

## 5. Thiết kế và kế hoạch triển khai
1. Duyệt mô phỏng và nhịp chuyển động; đóng băng contract trước sửa code.
2. Khảo sát refresh/event thực tế trong AtelierStudioContext: dùng snapshot persist làm nguồn sự thật, revision + entity ID chống phát lại. Không suy ra hoàn thành từ lời chat.
3. Tách bộ điều phối animation và nhân vật khỏi StudioViewport. Snapshot đầu tiên hiện đầy đủ, không phát lại đồ cũ. Revision mới so sánh ID; chỉ thêm đồ mới vào hàng đợi. Nếu backend lưu một batch, minh hoạ là phát lại batch vừa lưu, không giả thành tiến độ tạo từng món.
4. Dựng nhân vật hình khối trong world coordinates; tìm đường trên mặt sàn theo footprint vật cản, đến cạnh footprint đích. Camera tự do; nhân vật không nhận selection/raycast của đồ và không có trong export.
5. Dùng lớp trình bày tạm trên chính group/mesh đồ của Studio cho hiệu ứng xuất hiện, không sửa dữ liệu canonical. Chờ GLB tải và áp material override xong rồi mới phát hiệu ứng đặt; nếu tải thất bại, giữ trạng thái lỗi tải hiện có và không tráo sang bàn minh hoạ khác. Hiện đồ trong 200–300ms sau động tác đặt. Chuyển scene/tab, mất sự kiện hoặc animation lỗi: hủy hàng đợi và hiện snapshot mới nhất.
6. Thêm nhãn hoạt động và nút bật/tắt vào Studio; không báo hoàn thành toàn dự án khi chỉ một đồ được lưu, phân biệt chờ QA/nghiệm thu.
7. Kiểm thử các kịch bản mục 8, xem trực quan desktop/mobile, đo hiệu năng rồi ghi revision/evidence và đóng contract.

## 6. File/component dự kiến thay đổi
| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| paperclip/ui/src/features/atelier/StudioViewport.tsx | Sửa | Gắn lớp nhân vật/hiệu ứng |
| AtelierStudioContext.tsx | Sửa nếu cần | Cấp snapshot/revision và trạng thái thật |
| Project3DStudioTab.tsx, atelier-studio.css | Sửa | Nhãn tiến trình và bật/tắt |
| Module scene-animation mới trong features/atelier | Thêm | Queue, deduplication, path, actor, cleanup |
| Test animation cùng module | Thêm | Logic sự kiện, phục hồi và đường đi |

## 7. Acceptance criteria
- [ ] AC-01: Đồ mới chỉ được minh hoạ khi snapshot persist xác nhận; không mutation canonical từ animation.
- [ ] AC-02: Nhân vật tới cạnh đúng đồ; đồ xuất hiện chính là GLB/procedural mesh mà Studio dùng, với đúng mẫu, vật liệu, transform và kích thước; không xuyên vật cản, có fallback khi không có đường.
- [ ] AC-03: Snapshot đầu, sự kiện lặp, reload/reconnect không phát lại đồ cũ; revision lỗi thời bị bỏ qua.
- [ ] AC-04: Tắt animation/reduced motion hiện ngay kết quả; UI vẫn thông báo hoạt động.
- [ ] AC-05: Queue có giới hạn; batch 20 đồ hội tụ về snapshot mới nhất trong 10 giây.
- [ ] AC-06: Chuyển project, unmount, tab ẩn không rò animation/mesh/material; không ảnh hưởng selection/camera/export.
- [ ] AC-07: Lỗi task hoặc pending approval không hiển thị thông báo hoàn tất dự án giả.
- [ ] AC-08: Kiểm tra tại 390px và desktop, không che thao tác; mục tiêu >=30fps trên máy kiểm thử với cảnh đại diện, ghi cấu hình và số đo.

## 8. Verification plan
| Kiểm tra | Cách chạy | Mong đợi |
|---|---|---|
| Event/queue | Unit targeted | add/batch/duplicate/stale/reconnect đúng AC |
| Path | Unit footprint và scene có cửa hẹp | Không xuyên, fallback ổn định |
| Integration | Persist thật trong scene thử riêng | Transform, QA và state không bị sai |
| UI | Play, toggle, camera, select, switch scene/tab, reduced motion | Nhãn và vật thể đúng, không rò tài nguyên |
| Hiệu năng | Đo frame trên cảnh đại diện và batch 20 | Ghi p95 frame và thời gian hội tụ |
| Build | Typecheck/build theo quy tắc repository | Không regression compile |

## 9. Rủi ro và rollback
| Rủi ro | Giảm thiểu |
|---|---|
| Refresh chỉ có batch | Gắn nhãn cập nhật đã lưu; phát hàng đợi minh hoạ ngắn |
| Scene rebuild gây giật | Actor lifecycle riêng, reuse geometry/material |
| Không đi được tới đích | Highlight đồ, bỏ đoạn chạy |
| Dữ liệu mới đến giữa animation | Reconcile revision và flush snapshot |
Rollback: tắt lớp animation bằng cờ; hồi riêng thay đổi thuộc feature sau khi kiểm tra diff, không reset worktree hoặc dữ liệu. Xóa file có trước phiên cần phép người dùng.

## 10. Xác nhận đóng băng
- [x] Người dùng duyệt mô phỏng và scope, bao gồm đúng mesh/mẫu bàn thật.
- [x] Chốt acceptance criteria, dependency, rollback và verification.
- Chuyển FROZEN bởi/thời điểm: Codex theo yêu cầu triển khai của người dùng, 2026-11-15.

## 11. Change Log
Chưa có; thay đổi sau FROZEN phải thêm CR có lý do, ảnh hưởng và chấp thuận.

## 12. Implementation log
2026-11-15: chỉ tạo bản kế hoạch và mô phỏng độc lập tại work/animation-review/atelier-placement.html.

2026-11-15: Sau yêu cầu triển khai, đóng băng phạm vi rồi thêm PlacementTracker, floor routing và actor lifecycle trong `scene-animation/`. StudioViewport đăng ký chính furniture group sau khi model và material sẵn sàng; chỉ thay visible/scale tạm thời. Actor không nằm trong pickable meshes hay canonical/export. Thêm điều khiển tắt, reduced motion, visibility reset và giới hạn thời gian 9,5 giây. Scene snapshot được đọc trong chu kỳ refresh Studio hiện có, bỏ revision cũ/lặp và bỏ response của project không còn active.

2026-11-15: Chuyển VERIFYING. Bản triển khai hiện nằm trong worktree trên baseline `46719ac78a0869782721d389ab6f58e4cde1f42a`; fingerprint từng implementation/test file tại `work/animation-review/implementation-sha256.txt`. Chưa tạo commit, chưa thay revision cuối bằng một commit không tồn tại.

## 13. Verification evidence
| Kiểm tra | Kết quả | Evidence |
|---|---|---|
| Kiểm thử ban đầu bằng pnpm | Không chạy được: PowerShell chặn pnpm.ps1; pnpm.cmd không có dependency checkout | Chuyển sang bộ kiểm tra riêng trong work, không đổi policy hệ thống |
| TypeScript lần đầu | FAIL: narrowing nullable path/id trong callback | Đã sửa bằng local const có kiểu cụ thể |
| Unit/regression cuối | PASS 8 tests, 3 files | `node work/animation-review/tools/node_modules/vitest/vitest.mjs run --config work/animation-review/tools/vitest.config.mjs` |
| TypeScript module mới | PASS | `node work/animation-review/tools/node_modules/typescript/bin/tsc -p work/animation-review/tools/tsconfig.json --pretty false` |
| Parse TSX sửa đổi | PASS bằng esbuild transform | `work/animation-review/check-browser.mjs` |
| Browser harness lần đầu | FAIL: script chạy trước body | Sửa trang harness, giữ ghi nhận thất bại này |
| Chrome headless 1440/390 | PASS: no JS errors, no horizontal overflow, giữ transform/mesh, actor được remove | `work/animation-review/browser-evidence.json`, running/placed PNG theo width |
| Frame p95 cảnh harness | 7,2ms ở cả hai width, cảnh 1 bàn với Three.js 0.172.0, Chrome headless trên máy hiện tại | Không tương đương benchmark full Studio/SSAO/GLB lớn |
| git diff --check | PASS | Chạy sau các thay đổi cuối |
| Live service | BLOCKED: 3100 và 8000 đều không kết nối được; checkout chưa có node_modules | Chưa kiểm tra persist thật, full UI typecheck/build và full Studio perf |

Harness dùng mô hình bàn thử để kiểm tra chính code actor/routing và bảo toàn object; đây chưa phải E2E Studio với asset GLB và backend thật. Chưa đánh dấu toàn bộ acceptance criteria đạt.

## 14. Kết quả và đóng chức năng
Thiết kế đã được duyệt và code đã tích hợp trong scope. Chưa CLOSED: còn full UI build/typecheck, live persisted-scene integration, GLB thật/material overrides trong Studio, kiểm tra control/camera/selection ở full app và benchmark cảnh đại diện. Hai service hiện không chạy và checkout thiếu dependency; bằng chứng hiện tại chỉ bao phủ module và browser harness. Revision cuối sẽ ghi sau khi các gate này đạt, fingerprint worktree hiện có nằm trong mục 12.

2026-11-15: Người dùng yêu cầu dọn preview độc lập và công cụ kiểm thử cục bộ. Lệnh xóa thư mục tạm bị auto-review chặn vì phạm vi bao gồm cả các feature contract; chưa xóa file nào. Mã tính năng và unit tests trong `paperclip/ui/src/features/atelier/scene-animation/` được giữ. Trạng thái vẫn VERIFYING vì chưa đạt build UI và kiểm tra Studio/backend đầy đủ.

2026-11-15: Thu hẹp thao tác theo review, đã xóa riêng `work/animation-review/` chứa các mô phỏng/harness/ảnh/video và dependency thử nghiệm do Codex tạo. Các unit test nằm cùng mã tính năng vẫn được giữ. Các tài liệu hợp đồng 037/038 và `.pnpm-store/` không bị xóa.

2026-11-15, push handoff: code đã commit tại `c0d4690391bc65b4d8c08d7220969f136f442f1b`. Push HTTPS thất bại do không có credential GitHub/gh; GitHub connector hiện chưa kết nối. `pnpm.cmd check:token-gates` không lấy được pnpm runner từ npm. Chạy trực tiếp `node scripts/check-token-gates.mjs` cho thấy 75 màu, 32 arbitrary-value và 1 raw font-size vi phạm ở các file khác ngoài phần Atelier này; không sửa các mục ngoài phạm vi. Chưa chạy full UI build/typecheck vì các gate tích hợp Studio/backend vẫn chưa sẵn sàng.
