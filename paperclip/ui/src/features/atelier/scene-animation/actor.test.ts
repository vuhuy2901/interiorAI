import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createPlacementAnimation } from './actor'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('placement presentation lifecycle', () => {
  it('reveals the exact furniture group, settles batch work and releases the actor', () => {
    vi.useFakeTimers()
    let now = 0, nextId = 0
    const frames = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextId, cb); return nextId })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const scene = new THREE.Scene(), group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    group.add(mesh); group.position.set(3.5, 0, 1); group.rotation.y = .3; scene.add(group)
    const status = vi.fn(), render = vi.fn()
    const animation = createPlacementAnimation(scene, { project_id: 'room', revision: 2, rooms: [{ polygon_mm: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]] }], furniture_instances: [{ id: 'desk', x_mm: 3500, y_mm: 1000, width_mm: 1200, depth_mm: 600 }] }, ['desk'], render, status)
    animation.register('desk', group)
    expect(group.visible).toBe(false)
    for (now = 16; now < 2800; now += 16) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(now)) }
    expect(group.visible).toBe(true)
    expect(group.children[0]).toBe(mesh)
    expect(group.position.toArray()).toEqual([3.5, 0, 1])
    expect(group.rotation.y).toBe(.3)
    expect(group.scale.toArray()).toEqual([1, 1, 1])
    expect(frames.size).toBe(0)
    animation.dispose()
    expect(scene.children).toEqual([group])
    expect(vi.getTimerCount()).toBe(0)
  })
})
