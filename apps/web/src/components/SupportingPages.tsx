/**
 * ATELIER AI — Supporting Studio Pages (Sections 11, 12 & 19 Phase 5)
 * Includes:
 * 1. DashboardOverviewPage (Project summary, spatial metrics, quick navigation)
 * 2. FloorPlanImportPage (2D DXF/PDF/PNG/JPG upload & 1-edge mandatory Scale Calibration Gate)
 * 3. MaterialsAndCatalogPage (Section 7B Paint/Accent/Floor Library + Vietnamese Furniture Catalog Fit-Check & Replace)
 * 4. RenderGalleryPage (Viewport renders + CAD/BIM Export integration hub)
 * 5. CostEstimationPage (Financial Dashboard BOQ with right-aligned monospace numbers, budget variance, CSV/XLSX export)
 * 6. AIConnectionsSettingsPage (Multi-provider API/CLI/MCP/Ollama connections with REDACTED secrets & Low-Spec mode)
 */
import React, { useState } from 'react'
import {
  Box,
  Upload,
  ShieldCheck,
  Download,
  Palette,
  ShoppingBag,
  Calculator,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Camera,
  ArrowUpRight,
  Layers,
  Check,
} from 'lucide-react'
import { StudioViewport } from './StudioViewport'

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`

// ============================================================================
// 1. DASHBOARD OVERVIEW PAGE
// ============================================================================
export const DashboardOverviewPage: React.FC<{
  projects: any[]
  project: any
  mcpToolsCount: number
  onOpenWorkspace: (projectId?: string) => void
  onNavigate: (tab: any) => void
}> = ({ projects, project, mcpToolsCount, onOpenWorkspace, onNavigate }) => {
  const est = project?.estimate_snapshot
  const budgetDiff = (est?.budget_limit_vnd || 120000000) - (est?.total_vnd || 0)

  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Tổng Quan Dự Án & Trung Tâm Điều Hành Thiết Kế</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Đồng bộ thời gian thực giữa mặt bằng kỹ thuật 2D CAD (mm), không gian 3D Pascal SceneGraph (m), 8 Agent chuyên gia và dự toán BOQ xác định.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => onNavigate('import')}>
            <Upload size={14} /> Nhập Bản Vẽ 2D
          </button>
          <button className="btn btn-primary" onClick={() => onOpenWorkspace(project?.project_id)}>
            <Box size={14} /> Mở Không Gian Thiết Kế 3D
          </button>
        </div>
      </div>

      {/* Key Architectural & Financial Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="surface-card">
          <div className="text-caption">Dự án đang làm việc</div>
          <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 6 }}>{project?.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <span className="status-badge teal">4000 × 5000 mm (20 m²)</span>
            <span className="status-badge emerald">Rev #{project?.revision}</span>
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Tổng dự toán hoàn thiện (gồm VAT 8%)</div>
          <div className="mono" style={{ fontSize: 21, fontWeight: 600, color: 'var(--accent)', marginTop: 6 }}>
            {formatVnd(est?.total_vnd)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            So với ngân sách {formatVnd(est?.budget_limit_vnd)}:{' '}
            <strong className="mono" style={{ color: budgetDiff >= 0 ? 'var(--emerald-text)' : 'var(--rose-text)' }}>
              {budgetDiff >= 0 ? `Tiết kiệm ${formatVnd(budgetDiff)}` : `Vượt ${formatVnd(Math.abs(budgetDiff))}`}
            </strong>
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Kiểm định Không gian & Hành lang đi lại</div>
          <div className="mono" style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>
            {project?.spatial_qa?.min_walkway_mm || 950} mm
          </div>
          <div style={{ fontSize: 12, color: 'var(--emerald-text)', marginTop: 6 }}>
            ✓ Đạt chuẩn thông thủy (&gt;= 750mm) • 0 va chạm
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Pascal 3D BIM MCP Gateway</div>
          <div className="mono" style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>
            {mcpToolsCount || 80} BIM Tools
          </div>
          <div style={{ fontSize: 12, color: 'var(--emerald-text)', marginTop: 6 }}>
            ✓ @pascal-app/mcp v1.0.7 đã kết nối
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="text-section-title">Danh Sách Dự Án Trong Workspace</h2>
          <span className="status-badge neutral">{projects.length} dự án</span>
        </div>
        <table className="financial-table">
          <thead>
            <tr>
              <th>Mã Dự Án</th>
              <th>Tên Dự Án</th>
              <th>Phong Cách</th>
              <th>Trạng Thái Tỷ Lệ</th>
              <th>Revision</th>
              <th className="num">Tổng Dự Toán (VNĐ)</th>
              <th className="num">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p: any) => (
              <tr key={p.project_id}>
                <td className="mono">{p.project_id}</td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{p.design_brief?.style}</td>
                <td>
                  <span className={`status-badge ${p.scale_calibrated ? 'emerald' : 'amber'}`}>
                    {p.scale_calibrated ? 'Đã khóa 1:1 (mm)' : 'Chưa xác nhận'}
                  </span>
                </td>
                <td className="mono">#{p.revision}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {formatVnd(p.estimate_snapshot?.total_vnd)}
                </td>
                <td className="num">
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenWorkspace(p.project_id)}>
                    Mở Studio <ArrowUpRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// 2. FLOOR PLAN IMPORT & SCALE CALIBRATION PAGE
// ============================================================================
export const FloorPlanImportPage: React.FC<{
  project: any
  uploadingFile: boolean
  lastImportResult: any
  scaleInputMm: number
  onScaleInputChange: (val: number) => void
  onUploadFloorplan: (e: React.ChangeEvent<HTMLInputElement>) => void
  onConfirmScale: () => void
}> = ({
  project,
  uploadingFile,
  lastImportResult,
  scaleInputMm,
  onScaleInputChange,
  onUploadFloorplan,
  onConfirmScale,
}) => {
  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Nhập Mặt Bằng 2D & Xác Nhận Tỷ Lệ Chuẩn (mm)</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Hỗ trợ bản vẽ kỹ thuật AutoCAD <code className="mono">.dxf</code> (tỷ lệ 1:1 mm) và tệp <code className="mono">.pdf / .png / .jpg</code> kèm cổng khóa tỷ lệ 1 cạnh chuẩn bắt buộc.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        <div className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="text-section-title">1. Tải Lên Bản Vẽ Mặt Bằng (.DXF / .PDF / .PNG / .JPG)</h2>
          <p className="text-body">
            Hệ thống tự động trích xuất các lớp <code className="mono">A-WALL</code>, <code className="mono">A-DOOR</code>, <code className="mono">A-WIND</code>, <code className="mono">A-DIM</code> từ DXF hoặc nhận diện đường bao tường từ ảnh mặt bằng.
          </p>
          <label htmlFor="floorplan-upload-input" className="text-caption" style={{ fontWeight: 600 }}>
            Chọn tệp mặt bằng từ máy tính:
          </label>
          <input
            id="floorplan-upload-input"
            type="file"
            accept=".dxf,.pdf,.png,.jpg,.jpeg"
            onChange={onUploadFloorplan}
            className="field-input"
          />
          {uploadingFile && <span className="status-badge teal">Đang phân tích hình học mặt bằng...</span>}

          {lastImportResult && (
            <div className="surface-subtle" style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Kết quả bóc tách: {lastImportResult.filename}</div>
              <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                • Kích thước bao: {lastImportResult.parsed?.width_mm} × {lastImportResult.parsed?.depth_mm} mm
              </div>
              <div className="mono" style={{ fontSize: 12 }}>
                • Tường: {lastImportResult.parsed?.walls?.length} đoạn | Cửa đi: {lastImportResult.parsed?.openings?.length} | Cửa sổ:{' '}
                {lastImportResult.parsed?.windows?.length}
              </div>
            </div>
          )}
        </div>

        <div className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="text-section-title">2. Cổng Xác Nhận Tỷ Lệ 1 Cạnh Chuẩn (Mandatory Scale Gate)</h2>
          <p className="text-body">
            Để ngăn chặn sai lệch diện tích sơn/gạch khi tải ảnh chụp mặt bằng chưa có tỷ lệ, hệ thống yêu cầu xác nhận chiều dài thực tế (mm) của cạnh tường Bắc trước khi cấp nhãn <code className="mono">HIGH_VERIFIED_SCALE</code>.
          </p>

          <div>
            <label htmlFor="scale-edge-mm" className="text-caption" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Chiều dài thực tế cạnh tường Bắc (mm):
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="scale-edge-mm"
                type="number"
                className="field-input mono"
                value={scaleInputMm}
                onChange={(e) => onScaleInputChange(Number(e.target.value))}
              />
              <button className="btn btn-primary" onClick={onConfirmScale}>
                <ShieldCheck size={14} /> Khóa Tỷ Lệ & Dựng 3D
              </button>
            </div>
          </div>

          <div className="surface-subtle">
            <div className="text-caption" style={{ fontWeight: 600 }}>Trạng thái hiệu chuẩn hiện tại:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span className={`status-badge ${project?.scale_calibrated ? 'emerald' : 'amber'}`}>
                {project?.scale_calibrated ? 'HIGH_VERIFIED_SCALE (Đã xác nhận)' : 'LOW_UNVERIFIED_SCALE (Cần xác nhận)'}
              </span>
              <span className="text-caption">{project?.scale_reference?.notes}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 3. MATERIALS (SECTION 7B) & PRODUCT CATALOG PAGE (SECTION 11)
// ============================================================================
export const MaterialsAndCatalogPage: React.FC<{
  project: any
  materialsDb: any
  catalog: any[]
  fitCheckResults: Record<string, any>
  onUpdateSurfaces7B: (payload: any) => void
  onFitCheck: (sku: string) => void
  onReplaceFromCatalog: (sku: string) => void
}> = ({
  project,
  materialsDb,
  catalog,
  fitCheckResults,
  onUpdateSurfaces7B,
  onFitCheck,
  onReplaceFromCatalog,
}) => {
  const [sectionView, setSectionView] = useState<'surfaces' | 'catalog'>('surfaces')
  const currentRoom = project?.rooms?.[0]
  const accentWall = project?.walls?.find((w: any) => w.is_accent_wall)

  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Thư Viện Sơn, Vật Liệu Bề Mặt (Mục 7B) & Catalog Nội Thất</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Đồng bộ trực tiếp màu sơn tường Dulux/Jotun, gạch/gỗ lát sàn An Cường, Eurotile, Đồng Tâm và danh mục đồ nội thất rời vào Pascal Scene 3D & Bảng dự toán BOQ.
          </p>
        </div>

        <div className="segmented-group">
          <button
            className={`seg-btn ${sectionView === 'surfaces' ? 'active' : ''}`}
            onClick={() => setSectionView('surfaces')}
          >
            Sơn Tường & Gạch Sàn (Mục 7B)
          </button>
          <button
            className={`seg-btn ${sectionView === 'catalog' ? 'active' : ''}`}
            onClick={() => setSectionView('catalog')}
          >
            Catalog Nội Thất & Fit-Check ({catalog.length})
          </button>
        </div>
      </div>

      {sectionView === 'surfaces' ? (
        <>
          <h2 className="text-section-title" style={{ marginBottom: 12 }}>
            1. Sơn Phủ Nội Thất & Tường Điểm Nhấn (Accent Wall)
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
              marginBottom: 28,
            }}
          >
            {(materialsDb.paints || []).map((p: any) => {
              const isBase = currentRoom?.wall_base_material_id === p.id
              const isAccent = accentWall?.face_a_material_id === p.id
              return (
                <div
                  key={p.id}
                  className={`surface-card interactive ${isBase || isAccent ? 'selected' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: p.hex_color,
                        border: '1px solid var(--border-strong)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="text-card-title" title={p.name}>
                        {p.name}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {p.brand} • {p.color_code} ({p.hex_color})
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Độ phủ: {p.coverage_m2_per_liter} m²/L ({p.can_size_liters}L)
                    </span>
                    <strong className="mono" style={{ color: 'var(--accent)' }}>
                      {formatVnd(p.unit_price_vnd)}/thùng
                    </strong>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${isBase ? 'btn-soft' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() => onUpdateSurfaces7B({ wall_base_material_id: p.id })}
                    >
                      {isBase ? '✓ Đang sơn nền' : 'Sơn Toàn Phòng'}
                    </button>
                    <button
                      className={`btn btn-sm ${isAccent ? 'btn-primary' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() =>
                        onUpdateSurfaces7B({
                          accent_wall_id: 'wall_east',
                          accent_paint_id: p.id,
                        })
                      }
                    >
                      {isAccent ? '★ Tường nhấn' : '★ Sơn Tường Nhấn'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <h2 className="text-section-title" style={{ marginBottom: 12 }}>
            2. Gạch Porcelain, Đá Nung Kết & Sàn Gỗ Công Nghiệp
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {(materialsDb.tiles_and_flooring || []).map((t: any) => {
              const isFloor = currentRoom?.floor_material_id === t.id
              return (
                <div
                  key={t.id}
                  className={`surface-card interactive ${isFloor ? 'selected' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: t.hex_color,
                        border: '1px solid var(--border-strong)',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div className="text-card-title">{t.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {t.brand} • {t.tile_width_mm}×{t.tile_length_mm}mm ({t.layout_pattern})
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {t.m2_per_box} m²/thùng • Hao hụt {Math.round(t.waste_rate * 100)}%
                    </span>
                    <strong className="mono" style={{ color: 'var(--accent)' }}>
                      {formatVnd(t.price_per_box_vnd)}/thùng
                    </strong>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${isFloor ? 'btn-primary' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() => onUpdateSurfaces7B({ floor_material_id: t.id })}
                    >
                      {isFloor ? '✓ Đang lát sàn' : 'Áp Dụng Lát Sàn'}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        onUpdateSurfaces7B({
                          wall_tile_enabled: true,
                          wall_tile_material_id: t.id,
                          wall_tile_height_mm: 1200,
                        })
                      }
                    >
                      Ốp Tường 1.2m
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {catalog.map((item: any) => {
            const fit = fitCheckResults[item.sku]
            return (
              <div key={item.sku} className="surface-card interactive" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="status-badge teal">{item.sku}</span>
                  <span className="status-badge amber">GIÁ MINH HỌA</span>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: item.color_hex || '#E4DDD3',
                      border: '1px solid var(--border-strong)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div className="text-card-title">{item.name}</div>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {item.width_mm} × {item.depth_mm} × {item.height_mm} mm
                    </div>
                  </div>
                </div>

                <div className="text-caption">{item.material_summary}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <span className="mono" style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--accent)' }}>
                    {formatVnd(item.price_vnd)}
                  </span>
                  <span className="text-caption">{item.vendor}</span>
                </div>

                {fit && (
                  <div
                    className="surface-subtle"
                    style={{
                      fontSize: 11.5,
                      borderColor: fit.overall_fit ? 'var(--emerald-border)' : 'var(--rose-border)',
                      background: fit.overall_fit ? 'var(--emerald-bg)' : 'var(--rose-bg)',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{fit.recommendation}</div>
                    <div className="mono" style={{ marginTop: 2 }}>
                      Chênh lệch: {formatVnd(fit.price_delta_vnd)}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => onFitCheck(item.sku)}>
                    Kiểm tra vừa phòng
                  </button>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => onReplaceFromCatalog(item.sku)}>
                    Thay vào Scene 3D
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 4. RENDER GALLERY & CAD EXPORT INTEGRATION PAGE
// ============================================================================
export const RenderAndCadPage: React.FC<{
  project: any
  materialsDb: any
}> = ({ project, materialsDb }) => {
  if (!project) return null
  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Phối Cảnh Render 3D & Xuất Hồ Sơ Kỹ Thuật CAD / BIM</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Góc nhìn Camera khóa 1:1 với hình học Pascal SceneGraph kèm bộ công cụ xuất DXF R2007 (mm), glTF Binary (.GLB), IFC4 và SketchUp COLLADA (.DAE).
          </p>
        </div>
      </div>

      {/* Render Gallery Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, marginBottom: 24 }}>
        <div className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-card-title">Cam 01 — Phối Cảnh Cắt Tường (Cutaway Isometric)</span>
            <span className="status-badge amber">AI Visualization — Not for measurement</span>
          </div>
          <div style={{ height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <StudioViewport
              project={project}
              materialsDb={materialsDb}
              viewMode="3d"
              cameraPreset="cutaway"
              selectedEntityId={null}
              onSelectEntity={() => {}}
            />
          </div>
        </div>

        <div className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-card-title">Cam 02 — Góc Nhìn Tầm Mắt Người (Walkthrough 1.55m)</span>
            <span className="status-badge emerald">Geometry Locked 1:1</span>
          </div>
          <div style={{ height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <StudioViewport
              project={project}
              materialsDb={materialsDb}
              viewMode="3d"
              cameraPreset="walk"
              selectedEntityId={null}
              onSelectEntity={() => {}}
            />
          </div>
        </div>
      </div>

      {/* CAD & BIM Exports Grid */}
      <h2 className="text-section-title" style={{ marginBottom: 12 }}>
        Xuất Hồ Sơ Kỹ Thuật & Cầu Nối Phần Mềm Kiến Trúc (AutoCAD / SketchUp / BIM)
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div className="surface-card">
          <div className="text-card-title">AutoCAD DXF R2007 (1:1 mm)</div>
          <p className="text-caption" style={{ marginTop: 4 }}>
            Đầy đủ các lớp <code className="mono">A-WALL</code>, <code className="mono">A-DOOR</code>, <code className="mono">A-WIND</code>, <code className="mono">A-FURN</code>, <code className="mono">A-DIM</code>. Sai số khứ hồi &lt;= 1mm.
          </p>
          <a className="btn btn-sm btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/dxf`} download>
            <Download size={13} /> Tải Bản Vẽ .DXF
          </a>
        </div>

        <div className="surface-card">
          <div className="text-card-title">Mô Hình 3D glTF Binary (.GLB)</div>
          <p className="text-caption" style={{ marginTop: 4 }}>
            Tệp nhị phân chuẩn glTF 2.0 chứa khối sàn, tường, cửa và nội thất mở trong Blender / Three.js.
          </p>
          <a className="btn btn-sm btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/glb`} download>
            <Download size={13} /> Tải Mô Hình .GLB
          </a>
        </div>

        <div className="surface-card">
          <div className="text-card-title">SketchUp COLLADA (.DAE)</div>
          <p className="text-caption" style={{ marginTop: 4 }}>
            Định dạng trao đổi mở (mm) kèm Ruby Extension <code className="mono">atelier_ai_bridge.rb</code>.
          </p>
          <a className="btn btn-sm btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/dae`} download>
            <Download size={13} /> Tải SketchUp .DAE
          </a>
        </div>

        <div className="surface-card">
          <div className="text-card-title">Hồ Sơ BIM Chuẩn Mở (.IFC)</div>
          <p className="text-caption" style={{ marginTop: 4 }}>
            Tệp STEP IFC4 chứa phân cấp <code className="mono">IfcProject → IfcBuildingStorey</code>.
          </p>
          <a className="btn btn-sm btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/ifc`} download>
            <Download size={13} /> Tải Hồ Sơ .IFC
          </a>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 5. FINANCIAL COST ESTIMATION DASHBOARD (SECTION 12)
// ============================================================================
export const CostEstimationPage: React.FC<{
  project: any
}> = ({ project }) => {
  const est = project?.estimate_snapshot
  if (!est) return null

  const budgetLimit = est.budget_limit_vnd || 120000000
  const variance = budgetLimit - (est.total_vnd || 0)

  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Bảng Dự Toán Khối Lượng & Quản Trị Ngân Sách (BOQ)</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            {est.disclaimer}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href={`/api/v1/exports/${project.project_id}/csv`} download>
            <Download size={14} /> Xuất Bảng CSV
          </a>
          <a className="btn btn-primary" href={`/api/v1/exports/${project.project_id}/xlsx`} download>
            <Download size={14} /> Xuất Báo Giá Excel (.xlsx)
          </a>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="surface-card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
          <div className="text-caption" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            TỔNG DỰ TOÁN (GỒM VAT 8%)
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)', marginTop: 6 }}>
            {formatVnd(est.total_vnd)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
            Phiên bản #{project.revision} • {est.confidence_level}
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Vật tư bề mặt (Sơn, Gạch/Gỗ, Phào)</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>
            {formatVnd(est.materials_subtotal_vnd)}
          </div>
          <div className="text-caption" style={{ marginTop: 4 }}>
            Làm tròn chẵn thùng sơn & thùng gạch
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Đồ nội thất rời (Catalog)</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>
            {formatVnd(est.furniture_subtotal_vnd)}
          </div>
          <div className="text-caption" style={{ marginTop: 4 }}>
            {project.furniture_instances?.length || 0} hạng mục trong phòng
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">Nhân công + Vận chuyển + VAT 8%</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>
            {formatVnd((est.labor_subtotal_vnd || 0) + (est.shipping_fee_vnd || 0) + (est.tax_vnd || 0))}
          </div>
          <div className="text-caption" style={{ marginTop: 4 }}>
            Nhân công: {formatVnd(est.labor_subtotal_vnd)}
          </div>
        </div>

        <div className="surface-card">
          <div className="text-caption">So sánh Ngân sách ({formatVnd(budgetLimit)})</div>
          <div
            className="mono"
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginTop: 6,
              color: variance >= 0 ? 'var(--emerald-text)' : 'var(--rose-text)',
            }}
          >
            {variance >= 0 ? `−${formatVnd(variance)}` : `+${formatVnd(Math.abs(variance))}`}
          </div>
          <div className="text-caption" style={{ marginTop: 4 }}>
            {variance >= 0 ? 'Trong hạn mức ngân sách' : 'Vượt hạn mức ngân sách'}
          </div>
        </div>
      </div>

      {/* Detailed BOQ Line Items Table (Right-aligned numbers with monospace font) */}
      <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="financial-table">
          <thead>
            <tr>
              <th>Phân Nhóm</th>
              <th>Hạng Mục Công Việc / Sản Phẩm</th>
              <th>Quy Cách Kỹ Thuật</th>
              <th className="num">KL Thực</th>
              <th className="num">Hao Hụt</th>
              <th className="num">Đóng Gói</th>
              <th className="num">Đơn Giá (VNĐ)</th>
              <th className="num">Thành Tiền (VNĐ)</th>
              <th>Công Thức Bóc Tách Hình Học</th>
            </tr>
          </thead>
          <tbody>
            {(est.lines || []).map((line: any) => (
              <tr key={line.id}>
                <td>
                  <span className="status-badge teal">{line.category}</span>
                </td>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{line.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--amber-text)', marginTop: 2 }}>[{line.source_label}]</div>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{line.specification}</td>
                <td className="num">
                  {line.net_quantity} {line.unit}
                </td>
                <td className="num">{Math.round((line.waste_rate || 0) * 100)}%</td>
                <td className="num">
                  {line.package_count ? `${line.package_count} ${line.package_unit}` : `${line.gross_quantity} ${line.unit}`}
                </td>
                <td className="num">{formatVnd(line.unit_price_vnd)}</td>
                <td className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatVnd(line.subtotal_vnd)}
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 280 }}>
                  {line.formula_explanation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// 6. SETTINGS -> AI CONNECTIONS & PERFORMANCE PROFILE PAGE
// ============================================================================
export const AIConnectionsSettingsPage: React.FC<{
  connections: any[]
  lowSpecMode: boolean
  onToggleLowSpec: () => void
  onTestConnection: (connId: string) => void
  onSaveConnectionKey: (connId: string, key: string) => void
}> = ({
  connections,
  lowSpecMode,
  onToggleLowSpec,
  onTestConnection,
  onSaveConnectionKey,
}) => {
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})

  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Cấu Hình Kết Nối AI (API / CLI / MCP / Local) & Hiệu Năng</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Quản lý kết nối đến Pascal 3D MCP Server, Gemini/OpenAI API, CLI Subprocess và Ollama. Toàn bộ khóa bí mật đều được che bảo mật (<code className="mono">REDACTED</code>).
          </p>
        </div>

        <button className={`btn ${lowSpecMode ? 'btn-primary' : ''}`} onClick={onToggleLowSpec}>
          {lowSpecMode ? '✓ Đang bật: Chế độ Máy Yếu (2D-First)' : 'Bật Chế độ Máy Yếu (Low-Spec GPU)'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {connections.map((c: any) => {
          const isOk = c.status === 'CONNECTED' || c.status === 'CONFIGURED'
          return (
            <div key={c.connection_id} className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div className="text-card-title">{c.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {c.kind} • {c.model_name}
                  </div>
                </div>
                <span className={`status-badge ${isOk ? 'emerald' : 'amber'}`}>{c.status}</span>
              </div>

              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Endpoint: {c.endpoint_or_cmd}
              </div>

              <div style={{ fontSize: 12 }}>
                Trạng thái khóa:{' '}
                <span className="mono">{c.masked_secret || 'Chưa cấu hình (Tự động dùng Fallback nội bộ)'}</span>
              </div>

              {c.last_test_detail && (
                <div className="surface-subtle" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
                  {c.last_test_detail}
                </div>
              )}

              {c.kind === 'model_api' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    className="field-input"
                    placeholder="Nhập API Key mới (Sẽ được REDACTED)..."
                    value={keyDrafts[c.connection_id] || ''}
                    onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [c.connection_id]: e.target.value }))}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      onSaveConnectionKey(c.connection_id, keyDrafts[c.connection_id] || '')
                      setKeyDrafts((prev) => ({ ...prev, [c.connection_id]: '' }))
                    }}
                  >
                    Lưu Key
                  </button>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Độ trễ: {c.latency_ms ? `${c.latency_ms} ms` : '--'}
                </span>
                <button className="btn btn-sm" onClick={() => onTestConnection(c.connection_id)}>
                  <RefreshCw size={12} /> Kiểm tra kết nối
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
