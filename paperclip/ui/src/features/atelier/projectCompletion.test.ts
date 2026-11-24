import { describe, expect, it } from 'vitest'
import { claimCelebration, costTile, formatDuration, parseCompletion, releaseCelebration } from './projectCompletion'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('project completion helpers', () => {
  it('parses only PROJECT_COMPLETED messages', () => {
    expect(parseCompletion({ event_type: 'TASK_COMPLETED' })).toBeNull()
    expect(parseCompletion({ event_type: 'PROJECT_COMPLETED' })).toBeNull()
    const summary = { project_name: 'A', completed_nodes: 3, total_nodes: 3 }
    expect(parseCompletion({ event_type: 'PROJECT_COMPLETED', workflow_run_id: 'r1', completion: summary })).toEqual({ runId: 'r1', summary })
  })
  it('never labels incomplete pricing as an official total', () => {
    const complete = costTile({ total_vnd: 1000, price_coverage_percent: 100, total_is_complete: true, priced_line_count: 2, line_count: 2 })
    expect(complete).toMatchObject({ label: 'Tổng dự toán', provisional: false })
    const partial = costTile({ total_vnd: 1000, price_coverage_percent: 50, total_is_complete: false, priced_line_count: 1, line_count: 2 })
    expect(partial).toMatchObject({ label: 'Dự toán tạm tính', provisional: true, note: 'Tạm tính, 1/2 hạng mục có giá' })
    expect(costTile(null).value).toBe('chưa có')
  })
  it('formats durations and missing values', () => {
    expect(formatDuration(125)).toBe('2 phút 5 giây'); expect(formatDuration(30)).toBe('30 giây'); expect(formatDuration(null)).toBe('chưa có')
  })
  it('celebrates a run once: not while running, again after cancel, never after finishing', () => {
    const storage = memory()
    expect(claimCelebration('run-1', storage)).toBe(true)
    expect(claimCelebration('run-1', storage)).toBe(false)
    releaseCelebration('run-1', false, storage)
    expect(claimCelebration('run-1', storage)).toBe(true)
    releaseCelebration('run-1', true, storage)
    expect(claimCelebration('run-1', storage)).toBe(false)
    expect(claimCelebration('', storage)).toBe(false)
  })
})
