import { getAssetPackForStylePreset } from './pbrCatalog'
import { classicCatalogData, japandiCatalogData } from './catalogData'

export interface CatalogAssetEntry {
  slug: string
  sh3d_id: string
  name: string
  aliases: string[]
  width_m: number
  depth_m: number
  height_m: number
  face_count: number
  license: 'CC-0' | 'CC-BY'
  creator: string
  source: string
  modified: boolean
  modification_note: string
  glb_url: string
}

export const JAPANDI_CATALOG: CatalogAssetEntry[] = (japandiCatalogData.items || []) as CatalogAssetEntry[]
export const CLASSIC_CATALOG: CatalogAssetEntry[] = (classicCatalogData.items || []) as CatalogAssetEntry[]

export const CATALOG_BY_PACK: Record<string, CatalogAssetEntry[]> = {
  'sh3d-japandi': JAPANDI_CATALOG,
  'sh3d-classic': CLASSIC_CATALOG,
}

export function getCatalogForPack(packId?: string | null): CatalogAssetEntry[] {
  if (packId && CATALOG_BY_PACK[packId]) return CATALOG_BY_PACK[packId]
  return JAPANDI_CATALOG
}

export function resolveAssetPackForProject(project?: {
  active_style_preset?: string | null
  design_brief?: { style?: string | null }
} | null): string {
  return getAssetPackForStylePreset(project?.active_style_preset, project?.design_brief?.style)
}

export const PARAMETRIC_CATEGORIES = new Set([
  'rug',
  'carpet',
  'mat',
  'painting',
  'picture',
  'frame',
  'art',
  'mirror',
  'curtain',
  'drape',
  'blind',
  'door',
  'window',
])

export const PBR_TEXTURES = {
  wood_floor: {
    diffuse: '/assets/pbr/wood_floor/diffuse.jpg',
    roughness: '/assets/pbr/wood_floor/roughness.jpg',
    normal: '/assets/pbr/wood_floor/normal.jpg',
    license: 'CC0 (Poly Haven wood_floor_deck)',
  },
  wood_oak: {
    diffuse: '/assets/pbr/wood_oak/diffuse.jpg',
    roughness: '/assets/pbr/wood_oak/roughness.jpg',
    normal: '/assets/pbr/wood_oak/normal.jpg',
    license: 'CC0 (Poly Haven oak_veneer_01)',
  },
  plaster_wall: {
    diffuse: '/assets/pbr/plaster_wall/diffuse.jpg',
    roughness: '/assets/pbr/plaster_wall/roughness.jpg',
    normal: '/assets/pbr/plaster_wall/normal.jpg',
    license: 'CC0 (Poly Haven plaster_grey_04)',
  },
  fabric_linen: {
    roughness: '/assets/pbr/fabric_linen/roughness.jpg',
    normal: '/assets/pbr/fabric_linen/normal.jpg',
    license: 'CC0 (Poly Haven fabric_pattern_07)',
  },
  grass: {
    diffuse: '/assets/pbr/grass/diffuse.jpg',
    roughness: '/assets/pbr/grass/roughness.jpg',
    normal: '/assets/pbr/grass/normal.jpg',
    license: 'CC0 (Poly Haven leafy_grass)',
  },
  marble: {
    diffuse: '/assets/pbr/marble/diffuse.jpg',
    roughness: '/assets/pbr/marble/roughness.jpg',
    normal: '/assets/pbr/marble/normal.jpg',
    license: 'CC0 (Poly Haven marble_01)',
  },
} as const

export type ResolvedAssetResult =
  | { kind: 'glb'; url: string; entry?: CatalogAssetEntry; flaggedUnmapped: false }
  | {
      kind: 'parametric'
      parametricType:
        | 'rug'
        | 'painting'
        | 'mirror'
        | 'curtain'
        | 'stair'
        | 'console_table'
        | 'kitchen_island'
        | 'kitchen_cabinet'
        | 'bunk_bed'
      flaggedUnmapped: false
    }
  | { kind: 'approximate'; shape: 'cylinder' | 'cabinet' | 'table' | 'box'; flaggedUnmapped: true; reason: string }

export interface FurnitureNamedPartSpec {
  partId: string
  label: string
  surfaceType: 'wood' | 'stone' | 'fabric' | 'metal' | 'glass' | 'tile'
}

