# [FEAT-2026-003] P0 khôi phục ATELIER AI bên trong Paperclip 3100

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Principal Full-Stack / Three.js / QA |
| Người chấp thuận | Product Owner (yêu cầu trực tiếp P0) |
| Ngày tạo | 2026-11-10 |
| Frozen at | 2026-11-10 |
| Revision bắt đầu | Root `f92c6c3`; Paperclip `eac39d0b` |
| Revision cuối | Paperclip `eac39d0b` + verified working tree (chưa commit theo yêu cầu) |

## 1. Bối cảnh

Paperclip tại `http://localhost:3100` là giao diện duy nhất nhưng route
`/design-studio` đang render một phiên bản ATELIER rút gọn. Audit ban đầu xác
nhận source trước tích hợp vẫn có trong Git/backup, trong khi UI hiện tại gọi
nhiều API path không tồn tại và dùng hai dock cố định tổng cộng 680px, làm canvas
bị thu nhỏ.

Bằng chứng trước triển khai:

- UI gọi `/projects/{id}/estimates`, `/projects/{id}/chat`,
  `/projects/{id}/revisions`, `/catalog/materials` và
  `/projects/{id}/export/glb`; các URL này trả 404.
- Endpoint thật `/estimates/{id}`, `/chat/history?project_id=...`, `/materials`,
  `/exports/{id}/glb` trả 200.
- Source cũ có PBR material slots, GLB asset switcher, Smart Fit, Day/Sunset/Night,
  SSAO/HDRI, dock resize và Save Scene; bản Paperclip hiện tại thiếu một phần các
  luồng này.

## 2. Mục tiêu

Khôi phục có chọn lọc các chức năng đã tồn tại từ source G0-G8 vào route native
Paperclip `/design-studio`, sửa các đường API và interaction bị regression, ưu
tiên canvas, giữ Pascal SceneGraph là geometry source of truth và kiểm thử thật
trên cổng 3100 bằng fixture/test scene.

Design Read: redesign-preserve cho ứng dụng CAD/BIM chuyên nghiệp, giữ ngôn ngữ
Architectural Daylight hiện hữu. `DESIGN_VARIANCE=3`, `MOTION_INTENSITY=2`,
`VISUAL_DENSITY=8`. Không áp mẫu landing page hoặc thêm hiệu ứng trang trí.

## 3. Phạm vi

### In scope

- Lập bảng forensic G0-G8 dựa trên source, endpoint và browser evidence.
- Sửa API adapter/path, error/loading state và các control P0 trong Design Studio.
- Khôi phục từ source có sẵn: Save Scene, export DXF/GLB, revision, transform,
  GLB/PBR material, Smart Fit, view/lighting/camera controls khi backend hiện hữu.
- Tái bố trí workspace: canvas là vùng chính; Inspector đóng/mở và resize được;
  AI Assistant là dock/drawer đóng/mở và resize được; responsive không overflow.
- Giữ route, Paperclip shell/navigation và các control-plane module không liên quan.
- Thêm test browser fixture riêng, screenshot trước/sau, kiểm tra output file thật.
- Báo PARTIAL/BLOCKED cho Gate không đủ bằng chứng hoặc thiếu dependency.

### Out of scope

- Xây lại ATELIER từ đầu, chạy lại standalone 5173 hoặc dùng iframe.
- Tạo database/Compose/server thứ hai hoặc reset dữ liệu.
- Tự bịa chức năng chưa từng có trong source.
- Ghi vào scene production để thử nghiệm; AI model thật chỉ dùng khi có cho phép.
- Sửa module Paperclip ngoài route/integration ATELIER cần thiết.
- Cài Blender/Cycles; nếu không có thì G5-G6 giữ BLOCKED/PARTIAL.

## 4. Dependency và tài nguyên cần bảo vệ

