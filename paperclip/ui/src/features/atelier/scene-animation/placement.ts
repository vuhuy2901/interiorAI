export type Point = [number, number]
export interface Item { id: string; x_mm?: number; y_mm?: number; width_mm?: number; depth_mm?: number; rotation_deg?: number; name?: string }
export interface Snapshot { project_id: string; revision: number; furniture_instances: Item[]; rooms?: { polygon_mm: number[][] }[]; walls?: { start_mm: number[]; end_mm: number[]; thickness_mm?: number }[] }

/** Only newer persisted snapshots can enqueue work; initial loads are baselines. */
export class PlacementTracker {
  private project = ''
  private revision = -1
  private ids = new Set<string>()
  reset() { this.project = ''; this.revision = -1; this.ids.clear() }
  observe(snapshot: Snapshot, enabled: boolean): string[] {
    if (!snapshot?.project_id || !Number.isFinite(snapshot.revision)) return []
    if (snapshot.project_id === this.project && snapshot.revision <= this.revision) return []
    const fresh = snapshot.project_id === this.project && enabled
      ? snapshot.furniture_instances.filter(item => !this.ids.has(item.id)).slice(0, 3).map(item => item.id) : []
    this.project = snapshot.project_id
    this.revision = snapshot.revision
    this.ids = new Set(snapshot.furniture_instances.map(item => item.id))
    return fresh
  }
}

function inside(p: Point, polygon: number[][]) {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
  }
  return result
}
function distance(p: Point, a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
function inFootprint(p: Point, item: Item, padding: number) {
  const angle = -(item.rotation_deg || 0) * Math.PI / 180
  const dx = p[0] - (item.x_mm ?? 2000), dy = p[1] - (item.y_mm ?? 2500)
  return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) < (item.width_mm || 1000) / 2 + padding &&
    Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) < (item.depth_mm || 800) / 2 + padding
}

/** Bounded floor grid, inflated obstacles and segment checks prevent wall cutting. */
export function placementPath(snapshot: Snapshot, target: Item): Point[] | null {
  const polygon = snapshot.rooms?.find(room => inside([target.x_mm ?? 2000, target.y_mm ?? 2500], room.polygon_mm))?.polygon_mm
  if (!polygon || polygon.length < 3) return null
  const minX = Math.min(...polygon.map(p => p[0])), minY = Math.min(...polygon.map(p => p[1]))
  const maxX = Math.max(...polygon.map(p => p[0])), maxY = Math.max(...polygon.map(p => p[1]))
  const step = Math.max(200, Math.max(maxX - minX, maxY - minY) / 50)
  const free = (p: Point) => inside(p, polygon) &&
    polygon.every((a, i) => distance(p, a, polygon[(i + 1) % polygon.length]) >= 160) &&
    (snapshot.walls || []).every(w => distance(p, w.start_mm, w.end_mm) > (w.thickness_mm || 100) / 2 + 160) &&
    snapshot.furniture_instances.every(item => !inFootprint(p, item, 180))
  const nodes: Point[] = [], keys = new Map<string, number>()
  const nx = Math.ceil((maxX - minX) / step), ny = Math.ceil((maxY - minY) / step)
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const p: Point = [minX + x * step, minY + y * step]
    if (free(p)) { keys.set(`${x},${y}`, nodes.length); nodes.push(p) }
  }
  if (!nodes.length) return null
  // Enter from the clear floor nearest the lower room edge; the actor fades in there.
  let start = 0
  nodes.forEach((p, i) => { if (Math.hypot(p[0] - minX, p[1] - maxY) < Math.hypot(nodes[start][0] - minX, nodes[start][1] - maxY)) start = i })
  const queue = [start], previous = new Map<number, number>([[start, -1]])
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], p = nodes[index]
    if (inFootprint(p, target, 500)) {
      const path: Point[] = []
      for (let i = index; i !== -1; i = previous.get(i)!) path.push(nodes[i])
      return path.reverse()
    }
    const x = Math.round((p[0] - minX) / step), y = Math.round((p[1] - minY) / step)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = keys.get(`${x + dx},${y + dy}`)
      if (next === undefined || previous.has(next)) continue
      const q = nodes[next], samples = Math.ceil(step / 75)
      if (!Array.from({ length: samples }, (_, i) => free([p[0] + (q[0] - p[0]) * (i + 1) / samples, p[1] + (q[1] - p[1]) * (i + 1) / samples])).every(Boolean)) continue
      previous.set(next, index); queue.push(next)
    }
  }
  return null
}
