/**
 * ATELIER AI — Dedicated Object and Furniture Inspector (Sections 6.3 & 11)
 * Synchronizes selection between Furniture List, Object Properties (X/Y/Z, Rotation, Dimensions, Price),
 * 3D Asset Switcher and 2D/3D Pascal Viewport. Color and material choices are
 * delegated to the AI Copilot proposal flow instead of manual preset pickers.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  RotateCw,
  Save,
  Layers,
  Palette,
  Box,
  Sliders,
  X,
  RefreshCw,
  PackageOpen,
} from 'lucide-react'

interface ObjectInspectorProps {
  project: any
  assetLibrary?: any[]
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onUpdateFurnitureField: (furnId: string, field: string, value: any) => void
  onCommitCanvasPosition: () => void
  onAssignAsset?: (objectId: string, assetId: string) => Promise<any>
  onImportAsset?: (objectId: string, file: File) => Promise<any>
  onOpenAICopilot?: () => void
  onRequestSmartFit?: (objectId: string) => Promise<any>
  onRequestPlacementOptions?: (objectId: string) => Promise<any>
  onCreatePlacementProposal?: (objectId: string, option: any) => Promise<any>
  onClose?: () => void
  savingScene?: boolean
  externalSceneObjects?: Array<{
    id: string
    name: string
    parentName: string
    dimensionsMm: [number, number, number]
  }>
}

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`
const formatFurniturePrice = (v?: number) => (v == null || v <= 0 ? 'Chưa có giá' : formatVnd(v))

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({
  project,
  assetLibrary = [],
  selectedEntityId,
  onSelectEntity,
  onUpdateFurnitureField,
  onCommitCanvasPosition,
  onAssignAsset,
  onImportAsset,
  onOpenAICopilot,
  onRequestSmartFit,
  onRequestPlacementOptions,
  onCreatePlacementProposal,
  onClose,
  savingScene = false,
  externalSceneObjects = [],
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    selected: true,
    furnitureList: true,
    smartFit: true,
  })
  const [assigningAsset, setAssigningAsset] = useState(false)
  const [importingAsset, setImportingAsset] = useState(false)
  const [targetAssetId, setTargetAssetId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fitReport, setFitReport] = useState<any>(null)
  const [placementOptions, setPlacementOptions] = useState<any[]>([])
  const [fitLoading, setFitLoading] = useState(false)

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const furniture = project?.furniture_instances || []
  const walls = project?.walls || []
  const externalScene = project?.external_scene || null
  const constructionObjects = externalScene ? externalSceneObjects : furniture

  const selectedFurn = furniture.find((f: any) => f.id === selectedEntityId)
  const selectedWall = walls.find((w: any) => w.id === selectedEntityId)

  const compatibleAssets = useMemo(() => {
    if (!selectedFurn) return []
    const target = String(selectedFurn.category || '').toLowerCase().replace(/[\s-]+/g, '_')
    const aliases: Record<string, string[]> = {
      bed: ['bed'],
      nightstand: ['nightstand', 'bedside_table', 'side_table'],
      desk: ['desk', 'table', 'vanity'],
      vanity: ['desk', 'table', 'vanity'],
      wardrobe: ['wardrobe', 'closet', 'cabinet'],
      tv_cabinet: ['tv_cabinet', 'tv_console', 'media_console', 'console_table'],
      coffee_table: ['coffee_table', 'table'],
      sofa: ['sofa'],
      armchair: ['armchair', 'chair'],
      rug: ['rug', 'carpet'],
    }
    const accepted = aliases[target] || [target]
    return assetLibrary.filter((asset: any) => {
      const category = String(asset.category || '').toLowerCase().replace(/[\s-]+/g, '_')
      return accepted.some((alias) => category === alias || category.includes(alias))
    })
  }, [assetLibrary, selectedFurn?.id, selectedFurn?.category])

  useEffect(() => {
    if (selectedFurn?.asset_id) {
      setTargetAssetId(selectedFurn.asset_id)
    } else if (compatibleAssets.length > 0) {
      setTargetAssetId(compatibleAssets[0].asset_id)
    } else {
      setTargetAssetId('')
    }
  }, [selectedFurn?.id, selectedFurn?.asset_id, compatibleAssets])


  const handleAssignAssetClick = async () => {
    const assetToAssign = targetAssetId || compatibleAssets[0]?.asset_id
    if (!selectedFurn || !assetToAssign || !onAssignAsset) return
    setAssigningAsset(true)
    try {
      await onAssignAsset(selectedFurn.id, assetToAssign)
    } finally {
      setAssigningAsset(false)
    }
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedFurn || !onImportAsset) return
    setImportingAsset(true)
    try {
      await onImportAsset(selectedFurn.id, file)
    } finally {
      setImportingAsset(false)
    }
  }

  return (
    <aside id="inspector-dock" className="inspector-dock" aria-label="Thuộc tính đối tượng">
      {/* Inspector Header */}
      <div
        style={{
          height: 46,
          padding: '0 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
          <Sliders size={14} style={{ color: 'var(--accent)' }} />
          <span>Thuộc Tính Đối Tượng</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="btn btn-sm btn-soft"
            onClick={onCommitCanvasPosition}
            disabled={savingScene}
            title="Lưu vị trí & góc xoay hiện tại vào Scene Revision"
          >
            <Save size={12} /> {savingScene ? 'Đang lưu...' : 'Lưu Scene'}
          </button>
          {onClose && (
            <button
              className="btn btn-icon btn-sm"
              onClick={onClose}
              aria-label="Đóng bảng thuộc tính và vật liệu"
              title="Đóng Inspector"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Accordion Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* 1. SELECTED OBJECT INSPECTOR (Section 6.3) */}
        <div className="inspector-section">
          <button className="inspector-section-header" onClick={() => toggleSection('selected')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Box size={13} style={{ color: 'var(--accent)' }} />
              Đối Tượng Đang Chọn
            </span>
            {openSections.selected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {openSections.selected && (
            <div className="inspector-section-body">
              {externalScene ? (
                <div className="surface-subtle" data-testid="external-scene-summary" style={{ fontSize: 12, lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 650, marginBottom: 4 }}>{externalScene.name}</div>
                  <div className="mono">{externalScene.mesh_count} mesh · {externalScene.material_count} vật liệu · {externalScene.texture_count} texture</div>
                  <div className="mono">{externalScene.bounds_size_m.map((value: number) => value.toFixed(2)).join(' × ')} m</div>
                  <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                    Cảnh GLB nguồn đang thay thế toàn bộ phòng cũ. Nhấp một mesh trong viewport để làm nổi bật đối tượng.
                  </div>
                </div>
              ) : selectedFurn ? (
                <>
                  <div className="surface-subtle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedFurn.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          SKU: {selectedFurn.sku} • {selectedFurn.category}
                        </div>
                        {selectedFurn.asset_id && (
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', marginTop: 2 }}>
                            3D Asset: {selectedFurn.asset_id}
                          </div>
                        )}
                        <div
                          style={{
                            display: 'inline-flex',
                            marginTop: 6,
                            padding: '2px 7px',
                            borderRadius: 999,
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: selectedFurn.normalized_glb ? '#047857' : '#92400E',
                            background: selectedFurn.normalized_glb ? '#D1FAE5' : '#FEF3C7',
                          }}
                        >
                          {selectedFurn.normalized_glb ? 'GLB thật có nguồn' : 'Mô hình tham số dự phòng'}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          background: selectedFurn.color_hex || '#E4DDD3',
                          border: '1px solid var(--border-strong)',
                          flexShrink: 0,
                        }}
                        title={`Màu vật liệu: ${selectedFurn.color_hex}`}
                      />
                    </div>
                    <div
                      className="mono"
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Đơn giá:</span>
                      <strong style={{ color: selectedFurn.price_vnd > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {formatFurniturePrice(selectedFurn.price_vnd)}
                      </strong>
                    </div>
                  </div>

                  {/* 3D GLB Asset Switcher (G4/G8: Switch between single-slot Sofa_01 and multi-slot GlamVelvetSofa / ArmChair / CoffeeTable) */}
                  {(
                    <div className="surface-subtle" style={{ padding: '8px 10px' }}>
                      <div className="text-caption" style={{ fontWeight: 600, marginBottom: 4 }}>
                        Mô hình 3D GLB thực tế (Thư viện CC0 / CC-BY)
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          data-testid="assign-asset-select"
                          className="field-select"
                          style={{ fontSize: 11.5, flex: 1 }}
                          value={targetAssetId}
                          onChange={(e) => setTargetAssetId(e.target.value)}
                        >
                          <option value="" disabled>
                            {compatibleAssets.length > 0 ? 'Chọn model cùng loại...' : 'Chưa có model cùng loại'}
                          </option>
                          {compatibleAssets.map((asset: any) => (
                            <option key={asset.asset_id} value={asset.asset_id}>
                              {asset.source_id || asset.asset_id} ({asset.material_slots?.length || 1} slots · {Math.round(asset.dimensions_mm?.[0] || 0)}×{Math.round(asset.dimensions_mm?.[1] || 0)}mm)
                            </option>
                          ))}
                        </select>
                        <button
                          data-testid="assign-asset-btn"
                          className="btn btn-sm btn-primary"
                          disabled={assigningAsset || !targetAssetId}
                          onClick={handleAssignAssetClick}
                        >
                          <RefreshCw size={11} /> {assigningAsset ? '...' : 'Gán GLB'}
                        </button>
                      </div>
                      {onImportAsset && (
                        <div style={{ marginTop: 7 }}>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".glb,model/gltf-binary"
                            hidden
                            onChange={handleImportFile}
                          />
                          <button
                            className="btn btn-sm btn-soft"
                            style={{ width: '100%', justifyContent: 'center' }}
                            disabled={importingAsset}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Box size={11} /> {importingAsset ? 'Đang chuẩn hóa GLB...' : 'Tải GLB thật từ máy và gắn vào món này'}
                          </button>
                          <div className="text-caption" style={{ marginTop: 5, lineHeight: 1.35 }}>
                            Chỉ tải model bạn có quyền sử dụng. Hệ thống sẽ kiểm tra GLB, kích thước và vật liệu trước khi gắn.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dimensions (W x D x H mm) */}
                  <div>
                    <div className="text-caption" style={{ marginBottom: 4, fontWeight: 500 }}>
                      Kích thước bao (Rộng × Sâu × Cao — mm)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {([
                        ['W (mm)', 'width_mm'],
                        ['D (mm)', 'depth_mm'],
                        ['H (mm)', 'height_mm'],
                      ] as const).map(([label, field]) => (
                        <label key={field} className="field-group" style={{ gap: 3 }}>
                          <span className="field-label">{label}</span>
                          <input
                            className="field-input mono"
                            type="number"
                            min={100}
                            max={20000}
                            step={10}
                            value={Math.round(selectedFurn[field] || 0)}
                            onChange={(event) =>
                              onUpdateFurnitureField(selectedFurn.id, field, Number(event.target.value))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Position X / Y / Z & Rotation */}
                  <div>
                    <div className="text-caption" style={{ marginBottom: 4, fontWeight: 500 }}>
                      Tọa độ mặt bằng X / Y (mm) & Góc xoay
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <div>
                        <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Tọa độ X</label>
                        <input
                          type="number"
                          className="field-input mono"
                          style={{ padding: '5px 7px', fontSize: 12 }}
                          value={Math.round(selectedFurn.x_mm)}
                          onChange={(e) =>
                            onUpdateFurnitureField(selectedFurn.id, 'x_mm', Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Tọa độ Y</label>
                        <input
                          type="number"
                          className="field-input mono"
                          style={{ padding: '5px 7px', fontSize: 12 }}
                          value={Math.round(selectedFurn.y_mm)}
                          onChange={(e) =>
                            onUpdateFurnitureField(selectedFurn.id, 'y_mm', Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Góc (°)</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            type="number"
                            className="field-input mono"
                            style={{ padding: '5px 7px', fontSize: 12 }}
                            value={Math.round(selectedFurn.rotation_deg || 0)}
                            onChange={(e) =>
                              onUpdateFurnitureField(selectedFurn.id, 'rotation_deg', Number(e.target.value))
                            }
                          />
                          <button
                            className="btn btn-sm btn-icon"
                            title="Xoay 90°"
                            onClick={() =>
                              onUpdateFurnitureField(
                                selectedFurn.id,
                                'rotation_deg',
                                ((selectedFurn.rotation_deg || 0) + 90) % 360
                              )
                            }
                          >
                            <RotateCw size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : selectedWall ? (
                <div className="surface-subtle">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Đoạn tường: {selectedWall.id}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Cao: {selectedWall.height_mm}mm • Dày: {selectedWall.thickness_mm}mm
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Sơn mặt trong (Face A): <strong>{selectedWall.face_a_material_id}</strong>
                  </div>
                  {selectedWall.is_accent_wall && (
                    <span className="status-badge teal" style={{ marginTop: 6 }}>
                      ★ Tường điểm nhấn (Accent Wall)
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-caption">
                  Nhấp vào một món nội thất hoặc đoạn tường trên mặt bằng 2D / không gian 3D để xem thông số kỹ thuật.
                </div>
              )}
            </div>
          )}
        </div>

        {!externalScene && <div className="inspector-section" data-testid="ai-material-guidance">
          <div className="inspector-section-body" style={{ gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Palette size={13} style={{ color: 'var(--accent)' }} />
              Màu và vật liệu do AI đề xuất
            </div>
            <div className="text-caption">
              Mô tả phong cách hoặc màu mong muốn. AI sẽ tìm phương án phù hợp và gửi đề xuất để bạn duyệt trước khi áp dụng.
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={onOpenAICopilot}>
              Mở AI Copilot
            </button>
          </div>
        </div>}

        {selectedFurn && (
          <div className="inspector-section" data-testid="smart-fit-editor">
            <button className="inspector-section-header" onClick={() => toggleSection('smartFit')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Box size={13} style={{ color: 'var(--accent)' }} /> Smart Furniture Fit
              </span>
              {openSections.smartFit ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {openSections.smartFit && (
              <div className="inspector-section-body" style={{ gap: 8 }}>
                <div className="surface-subtle" style={{ fontSize: 11.5 }}>
                  <div>Policy: <strong>{selectedFurn.sizing_policy || 'FIXED_SIZE'}</strong></div>
                  <div className="mono">Measured: {selectedFurn.width_mm}×{selectedFurn.depth_mm}×{selectedFurn.height_mm} mm</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    data-testid="smart-fit-assess"
                    className="btn btn-sm btn-soft"
                    disabled={fitLoading}
                    onClick={async () => {
                      if (!onRequestSmartFit) return
                      setFitLoading(true)
                      try { setFitReport(await onRequestSmartFit(selectedFurn.id)) } finally { setFitLoading(false) }
                    }}
                  >Kiểm tra vừa phòng</button>
                  <button
                    data-testid="smart-fit-options"
                    className="btn btn-sm"
                    disabled={fitLoading}
                    onClick={async () => {
                      if (!onRequestPlacementOptions) return
                      setFitLoading(true)
                      try {
                        const result = await onRequestPlacementOptions(selectedFurn.id)
                        setPlacementOptions(result?.options || [])
                      } finally { setFitLoading(false) }
                    }}
                  >Tìm 2 bố cục</button>
                </div>
                {fitReport && (
                  <div className="surface-subtle" data-testid="smart-fit-result" style={{ fontSize: 11.5 }}>
                    <strong>{fitReport.assessment?.fits ? 'PASS — Vừa phòng' : 'FAIL — Cần xử lý'}</strong>
                    {(fitReport.assessment?.issues || []).map((issue: string) => <div key={issue}>• {issue}</div>)}
                  </div>
                )}
                {placementOptions.map((option: any, index: number) => (
                  <button
                    key={`${option.x_mm}-${option.y_mm}-${option.rotation_deg}`}
                    className="btn btn-sm btn-soft"
                    data-testid={`placement-option-${index}`}
                    onClick={() => onCreatePlacementProposal?.(selectedFurn.id, option)}
                  >
                    PA {index + 1}: X {option.x_mm}, Y {option.y_mm}, {option.rotation_deg}° · score {option.score}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. FURNITURE LIST IN SCENE (Section 11) */}
        <div className="inspector-section" data-testid="construction-furniture-list">
          <button className="inspector-section-header" onClick={() => toggleSection('furnitureList')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} style={{ color: 'var(--accent)' }} />
              Đồ vật trong cảnh ({constructionObjects.length})
            </span>
            {openSections.furnitureList ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {openSections.furnitureList && (
            <div className="inspector-section-body" style={{ gap: 6 }}>
              {constructionObjects.map((f: any) => {
                const isSel = selectedEntityId === f.id
                const dimensions = f.dimensionsMm || [f.width_mm, f.depth_mm, f.height_mm]
                return (
                  <div
                    key={f.id}
                    data-testid={`furniture-item-${f.id}`}
                    onClick={() => {
                      onSelectEntity(f.id)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-btn)',
                      border: isSel ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                      background: isSel ? 'var(--accent-soft)' : 'var(--surface-primary)',
                      cursor: 'pointer',
                      transition: 'all 140ms ease',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: f.color_hex || '#E4DDD3',
                        border: '1px solid rgba(0,0,0,0.12)',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: '#171717',
                      }}
                    >
                      {(f.category || '3D').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: isSel ? 600 : 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={f.parentName ? `${f.name} · ${f.parentName}` : f.name}
                      >
                        {f.name}
                      </div>
                      <div
                        className="mono"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                        }}
                      >
                        <span>
                          {Math.round(dimensions[0] || 0)}×{Math.round(dimensions[1] || 0)}×{Math.round(dimensions[2] || 0)}mm
                        </span>
                        <span>{externalScene ? 'GLB' : formatFurniturePrice(f.price_vnd)}</span>
                      </div>
                    </div>
                    <PackageOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  </div>
                )
              })}
              {constructionObjects.length === 0 && (
                <div className="text-caption">Đang đọc danh sách mesh trực tiếp từ file GLB...</div>
              )}
            </div>
          )}
        </div>

      </div>
    </aside>
  )
}