- Paperclip source/database hiện có và shell trên cổng 3100.
- PostgreSQL tại `C:\Users\TUAN\.paperclip\instances\default\db`.
- FastAPI/Pascal sidecar trên cổng 8000 và toàn bộ scene/revision/assets hiện có.
- Projects, Tasks, Agents, Workflows, Conversations, approvals và run history.
- Snapshot rollback:
  `C:\Users\TUAN\Downloads\atelier-paperclip-p0-backup-20261110\paperclip-atelier-before-p0.zip`
  SHA256 `16678D027FF64054BDA7B11DCB7450706F74BD4582336B639B7CC2B39C2D479B`.

## 5. Thiết kế và kế hoạch triển khai

1. Hoàn tất map source cũ, source Paperclip và backend endpoint thật.
2. Chuẩn hóa một API adapter/context với lỗi hiển thị rõ, không silent failure.
3. Port từng capability đã có, ưu tiên Save/Export/selection/transform trước.
4. Khôi phục viewer/PBR/Smart Fit bằng component/service cũ, không fork sản phẩm.
5. Chuyển hai dock sang layout có collapse/resize và giới hạn theo viewport.
6. Viết browser fixture test không phá dữ liệu; kiểm tra file DXF/GLB đầu ra.
7. Chạy typecheck/token gates/test/browser, chụp screenshot và lập báo cáo trung thực.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/ui/src/features/atelier/AtelierStudioContext.tsx` | Sửa | API adapter, state, error và capability handlers |
| `paperclip/ui/src/features/atelier/AtelierDesignStudioPage.tsx` | Sửa | Toolbar, Save/Export, dock layout |
| `paperclip/ui/src/features/atelier/StudioViewport.tsx` | Sửa | Khôi phục viewer G1-G3 có evidence |
| `paperclip/ui/src/features/atelier/ObjectInspector.tsx` | Sửa | Transform, asset, PBR, Smart Fit |
| `paperclip/ui/src/features/atelier/AIDesignAssistant.tsx` | Sửa tối thiểu | Error state và dock/drawer behavior |
| `paperclip/ui/src/features/atelier/atelier-studio.css` | Sửa | Canvas-first responsive/resizable layout |
| Test/evidence ATELIER mới | Thêm | Browser, export và regression proof |
| Contract này | Cập nhật log | Truy vết triển khai và status Gate |

Không dự kiến sửa schema/database. Thay đổi server chỉ được thêm bằng Change
Request nếu audit chứng minh proxy hiện tại không thể hỗ trợ contract backend.

## 7. Acceptance criteria

- [x] AC-01: Paperclip 3100 là UI duy nhất; cổng 5173 không tự chạy.
- [x] AC-02: Scene fixture load được và canvas chiếm phần lớn vùng workspace.
- [x] AC-03: Inspector và AI Assistant đóng/mở, resize hoặc drawer đúng breakpoint.
- [x] AC-04: 2D/3D/split, camera và lighting đã tồn tại hoạt động thật.
- [x] AC-05: Chọn sofa và sửa transform/dimension được kiểm tra trên fixture.
- [x] AC-06: Save tạo revision và hard refresh đọc lại đúng dữ liệu fixture.
- [x] AC-07: DXF và GLB tải được, có magic/structure hợp lệ và không phải file giả.
- [x] AC-08: PBR/GLB/Smart Fit chỉ gán status theo source + API + browser evidence.
- [x] AC-09: AI Chat mock có loading/success/error; model thật không bắt buộc.
- [x] AC-10: Không console error hoặc API failure ngoài lỗi 500 mock có chủ đích.
- [x] AC-11: Không thay đổi/xóa dữ liệu production hoặc module Paperclip ngoài scope.
- [x] AC-12: Mỗi Gate và control có bảng status trung thực PASS/PARTIAL/BLOCKED.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Static | UI typecheck + token gates | Không lỗi mới |
| API map | GET/POST fixture endpoints qua 3100 | Không dùng path 404 |
| Viewer | Playwright Edge trên `/design-studio` | Scene/canvas/mode/selection hoạt động |
| Persistence | Clone fixture, sửa, save, reload | Revision và transform khớp |
| Export | Tải DXF/GLB fixture | DXF parse được; GLB magic `glTF` và JSON hợp lệ |
| Responsive | 1440x900, 1024x768, 390x844 | Không overflow/click lệch |
| Safety | Port/process/git/data path audit | 5173 tắt, DB path giữ nguyên |
| Gates | Đối chiếu source/API/browser/evidence | Không nâng status thiếu bằng chứng |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Port nguyên App cũ phá Paperclip shell | Chỉ port capability/component, giữ route/provider hiện tại |
| Test làm thay đổi scene người dùng | Tạo project fixture riêng và chỉ ghi fixture |
| Three.js leak hoặc raycast lệch sau resize | Cleanup nghiêm ngặt, ResizeObserver và browser metrics |
| API proxy che mất lỗi | Kiểm tra status/body, hiển thị lỗi và test URL thật |
| Khôi phục UI nhưng backend chưa có | Giữ PARTIAL/BLOCKED, không tạo toast giả |

Rollback: khôi phục đúng các file ATELIER từ snapshot ZIP hoặc Git diff của nested
repo; không rollback/reset database.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Product Owner request / Codex
- Thời điểm: 2026-11-10

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-10 | Bổ sung sửa `AtelierPages.tsx` và `ConversationAtelierSidecar.tsx` | Typecheck phát hiện hai integration adapter vẫn dùng contract/component props cũ; catalog replace gọi sai endpoint | Chỉ sửa compatibility ATELIER; không đổi schema hoặc module Paperclip khác | Nằm trong yêu cầu P0 sửa toàn bộ regression | 1.1 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-10 | Root `f92c6c3`; Paperclip `eac39d0b` | Hoàn tất audit ban đầu và snapshot | Chưa sửa implementation |
| 2026-11-10 | Paperclip working tree | Khôi phục viewer, Object Inspector, PBR resolver, GLB asset switcher, Smart Fit và AI Assistant từ source trước tích hợp | Giữ route native Paperclip; không iframe/standalone |
| 2026-11-10 | Paperclip working tree | Sửa API paths, data shape, save/export/proposal handlers và error propagation | Loại các request 404 từ Design Studio |
| 2026-11-10 | Paperclip working tree | Chuyển workspace sang canvas-first, Inspector/AI dock đóng mở và resize | Canvas mặc định 71.86% workspace tại 1440px |
| 2026-11-10 | Paperclip working tree | Sửa adapter của Supporting Pages, Conversation sidecar và catalog replace | UI typecheck trở lại sạch |
| 2026-11-10 | Paperclip working tree | Thêm browser audit/E2E scripts và chạy fixture thật | Không ghi scene production |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-10 | `eac39d0b` | API path audit | Nhiều path UI hiện tại 404; endpoint cũ tương ứng 200 | Output audit trong phiên |
| 2026-11-10 | `eac39d0b` | Source comparison | Source cũ đầy đủ hơn source Paperclip đang render | Git root `apps/web` và nested `ui/src/features/atelier` |
| 2026-11-10 | Working tree | UI typecheck trên Node `24.22.2` | PASS, exit 0 | `pnpm --filter @paperclipai/ui typecheck` |
| 2026-11-10 | Working tree | CSS token gates | 4/4 gate CLEAN | `node scripts/check-token-gates.mjs` trong `pnpm check:token-gates` |
| 2026-11-10 | Working tree | Palette generated-file sync | PRE-EXISTING DRIFT | `sync-agent-palette-tokens.mjs --check` yêu cầu sync; file không thuộc diff ATELIER nên không tự ý sửa |
| 2026-11-10 | Working tree | Port audit | PASS | 3100 và 8000 LISTEN; 5173 không có listener |
| 2026-11-10 | Working tree | Real browser Edge E2E | PASS, 29 checks | `C:\Users\TUAN\Downloads\atelier-p0-evidence-20261110\e2e-report.json` |
| 2026-11-10 | Fixture `proj_2e72fb1d` | Save/revision/hard refresh | PASS | Rev 11 → 12; W 2130mm và X 1100mm đọc lại đúng sau reload |
| 2026-11-10 | Fixture `proj_2e72fb1d` | DXF/GLB output | PASS | DXF 23,408 bytes chứa `SECTION`; GLB 7,536 bytes có magic `glTF` |
| 2026-11-10 | Fixture `proj_2e72fb1d` | GLB/PBR/Smart Fit | PASS cho luồng được test | Sofa_01 đúng 1 slot `Sofa_01`; PBR proposal và Smart Fit API 200 |
| 2026-11-10 | Working tree | Responsive/browser errors | PASS | 1024×768 và 390×844 không overflow; không console/network error ngoài 500 mock có chủ đích |

## 14. Root cause

1. Component Design Studio đầy đủ từng tồn tại trong root Git nhưng khi tích hợp
   đã bị thay bằng các bản rút gọn trong nested Paperclip; nhiều capability vẫn ở
   backend/source nhưng không còn được import/render.
2. Context Paperclip dùng API contract cũ hoặc sai path/data shape, dẫn đến các
   request 404 cho estimate, chat, revision, materials, catalog và export.
3. Inspector 300px và AI dock 380px luôn mở, làm viewport chỉ còn 457/1137px.
4. `AtelierPages` và conversation sidecar vẫn gọi prop/context contract cũ, làm
   typecheck hỏng và một số luồng catalog gọi sai endpoint/payload.
5. Trạng thái lỗi của các mutation quan trọng chưa được đưa ra UI nhất quán, nên
   lỗi backend có thể trông giống nút bị kẹt.

## 15. Gate report

| Gate | Before integration | Current code | Current UI | Verified test | Status |
|---|---|---|---|---|---|
| G0 SceneGraph | Có geometry/revision/persistence | Pascal project vẫn là source of truth; PUT scene thật | Scene, transform và revision hiện diện | Sửa W/X, Save, rev 11→12, hard refresh đọc lại đúng | PASS |
| G1 Real GLB | Source cũ có GLTF loader và asset metadata | GLTFLoader, transform, bounding/metadata và material slot thật đã khôi phục | GLB asset selector + WebGL render | Sofa_01 gán thật, render thật, đúng 1 slot `Sofa_01` | PASS |
| G2 PBR | Source cũ có resolver/Inspector | Resolver, canonical fields, preview/proposal và revision hook có lại | PBR editor dùng slot thật | Proposal API và screenshot render có bằng chứng; chưa duyệt/apply rồi kiểm tra persistence/visual diff toàn bộ texture | PARTIAL |
| G3 Viewer | Nhiều control bị mất khỏi UI | Day/Sunset/Night, modes, camera, HDRI/SSAO, Smart Fit, placement code, resize | Các control đã hiện và thao tác được | Modes/camera, selection, Smart Fit, resize, hard refresh PASS; placement proposal end-to-end chưa test | PARTIAL |
| G4 Material & Approval | Source/API có proposal/approval | UI và handlers được nối lại | Preview + tạo proposal có lại | Tạo proposal PASS; approve/reject + rollback vật liệu chưa chạy E2E | PARTIAL |
| G5 Blender | Không có bằng chứng môi trường | Không thay đổi | Không tuyên bố render production | Không tìm thấy `blender` command/exe | BLOCKED |
| G6 Cycles/Render | Phụ thuộc Blender/Cycles | Không thay đổi | Không hiển thị PASS giả | Thiếu Blender/Cycles | BLOCKED |
| G7 Agent orchestration | Control Center/source vẫn có nhưng contract sidecar lệch | Typecheck và sidecar contract đã sửa; error propagation có | Chat mock success/error hoạt động | Mock UI PASS; chưa xác minh model thật, MCP connection, tool events và workflow trace | PARTIAL |
| G8 E2E | Tích hợp bị regression | P0 fixture script tự động | Luồng chính dùng được trên 3100 | 29 browser checks PASS, output file thật, responsive và hard refresh PASS | PASS (phạm vi fixture P0) |

## 16. Interactive control report

| Button/control | Handler | Backend/API | Browser result | Status |
|---|---|---|---|---|
| Save Scene | `handleSaveScene` | `PUT /projects/{id}/scene` | Revision tăng và W/X tồn tại sau hard refresh | PASS |
| DXF Export | `handleExport("dxf")` | `GET /exports/{id}/dxf` | File 23,408 bytes chứa `SECTION` | PASS |
| GLB Export | `handleExport("glb")` | `GET /exports/{id}/glb` | File 7,536 bytes, magic `glTF` | PASS |
| Revision History | drawer open/close + restore handler | restore endpoint đã nối | Mở/đóng PASS; không thực hiện restore mutation | PARTIAL |
| Select Furniture | `setSelectedEntityId` | local selection/state | Chuyển table → sofa cập nhật Inspector | PASS |
| Edit W/D/H | `handleUpdateFurnitureField` | Save Scene | 6 input hiện; W sửa và persist; D/H cùng handler nhưng chưa đổi E2E | PARTIAL |
| Edit X/Y/Rotation | `handleUpdateFurnitureField` | Save Scene | X sửa và persist; Y/rotation hiện nhưng chưa đổi E2E | PARTIAL |
| Material Selection | preview/proposal handlers | material-proposals | Slot thật + proposal PASS; approval/persistence chưa test | PARTIAL |
| Inspector | toggle + pointer resize | localStorage | Close/reopen, 320→284px, reload giữ 284px | PASS |
| AI Chat Send | `handleSendChat` | chat messages | Mock 200 success và mock 500 thoát loading + hiện lỗi | PASS (mock) |
| AI Suggestions | `onSendChat(text)` | chat messages | Source/UI hiện; từng suggestion chưa click E2E | PARTIAL |
| View Modes | `setViewMode` | local renderer state | 2D, 3D, split click PASS | PASS |
| Camera/Lighting | preset setters | Three.js renderer | Day/Sunset/Night + Orbit/Top/Walk/Cutaway click PASS | PASS |
| Smart Fit | `handleRequestSmartFit` | smart-fit endpoint | API/UI result PASS | PASS |
| Workflow/Agent Actions | Control Center handlers | workflow/agent APIs | Typecheck PASS; chưa test model/MCP thật | PARTIAL |

## 17. Kết quả và đóng chức năng

- Kết quả: Khôi phục P0 hoàn tất trong Paperclip 3100; không dựng lại standalone,
  không iframe, không đổi schema/database và không xóa dữ liệu.
- File implementation đã sửa/thêm: `AtelierStudioContext.tsx`,
  `AtelierDesignStudioPage.tsx`, `StudioViewport.tsx`, `ObjectInspector.tsx`,
  `AIDesignAssistant.tsx`, `AtelierPages.tsx`, `ConversationAtelierSidecar.tsx`,
  `atelier-studio.css`, `materialResolver.ts`, hai browser test script.
- Screenshot trước:
  `C:\Users\TUAN\Downloads\atelier-p0-baseline-20261110\before-design-studio.png`.
- Screenshot sau:
  `C:\Users\TUAN\Downloads\atelier-p0-baseline-20261110\after-layout2-design-studio.png`,
  cùng ảnh responsive trong `atelier-p0-evidence-20261110`.
- Hạn chế còn lại: G2/G3/G4/G7 giữ PARTIAL; G5-G6 BLOCKED do thiếu
  Blender/Cycles. `check:token-gates` có 4 gate CSS sạch nhưng tổng command còn
  fail ở generated palette sync ngoài diff ATELIER.
- Dữ liệu test: chỉ dùng các project có tên `P0 Regression Fixture`; fixture chốt
  là `proj_2e72fb1d`. Không xóa các fixture cũ vì yêu cầu cấm xóa dữ liệu.
- Rollback point: Snapshot ZIP nêu tại Mục 4.
- Trạng thái `CLOSED` bởi: Codex sau static + real-browser verification.
- Thời điểm: 2026-11-10.
