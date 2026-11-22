# [FEAT-2026-126] Xây dựng FurniMesh 3D Furniture MCP Server & Crawler

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.2 |
| Owner | Multi-Agent / 3D Asset System Engineer |
| Người chấp thuận | Người dùng (theo kế hoạch build FurniMesh MCP Server) |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19 (Asia/Bangkok) — v1.1 sau CR-001 |
| Revision bắt đầu | 84bdd04c3275e68645b1f7ef67e394fa27b4734a |
| Revision cuối | `84bdd04c3275e68645b1f7ef67e394fa27b4734a` + working tree chưa commit (Phase 4 postMessage/GLTFLoader 2026-11-20) |

## 1. Bối cảnh

Hệ thống ATELIER AI và Pascal 3D Editor cần truy cập vào kho thư viện mô hình nội thất 3D thực tế phong phú (sofas, chairs, tables, beds, lighting, decor) với định dạng chuẩn GLB, OBJ kèm metadata và ảnh thumbnail.
Website FurniMesh (`furnimesh.com`) chứa ~18.000 mô hình 3D chất lượng cao, công khai và có đường dẫn tải trực tiếp file `.glb`, `.obj`, ảnh thumbnail từ Google Cloud Storage (`storage.googleapis.com/furnimesh-3d/`).
Cần xây dựng bộ công cụ crawler thu thập dữ liệu và máy chủ MCP Server (Model Context Protocol) cung cấp 4 công cụ chuẩn cho các tác tử AI (Pascal, Claude Desktop, Antigravity Agent).

## 2. Mục tiêu

1. **Phase 1 — Crawl & Index**:
   - Viết crawler Python trích xuất toàn bộ thư viện FurniMesh từ luồng RSC Next.js (`initialCards`) và sitemap.
   - Hỗ trợ lưu trữ luân phiên/checkpoint, ghi nhận metadata chi tiết: `id`, `slug`, `name`, `description`, `mainImage`, `glb3D`, `obj3D`, `parentCategory`, `subcategory`, tags, view/download counts.
   - Lưu trữ dữ liệu chuẩn hóa tại `data/furnimesh/index.json` và cơ sở dữ liệu SQLite `data/furnimesh/catalog.db` để tra cứu full-text search tức thì.

2. **Phase 2 — Build MCP Server**:
   - Xây dựng MCP Server đạt chuẩn `@modelcontextprotocol/sdk` (Node.js/TypeScript) hoặc Python `mcp` với 4 tools bắt buộc:
     - `search_furniture`: tìm kiếm full-text theo query, lọc theo category, giới hạn kết quả (trả về id, name, thumbnail, glb_url, obj_url).
     - `download_model`: tải file `.glb` trực tiếp về đường dẫn cục bộ chỉ định, trả về `{ success, file_size, local_path }`.
     - `list_categories`: liệt kê danh mục chính và danh mục con.
     - `get_model`: lấy đầy đủ metadata chi tiết của một model theo ID hoặc slug.

3. **Phase 3 — Local Storage & Index Partitioning**:
   - Phân vùng dữ liệu theo category: `data/furnimesh/by-category/*.json`.
   - Chuẩn bị cấu trúc sẵn sàng cho Cloudflare R2 / S3 hosting.

4. **Phase 4 — Tích hợp Agent Pascal**:
   - Cung cấp module kết nối hoặc cấu hình MCP config cho agent gọi tìm kiếm nội thất theo ngữ cảnh thiết kế (ví dụ: "sofa màu xám", "bàn ăn tròn gỗ sồi"), tự động tải GLB và gắn vào SceneGraph.

## 3. Phạm vi

### In scope

- Module Crawler Python (`packages/furnimesh-crawler/` hoặc `scripts/furnimesh/`):
  - Thu thập dữ liệu theo batch an toàn, có resume checkpoint.
  - Hỗ trợ crawl nhanh mẫu dữ liệu (sample seed) và crawl toàn bộ catalog.
- MCP Server Package (`packages/furnimesh-mcp/`):
  - Cài đặt `@modelcontextprotocol/sdk` hoặc Python stdio MCP server.
  - Hiện thực 4 tools: `search_furniture`, `download_model`, `list_categories`, `get_model`.
  - Hỗ trợ tìm kiếm từ khóa không phân biệt hoa thường, tiếng Anh / tiếng Việt căn bản, xếp hạng theo độ khớp và mức độ phổ biến (rank/downloads).
- Cấu hình tích hợp MCP vào hệ thống Atelier / Paperclip và Pascal.

