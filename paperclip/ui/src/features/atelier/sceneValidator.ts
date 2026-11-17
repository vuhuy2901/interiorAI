export interface SceneValidationIssue {
  code: 'OUTSIDE_ROOM' | 'FURNITURE_OVERLAP' | 'INVALID_HEIGHT' | 'ORPHAN_OPENING' | 'OPENING_OUT_OF_BOUNDS' | 'UNMAPPED_CATEGORY'
  severity: 'error' | 'warning'
  entityId: string
  entityName: string
  message: string
}

export interface SceneValidationReport {
  valid: boolean
  errorCount: number
  warningCount: number
  issues: SceneValidationIssue[]
}

function pointInPolygonMm(x: number, y: number, poly: number[][]): boolean {
  if (!poly || poly.length < 3) return true
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distToSegmentMm(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 1e-6) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function pointInOrNearPolygonMm(x: number, y: number, poly: number[][], toleranceMm = 220): boolean {
  if (pointInPolygonMm(x, y, poly)) return true
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (distToSegmentMm(x, y, a[0], a[1], b[0], b[1]) <= toleranceMm) return true
  }
  return false
}

const HEIGHT_BOUNDS_MM: Array<[RegExp, number, number, string]> = [
  [/bunk/, 1200, 2300, 'Giường tầng (1.2–2.3m)'],
  [/\bbed\b|single_bed|double_bed|giuong/, 300, 1400, 'Giường ngủ (0.3–1.4m)'],
  [/wardrobe|closet|armoire|tu_quan_ao/, 1400, 2900, 'Tủ quần áo (1.4–2.9m)'],
  [/dining_table|desk|study_table|office_table/, 600, 1050, 'Bàn ăn/làm việc (0.6–1.05m)'],
  [/coffee_table|ban_tra/, 250, 680, 'Bàn trà (0.25–0.68m)'],
  [/sofa|couch|armchair|chair|stool/, 350, 1400, 'Ghế/Sofa (0.35–1.4m)'],
  [/rug|carpet|mat|tham/, 2, 80, 'Thảm (≤ 0.08m)'],
]

function isGroundOverlayOrWallMounted(item: any): boolean {
  const tok = `${item?.category || ''} ${item?.name || ''} ${item?.id || ''}`.toLowerCase()
  if (/rug|carpet|mat|tham|curtain|rem|painting|tranh|mirror|guong|wall_lamp|ceiling_lamp|pendant/.test(tok)) {
    return true
  }
  if ((item?.z_mm || 0) >= 600) return true
  return false
}

