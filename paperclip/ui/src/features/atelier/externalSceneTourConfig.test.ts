import { describe, expect, it } from 'vitest'
import { externalSceneTourConfig } from './externalSceneTourConfig'

describe('external scene tour camera', () => {
  it('uses a dedicated interior pose for Small Apartment Morning', () => {
    const config = externalSceneTourConfig('small_apartment_morning_source')!
    expect(config).toBeTruthy()
    expect(config.eye).toEqual([0.462467819, 1.55, 5.931346416])
    expect(config.eye[0]).toBeGreaterThan(config.walkBounds.min[0])
    expect(config.eye[0]).toBeLessThan(config.walkBounds.max[0])
    expect(config.eye[2]).toBeGreaterThan(config.walkBounds.min[1])
    expect(config.eye[2]).toBeLessThan(config.walkBounds.max[1])
    expect(config.target).not.toEqual(externalSceneTourConfig('modern_apartment_source')?.target)
  })

  it('does not apply another project camera to an unknown GLB', () => {
    expect(externalSceneTourConfig('different_project')).toBeNull()
  })
})
