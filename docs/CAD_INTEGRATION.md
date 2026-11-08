# ATELIER AI — CAD & 3D Interoperability Specification

## 1. Supported Formats & Verification Matrix

| Format | Direction | Implementation & Engine | Unit & Coordinate Rules | Status |
|---|---|---|---|---|
| **DXF (R2007 / AC1021)** | **Import & Export (Bidirectional)** | Python `ezdxf` (`apps/api/app/services/cad_export.py` & `intake.py`) | **Model space 1:1 in `mm`**. Layers: `A-WALL`, `A-DOOR`, `A-WIND`, `A-FURN`, `A-ROOM-NAME`, `A-DIM`. Includes true `DIMENSION` entities and room polylines. | **Verified (MVP Core)** |
| **GLB (glTF 2.0 Binary)** | **Export (Browser & Server Mesh)** | Three.js `GLTFExporter` in browser viewer + deterministic binary glTF 2.0 builder for canonical/Pascal scene | **Meters (`1.0 unit = 1.0 m`)**, right-handed `+Y` up. Preserves wall face colors/textures, slabs, openings, and furniture bounding/procedural meshes. | **Verified (MVP Core)** |
| **COLLADA (`.dae` for SketchUp)** | **Export / Convert** | Deterministic XML COLLADA 1.4.1 mesh + material exporter (`cad_export.py`) | **Meters (`<unit meter="1.0" name="meter"/>`)**. Imports directly into SketchUp Free/Make/Pro via `File → Import → COLLADA (.dae)` with material groups intact. | **Verified (MVP Core)** |
| **IFC4 (`.ifc` STEP)** | **Export & Import** | `@pascal-app/ifc-converter` + parametric IFC4 STEP writer (`IfcProject`, `IfcSite`, `IfcBuilding`, `IfcBuildingStorey`, `IfcWallStandardCase`, `IfcOpeningElement`, `IfcDoor`, `IfcWindow`, `IfcSlab`, `IfcSpace`, `IfcFurnishingElement`) | **Millimeters / Meters**, preserves `Pascal` property sets and canonical UUIDs for zero-loss round-tripping. | **Verified (MVP Core)** |
| **PDF / Raster Floorplan** | **Import** | `PyMuPDF` (`fitz`) vector path extractor + `OpenCV` wall contour & dimension detector | Extracts normalized wall segments and prompts user for **1-click Scale Confirmation** if vector scale is ambiguous. | **Verified (MVP Core)** |
| **DWG / SKP Native Binary** | **Bridge Only** | Proprietary formats — never faked by renaming extensions. Handled via DXF/DAE/IFC or our SketchUp Ruby / AutoCAD AutoLISP plugins. | Mapped via Canonical UUIDs. | **Plugin Bridge Provided (`packages/cad/`)** |

---

## 2. Round-Trip Tolerance & Verification Standard

For the reference **4 × 5 m Room** (`4000 × 5000 mm`, 4 walls, 1 door `900×2100 mm`, 1 window `1500×1400 mm`, 1 sofa `2100×900 mm`):
- **Linear Dimension Tolerance**: $\le 1.0\text{ mm}$ across `Canonical` ↔ `DXF` ↔ `Canonical` and `Canonical` ↔ `Pascal Scene (m)` ↔ `Canonical`.
- **Entity Count & ID Preservation**: 4 walls, 1 room zone, 1 door, 1 window, 1 furniture item preserved with deterministic provenance links.

---

## 3. Desktop CAD Plugins (`packages/cad/`)

1. **SketchUp Ruby Extension (`packages/cad/sketchup_extension/atelier_ai_bridge.rb`)**:
   - Connects to `http://127.0.0.1:8000/api/v1/projects/{id}/scene` using API token.
   - Pulls canonical walls, openings, rooms, and furniture into SketchUp groups tagged with `atelier_id` attribute dictionary.
   - Pushes modified furniture/wall transforms back to ATELIER AI as a **Scene Proposal** requiring approval in the web UI.
2. **AutoCAD AutoLISP Plugin (`packages/cad/autocad_plugin/atelier_bridge.lsp`)**:
   - Automates DXF round-trip import/export and layer standardization (`A-WALL`, `A-DOOR`, `A-WIND`, `A-FURN`, `A-DIM`) inside AutoCAD Desktop.
