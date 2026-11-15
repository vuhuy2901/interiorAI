import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createDeliveryWorker,
  findChangedFurniture,
  resolveDeliveryEntry,
  snapshotFurniture,
} from './furnitureDeliveryAnimation'

describe('furniture delivery animation', () => {
  it('detects newly added and repositioned furniture', () => {
    const previous = snapshotFurniture([
      { id: 'bed', x_mm: 1000, y_mm: 1000, rotation_deg: 0 },
      { id: 'tv', x_mm: 200, y_mm: 2500, rotation_deg: 90 },
    ])
    const changed = findChangedFurniture(previous, [
      { id: 'bed', x_mm: 1000, y_mm: 400, rotation_deg: 0 },
      { id: 'tv', x_mm: 200, y_mm: 2500, rotation_deg: 90 },
      { id: 'safe', x_mm: 5600, y_mm: 400, rotation_deg: 0 },
    ])
    expect(changed.map((item) => item.id)).toEqual(['bed', 'safe'])
  })

  it('enters through the door and offsets toward the room center', () => {
    const entry = resolveDeliveryEntry(
      [{ wall_id: 'south', t: 0.5 }],
      [{ id: 'south', start_mm: [0, 6000], end_mm: [6000, 6000] }],
      new THREE.Vector3(3, 0, 3),
    )
    expect(entry.x).toBeCloseTo(3)
    expect(entry.z).toBeLessThan(6)
  })

  it('creates a self-contained worker and cargo proxy', () => {
    const worker = createDeliveryWorker({ id: 'bench', width_mm: 1200, depth_mm: 400, height_mm: 450 })
    expect(worker.root.name).toBe('atelier-delivery-worker')
    expect(worker.cargo.parent).toBe(worker.root)
    expect(worker.root.children.length).toBeGreaterThanOrEqual(8)
  })
})
