import { describe, expect, it } from 'vitest'
import { buildWallSolidRects } from './openingGeometry'

describe('wall opening geometry', () => {
  it('removes a full-height door opening from the lower wall', () => {
    const solids = buildWallSolidRects(4, 2.7, [
      { start: 3.14, end: 4, bottom: 0, top: 2.1 },
    ])

    expect(solids).toContainEqual({ start: 0, end: 3.14, bottom: 0, top: 2.7 })
    expect(solids).toContainEqual({ start: 3.14, end: 4, bottom: 2.1, top: 2.7 })
    expect(solids.some((rect) => rect.start >= 3.14 && rect.bottom === 0)).toBe(false)
  })

  it('keeps wall below and above an embedded window', () => {
    const solids = buildWallSolidRects(4, 2.7, [
      { start: 2.05, end: 3.25, bottom: 0.9, top: 2.1 },
    ])

    expect(solids).toContainEqual({ start: 2.05, end: 3.25, bottom: 0, top: 0.9 })
    expect(solids).toContainEqual({ start: 2.05, end: 3.25, bottom: 2.1, top: 2.7 })
    expect(solids.some((rect) => rect.start === 2.05 && rect.bottom === 0.9)).toBe(false)
  })
})
