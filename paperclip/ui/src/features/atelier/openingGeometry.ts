export interface WallOpeningCut {
  start: number
  end: number
  bottom: number
  top: number
}

export interface WallSolidRect {
  start: number
  end: number
  bottom: number
  top: number
}

const uniqueSorted = (values: number[]) =>
  [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b)

export function buildWallSolidRects(
  length: number,
  height: number,
  cuts: WallOpeningCut[],
): WallSolidRect[] {
  if (length <= 0 || height <= 0) return []

  const normalized = cuts
    .map((cut) => ({
      start: Math.max(0, Math.min(length, cut.start)),
      end: Math.max(0, Math.min(length, cut.end)),
      bottom: Math.max(0, Math.min(height, cut.bottom)),
      top: Math.max(0, Math.min(height, cut.top)),
    }))
    .filter((cut) => cut.end > cut.start && cut.top > cut.bottom)

  const xBreaks = uniqueSorted([0, length, ...normalized.flatMap((cut) => [cut.start, cut.end])])
  const solids: WallSolidRect[] = []

  for (let index = 0; index < xBreaks.length - 1; index += 1) {
    const start = xBreaks[index]
    const end = xBreaks[index + 1]
    const midpoint = (start + end) / 2
    const verticalCuts = normalized
      .filter((cut) => midpoint > cut.start && midpoint < cut.end)
      .map((cut) => [cut.bottom, cut.top] as const)
      .sort((a, b) => a[0] - b[0])

    let cursor = 0
    for (const [bottom, top] of verticalCuts) {
      if (bottom > cursor) solids.push({ start, end, bottom: cursor, top: bottom })
      cursor = Math.max(cursor, top)
    }
    if (cursor < height) solids.push({ start, end, bottom: cursor, top: height })
  }

  return solids.filter((rect) => rect.end - rect.start > 0.001 && rect.top - rect.bottom > 0.001)
}
