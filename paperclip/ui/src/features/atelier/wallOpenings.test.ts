import { describe, expect, it } from 'vitest'
import { buildWallSolidSegments, resolveWallOpeningPlacement } from './wallOpenings'

describe('wall opening geometry', () => {
  it('rotates a window with a vertical host wall', () => {
    const placement = resolveWallOpeningPlacement(
      { start_mm: [10450, 0], end_mm: [10450, 10450] },
      { t: 0.28, width_mm: 1800 },
    )

    expect(placement).not.toBeNull()
    expect(placement?.centerXmm).toBeCloseTo(10450)
    expect(placement?.centerYmm).toBeCloseTo(2926)
    expect(placement?.angleDeg).toBeCloseTo(90)
    expect(placement?.widthMm).toBeCloseTo(1800)
  })

  it('leaves solid wall below and above a window', () => {
    const segments = buildWallSolidSegments(4600, 2800, [
      { t: 0.5, width_mm: 1600, height_mm: 1400, sill_height_mm: 900 },
    ])

    expect(segments).toEqual([
      { startMm: 0, endMm: 1500, bottomMm: 0, topMm: 2800 },
      { startMm: 1500, endMm: 3100, bottomMm: 0, topMm: 900 },
      { startMm: 1500, endMm: 3100, bottomMm: 2300, topMm: 2800 },
      { startMm: 3100, endMm: 4600, bottomMm: 0, topMm: 2800 },
    ])
  })

  it('cuts a door from floor level without removing the wall header', () => {
    const segments = buildWallSolidSegments(4000, 2800, [
      { t: 0.5, width_mm: 1000, height_mm: 2100, sill_height_mm: 0 },
    ])

    expect(segments).toContainEqual({ startMm: 1500, endMm: 2500, bottomMm: 2100, topMm: 2800 })
    expect(segments).not.toContainEqual({ startMm: 1500, endMm: 2500, bottomMm: 0, topMm: 2100 })
  })
})
