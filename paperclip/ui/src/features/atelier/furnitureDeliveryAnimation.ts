import * as THREE from 'three'

export interface DeliveryFurniture {
  id: string
  name?: string
  x_mm?: number
  y_mm?: number
  z_mm?: number
  width_mm?: number
  depth_mm?: number
  height_mm?: number
  rotation_deg?: number
  color_hex?: string
}

export interface DeliverySnapshot {
  id: string
  x: number
  y: number
  rotation: number
}

export function snapshotFurniture(items: DeliveryFurniture[]): DeliverySnapshot[] {
  return items.map((item) => ({
    id: item.id,
    x: item.x_mm ?? 0,
    y: item.y_mm ?? 0,
    rotation: item.rotation_deg ?? 0,
  }))
}

export function findChangedFurniture(
  previous: DeliverySnapshot[],
  current: DeliveryFurniture[],
): DeliveryFurniture[] {
  const before = new Map(previous.map((item) => [item.id, item]))
  return current.filter((item) => {
    const old = before.get(item.id)
    if (!old) return true
    return old.x !== (item.x_mm ?? 0) || old.y !== (item.y_mm ?? 0) || old.rotation !== (item.rotation_deg ?? 0)
  })
}

export function resolveDeliveryEntry(
  doors: any[],
  walls: any[],
  roomCenter: THREE.Vector3,
): THREE.Vector3 {
  const door = doors[0]
  const wall = walls.find((item) => item.id === door?.wall_id) || walls[0]
  if (!wall?.start_mm || !wall?.end_mm) return new THREE.Vector3(roomCenter.x, 0, roomCenter.z + 2)

  const t = door?.t ?? 0.5
  const point = new THREE.Vector3(
    (wall.start_mm[0] + (wall.end_mm[0] - wall.start_mm[0]) * t) / 1000,
    0,
    (wall.start_mm[1] + (wall.end_mm[1] - wall.start_mm[1]) * t) / 1000,
  )
  const inward = roomCenter.clone().sub(point).setY(0)
  if (inward.lengthSq() > 0.0001) inward.normalize().multiplyScalar(0.35)
  return point.add(inward)
}

export interface DeliveryWorker {
  root: THREE.Group
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  cargo: THREE.Mesh
}

function limb(material: THREE.Material, y: number): THREE.Group {
  const pivot = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), material)
  mesh.position.y = y
  mesh.castShadow = true
  pivot.add(mesh)
  return pivot
}

export function createDeliveryWorker(item: DeliveryFurniture, appearance?: { id: string; shirtColor: string }): DeliveryWorker {
  const root = new THREE.Group()
  root.name = 'atelier-delivery-worker'
  if (appearance) root.userData.workerId = appearance.id

  const uniform = new THREE.MeshStandardMaterial({ color: appearance?.shirtColor || 0x0f766e, roughness: 0.7 })
  const trousers = new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.82 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a074, roughness: 0.75 })
  const safety = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 6, 12), uniform)
  torso.position.y = 1.08
  torso.castShadow = true
  root.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin)
  head.position.y = 1.63
  head.castShadow = true
  root.add(head)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), safety)
  helmet.position.y = 1.68
  root.add(helmet)

  const leftArm = limb(uniform, -0.24)
  const rightArm = limb(uniform, -0.24)
  leftArm.position.set(-0.27, 1.34, 0)
  rightArm.position.set(0.27, 1.34, 0)
  root.add(leftArm, rightArm)

  const leftLeg = limb(trousers, -0.28)
  const rightLeg = limb(trousers, -0.28)
  leftLeg.position.set(-0.12, 0.72, 0)
  rightLeg.position.set(0.12, 0.72, 0)
  root.add(leftLeg, rightLeg)

  const cargoWidth = Math.min(0.82, Math.max(0.25, (item.width_mm || 700) / 1800))
  const cargoDepth = Math.min(0.5, Math.max(0.2, (item.depth_mm || 500) / 1800))
  const cargoHeight = Math.min(0.62, Math.max(0.2, (item.height_mm || 600) / 1800))
  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(cargoWidth, cargoHeight, cargoDepth),
    new THREE.MeshStandardMaterial({ color: item.color_hex || '#d6b98c', roughness: 0.65 }),
  )
  cargo.position.set(0, 0.4 + cargoHeight / 2, 0.58)
  cargo.castShadow = true
  root.add(cargo)

  return { root, leftArm, rightArm, leftLeg, rightLeg, cargo }
}

export function applyWalkCycle(worker: DeliveryWorker, distance: number, moving: boolean, floorY = 0) {
  const swing = moving ? Math.sin(distance * 10) * 0.62 : 0
  worker.leftArm.rotation.x = swing
  worker.rightArm.rotation.x = -swing
  worker.leftLeg.rotation.x = -swing
  worker.rightLeg.rotation.x = swing
  worker.root.position.y = floorY + (moving ? Math.abs(Math.sin(distance * 10)) * 0.025 : 0)
}
