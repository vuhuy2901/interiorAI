import * as THREE from 'three'

// Pure motion helpers for the construction replay (FEAT-2026-125).
export const LAND_START = 0.56
export const LAND_END = 0.66
export const LAND_DROP_M = 0.15
export const RING_SECONDS = 0.6
export const ITEM_GAP_SECONDS = 0.5
export const CAMERA_MAX_FRACTION = 0.3

export const easeInOutCubic = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export interface LandingPose { active: boolean; yOffset: number; scale: number; opacity: number }
/** Landing proxy pose for job progress p. Ends at offset 0, scale 1, opacity 1. */
export function landingPose(p: number): LandingPose {
  if (p < LAND_START || p > LAND_END) return { active: false, yOffset: 0, scale: 1, opacity: p > LAND_END ? 1 : 0 }
  const k = easeInOutCubic((p - LAND_START) / (LAND_END - LAND_START))
  return { active: true, yOffset: LAND_DROP_M * (1 - k), scale: 0.96 + 0.04 * k, opacity: k }
}

export interface RingPose { alive: boolean; scale: number; opacity: number }
export function ringPose(age: number): RingPose {
  const k = Math.min(1, Math.max(0, age / RING_SECONDS))
  return { alive: age < RING_SECONDS, scale: 0.6 + 0.8 * easeInOutCubic(k), opacity: 0.7 * (1 - k) }
}

/** 0 = overview, 1 = closest to the item being placed. */
export function cameraBlend(p: number) {
  const s = (a: number, b: number, x: number) => easeInOutCubic((x - a) / (b - a))
  if (p <= 0.3 || p >= 0.9) return 0
  if (p < 0.5) return s(0.3, 0.5, p)
  if (p <= 0.73) return 1
  return 1 - s(0.73, 0.9, p)
}

export interface CameraPose { position: THREE.Vector3; target: THREE.Vector3 }
/** Limited move toward the item: at most CAMERA_MAX_FRACTION of the way, never above the roof line. */
export function focusPose(base: CameraPose, itemCenter: THREE.Vector3, bounds: THREE.Box3, blend: number): CameraPose {
  const w = Math.min(1, Math.max(0, blend))
  // A point between the overview camera and the item stays inside their hull, so only height needs a limit.
  const position = base.position.clone().lerp(itemCenter, CAMERA_MAX_FRACTION * w)
  const roof = Math.max(bounds.min.y + 0.5, bounds.max.y - 0.5)
  position.y = Math.min(position.y, Math.max(base.position.y, roof))
  const target = base.target.clone().lerp(itemCenter, 0.6 * w)
  return { position, target }
}
