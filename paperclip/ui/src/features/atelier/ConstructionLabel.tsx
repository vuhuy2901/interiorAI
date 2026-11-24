import { useEffect, useState } from 'react'
import { stateEvent, type ConstructionState } from './constructionHistory'

/** Small viewport overlay: "Đang lắp: <tên món> (i/N)" while a construction replay runs. */
export function constructionLabelText(state: ConstructionState | null): string | null {
  const worker = state?.workers?.find(item => item.phase !== 'idle' && item.itemName)
  if (!worker || !state?.replay || !state.replay.total) return null
  return `Đang lắp: ${worker.itemName} (${Math.min(state.replay.total, worker.ordinal ?? state.replay.done + 1)}/${state.replay.total})`
}

export function ConstructionLabel() {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    const listener = (event: Event) => setText(constructionLabelText((event as CustomEvent).detail as ConstructionState))
    window.addEventListener(stateEvent, listener)
    return () => window.removeEventListener(stateEvent, listener)
  }, [])
  if (!text) return null
  return <div data-testid="construction-label" role="status" aria-live="polite"
    style={{ position: 'absolute', left: 12, bottom: 12, padding: '6px 12px', borderRadius: 999, pointerEvents: 'none',
      fontSize: 12, fontWeight: 600, color: '#f0fdfa', background: 'rgba(15,118,110,.88)', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>{text}</div>
}