### Out of scope

- Không can thiệp hoặc thay đổi các router hiện có của Paperclip hay backend FastAPI.
- Không sửa đổi mã nguồn trang web bên ngoài FurniMesh.

## 4. Dependency và tài nguyên cần bảo vệ

- Băng thông mạng: thiết lập độ trễ hợp lý (rate limit polite) giữa các request để không gây quá tải cho máy chủ mục tiêu.
- Thư mục lưu trữ: `data/furnimesh/` lưu trữ cache và index độc lập, không làm phình Git repository (thêm vào `.gitignore` cho các file dữ liệu nặng).
- Tính nguyên vẹn của workspace hiện tại trên Git `master`.

## 5. Thiết kế và kế hoạch triển khai

1. **Bước 1**: Đóng băng hợp đồng tính năng `FEAT-2026-126`.
2. **Bước 2**: Viết script crawler (`scripts/furnimesh/crawler.py`):
   - Crawl pagination `/library/?page={p}` trích xuất `initialCards`.
   - Xuất dữ liệu ra `data/furnimesh/index.json` và SQLite `data/furnimesh/catalog.db`.
3. **Bước 3**: Khởi tạo seed ban đầu (500–2.000 models tiêu biểu đại diện cho tất cả categories) để kiểm thử ngay lập tức, hỗ trợ cờ `--all` để tiếp tục crawl toàn bộ 18.000 models trong nền.
4. **Bước 4**: Xây dựng MCP Server (`packages/furnimesh-mcp/`):
   - Cài đặt 4 công cụ MCP chuẩn stdio.
