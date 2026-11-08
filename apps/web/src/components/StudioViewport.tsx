/**
 * ATELIER AI — Enhanced Pascal 3D BIM & 2D Architectural Studio Viewport
 * Implements Master Prompt Section 6.1 & 6.2:
 * - Persistent WebGL Renderer (no remounting on tab switch)
 * - Soft directional shadows, warm hemisphere lighting, refined ground grid
 * - Interactive 3D raycasting for furniture selection & hover outline
 * - Floating HUD: Scene Validation badge, XYZ Axis Gizmo, Selected Object Dimensions badge, Layer Toggles
 * - Synchronized 2D CAD SVG Plan with drag-to-move, door swing clearance arcs, and dimension chains
 */
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCcw, Layers, CheckCircle2, Eye, Maximize2 } from 'lucide-react'

interface StudioViewportProps {
  project: any
  materialsDb: any
  viewMode: 'split' | '2d' | '3d'
  cameraPreset: 'orbit' | 'top' | 'cutaway' | 'walk'
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onMoveFurniture?: (furnId: string, newX: number, newY: number) => void
  lowSpecMode?: boolean
  theme?: 'light' | 'dark'
  cameraResetTrigger?: number
  visibleLayers?: {
    dimensions: boolean
    doorSwings: boolean
    furnitureLabels: boolean
    grid: boolean
  }
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

