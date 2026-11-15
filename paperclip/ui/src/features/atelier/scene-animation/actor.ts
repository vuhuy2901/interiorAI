import * as THREE from 'three'
import { placementPath, type Point, type Snapshot } from './placement'

/** Owns only the temporary actor. Furniture groups retain their canonical transforms. */
export function createPlacementAnimation(scene: THREE.Scene, snapshot: Snapshot, ids: string[], render: () => void, status: (text: string) => void) {
  const actor = new THREE.Group(), body = new THREE.Group()
  const geometry = new THREE.SphereGeometry(1, 10, 8)
  const material = new THREE.MeshStandardMaterial({ color: '#276e70', roughness: .8 })
  const dark = new THREE.MeshStandardMaterial({ color: '#343c43', roughness: .8 })
  function part(parent: THREE.Group, x: number, y: number, sx: number, sy: number, sz: number, mat = material) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, 0); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh
  }
  actor.add(body)
  part(body, 0, .85, .18, .28, .13)
  part(body, 0, 1.25, .16, .17, .16, dark)
  const left = part(body, -.11, .32, .07, .28, .08, dark), right = part(body, .11, .32, .07, .28, .08, dark)
  const armL = part(body, -.23, .8, .06, .24, .06), armR = part(body, .23, .8, .06, .24, .06)
  actor.visible = false; scene.add(actor)
  const pending = new Set(ids), ready = new Map<string, THREE.Group>(), hidden = new Set<THREE.Group>()
  const highlights: { mesh: THREE.Mesh; timer: ReturnType<typeof setTimeout> }[] = []
  let raf = 0, timer: ReturnType<typeof setTimeout> | undefined, stopped = false, started = performance.now(), active: string | null = null
  function flush() {
    stopped = true; cancelAnimationFrame(raf); clearTimeout(timer)
    hidden.forEach(group => { group.visible = true }); hidden.clear(); actor.visible = false
    ready.forEach(group => group.scale.setScalar(1))
    highlights.forEach(({ mesh, timer }) => { clearTimeout(timer); scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }); highlights.length = 0
    pending.clear(); status(''); render()
  }
  function run() {
    if (stopped || active) return
    const candidate = [...pending].find(value => ready.has(value))
    if (!candidate) return
    const id: string = candidate
    active = id
    const group = ready.get(id)!, item = snapshot.furniture_instances.find(value => value.id === id)!
    const path = placementPath(snapshot, item)
    if (!path || performance.now() - started > 7500) {
      group.visible = true; hidden.delete(group); pending.delete(id); active = null
      const ring = new THREE.Mesh(new THREE.RingGeometry(.35, .4, 32), new THREE.MeshBasicMaterial({ color: '#276e70', transparent: true, opacity: .65, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2; ring.position.set((item.x_mm ?? 2000) / 1000, .015, (item.y_mm ?? 2500) / 1000); scene.add(ring)
      const timer = setTimeout(() => { ring.visible = false; render() }, 700)
      highlights.push({ mesh: ring, timer })
      status(`Đã cập nhật ${item.name || 'đồ nội thất'}`); render(); run(); return
    }
    const route: Point[] = path
    const lengths = route.map((p, i) => i ? Math.hypot(p[0] - route[i - 1][0], p[1] - route[i - 1][1]) : 0)
    const total = lengths.reduce((a, b) => a + b, 0)
    function at(fraction: number): Point {
      let remaining = total * fraction
      for (let i = 1; i < route.length; i++) {
        if (remaining <= lengths[i]) { const f = remaining / lengths[i]; return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * f, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * f] }
        remaining -= lengths[i]
      }
      return route[route.length - 1]
    }
    actor.visible = true; const begin = performance.now(); let revealed = false, placing = false
    status(`Đang tới vị trí ${item.name || 'đồ nội thất'} · cập nhật đã lưu`)
    function frame(now: number) {
      if (stopped) return
      const t = (now - begin) / 1000, moving = t < 1.1 || t > 1.7
      const f = t < 1.1 ? Math.min(1, t / 1.1) : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / .9)
      const p = at(f), next = at(Math.min(1, f + .015))
      actor.position.set(p[0] / 1000, 0, p[1] / 1000)
      if (p[0] !== next[0] || p[1] !== next[1]) actor.rotation.y = Math.atan2(next[0] - p[0], next[1] - p[1]) + (t > 1.7 ? Math.PI : 0)
      body.position.y = moving ? Math.abs(Math.sin(t * 18)) * .025 : 0
      left.rotation.x = moving ? Math.sin(t * 18) * .5 : 0; right.rotation.x = -left.rotation.x
      armL.rotation.x = -left.rotation.x; armR.rotation.x = left.rotation.x
      body.rotation.x = t > 1.1 && t < 1.7 ? Math.sin((t - 1.1) / .6 * Math.PI) * .25 : 0
      if (t >= 1.1 && !placing) { placing = true; status(`Đang đặt ${item.name || 'đồ nội thất'}`) }
      if (t >= 1.4) {
        if (!revealed) { revealed = true; group.visible = true; hidden.delete(group) }
        const reveal = Math.min(1, (t - 1.4) / .25); group.scale.setScalar(.96 + .04 * reveal)
      }
      render()
      if (t < 2.6) raf = requestAnimationFrame(frame)
      else { group.scale.setScalar(1); actor.visible = false; pending.delete(id); active = null; status(`Đã đặt ${item.name || 'đồ nội thất'}`); render(); run() }
    }
    raf = requestAnimationFrame(frame)
  }
  if (ids.length) timer = setTimeout(flush, 9500)
  const visibility = () => { if (document.hidden) flush() }
  document.addEventListener('visibilitychange', visibility)
  return {
    register(id: string, group: THREE.Group) { if (!pending.has(id) || stopped) return; ready.set(id, group); group.visible = false; hidden.add(group); run() },
    failed(id: string) { if (!pending.has(id)) return; pending.delete(id); status('Một mô hình chưa tải được'); render() },
    dispose() { flush(); ready.forEach(group => group.scale.setScalar(1)); document.removeEventListener('visibilitychange', visibility); scene.remove(actor); geometry.dispose(); material.dispose(); dark.dispose() },
  }
}
