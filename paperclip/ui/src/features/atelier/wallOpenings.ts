export interface WallForOpening {
  start_mm?: [number, number] | number[]
  end_mm?: [number, number] | number[]
}

export interface WallOpeningLike {
  t?: number | null
  width_mm?: number | null
  height_mm?: number | null
  sill_height_mm?: number | null
}

export interface WallOpeningPlacement {
  centerXmm: number
  centerYmm: number
  angleRad: number
  angleDeg: number
  wallLengthMm: number
  startMm: number
  endMm: number
  widthMm: number
}

export interface WallSolidSegment {
  startMm: number
  endMm: number
  bottomMm: number
  topMm: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Resolve an opening in the wall's local axis, preserving the wall's real direction. */
export function resolveWallOpeningPlacement(
  wall: WallForOpening,
  opening: WallOpeningLike,
): WallOpeningPlacement | null {
  const start = wall.start_mm
  const end = wall.end_mm
  if (!start || !end || start.length < 2 || end.length < 2) return null

  const dx = finite(end[0], 0) - finite(start[0], 0)
  const dy = finite(end[1], 0) - finite(start[1], 0)
  const wallLengthMm = Math.hypot(dx, dy)
  if (wallLengthMm <= 0.001) return null

  const t = clamp(finite(opening.t, 0.5), 0, 1)
  const requestedWidth = Math.max(0, finite(opening.width_mm, 0))
  const centerDistance = wallLengthMm * t
  const startMm = clamp(centerDistance - requestedWidth / 2, 0, wallLengthMm)
  const endMm = clamp(centerDistance + requestedWidth / 2, 0, wallLengthMm)
  const effectiveCenter = (startMm + endMm) / 2
  const ux = dx / wallLengthMm
  const uy = dy / wallLengthMm
  const angleRad = Math.atan2(dy, dx)

  return {
    centerXmm: finite(start[0], 0) + ux * effectiveCenter,
    centerYmm: finite(start[1], 0) + uy * effectiveCenter,
    angleRad,
    angleDeg: angleRad * 180 / Math.PI,
    wallLengthMm,
    startMm,
    endMm,
    widthMm: Math.max(0, endMm - startMm),
  }
}

/**
 * Split a wall into solid rectangular prisms around every door/window void.
 * The returned coordinates are in the wall's local horizontal/vertical plane.
 */
export function buildWallSolidSegments(
  wallLengthMm: number,
  wallHeightMm: number,
  openings: WallOpeningLike[],
): WallSolidSegment[] {
  const length = Math.max(0, finite(wallLengthMm, 0))
  const height = Math.max(0, finite(wallHeightMm, 0))
  if (length <= 0.001 || height <= 0.001) return []

  const voids = openings.flatMap((opening) => {
    const center = clamp(finite(opening.t, 0.5), 0, 1) * length
    const halfWidth = Math.max(0, finite(opening.width_mm, 0)) / 2
    const startMm = clamp(center - halfWidth, 0, length)
    const endMm = clamp(center + halfWidth, 0, length)
    const bottomMm = clamp(finite(opening.sill_height_mm, 0), 0, height)
    const topMm = clamp(bottomMm + Math.max(0, finite(opening.height_mm, 0)), 0, height)
    return endMm - startMm > 0.001 && topMm - bottomMm > 0.001
      ? [{ startMm, endMm, bottomMm, topMm }]
      : []
  })

  if (voids.length === 0) return [{ startMm: 0, endMm: length, bottomMm: 0, topMm: height }]

  const xBreaks = [...new Set([0, length, ...voids.flatMap((item) => [item.startMm, item.endMm])])]
    .sort((a, b) => a - b)
  const result: WallSolidSegment[] = []

  for (let index = 0; index < xBreaks.length - 1; index += 1) {
    const startMm = xBreaks[index]
    const endMm = xBreaks[index + 1]
    if (endMm - startMm <= 0.001) continue
    const midpoint = (startMm + endMm) / 2
    const blocked = voids
      .filter((item) => midpoint > item.startMm - 0.001 && midpoint < item.endMm + 0.001)
      .map((item) => [item.bottomMm, item.topMm] as [number, number])
      .sort((a, b) => a[0] - b[0])

    const merged: Array<[number, number]> = []
    for (const interval of blocked) {
      const previous = merged[merged.length - 1]
      if (!previous || interval[0] > previous[1] + 0.001) merged.push([...interval])
      else previous[1] = Math.max(previous[1], interval[1])
    }

    let cursor = 0
    for (const [blockedBottom, blockedTop] of merged) {
      if (blockedBottom - cursor > 0.001) result.push({ startMm, endMm, bottomMm: cursor, topMm: blockedBottom })
      cursor = Math.max(cursor, blockedTop)
    }
    if (height - cursor > 0.001) result.push({ startMm, endMm, bottomMm: cursor, topMm: height })
  }

  return result
}