5. **Bước 5**: Kiểm thử độc lập 4 công cụ MCP (Search, Download, List Categories, Get Model).
6. **Bước 6**: Tích hợp module adapter vào Pascal / ATELIER AI để agent có thể gọi tìm kiếm và nạp đồ nội thất trực tiếp.
7. **Bước 7**: Ghi nhận bằng chứng và hoàn thành hợp đồng.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-126-furnimesh-mcp-server-and-crawler.md` | Mới | Hợp đồng tính năng bắt buộc |
| `scripts/furnimesh/crawler.py` | Mới | Crawler đa luồng trích xuất danh mục FurniMesh |
| `packages/furnimesh-mcp/package.json` | Mới | Package định nghĩa MCP Server |
| `packages/furnimesh-mcp/src/index.ts` | Mới | Máy chủ MCP Server với 4 tools chuẩn |
| `packages/furnimesh-mcp/README.md` | Mới | Hướng dẫn sử dụng và kết nối Claude Desktop / Pascal |
| `.gitignore` | Cập nhật | Bỏ qua thư mục tải model 3D nặng `*.glb`, `*.obj` |

## 7. Acceptance criteria

- [ ] AC-01: Script crawler trích xuất thành công dữ liệu models từ FurniMesh với đầy đủ trường: `id`, `name`, `description`, `category`, `subcategory`, `thumbnail_url`, `glb_url`, `obj_url`.
- [ ] AC-02: Dữ liệu được lưu trữ có cấu trúc trong file `data/furnimesh/index.json` và chia theo danh mục `data/furnimesh/by-category/*.json`.
- [ ] AC-03: MCP Server khởi chạy thành công qua giao thức stdio và expose đủ 4 công cụ: `search_furniture`, `download_model`, `list_categories`, `get_model`.
- [ ] AC-04: `search_furniture` tìm kiếm chính xác theo từ khóa và bộ lọc danh mục.
- [ ] AC-05: `download_model` tải file GLB thật về ổ đĩa và trả về đường dẫn cùng kích thước hợp lệ.
- [ ] AC-06: `list_categories` trả về danh sách các danh mục có trong thư viện.
- [ ] AC-07: `get_model` trả về thông tin chi tiết của model theo ID.

## 8. Verification plan

| Kiểm tra | Cách chạy | Kết quả mong đợi |
|---|---|---|
| Chạy crawler seed | `python scripts/furnimesh/crawler.py --max-pages 10` | Tạo ra file index.json chứa ~240 models chuẩn |
| Kiểm tra MCP Server | Gọi tool `list_categories`, `search_furniture`, `download_model`, `get_model` | Kết quả JSON chuẩn MCP |
| Kiểm tra file GLB | Tải 1 file GLB mẫu và kiểm tra dung lượng | File `.glb` hợp lệ > 0 bytes |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Quá tải request tới server furnimesh | Thêm throttle/sleep giữa các page requests, lưu checkpoint theo từng page |
| File GLB quá nặng làm đầy đĩa | Chỉ tải khi có lệnh `download_model`, bỏ qua commit file `.glb` vào Git |
| Rollback | Xóa package `packages/furnimesh-mcp/` và `scripts/furnimesh/` |

## 10. Tóm tắt các lần xem xét

| Lần | Ngày | Người xem xét | Ý kiến | Kết quả |
|---|---|---|---|---|
| 1 | 2026-11-19 | System Architect | Phê duyệt kế hoạch 4 phase | Chấp thuận FROZEN |

## 11. Bảng yêu cầu thay đổi

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-19 (Asia/Bangkok) | Mở rộng pass tích hợp Paperclip: adapter FurniMesh on-demand qua HTML công khai (không crawl/tải toàn bộ kho), MCP Streamable HTTP với 6 tools (`list_furniture_categories`, `search_furniture`, `get_furniture_details`, `get_model_glb_url`, `preview_furniture`, `check_asset_compatibility`), SSRF/redirect/size/timeout safeguards, connector app definition và Pascal Scene Asset Bridge contract. `download_model`, full-catalog persistence và stdio-only delivery không thuộc pass tích hợp này; crawler cũ được giữ để tương thích nhưng không được dùng làm runtime source of truth. | Prompt tích hợp FurniMesh MCP vào Paperclip yêu cầu truy xuất công khai có kiểm soát, không đồng bộ cả thư viện và không tuyên bố end-to-end Pascal khi API chưa có bằng chứng. | Thêm source adapter, MCP HTTP server, shared schemas/tests, Paperclip connector catalog/permissions wiring, scene bridge contract và vận hành; giữ nguyên agent orchestration/Paperclip core invariants. | Người dùng (MASTER PROMPT, 2026-11-19) | 1.1 |
| CR-002 | 2026-11-20 | Phase 4: đổi từ Pascal SceneGraph sang postMessage trực tiếp đến Three.js ai-office scene. ai-office-standalone/index.html nhận `THREE.GLTFLoader` và `window.addEventListener('message', ...)` để load GLB khi nhận `{type:'furnimesh:add', glb_url, name}`. FurniMeshLibraryPanel.tsx kích hoạt nút "Use in Scene" gửi postMessage qua `window.open('http://localhost:8123/','aioffice')`. | Nhẹ hơn Pascal CAS/approval gate, đủ cho demo E2E; Pascal SceneGraph vẫn áp dụng cho production workflow qua `/api/v1/projects/{id}/furniture/from-furnimesh`. | ai-office-standalone/index.html, paperclip/ui/src/pages/apps/app-detail/FurniMeshLibraryPanel.tsx. Không ảnh hưởng backend routes hiện có. | Người dùng (2026-11-20) | 1.2 |

## 12. Implementation log

| 2026-11-19 | 84bdd04c3275e68645b1f7ef67e394fa27b4734a | Bắt đầu implementation pass v1.1 sau CR-001. | Chưa sửa implementation trước khi contract được FROZEN. |
| 2026-11-19 | working tree sau HEAD trên | Sửa parser category FurniMesh để ưu tiên `<dt>/<dd>` hiển thị và fallback JSON-LD; sửa description decode/heading; lọc `list_furniture_categories` chỉ còn category path, không lẫn model detail. | Live HTML đã chứng minh regex cũ có thể trả JSON-LD tail hoặc model như category. Đây là bug fix trong phạm vi adapter public HTML, không đổi yêu cầu frozen. |

## 13. Verification evidence

### Evidence cho pass tích hợp CR-001

- Contract v1.1 đã được FROZEN trước khi sửa implementation; CR-001 loại trừ full-catalog sync/download và stdio-only delivery khỏi pass này.
- Live public-source smoke test ngày 2026-11-19: `search_furnimesh(query="chair", limit=1)` đọc HTML FurniMesh và trả về model `a-contemporary-accent-chair-featuring-a-rounded-ytct9c`, thumbnail, detail URL, GLB URL trên Google Cloud Storage, category `Seating → Armchair`, polycount `291120`, file size `48.3 MB`, và `dimensions_source=scene_units`.
- Python verification: `python -m py_compile ...`; `python -m pytest -q tests/test_asset_pipeline.py tests/test_pascal_scene_asset_bridge.py -k 'furnimesh or scene_asset' --basetemp .tmp/pytest-furnimesh` → `5 passed, 3 deselected`.
- Final focused Python suite: `python -m pytest -q tests/test_asset_pipeline.py tests/test_pascal_scene_asset_bridge.py --basetemp .tmp/pytest-furnimesh-final` → `8 passed`.
- MCP contract verification: `pnpm.cmd --filter @paperclipai/furnimesh-mcp test` → `2 test files, 2 tests passed`; tool discovery xác nhận đúng 6 tool bắt buộc. `typecheck`, `build`, và `@paperclipai/shared typecheck` đều pass trên Node `v22.19.0`, với cảnh báo workspace yêu cầu Node `>=24.11.0`.
- Paperclip definition verification: `node scripts/ingest-app-definitions.mjs --definitions-only` → `111 Wave 1 definitions`; FurniMesh có JSON definition, branding, permission review public-read, và được thêm vào `CONNECTABLE_APP_SLUGS`.
- API OpenAPI verification: các route `/api/v1/furnimesh/*`, `/api/v1/projects/{project_id}/furniture`, và `/api/v1/projects/{project_id}/furniture/from-furnimesh` xuất hiện trong schema; route scene dùng CAS/idempotency/Pascal verification hiện có.
- UI verification limitation: `@paperclipai/ui typecheck` dừng ở `storybook-catalog.mjs` vì các reference skill cũ trong `paperclip/maps`; chạy trực tiếp `run-tsc.mjs -b` chỉ còn lỗi baseline thiếu `ui/generated/catalog.json` và `feature-index.json`, không có lỗi được báo từ FurniMesh panel.
- Live MCP Streamable HTTP ngày 2026-11-19: server thật lắng nghe `http://127.0.0.1:3180/mcp`; SDK client handshake thành công, `listTools` trả đúng 6 tool (`list_furniture_categories`, `search_furniture`, `get_furniture_details`, `get_model_glb_url`, `preview_furniture`, `check_asset_compatibility`).
- Live MCP calls qua cùng endpoint: `search_furniture(query="chair", limit=1)` trả model `a-contemporary-accent-chair-featuring-a-rounded-ytct9c`, category `Seating → Armchair`, thumbnail và GLB thật; `get_model_glb_url` trả `verified=true`; `check_asset_compatibility` trả `compatible=true`, `content_type=model/gltf-binary`, `file_size_bytes=50605216` bằng HEAD không tải thư viện. `search_furniture(query="bed", limit=1)` trả model bed thật, GLB `12178844` bytes qua HEAD. `list_furniture_categories` sau fix trả 7 category; query `desk` trả `[]` trong public GLB listing hiện tại.
- Paperclip runtime attempt thật: `node node_modules/tsx/dist/cli.mjs ../scripts/dev-runner.ts dev` dừng trước khi mở HTTP port vì embedded PostgreSQL port `54329` bị từ chối: `Execution of PostgreSQL by a user with administrative permissions is not permitted`. Không có Paperclip API/UI instance để kiểm chứng connector discovery, agent tool call, permission enforcement hoặc activity log.
- Pascal adapter inspection/runtime: `packages/pascal-adapter/gateway.mjs` tạo `SceneBridge` bằng `InMemoryTransport`; `SceneBridge` của `@pascal-app/mcp` là headless và không gắn renderer. Smoke sync room 6×4×2.8m tạo được hai node `item` và `verification.valid=true`, nhưng `geometryRepresentation=authored_bench_and_canonical_furniture_envelopes`, không phải imported FurniMesh GLB; không có Pascal Editor process/viewport để xác minh render, transform và reload.
- Vì vậy bài test bedroom 6×4×2.8m chưa đạt tiêu chí “GLB tải và render thật”, provenance/CAS contract mới được kiểm thử ở unit/API level, chưa được chứng minh xuyên Paperclip → agent → Pascal thật. Không đánh dấu E2E pass.

## 14. Kết quả và đóng chức năng

Pass v1.1 đã hoàn thành phần adapter public HTML, MCP Streamable HTTP standalone, Paperclip connector/catalog/permissions wiring, UI library read/preview, và bridge contract/CAS route. **Kết quả hiện tại: BLOCKED — chưa thể đóng contract** vì môi trường thiếu Paperclip runtime PostgreSQL hợp lệ và không có Pascal Editor/renderer process thật. Cần chạy lại với PostgreSQL dưới user không có administrative permissions, khởi động Paperclip, kết nối Pascal Editor có renderer/GLB import, rồi lặp lại bài test bedroom và reload trước khi chuyển `CLOSED`.
