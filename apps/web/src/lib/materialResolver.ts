import * as THREE from 'three'

export interface MaterialOverrideValue {
  material_id: string
  material_version: number
  tint?: string | null
  pbr?: Record<string, number | string>
  texture_scale?: Record<string, unknown> | null
}

export interface MaterialDefinitionValue {
  material_id: string
  version: number
  name?: string
  kind: string
  tint: string
  preserve_source_textures: boolean
  pbr: Record<string, number | string>
  uv?: {
    tile_size_mm?: number[]
    grout_thickness_mm?: number
    grout_color?: string
    pattern?: string
    scale?: number[]
    offset_mm?: number[]
    rotation_deg?: number
  } | null
  textures?: Array<Record<string, unknown>>
  source_url?: string | null
  author?: string | null
  license?: string | null
  license_url?: string | null
  price_status?: string
}

const numberValue = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function resolveMaterialDefinition(
  definition: MaterialDefinitionValue,
  override: MaterialOverrideValue
) {
  return {
    ...definition,
    tint: override.tint || definition.tint,
    pbr: { ...definition.pbr, ...(override.pbr || {}) },
  }
}

function physicalFromSource(
  source: THREE.Material,
  definition: MaterialDefinitionValue,
  override: MaterialOverrideValue
) {
  const resolved = resolveMaterialDefinition(definition, override)
  const standard = source as THREE.MeshStandardMaterial
  const pbr = resolved.pbr
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: new THREE.Color((resolved.tint || pbr.base_color || '#FFFFFF') as string),
    map: definition.preserve_source_textures ? standard.map : null,
    normalMap: definition.preserve_source_textures ? standard.normalMap : null,
    roughnessMap: definition.preserve_source_textures ? standard.roughnessMap : null,
    metalnessMap: definition.preserve_source_textures ? standard.metalnessMap : null,
    aoMap: definition.preserve_source_textures ? standard.aoMap : null,
    alphaMap: definition.preserve_source_textures ? standard.alphaMap : null,
    emissiveMap: definition.preserve_source_textures ? standard.emissiveMap : null,
    roughness: numberValue(pbr.roughness, standard.roughness ?? 0.5),
    metalness: numberValue(pbr.metalness, standard.metalness ?? 0),
    opacity: numberValue(pbr.opacity, standard.opacity ?? 1),
    transparent: numberValue(pbr.opacity, 1) < 1 || numberValue(pbr.transmission, 0) > 0,
    transmission: numberValue(pbr.transmission, 0),
    ior: numberValue(pbr.ior, 1.5),
    clearcoat: numberValue(pbr.clearcoat, 0),
    clearcoatRoughness: numberValue(pbr.clearcoat_roughness, 0),
    sheen: numberValue(pbr.sheen, 0),
    sheenColor: new THREE.Color((pbr.sheen_color || '#FFFFFF') as string),
    emissive: new THREE.Color((pbr.emissive || '#000000') as string),
    emissiveIntensity: numberValue(pbr.emissive_intensity, 0),
    side: source.side,
  })
  material.normalScale.setScalar(numberValue(pbr.normal_scale, 1))
  material.userData = {
    ...source.userData,
    atelierOwned: true,
    materialId: definition.material_id,
    materialVersion: definition.version,
  }
  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace
  ;[material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap].forEach((texture) => {
    if (texture) texture.colorSpace = THREE.NoColorSpace
  })
  material.needsUpdate = true
  return material
}

export function applyMaterialOverrideToObject(
  root: THREE.Object3D,
  sourceMaterialName: string,
  definition: MaterialDefinitionValue,
  override: MaterialOverrideValue
) {
  let changedMeshCount = 0
  let disposedMaterialCount = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    let changed = false
    const next = materials.map((material) => {
      if (material.name !== sourceMaterialName) return material
      const replacement = physicalFromSource(material, definition, override)
      if (material.userData?.atelierOwned) {
        material.dispose()
        disposedMaterialCount += 1
      }
      changed = true
      return replacement
    })
    if (changed) {
      mesh.material = Array.isArray(mesh.material) ? next : next[0]
      changedMeshCount += 1
    }
  })
  return { changedMeshCount, disposedMaterialCount }
}

export function disposeOwnedMaterials(root: THREE.Object3D) {
  let count = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      if (material.userData?.atelierOwned) {
        material.dispose()
        count += 1
      }
    })
  })
  return count
}
