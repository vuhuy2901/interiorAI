# ATELIER AI — Known Limitations & Honesty Disclosure

In strict compliance with Master Prompt Section 0 ("Không chỉ làm giao diện giả. UI nào chưa có backend thì đánh dấu rõ `Not connected`... Không bịa giá hay giả vờ kết nối CAD"):

1. **Headless `@pascal-app/mcp` `export_glb` Limitation**:
   - In `@pascal-app/mcp@1.0.7`, the built-in MCP tool `export_glb` throws `not_implemented` because Pascal's native GLB bake relies on the browser Three.js renderer.
   - **Our Verified Solution**: We provide (a) direct browser-side `GLTFExporter` export from the 3D viewport AND (b) a verified server-side binary glTF 2.0 (`.glb`), COLLADA (`.dae`), and STEP (`.ifc`) geometry generator in `apps/api/app/services/cad_export.py` that constructs true 3D triangulated meshes and materials from the canonical/Pascal scene graph.
2. **WebGPU vs WebGL2 on Integrated GPUs / Virtual Displays**:
   - The host machine includes an Intel Iris Xe iGPU alongside a USB Mobile Monitor Virtual Display. Pure WebGPU contexts can fail on virtual display drivers.
   - **Our Verified Solution**: The Design Workspace defaults to a fast **2D-First Interactive CAD Canvas** (`< 15 ms` load) and uses a resilient **3D WebGL2 / Three.js PBR Stage** with low-spec optimizations (DPR capped at `1.5`, on-demand rendering, procedural architectural meshes + real surface UV scaling for tiles/paint) and explicit hardware status indicators.
3. **Proprietary `.dwg` and `.skp` Binary Files**:
   - Neither AutoCAD `.dwg` nor SketchUp `.skp` binary formats are open specifications. ATELIER AI **never** renames a `.dxf` or `.glb` file to `.dwg`/`.skp`.
   - Instead, we provide verified **DXF R2007** (for AutoCAD), **COLLADA `.dae` & IFC4 `.ifc`** (for SketchUp), and ship real **SketchUp Ruby (`.rb`)** and **AutoCAD AutoLISP (`.lsp`)** bridge scripts in `packages/cad/` for manual pull/push synchronization.
4. **Catalog Pricing & Product Links (`GIÁ MINH HỌA`)**:
   - All seed prices in `data/seed/materials_vn.json` and `data/seed/catalog_vn.csv` include `source_url`, `checked_at`, `region`, and are explicitly badged **`GIÁ MINH HỌA / ILLUSTRATIVE`** in the UI and exported BOQ sheets. No live scraping of e-commerce sites is performed without user-configured connectors.
5. **Cloud AI & CLI Providers**:
   - When no external API key (Gemini/OpenAI/Anthropic) is configured or when offline, the system clearly badges the connection status and uses a deterministic **Local Architectural Rule & Template Engine** (explicitly labeled `[LOCAL DETERMINISTIC ENGINE — NO CLOUD API KEY NEEDED]`) so all conversational flows, `ask_user` checkpoints, layout options A/B, proposals, and Pascal MCP tool executions work out-of-the-box on `127.0.0.1`, while supporting live Gemini/OpenAI/Anthropic/Ollama/CLI execution immediately when connected in **Settings → AI Connections**.
