import { getNamedPartsForFurniture } from './assetCatalog'
import { pbrCatalogData as rawCatalog } from './catalogData'

export type PbrSurfaceType = 'floor' | 'wall' | 'wood' | 'stone' | 'fabric' | 'metal' | 'glass' | 'tile'

export interface PbrMaterialEntry {
  id: string
  name: string
  surface_type: PbrSurfaceType
  diffuse_url: string
  roughness_url: string
  normal_url: string
  repeat_scale_m: [number, number]
  base_color: string
  roughness: number
  metalness: number
  transmission?: number
  source: string
  license: string
}

export interface PbrStylePreset {
  id: string
  name: string
  asset_pack?: string
  description: string
  floor_material_id: string
  wall_inner_material_id: string
  wall_outer_material_id: string
  defaults_by_surface: Record<string, string>
}

export const DEFAULT_ASSET_PACK = 'sh3d-japandi'

export function getAssetPackForStylePreset(stylePresetId?: string | null, briefStyle?: string | null): string {
  const sid = String(stylePresetId || '').trim().toLowerCase()
  if (sid) {
    const found = PBR_STYLE_PRESETS.find((p) => p.id === sid)
    if (found?.asset_pack) return found.asset_pack
  }
  const combined = `${sid} ${String(briefStyle || '').toLowerCase()}`
  if (/classic|cổ\s*điển|co_dien|neoclassic/.test(combined)) {
    return 'sh3d-classic'
  }
  return DEFAULT_ASSET_PACK
}

export const PBR_CATALOG_MATERIALS: PbrMaterialEntry[] = (rawCatalog.materials || []) as PbrMaterialEntry[]
export const PBR_STYLE_PRESETS: PbrStylePreset[] = (rawCatalog.style_presets || []) as PbrStylePreset[]

const MATERIAL_BY_ID = new Map<string, PbrMaterialEntry>(
  PBR_CATALOG_MATERIALS.map((item) => [item.id, item])
)

export const DEFAULT_MATERIAL_BY_SURFACE: Record<PbrSurfaceType, string> = {
  floor: 'pbr_floor_oak_light',
  wall: 'pbr_wall_plaster_warm',
  wood: 'pbr_wood_oak_natural',
  stone: 'pbr_stone_carrara_white',
  fabric: 'pbr_fabric_linen_cream',
  metal: 'pbr_metal_matte_black',
  glass: 'pbr_glass_clear_architectural',
  tile: 'pbr_tile_porcelain_sand',
}

export function getPbrMaterialById(id?: string | null): PbrMaterialEntry | null {
  if (!id) return null
  if (MATERIAL_BY_ID.has(id)) return MATERIAL_BY_ID.get(id)!
  // Legacy ID compatibility mapping
  const legacyMap: Record<string, string> = {
    mat_wood_oak_natural: 'pbr_wood_oak_natural',
    mat_wood_walnut_dark: 'pbr_wood_walnut_classic',
    mat_fabric_sand: 'pbr_fabric_boucle_sand',
    mat_fabric_moss: 'pbr_fabric_velvet_taupe',
    mat_tile_sand_800: 'pbr_floor_tile_ceramic_800',
    tile_oak_herringbone: 'pbr_floor_oak_light',
    tile_terrazzo_cream: 'pbr_floor_marble_cream',
    tile_porcelain_grey: 'pbr_floor_tile_ceramic_800',
    paint_warm_white: 'pbr_wall_plaster_warm',
    paint_pure_white: 'pbr_wall_plaster_pure',
    paint_sage_green: 'pbr_wall_plaster_sage',
  }
  const mappedId = legacyMap[id]
  return mappedId ? MATERIAL_BY_ID.get(mappedId) || null : null
}

export function getPbrMaterialsForSurface(surfaceType: PbrSurfaceType): PbrMaterialEntry[] {
  if (surfaceType === 'floor') {
    return PBR_CATALOG_MATERIALS.filter((m) => m.surface_type === 'floor' || m.surface_type === 'tile')
  }
  if (surfaceType === 'wall') {
    return PBR_CATALOG_MATERIALS.filter((m) => m.surface_type === 'wall' || m.surface_type === 'tile')
  }
  if (surfaceType === 'stone') {
    return PBR_CATALOG_MATERIALS.filter((m) => m.surface_type === 'stone' || m.surface_type === 'wood' || m.surface_type === 'glass')
  }
  if (surfaceType === 'wood') {
    return PBR_CATALOG_MATERIALS.filter((m) => m.surface_type === 'wood' || m.surface_type === 'stone' || m.surface_type === 'metal')
  }
  return PBR_CATALOG_MATERIALS.filter((m) => m.surface_type === surfaceType)
}

export function resolveMaterialOrDefault(id: string | undefined | null, surfaceType: PbrSurfaceType): PbrMaterialEntry {
  const found = getPbrMaterialById(id)
  if (found) return found
  const fallbackId = DEFAULT_MATERIAL_BY_SURFACE[surfaceType] || 'pbr_wood_oak_natural'
  return MATERIAL_BY_ID.get(fallbackId) || PBR_CATALOG_MATERIALS[0]
}

export function applyStylePresetToProject(project: any, presetId: string): any {
  const preset = PBR_STYLE_PRESETS.find((p) => p.id === presetId)
  if (!preset || !project) return project
  const clone = JSON.parse(JSON.stringify(project))

  clone.active_style_preset = preset.id
  clone.surface_material_overrides ||= {}
  const floorMat = resolveMaterialOrDefault(preset.floor_material_id, 'floor')
  clone.surface_material_overrides.floor = {
    material_id: floorMat.id,
    tint: floorMat.base_color,
    pbr: { roughness: floorMat.roughness, metalness: floorMat.metalness },
  }
  if (Array.isArray(clone.rooms)) {
    clone.rooms.forEach((r: any) => {
      r.floor_material_id = floorMat.id
    })
  }
  if (Array.isArray(clone.walls)) {
    clone.walls.forEach((w: any) => {
      w.face_a_material_id = preset.wall_inner_material_id
      w.face_b_material_id = preset.wall_outer_material_id
    })
  }
  if (Array.isArray(clone.furniture_instances)) {
    clone.furniture_instances.forEach((f: any) => {
      const parts = getNamedPartsForFurniture(f)
      const partMaterials: Record<string, string> = { ...(f.part_materials || {}) }
      parts.forEach((part) => {
        const defaultMatId = preset.defaults_by_surface[part.surfaceType] || DEFAULT_MATERIAL_BY_SURFACE[part.surfaceType]
        if (defaultMatId) {
          partMaterials[part.partId] = defaultMatId
        }
      })
      f.part_materials = partMaterials
      const primaryPart = parts[0]
      if (primaryPart && partMaterials[primaryPart.partId]) {
        const primaryMat = getPbrMaterialById(partMaterials[primaryPart.partId])
        if (primaryMat) {
          f.color_hex = primaryMat.base_color
        }
      }
    })
  }
  return clone
}
