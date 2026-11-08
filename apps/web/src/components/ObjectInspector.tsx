/**
 * ATELIER AI — Dedicated Object, Furniture & Surface Material Inspector (Sections 6.3 & 11)
 * Synchronizes selection between Furniture List, Object Properties (X/Y/Z, Rotation, Dimensions, Price),
 * Surface Material Swatches (Section 7B Paint/Accent/Floor), and 2D/3D Pascal Viewport.
 */
import React, { useState } from 'react'
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
} from 'lucide-react'

interface ObjectInspectorProps {
  project: any
  materialsDb: any
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onUpdateFurnitureField: (furnId: string, field: string, value: any) => void
  onCommitCanvasPosition: () => void
  onUpdateSurfaces7B: (payload: any) => void
  onClose?: () => void
}

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({
  project,
  materialsDb,
  selectedEntityId,
  onSelectEntity,
  onUpdateFurnitureField,
  onCommitCanvasPosition,
  onUpdateSurfaces7B,
  onClose,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    selected: true,
    furnitureList: true,
    surfaces7B: true,
  })

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const furniture = project?.furniture_instances || []
  const walls = project?.walls || []
  const currentRoom = project?.rooms?.[0]

  const selectedFurn = furniture.find((f: any) => f.id === selectedEntityId)
  const selectedWall = walls.find((w: any) => w.id === selectedEntityId)

  const paints = materialsDb?.paints || []
  const tiles = materialsDb?.tiles_and_flooring || []

  return (
    <aside className="inspector-dock" aria-label="Object & Material Inspector">
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
            title="Lưu vị trí & góc xoay hiện tại vào Scene Revision"
          >
            <Save size={12} /> Lưu Scene
          </button>
          {onClose && (
            <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Đóng bảng thuộc tính">
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
                      <strong style={{ color: 'var(--accent)' }}>{formatVnd(selectedFurn.price_vnd)}</strong>
                    </div>
                  </div>

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
                    {/* Color / Material Thumbnail */}
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
                        <span>{formatVnd(f.price_vnd)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 3. SURFACE MATERIAL SELECTOR (Section 7B & Section 11) */}
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

              {/* Floor Tile / Wood Selector */}
              <div>
                <div className="text-caption" style={{ marginBottom: 6, fontWeight: 500 }}>
                  Sàn gỗ / Gạch lát nền (Quy cách mm & Hao hụt)
                </div>
                <select
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
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
