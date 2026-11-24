export interface ExternalSceneTourConfig {
  eye: [number, number, number]
  target: [number, number, number]
  walkBounds: { min: [number, number]; max: [number, number] }
  floorY?: number
}

const CONFIGS: Record<string, ExternalSceneTourConfig> = {
  modern_apartment_source: {
    eye: [-4.25079453, 1.55, 1.9549881],
    target: [5.12886012, 1.2, 1.3614986],
    walkBounds: { min: [-5.7, -0.8], max: [13.4, 3.8] },
  },
  small_apartment_morning_source: {
    // Converted from the verified Blender/Cycles camera for this GLB:
    // Blender (x,y,z) -> Three/glTF (x,z,-y). The inset walk rectangle
    // stays inside the calibrated 4.204 x 10.226 m apartment envelope.
    eye: [0.462467819, 1.55, 5.931346416],
    target: [3.935608, 0.907477, 4.054],
    walkBounds: { min: [0.34, 0.38], max: [3.86, 9.84] },
    floorY: 0.03,
  },
}

export function externalSceneTourConfig(assetId: string | null | undefined) {
  return assetId ? CONFIGS[assetId] ?? null : null
}