export function getNamedPartsForFurniture(instance: any): FurnitureNamedPartSpec[] {
  const tokens = [instance?.category, instance?.asset_id, instance?.name, instance?.id]
    .filter(Boolean)
    .map((s) => normalizeToken(String(s)))
    .join(' ')

  if (/island|dao_bep/.test(tokens)) {
    return [
      { partId: 'countertop', label: 'Mặt đá (Countertop)', surfaceType: 'stone' },
      { partId: 'body', label: 'Thân tủ (Cabinet Body)', surfaceType: 'wood' },
      { partId: 'doors', label: 'Cánh tủ (Cabinet Doors)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Chân đế (Base / Legs)', surfaceType: 'metal' },
    ]
  }
  if (/kitchen_cabinet|counter|tu_bep|cupboard|vanity|bath_vanity/.test(tokens)) {
    return [
      { partId: 'countertop', label: 'Mặt bàn đá (Countertop)', surfaceType: 'stone' },
      { partId: 'body', label: 'Thân tủ (Body)', surfaceType: 'wood' },
      { partId: 'doors', label: 'Cánh tủ (Doors)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Chân / Tay nắm (Legs & Hardware)', surfaceType: 'metal' },
    ]
  }
  if (/bunk|giuong_tang/.test(tokens)) {
    return [
      { partId: 'frame', label: 'Khung giường (Bed Frame)', surfaceType: 'wood' },
      { partId: 'mattress', label: 'Đệm & Chăn (Mattress & Bedding)', surfaceType: 'fabric' },
      { partId: 'steps', label: 'Thang leo & Lan can (Ladder & Guard)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Trụ chân (Corner Posts)', surfaceType: 'wood' },
    ]
  }
  if (/stair|cau_thang/.test(tokens)) {
    return [
      { partId: 'steps', label: 'Mặt bậc thang (Treads)', surfaceType: 'wood' },
      { partId: 'body', label: 'Thân dầm / Cổ bậc (Risers & Stringer)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Lan can / Tay vịn (Railing)', surfaceType: 'metal' },
    ]
  }
  if (/\bbed\b|giuong/.test(tokens)) {
    return [
      { partId: 'frame', label: 'Khung & Đầu giường (Frame & Headboard)', surfaceType: 'wood' },
      { partId: 'mattress', label: 'Đệm & Ga gối (Mattress & Linens)', surfaceType: 'fabric' },
      { partId: 'legs', label: 'Chân giường (Legs)', surfaceType: 'wood' },
    ]
  }
  if (/sofa|couch|loveseat|armchair|ghe_banh|ottoman|pouf/.test(tokens)) {
    return [
      { partId: 'mattress', label: 'Đệm bọc vải (Upholstery)', surfaceType: 'fabric' },
      { partId: 'frame', label: 'Khung sườn (Frame)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Chân ghế (Legs)', surfaceType: 'wood' },
    ]
  }
  if (/wardrobe|dresser|cabinet|nightstand|bookcase|bookshelf|tv_stand|tv_console|credenza/.test(tokens)) {
    return [
      { partId: 'body', label: 'Thân tủ (Body)', surfaceType: 'wood' },
      { partId: 'doors', label: 'Cánh / Ngăn kéo (Doors & Drawers)', surfaceType: 'wood' },
      { partId: 'countertop', label: 'Mặt trên (Top Surface)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Chân đế (Legs)', surfaceType: 'metal' },
    ]
  }
  if (/console_table|ban_console|(?:^|[\s_])console(?:$|[\s_])/.test(tokens) && !/tv_stand|tv_cabinet|tv_console|ke_tivi/.test(tokens)) {
    return [
      { partId: 'countertop', label: 'Mặt đá (Stone Top)', surfaceType: 'stone' },
      { partId: 'frame', label: 'Khung mảnh (Slim Frame)', surfaceType: 'metal' },
      { partId: 'legs', label: 'Chân thanh mảnh (Slim Legs)', surfaceType: 'metal' },
    ]
  }
  if (/kitchen_hood|range_hood|may_hut_mui|(?:^|[\s_])(tv|tivi|television)(?:$|[\s_])/.test(tokens)) {
    return [
      { partId: 'body', label: 'Thân thiết bị (Body)', surfaceType: 'metal' },
      { partId: 'legs', label: 'Chân / Ống (Stand / Flue)', surfaceType: 'metal' },
    ]
  }
  if (/rug|carpet|area_rug|floor_mat|bath_mat|door_mat|tham/.test(tokens)) {
    return [
      { partId: 'body', label: 'Bề mặt thảm (Rug Weave)', surfaceType: 'fabric' },
    ]
  }
  if (/table|desk|ban/.test(tokens)) {
    return [
      { partId: 'countertop', label: 'Mặt bàn (Tabletop)', surfaceType: 'stone' },
      { partId: 'frame', label: 'Khung bàn (Apron / Frame)', surfaceType: 'wood' },
      { partId: 'legs', label: 'Chân bàn (Legs)', surfaceType: 'wood' },
    ]
  }
  return [
    { partId: 'body', label: 'Thân chính (Main Body)', surfaceType: 'wood' },
    { partId: 'legs', label: 'Chân / Đế (Base)', surfaceType: 'metal' },
  ]
}

