import * as THREE from 'three'
import { applyWalkCycle, createDeliveryWorker, type DeliveryWorker } from './furnitureDeliveryAnimation'
import { oppositeEntry, commandEvent, stateEvent,
  type ConstructionAction, type ConstructionItem, type ConstructionState,
  type ConstructionWorkerState, type HistoryRecord, type PlaybackSpeed } from './constructionHistory'

export const CONSTRUCTION_WORKERS = [
  { id: 'worker-1', name: 'Thợ 1', shirtColor: '#0f766e' },
  { id: 'worker-2', name: 'Thợ 2', shirtColor: '#2563eb' },
  { id: 'worker-3', name: 'Thợ 3', shirtColor: '#ea580c' },
] as const
const pageSpeeds = new Map<string, PlaybackSpeed>()
interface Job {
  item: ConstructionItem; worker: DeliveryWorker; cargo: THREE.Group
  entry: THREE.Vector3; approach: THREE.Vector3; target: THREE.Vector3
  duration: number; elapsed: number; placed: boolean; phase: ConstructionWorkerState['phase']
  cleanup: () => void
}
export function attachConstructionPlayback(options: {
  key: string; projectId: string; hash: string; items: ConstructionItem[]; scene: THREE.Scene
  sourceBounds: THREE.Box3; render: () => void; fit: (bounds: THREE.Box3) => void
}) {
  const { key, items, scene, render } = options
  const byId = new Map(items.map(item => [item.id, item]))
  const original = new Map<THREE.Mesh, boolean>()
  items.forEach(item => item.meshes.forEach(mesh => original.set(mesh, mesh.visible)))
  const jobs: Array<Job | null> = [null, null, null]
  let state: ConstructionState = { history: [], pending: [], speed: pageSpeeds.get(key) || 1, workers: [] }
  let dead = false, frame: number | null = null, last = 0
  let queue: string[] = [], highlight: THREE.Box3Helper | null = null
  const url = `/api/v1/projects/${encodeURIComponent(options.projectId)}/construction-history`
  const workerStates = (): ConstructionWorkerState[] => CONSTRUCTION_WORKERS.map((worker, index) => {
    const job = jobs[index]
    return { id: worker.id, name: worker.name, color: worker.shirtColor,
      itemId: job?.item.id, itemName: job?.item.name, phase: job?.phase || 'idle',
      progress: job ? Math.min(1, job.elapsed / job.duration) : 0 }
  })
  const diagnostics = () => {
    const first = jobs.find(job => job !== null)
    ;(window as any).__ATELIER_CONSTRUCTION_STATE__ = {
      key, ...state, workers: workerStates(),
      activeIds: jobs.flatMap(job => job ? [job.item.id] : []), queuedIds: [...queue],
      progress: first ? Math.min(1, first.elapsed / first.duration) : undefined,
      floor: first?.item.floor, floorY: first?.item.groundY, workerY: first?.worker.root.position.y,
      entry: first?.entry.toArray(), target: first?.target.toArray(),
      workerPositions: jobs.flatMap((job,index) => job ? [{id:CONSTRUCTION_WORKERS[index].id,
        itemId:job.item.id, floor:job.item.floor, floorY:job.item.groundY, position:job.worker.root.position.toArray()}] : []),
      visible: items.filter(item => item.meshes.every(mesh => mesh.visible)).map(item => item.id),
    }
  }
  const publish = () => {
    state = { ...state, active: jobs.find(job => job !== null)?.item.id, workers: workerStates() }
    diagnostics()
    window.dispatchEvent(new CustomEvent(stateEvent, { detail: { key, ...state } }))
  }
  let writes = Promise.resolve()
  const save = (op: string, records: HistoryRecord[]) => {
    writes = writes.then(async () => {
      const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ asset_hash: options.hash, op, records,
          source_ids: items.filter(item => item.id.startsWith('construction:')).map(item => item.id) }) })
      if (!response.ok) throw new Error(`Không lưu được lịch sử (${response.status})`)
      const saved = await response.json()
      if (dead) return
      state = { ...state, history: saved.history, pending: saved.pending }
      const included = new Set([...state.history, ...state.pending].map(record => record.id))
      items.forEach(item => {
        if (item.sourceGroup && included.has(item.id) && item.sourceGroup.parent !== scene) scene.attach(item.sourceGroup)
      })
      publish(); render()
    }).catch(error => { if (!dead) { state.error = String(error); publish() } })
    return writes
  }
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null; queue = []
    jobs.forEach((job,index) => { job?.cleanup(); jobs[index] = null })
    original.forEach((visible,mesh) => { mesh.visible = visible })
    state.paused = false
    if (!dead) { publish(); render() }
  }
  const makeJob = (item: ConstructionItem, index: number): Job => {
    const target = item.bounds.getCenter(new THREE.Vector3()).setY(item.groundY)
    const floorBounds = new THREE.Box3()
    items.filter(other => other.floor === item.floor).forEach(other => floorBounds.union(other.bounds))
    const entry = oppositeEntry(item.floorBounds || (floorBounds.isEmpty() ? options.sourceBounds : floorBounds), target, item.groundY)
    const direction = entry.clone().sub(target).setY(0).normalize()
    const size = item.bounds.getSize(new THREE.Vector3())
    const approach = target.clone().addScaledVector(direction, Math.abs(direction.x)*size.x/2 + Math.abs(direction.z)*size.z/2 + .7)
    const worker = createDeliveryWorker({id:item.id}, CONSTRUCTION_WORKERS[index])
    worker.cargo.visible = false
    worker.root.position.copy(entry)
    const copies = new THREE.Group()
    item.meshes.forEach(mesh => {
      const copy = new THREE.Mesh(mesh.geometry, mesh.material)
      copy.applyMatrix4(mesh.matrixWorld); copies.add(copy)
    })
    const cargo = new THREE.Group(); cargo.add(copies)
    copies.position.copy(item.bounds.getCenter(new THREE.Vector3())).negate()
    cargo.scale.setScalar(Math.min(1, .85 / Math.max(.001, size.x, size.y, size.z)))
    cargo.position.set(0,.9,.65); worker.root.add(cargo); scene.add(worker.root)
    const borrowed = new Set(copies.children)
    const cleanup = () => {
      scene.remove(worker.root)
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
      worker.root.traverse(node => {
        if (!(node as THREE.Mesh).isMesh || borrowed.has(node)) return
        const mesh = node as THREE.Mesh; geometries.add(mesh.geometry)
        ;(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material))
      })
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    }
    return { item, worker, cargo, entry, target, approach, cleanup, elapsed:0, placed:false, phase:'moving',
      duration:Math.max(6,entry.distanceTo(approach)*.65+3) }
  }
  const fillSlots = () => {
    for (let index = 0; index < jobs.length && queue.length; index++) {
      if (jobs[index]) continue
      const item = byId.get(queue.shift()!)
      if (item) jobs[index] = makeJob(item,index)
    }
  }
  const tick = (now: number) => {
    frame = null
    if (dead) return
    const delta = Math.max(0, Math.min(.1, (now-last)/1000)); last = now
    let changed = false
    if (!state.paused) {
      for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index]; if (!job) continue
        job.elapsed += delta * (state.speed || 1)
        const p = Math.min(1,job.elapsed/job.duration)
        const phase = p < .55 ? 'moving' : p < .73 ? 'placing' : 'returning'
        if (phase !== job.phase) { job.phase = phase; changed = true }
        // This event must fire even if a fast frame crosses the entire placement phase.
        if (p >= .66 && !job.placed) {
          job.placed = true; job.cargo.visible = false
          job.item.meshes.forEach(mesh => { mesh.visible = original.get(mesh) ?? true })
          if (state.pending.some(record => record.id === job.item.id)) void save('complete', [{id:job.item.id,name:job.item.name,floor:job.item.floor}])
        }
        if (phase === 'moving') {
          job.worker.root.position.lerpVectors(job.entry,job.approach,THREE.MathUtils.smoothstep(p/.55,0,1))
          job.worker.root.lookAt(job.approach)
        } else if (phase === 'placing') job.worker.root.position.copy(job.approach)
        else {
          job.worker.root.position.lerpVectors(job.approach,job.entry,THREE.MathUtils.smoothstep((p-.73)/.27,0,1))
          job.worker.root.lookAt(job.entry)
        }
        applyWalkCycle(job.worker,job.elapsed,phase!=='placing' && p<1,job.item.groundY)
        if (phase === 'placing') job.worker.leftArm.rotation.x = job.worker.rightArm.rotation.x = -.7
        if (p >= 1) { job.cleanup(); jobs[index] = null; changed = true }
      }
      fillSlots()
    }
    if (changed) publish(); else diagnostics()
    render()
    if (jobs.some(Boolean)) frame = requestAnimationFrame(tick)
    else publish()
  }
  const play = (ids: string[]) => {
    stop(); if (highlight) highlight.visible = false
    queue = [...new Set(ids)].filter(id => byId.has(id)); if (!queue.length) return
    queue.forEach(id => byId.get(id)!.meshes.forEach(mesh => { mesh.visible = false }))
    options.fit(options.sourceBounds); fillSlots(); publish()
    last = performance.now(); frame = requestAnimationFrame(tick)
  }
  const listener = (event: Event) => {
    const command = (event as CustomEvent<ConstructionAction>).detail
    if (command.key !== key) return
    if (command.action === 'stop') stop()
    if (command.action === 'state') publish()
    if (command.action === 'pause') { state.paused = !state.paused; last = performance.now(); publish() }
    if (command.action === 'speed' && [1,2,5].includes(command.speed!)) {
      state.speed = command.speed; pageSpeeds.set(key,command.speed!); last = performance.now(); publish()
    }
    if (command.action === 'replay') play(command.ids || [])
    if (command.action === 'select') {
      if (highlight) { scene.remove(highlight); highlight.geometry.dispose(); (highlight.material as THREE.Material).dispose(); highlight = null }
      const item = byId.get(command.id || '')
      if (item) { highlight = new THREE.Box3Helper(item.bounds.clone(),new THREE.Color('#14b8a6')); scene.add(highlight) }
      render()
    }
  }
  window.addEventListener(commandEvent,listener)
  publish()
  void save('initialize',items.map(item => ({id:item.id,name:item.name,floor:item.floor}))).then(() => {
    if (!dead && !state.error && state.pending.length && !jobs.some(Boolean)) play(state.pending.map(record => record.id))
  })
  return () => {
    dead = true; window.removeEventListener(commandEvent,listener); stop()
    if (highlight) { scene.remove(highlight); highlight.geometry.dispose(); (highlight.material as THREE.Material).dispose() }
  }
}
