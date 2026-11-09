/**
 * ATELIER AI — Dedicated Object, Furniture & Surface Material Inspector (Sections 6.3 & 11 + G4 Multi-Material & Surface Editing)
 * Synchronizes selection between Furniture List, Object Properties (X/Y/Z, Rotation, Dimensions, Price),
 * 3D Asset Switcher, Multi-Material Slot & PBR Editor, Floor 800×800 mm (3mm grout) Surface Proposal,
 * Surface Material Swatches (Section 7B Paint/Accent/Floor), and 2D/3D Pascal Viewport.
 */
import React, { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  RotateCw,
  Save,
  Layers,
  Palette,
  Box,
  Sliders,
  Check,
  X,
  Eye,
  RefreshCw,
} from 'lucide-react'

interface ObjectInspectorProps {
  project: any
  materialsDb: any
  pbrMaterials?: any[]
  assetLibrary?: any[]
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onUpdateFurnitureField: (furnId: string, field: string, value: any) => void
  onCommitCanvasPosition: () => void
  onUpdateSurfaces7B: (payload: any) => void
  onPreviewMaterial?: (payload: any) => void
  onCreateMaterialProposal?: (objectId: string, payload: any) => Promise<any>
  onCreateSurfaceMaterialProposal?: (surfaceId: string, payload: any) => Promise<any>
  onAssignAsset?: (objectId: string, assetId: string) => Promise<any>
  onResetMaterialPreview?: () => void
  onRequestSmartFit?: (objectId: string) => Promise<any>
  onRequestPlacementOptions?: (objectId: string) => Promise<any>
  onCreatePlacementProposal?: (objectId: string, option: any) => Promise<any>
  onClose?: () => void
  savingScene?: boolean
}

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`
const formatFurniturePrice = (v?: number) => (v == null || v <= 0 ? 'Chưa có giá' : formatVnd(v))

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({
  project,
  materialsDb,
  pbrMaterials = [],
  assetLibrary = [],
  selectedEntityId,
  onSelectEntity,
  onUpdateFurnitureField,
  onCommitCanvasPosition,
  onUpdateSurfaces7B,
  onPreviewMaterial,
  onCreateMaterialProposal,
  onCreateSurfaceMaterialProposal,
  onAssignAsset,
  onResetMaterialPreview,
  onRequestSmartFit,
  onRequestPlacementOptions,
  onCreatePlacementProposal,
  onClose,
  savingScene = false,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    selected: true,
    furnitureList: true,
    surfaces7B: true,
    pbrMaterial: true,
    smartFit: true,
  })
  const [selectedSlotId, setSelectedSlotId] = useState<string>('')
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('mat_fabric_sand')
  const [materialTint, setMaterialTint] = useState<string>('#D3C7B5')
  const [roughness, setRoughness] = useState<number>(0.78)
  const [metalness, setMetalness] = useState<number>(0)
  const [clearcoat, setClearcoat] = useState<number>(0)
  const [sheen, setSheen] = useState<number>(0.2)
  const [proposalPending, setProposalPending] = useState(false)
  const [surfaceProposalPending, setSurfaceProposalPending] = useState(false)
  const [assigningAsset, setAssigningAsset] = useState(false)
  const [targetAssetId, setTargetAssetId] = useState<string>('')
  const [fitReport, setFitReport] = useState<any>(null)
  const [placementOptions, setPlacementOptions] = useState<any[]>([])
  const [fitLoading, setFitLoading] = useState(false)

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const furniture = project?.furniture_instances || []
  const walls = project?.walls || []
  const currentRoom = project?.rooms?.[0]

  const selectedFurn = furniture.find((f: any) => f.id === selectedEntityId)
  const selectedWall = walls.find((w: any) => w.id === selectedEntityId)
  const availableSlots = selectedFurn?.material_slots || []
  const activeSlotId = availableSlots.some((slot: any) => slot.slot_id === selectedSlotId)
    ? selectedSlotId
    : availableSlots[0]?.slot_id || ''
  const activeSlot = availableSlots.find((slot: any) => slot.slot_id === activeSlotId)
  const selectedMaterial = pbrMaterials.find((material: any) => material.material_id === selectedMaterialId)
  const persistedOverride = selectedFurn?.material_overrides?.[activeSlotId]

  useEffect(() => {
    if (selectedFurn?.asset_id) {
      setTargetAssetId(selectedFurn.asset_id)
    } else if (assetLibrary.length > 0 && !targetAssetId) {
      setTargetAssetId(assetLibrary[0].asset_id)
    }
  }, [selectedFurn?.id, selectedFurn?.asset_id, assetLibrary])

  useEffect(() => {
    if (!persistedOverride) return
    setSelectedMaterialId(persistedOverride.material_id)
    const definition = pbrMaterials.find(
      (material: any) => material.material_id === persistedOverride.material_id
    )
    setMaterialTint(persistedOverride.tint || definition?.tint || '#FFFFFF')
    setRoughness(persistedOverride.pbr?.roughness ?? definition?.pbr?.roughness ?? 0.5)
    setMetalness(persistedOverride.pbr?.metalness ?? definition?.pbr?.metalness ?? 0)
    setClearcoat(persistedOverride.pbr?.clearcoat ?? definition?.pbr?.clearcoat ?? 0)
    setSheen(persistedOverride.pbr?.sheen ?? definition?.pbr?.sheen ?? 0)
  }, [
    selectedFurn?.id,
    activeSlotId,
    persistedOverride?.material_id,
    persistedOverride?.tint,
    persistedOverride?.pbr?.roughness,
    persistedOverride?.pbr?.metalness,
    persistedOverride?.pbr?.clearcoat,
    persistedOverride?.pbr?.sheen,
    pbrMaterials,
  ])

  const materialOverride = {
    material_id: selectedMaterialId,
    material_version: selectedMaterial?.version || 1,
    tint: materialTint,
    pbr: { roughness, metalness, clearcoat, sheen },
  }

  const previewMaterial = () => {
    if (!selectedFurn || !activeSlot || !selectedMaterial || !onPreviewMaterial) return
    onPreviewMaterial({
      objectId: selectedFurn.id,
      slotId: activeSlot.slot_id,
      sourceMaterialName: activeSlot.source_material_name,
      override: materialOverride,
    })
  }

  const createMaterialProposal = async () => {
    if (!selectedFurn || !activeSlot || !onCreateMaterialProposal) return
    setProposalPending(true)
    try {
      await onCreateMaterialProposal(selectedFurn.id, {
        slot_id: activeSlot.slot_id,
        ...materialOverride,
      })
    } finally {
      setProposalPending(false)
    }
  }

  const handleProposeFloorTile800 = async () => {
    if (!onCreateSurfaceMaterialProposal) return
    setSurfaceProposalPending(true)
    try {
      await onCreateSurfaceMaterialProposal('floor', {
        slot_id: 'FLOOR_MAIN',
        material_id: 'mat_tile_sand_800',
        material_version: 1,
        tint: '#DFD6C7',
        pbr: {
          roughness: 0.36,
          metalness: 0.0,
          clearcoat: 0.08,
          sheen: 0.0,
        },
        uv_transform: {
          scale: [1, 1],
          offset_mm: [0, 0],
          rotation_deg: 0,
          tile_size_mm: [800, 800],
          grout_thickness_mm: 3,
          grout_color: '#B8B1A6',
        },
      })
    } finally {
      setSurfaceProposalPending(false)
    }
  }

  const handleAssignAssetClick = async () => {
    const assetToAssign = targetAssetId || assetLibrary[0]?.asset_id
    if (!selectedFurn || !assetToAssign || !onAssignAsset) return
    setAssigningAsset(true)
    try {
      await onAssignAsset(selectedFurn.id, assetToAssign)
    } finally {
      setAssigningAsset(false)
    }
  }

  const paints = materialsDb?.paints || []
  const tiles = materialsDb?.tiles_and_flooring || []
  const floorOverride = project?.surface_material_overrides?.floor

  return (
    <aside id="inspector-dock" className="inspector-dock" aria-label="Thuộc tính và vật liệu">
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
          <span>Thuộc Tính & Vật Liệu</span>
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
              {selectedFurn ? (
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
                  {assetLibrary.length > 0 && (
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
                          {assetLibrary.map((asset: any) => (
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
                    </div>
                  )}

                  {/* Dimensions (W x D x H mm) */}
                  <div>
                    <div className="text-caption" style={{ marginBottom: 4, fontWeight: 500 }}>
                      Kích thước bao (Rộng × Sâu × Cao — mm)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <div className="surface-subtle" style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>W (mm)</div>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 12 }}>
                          {Math.round(selectedFurn.width_mm)}
                        </div>
                      </div>
                      <div className="surface-subtle" style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>D (mm)</div>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 12 }}>
                          {Math.round(selectedFurn.depth_mm)}
                        </div>
                      </div>
                      <div className="surface-subtle" style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>H (mm)</div>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 12 }}>
                          {Math.round(selectedFurn.height_mm)}
                        </div>
                      </div>
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

        {/* G2 / G4 renderer-neutral PBR material editor */}
        {selectedFurn && availableSlots.length > 0 && (
          <div className="inspector-section" data-testid="pbr-material-editor">
            <button className="inspector-section-header" onClick={() => toggleSection('pbrMaterial')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Palette size={13} style={{ color: 'var(--accent)' }} />
                Material Slots & PBR ({availableSlots.length} slot)
              </span>
              {openSections.pbrMaterial ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {openSections.pbrMaterial && (
              <div className="inspector-section-body" style={{ gap: 10 }}>
                <div className="surface-subtle" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  <strong>{availableSlots.length} slot thực tế từ GLB</strong>
                  {availableSlots.length === 1 ? (
                    <div style={{ marginTop: 4, color: 'var(--amber-text, #92400e)' }}>
                      Asset chỉ có một primitive/material. Override tác động toàn bộ model; để chỉnh riêng vải và chân gỗ, hãy gán model nhiều slot (VD: GlamVelvetSofa 3 slot hoặc ModernArmChair 2 slot).
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, color: 'var(--emerald-text, #065f46)' }}>
                      ✓ Model đa vật liệu ({availableSlots.length} slot độc lập): có thể đổi riêng vải bọc, chân gỗ hoặc khung đế.
                    </div>
                  )}
                </div>

                <label className="text-caption">
                  Material slot (Bộ phận)
                  <select
                    data-testid="material-slot-select"
                    className="field-select"
                    value={activeSlotId}
                    onChange={(event) => setSelectedSlotId(event.target.value)}
                  >
                    {availableSlots.map((slot: any) => (
                      <option key={slot.slot_id} value={slot.slot_id}>
                        {slot.slot_id} — {slot.source_material_name} ({slot.semantic_part || 'surface'})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-caption">
                  Material Definition
                  <select
                    data-testid="pbr-material-select"
                    className="field-select"
                    value={selectedMaterialId}
                    onChange={(event) => {
                      const next = pbrMaterials.find((material: any) => material.material_id === event.target.value)
                      setSelectedMaterialId(event.target.value)
                      if (next) {
                        setMaterialTint(next.tint || next.pbr?.base_color || '#FFFFFF')
                        setRoughness(next.pbr?.roughness ?? 0.5)
                        setMetalness(next.pbr?.metalness ?? 0)
                        setClearcoat(next.pbr?.clearcoat ?? 0)
                        setSheen(next.pbr?.sheen ?? 0)
                      }
                    }}
                  >
                    {pbrMaterials.map((material: any) => (
                      <option key={material.material_id} value={material.material_id}>
                        {material.name} · {material.kind}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 8, alignItems: 'center' }}>
                  <input
                    data-testid="material-color-picker"
                    type="color"
                    value={materialTint}
                    onChange={(event) => setMaterialTint(event.target.value)}
                    style={{ width: 44, height: 34, border: '1px solid var(--border-subtle)', borderRadius: 6 }}
                  />
                  <div className="surface-subtle" style={{ padding: '6px 8px', fontSize: 11 }}>
                    <div>Slot: <span className="mono">{activeSlot?.source_material_name}</span></div>
                    <div className="mono">Tint: {materialTint.toUpperCase()}</div>
                  </div>
                </div>

                {[
                  ['Roughness', roughness, setRoughness],
                  ['Metalness', metalness, setMetalness],
                  ['Clearcoat', clearcoat, setClearcoat],
                  ['Sheen', sheen, setSheen],
                ].map(([label, value, setter]: any) => (
                  <label key={label} className="text-caption" style={{ display: 'grid', gridTemplateColumns: '78px 1fr 32px', gap: 6, alignItems: 'center' }}>
                    <span>{label}</span>
                    <input
                      data-testid={`pbr-${String(label).toLowerCase()}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={value}
                      onChange={(event) => setter(Number(event.target.value))}
                    />
                    <span className="mono">{Number(value).toFixed(2)}</span>
                  </label>
                ))}

                <div className="surface-subtle" style={{ fontSize: 10.5, lineHeight: 1.45 }}>
                  <div>Texture: giữ UV + diffuse/normal/roughness gốc của GLB</div>
                  <div>Nguồn: {selectedMaterial?.author || 'Chưa khai báo'}</div>
                  <div>License: {selectedMaterial?.license || 'Chưa khai báo'} · Giá: Chưa có giá</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button data-testid="material-preview" className="btn btn-sm btn-soft" onClick={previewMaterial}>
                    <Eye size={12} /> Preview
                  </button>
                  <button
                    data-testid="material-propose"
                    className="btn btn-sm btn-primary"
                    disabled={proposalPending}
                    onClick={createMaterialProposal}
                  >
                    <Save size={12} /> {proposalPending ? 'Đang tạo...' : 'Tạo đề xuất'}
                  </button>
                  <button className="btn btn-sm" style={{ gridColumn: '1 / -1' }} onClick={onResetMaterialPreview}>
                    <RotateCw size={12} /> Reset về revision đã lưu
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
        <div className="inspector-section">
          <button className="inspector-section-header" onClick={() => toggleSection('furnitureList')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} style={{ color: 'var(--accent)' }} />
              Danh Sách Nội Thất ({furniture.length})
            </span>
            {openSections.furnitureList ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {openSections.furnitureList && (
            <div className="inspector-section-body" style={{ gap: 6 }}>
              {furniture.map((f: any) => {
                const isSel = selectedEntityId === f.id
                return (
                  <div
                    key={f.id}
                    data-testid={`furniture-item-${f.id}`}
                    onClick={() => onSelectEntity(f.id)}
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
                      {f.category.slice(0, 2).toUpperCase()}
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
                        title={f.name}
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
                          {Math.round(f.width_mm)}×{Math.round(f.depth_mm)}mm
                        </span>
                        <span>{formatFurniturePrice(f.price_vnd)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 3. SURFACE MATERIAL SELECTOR (Section 7B & G4 Floor 800x800mm Tile Proposal) */}
        <div className="inspector-section">
          <button className="inspector-section-header" onClick={() => toggleSection('surfaces7B')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Palette size={13} style={{ color: 'var(--accent)' }} />
              Vật Liệu Bề Mặt (Sơn & Sàn 7B)
            </span>
            {openSections.surfaces7B ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {openSections.surfaces7B && (
            <div className="inspector-section-body" style={{ gap: 12 }}>
              {/* Wall Base Paint Swatches */}
              <div>
                <div className="text-caption" style={{ marginBottom: 6, fontWeight: 500 }}>
                  Sơn tường nền (Interior Base Paint)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {paints.map((p: any) => {
                    const active = currentRoom?.wall_base_material_id === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => onUpdateSurfaces7B({ wall_base_material_id: p.id })}
                        title={`${p.name} (${p.color_code}) — ${formatVnd(p.unit_price_vnd)}/thùng`}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: p.hex_color,
                          border: active ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && <Check size={12} color="#171717" />}
                      </button>
                    )
                  })}
                </div>
                <select
                  className="field-select"
                  style={{ fontSize: 12 }}
                  value={currentRoom?.wall_base_material_id || 'paint_dulux_japandi_ivory'}
                  onChange={(e) => onUpdateSurfaces7B({ wall_base_material_id: e.target.value })}
                >
                  {paints.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatVnd(p.unit_price_vnd)}/thùng {p.can_size_liters}L)
                    </option>
                  ))}
                </select>
              </div>

              {/* Accent Wall Paint */}
              <div>
                <div className="text-caption" style={{ marginBottom: 6, fontWeight: 500 }}>
                  Tường điểm nhấn (Accent Wall — Tường Đông)
                </div>
                <select
                  className="field-select"
                  style={{ fontSize: 12 }}
                  value={
                    walls.find((w: any) => w.is_accent_wall)?.face_a_material_id ||
                    'paint_dulux_sage_mist'
                  }
                  onChange={(e) =>
                    onUpdateSurfaces7B({
                      accent_wall_id: 'wall_east',
                      accent_paint_id: e.target.value,
                    })
                  }
                >
                  {paints.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      ★ {p.name} ({p.hex_color})
                    </option>
                  ))}
                </select>
              </div>

              {/* Floor Tile / Wood Selector + G4 Canonical PBR 800x800mm (3mm Grout) Proposal */}
              <div>
                <div className="text-caption" style={{ marginBottom: 6, fontWeight: 500 }}>
                  Sàn gỗ / Gạch lát nền (Quy cách mm & Hao hụt)
                </div>
                <select
                  data-testid="floor-material-7b-select"
                  className="field-select"
                  style={{ fontSize: 12 }}
                  value={currentRoom?.floor_material_id || 'floor_wood_oak_straight'}
                  onChange={(e) => onUpdateSurfaces7B({ floor_material_id: e.target.value })}
                >
                  {tiles.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.tile_width_mm}×{t.tile_length_mm}mm — {formatVnd(t.price_per_box_vnd)}/thùng)
                    </option>
                  ))}
                </select>

                {/* G4 Canonical PBR Surface Override for Floor 800x800mm with 3mm Grout */}
                <div className="surface-subtle" style={{ marginTop: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>
                    G4 PBR Surface: Gạch Porcelain 800×800 mm (Ron 3 mm)
                  </div>
                  {floorOverride?.material_id === 'mat_tile_sand_800' && (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--emerald-text)', marginTop: 2 }}>
                      ✓ Đang áp dụng: {floorOverride.material_id} ({floorOverride.texture_scale?.width_mm || floorOverride.uv_transform?.tile_size_mm?.[0] || 800}×{floorOverride.texture_scale?.height_mm || floorOverride.uv_transform?.tile_size_mm?.[1] || 800}mm, ron {floorOverride.texture_scale?.grout_width_mm ?? floorOverride.uv_transform?.grout_thickness_mm ?? 3}mm)
                    </div>
                  )}
                  <button
                    data-testid="propose-floor-tile-800-btn"
                    className="btn btn-sm btn-primary"
                    style={{ width: '100%', marginTop: 6 }}
                    disabled={surfaceProposalPending}
                    onClick={handleProposeFloorTile800}
                  >
                    <Save size={12} />{' '}
                    {surfaceProposalPending
                      ? 'Đang tạo đề xuất sàn 800×800...'
                      : 'Đề xuất Gạch Porcelain 800×800 (Ron 3mm)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