export function classifyGlbMeshPartName(
  meshName: string,
  matName: string,
  relMinY: number,
  relMaxY: number,
  relCenterZ: number,
  relWidth: number,
  relHeight: number,
  relDepth: number,
  instance: any
): string {
  const mName = String(meshName || '').toLowerCase()
  const mtName = String(matName || '').toLowerCase()
  const tokens = [instance?.category, instance?.asset_id, instance?.name, instance?.id]
    .filter(Boolean)
    .map((s) => normalizeToken(String(s)))
    .join(' ')

  if (/worktop|countertop|tabletop|top_slab/.test(mName)) return 'countertop'
  if (/door|drawer|anta|panel/.test(mName) && !/handle|knob/.test(mName)) return 'doors'
  if (/handle|knob|base-trim|trim|leg|foot|caster/.test(mName)) return 'legs'
  if (/mattress|pillow|cushion|blanket|sheet|duvet/.test(mName)) return 'mattress'
  if (/step|rung|ladder|tread/.test(mName)) return 'steps'

  if (/bunk|giuong_tang/.test(tokens)) {
    if (relHeight < 0.22 && relWidth > 0.45 && relDepth > 0.45) return 'mattress'
    if (relWidth < 0.15 && relDepth < 0.15 && relHeight > 0.6) return 'legs'
    if (relCenterZ > 0.36 || (relHeight < 0.08 && relWidth < 0.45)) return 'steps'
    return 'frame'
  }

  if (/\bbed\b|giuong/.test(tokens)) {
    if (/fabric|linen|cloth|white/.test(mtName) || (relMinY > 0.12 && relMaxY < 0.68 && relWidth > 0.55 && relDepth > 0.45)) {
      return 'mattress'
    }
    if (relMaxY < 0.22) return 'legs'
    return 'frame'
  }

  if (/sofa|couch|loveseat|armchair|ghe_banh/.test(tokens)) {
    if (relMaxY < 0.24 || /metal|chrome|iron/.test(mtName)) return 'legs'
    if (/wood|oak|walnut/.test(mtName)) return 'frame'
    return 'mattress'
  }

  if (/island|dao_bep|kitchen_cabinet|counter|tu_bep|wardrobe|dresser|cabinet|nightstand|bookcase|bookshelf|tv_stand|tv_console|credenza|vanity/.test(tokens)) {
    if (relMinY > 0.82 && relHeight < 0.22) return 'countertop'
    if (relMaxY < 0.16) return 'legs'
    if (relCenterZ > 0.32 && relDepth < 0.25) return 'doors'
    return 'body'
  }

  if (/table|desk|ban/.test(tokens)) {
    if (relMinY > 0.72 || (relMaxY > 0.92 && relHeight < 0.25)) return 'countertop'
    if (relMinY > 0.55 && relMaxY <= 0.92) return 'frame'
    return 'legs'
  }

  return relMaxY < 0.25 ? 'legs' : 'body'
}

function normalizeToken(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-]+/g, '_')
}

function findFirstSlug(catalog: CatalogAssetEntry[], slugs: string[]): CatalogAssetEntry | null {
  for (const s of slugs) {
    const found = catalog.find((e) => e.slug === s)
    if (found) return found
  }
  return null
}

