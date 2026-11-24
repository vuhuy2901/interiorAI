// Pure helpers for the "Dự án hoàn thành" card (FEAT-2026-126).
export interface CompletionCost {
  total_vnd: number
  price_coverage_percent: number | null
  total_is_complete: boolean | null
  priced_line_count: number | null
  line_count: number | null
}
export interface CompletionSummary {
  project_name: string | null
  revision: number | null
  completed_nodes: number
  total_nodes: number
  duration_seconds: number | null
  cost: CompletionCost | null
  exports: Array<{ kind: string; label: string; url: string }>
  render_url: string | null
  render_kind?: 'ai' | 'blender' | null
}

export const MISSING = 'chưa có'

/** Returns the structured summary only for the PROJECT_COMPLETED message of a COMPLETED run. */
export function parseCompletion(metadata: any): { runId: string; summary: CompletionSummary } | null {
  if (!metadata || metadata.event_type !== 'PROJECT_COMPLETED' || !metadata.completion || typeof metadata.completion !== 'object') return null
  return { runId: String(metadata.workflow_run_id || metadata.event_id || ''), summary: metadata.completion as CompletionSummary }
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return MISSING
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60), rest = total % 60
  if (!minutes) return `${rest} giây`
  return rest ? `${minutes} phút ${rest} giây` : `${minutes} phút`
}

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} VNĐ`
}

/** Cost tile text. An incomplete price set is never presented as an official total. */
export function costTile(cost: CompletionCost | null): { label: string; value: string; note: string | null; provisional: boolean } {
  if (!cost) return { label: 'Dự toán', value: MISSING, note: null, provisional: false }
  if (cost.total_is_complete === true) return { label: 'Tổng dự toán', value: formatVnd(cost.total_vnd), note: null, provisional: false }
  const coverage = cost.priced_line_count != null && cost.line_count != null
    ? `${cost.priced_line_count}/${cost.line_count} hạng mục có giá`
    : cost.price_coverage_percent != null ? `độ phủ giá ${cost.price_coverage_percent}%` : 'độ phủ giá chưa có'
  return { label: 'Dự toán tạm tính', value: formatVnd(cost.total_vnd), note: `Tạm tính, ${coverage}`, provisional: true }
}

// Confetti runs once per run: persisted only after the animation finished.
const running = new Set<string>()
const storageKey = (runId: string) => `atelier:celebrated:${runId}`
const readDone = (runId: string, storage?: Pick<Storage, 'getItem'>) => {
  try { return (storage ?? window.localStorage).getItem(storageKey(runId)) === '1' } catch { return false }
}
export function claimCelebration(runId: string, storage?: Pick<Storage, 'getItem'>): boolean {
  if (!runId || running.has(runId) || readDone(runId, storage)) return false
  running.add(runId); return true
}
export function releaseCelebration(runId: string, finished: boolean, storage?: Pick<Storage, 'setItem'>) {
  running.delete(runId)
  if (!finished) return
  try { (storage ?? window.localStorage).setItem(storageKey(runId), '1') } catch { /* storage may be unavailable */ }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Small self-contained canvas confetti (about 1.8s). Returns a cancel function. */
export function runConfetti(canvas: HTMLCanvasElement, onDone: () => void): () => void {
  const context = canvas.getContext('2d')
  const width = canvas.width = canvas.clientWidth || 320, height = canvas.height = canvas.clientHeight || 200
  if (!context) { onDone(); return () => {} }
  const colors = ['#14b8a6', '#f59e0b', '#6366f1', '#ec4899', '#22c55e']
  const pieces = Array.from({ length: 70 }, (_, index) => ({
    x: width / 2 + (Math.random() - .5) * 60, y: height * .35, vx: (Math.random() - .5) * 360, vy: -120 - Math.random() * 260,
    size: 4 + Math.random() * 4, spin: Math.random() * Math.PI, vr: (Math.random() - .5) * 10, color: colors[index % colors.length],
  }))
  const duration = 1800
  let start = 0, frame = 0, cancelled = false
  const tick = (now: number) => {
    if (cancelled) return
    start ||= now
    const t = (now - start) / 1000
    context.clearRect(0, 0, width, height)
    context.globalAlpha = Math.max(0, 1 - (now - start) / duration)
    for (const piece of pieces) {
      const x = piece.x + piece.vx * t, y = piece.y + piece.vy * t + 520 * t * t
      context.save(); context.translate(x, y); context.rotate(piece.spin + piece.vr * t)
      context.fillStyle = piece.color; context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2); context.restore()
    }
    if (now - start < duration) frame = requestAnimationFrame(tick)
    else { context.clearRect(0, 0, width, height); onDone() }
  }
  frame = requestAnimationFrame(tick)
  return () => { cancelled = true; cancelAnimationFrame(frame); context.clearRect(0, 0, width, height) }
}
