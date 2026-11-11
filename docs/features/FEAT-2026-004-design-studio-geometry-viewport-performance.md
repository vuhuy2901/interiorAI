# [FEAT-2026-004] P0 Design Studio geometry, viewport, scroll và performance

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal CAD Geometry / Three.js / React Performance / QA |
| Người chấp thuận | Product Owner, yêu cầu P0 trực tiếp |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 12:57 Asia/Bangkok |
| Revision bắt đầu | Root `f92c6c3`; Paperclip `eac39d0b` + working tree từ FEAT-2026-003 |
| Revision cuối | Chưa có |

## 1. Bối cảnh và bằng chứng ban đầu

Paperclip tại `http://localhost:3100` vẫn là UI duy nhất. Project production đang
hiển thị Revision #42 là `proj_demo_4x5m`, có 121 revision records. Audit tọa độ
canonical cho thấy đây không chỉ là artifact renderer:

- Room chính là hình chữ nhật 5600 x 7000 mm với bốn wall segment chuẩn.
- Project đồng thời chứa room thứ hai và tổng cộng 19 wall segments.
- Nhiều endpoint vượt bbox room chính, ví dụ `x=6540mm`.
- `wall_seg_8` từ `[4170,1980]` đến `[6540,2860]` là cạnh chéo thật trong dữ liệu.
- Room thứ hai có polygon gồm các cạnh chéo và không tương ứng với mô tả project
  4x5m ban đầu.
- Revision #42 được tạo bởi restore về revision #39; chuỗi revision gần nhất có
  nhiều thao tác restore liên tiếp.

Kết luận sơ bộ: production SceneGraph hiện chứa geometry hỗn hợp/không nhất quán.
Viewer phải render trung thực, validate và cảnh báo; không được âm thầm ép dữ liệu
production thành hình chữ nhật.

## 2. Mục tiêu

1. Dùng cùng canonical walls/rooms/openings/furniture cho 2D và 3D.
2. Loại artifact đường chéo do SVG polygon/triangulation hoặc phép nối sai.
3. Thêm geometry validation độc lập và status trung thực `Schema Valid` hoặc
   `Geometry Valid`.
4. Rebuild 2D CAD viewer có orthographic fit, pan, zoom, reset, center/clear
   selection và grid/layer controls.
5. 2D + 3D là split panes thật, resize được và giữ camera state.
6. Sửa scroll isolation của Inspector/AI, pointer/wheel event và panel lifecycle.
7. Đo và giảm rerender/reinitialization/GLB reload; có evidence trước/sau.
8. Giữ nguyên G0-G8 đã có, Paperclip shell và dữ liệu production.

Design Read: redesign-preserve cho CAD/BIM desktop chuyên nghiệp, technical light
theme, canvas-first, mật độ cao. Giữ design system/token Paperclip hiện tại.
`DESIGN_VARIANCE=3`, `MOTION_INTENSITY=2`, `VISUAL_DENSITY=9`.

## 3. Phạm vi

### In scope

- Audit canonical coordinates, renderer 2D/3D, wall joins, openings và projection.
- Pure geometry validator: closed boundary, zero-length, duplicate/overlap,
  self-intersection, invalid opening, bbox/area và 2D/3D source equivalence.
- 2D CAD navigation và exact fit-to-bounds.
- Split view divider thật; optional Inspector/AI docks; fullscreen canvas nếu có
  thể tích hợp an toàn trong route hiện tại.
- Scroll/wheel/pointer cleanup và `min-height: 0`/overflow chain đúng.
- Memoization/caching/cleanup cần thiết và performance instrumentation.
- Browser fixtures riêng: rectangle 5600x7000, non-rectangular, partitions,
  openings, collision và invalid geometry.
- Screenshot và report trước/sau.

### Out of scope

- Không sửa geometry production `proj_demo_4x5m` hoặc restore Revision #42.
- Không reset DB, xóa revision/project hoặc chạy standalone 5173.
- Không thay schema/database nếu chưa có Change Request.
- Không dựng lại toàn sản phẩm hoặc thay design system Paperclip.
- Không tuyên bố Blender/Cycles PASS.
- Không tạo geometry 2D giả khác canonical chỉ để che lỗi.

## 4. Tài nguyên bảo vệ và snapshot

Snapshot: `C:\Users\TUAN\Downloads\atelier-p0-geometry-backup-20261110-125357`

| Artifact | SHA256 |
|---|---|
| `workspace-source.zip` | `E35F0B7A3169F94B14B656D628B4254CC03A833ED7B87DD48A8DDD6373B29127` |
| `atelier.db` | `D12B7AC21BF73BF4C9218C611FCCA97D100CCF12C0360F8DAD263B45697E13D8` |
| `proj_demo_4x5m-rev42.json` | `0A3B7C2BDDDC2B47D2DA178A96C7D9C55A72D6688F268CB421BACCC20DC1B546` |

Thư mục còn chứa `all-projects.json`, root/nested binary diff patch. Rollback
implementation bằng patch/archive; rollback dữ liệu bằng SQLite snapshot chỉ khi
Product Owner yêu cầu rõ ràng.

## 5. Kế hoạch triển khai

1. Chụp baseline screenshot, DOM/scroll metrics và browser performance trace.
2. Tách pure geometry utilities và chạy validator trên production read-only + fixtures.
3. Thay 2D renderer bằng projection từ canonical wall segments, không dùng mesh
   triangles làm outline; tính bounds từ rooms + walls + openings + furniture.
