/**
 * ATELIER AI — Enhanced Pascal 3D BIM & 2D Architectural Studio Viewport
 * Implements Master Prompt Section 6.1 & 6.2 + G3 Viewer Completion:
 * - Persistent WebGL Renderer (no remounting on tab switch)
 * - Licensed CC0 HDRI Environment (/api/v1/assets/hdri/photo_studio_loft_hall_1k.hdr) via RGBELoader
 * - SSAO Post-Processing (EffectComposer + SSAOPass + OutputPass) & Contact AO grounding
 * - Ceiling Slab visibility toggle (data-testid="toggle-ceiling-btn")
 * - Soft directional shadows, warm hemisphere lighting, refined ground grid
 * - Interactive 3D raycasting for furniture selection & hover outline
 * - Floating HUD: Scene Validation badge, HDRI/SSAO/Ceiling controls, XYZ Axis Gizmo, Selected Object Dimensions badge
 * - Synchronized 2D CAD SVG Plan with drag-to-move, door swing clearance arcs, and dimension chains
 */
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createStudioCameraController, type StudioCameraMode } from './studioCamera'
import { usePlanCamera, type PlanBounds } from './usePlanCamera'
import {
  applyMaterialOverrideToObject,
  disposeOwnedMaterials,
  type MaterialDefinitionValue,
} from './materialResolver'
import { createProceduralFurniture } from './proceduralFurniture'
import {
  applyWalkCycle,
  createDeliveryWorker,
  findChangedFurniture,
  resolveDeliveryEntry,
  snapshotFurniture,
  type DeliverySnapshot,
} from './furnitureDeliveryAnimation'
import { attachConstructionPlayback, buildConstructionItems, constructionKey, commandEvent } from './constructionHistory'
import { Eye, Sparkles, Layers } from 'lucide-react'
import { attachFirstPersonTour, type TourState } from './firstPersonTour'
import { TourControls } from './TourControls'

interface StudioViewportProps {
  project: any
  materialsDb: any
  pbrMaterials?: MaterialDefinitionValue[]
  viewMode: 'split' | '2d' | '3d'
  cameraPreset: 'orbit' | 'top' | 'cutaway' | 'walk'
  onCameraPresetChange?: (preset: 'orbit' | 'top' | 'cutaway' | 'walk') => void
  lightingPreset?: 'day' | 'sunset' | 'night'
  selectedEntityId: string | null
  onSelectEntity: (id: string | null) => void
  onMoveFurniture?: (furnId: string, newX: number, newY: number) => void
  lowSpecMode?: boolean
  theme?: 'light' | 'dark'
  cameraResetTrigger?: number
  deliveryReplayTrigger?: number
  cameraCommand?: { id: number; type: 'fit' | 'focus' | 'reset' }
  cutawayEnabled?: boolean
  onExternalSceneObjects?: (objects: Array<{
    id: string
    name: string
    parentName: string
    dimensionsMm: [number, number, number]
  }>) => void
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
  pattern: string,
  groutWidthMm = 3,
  groutColor = '#B8B1A6',
  rotationDeg = 0,
  originMm: number[] = [0, 0]
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = groutColor
  ctx.fillRect(0, 0, 256, 256)
  const groutPx = Math.max(0.5, Math.min(24, (groutWidthMm / Math.max(1, tileWidthMm)) * 256))
  ctx.fillStyle = hexColor || '#C8A986'
  ctx.fillRect(groutPx / 2, groutPx / 2, 256 - groutPx, 256 - groutPx)
  ctx.strokeStyle = 'rgba(23, 23, 23, 0.1)'
  ctx.lineWidth = 1
  ctx.strokeRect(groutPx / 2, groutPx / 2, 256 - groutPx, 256 - groutPx)
  if (pattern === 'brick') {
    ctx.beginPath()
    ctx.moveTo(0, 128)
    ctx.lineTo(256, 128)
    ctx.moveTo(128, 128)
    ctx.lineTo(128, 256)
    ctx.strokeStyle = groutColor
    ctx.lineWidth = groutPx
    ctx.stroke()
  }
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
  tex.center.set(0.5, 0.5)
  tex.rotation = (rotationDeg * Math.PI) / 180
  tex.offset.set(originMm[0] / Math.max(1, tileWidthMm), originMm[1] / Math.max(1, tileLengthMm))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.userData = { tileWidthMm, tileLengthMm, groutWidthMm, groutColor, pattern, worldScaled: true }
  return tex
}

