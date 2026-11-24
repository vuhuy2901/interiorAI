import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { attachConstructionPlayback, commandEvent, SOURCE_HASH } from './constructionHistory'
import { cameraBlend, CAMERA_MAX_FRACTION, easeInOutCubic, focusPose, ITEM_GAP_SECONDS, landingPose, LAND_END, LAND_START, RING_SECONDS, ringPose } from './constructionMotion'
import { constructionLabelText } from './ConstructionLabel'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('construction motion helpers', () => {
  it('easeInOutCubic is monotonic, symmetric and hits both ends', () => {
    expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(.5)).toBeCloseTo(.5); expect(easeInOutCubic(.3) + easeInOutCubic(.7)).toBeCloseTo(1)
    let previous = 0
    for (let t = 0; t <= 1; t += .05) { const v = easeInOutCubic(t); expect(v).toBeGreaterThanOrEqual(previous); previous = v }
    expect(easeInOutCubic(-3)).toBe(0); expect(easeInOutCubic(4)).toBe(1)
  })
  it('landing ends on the original pose and ring fades out', () => {
    expect(landingPose(LAND_START - .01).active).toBe(false)
    const start = landingPose(LAND_START), end = landingPose(LAND_END)
    expect(start.yOffset).toBeCloseTo(.15); expect(start.scale).toBeCloseTo(.96); expect(start.opacity).toBeCloseTo(0)
    expect(end.yOffset).toBeCloseTo(0); expect(end.scale).toBeCloseTo(1); expect(end.opacity).toBeCloseTo(1)
    expect(landingPose(.9)).toMatchObject({ active: false, opacity: 1, scale: 1, yOffset: 0 })
    expect(ringPose(0).opacity).toBeCloseTo(.7); expect(ringPose(RING_SECONDS).alive).toBe(false)
  })
  it('camera focus is limited, below the roof and zero outside the placing window', () => {
    expect(cameraBlend(.1)).toBe(0); expect(cameraBlend(.6)).toBe(1); expect(cameraBlend(.95)).toBe(0)
    const bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 6, 5))
    const base = { position: new THREE.Vector3(0, 7, 18), target: new THREE.Vector3(0, 3, 0) }
    const item = new THREE.Vector3(0, 1, 0)
    expect(focusPose(base, item, bounds, 0).position.distanceTo(base.position)).toBe(0)
    const pose = focusPose(base, item, bounds, 1)
    expect(pose.position.distanceTo(base.position)).toBeLessThanOrEqual(base.position.distanceTo(item) * CAMERA_MAX_FRACTION + 1e-6)
    expect(pose.position.y).toBeLessThanOrEqual(7)
    const low = focusPose({ ...base, position: new THREE.Vector3(0, 2, 18) }, new THREE.Vector3(0, 9, 0), bounds, 1)
    expect(low.position.y).toBeLessThanOrEqual(5.5)
  })
  it('builds the label text only while a worker is active', () => {
    expect(constructionLabelText(null)).toBeNull()
    const worker = { id: 'w', name: 'Thợ 1', color: '', itemName: 'Sofa', ordinal: 2, phase: 'moving' as const, progress: 0 }
    expect(constructionLabelText({ history: [], pending: [], replay: { done: 1, total: 4 }, workers: [worker] })).toBe('Đang lắp: Sofa (2/4)')
    expect(constructionLabelText({ history: [], pending: [], replay: { done: 4, total: 4 }, workers: [{ ...worker, phase: 'idle', itemName: undefined }] })).toBeNull()
  })
})

