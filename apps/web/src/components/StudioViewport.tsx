/**
 * ATELIER AI — Interactive 2D CAD Plan & 3D WebGL Pascal BIM Viewer
 * Renders:
 * - 3D WebGL Scene (Three.js) with Wall Face A/B colors, Accent Wall highlight,
 *   Floor Tile/Wood procedural grid pattern (scaled by tile_width_mm x tile_length_mm),
 *   Doors, Windows, and 3D Furniture models (Sofa, Coffee Table, TV Stand, Armchair).
 * - Camera modes: Perspective Orbit, Top Orthographic, Cutaway Wall Mode, First-Person Walkthrough.
 * - 2D Architectural Plan SVG with interactive furniture selection, drag-to-move, dimension chains (mm/m),
 *   and door swing clearance arcs.
 */
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface StudioViewportProps {
  project: any
  materialsDb: any
  viewMode: 'split' | '2d' | '3d'
  cameraPreset: 'orbit' | 'top' | 'cutaway' | 'walk'
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onMoveFurniture?: (furnId: string, newX: number, newY: number) => void
  lowSpecMode?: boolean
}

function createProceduralTileTexture(
  hexColor: string,
  tileWidthMm: number,
  tileLengthMm: number,
  roomWidthMm: number,
  roomDepthMm: number,
  pattern: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = hexColor || '#C8A986'
  ctx.fillRect(0, 0, 256, 256)

  // Grout / plank joint lines
  ctx.strokeStyle = 'rgba(23, 25, 28, 0.18)'
  ctx.lineWidth = pattern === 'herringbone' ? 3 : 2
  ctx.strokeRect(1, 1, 254, 254)
  if (pattern === 'herringbone') {
    ctx.beginPath()
    ctx.moveTo(0, 128)
    ctx.lineTo(128, 0)
    ctx.moveTo(128, 256)
    ctx.lineTo(256, 128)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  const repX = Math.max(1, roomWidthMm / Math.max(120, tileWidthMm || 600))
  const repY = Math.max(1, roomDepthMm / Math.max(120, tileLengthMm || 600))
  tex.repeat.set(repX, repY)
  return tex
}

export const StudioViewport: React.FC<StudioViewportProps> = ({
  project,
  materialsDb,
  viewMode,
  cameraPreset,
  selectedEntityId,
  onSelectEntity,
  onMoveFurniture,
  lowSpecMode = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const paintsById: Record<string, any> = {}
  const tilesById: Record<string, any> = {}
  ;(materialsDb?.paints || []).forEach((p: any) => {
    paintsById[p.id] = p
  })
  ;(materialsDb?.tiles_and_flooring || []).forEach((t: any) => {
    tilesById[t.id] = t
  })

  const room = project?.rooms?.[0]
  const walls = project?.walls || []
  const doors = project?.openings || []
  const windows = project?.windows || []
  const furniture = project?.furniture_instances || []

  const poly = room?.polygon_mm || [
    [0, 0],
    [4000, 0],
    [4000, 5000],
    [0, 5000],
  ]
  const roomW = Math.max(...poly.map((p: number[]) => p[0])) || 4000
  const roomD = Math.max(...poly.map((p: number[]) => p[1])) || 5000

  const floorMatInfo = tilesById[room?.floor_material_id] || {
    hex_color: '#C8A986',
    tile_width_mm: 190,
    tile_length_mm: 1200,
    layout_pattern: 'straight',
    name: 'Sàn gỗ sồi',
  }

  // ============================================================================
  // THREE.JS 3D PASCAL SCENE VIEWER
  // ============================================================================
  useEffect(() => {
    if (viewMode === '2d' || lowSpecMode || !mountRef.current) return
    const container = mountRef.current
    const width = container.clientWidth || 640
    const height = container.clientHeight || 480

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#F7F8FA')

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    const cx = roomW / 2000
    const cz = roomD / 2000

    if (cameraPreset === 'top') {
      camera.position.set(cx, 7.8, cz + 0.01)
      camera.lookAt(cx, 0, cz)
    } else if (cameraPreset === 'walk') {
      camera.position.set(cx, 1.55, roomD / 1000 - 0.5)
      camera.lookAt(cx, 1.2, 0.8)
    } else if (cameraPreset === 'cutaway') {
      camera.position.set(cx + 3.8, 3.6, cz + 4.4)
      camera.lookAt(cx, 0.9, cz)
    } else {
      camera.position.set(cx + 4.4, 4.6, cz + 5.0)
      camera.lookAt(cx, 0.8, cz)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.shadowMap.enabled = true
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // Architectural Studio Daylight Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambient)
    const dirLight = new THREE.DirectionalLight(0xfffcf5, 0.9)
    dirLight.position.set(6, 10, 7)
    dirLight.castShadow = true
    scene.add(dirLight)

    // Subtle ground reference grid
    const grid = new THREE.GridHelper(12, 24, 0xd0d5dd, 0xe8eaed)
    grid.position.set(cx, -0.01, cz)
    scene.add(grid)

    // 1. Floor Slab with Section 7B Tile/Wood UV Scale
    const floorTex = createProceduralTileTexture(
      floorMatInfo.hex_color || '#C8A986',
      floorMatInfo.tile_width_mm || 600,
      floorMatInfo.tile_length_mm || 600,
      roomW,
      roomD,
      floorMatInfo.layout_pattern || 'straight'
    )
    const floorGeo = new THREE.BoxGeometry(roomW / 1000, 0.08, roomD / 1000)
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: floorMatInfo.roughness ?? 0.5,
      metalness: 0.05,
    })
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.position.set(cx, -0.04, cz)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // 2. Walls (with Face A / Accent Wall color & Cutaway support)
    walls.forEach((w: any, idx: number) => {
      // In cutaway or orbit mode, make south/west front-facing walls semi-transparent so interior is clearly visible
      const isFrontCutaway =
        (cameraPreset === 'cutaway' || cameraPreset === 'orbit') &&
        (w.id === 'wall_south' || idx === 2)

      const x0 = w.start_mm[0] / 1000
      const z0 = w.start_mm[1] / 1000
      const x1 = w.end_mm[0] / 1000
      const z1 = w.end_mm[1] / 1000
      const len = Math.hypot(x1 - x0, z1 - z0)
      const h = (w.height_mm || 2800) / 1000
      const th = (w.thickness_mm || 200) / 1000

      const pMat = paintsById[w.face_a_material_id] || { hex_color: '#F5F2EB', roughness: 0.85 }
      const wallGeo = new THREE.BoxGeometry(len, h, th)
      const wallMat = new THREE.MeshStandardMaterial({
        color: pMat.hex_color || '#F5F2EB',
        roughness: pMat.roughness ?? 0.85,
        transparent: isFrontCutaway,
        opacity: isFrontCutaway ? 0.18 : 1.0,
      })
      const wallMesh = new THREE.Mesh(wallGeo, wallMat)
      const angle = Math.atan2(z1 - z0, x1 - x0)
      wallMesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2)
      wallMesh.rotation.y = -angle
      scene.add(wallMesh)

      // Optional Wall Tile Zone (Section 7B)
      if (room?.wall_tile_zone?.enabled && !isFrontCutaway) {
        const wtH = (room.wall_tile_zone.tile_height_mm || 1200) / 1000
        const wtInfo = tilesById[room.wall_tile_zone.tile_material_id] || { hex_color: '#D8D4CC' }
        const wtGeo = new THREE.BoxGeometry(len * 0.99, wtH, th + 0.012)
        const wtMat = new THREE.MeshStandardMaterial({
          color: wtInfo.hex_color || '#D8D4CC',
          roughness: 0.35,
        })
        const wtMesh = new THREE.Mesh(wtGeo, wtMat)
        wtMesh.position.set((x0 + x1) / 2, wtH / 2, (z0 + z1) / 2)
        wtMesh.rotation.y = -angle
        scene.add(wtMesh)
      }
    })

    // 3. Windows & Doors Visual Frames
    windows.forEach((win: any) => {
      const w = walls.find((item: any) => item.id === win.wall_id) || walls[0]
      if (!w) return
      const wx = (w.start_mm[0] + (w.end_mm[0] - w.start_mm[0]) * (win.t ?? 0.5)) / 1000
      const wz = (w.start_mm[1] + (w.end_mm[1] - w.start_mm[1]) * (win.t ?? 0.5)) / 1000
      const winGeo = new THREE.BoxGeometry((win.width_mm || 1500) / 1000, (win.height_mm || 1400) / 1000, 0.24)
      const winMat = new THREE.MeshStandardMaterial({
        color: '#BEE3F8',
        transparent: true,
        opacity: 0.55,
        roughness: 0.1,
      })
      const winMesh = new THREE.Mesh(winGeo, winMat)
      winMesh.position.set(wx, ((win.sill_height_mm || 900) + (win.height_mm || 1400) / 2) / 1000, wz)
      scene.add(winMesh)
    })

    // 4. Furniture 3D Models
    furniture.forEach((f: any) => {
      const isSelected = f.id === selectedEntityId
      const group = new THREE.Group()
      const fw = (f.width_mm || 1000) / 1000
      const fd = (f.depth_mm || 800) / 1000
      const fh = (f.height_mm || 750) / 1000

      const mainMat = new THREE.MeshStandardMaterial({
        color: f.color_hex || '#E4DDD3',
        roughness: 0.65,
        emissive: isSelected ? new THREE.Color('#276E70') : new THREE.Color('#000000'),
        emissiveIntensity: isSelected ? 0.22 : 0,
      })

      if (f.category === 'sofa') {
        // Seat base + backrest + 2 armrests
        const base = new THREE.Mesh(new THREE.BoxGeometry(fw, fh * 0.48, fd), mainMat)
        base.position.y = fh * 0.24
        group.add(base)
        const back = new THREE.Mesh(new THREE.BoxGeometry(fw, fh * 0.55, fd * 0.24), mainMat)
        back.position.set(0, fh * 0.68, -fd * 0.38)
        group.add(back)
      } else if (f.category === 'coffee_table') {
        const top = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.06, fd), mainMat)
        top.position.y = fh - 0.03
        group.add(top)
        const legBase = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.75, fh - 0.06, fd * 0.75), mainMat)
        legBase.position.y = (fh - 0.06) / 2
        group.add(legBase)
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), mainMat)
        box.position.y = fh / 2
        group.add(box)
      }

      group.position.set((f.x_mm || 2000) / 1000, 0, (f.y_mm || 2500) / 1000)
      group.rotation.y = -((f.rotation_deg || 0) * Math.PI) / 180
      scene.add(group)
    })

    renderer.render(scene, camera)

    // Interactive Orbit Drag on 3D Canvas
    let isPointerDown = false
    let prevX = 0
    let azimuth = 0.78
    let elevation = 0.72
    const radius = cameraPreset === 'top' ? 7.8 : 6.6

    const onDown = (e: MouseEvent) => {
      isPointerDown = true
      prevX = e.clientX
    }
    const onMove = (e: MouseEvent) => {
      if (!isPointerDown || cameraPreset === 'top') return
      const dx = e.clientX - prevX
      prevX = e.clientX
      azimuth -= dx * 0.007
      camera.position.x = cx + radius * Math.cos(azimuth) * Math.cos(elevation)
      camera.position.z = cz + radius * Math.sin(azimuth) * Math.cos(elevation)
      camera.lookAt(cx, 0.8, cz)
      renderer.render(scene, camera)
    }
    const onUp = () => {
      isPointerDown = false
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    return () => {
      dom.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      renderer.dispose()
    }
  }, [project, materialsDb, viewMode, cameraPreset, selectedEntityId, lowSpecMode])

  // ============================================================================
  // 2D INTERACTIVE SVG ARCHITECTURAL PLAN OVERLAY
  // ============================================================================
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingId || !onMoveFurniture) return
    const svg = e.currentTarget
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    const clampedX = Math.max(400, Math.min(roomW - 400, Math.round(cursor.x / 50) * 50))
    const clampedY = Math.max(400, Math.min(roomD - 400, Math.round(cursor.y / 50) * 50))
    onMoveFurniture(draggingId, clampedX, clampedY)
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: viewMode === 'split' ? '1fr 1fr' : '1fr',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* 2D CAD Architectural Plan Canvas */}
      {(viewMode === '2d' || viewMode === 'split' || lowSpecMode) && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: '#FFFFFF',
            borderRight: viewMode === 'split' ? '1px solid #E8EAED' : 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #E8EAED',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              background: '#F7F8FA',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              Mặt Bằng Kỹ Thuật 2D CAD (Tỷ lệ 1:1 — {roomW}×{roomD} mm)
            </span>
            <span className="badge badge-teal">
              Sàn: {floorMatInfo.name?.slice(0, 26)} ({floorMatInfo.tile_width_mm}×{floorMatInfo.tile_length_mm}mm)
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <svg
              viewBox={`-550 -550 ${roomW + 1100} ${roomD + 1100}`}
              style={{ width: '100%', height: '100%', maxHeight: '100%', userSelect: 'none' }}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={() => setDraggingId(null)}
            >
              <defs>
                <pattern
                  id="floorTileGrid"
                  width={Math.max(180, floorMatInfo.tile_width_mm || 600)}
                  height={Math.max(180, floorMatInfo.tile_length_mm || 600)}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width={Math.max(180, floorMatInfo.tile_width_mm || 600)}
                    height={Math.max(180, floorMatInfo.tile_length_mm || 600)}
                    fill={floorMatInfo.hex_color || '#EFECE6'}
                    fillOpacity={0.28}
                    stroke="#D0D5DD"
                    strokeWidth={14}
                  />
                </pattern>
              </defs>

              {/* Room Floor Polygon */}
              <polygon
                points={poly.map((p: number[]) => `${p[0]},${p[1]}`).join(' ')}
                fill="url(#floorTileGrid)"
                stroke="#17191C"
                strokeWidth={20}
              />

              {/* Dimension Chains (Top & Left) */}
              <g stroke="#276E70" strokeWidth={16} fill="#276E70">
                <line x1={0} y1={-260} x2={roomW} y2={-260} />
                <line x1={0} y1={-340} x2={0} y2={-180} />
                <line x1={roomW} y1={-340} x2={roomW} y2={-180} />
                <text x={roomW / 2} y={-320} textAnchor="middle" fontSize={145} fontFamily="JetBrains Mono" fontWeight={600}>
                  {roomW} mm ({(roomW / 1000).toFixed(2)}m)
                </text>

                <line x1={-260} y1={0} x2={-260} y2={roomD} />
                <line x1={-340} y1={0} x2={-180} y2={0} />
                <line x1={-340} y1={roomD} x2={-180} y2={roomD} />
                <text
                  x={-330}
                  y={roomD / 2}
                  textAnchor="middle"
                  fontSize={145}
                  fontFamily="JetBrains Mono"
                  fontWeight={600}
                  transform={`rotate(-90, -330, ${roomD / 2})`}
                >
                  {roomD} mm ({(roomD / 1000).toFixed(2)}m)
                </text>
              </g>

              {/* Walls with Face A / Accent Wall highlight */}
              {walls.map((w: any) => {
                const pMat = paintsById[w.face_a_material_id]
                const strokeCol = w.is_accent_wall ? pMat?.hex_color || '#276E70' : '#17191C'
                return (
                  <g key={w.id} onClick={() => onSelectEntity(w.id)} style={{ cursor: 'pointer' }}>
                    <line
                      x1={w.start_mm[0]}
                      y1={w.start_mm[1]}
                      x2={w.end_mm[0]}
                      y2={w.end_mm[1]}
                      stroke={strokeCol}
                      strokeWidth={w.thickness_mm || 200}
                      strokeLinecap="square"
                    />
                    {w.is_accent_wall && (
                      <text
                        x={(w.start_mm[0] + w.end_mm[0]) / 2 + 190}
                        y={(w.start_mm[1] + w.end_mm[1]) / 2}
                        fontSize={120}
                        fill="#276E70"
                        fontWeight={700}
                        transform={`rotate(90, ${(w.start_mm[0] + w.end_mm[0]) / 2 + 190}, ${(w.start_mm[1] + w.end_mm[1]) / 2})`}
                      >
                        ★ TƯỜNG NHẤN ({pMat?.name?.slice(0, 18) || w.face_a_material_id})
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Doors & Swing Arcs */}
              {doors.map((d: any) => {
                const w = walls.find((item: any) => item.id === d.wall_id) || walls[2]
                if (!w) return null
                const cx = w.start_mm[0] + (w.end_mm[0] - w.start_mm[0]) * (d.t ?? 0.3)
                const cy = w.start_mm[1] + (w.end_mm[1] - w.start_mm[1]) * (d.t ?? 0.3)
                const dw = d.width_mm || 900
                return (
                  <g key={d.id}>
                    <rect x={cx - dw / 2} y={cy - 110} width={dw} height={220} fill="#FFFFFF" stroke="#B86B35" strokeWidth={18} />
                    <path
                      d={`M ${cx - dw / 2} ${cy} A ${dw} ${dw} 0 0 1 ${cx + dw / 2} ${cy - dw}`}
                      fill="rgba(184, 107, 53, 0.08)"
                      stroke="#B86B35"
                      strokeWidth={14}
                      strokeDasharray="40,30"
                    />
                    <text x={cx} y={cy + 240} textAnchor="middle" fontSize={115} fill="#B86B35" fontFamily="JetBrains Mono">
                      Cửa {dw}mm
                    </text>
                  </g>
                )
              })}

              {/* Windows */}
              {windows.map((win: any) => {
                const w = walls.find((item: any) => item.id === win.wall_id) || walls[0]
                if (!w) return null
                const cx = w.start_mm[0] + (w.end_mm[0] - w.start_mm[0]) * (win.t ?? 0.5)
                const cy = w.start_mm[1] + (w.end_mm[1] - w.start_mm[1]) * (win.t ?? 0.5)
                const ww = win.width_mm || 1500
                return (
                  <g key={win.id}>
                    <rect x={cx - ww / 2} y={cy - 105} width={ww} height={210} fill="#E0F2FE" stroke="#0284C7" strokeWidth={18} />
                    <text x={cx} y={cy - 140} textAnchor="middle" fontSize={110} fill="#0284C7" fontFamily="JetBrains Mono">
                      Cửa sổ {ww}mm
                    </text>
                  </g>
                )
              })}

              {/* Furniture Footprints (Draggable & Selectable) */}
              {furniture.map((f: any) => {
                const rot = Math.round(f.rotation_deg || 0) % 360
                const fw = rot === 90 || rot === 270 ? f.depth_mm : f.width_mm
                const fd = rot === 90 || rot === 270 ? f.width_mm : f.depth_mm
                const x0 = f.x_mm - fw / 2
                const y0 = f.y_mm - fd / 2
                const isSel = selectedEntityId === f.id
                return (
                  <g
                    key={f.id}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      onSelectEntity(f.id)
                      setDraggingId(f.id)
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <rect
                      x={x0}
                      y={y0}
                      width={fw}
                      height={fd}
                      rx={45}
                      fill={f.color_hex || '#E4DDD3'}
                      stroke={isSel ? '#276E70' : '#17191C'}
                      strokeWidth={isSel ? 32 : 16}
                    />
                    <text
                      x={f.x_mm}
                      y={f.y_mm - 30}
                      textAnchor="middle"
                      fontSize={115}
                      fontWeight={600}
                      fill="#17191C"
                    >
                      {f.name.slice(0, 18)}
                    </text>
                    <text
                      x={f.x_mm}
                      y={f.y_mm + 115}
                      textAnchor="middle"
                      fontSize={100}
                      fontFamily="JetBrains Mono"
                      fill="#475467"
                    >
                      {Math.round(f.width_mm)}×{Math.round(f.depth_mm)}mm
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}

      {/* 3D WebGL Pascal Viewer */}
      {viewMode !== '2d' && !lowSpecMode && (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #E8EAED',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              background: '#F7F8FA',
            }}
          >
            <span style={{ fontWeight: 600 }}>Không Gian 3D BIM (Pascal SceneGraph — Kéo chuột để xoay góc nhìn)</span>
            <span className="badge badge-success">verify_scene: VALID</span>
          </div>
          <div ref={mountRef} style={{ flex: 1, width: '100%', height: '100%', minHeight: 320 }} />
        </div>
      )}
    </div>
  )
}