export function validateSceneBeforeBuild(project: any, unmappedIds: string[] = []): SceneValidationReport {
  const issues: SceneValidationIssue[] = []
  const room = project?.rooms?.[0]
  const poly: number[][] = room?.polygon_mm || [
    [0, 0],
    [4000, 0],
    [4000, 5000],
    [0, 5000],
  ]
  const walls: any[] = project?.walls || []
  const wallMap = new Map<string, any>(walls.map((w: any) => [w.id, w]))
  const doors: any[] = project?.openings || []
  const windows: any[] = project?.windows || []
  const furniture: any[] = project?.furniture_instances || []
  const declaredContacts = new Set<string>(
    (project?.declared_contacts || project?.contact_pairs || []).map((pair: any) =>
      Array.isArray(pair) ? [pair[0], pair[1]].sort().join('::') : String(pair)
    )
  )

  // 1. Validate doors & windows belong to a valid wall and fit within wall length
  ;[...doors.map((d) => ({ ...d, _kind: 'Cửa đi' })), ...windows.map((w) => ({ ...w, _kind: 'Cửa sổ' }))].forEach(
    (op: any) => {
      const host = wallMap.get(op.wall_id)
      if (!host) {
        issues.push({
          code: 'ORPHAN_OPENING',
          severity: 'error',
          entityId: op.id || 'opening',
          entityName: op.name || op.id || op._kind,
          message: `${op._kind} "${op.id}" gắn vào tường "${op.wall_id}" không tồn tại trong SceneGraph.`,
        })
        return
      }
      const lenMm = Math.hypot(
        (host.end_mm?.[0] || 0) - (host.start_mm?.[0] || 0),
        (host.end_mm?.[1] || 0) - (host.start_mm?.[1] || 0)
      )
      const centerMm = lenMm * (op.t ?? 0.5)
      const halfW = (op.width_mm || 900) / 2
      if (centerMm - halfW < -50 || centerMm + halfW > lenMm + 50) {
        issues.push({
          code: 'OPENING_OUT_OF_BOUNDS',
          severity: 'error',
          entityId: op.id || 'opening',
          entityName: op.name || op.id || op._kind,
          message: `${op._kind} "${op.id}" (${Math.round(op.width_mm || 900)}mm) vượt ra ngoài chiều dài tường "${host.id}" (${Math.round(lenMm)}mm).`,
        })
      }
    }
  )

  // 2. Validate each furniture item (inside room polygon + reasonable height)
  const boxes: Array<{
    id: string
    name: string
    minX: number
    maxX: number
    minY: number
    maxY: number
    skipOverlap: boolean
  }> = []

  furniture.forEach((f: any) => {
    const id = String(f.id || 'furn')
    const name = String(f.name || f.category || id)
    const cx = Number(f.x_mm ?? 2000)
    const cy = Number(f.y_mm ?? 2000)
    const w = Number(f.width_mm || 800)
    const d = Number(f.depth_mm || 800)
    const h = Number(f.height_mm || 750)
    const rotRad = ((Number(f.rotation_deg || 0) % 360) * Math.PI) / 180
    const cos = Math.abs(Math.cos(rotRad))
    const sin = Math.abs(Math.sin(rotRad))
    const effW = w * cos + d * sin
    const effD = w * sin + d * cos

    if (!pointInOrNearPolygonMm(cx, cy, poly, 250)) {
      issues.push({
        code: 'OUTSIDE_ROOM',
        severity: 'error',
        entityId: id,
        entityName: name,
        message: `Món "${name}" tại (${Math.round(cx)}, ${Math.round(cy)} mm) nằm ngoài đa giác phòng.`,
      })
    }

    const tok = `${f.category || ''} ${f.name || ''}`.toLowerCase()
    for (const [rx, minH, maxH, label] of HEIGHT_BOUNDS_MM) {
      if (rx.test(tok)) {
        if (h < minH || h > maxH) {
          issues.push({
            code: 'INVALID_HEIGHT',
            severity: 'warning',
            entityId: id,
            entityName: name,
            message: `Chiều cao "${name}" (${Math.round(h)}mm) nằm ngoài ngưỡng chuẩn của ${label}.`,
          })
        }
        break
      }
    }

    boxes.push({
      id,
      name,
      minX: cx - effW / 2,
      maxX: cx + effW / 2,
      minY: cy - effD / 2,
      maxY: cy + effD / 2,
      skipOverlap: isGroundOverlayOrWallMounted(f),
    })
  })

  // 3. Pairwise overlap check (excluding declared contacts and rugs/wall-mounted items)
  const overlapShrinkMm = 45 // allow touching/flush contact within 45mm
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].skipOverlap) continue
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[j].skipOverlap) continue
      const pairKey = [boxes[i].id, boxes[j].id].sort().join('::')
      if (declaredContacts.has(pairKey)) continue
      const ox = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX)
      const oy = Math.min(boxes[i].maxY, boxes[j].maxY) - Math.max(boxes[i].minY, boxes[j].minY)
      if (ox > overlapShrinkMm && oy > overlapShrinkMm) {
        issues.push({
          code: 'FURNITURE_OVERLAP',
          severity: 'warning',
          entityId: boxes[i].id,
          entityName: `${boxes[i].name} ↔ ${boxes[j].name}`,
          message: `Va chạm hình học giữa "${boxes[i].name}" và "${boxes[j].name}" (giao nhau ${Math.round(ox)}×${Math.round(oy)} mm).`,
        })
      }
    }
  }

  unmappedIds.forEach((cat) => {
    issues.push({
      code: 'UNMAPPED_CATEGORY',
      severity: 'warning',
      entityId: cat,
      entityName: cat,
      message: `Loại nội thất "${cat}" chưa có trong catalog GLB chuẩn — đã gắn cờ và dựng bằng hình học tham số đa phần (không rơi về sofa).`,
    })
  })

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  }
}