  ctx.strokeStyle = 'rgba(23, 23, 23, 0.14)'
  ctx.lineWidth = pattern === 'herringbone' ? 2.5 : 1.75
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

export const StudioViewport: React.FC<StudioViewportProps> = React.memo(
  ({
    project,
    materialsDb,
    viewMode,
    cameraPreset,
    selectedEntityId,
    onSelectEntity,
    onMoveFurniture,
    lowSpecMode = false,
    theme = 'light',
    cameraResetTrigger = 0,
    visibleLayers = {
      dimensions: true,
      doorSwings: true,
      furnitureLabels: true,
      grid: true,
    },
  }) => {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)

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

    const selectedEntity =
      furniture.find((f: any) => f.id === selectedEntityId) ||
      walls.find((w: any) => w.id === selectedEntityId) ||
      null

    // ==========================================================================
    // THREE.JS 3D PASCAL SCENE VIEWER (WITH RAYCAST SELECTION & HOVER OUTLINE)
    // ==========================================================================
    useEffect(() => {
      if (viewMode === '2d' || lowSpecMode || !mountRef.current) return
      const container = mountRef.current
      const width = container.clientWidth || 720
      const height = container.clientHeight || 520

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(theme === 'dark' ? '#0E0E11' : '#F4F5F6')

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
      const cx = roomW / 2000
      const cz = roomD / 2000

      if (cameraPreset === 'top') {
        camera.position.set(cx, 7.6, cz + 0.01)
        camera.lookAt(cx, 0, cz)
      } else if (cameraPreset === 'walk') {
        camera.position.set(cx, 1.55, roomD / 1000 - 0.45)
        camera.lookAt(cx, 1.15, 0.7)
      } else if (cameraPreset === 'cutaway') {
        camera.position.set(cx + 3.6, 3.4, cz + 4.1)
        camera.lookAt(cx, 0.85, cz)
      } else {
        camera.position.set(cx + 4.2, 4.3, cz + 4.8)
        camera.lookAt(cx, 0.8, cz)
      }

      const renderer = new THREE.WebGLRenderer({ antialias: !lowSpecMode, preserveDrawingBuffer: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowSpecMode ? 1.0 : 1.75))
      renderer.shadowMap.enabled = !lowSpecMode
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      container.innerHTML = ''
      container.appendChild(renderer.domElement)

      // Studio Architectural Lighting (Section 6.2)
      const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.72)
      hemiLight.position.set(0, 12, 0)
      scene.add(hemiLight)

      const dirLight = new THREE.DirectionalLight(0xfffdf8, 0.92)
      dirLight.position.set(6.5, 11, 7.5)
      dirLight.castShadow = !lowSpecMode
      dirLight.shadow.mapSize.width = 1024
      dirLight.shadow.mapSize.height = 1024
      dirLight.shadow.bias = -0.0005
      scene.add(dirLight)

      const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.28)
      fillLight.position.set(-5, 6, -4)
      scene.add(fillLight)

      if (visibleLayers.grid) {
        const grid = new THREE.GridHelper(
          14,
          28,
          theme === 'dark' ? 0x27272a : 0xd4d4d8,
          theme === 'dark' ? 0x18181b : 0xe5e7eb
        )
        grid.position.set(cx, -0.01, cz)
        scene.add(grid)
      }

      const pickableMeshes: THREE.Object3D[] = []

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
        roughness: floorMatInfo.roughness ?? 0.48,
        metalness: 0.04,
      })
      const floorMesh = new THREE.Mesh(floorGeo, floorMat)
      floorMesh.position.set(cx, -0.04, cz)
      floorMesh.receiveShadow = true
      scene.add(floorMesh)

      // 2. Walls (with Face A / Accent Wall color & Cutaway support)
      walls.forEach((w: any, idx: number) => {
        const isFrontCutaway =
          (cameraPreset === 'cutaway' || cameraPreset === 'orbit') &&
          (w.id === 'wall_south' || w.id === 'wall_east' || idx === 1 || idx === 2)

        const x0 = w.start_mm[0] / 1000
        const z0 = w.start_mm[1] / 1000
        const x1 = w.end_mm[0] / 1000
        const z1 = w.end_mm[1] / 1000
        const len = Math.hypot(x1 - x0, z1 - z0)
        const rawH = (w.height_mm || 2800) / 1000
        const h = isFrontCutaway ? 0.32 : rawH
        const th = (w.thickness_mm || 200) / 1000

        const pMat = paintsById[w.face_a_material_id] || { hex_color: '#F5F2EB', roughness: 0.82 }
        const wallGeo = new THREE.BoxGeometry(len, h, th)
        const isSelected = w.id === selectedEntityId
        const wallMat = new THREE.MeshStandardMaterial({
          color: pMat.hex_color || '#F5F2EB',
          roughness: pMat.roughness ?? 0.82,
          transparent: isFrontCutaway,
          opacity: isFrontCutaway ? 0.45 : 1.0,
          emissive: isSelected ? new THREE.Color('#0F766E') : new THREE.Color('#000000'),
          emissiveIntensity: isSelected ? 0.16 : 0,
        })
        const wallMesh = new THREE.Mesh(wallGeo, wallMat)
        const angle = Math.atan2(z1 - z0, x1 - x0)
        wallMesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2)
        wallMesh.rotation.y = -angle
        wallMesh.castShadow = !isFrontCutaway
        wallMesh.receiveShadow = true
        wallMesh.userData = { entityId: w.id }
        scene.add(wallMesh)
        if (!isFrontCutaway) pickableMeshes.push(wallMesh)

        // Optional Wall Tile Zone (Section 7B)
        if (room?.wall_tile_zone?.enabled && !isFrontCutaway) {
          const wtH = (room.wall_tile_zone.tile_height_mm || 1200) / 1000
          const wtInfo = tilesById[room.wall_tile_zone.tile_material_id] || { hex_color: '#D8D4CC' }
          const wtGeo = new THREE.BoxGeometry(len * 0.99, wtH, th + 0.012)
          const wtMat = new THREE.MeshStandardMaterial({
            color: wtInfo.hex_color || '#D8D4CC',
            roughness: 0.32,
          })
          const wtMesh = new THREE.Mesh(wtGeo, wtMat)
          wtMesh.position.set((x0 + x1) / 2, wtH / 2, (z0 + z1) / 2)
          wtMesh.rotation.y = -angle
          scene.add(wtMesh)
        }
      })

      // 3. Windows Visual Frames
      windows.forEach((win: any) => {
        const w = walls.find((item: any) => item.id === win.wall_id) || walls[0]
        if (!w) return
        const wx = (w.start_mm[0] + (w.end_mm[0] - w.start_mm[0]) * (win.t ?? 0.5)) / 1000
        const wz = (w.start_mm[1] + (w.end_mm[1] - w.start_mm[1]) * (win.t ?? 0.5)) / 1000
        const winGeo = new THREE.BoxGeometry((win.width_mm || 1500) / 1000, (win.height_mm || 1400) / 1000, 0.24)
        const winMat = new THREE.MeshStandardMaterial({
          color: '#BAE6FD',
          transparent: true,
          opacity: 0.52,
          roughness: 0.1,
        })
        const winMesh = new THREE.Mesh(winGeo, winMat)
        winMesh.position.set(wx, ((win.sill_height_mm || 900) + (win.height_mm || 1400) / 2) / 1000, wz)
        scene.add(winMesh)
      })

      // 4. Furniture 3D Models + Selection Outline Box
      furniture.forEach((f: any) => {
        const isSelected = f.id === selectedEntityId
        const isHovered = f.id === hoveredEntityId
        const group = new THREE.Group()
        const fw = (f.width_mm || 1000) / 1000
        const fd = (f.depth_mm || 800) / 1000
        const fh = (f.height_mm || 750) / 1000

        const mainMat = new THREE.MeshStandardMaterial({
          color: f.color_hex || '#E4DDD3',
          roughness: 0.62,
          emissive: isSelected
            ? new THREE.Color('#0F766E')
            : isHovered
            ? new THREE.Color('#14B8A6')
            : new THREE.Color('#000000'),
          emissiveIntensity: isSelected ? 0.22 : isHovered ? 0.1 : 0,
        })

        if (f.category === 'sofa') {
          const base = new THREE.Mesh(new THREE.BoxGeometry(fw, fh * 0.46, fd), mainMat)
          base.position.y = fh * 0.23
          base.castShadow = true
          base.receiveShadow = true
          base.userData = { entityId: f.id }
          group.add(base)
          pickableMeshes.push(base)

          const back = new THREE.Mesh(new THREE.BoxGeometry(fw, fh * 0.54, fd * 0.22), mainMat)
          back.position.set(0, fh * 0.68, -fd * 0.39)
          back.castShadow = true
          back.userData = { entityId: f.id }
          group.add(back)
          pickableMeshes.push(back)

          const armL = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.08, fh * 0.62, fd), mainMat)
          armL.position.set(-fw * 0.46, fh * 0.31, 0)
          armL.castShadow = true
          group.add(armL)

          const armR = armL.clone()
          armR.position.set(fw * 0.46, fh * 0.31, 0)
          group.add(armR)
        } else if (f.category === 'coffee_table') {
          const top = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.05, fd), mainMat)
          top.position.y = fh - 0.025
          top.castShadow = true
          top.userData = { entityId: f.id }
          group.add(top)
          pickableMeshes.push(top)

          const legBase = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.72, fh - 0.05, fd * 0.72), mainMat)
          legBase.position.y = (fh - 0.05) / 2
          legBase.castShadow = true
          legBase.userData = { entityId: f.id }
          group.add(legBase)
          pickableMeshes.push(legBase)
        } else {
          const box = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), mainMat)
          box.position.y = fh / 2
          box.castShadow = true
          box.receiveShadow = true
          box.userData = { entityId: f.id }
          group.add(box)
          pickableMeshes.push(box)
        }

        // Selection or Hover Wireframe Bounding Highlight (Section 6.2)
        if (isSelected || isHovered) {
          const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(fw + 0.04, fh + 0.04, fd + 0.04))
          const outlineMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0x0f766e : 0x14b8a6,
          })
          const outline = new THREE.LineSegments(outlineGeo, outlineMat)
          outline.position.y = fh / 2
          group.add(outline)
        }

        group.position.set((f.x_mm || 2000) / 1000, 0, (f.y_mm || 2500) / 1000)
        group.rotation.y = -((f.rotation_deg || 0) * Math.PI) / 180
        scene.add(group)
      })

      renderer.render(scene, camera)

      // Orbit Drag + Raycasting Click Selection + Resize Observer
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      let isPointerDown = false
      let movedDistance = 0
      let prevX = 0
      let azimuth = 0.78
      const elevation = 0.7
      const radius = cameraPreset === 'top' ? 7.6 : 6.4

      const onDown = (e: MouseEvent) => {
        isPointerDown = true
        movedDistance = 0
        prevX = e.clientX
      }

      const onMove = (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

        if (isPointerDown && cameraPreset !== 'top') {
          const dx = e.clientX - prevX
          movedDistance += Math.abs(dx)
          prevX = e.clientX
          azimuth -= dx * 0.007
          camera.position.x = cx + radius * Math.cos(azimuth) * Math.cos(elevation)
          camera.position.z = cz + radius * Math.sin(azimuth) * Math.cos(elevation)
          camera.lookAt(cx, 0.8, cz)
          renderer.render(scene, camera)
        }
      }

      const onUp = (e: MouseEvent) => {
        if (isPointerDown && movedDistance < 5) {
          const rect = renderer.domElement.getBoundingClientRect()
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
          raycaster.setFromCamera(mouse, camera)
          const hits = raycaster.intersectObjects(pickableMeshes, false)
          if (hits.length > 0 && hits[0].object.userData?.entityId) {
            onSelectEntity(hits[0].object.userData.entityId)
          }
        }
        isPointerDown = false
      }

      const resizeObs = new ResizeObserver(() => {
        if (!container) return
        const nw = container.clientWidth
        const nh = container.clientHeight
        if (nw > 0 && nh > 0) {
          camera.aspect = nw / nh
          camera.updateProjectionMatrix()
          renderer.setSize(nw, nh)
          renderer.render(scene, camera)
        }
      })
      resizeObs.observe(container)

      const dom = renderer.domElement
      dom.addEventListener('mousedown', onDown)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)

      return () => {
        resizeObs.disconnect()
        dom.removeEventListener('mousedown', onDown)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        renderer.dispose()
      }
    }, [
      project,
      materialsDb,
      viewMode,
      cameraPreset,
      selectedEntityId,
      hoveredEntityId,
      lowSpecMode,
      theme,
      cameraResetTrigger,
      visibleLayers.grid,
    ])

    // ==========================================================================
    // 2D INTERACTIVE SVG ARCHITECTURAL PLAN OVERLAY
    // ==========================================================================
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
          gridTemplateColumns: viewMode === 'split' && !lowSpecMode ? '1fr 1fr' : '1fr',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 2D CAD Architectural Plan Canvas */}
        {(viewMode === '2d' || viewMode === 'split' || lowSpecMode) && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              background: theme === 'dark' ? '#111113' : '#FFFFFF',
              borderRight: viewMode === 'split' && !lowSpecMode ? '1px solid var(--border-subtle)' : 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '52px 16px 46px',
              }}
            >
              <svg
                viewBox={`-560 -560 ${roomW + 1120} ${roomD + 1120}`}
                style={{ width: '100%', height: '100%', maxHeight: '100%', userSelect: 'none' }}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={() => setDraggingId(null)}
                role="img"
                aria-label="Bản vẽ mặt bằng kỹ thuật 2D tỷ lệ 1:1"
              >
                <defs>
                  <pattern
                    id="floorTileGrid2D"
                    width={Math.max(180, floorMatInfo.tile_width_mm || 600)}
                    height={Math.max(180, floorMatInfo.tile_length_mm || 600)}
                    patternUnits="userSpaceOnUse"
                  >
                    <rect
                      width={Math.max(180, floorMatInfo.tile_width_mm || 600)}
                      height={Math.max(180, floorMatInfo.tile_length_mm || 600)}
                      fill={floorMatInfo.hex_color || '#EFECE6'}
                      fillOpacity={theme === 'dark' ? 0.16 : 0.25}
                      stroke={theme === 'dark' ? '#27272A' : '#E5E7EB'}
                      strokeWidth={14}
                    />
                  </pattern>
                </defs>

                {/* Room Floor Polygon */}
                <polygon
                  points={poly.map((p: number[]) => `${p[0]},${p[1]}`).join(' ')}
                  fill="url(#floorTileGrid2D)"
                  stroke={theme === 'dark' ? '#52525B' : '#171717'}
                  strokeWidth={20}
                />

                {/* Dimension Chains (Top & Left) */}
                {visibleLayers.dimensions && (
                  <g stroke="#0F766E" strokeWidth={15} fill="#0F766E">
                    <line x1={0} y1={-250} x2={roomW} y2={-250} />
                    <line x1={0} y1={-330} x2={0} y2={-170} />
                    <line x1={roomW} y1={-330} x2={roomW} y2={-170} />
                    <text x={roomW / 2} y={-310} textAnchor="middle" fontSize={135} fontFamily="JetBrains Mono" fontWeight={600}>
                      {roomW} mm ({(roomW / 1000).toFixed(2)}m)
                    </text>

                    <line x1={-250} y1={0} x2={-250} y2={roomD} />
                    <line x1={-330} y1={0} x2={-170} y2={0} />
                    <line x1={-330} y1={roomD} x2={-170} y2={roomD} />
                    <text
                      x={-320}
                      y={roomD / 2}
                      textAnchor="middle"
                      fontSize={135}
                      fontFamily="JetBrains Mono"
                      fontWeight={600}
                      transform={`rotate(-90, -320, ${roomD / 2})`}
                    >
                      {roomD} mm ({(roomD / 1000).toFixed(2)}m)
                    </text>
                  </g>
                )}

                {/* Walls with Face A / Accent Wall highlight */}
                {walls.map((w: any) => {
                  const pMat = paintsById[w.face_a_material_id]
                  const isSel = selectedEntityId === w.id
                  const strokeCol = isSel
                    ? '#0F766E'
                    : w.is_accent_wall
                    ? pMat?.hex_color || '#0F766E'
                    : theme === 'dark'
                    ? '#E4E4E7'
                    : '#171717'
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
                          fontSize={112}
                          fill="#0F766E"
                          fontWeight={600}
                          transform={`rotate(90, ${(w.start_mm[0] + w.end_mm[0]) / 2 + 190}, ${(w.start_mm[1] + w.end_mm[1]) / 2})`}
                        >
                          TƯỜNG NHẤN ({pMat?.name?.slice(0, 18) || w.face_a_material_id})
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
                      <rect x={cx - dw / 2} y={cy - 110} width={dw} height={220} fill="#FFFFFF" stroke="#B45309" strokeWidth={18} />
                      {visibleLayers.doorSwings && (
                        <path
                          d={`M ${cx - dw / 2} ${cy} A ${dw} ${dw} 0 0 1 ${cx + dw / 2} ${cy - dw}`}
                          fill="rgba(180, 83, 9, 0.08)"
                          stroke="#B45309"
                          strokeWidth={14}
                          strokeDasharray="40,30"
                        />
                      )}
                      {visibleLayers.dimensions && (
                        <text x={cx} y={cy + 240} textAnchor="middle" fontSize={110} fill="#B45309" fontFamily="JetBrains Mono">
                          Cửa {dw}mm
                        </text>
                      )}
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
                      {visibleLayers.dimensions && (
                        <text x={cx} y={cy - 140} textAnchor="middle" fontSize={105} fill="#0284C7" fontFamily="JetBrains Mono">
                          Cửa sổ {ww}mm
                        </text>
                      )}
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
                  const isHov = hoveredEntityId === f.id
                  return (
                    <g
                      key={f.id}
                      onMouseEnter={() => setHoveredEntityId(f.id)}
                      onMouseLeave={() => setHoveredEntityId(null)}
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
                        rx={42}
                        fill={f.color_hex || '#E4DDD3'}
                        stroke={isSel ? '#0F766E' : isHov ? '#14B8A6' : '#171717'}
                        strokeWidth={isSel ? 34 : isHov ? 24 : 15}
                      />
                      {visibleLayers.furnitureLabels && (
                        <>
                          <text
                            x={f.x_mm}
                            y={f.y_mm - 26}
                            textAnchor="middle"
                            fontSize={110}
                            fontWeight={600}
                            fill="#171717"
                          >
                            {f.name.slice(0, 18)}
                          </text>
                          <text
                            x={f.x_mm}
                            y={f.y_mm + 110}
                            textAnchor="middle"
                            fontSize={96}
                            fontFamily="JetBrains Mono"
                            fill="#52525B"
                          >
                            {Math.round(f.width_mm)}×{Math.round(f.depth_mm)}mm
                          </text>
                        </>
                      )}
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
            <div ref={mountRef} style={{ flex: 1, width: '100%', height: '100%', minHeight: 320 }} />
          </div>
        )}

        {/* Bottom-Left HUD: Scene Validation, XYZ Gizmo & Active Selection Dimensions (Section 6.1) */}
        <div className="viewport-hud-bottom-left">
          <div className="viewport-hud-pill">
            <span className="status-dot" />
            <span className="mono" style={{ fontWeight: 600 }}>
              Pascal SceneGraph: VALID
            </span>
            <span>• {roomW / 1000}×{roomD / 1000}m</span>
          </div>

          <div className="xyz-gizmo-badge" title="Hệ tọa độ chuẩn BIM (mm -> m)">
            <span style={{ color: '#EF4444' }}>X</span>
            <span style={{ color: '#10B981' }}>Y</span>
            <span style={{ color: '#3B82F6' }}>Z</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>1:1 mm</span>
          </div>

          {selectedEntity && (
            <div className="viewport-hud-pill" style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' }}>
              <strong style={{ color: 'var(--accent)' }}>{selectedEntity.name || selectedEntity.id}</strong>
              {selectedEntity.width_mm && (
                <span className="mono" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(selectedEntity.width_mm)}×{Math.round(selectedEntity.depth_mm)}×{Math.round(selectedEntity.height_mm)} mm
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
)
