# Trạng Thái Triển Khai Dự Án (Implementation Status)

Cập nhật lần cuối: `2026-11-08`

## 1. Tổng Quan Tiến Độ Theo Từng Phân Hệ

| Phân hệ / Yêu cầu trong Master Prompt | Trạng thái | Tệp tin thực thi chính | Phương thức kiểm chứng |
| :--- | :---: | :--- | :--- |
| **Phase 0**: Kiểm toán phần cứng, môi trường Node 22 / Python 3.13 & 3 repo tham chiếu | ✅ Hoàn thành | `packages/pascal-adapter/gateway.mjs` | Smoke test 80 MCP tools từ `@pascal-app/mcp@1.0.7` |
| **Phase 1**: Kiến trúc chuẩn (`CanonicalProject` mm ↔ `PascalSceneGraph` m) & tài liệu kỹ thuật | ✅ Hoàn thành | `apps/api/app/models/contracts.py`, `docs/*.md` | Kiểm tra schema Pydantic v2 & đồng bộ 2 chiều |
| **Phase 2**: Nhập bản vẽ 2D (DXF / PDF / PNG / JPG) & Cổng xác nhận tỷ lệ 1 cạnh chuẩn | ✅ Hoàn thành | `apps/api/app/services/cad_export.py` | Test nhập ảnh chưa có tỷ lệ → chặn báo giá & bật `QuestionRequest` |
| **Phase 3**: Không gian 3D BIM tương tác & cầu nối `@pascal-app/mcp` | ✅ Hoàn thành | `apps/web/src/components/StudioViewport.tsx`, `mcp_gateway.py` | Đồng bộ phòng 4×5m, 1 cửa đi, 1 cửa sổ, nội thất & `verify_scene: valid` |
| **Phase 4**: Đa Tác Tử (8 Agents), Conversational Concierge & AI Control Center (14 Nodes) | ✅ Hoàn thành | `apps/api/app/services/orchestrator.py`, `apps/web/src/App.tsx` | Test hội thoại tiếng Việt, sinh Phương án A/B/C, duyệt/từ chối/hoàn tác `SceneProposal` |
| **Mục 7B**: Phối Sơn Tường, Tường Điểm Nhấn (Accent Wall) & Gạch/Gỗ Lát Sàn | ✅ Hoàn thành | `data/seed/materials_vn.json`, `cost_engine.py` | Đổi sơn/gạch tính lại số thùng `ceil`, chỉ vô hiệu hóa `n6_style` & `n10_cost`, không dựng lại tường 3D |
| **Phase 5**: Dự toán BOQ hình học xác định & Catalog Nội thất Việt Nam (Fit-check) | ✅ Hoàn thành | `apps/api/app/services/cost_engine.py`, `data/seed/catalog_vn.csv` | Kiểm tra công thức trừ lỗ mở, hao hụt gạch, VAT 8% & xuất `.csv`, `.xlsx` |
| **Phase 6**: Xuất nhập CAD (`.dxf` R2007 1:1 mm, `.glb`, `.ifc`, `.dae`) & Plugin SketchUp/AutoCAD | ✅ Hoàn thành | `apps/api/app/services/cad_export.py`, `packages/cad/` | Kiểm thử khứ hồi DXF 4000×5000mm sai số `<= 1 mm` |
| **Phase 7**: Kiểm thử chấp nhận tự động (`pytest`) & Chụp màn hình trình duyệt thật (`Playwright`) | ✅ Hoàn thành | `tests/test_acceptance.py`, `tests/verify_e2e_browser.py`, `docs/screenshots/` | Toàn bộ test `PASSED`, ảnh chụp 4 độ phân giải `1440 / 1024 / 768 / 390` |

## 2. Kết Quả Kiểm Thử Chấp Nhận (10/10 Passed)

1. **Test 1 (DXF Round-Trip <= 1mm)**: Xuất và nhập lại phòng `4000×5000 mm` đạt chính xác `4000.0 × 5000.0 mm`.
2. **Test 2 (Uncalibrated Scale Gate)**: Ảnh mặt bằng chưa có tỷ lệ tự động kích hoạt `WAITING_FOR_INPUT` và thẻ câu hỏi `ask_user`.
3. **Test 3 (Pascal MCP 80 Tools & Scene Verification)**: Kết nối thực tế `@pascal-app/mcp`, `verify_scene` trả về `valid: true`.
4. **Test 4 (Conversational Concierge & Proposal Diff)**: Yêu cầu đổi sofa nhỏ hơn 1.8m tạo `SceneProposal` kèm chênh lệch giá âm, hỗ trợ `Approve` và `Restore/Undo`.
5. **Test 5 (Section 7B Paint & Tile Calculation)**: Tự động trừ diện tích cửa đi/cửa sổ, làm tròn số thùng sơn (lót + phủ) và số thùng gạch theo `m2_per_box`.
6. **Test 6 (Selective Workflow Invalidation)**: Đổi màu sơn/gạch chỉ cập nhật `n6_style` và `n10_cost`, giữ nguyên `n5_geometry`.
7. **Test 7 (Catalog Fit-Check)**: Kiểm tra kích thước sản phẩm so với khổ cửa đi `900 mm` và diện tích phòng.
8. **Test 8 (Agent MCP Tool Permission Guard)**: Chặn tức thì khi `agent_cost` cố gọi công cụ xóa hình học `delete_nodes`.
9. **Test 9 (API Key Redaction)**: Toàn bộ khóa bí mật khi lưu qua `/api/v1/connections` đều được che dạng `REDACTED`.
10. **Test 10 (Multi-Format Export)**: Xuất thành công `.dxf`, `.glb`, `.ifc`, `.dae`, `.csv`, `.xlsx`.
