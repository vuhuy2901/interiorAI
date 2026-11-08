# ATELIER AI — Intelligent Interior Design Studio

**ATELIER AI** là nền tảng studio thiết kế nội thất thông minh kết hợp **mặt bằng kỹ thuật 2D CAD (tỷ lệ 1:1 mm)**, **không gian 3D BIM tương tác (`@pascal-app/mcp` v1.0.7 — 80 công cụ)**, **hệ thống điều phối Đa Tác Tử (Multi-Agent Control Center + Conversational Design Concierge)** và **bộ máy tính dự toán khối lượng hình học xác định (Deterministic Cost Engine)**.

---

## 1. Kiến Trúc & Nguồn Tham Chiếu Mở (MIT License)

1. **Lõi 3D / BIM & MCP Server**: Dựa trên [`pascalorg/editor`](https://github.com/pascalorg/editor) (`@pascal-app/core`, `@pascal-app/mcp` v1.0.7, MIT License) chạy qua [`packages/pascal-adapter/gateway.mjs`](packages/pascal-adapter/gateway.mjs).
2. **Bóc Tách Mặt Bằng 2D & Khóa Tỷ Lệ**: Tham chiếu cấu trúc hình học 2D của [`ZWD11/house-plan-designer`](https://github.com/ZWD11/house-plan-designer) kết hợp `ezdxf`, `pymupdf` và cổng xác nhận 1 cạnh chuẩn bắt buộc (`ScaleCalibration`).
3. **Ngôn Ngữ Thiết Kế Giao Diện (Architectural Daylight White)**: Áp dụng hệ thống token từ [`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill) (`#FFFFFF` canvas, `#F7F8FA` panel, `#E8EAED` hairline, `#17191C` ink, `#276E70` slate-teal accent, font `Inter` + `JetBrains Mono`).

---

## 2. Cấu Trúc Thư Mục Dự Án

- [`apps/api/`](apps/api/) — Backend FastAPI (`/api/v1`), SQLite WAL persistence, Deterministic Cost Engine, CAD Exporter, Multi-Agent Orchestrator:
  - [`apps/api/app/main.py`](apps/api/app/main.py) — Toàn bộ REST & SSE endpoints.
  - [`apps/api/app/models/contracts.py`](apps/api/app/models/contracts.py) — Hợp đồng dữ liệu Pydantic v2 (`CanonicalProject`, `WallSegment`, `RoomZone`, `SceneProposal`, `QuestionRequest`, `DesignOptionCard`).
  - [`apps/api/app/services/cost_engine.py`](apps/api/app/services/cost_engine.py) — Công thức tính bóc tách khối lượng xác định (Mục 7 & 7B).
  - [`apps/api/app/services/orchestrator.py`](apps/api/app/services/orchestrator.py) — Kiến Trúc Sư Trưởng (Conversational Concierge), tạm dừng/tiếp tục `ask_user`, sinh Phương án A/B/C và Selective Dependency Invalidation.
  - [`apps/api/app/services/mcp_gateway.py`](apps/api/app/services/mcp_gateway.py) — Cầu nối Python ↔ Node.js `@pascal-app/mcp` với khóa đồng bộ và kiểm soát quyền gọi công cụ của từng Agent.
  - [`apps/api/app/services/cad_export.py`](apps/api/app/services/cad_export.py) — Xuất/nhập DXF R2007 (`1:1 mm`), xuất nhị phân 3D `.glb`, SketchUp COLLADA `.dae`, `.ifc` (IFC4), `.csv`, `.xlsx`.
- [`apps/web/`](apps/web/) — Ứng dụng Frontend React 19 + TypeScript + Vite + Three.js + `@xyflow/react`:
  - [`apps/web/src/App.tsx`](apps/web/src/App.tsx) — Đầy đủ 11 phân hệ Sitemap.
  - [`apps/web/src/components/StudioViewport.tsx`](apps/web/src/components/StudioViewport.tsx) — Trình xem song song Bản vẽ 2D CAD SVG (kéo thả nội thất, chuỗi kích thước mm) & Không gian 3D WebGL (Cutaway, Orbit, Top, Walkthrough 1.55m).
- [`packages/pascal-adapter/`](packages/pascal-adapter/) — Gói tích hợp trực tiếp `@pascal-app/mcp@1.0.7` và `@pascal-app/core@1.0.7`.
- [`packages/cad/`](packages/cad/) — Plugin cầu nối máy trạm:
  - [`packages/cad/sketchup_extension/atelier_ai_bridge.rb`](packages/cad/sketchup_extension/atelier_ai_bridge.rb) (SketchUp Ruby Extension)
  - [`packages/cad/autocad_plugin/atelier_bridge.lsp`](packages/cad/autocad_plugin/atelier_bridge.lsp) (AutoCAD AutoLISP Suite)
- [`data/seed/`](data/seed/) — Dữ liệu mẫu có gắn nhãn minh bạch `GIÁ MINH HỌA`:
  - [`data/seed/materials_vn.json`](data/seed/materials_vn.json) — Thư viện sơn Dulux/Jotun và gạch/gỗ lát sàn An Cường, Eurotile, Đồng Tâm (Mục 7B).
  - [`data/seed/catalog_vn.csv`](data/seed/catalog_vn.csv) — Danh mục đồ nội thất rời tại Việt Nam.
  - [`data/seed/sample_4x5m.dxf`](data/seed/sample_4x5m.dxf) — Bản vẽ CAD DXF mẫu phòng khách `4000×5000 mm`.
- [`docs/`](docs/) — Tài liệu kỹ thuật đầy đủ:
  - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
  - [`docs/WORKFLOW_SCHEMA.md`](docs/WORKFLOW_SCHEMA.md)
  - [`docs/CAD_INTEGRATION.md`](docs/CAD_INTEGRATION.md)
  - [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)
  - [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)

---

## 3. Hướng Dẫn Khởi Chạy Nhanh (1 Lệnh)

### Cách 1: Khởi chạy tự động bằng PowerShell
```powershell
.\start-atelier.ps1
```

### Cách 2: Khởi chạy từng dịch vụ
1. **Backend FastAPI (`http://127.0.0.1:8000`)**:
   ```powershell
   cd apps\api
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
2. **Frontend Vite React Studio (`http://127.0.0.1:5173`)**:
   ```powershell
   cd apps\web
   npm run dev
   ```

---

## 4. Chạy Kiểm Thử Chấp Nhận (Acceptance & E2E Tests)

```powershell
# Kiểm thử toàn bộ 10 bài test chấp nhận & 12 kịch bản Multi-Agent
python -m pytest tests/test_acceptance.py -v

# Kiểm thử trình duyệt Chromium thực tế & chụp ảnh màn hình responsive (1440 / 1024 / 768 / 390)
python tests/verify_e2e_browser.py
```