function pickBestCatalogMatch(
  tokens: string[],
  widthMm?: number,
  depthMm?: number,
  packId: string = 'sh3d-japandi'
): CatalogAssetEntry | null {
  const catalog = getCatalogForPack(packId)
  const joined = tokens.join(' ')

  // 1. Specific keyword rules FIRST (specific sub-categories must beat generic aliases like bed/table/chair/cabinet)
  const specificRules: Array<[RegExp, string[]]> = [
    [/bunk|giuong_tang/, ['bed_bunk']],
    [/single_bed|child_bed|kid_bed|giuong_don/, ['bed_single']],
    [/tv_stand|tv_cabinet|tv_console|media_console|ke_tivi/, ['tv_stand', 'dresser']],
    [/kitchen_hood|range_hood|extractor_hood|may_hut_mui/, ['kitchen_hood']],
    [/kitchen_island|(?:^|[\s_])island(?:$|[\s_])|dao_bep/, ['kitchen_island']],
    [/kitchen_cabinet|tu_bep|(?:^|[\s_])counter(?:$|[\s_])/, ['kitchen_cabinet']],
    [/kitchen_sink|(?:^|[\s_])sink(?:$|[\s_])|chau_rua/, ['kitchen_sink']],
    [/fridge|refrigerator|tu_lanh/, ['kitchen_fridge']],
    [/stove|oven|cooker|cooktop|bep_ga|bep_tu/, ['kitchen_stove']],
    [/coffee_table|tea_table|ban_tra|side_table/, ['coffee_table', 'round_marble', 'round_table']],
    [/round_table|ban_tron/, ['round_table', 'round_marble', 'coffee_table']],
    [/(?:^|[\s_])desk(?:$|[\s_])|study_table|work_table|ban_lam_viec|ban_hoc/, ['desk', 'desk_2']],
    [/dining_table|ban_an/, ['dining_table']],
    [/armchair|wing_chair|lounge_chair|ghe_banh|ghe_thu_gian/, ['armchair', 'armchair_wing']],
    [/ottoman|pouf|footstool|don_sofa|don_tron|don_ngoi/, ['ottoman', 'stool']],
    [/(?:^|[\s_])bench(?:$|[\s_])|ghe_bang/, ['bench', 'stool']],
    [/(?:^|[\s_])stool(?:$|[\s_])|bar_stool|ghe_don/, ['stool']],
    [/wardrobe|closet|armoire|tu_quan_ao/, ['wardrobe']],
    [/bookcase|bookshelf|ke_sach|(?:^|[\s_])shelf(?:$|[\s_])/, ['bookcase']],
    [/dresser|chest|credenza|sideboard|tu_ngan_keo/, ['dresser']],
    [/cupboard|cabinet_tall|tu_cao/, ['cupboard', 'wardrobe']],
    [/nightstand|bedside|tab_dau_giuong/, ['nightstand']],
    [/bathtub|bath_tub|(?:^|[\s_])tub(?:$|[\s_])|bon_tam/, ['bath_tub']],
    [/washbasin|vanity|bath_vanity|basin|lavabo/, ['bath_vanity']],
    [/toilet|(?:^|[\s_])wc(?:$|[\s_])|bon_cau/, ['bath_toilet']],
    [/shower|voi_sen|cabin_tam/, ['bath_shower']],
    [/floor_lamp|standing_lamp|den_cay/, ['lamp_table', 'lamp_vase']],
    [/wall_lamp|sconce|ceiling_lamp|pendant|hanging_light|den_tha/, ['lamp_pendant', 'lamp_wall']],
    [/desk_lamp|table_lamp|den_ban/, ['lamp_desk', 'lamp_table']],
    [/television|smart_tv|tivi|(?:^|[\s_])tv(?:$|[\s_])/, ['tv']],
    [/orchid|lan_ho_diep|flower/, ['plant_medium', 'plant_orchid']],
    [/tall_plant|tree|yucca|cay_cao/, ['plant_tall']],
    [/plant_box|planter|bui_hoa/, ['plant_box', 'plant_medium']],
    [/tall_clock|clock_tall/, ['clock_tall']],
  ]

  for (const [rx, slugs] of specificRules) {
    if (rx.test(joined)) {
      if (slugs[0] === 'dining_table' && depthMm && widthMm && Math.max(widthMm, depthMm) <= 950) {
        const small = findFirstSlug(catalog, ['round_table', 'round_marble', 'coffee_table'])
        if (small) return small
      }
      const match = findFirstSlug(catalog, slugs)
      if (match) return match
    }
  }

  // 2. Exact alias match for remaining tokens
  for (const token of tokens) {
    for (const entry of catalog) {
      if (entry.slug === token || entry.aliases.includes(token)) {
        if (token === 'bed' && widthMm && widthMm < 1300) {
          const single = findFirstSlug(catalog, ['bed_single'])
          if (single) return single
        }
        return entry
      }
    }
  }

  // 3. Generic category fallback rules (never default to sofa)
  const genericRules: Array<[RegExp, string[]]> = [
    [/(?:^|[\s_])bed(?:$|[\s_])|giuong/, ['bed_double', 'bed_double_2']],
    [/sofa|couch|loveseat/, ['sofa_3seat', 'sofa_l', 'sofa_2seat', 'sofa_winchester']],
    [/(?:^|[\s_])chair(?:$|[\s_])|(?:^|[\s_])ghe(?:$|[\s_])/, ['chair_dining', 'chair_2']],
    [/(?:^|[\s_])table(?:$|[\s_])|(?:^|[\s_])ban(?:$|[\s_])/, ['dining_table']],
    [/(?:^|[\s_])cabinet(?:$|[\s_])|(?:^|[\s_])tu(?:$|[\s_])/, ['cupboard', 'dresser', 'kitchen_cabinet']],
    [/(?:^|[\s_])lamp(?:$|[\s_])|(?:^|[\s_])den(?:$|[\s_])/, ['lamp_table', 'lamp_desk']],
    [/plant|cay_xanh|(?:^|[\s_])pot(?:$|[\s_])/, ['plant_small', 'plant_medium']],
  ]

  for (const [rx, slugs] of genericRules) {
    if (rx.test(joined)) {
      if (slugs[0] === 'bed_double' && widthMm && widthMm < 1300) {
        const single = findFirstSlug(catalog, ['bed_single'])
        if (single) return single
      }
      if (slugs[0] === 'dining_table' && depthMm && widthMm && Math.max(widthMm, depthMm) <= 950) {
        const small = findFirstSlug(catalog, ['round_table', 'round_marble', 'coffee_table'])
        if (small) return small
      }
      const match = findFirstSlug(catalog, slugs)
      if (match) return match
    }
  }
  return null
}