export const StudioViewport: React.FC<StudioViewportProps> = React.memo(
  ({
    project,
    materialsDb,
    pbrMaterials = [],
    viewMode,
    cameraPreset,
    onCameraPresetChange,
    lightingPreset = 'day',
    selectedEntityId,
    onSelectEntity,
    onMoveFurniture,
    lowSpecMode = false,
    theme = 'light',
    cameraResetTrigger = 0,
    deliveryReplayTrigger = 0,
    cameraCommand,
    cutawayEnabled = false,
    onExternalSceneObjects,
    visibleLayers = {
      dimensions: true,
      doorSwings: true,
      furnitureLabels: true,
      grid: true,
    },
  }) => {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const cameraControllerRef = useRef<ReturnType<typeof createStudioCameraController> | null>(null)
    const tourRef = useRef<ReturnType<typeof attachFirstPersonTour> | null>(null)
    const [tourState, setTourState] = useState<TourState>({mode:'inactive',floorId:1,floors:[],message:''})
    const cutawayWallsRef = useRef<Array<{ mesh: THREE.Mesh; fullHeight: number; baseHeight: number; cutaway: boolean }>>([])
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)
    const [ceilingVisible, setCeilingVisible] = useState<boolean>(false)
    const [ssaoEnabled, setSsaoEnabled] = useState<boolean>(true)
    const [hdriLoaded, setHdriLoaded] = useState<boolean>(false)
    const [splitPercent, setSplitPercent] = useState(50)
    const externalPlaybackCleanupRef = useRef<(() => void) | null>(null)
    const deliveryPausedRef = useRef(false)
    const lastHandledDeliveryTriggerRef = useRef(0)
    const [deliveryPaused, setDeliveryPaused] = useState(false)
    const [deliveryStatus, setDeliveryStatus] = useState<{
      active: boolean
      phase: 'idle' | 'moving' | 'placing' | 'returning' | 'complete'
      progress: number
      itemName: string
    }>({ active: false, phase: 'idle', progress: 0, itemName: '' })

    const paintsById: Record<string, any> = {}
    const tilesById: Record<string, any> = {}
    ;(materialsDb?.paints || []).forEach((p: any) => {
      paintsById[p.id] = p
    })
    ;(materialsDb?.tiles_and_flooring || []).forEach((t: any) => {
      tilesById[t.id] = t
    })

    const room = project?.rooms?.[0]
    const externalScene = project?.external_scene || null
    const hasExternalScene = Boolean(externalScene?.file_url)
    const walls = project?.walls || []
    const doors = project?.openings || []
    const windows = project?.windows || []
    const furniture = project?.furniture_instances || []
    const sceneSignature = JSON.stringify([project?.project_id, project?.external_scene, project?.rooms, project?.walls, project?.openings, project?.windows, project?.furniture_instances])

    const poly = room?.polygon_mm || [
      [0, 0],
      [4000, 0],
      [4000, 5000],
      [0, 5000],
    ]
    const geometryPoints = [
      ...poly,
      ...walls.flatMap((wall: any) => [wall.start_mm, wall.end_mm]),
    ].filter((point: any) => Array.isArray(point) && point.length >= 2)
    const geometryMinX = Math.min(...geometryPoints.map((point: number[]) => point[0]))
    const geometryMinY = Math.min(...geometryPoints.map((point: number[]) => point[1]))
    const geometryMaxX = Math.max(...geometryPoints.map((point: number[]) => point[0]))
    const geometryMaxY = Math.max(...geometryPoints.map((point: number[]) => point[1]))
    const roomMinX = Math.min(...poly.map((point: number[]) => point[0]))
    const roomMinY = Math.min(...poly.map((point: number[]) => point[1]))
    const roomMaxX = Math.max(...poly.map((point: number[]) => point[0]))
    const roomMaxY = Math.max(...poly.map((point: number[]) => point[1]))
    const roomW = Math.max(1, roomMaxX - roomMinX) || 4000
    const roomD = Math.max(1, roomMaxY - roomMinY) || 5000
    const planBounds: PlanBounds = {
      minX: geometryMinX - 560,
      minY: geometryMinY - 560,
      maxX: geometryMaxX + 560,
      maxY: geometryMaxY + 560,
    }
    const planCamera = usePlanCamera(planBounds, String(project?.project_id || project?.id || 'project'))
    const roomHeightMm = room?.ceiling_height_mm || walls[0]?.height_mm || 2800

    // Resolve floor material: check surface_material_overrides.floor (G4 PBR Tile) first, then Section 7B tilesById
    const floorOverride = project?.surface_material_overrides?.floor
    const floorPbrDef = floorOverride
      ? pbrMaterials.find((m) => m.material_id === floorOverride.material_id)
      : null

    const floorMatInfo = floorPbrDef
      ? {
          id: floorPbrDef.material_id,
          name: floorPbrDef.name,
          hex_color: floorOverride?.tint || floorPbrDef.tint || floorPbrDef.pbr?.base_color || '#DFD6C7',
          tile_width_mm:
            floorOverride?.texture_scale?.width_mm ||
            floorOverride?.uv_transform?.tile_size_mm?.[0] ||
            floorPbrDef.uv?.tile_size_mm?.[0] ||
            800,
          tile_length_mm:
            floorOverride?.texture_scale?.height_mm ||
            floorOverride?.uv_transform?.tile_size_mm?.[1] ||
            floorPbrDef.uv?.tile_size_mm?.[1] ||
            800,
          grout_width_mm:
            floorOverride?.texture_scale?.grout_width_mm ??
            floorOverride?.uv_transform?.grout_thickness_mm ??
            floorPbrDef.uv?.grout_thickness_mm ??
            3,
          grout_color:
            floorOverride?.texture_scale?.grout_color_hex ||
            floorOverride?.uv_transform?.grout_color ||
            floorPbrDef.uv?.grout_color ||
            '#B8B1A6',
          layout_pattern: floorPbrDef.uv?.pattern || 'straight',
          roughness: floorOverride?.pbr?.roughness ?? floorPbrDef.pbr?.roughness ?? 0.36,
          rotation_deg:
            floorOverride?.texture_scale?.rotation_deg ??
            floorOverride?.uv_transform?.rotation_deg ??
            0,
          texture_origin_mm: floorOverride?.uv_transform?.offset_mm || [0, 0],
        }
      : tilesById[room?.floor_material_id] || {
          hex_color: '#C8A986',
          tile_width_mm: 190,
          tile_length_mm: 1200,
          grout_width_mm: 2,
          grout_color: '#B8B1A6',
          layout_pattern: 'straight',
          name: 'Sàn gỗ sồi',
          roughness: 0.48,
        }

    const selectedEntity =
      furniture.find((f: any) => f.id === selectedEntityId) ||
      walls.find((w: any) => w.id === selectedEntityId) ||
      null

    // ==========================================================================
    // THREE.JS 3D PASCAL SCENE VIEWER (WITH HDRI, SSAO, CEILING & RAYCASTING)
    // ==========================================================================
    useEffect(() => {
      if (lowSpecMode || !mountRef.current) return
      const shouldReplayDelivery = deliveryReplayTrigger > lastHandledDeliveryTriggerRef.current
      if (shouldReplayDelivery) lastHandledDeliveryTriggerRef.current = deliveryReplayTrigger
      const container = mountRef.current
      const width = container.clientWidth || 720
      const height = container.clientHeight || 520

      const scene = new THREE.Scene()
      const backgroundByPreset = {
        day: theme === 'dark' ? '#15171A' : '#E9EEF1',
        sunset: '#4A332F',
        night: '#0B1020',
      }
      scene.background = new THREE.Color(backgroundByPreset[lightingPreset])

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
      const cx = (roomMinX + roomMaxX) / 2000
      const cz = (roomMinY + roomMaxY) / 2000
      camera.position.set(cx + Math.max(4.2, roomW / 1050), 4.3, cz + Math.max(4.8, roomD / 1050))
      camera.lookAt(cx, 0.8, cz)

      const renderer = new THREE.WebGLRenderer({ antialias: !lowSpecMode, preserveDrawingBuffer: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowSpecMode ? 1.0 : 1.75))
      renderer.shadowMap.enabled = !lowSpecMode
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = lightingPreset === 'day' ? 1.08 : lightingPreset === 'sunset' ? 0.92 : 0.65
      container.innerHTML = ''
      container.appendChild(renderer.domElement)

      // Post-processing Composer with SSAOPass + OutputPass
      let composer: EffectComposer | null = null
      let ssaoPass: SSAOPass | null = null
      if (!lowSpecMode) {
        try {
          composer = new EffectComposer(renderer)
          const renderPass = new RenderPass(scene, camera)
          composer.addPass(renderPass)
          ssaoPass = new SSAOPass(scene, camera, width, height)
          ssaoPass.kernelRadius = 0.28
          ssaoPass.minDistance = 0.001
          ssaoPass.maxDistance = 0.08
          ssaoPass.enabled = ssaoEnabled
          composer.addPass(ssaoPass)
          const outputPass = new OutputPass()
          composer.addPass(outputPass)
        } catch (err) {
          console.warn('SSAOPass fallback to direct WebGL render:', err)
          composer = null
        }
      }

      const renderScene = () => {
        if (disposed) return
        if (composer && ssaoEnabled) {
          composer.render()
        } else {
          renderer.render(scene, camera)
        }
        const viewerState = ((window as any).__ATELIER_VIEWER_STATE__ ||= {})
        viewerState.lightingPreset = lightingPreset
        viewerState.cameraPreset = cameraPreset
        viewerState.ceilingVisible = ceilingVisible
        viewerState.showCeiling = ceilingVisible
        viewerState.ssaoEnabled = ssaoEnabled
        viewerState.ssaoPassActive = Boolean(composer && ssaoPass && ssaoEnabled)
        viewerState.floorTileSizeMm = [floorMatInfo.tile_width_mm, floorMatInfo.tile_length_mm]
        viewerState.floorGroutMm = floorMatInfo.grout_width_mm ?? 3
        viewerState.floorMaterialId = floorMatInfo.id || room?.floor_material_id
        const activeTarget = cameraControllerRef.current?.controls.target
        viewerState.cameraFraming = {
          position: [
            Number(camera.position.x.toFixed(3)),
            Number(camera.position.y.toFixed(3)),
            Number(camera.position.z.toFixed(3)),
          ],
          target: activeTarget
            ? [
                Number(activeTarget.x.toFixed(3)),
                Number(activeTarget.y.toFixed(3)),
                Number(activeTarget.z.toFixed(3)),
              ]
            : [Number(cx.toFixed(3)), 0.85, Number(cz.toFixed(3))],
          verticalFovDeg: Number(camera.fov.toFixed(2)),
          aspectRatio: Number(camera.aspect.toFixed(4)),
          nearM: Number(camera.near.toFixed(4)),
          farM: Number(camera.far.toFixed(2)),
          roomExtentM: [roomW / 1000, roomD / 1000, roomHeightMm / 1000],
        }
      }

      // Initialize fallback RoomEnvironment first, then load licensed Poly Haven CC0 1K HDRI
      const pmremGenerator = new THREE.PMREMGenerator(renderer)
      pmremGenerator.compileEquirectangularShader()
      let environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04)
      scene.environment = environmentTarget.texture

      let disposed = false
      const hdriUrl = '/api/v1/assets/hdri/photo_studio_loft_hall_1k.hdr'
      const rgbeLoader = new RGBELoader()
      rgbeLoader.load(
        hdriUrl,
        (hdrTexture) => {
          if (disposed) {
            hdrTexture.dispose()
            return
          }
          hdrTexture.mapping = THREE.EquirectangularReflectionMapping
          const hdrEnvTarget = pmremGenerator.fromEquirectangular(hdrTexture)
          environmentTarget.dispose()
          environmentTarget = hdrEnvTarget
          scene.environment = hdrEnvTarget.texture
          ;(scene as any).environmentIntensity =
            lightingPreset === 'day' ? 0.95 : lightingPreset === 'sunset' ? 0.62 : 0.22
          hdrTexture.dispose()
          setHdriLoaded(true)
          const viewerState = ((window as any).__ATELIER_VIEWER_STATE__ ||= {})
          viewerState.hdriLoaded = true
          viewerState.hdriUrl = hdriUrl
          viewerState.hdriLicense = 'CC0-1.0 (Poly Haven photo_studio_loft_hall_1k)'
          renderScene()
        },
        undefined,
        (err) => {
          console.warn('HDRI load fallback to RoomEnvironment:', err)
        }
      )

      // Studio Architectural Lighting (Section 6.2)
      const hemiIntensity = lightingPreset === 'day' ? 0.72 : lightingPreset === 'sunset' ? 0.42 : 0.18
      const hemiLight = new THREE.HemisphereLight(
        lightingPreset === 'sunset' ? 0xffd7b0 : 0xffffff,
        lightingPreset === 'night' ? 0x091126 : 0x6b625b,
        hemiIntensity
      )
      hemiLight.position.set(0, 12, 0)
      scene.add(hemiLight)

      const dirLight = new THREE.DirectionalLight(
        lightingPreset === 'sunset' ? 0xff9b63 : 0xfffdf8,
        lightingPreset === 'day' ? 1.05 : lightingPreset === 'sunset' ? 0.72 : 0.12
      )
      dirLight.position.set(6.5, 11, 7.5)
      dirLight.castShadow = !lowSpecMode
      dirLight.shadow.mapSize.width = 1024
      dirLight.shadow.mapSize.height = 1024
      dirLight.shadow.bias = -0.0005
      scene.add(dirLight)

      const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.28)
      fillLight.position.set(-5, 6, -4)
      scene.add(fillLight)

      if (lightingPreset === 'night') {
        const warmFixtures = [
          [(roomW * 0.3) / 1000, 2.45, (roomD * 0.3) / 1000],
          [(roomW * 0.7) / 1000, 2.45, (roomD * 0.65) / 1000],
        ]
        warmFixtures.forEach(([x, y, z]) => {
          const light = new THREE.PointLight(0xffd6a0, 16, 5, 2)
          light.position.set(x, y, z)
          light.castShadow = !lowSpecMode
          scene.add(light)
        })
      }

      if (visibleLayers.grid && !hasExternalScene) {
        const grid = new THREE.GridHelper(
          16,
          32,
          theme === 'dark' ? 0x27272a : 0xd4d4d8,
          theme === 'dark' ? 0x18181b : 0xe5e7eb
        )
        grid.position.set(cx, -0.01, cz)
        scene.add(grid)
      }

      const pickableMeshes: THREE.Object3D[] = []
      const gltfLoader = new GLTFLoader()
      const objectRoots = new Map<string, THREE.Object3D>()
      const furnitureGroups = new Map<string, THREE.Group>()
      const canonicalRoot = new THREE.Group()
      canonicalRoot.name = 'ATELIER_CANONICAL_SCENE'
      canonicalRoot.visible = !hasExternalScene
      scene.add(canonicalRoot)
      const materialDefinitions = new Map(pbrMaterials.map((material) => [material.material_id, material]))
      const initialMetrics = ((window as any).__ATELIER_MATERIAL_METRICS__ ||= {})
      initialMetrics.glbLoadCount = Number.isFinite(initialMetrics.glbLoadCount) ? initialMetrics.glbLoadCount : 0
      initialMetrics.materialApplyCount = Number.isFinite(initialMetrics.materialApplyCount)
        ? initialMetrics.materialApplyCount
        : 0
      initialMetrics.disposedMaterialCount = Number.isFinite(initialMetrics.disposedMaterialCount)
        ? initialMetrics.disposedMaterialCount
        : 0
      initialMetrics.meshUUIDs ||= {}

      // 1. Floor Slab with Section 7B / G4 Tile & Grout UV Scale
      const floorTex = createProceduralTileTexture(
        floorMatInfo.hex_color || '#C8A986',
        floorMatInfo.tile_width_mm || 600,
        floorMatInfo.tile_length_mm || 600,
        roomW,
        roomD,
        floorMatInfo.layout_pattern || 'straight',
        floorMatInfo.grout_width_mm ?? 3,
        floorMatInfo.grout_color || '#B8B1A6',
        floorMatInfo.rotation_deg || 0,
        floorMatInfo.texture_origin_mm || [0, 0]
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
      floorMesh.name = 'FLOOR_SLAB_MAIN'
      canonicalRoot.add(floorMesh)

      // 1B. Ceiling Slab with Downlights (G3 Ceiling Visibility Toggle)
      const ceilingGroup = new THREE.Group()
      ceilingGroup.name = 'CEILING_SLAB_GROUP'
      const ceilingH = roomHeightMm / 1000
      const ceilingGeo = new THREE.BoxGeometry(roomW / 1000, 0.06, roomD / 1000)
      const ceilingMat = new THREE.MeshStandardMaterial({
        color: '#FAF8F5',
        roughness: 0.88,
        metalness: 0.02,
      })
      const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat)
      ceilingMesh.position.set(cx, ceilingH + 0.03, cz)
      ceilingMesh.receiveShadow = true
      ceilingGroup.add(ceilingMesh)

      // Recessed LED downlight fixtures on ceiling
      ;[
        [roomW * 0.3 / 1000, ceilingH - 0.005, roomD * 0.32 / 1000],
        [roomW * 0.7 / 1000, ceilingH - 0.005, roomD * 0.32 / 1000],
        [roomW * 0.3 / 1000, ceilingH - 0.005, roomD * 0.68 / 1000],
        [roomW * 0.7 / 1000, ceilingH - 0.005, roomD * 0.68 / 1000],
      ].forEach(([lx, ly, lz], idx) => {
        const downlight = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.065, 0.015, 20),
          new THREE.MeshStandardMaterial({
            color: '#FFFBEB',
            emissive: new THREE.Color('#FDE68A'),
            emissiveIntensity: lightingPreset === 'night' ? 1.8 : 0.65,
          })
        )
        downlight.position.set(lx, ly, lz)
        downlight.name = `CEILING_DOWNLIGHT_${idx}`
        ceilingGroup.add(downlight)
      })
      ceilingGroup.visible = ceilingVisible
      canonicalRoot.add(ceilingGroup)

      // 2. Walls (with Face A / Accent Wall color & Cutaway support)
      cutawayWallsRef.current = []
      walls.forEach((w: any, idx: number) => {
        const isFrontCutaway =
          cutawayEnabled &&
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
        canonicalRoot.add(wallMesh)
        cutawayWallsRef.current.push({
          mesh: wallMesh,
          fullHeight: rawH,
          baseHeight: h,
          cutaway: w.id === 'wall_south' || w.id === 'wall_east' || idx === 1 || idx === 2,
        })
        if (!isFrontCutaway) pickableMeshes.push(wallMesh)

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
          canonicalRoot.add(wtMesh)
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
        canonicalRoot.add(winMesh)
      })

      // 4. Furniture 3D Models + Contact AO Grounding + Selection Outline Box
      furniture.forEach((f: any) => {
        const isSelected = f.id === selectedEntityId
        const isHovered = f.id === hoveredEntityId
        const group = new THREE.Group()
        const fw = (f.width_mm || 1000) / 1000
        const fd = (f.depth_mm || 800) / 1000
        const fh = (f.height_mm || 750) / 1000

        // Contact AO shadow plane under each furniture piece when SSAO/AO is enabled
        if (ssaoEnabled) {
          const aoPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(fw * 1.04, fd * 1.04),
            new THREE.MeshBasicMaterial({
              color: 0x09090b,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
            })
          )
          aoPlane.rotation.x = -Math.PI / 2
          aoPlane.position.y = 0.002
          group.add(aoPlane)
        }

        const assetUrl = f.normalized_glb || (f.asset_id ? `/api/v1/assets/${f.asset_id}/file` : null)
        if (assetUrl) {
          gltfLoader.load(
            assetUrl,
            (gltf) => {
              if (disposed) return
              const model = gltf.scene
              const sourceBounds = new THREE.Box3().setFromObject(model)
              const sourceSize = sourceBounds.getSize(new THREE.Vector3())
              if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) return

              // Product GLBs must keep their real-world proportions. Parametric assets
              // may stretch only on explicitly declared axes.
              const fitScale = Math.min(fw / sourceSize.x, fh / sourceSize.y, fd / sourceSize.z)
              const allowedAxes = new Set(f.parametric_axes || [])
              const sx = f.sizing_policy === 'PARAMETRIC' && allowedAxes.has('width') ? fw / sourceSize.x : fitScale
              const sy = f.sizing_policy === 'PARAMETRIC' && allowedAxes.has('height') ? fh / sourceSize.y : fitScale
              const sz = f.sizing_policy === 'PARAMETRIC' && allowedAxes.has('depth') ? fd / sourceSize.z : fitScale
              model.scale.set(sx, sy, sz)
              model.updateMatrixWorld(true)
              const normalizedBounds = new THREE.Box3().setFromObject(model)
              const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3())
              model.position.set(-normalizedCenter.x, -normalizedBounds.min.y, -normalizedCenter.z)
              model.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.castShadow = !lowSpecMode
                  mesh.receiveShadow = true
                  mesh.userData = { ...mesh.userData, entityId: f.id, assetId: f.asset_id }
                  pickableMeshes.push(mesh)
                }
              })
              group.add(model)
              objectRoots.set(f.id, model)
              Object.entries(f.material_overrides || {}).forEach(([slotId, override]: [string, any]) => {
                const slot = (f.material_slots || []).find((item: any) => item.slot_id === slotId)
                const definition = materialDefinitions.get(override.material_id)
                if (slot && definition) {
                  applyMaterialOverrideToObject(model, slot.source_material_name, definition, override)
                }
              })
              const metrics = ((window as any).__ATELIER_MATERIAL_METRICS__ ||= {})
              metrics.glbLoadCount = Number.isFinite(metrics.glbLoadCount) ? metrics.glbLoadCount + 1 : 1
              const viewerState = ((window as any).__ATELIER_VIEWER_STATE__ ||= {})
              viewerState.loadedGlbCount = metrics.glbLoadCount
              metrics.meshUUIDs ||= {}
              metrics.meshUUIDs[f.id] = []
              model.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) metrics.meshUUIDs[f.id].push(node.uuid)
              })
              renderScene()
            },
            undefined,
            (error) => {
              console.error(`Không thể tải GLB ${f.asset_id || f.id}`, error)
            }
          )
        } else {
          const preview = createProceduralFurniture({
            width: fw,
            depth: fd,
            height: fh,
            category: f.category,
            name: f.name,
            color: f.color_hex,
            entityId: f.id,
            lowSpecMode,
            pickableMeshes,
          })
          group.add(preview)
          objectRoots.set(f.id, preview)
        }

        if (isSelected || isHovered) {
          const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(fw + 0.04, fh + 0.04, fd + 0.04))
          const outlineMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0x0f766e : 0x14b8a6,
          })
          const outline = new THREE.LineSegments(outlineGeo, outlineMat)
          outline.position.y = fh / 2
          group.add(outline)
        }

        group.position.set((f.x_mm ?? 2000) / 1000, (f.z_mm ?? 0) / 1000, (f.y_mm ?? 2500) / 1000)
        group.rotation.y = -((f.rotation_deg || 0) * Math.PI) / 180
        furnitureGroups.set(f.id, group)
        canonicalRoot.add(group)
      })

      // A whole-scene GLB is authoritative: keep its hierarchy, transforms,
      // UVs and materials intact and hide all generated room/furniture meshes.
      // Only the configured root transform is applied, uniformly, for a
      // reproducible coordinate-system adjustment.
      if (hasExternalScene) {
        gltfLoader.load(
          externalScene.file_url,
          (gltf) => {
            if (disposed) return
            const sourceRoot = gltf.scene
            sourceRoot.name = externalScene.name || 'EXTERNAL_SOURCE_SCENE'
            const transform = externalScene.root_transform || {}
            const translation = transform.translation || [0, 0, 0]
            const rotation = transform.rotation_euler_deg || [0, 0, 0]
            const scale = transform.scale || [1, 1, 1]
            sourceRoot.position.set(translation[0] || 0, translation[1] || 0, translation[2] || 0)
            sourceRoot.rotation.set(
              THREE.MathUtils.degToRad(rotation[0] || 0),
              THREE.MathUtils.degToRad(rotation[1] || 0),
              THREE.MathUtils.degToRad(rotation[2] || 0),
            )
            sourceRoot.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1)
            sourceRoot.updateMatrixWorld(true)
            let meshIndex = 0
            const externalObjects: Array<{
              id: string
              name: string
              parentName: string
              dimensionsMm: [number, number, number]
            }> = []
            sourceRoot.traverse((node) => {
              if (!(node as THREE.Mesh).isMesh) return
              const mesh = node as THREE.Mesh
              const stableId = `glb:${meshIndex}:${mesh.name || 'mesh'}`
              meshIndex += 1
              mesh.userData = { ...mesh.userData, entityId: stableId, sourceSceneAssetId: externalScene.asset_id }
              mesh.castShadow = true
              mesh.receiveShadow = true
              pickableMeshes.push(mesh)
              objectRoots.set(stableId, mesh)
              const meshSize = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
              externalObjects.push({
                id: stableId,
                name: mesh.name || `Mesh ${meshIndex}`,
                parentName: mesh.parent?.name || '',
                dimensionsMm: [meshSize.x * 1000, meshSize.z * 1000, meshSize.y * 1000],
              })
              if (!hasExternalScene && stableId === selectedEntityId) {
                const highlight = new THREE.BoxHelper(mesh, 0x14b8a6)
                highlight.name = 'EXTERNAL_SCENE_SELECTION'
                sourceRoot.add(highlight)
              }
            })
            scene.add(sourceRoot)
            const sourceBounds = new THREE.Box3().setFromObject(sourceRoot)
            const sourceSize = sourceBounds.getSize(new THREE.Vector3())
            const viewerState = ((window as any).__ATELIER_VIEWER_STATE__ ||= {})
            viewerState.externalScene = {
              assetId: externalScene.asset_id,
              meshCount: meshIndex,
              boundsMin: sourceBounds.min.toArray(),
              boundsMax: sourceBounds.max.toArray(),
              boundsSize: sourceSize.toArray(),
              rootTransform: transform,
            }
            camera.near = Math.max(0.01, sourceSize.length() / 5000)
            camera.far = Math.max(100, sourceSize.length() * 20)
            camera.updateProjectionMatrix()
            cameraControllerRef.current?.fit(sourceBounds)

            const grouped = buildConstructionItems(sourceRoot, externalScene.sha256)
            for (const f of furniture) {
              const sourceGroup = furnitureGroups.get(f.id)
              if (!sourceGroup) continue
              sourceGroup.updateWorldMatrix(true, true)
              const bounds = new THREE.Box3().setFromObject(sourceGroup)
              const size = bounds.getSize(new THREE.Vector3())
              const upper = (f.z_mm || 0) / 1000 > 1.5
              const floorObject = sourceRoot.getObjectByName(upper ? 'Cube' : 'Plane')
              const meshes: THREE.Mesh[] = []
              sourceGroup.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh) })
              grouped.push({
                id: 'furniture:' + f.id, name: f.name || f.id, parentName: '',
                floor: upper ? 2 : 1, groundY: floorObject ? new THREE.Box3().setFromObject(floorObject).max.y : 0,
                dimensionsMm: [size.x*1000, size.z*1000, size.y*1000], bounds, meshes, sourceGroup,
                floorBounds: floorObject ? new THREE.Box3().setFromObject(floorObject) : undefined,
              })
            }
            onExternalSceneObjects?.(grouped)
            externalPlaybackCleanupRef.current = attachConstructionPlayback({
              key: constructionKey(project.project_id, externalScene.sha256),
              projectId: project.project_id, hash: externalScene.sha256,
              items: grouped, scene, sourceBounds, render: renderScene,
              fit: () => {
                // Use the open front of this source scene, below the roof line,
                // while retaining both floors in one frame.
                const overview = new THREE.Box3()
                for (const name of ['Plane', 'Plane003', 'node_0010', 'Cube010']) {
                  const node = sourceRoot.getObjectByName(name)
                  if (node) overview.union(new THREE.Box3().setFromObject(node))
                }
                const bounds = overview.isEmpty() ? sourceBounds : overview
                camera.position.copy(bounds.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, 0.5, 18))
                cameraController.fit(bounds)
              },
            })
            tourRef.current = attachFirstPersonTour({
              source:sourceRoot, scene, camera, canvas:renderer.domElement, controller:cameraController,
              key:constructionKey(project.project_id, externalScene.sha256), render:renderScene,
              onState:setTourState, onExit:()=>onCameraPresetChange?.('orbit'),
            })
            renderScene()
          },
          undefined,
          (error) => {
            console.error(`Không thể tải whole-scene GLB ${externalScene.asset_id}`, error)
            const viewerState = ((window as any).__ATELIER_VIEWER_STATE__ ||= {})
            viewerState.externalSceneError = String(error)
          },
        )
      }

      const onMaterialPreview = (event: Event) => {
        const detail = (event as CustomEvent).detail || {}
        const root = objectRoots.get(detail.objectId)
        const definition = materialDefinitions.get(detail.override?.material_id)
        if (!root || !definition || !detail.sourceMaterialName) return
        const result = applyMaterialOverrideToObject(
          root,
          detail.sourceMaterialName,
          definition,
          detail.override
        )
        const metrics = ((window as any).__ATELIER_MATERIAL_METRICS__ ||= {})
        metrics.materialApplyCount = (metrics.materialApplyCount || 0) + 1
        metrics.lastChangedMeshCount = result.changedMeshCount
        metrics.disposedMaterialCount =
          (metrics.disposedMaterialCount || 0) + result.disposedMaterialCount
        renderScene()
      }
      window.addEventListener('atelier:material-preview', onMaterialPreview)

      renderScene()

      // Real orbit/top/walk controller + raycasting selection + pane-local resize.
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      const pickAtPointer = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const hits = raycaster.intersectObjects(pickableMeshes, false)
        if (hits.length > 0 && hits[0].object.userData?.entityId) {
          onSelectEntity(hits[0].object.userData.entityId)
        }
      }
      const sceneBounds = new THREE.Box3(
        new THREE.Vector3(geometryMinX / 1000, -0.05, geometryMinY / 1000),
        new THREE.Vector3(geometryMaxX / 1000, roomHeightMm / 1000, geometryMaxY / 1000),
      )
      const cameraController = createStudioCameraController(
        camera,
        renderer.domElement,
        sceneBounds,
        renderScene,
        pickAtPointer,
      )
      cameraControllerRef.current = cameraController
      cameraController.setMode(cameraPreset === 'top' || cameraPreset === 'walk' ? cameraPreset : 'orbit', true)
      cameraController.setVisible(viewMode !== '2d')

      // Furniture delivery playback. This is deliberately a viewer-only layer:
      // it never writes project data, agent state, Telegram settings or revisions.
      let deliveryAnimationFrame: number | null = null
      let deliveryCompletionTimer: number | null = null
      const snapshotKey = `atelier.delivery.snapshot.${project?.project_id || project?.id || 'scene'}`
      let previousSnapshot: DeliverySnapshot[] = []
      try {
        previousSnapshot = JSON.parse(window.sessionStorage.getItem(snapshotKey) || '[]')
        window.sessionStorage.setItem(snapshotKey, JSON.stringify(snapshotFurniture(furniture)))
      } catch {
        previousSnapshot = []
      }
      const changedFurniture = findChangedFurniture(previousSnapshot, furniture)
      const replayItem = selectedEntityId
        ? furniture.find((item: any) => item.id === selectedEntityId)
        : furniture[furniture.length - 1]
      const deliveryItem = shouldReplayDelivery ? replayItem : previousSnapshot.length ? changedFurniture.at(-1) : null

      if (deliveryItem && !hasExternalScene && viewMode !== '2d') {
        const targetGroup = furnitureGroups.get(deliveryItem.id)
        if (targetGroup) {
          const roomCenter = new THREE.Vector3(cx, 0, cz)
          const entry = resolveDeliveryEntry(doors, walls, roomCenter)
          const target = new THREE.Vector3(
            (deliveryItem.x_mm ?? 2000) / 1000,
            0,
            (deliveryItem.y_mm ?? 2500) / 1000,
          )
          const approach = target.clone()
          const backoff = entry.clone().sub(target).setY(0)
          if (backoff.lengthSq() > 0.001) approach.add(backoff.normalize().multiplyScalar(0.72))

          const worker = createDeliveryWorker(deliveryItem)
          worker.root.position.copy(entry)
          scene.add(worker.root)
          targetGroup.visible = false

          const marker = new THREE.Mesh(
            new THREE.RingGeometry(0.28, 0.38, 32),
            new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
          )
          marker.rotation.x = -Math.PI / 2
          marker.position.copy(target).setY(0.018)
          scene.add(marker)

          // A full imported GLB can be much larger than the active room. Focus the
          // camera on the delivery route so the worker is visible during playback.
          // Keep the complete room in frame while the worker moves and installs.
          cameraController.fit(sceneBounds)

          deliveryPausedRef.current = false
          setDeliveryPaused(false)
          setDeliveryStatus({ active: true, phase: 'moving', progress: 0, itemName: deliveryItem.name || deliveryItem.id })
          let elapsed = 0
          let lastTime = performance.now()
          let lastUiUpdate = -1
          const totalDuration = Math.max(6.5, entry.distanceTo(target) * 1.15 + 4.2)

          const animateDelivery = (now: number) => {
            if (disposed) return
            const delta = Math.min(0.05, (now - lastTime) / 1000)
            lastTime = now
            if (!deliveryPausedRef.current) elapsed += delta
            const progress = Math.min(1, elapsed / totalDuration)
            let phase: 'moving' | 'placing' | 'returning' | 'complete' = 'moving'
            let moving = true

            if (progress < 0.55) {
              const t = THREE.MathUtils.smoothstep(progress / 0.55, 0, 1)
              worker.root.position.lerpVectors(entry, approach, t)
              worker.root.lookAt(approach.x, worker.root.position.y, approach.z)
            } else if (progress < 0.7) {
              phase = 'placing'
              moving = false
              worker.root.position.copy(approach)
              const t = THREE.MathUtils.smoothstep((progress - 0.55) / 0.15, 0, 1)
              worker.cargo.position.y = THREE.MathUtils.lerp(worker.cargo.position.y, 0.18, t)
              worker.leftArm.rotation.x = worker.rightArm.rotation.x = -0.72 * t
              marker.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.5)
              if (progress >= 0.64) {
                targetGroup.visible = true
                worker.cargo.visible = false
              }
            } else if (progress < 1) {
              phase = 'returning'
              const t = THREE.MathUtils.smoothstep((progress - 0.7) / 0.3, 0, 1)
              worker.root.position.lerpVectors(approach, entry, t)
              worker.root.lookAt(entry.x, worker.root.position.y, entry.z)
              marker.material.opacity = Math.max(0, 0.8 * (1 - t))
            } else {
              phase = 'complete'
              moving = false
              targetGroup.visible = true
              scene.remove(worker.root, marker)
            }

            applyWalkCycle(worker, elapsed, moving)
            const uiProgress = Math.round(progress * 100)
            if (uiProgress !== lastUiUpdate) {
              lastUiUpdate = uiProgress
              setDeliveryStatus({ active: phase !== 'complete', phase, progress: uiProgress, itemName: deliveryItem.name || deliveryItem.id })
              ;(window as any).__ATELIER_DELIVERY_STATE__ = {
                itemId: deliveryItem.id,
                phase,
                progress: uiProgress,
                paused: deliveryPausedRef.current,
              }
            }
            renderScene()
            if (phase !== 'complete') deliveryAnimationFrame = requestAnimationFrame(animateDelivery)
            else deliveryCompletionTimer = window.setTimeout(() => {
              setDeliveryStatus((current) => ({ ...current, active: false }))
            }, 3500)
          }
          deliveryAnimationFrame = requestAnimationFrame(animateDelivery)
        }
      }

      const resizeObs = new ResizeObserver(() => {
        if (!container) return
        const nw = container.clientWidth
        const nh = container.clientHeight
        if (nw > 0 && nh > 0) {
          renderer.setSize(nw, nh)
          if (composer) composer.setSize(nw, nh)
          cameraController.resize(nw / nh)
        }
      })
      resizeObs.observe(container)

      return () => {
        disposed = true
        tourRef.current?.dispose()
        tourRef.current = null
        externalPlaybackCleanupRef.current?.()
        externalPlaybackCleanupRef.current = null
        cameraControllerRef.current = null
        cutawayWallsRef.current = []
        resizeObs.disconnect()
        if (deliveryAnimationFrame !== null) cancelAnimationFrame(deliveryAnimationFrame)
        if (deliveryCompletionTimer !== null) window.clearTimeout(deliveryCompletionTimer)
        cameraController.dispose()
        window.removeEventListener('atelier:material-preview', onMaterialPreview)
        let disposedMaterialCount = 0
        objectRoots.forEach((root) => {
          disposedMaterialCount += disposeOwnedMaterials(root)
        })
        const metrics = ((window as any).__ATELIER_MATERIAL_METRICS__ ||= {})
        metrics.disposedMaterialCount = (metrics.disposedMaterialCount || 0) + disposedMaterialCount
        environmentTarget.dispose()
        pmremGenerator.dispose()
        if (composer) composer.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    }, [
      sceneSignature,
      materialsDb,
      lightingPreset,
      lowSpecMode,
      theme,
      visibleLayers.grid,
      pbrMaterials,
      ceilingVisible,
      ssaoEnabled,
      hasExternalScene ? null : deliveryReplayTrigger,
      hasExternalScene ? null : selectedEntityId,
    ])

    useEffect(() => {
      if (!hasExternalScene) return
      window.dispatchEvent(new CustomEvent(commandEvent, { detail: {
        key: constructionKey(project.project_id, externalScene.sha256),
        action: 'select', id: selectedEntityId,
      }}))
    }, [selectedEntityId, hasExternalScene, project.project_id])

    useEffect(() => {
      const controller = cameraControllerRef.current
      if (!controller) return
      const mode: StudioCameraMode = cameraPreset === 'top' || cameraPreset === 'walk' ? cameraPreset : 'orbit'
      controller.setMode(mode)
      controller.setVisible(viewMode !== '2d')
    }, [cameraPreset, viewMode])

    useEffect(() => {
      cutawayWallsRef.current.forEach(({ mesh, fullHeight, baseHeight, cutaway }) => {
        const active = cutawayEnabled && cutaway
        const nextHeight = active ? 0.32 : fullHeight
        mesh.scale.y = nextHeight / baseHeight
        mesh.position.y = nextHeight / 2
        const material = mesh.material as THREE.MeshStandardMaterial
        material.transparent = active
        material.opacity = active ? 0.45 : 1
        material.needsUpdate = true
      })
      cameraControllerRef.current?.render()
    }, [cutawayEnabled])

    useEffect(() => {
      const commandType = cameraCommand?.type
      if (!commandType) return
      const controller = cameraControllerRef.current
      if (commandType === 'fit') {
        planCamera.fit()
        controller?.fit()
        return
      }
      if (commandType === 'reset') {
        planCamera.fit()
        const mode: StudioCameraMode = cameraPreset === 'top' || cameraPreset === 'walk' ? cameraPreset : 'orbit'
        controller?.setMode(mode, true)
        return
      }
      if (!selectedEntity) return
      if ('x_mm' in selectedEntity) {
        const width = selectedEntity.width_mm || 800
        const depth = selectedEntity.depth_mm || 800
        const focusBounds = {
          minX: selectedEntity.x_mm - width / 2,
          minY: selectedEntity.y_mm - depth / 2,
          maxX: selectedEntity.x_mm + width / 2,
          maxY: selectedEntity.y_mm + depth / 2,
        }
        planCamera.fit(focusBounds)
        controller?.fit(new THREE.Box3(
          new THREE.Vector3(focusBounds.minX / 1000, 0, focusBounds.minY / 1000),
          new THREE.Vector3(focusBounds.maxX / 1000, (selectedEntity.height_mm || 750) / 1000, focusBounds.maxY / 1000),
        ))
      } else if (selectedEntity.start_mm && selectedEntity.end_mm) {
        const padding = Math.max(selectedEntity.thickness_mm || 200, 300)
        const focusBounds = {
          minX: Math.min(selectedEntity.start_mm[0], selectedEntity.end_mm[0]) - padding,
          minY: Math.min(selectedEntity.start_mm[1], selectedEntity.end_mm[1]) - padding,
          maxX: Math.max(selectedEntity.start_mm[0], selectedEntity.end_mm[0]) + padding,
          maxY: Math.max(selectedEntity.start_mm[1], selectedEntity.end_mm[1]) + padding,
        }
        planCamera.fit(focusBounds)
        controller?.fit(new THREE.Box3(
          new THREE.Vector3(focusBounds.minX / 1000, 0, focusBounds.minY / 1000),
          new THREE.Vector3(focusBounds.maxX / 1000, (selectedEntity.height_mm || roomHeightMm) / 1000, focusBounds.maxY / 1000),
        ))
      }
    }, [cameraCommand?.id])

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
      const clampedX = Math.max(roomMinX + 400, Math.min(roomMaxX - 400, Math.round(cursor.x / 50) * 50))
      const clampedY = Math.max(roomMinY + 400, Math.min(roomMaxY - 400, Math.round(cursor.y / 50) * 50))
      onMoveFurniture(draggingId, clampedX, clampedY)
    }

    return (
      <div
        className="viewport-stage-wrapper"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: viewMode === 'split' && !lowSpecMode && !hasExternalScene ? `${splitPercent}% ${100 - splitPercent}%` : '1fr',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 2D CAD Architectural Plan Canvas */}
        {!hasExternalScene && (viewMode === '2d' || viewMode === 'split' || lowSpecMode) && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              background: theme === 'dark' ? '#111113' : '#FFFFFF',
              borderRight: viewMode === 'split' && !lowSpecMode ? '1px solid var(--border-subtle)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '52px 16px 46px',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <svg
                ref={planCamera.svgRef}
                viewBox={`${planCamera.viewBox.x} ${planCamera.viewBox.y} ${planCamera.viewBox.width} ${planCamera.viewBox.height}`}
                style={{ width: '100%', height: '100%', maxHeight: '100%', userSelect: 'none' }}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={() => setDraggingId(null)}
                onPointerDown={planCamera.onPointerDown}
                onPointerMove={planCamera.onPointerMove}
                onPointerUp={planCamera.onPointerEnd}
                onPointerCancel={planCamera.onPointerEnd}
                tabIndex={0}
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

        {viewMode === 'split' && !lowSpecMode && !hasExternalScene && (
          <button
            type="button"
            className="viewport-split-handle"
            style={{ left: `${splitPercent}%` }}
            aria-label="Thay đổi tỷ lệ pane 2D và 3D"
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              const rect = event.currentTarget.parentElement?.getBoundingClientRect()
              if (!rect) return
              setSplitPercent(Math.max(25, Math.min(75, ((event.clientX - rect.left) / rect.width) * 100)))
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          />
        )}

        {/* 3D WebGL Pascal Viewer */}
        {!lowSpecMode && (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: viewMode === '2d' && !hasExternalScene ? 'none' : 'flex', flexDirection: 'column' }}>
            <div
              ref={mountRef}
              data-testid="viewport-3d-canvas"
              style={{ flex: '1 1 0', width: '100%', height: '100%', minWidth: 0, minHeight: 320, overflow: 'hidden' }}
            />
            <TourControls state={tourState} onFloor={id=>tourRef.current?.setFloor(id)} onPlace={()=>tourRef.current?.place()} onWalk={()=>tourRef.current?.walk()} onExit={()=>tourRef.current?.exit()} />
          </div>
        )}

        {deliveryStatus.phase !== 'idle' && viewMode !== '2d' ? (
          <div className="delivery-playback-panel" data-testid="delivery-playback-panel">
            <div className="delivery-playback-heading">
              <span className="delivery-worker-dot" />
              <strong>{deliveryStatus.phase === 'complete' ? 'Đã đặt đồ đúng vị trí' : 'Đang mô phỏng thi công'}</strong>
              <span className="mono">{deliveryStatus.progress}%</span>
            </div>
            <div className="delivery-playback-item">{deliveryStatus.itemName}</div>
            <div className="delivery-progress-track"><span style={{ width: `${deliveryStatus.progress}%` }} /></div>
            {deliveryStatus.active ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  deliveryPausedRef.current = !deliveryPausedRef.current
                  setDeliveryPaused(deliveryPausedRef.current)
                }}
              >
                {deliveryPaused ? 'Tiếp tục' : 'Tạm dừng'}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Bottom-Left HUD: Scene Validation, HDRI/SSAO/Ceiling Toggles, XYZ Gizmo & Active Selection Dimensions */}
        <div className="viewport-hud-bottom-left">
          <div className="viewport-hud-pill" data-testid="hud-scene-valid">
            <span className="status-dot" />
            <span className="mono" style={{ fontWeight: 600 }}>
              Pascal SceneGraph: VALID
            </span>
            <span>• {roomW / 1000}×{roomD / 1000}m</span>
          </div>

          <div className="viewport-hud-pill" data-testid="hud-hdri-status" title="Poly Haven CC0-1.0 Equirectangular HDRI">
            <Sparkles size={12} style={{ color: hdriLoaded ? '#10B981' : '#F59E0B' }} />
            <span className="mono" style={{ fontSize: 11 }}>
              {hdriLoaded ? 'HDRI CC0: Loft Hall 1K' : 'IBL Studio'}
            </span>
          </div>

          <button
            type="button"
            data-testid="toggle-ssao-btn"
            className="viewport-hud-pill"
            onClick={() => setSsaoEnabled((v) => !v)}
            style={{
              cursor: 'pointer',
              borderColor: ssaoEnabled ? 'var(--accent-border)' : 'var(--border-subtle)',
              background: ssaoEnabled ? 'var(--accent-soft)' : 'var(--surface-primary)',
            }}
            title="Bật/tắt Screen-Space Ambient Occlusion (SSAO)"
          >
            <Eye size={12} style={{ color: ssaoEnabled ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
              SSAO: {ssaoEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            data-testid="toggle-ceiling-btn"
            className="viewport-hud-pill"
            onClick={() => setCeilingVisible((v) => !v)}
            style={{
              cursor: 'pointer',
              borderColor: ceilingVisible ? 'var(--accent-border)' : 'var(--border-subtle)',
              background: ceilingVisible ? 'var(--accent-soft)' : 'var(--surface-primary)',
            }}
            title="Ẩn/hiện hệ trần thạch cao & đèn âm trần"
          >
            <Layers size={12} style={{ color: ceilingVisible ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
              Trần: {ceilingVisible ? 'HIỆN' : 'ẨN'}
            </span>
          </button>

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
