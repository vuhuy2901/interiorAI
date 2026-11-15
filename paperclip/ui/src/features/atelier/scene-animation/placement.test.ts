import { describe, expect, it } from 'vitest'
import { PlacementTracker, placementPath, type Snapshot } from './placement'

const snapshot = (revision: number, ids: string[], project_id = 'room'): Snapshot => ({ project_id, revision, furniture_instances: ids.map(id => ({ id })) })
describe('persisted placement tracking', () => {
  it('baselines, deduplicates and rejects stale revisions', () => {
    const tracker = new PlacementTracker()
    expect(tracker.observe(snapshot(5, ['old']), true)).toEqual([])
    expect(tracker.observe(snapshot(6, ['old', 'new']), true)).toEqual(['new'])
    expect(tracker.observe(snapshot(6, ['old', 'new']), true)).toEqual([])
    expect(tracker.observe(snapshot(4, []), true)).toEqual([])
    expect(tracker.observe(snapshot(7, ['old', 'new']), true)).toEqual([])
  })
  it('bounds batch work and baselines disabled and switched scenes', () => {
    const tracker = new PlacementTracker()
    tracker.observe(snapshot(1, []), true)
    expect(tracker.observe(snapshot(2, Array.from({ length: 20 }, (_, i) => `${i}`)), true)).toHaveLength(3)
    expect(tracker.observe(snapshot(3, ['off']), false)).toEqual([])
    expect(tracker.observe(snapshot(3, ['off']), true)).toEqual([])
    expect(tracker.observe(snapshot(1, ['other'], 'other'), true)).toEqual([])
    tracker.reset()
    expect(tracker.observe(snapshot(2, ['other', 'while-hidden'], 'other'), true)).toEqual([])
  })
})
describe('floor routing', () => {
  const room: Snapshot = { ...snapshot(1, []), rooms: [{ polygon_mm: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]] }] }
  const desk = { id: 'desk', x_mm: 3500, y_mm: 1000, width_mm: 1200, depth_mm: 600 }
  it('reaches beside the target and preserves geometry', () => {
    const scene = { ...room, furniture_instances: [desk] }, before = JSON.stringify(scene)
    const path = placementPath(scene, desk)
    expect(path?.length).toBeGreaterThan(1)
    expect(JSON.stringify(scene)).toBe(before)
    expect(path!.every(([x, y]) => x >= 160 && y >= 160 && x <= 4840 && y <= 4840)).toBe(true)
  })
  it('falls back when a wall disconnects the target', () => {
    expect(placementPath({ ...room, furniture_instances: [desk], walls: [{ start_mm: [0, 2500], end_mm: [5000, 2500], thickness_mm: 200 }] }, desk)).toBeNull()
  })
  it('falls back for missing room geometry', () => {
    expect(placementPath(snapshot(1, []), desk)).toBeNull()
  })
})