export function resolveFurnitureAsset(instance: any, packId: string = 'sh3d-japandi'): ResolvedAssetResult {
  const catalog = getCatalogForPack(packId)
  if (
    typeof instance?.normalized_glb === 'string' &&
    instance.normalized_glb.trim().startsWith(`/assets/${packId}/`)
  ) {
    const entry = catalog.find((e) => e.glb_url === instance.normalized_glb.trim())
    return { kind: 'glb', url: instance.normalized_glb.trim(), entry, flaggedUnmapped: false }
  }

  const rawTokens = [instance?.category, instance?.asset_id, instance?.name, instance?.id]
    .filter(Boolean)
    .map((s) => normalizeToken(String(s)))

  const joined = rawTokens.join(' ')

  const isBunk = /bunk|giuong_tang/.test(joined)
  const isTvStand = /tv_stand|tv_cabinet|tv_console|media_console|ke_tivi/.test(joined)

  if (!isTvStand && /console_table|ban_console|(?:^|[\s_])console(?:$|[\s_])/.test(joined)) {
    return { kind: 'parametric', parametricType: 'console_table', flaggedUnmapped: false }
  }
  if (/(?:^|[\s_])(rug|carpet|area_rug|floor_mat|bath_mat|door_mat|tham)(?:$|[\s_])/.test(joined)) {
    return { kind: 'parametric', parametricType: 'rug', flaggedUnmapped: false }
  }
  if (/mirror|guong/.test(joined)) {
    return { kind: 'parametric', parametricType: 'mirror', flaggedUnmapped: false }
  }
  if (/painting|picture|poster|tranh|(?:^|[\s_])(frame|art)(?:$|[\s_])/.test(joined)) {
    return { kind: 'parametric', parametricType: 'painting', flaggedUnmapped: false }
  }
  if (/curtain|drape|blind|(?:^|[\s_])rem(?:$|[\s_])/.test(joined)) {
    return { kind: 'parametric', parametricType: 'curtain', flaggedUnmapped: false }
  }
  if (!isBunk && /stair|cau_thang/.test(joined)) {
    return { kind: 'parametric', parametricType: 'stair', flaggedUnmapped: false }
  }

  const match = pickBestCatalogMatch(rawTokens, instance?.width_mm, instance?.depth_mm, packId)
  if (match) {
    return { kind: 'glb', url: match.glb_url, entry: match, flaggedUnmapped: false }
  }

  // Flag unmapped category & pick approximate non-sofa geometry
  const catLabel = String(instance?.category || instance?.name || 'unknown')
  let shape: 'cylinder' | 'cabinet' | 'table' | 'box' = 'box'
  if (/round|stool|pouf|ottoman|pillar|column/.test(joined)) shape = 'cylinder'
  else if (/shelf|rack|stand|storage|unit|bench/.test(joined)) shape = 'cabinet'
  else if (/desk|table|counter/.test(joined)) shape = 'table'

  return {
    kind: 'approximate',
    shape,
    flaggedUnmapped: true,
    reason: `Unmapped category "${catLabel}" — flagged and rendered as approximate ${shape} (never sofa)`,
  }
}
