import { describe, expect, it, vi } from 'vitest'

// catalogData tải JSON qua fetch ở top-level; trong Node dùng catalog rỗng.
vi.mock('./catalogData', () => ({
  pbrCatalogData: { materials: [], style_presets: [] },
  japandiCatalogData: { items: [] },
  classicCatalogData: { items: [] },
}))

import { DEFAULT_ASSET_PACK, getAssetPackForStylePreset } from './pbrCatalog'

describe('asset pack selection (FEAT-2026-128)', () => {
  it('uses sh3d-classic for Modern and for an unspecified style', () => {
    expect(DEFAULT_ASSET_PACK).toBe('sh3d-classic')
    expect(getAssetPackForStylePreset(null, 'Modern')).toBe('sh3d-classic')
    expect(getAssetPackForStylePreset(undefined, undefined)).toBe('sh3d-classic')
    expect(getAssetPackForStylePreset(null, 'Tân cổ điển')).toBe('sh3d-classic')
  })

  it('uses sh3d-japandi only when the style is Japandi', () => {
    expect(getAssetPackForStylePreset(null, 'Japandi')).toBe('sh3d-japandi')
    expect(getAssetPackForStylePreset('japandi', null)).toBe('sh3d-japandi')
  })
})