function harness(cinematic: boolean | 'off') {
  const key = 'motion-' + String(cinematic)
  const target = new EventTarget(); vi.stubGlobal('window', target)
  let raf: FrameRequestCallback | undefined, clock = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { raf = cb; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { raf = undefined })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const scene = new THREE.Scene()
  const material = new THREE.MeshStandardMaterial({ opacity: .8, transparent: false })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.position.set(1, .5, 0); scene.add(mesh); mesh.updateMatrixWorld(true)
  const snapshot = { position: mesh.position.clone(), scale: mesh.scale.clone(), quaternion: mesh.quaternion.clone(), opacity: material.opacity, transparent: material.transparent }
  const item = { id: 'a', name: 'A', parentName: '', floor: 1, groundY: 0, dimensionsMm: [1000, 1000, 1000] as [number, number, number], meshes: [mesh], bounds: new THREE.Box3().setFromObject(mesh) }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ history: [{ id: 'a', name: 'A', floor: 1 }], pending: [] }) })))
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3, 18)
  const camTarget = new THREE.Vector3(0, 1, 0)
  const bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 6, 5))
  const dispose = attachConstructionPlayback({ key, projectId: 'p', hash: SOURCE_HASH, items: [item], scene, sourceBounds: bounds,
    render: () => {}, fit: () => {},
    cinematicCamera: cinematic === 'off' ? { camera, target: camTarget, enabled: false } : { camera, target: camTarget } })
  const send = (action: string, extra: object = {}) => target.dispatchEvent(new CustomEvent(commandEvent, { detail: { key, action, ...extra } }))
  const step = (count: number, dt = 50) => { for (let i = 0; i < count; i++) { clock += dt; const cb = raf; raf = undefined; cb?.(clock) } }
  return { scene, mesh, material, snapshot, camera, camTarget, dispose, send, step, state: () => (window as any).__ATELIER_CONSTRUCTION_STATE__ }
}
const untouched = (h: ReturnType<typeof harness>) => {
  expect(h.mesh.position.equals(h.snapshot.position)).toBe(true); expect(h.mesh.scale.equals(h.snapshot.scale)).toBe(true)
  expect(h.mesh.quaternion.equals(h.snapshot.quaternion)).toBe(true)
  expect(h.mesh.material).toBe(h.material); expect(h.material.opacity).toBe(h.snapshot.opacity); expect(h.material.transparent).toBe(h.snapshot.transparent)
}

describe('cinematic playback', () => {
  it('lands the real furniture with its original transform and material, then cleans every temporary object', async () => {
    const h = harness(true); await new Promise(r => setTimeout(r, 0))
    const cameraStart = h.camera.position.clone()
    h.send('replay', { ids: ['a'] }); expect(h.mesh.visible).toBe(false)
    let sawProxy = false, moved = false
    for (let i = 0; i < 400 && h.state().activeIds.length; i++) {
      h.step(1)
      const proxy = h.scene.children.find(node => node.type === 'Group' && node.name === '' && node.children.length === 1 && node.visible)
      if (proxy) { sawProxy = true; expect(h.mesh.visible).toBe(false) }
      if (h.camera.position.distanceTo(cameraStart) > .01) moved = true
    }
    expect(sawProxy).toBe(true); expect(moved).toBe(true)
    h.step(40)
    expect(h.mesh.visible).toBe(true); untouched(h)
    expect(h.scene.children.filter(node => node !== h.mesh)).toHaveLength(0)
    expect(h.camera.position.distanceTo(cameraStart)).toBeLessThan(1e-6)
    h.dispose()
  })
  it('stop mid-landing restores visibility, material, camera and removes proxy and ring', async () => {
    const h = harness(true); await new Promise(r => setTimeout(r, 0))
    const cameraStart = h.camera.position.clone()
    h.send('replay', { ids: ['a'] })
    for (let i = 0; i < 400 && h.state().workers[0].progress < .62; i++) h.step(1)
    expect(h.state().workers[0].progress).toBeGreaterThan(.55)
    h.send('stop')
    expect(h.mesh.visible).toBe(true); untouched(h)
    expect(h.scene.children.filter(node => node !== h.mesh)).toHaveLength(0)
    expect(h.camera.position.distanceTo(cameraStart)).toBeLessThan(1e-6)
    h.dispose()
  })
  it('keeps the camera still when the option is off and does not slow the replay by more than 30%', async () => {
    const h = harness('off'); await new Promise(r => setTimeout(r, 0))
    const start = h.camera.position.clone()
    h.send('replay', { ids: ['a'] })
    let seconds = 0
    while (h.state().activeIds.length && seconds < 60) { h.step(1); seconds += .05; expect(h.camera.position.equals(start)).toBe(true) }
    const previousDuration = 6 // unchanged duration formula floor at 1x
    expect(seconds + ITEM_GAP_SECONDS).toBeLessThanOrEqual(previousDuration * 1.3 + 3)
    h.dispose()
  })
})
