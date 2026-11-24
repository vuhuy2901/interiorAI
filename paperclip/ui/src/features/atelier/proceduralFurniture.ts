import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

type FurnitureDimensions = {
  width: number
  depth: number
  height: number
}

type BuildOptions = FurnitureDimensions & {
  category?: string
  name?: string
  color?: string
  entityId: string
  lowSpecMode?: boolean
  pickableMeshes: THREE.Object3D[]
}

const normalizedCategory = (category?: string) =>
  String(category || 'furniture')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const makeMaterial = (color: string, roughness = 0.62, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

/**
 * Creates a recognizable, dimensionally correct furniture model while a licensed
 * GLB/product model has not been assigned. These meshes are deliberately marked
 * as PARAMETRIC_PREVIEW so the UI never presents them as a sourced product asset.
 */
export function createProceduralFurniture(options: BuildOptions): THREE.Group {
  const {
    width: w,
    depth: d,
    height: h,
    entityId,
    pickableMeshes,
    lowSpecMode = false,
  } = options
  const category = normalizedCategory(options.category)
  const name = String(options.name || '').toLowerCase()
  const root = new THREE.Group()
  root.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }

  const body = makeMaterial(options.color || '#D8C5AA', 0.58)
  const wood = makeMaterial('#B99062', 0.5)
  const woodDark = makeMaterial('#76583E', 0.52)
  const fabric = makeMaterial(options.color || '#E7E0D5', 0.92)
  const linen = makeMaterial('#F2EEE5', 0.98)
  const dark = makeMaterial('#25282B', 0.4, 0.08)
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#DDEAF0',
    roughness: 0.08,
    transmission: 0.45,
    transparent: true,
    opacity: 0.68,
  })

  const addBox = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material = body,
    pickable = true,
    radius = 0.012,
  ) => {
    const safeSize = size.map(value => Math.max(0.008, value)) as [number, number, number]
    const safeRadius = Math.min(radius, Math.min(...safeSize) * 0.22)
    const geometry = safeRadius > 0 && !lowSpecMode
      ? new RoundedBoxGeometry(safeSize[0], safeSize[1], safeSize[2], 3, safeRadius)
      : new THREE.BoxGeometry(safeSize[0], safeSize[1], safeSize[2])
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.castShadow = !lowSpecMode
    mesh.receiveShadow = true
    mesh.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
    root.add(mesh)
    if (pickable) pickableMeshes.push(mesh)
    return mesh
  }

  const addCylinder = (
    radius: number,
    length: number,
    position: [number, number, number],
    material: THREE.Material = dark,
    horizontal = false,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, lowSpecMode ? 8 : 20),
      material,
    )
    mesh.position.set(...position)
    if (horizontal) mesh.rotation.z = Math.PI / 2
    mesh.castShadow = !lowSpecMode
    mesh.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
    root.add(mesh)
    pickableMeshes.push(mesh)
    return mesh
  }

  if (category === 'bed') {
    const frameHeight = Math.min(h * 0.32, 0.28)
    const mattressHeight = Math.max(0.16, Math.min(h * 0.28, 0.28))
    const headboardDepth = Math.min(0.12, d * 0.08)
    addBox([w, frameHeight, d * 0.94], [0, frameHeight / 2, 0], wood)
    addBox([w * 0.96, mattressHeight, d * 0.88], [0, frameHeight + mattressHeight / 2, d * 0.01], linen)
    addBox([w, h, headboardDepth], [0, h / 2, -d / 2 + headboardDepth / 2], wood)
    const pillowY = frameHeight + mattressHeight + 0.07
    const pillowZ = -d * 0.27
    addBox([w * 0.39, 0.12, d * 0.2], [-w * 0.22, pillowY, pillowZ], fabric, true, 0.03)
    addBox([w * 0.39, 0.12, d * 0.2], [w * 0.22, pillowY, pillowZ], fabric, true, 0.03)
    addBox([w * 0.9, 0.045, d * 0.48], [0, pillowY + 0.015, d * 0.16], makeMaterial('#D6C3A8', 0.95))
  } else if (category === 'wardrobe' || category === 'closet' || category === 'cabinet') {
    addBox([w, h, d], [0, h / 2, 0], body)
    const doorCount = Math.max(2, Math.min(5, Math.round(w / 0.72)))
    const doorWidth = w / doorCount
    for (let index = 0; index < doorCount; index += 1) {
      const x = -w / 2 + doorWidth * (index + 0.5)
      addBox([doorWidth * 0.96, h * 0.92, 0.025], [x, h * 0.5, d / 2 + 0.014], wood)
      addCylinder(0.008, Math.min(0.3, h * 0.18), [x + doorWidth * 0.3, h * 0.52, d / 2 + 0.04], dark)
    }
    addBox([w * 0.98, 0.045, d * 1.02], [0, h - 0.025, 0], woodDark, false)
  } else if (category === 'nightstand' || category === 'bedside_table') {
    const legH = Math.min(0.16, h * 0.28)
    addBox([w, h - legH, d], [0, legH + (h - legH) / 2, 0], body)
    addBox([w * 1.03, 0.045, d * 1.03], [0, h - 0.023, 0], wood)
    addBox([w * 0.9, (h - legH) * 0.36, 0.025], [0, legH + (h - legH) * 0.69, d / 2 + 0.014], wood)
    addCylinder(0.012, w * 0.2, [0, legH + (h - legH) * 0.69, d / 2 + 0.04], dark, true)
    const legSize = Math.min(0.045, w * 0.08)
    for (const x of [-w * 0.38, w * 0.38]) {
      for (const z of [-d * 0.34, d * 0.34]) addBox([legSize, legH, legSize], [x, legH / 2, z], woodDark, false)
    }
  } else if (category === 'desk' || category === 'vanity' || name.includes('phấn')) {
    const topThickness = Math.min(0.06, h * 0.09)
    addBox([w, topThickness, d], [0, h - topThickness / 2, 0], wood)
    const leg = Math.min(0.055, w * 0.05)
    for (const x of [-w * 0.43, w * 0.43]) {
      for (const z of [-d * 0.38, d * 0.38]) addBox([leg, h - topThickness, leg], [x, (h - topThickness) / 2, z], woodDark, false)
    }
    addBox([w * 0.42, h * 0.14, d * 0.78], [w * 0.22, h * 0.82, 0], body)
    if (category === 'vanity' || name.includes('phấn')) {
      const mirrorRadius = Math.min(w * 0.23, 0.28)
      const mirror = new THREE.Mesh(
        new THREE.CircleGeometry(mirrorRadius, lowSpecMode ? 20 : 40),
        glass,
      )
      mirror.position.set(0, h + mirrorRadius * 1.08, -d * 0.44)
      mirror.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
      root.add(mirror)
      pickableMeshes.push(mirror)
    }
  } else if (category === 'rug' || category === 'carpet') {
    addBox([w, Math.max(0.018, h), d], [0, Math.max(0.009, h / 2), 0], fabric)
    addBox([w * 0.94, 0.004, d * 0.94], [0, Math.max(0.02, h + 0.002), 0], linen, false)
  } else if (category === 'tv_cabinet' || category === 'tv_console' || category === 'media_console') {
    const legH = Math.min(0.14, h * 0.32)
    addBox([w, h - legH, d], [0, legH + (h - legH) / 2, 0], wood)
    addBox([w * 0.31, (h - legH) * 0.78, 0.025], [-w * 0.32, legH + (h - legH) * 0.5, d / 2 + 0.014], body)
    addBox([w * 0.31, (h - legH) * 0.78, 0.025], [w * 0.32, legH + (h - legH) * 0.5, d / 2 + 0.014], body)
    addBox([w * 0.28, 0.035, d * 0.72], [0, legH + (h - legH) * 0.5, d * 0.08], woodDark)
    for (const x of [-w * 0.42, w * 0.42]) addBox([0.045, legH, 0.045], [x, legH / 2, 0], dark, false)
  } else if (category === 'coffee_table' || category === 'table') {
    const topThickness = Math.min(0.06, h * 0.16)
    addBox([w, topThickness, d], [0, h - topThickness / 2, 0], wood)
    const leg = Math.min(0.055, w * 0.07)
    for (const x of [-w * 0.39, w * 0.39]) {
      for (const z of [-d * 0.34, d * 0.34]) addBox([leg, h - topThickness, leg], [x, (h - topThickness) / 2, z], woodDark, false)
    }
  } else if (category === 'bench') {
    // A backless upholstered bench: keep all geometry inside the declared bounds.
    const cushionH = h * 0.18
    const railH = h * 0.14
    const legH = h - cushionH - railH
    addBox([w, cushionH, d], [0, h - cushionH / 2, 0], fabric)
    addBox([w * 0.96, railH, d * 0.92], [0, legH + railH / 2, 0], wood)
    const legW = Math.min(w * 0.05, d * 0.14)
    for (const x of [-w * 0.4, w * 0.4]) {
      for (const z of [-d * 0.32, d * 0.32]) {
        addBox([legW, legH, legW], [x, legH / 2, z], wood)
      }
    }
  } else if (category === 'sofa' || category === 'armchair' || category === 'chair') {
    const armWidth = category === 'sofa' ? w * 0.08 : w * 0.11
    addBox([w - armWidth * 2, h * 0.36, d * 0.74], [0, h * 0.31, d * 0.05], fabric)
    addBox([w - armWidth * 2, h * 0.5, d * 0.2], [0, h * 0.69, -d * 0.38], fabric)
    addBox([armWidth, h * 0.62, d * 0.88], [-w / 2 + armWidth / 2, h * 0.36, 0], fabric)
    addBox([armWidth, h * 0.62, d * 0.88], [w / 2 - armWidth / 2, h * 0.36, 0], fabric)
    for (const x of [-w * 0.38, w * 0.38]) {
      for (const z of [-d * 0.3, d * 0.3]) addBox([0.045, h * 0.18, 0.045], [x, h * 0.09, z], woodDark, false)
    }
  } else if (category === 'dining_chair' || category === 'bar_stool') {
    // Seat + backrest + 4 legs
    const seatH = h * 0.52
    const legW = Math.min(0.04, w * 0.08)
    addBox([w * 0.9, h * 0.08, d * 0.9], [0, seatH, 0], fabric)
    addBox([w * 0.86, h * 0.44, 0.04], [0, seatH + h * 0.24, -d * 0.42], wood)
    for (const x of [-w * 0.36, w * 0.36]) {
      for (const z of [-d * 0.34, d * 0.34]) addBox([legW, seatH, legW], [x, seatH / 2, z], woodDark, false)
    }
  } else if (category === 'dining_table') {
    const topH = Math.min(0.05, h * 0.1)
    addBox([w, topH, d], [0, h - topH / 2, 0], wood)
    // 1 or 2 pedestals depending on size
    if (w > 1.4) {
      for (const x of [-w * 0.28, w * 0.28]) addBox([0.07, h - topH, 0.07], [x, (h - topH) / 2, 0], woodDark, false)
    } else {
      addBox([0.08, h - topH, 0.08], [0, (h - topH) / 2, 0], woodDark, false)
    }
  } else if (category === 'bookshelf' || category === 'shelf' || category === 'shelving') {
    // Frame + horizontal shelves
    const shelfCount = Math.max(2, Math.round(h / 0.32))
    const shelfH = 0.025
    const panelD = Math.min(0.04, d * 0.1)
    addBox([panelD, h, d], [-w / 2 + panelD / 2, h / 2, 0], wood, false) // left panel
    addBox([panelD, h, d], [w / 2 - panelD / 2, h / 2, 0], wood, false) // right panel
    addBox([w, shelfH, d], [0, h - shelfH / 2, 0], wood, false) // top
    addBox([w, shelfH, d], [0, shelfH / 2, 0], wood, false) // bottom
    for (let i = 1; i < shelfCount; i++) {
      addBox([w * 0.98, shelfH, d * 0.96], [0, (h / shelfCount) * i, 0], wood)
    }
  } else if (category === 'tv' || category === 'television') {
    // TV panel on a thin base stand
    const bezelW = Math.min(0.025, w * 0.02)
    const standH = Math.min(0.12, h * 0.18)
    addBox([w, h - standH - bezelW, bezelW * 0.6], [0, standH + (h - standH) / 2, 0], dark)
    addBox([w * 0.84, (h - standH) * 0.86, 0.008], [0, standH + (h - standH) / 2, bezelW * 0.32],
      new THREE.MeshStandardMaterial({ color: '#1a1a2a', roughness: 0.05, metalness: 0.1 }))
    addBox([w * 0.26, standH, 0.18], [0, standH / 2, 0], dark, false)
  } else if (category === 'floor_lamp' || category === 'lamp') {
    // Thin pole + shade
    const poleR = Math.min(0.018, w * 0.1)
    const shadeR = Math.min(w, 0.28)
    const shadeH = Math.min(0.2, h * 0.14)
    addBox([poleR * 2, h * 0.9, poleR * 2], [0, h * 0.45, 0], dark, false)
    addBox([0.14, 0.02, 0.14], [0, 0.01, 0], dark, false) // base
    const shadeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(shadeR * 0.55, shadeR, shadeH, lowSpecMode ? 10 : 20),
      makeMaterial('#F5EDD0', 0.95),
    )
    shadeMesh.position.set(0, h * 0.9, 0)
    shadeMesh.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
    root.add(shadeMesh)
    pickableMeshes.push(shadeMesh)
  } else if (category === 'plant' || category === 'potted_plant') {
    // Pot + foliage sphere
    const potH = h * 0.32
    const potR = Math.min(w, d) * 0.42
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(potR, potR * 0.75, potH, lowSpecMode ? 10 : 18),
      makeMaterial('#8B6F5C', 0.85),
    )
    pot.position.set(0, potH / 2, 0)
    pot.castShadow = !lowSpecMode
    pot.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
    root.add(pot); pickableMeshes.push(pot)
    const leafR = (h - potH) * 0.55
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(leafR, lowSpecMode ? 8 : 14, lowSpecMode ? 6 : 10),
      makeMaterial(options.color || '#3A7D44', 0.88),
    )
    foliage.position.set(0, potH + leafR * 0.9, 0)
    foliage.castShadow = !lowSpecMode
    foliage.userData = { entityId, assetQuality: 'PARAMETRIC_PREVIEW' }
    root.add(foliage); pickableMeshes.push(foliage)
  } else if (category === 'curtain' || category === 'drape') {
    // Flat fabric panel with subtle folds
    addBox([w, h, 0.04], [0, h / 2, 0], fabric)
    const folds = Math.max(2, Math.round(w / 0.25))
    for (let i = 0; i < folds; i++) {
      const x = -w / 2 + (w / folds) * (i + 0.5)
      addBox([w / folds * 0.3, h * 0.96, 0.025], [x, h / 2, 0.03], linen, false)
    }
  } else if (category === 'bathtub' || category === 'tub') {
    const wallT = Math.min(0.06, w * 0.05)
    addBox([w, h, d], [0, h / 2, 0], body) // outer body
    addBox([w - wallT * 2, h * 0.8, d - wallT * 2], [0, wallT + h * 0.4 + 0.01, 0],
      new THREE.MeshStandardMaterial({ color: '#EEF2F5', roughness: 0.08, metalness: 0.0 })) // inner basin
  } else if (category === 'sink' || category === 'washbasin') {
    addBox([w, h * 0.72, d], [0, h * 0.36, 0], body) // basin body
    addBox([w * 0.72, h * 0.08, d * 0.76], [0, h * 0.72, 0],
      new THREE.MeshStandardMaterial({ color: '#E8ECF0', roughness: 0.06 })) // basin top
    addBox([0.025, h * 0.3, 0.025], [0, h * 0.86, 0],
      new THREE.MeshStandardMaterial({ color: '#B8C0CC', roughness: 0.15, metalness: 0.8 })) // faucet
  } else {
    addBox([w, h, d], [0, h / 2, 0], body)
  }

  return root
}

