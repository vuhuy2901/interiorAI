import { useEffect, useRef } from 'react'
import { claimCelebration, costTile, formatDuration, MISSING, parseCompletion, prefersReducedMotion, releaseCelebration, runConfetti } from './projectCompletion'

/** "Dự án hoàn thành" card. Uses the app's theme tokens, so it follows dark/light mode. */
export function ProjectCompletionCard({ metadata }: { metadata: any }) {
  const parsed = parseCompletion(metadata)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const runId = parsed?.runId || ''
  useEffect(() => {
    const element = canvas.current
    if (!element || !runId || prefersReducedMotion() || !claimCelebration(runId)) return
    let finished = false
    const cancel = runConfetti(element, () => { finished = true; releaseCelebration(runId, true) })
    return () => { cancel(); if (!finished) releaseCelebration(runId, false) }
  }, [runId])
  if (!parsed) return null
  const { summary } = parsed
  const cost = costTile(summary.cost)
  const tiles: Array<{ label: string; value: string; note?: string | null; warn?: boolean }> = [
    { label: 'Revision', value: summary.revision != null ? `#${summary.revision}` : MISSING },
    { label: 'Node hoàn thành', value: `${summary.completed_nodes}/${summary.total_nodes}` },
    { label: 'Tổng thời gian', value: formatDuration(summary.duration_seconds) },
    { label: cost.label, value: cost.value, note: cost.note, warn: cost.provisional },
  ]
  return (
    <article className="relative overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-br from-primary/10 via-background to-background p-3 shadow-2xs"
      data-testid="project-completion-card" aria-label="Dự án hoàn thành">
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative space-y-2.5">
        <div>
          <div className="text-sm font-semibold text-foreground">🎉 Dự án hoàn thành</div>
          <div className="text-[11px] text-muted-foreground">{summary.project_name || MISSING}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tiles.map(tile => (
            <div key={tile.label} className="rounded-md border border-border/70 bg-background/80 p-2">
              <div className="text-[10px] text-muted-foreground">{tile.label}</div>
              <div className="text-xs font-semibold text-foreground">{tile.value}</div>
              {tile.note ? <div className={`text-[10px] ${tile.warn ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{tile.note}</div> : null}
            </div>
          ))}
        </div>
        {summary.render_url ? (
          <a href={summary.render_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border/70">
            <img src={summary.render_url} alt="Ảnh render dự án" loading="lazy" className="h-28 w-full object-cover" />
          </a>
        ) : <div className="text-[10px] text-muted-foreground">Ảnh render: {MISSING}</div>}
        <div className="flex flex-wrap gap-1.5">
          {summary.exports.length ? summary.exports.map(file => (
            <a key={file.kind} href={file.url} download
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted">
              Tải {file.label}
            </a>
          )) : <span className="text-[10px] text-muted-foreground">File xuất: {MISSING}</span>}
        </div>
      </div>
    </article>
  )
}