4. Thêm persistent 2D camera state, pan/zoom/fit/reset/selection controls.
5. Tách split panes thật với divider; preserve 3D renderer/camera khi đổi panel.
6. Sửa scroll containers và wheel event ownership.
7. Memoize geometry/expensive derivations, cleanup listeners/RAF/resources và đo lại.
8. Chạy static, geometry unit tests, real browser E2E và cập nhật report trung thực.

## 6. File/component dự kiến

| File/component | Loại thay đổi |
|---|---|
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Rebuild 2D projection/navigation và renderer lifecycle |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Toolbar, split divider, canvas/fullscreen/panel behavior |
| `paperclip/ui/src/features/atelier/atelier-studio.css` | Layout, scroll isolation, responsive và pane sizing |
| `paperclip/ui/src/features/atelier/AIDesignAssistant.tsx` | Chat scroll/performance, jump-to-latest |
| `paperclip/ui/src/features/atelier/ObjectInspector.tsx` | Scroll/input event isolation nếu cần |
| `paperclip/ui/src/features/atelier/geometry.ts` | Thêm pure bounds/projection/validation utilities |
| `paperclip/scripts/atelier-p0-geometry-*.mjs` | Thêm geometry/browser/performance tests |
| Contract này | Implementation log, evidence, status |

Không dự kiến đổi backend/schema. Nếu cần endpoint hoặc migration mới, phải mở CR.

## 7. Acceptance criteria

- [ ] AC-01: Rev #42 và DB có snapshot; production project không bị mutation.
- [ ] AC-02: Rectangle fixture 5600x7000 đóng kín, bốn góc 90 độ, không diagonal giả.
- [ ] AC-03: Non-rectangular fixture giữ đúng cạnh nghiêng thật.
- [ ] AC-04: Invalid/duplicate/zero-length/self-intersection/opening/bbox được báo rõ.
- [ ] AC-05: 2D lấy cùng canonical geometry với 3D và không vẽ triangle artifacts.
- [ ] AC-06: Fit View thấy toàn bộ geometry với padding; pan/zoom/reset/selection hoạt động.
- [ ] AC-07: Split mode có hai pane thật và divider resize được.
- [ ] AC-08: Inspector và AI scroll độc lập; canvas không cướp wheel ngoài canvas.
- [ ] AC-09: Panel đóng/mở/resize không mất selection/camera và không có overlay chặn.
- [ ] AC-10: Chat dài có giữ scroll/jump-to-latest và không rerender theo từng ký tự toàn list.
- [ ] AC-11: Có before/after FPS/frame-time/long-task/memory/network evidence cùng fixture.
- [ ] AC-12: 2D/3D/split, lighting, camera, Save, revision, DXF/GLB, material,
  transform và AI mock được regression test.
- [ ] AC-13: Không console/network error ngoài failure mock có chủ đích.
- [ ] AC-14: 3100/8000 hoạt động, 5173 không có listener.

## 8. Verification plan

| Nhóm | Cách kiểm tra |
|---|---|
| Static | UI typecheck, token gates, diff check |
| Geometry | Pure Node tests với rectangle/nonrect/partition/opening/invalid fixtures |
| Browser | Playwright Edge trên 3100, fixture project riêng |
| Scroll/input | wheel/pointer/scrollTop metrics cho canvas, Inspector, AI |
| Performance | `performance.now`, RAF frame samples, Long Tasks, heap nếu browser hỗ trợ, request counts |
| Persistence | Fixture save + hard refresh + backend reread |
| Safety | Hash Rev #42/DB metadata trước-sau; port/process audit |
| Visual | 2D, 3D, split, panels, chat middle, invalid geometry screenshots |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Che geometry production sai | Validator + cảnh báo, không auto-normalize production |
| Pan/zoom làm selection lệch | Một transform matrix dùng cho render và hit testing |
| Split view tạo hai WebGL loops | Chỉ một 3D renderer instance cho pane 3D hiện hữu |
| Wheel listener chặn panel | Scope listener vào canvas, passive/cleanup đúng |
| Memoization giữ stale scene | Dependency từ canonical revision/data identity, browser regression |
| Test ghi production | Chỉ fixture riêng; production endpoint chỉ GET |

## 10. Xác nhận đóng băng

- [x] Scope/non-goals rõ.
- [x] Acceptance criteria đo được.
- [x] Snapshot và rollback point có hash.
- [x] Revision #42 đã xác định là `proj_demo_4x5m`.
- Trạng thái chuyển sang `FROZEN` bởi: Product Owner request / Codex
- Thời điểm: 2026-11-10 12:57 Asia/Bangkok

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| | | | | | | |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-10 | Root `f92c6c3`; Paperclip `eac39d0b` + FEAT-003 working tree | Phase 0 audit và snapshot | Chưa sửa implementation |

## 13. Verification evidence

| Thời điểm | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|
| 2026-11-10 | Revision identification | Rev #42 = `proj_demo_4x5m`, 121 records | API GET read-only |
| 2026-11-10 | Canonical coordinate audit | 19 walls; diagonal/out-of-bounds có thật trong data | Snapshot JSON + endpoint table |

## 14. Kết quả và đóng chức năng

- Kết quả: Đang triển khai.
- Hạn chế còn lại: Chưa có browser/performance evidence sau sửa.
- Rollback point: Mục 4.
- Trạng thái `CLOSED` bởi: Chưa đóng.
- Thời điểm: Chưa có.
