/**
 * ATELIER AI — Managed Pascal MCP Gateway & SceneBridge Runner
 *
 * Runs @pascal-app/mcp SceneBridge + MCP Server over in-memory transport,
 * providing deterministic tool discovery, schema-validated tool execution,
 * canonical <-> Pascal scene synchronization, and scene verification.
 */
import fs from 'node:fs'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createPascalMcpServer, SceneBridge } from '@pascal-app/mcp'

function authoredFurnitureModule(item) {
  const category = String(item.category || 'furniture').toLowerCase()
  const width = Math.max(0.05, Number(item.width_mm || 1000) / 1000)
  const depth = Math.max(0.05, Number(item.depth_mm || 800) / 1000)
  const height = Math.max(0.05, Number(item.height_mm || 750) / 1000)
  const color = /^#[0-9a-f]{6}$/i.test(String(item.color_hex || '')) ? item.color_hex : '#D8B47A'

  let geometry = `addBox(width, height, depth, 0, height / 2, 0, 'part:body')`
  if (category === 'bed' || category === 'double_bed') {
    geometry = `
      const frameHeight = Math.min(0.28, height * 0.30)
      const mattressHeight = Math.min(0.24, height * 0.26)
      const headboardDepth = Math.min(0.14, depth * 0.09)
      addBox(width, frameHeight, depth * 0.94, 0, frameHeight / 2, depth * 0.02, 'part:bed_frame')
      addBox(width * 0.96, mattressHeight, depth * 0.86, 0, frameHeight + mattressHeight / 2, depth * 0.06, 'part:mattress')
      addBox(width, height, headboardDepth, 0, height / 2, -depth / 2 + headboardDepth / 2, 'part:headboard')
      addBox(width * 0.38, mattressHeight * 0.55, depth * 0.20, -width * 0.23, frameHeight + mattressHeight * 1.12, -depth * 0.27, 'part:pillow_left')
      addBox(width * 0.38, mattressHeight * 0.55, depth * 0.20, width * 0.23, frameHeight + mattressHeight * 1.12, -depth * 0.27, 'part:pillow_right')
      addBox(width * 0.88, 0.035, depth * 0.42, 0, frameHeight + mattressHeight + 0.035, depth * 0.18, 'part:blanket')`
  } else if (category === 'nightstand' || category === 'bedside_table') {
    geometry = `
      const leg = Math.min(0.045, width * 0.12, depth * 0.12)
      const bodyHeight = height * 0.66
      const bodyBottom = height * 0.25
      addBox(width, bodyHeight, depth, 0, bodyBottom + bodyHeight / 2, 0, 'part:cabinet')
      addBox(width * 0.88, bodyHeight * 0.42, Math.min(0.025, depth * 0.08), 0, bodyBottom + bodyHeight * 0.68, depth / 2 + 0.012, 'part:drawer_front')
      for (const x of [-width / 2 + leg, width / 2 - leg]) {
        for (const z of [-depth / 2 + leg, depth / 2 - leg]) addBox(leg, bodyBottom, leg, x, bodyBottom / 2, z, 'part:leg')
      }`
  } else if (category === 'rug' || category === 'round_rug' || category === 'rug_round') {
    geometry = `addCylinder(width, height, depth, 0, height / 2, 0, 'part:rug')`
  } else if (category === 'tv_cabinet' || category === 'tv_console') {
    geometry = `
      const shell = Math.min(0.035, height * 0.16)
      addBox(width, shell, depth, 0, shell / 2, 0, 'part:base')
      addBox(width, shell, depth, 0, height - shell / 2, 0, 'part:top')
      addBox(shell, height, depth, -width / 2 + shell / 2, height / 2, 0, 'part:side_left')
      addBox(shell, height, depth, width / 2 - shell / 2, height / 2, 0, 'part:side_right')
      addBox(shell, height, depth, 0, height / 2, 0, 'part:divider')
      addBox(width / 2 - shell * 2, height - shell * 2, shell, -width / 4, height / 2, depth / 2 - shell / 2, 'part:door_left')
      addBox(width / 2 - shell * 2, height - shell * 2, shell, width / 4, height / 2, depth / 2 - shell / 2, 'part:door_right')`
  } else if (category === 'chair' || category === 'armchair' || category === 'desk_chair') {
    geometry = `
      const leg = Math.min(0.055, width * 0.12, depth * 0.12)
      const seatY = Math.min(height * 0.55, 0.46)
      const seatH = Math.min(0.10, height * 0.14)
      addBox(width * 0.86, seatH, depth * 0.82, 0, seatY, 0, 'part:seat')
      addBox(width * 0.86, height - seatY, Math.min(0.11, depth * 0.20), 0, seatY + (height - seatY) / 2, -depth * 0.36, 'part:back')
      for (const x of [-width * 0.34, width * 0.34]) {
        for (const z of [-depth * 0.32, depth * 0.32]) addBox(leg, seatY, leg, x, seatY / 2, z, 'part:leg')
      }`
  } else if (category === 'desk' || category === 'study_desk') {
    geometry = `
      const topThickness = Math.min(0.06, height * 0.12)
      addBox(width, topThickness, depth, 0, height - topThickness / 2, 0, 'part:desktop')
      const legWidth = Math.min(0.08, width * 0.12)
      const legDepth = Math.min(0.08, depth * 0.18)
      for (const x of [-width / 2 + legWidth, width / 2 - legWidth]) {
        for (const z of [-depth / 2 + legDepth, depth / 2 - legDepth]) {
          addBox(legWidth, height - topThickness, legDepth, x, (height - topThickness) / 2, z, 'part:leg')
        }
      }`
  } else if (category === 'wardrobe') {
    geometry = `
      const panel = Math.min(0.05, width * 0.08, depth * 0.12)
      addBox(width, panel, depth, 0, panel / 2, 0, 'part:base')
      addBox(width, panel, depth, 0, height - panel / 2, 0, 'part:top')
      addBox(panel, height, depth, -width / 2 + panel / 2, height / 2, 0, 'part:side_left')
      addBox(panel, height, depth, width / 2 - panel / 2, height / 2, 0, 'part:side_right')
      addBox(width / 2 - panel, height - panel * 2, panel, -width / 4, height / 2, depth / 2 - panel / 2, 'part:door_left')
      addBox(width / 2 - panel, height - panel * 2, panel, width / 4, height / 2, depth / 2 - panel / 2, 'part:door_right')`
  } else if (category === 'bookshelf' || category === 'bookcase') {
    geometry = `
      const panel = Math.min(0.045, width * 0.12, depth * 0.12)
      addBox(panel, height, depth, -width / 2 + panel / 2, height / 2, 0, 'part:side_left')
      addBox(panel, height, depth, width / 2 - panel / 2, height / 2, 0, 'part:side_right')
      for (let i = 0; i <= 5; i += 1) {
        const y = panel / 2 + ((height - panel) * i) / 5
        addBox(width, panel, depth, 0, y, 0, 'part:shelf_' + i)
      }`
  } else if (category === 'bunk_bed' || category === 'bunkbed') {
    geometry = `
      const post = Math.min(0.08, width * 0.08, depth * 0.08)
      const frame = Math.min(0.1, height * 0.08)
      const lowerY = Math.min(height - frame / 2, 0.4 + frame / 2)
      const upperY = Math.min(height - frame / 2, 1.4 + frame / 2)
      for (const x of [-width / 2 + post / 2, width / 2 - post / 2]) {
        for (const z of [-depth / 2 + post / 2, depth / 2 - post / 2]) {
          addBox(post, height, post, x, height / 2, z, 'part:post')
        }
      }
      for (const y of [lowerY, upperY]) {
        addBox(width - post * 2, frame, depth - post * 2, 0, y, 0, 'part:bed_frame')
        addBox(width - post * 2.5, frame * 0.7, depth - post * 2.5, 0, y + frame * 0.72, 0, 'part:mattress')
      }
      const railY = Math.min(height - post / 2, upperY + 0.18)
      addBox(width - post * 2, post, post, 0, railY, -depth / 2 + post, 'part:guard_rail')
      const ladderX = width / 2 - post * 1.4
      addBox(post, upperY, post, ladderX, upperY / 2, depth / 2 + post, 'part:ladder_left')
      addBox(post, upperY, post, ladderX - 0.42, upperY / 2, depth / 2 + post, 'part:ladder_right')
      for (let i = 1; i <= 5; i += 1) addBox(0.42, post, post, ladderX - 0.21, (upperY * i) / 6, depth / 2 + post, 'part:ladder_rung')`
  } else if (category === 'stair' || category === 'staircase' || category === 'bunk_stair') {
    geometry = `
      const count = 8
      const stepWidth = width / count
      for (let i = 0; i < count; i += 1) {
        const stepHeight = (height * (i + 1)) / count
        addBox(stepWidth, stepHeight, depth, -width / 2 + stepWidth * (i + 0.5), stepHeight / 2, 0, 'part:step_' + i)
      }`
  }

  return `
    export const mount = 'floor'
    export default function build({ THREE }) {
      const width = ${width.toFixed(4)}
      const depth = ${depth.toFixed(4)}
      const height = ${height.toFixed(4)}
      const group = new THREE.Group()
      const material = new THREE.MeshStandardMaterial({ color: '${color}', roughness: 0.62 })
      const addBox = (w, h, d, x, y, z, name) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
        mesh.position.set(x, y, z)
        mesh.name = name
        mesh.castShadow = true
        mesh.receiveShadow = true
        group.add(mesh)
      }
      const addCylinder = (w, h, d, x, y, z, name) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 48), material)
        mesh.scale.set(w, 1, d)
        mesh.position.set(x, y, z)
        mesh.name = name
        mesh.castShadow = true
        mesh.receiveShadow = true
        group.add(mesh)
      }
      ${geometry}
      return group
    }`
}

function anchoredFurniturePosition(item, room) {
  const polygon = room?.polygon_mm || []
  const xs = polygon.map((point) => Number(point[0]))
  const ys = polygon.map((point) => Number(point[1]))
  if (!item.wall || xs.length < 3 || ys.length < 3) {
    return { xMm: Number(item.x_mm ?? 2000), yMm: Number(item.y_mm ?? 2500) }
  }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Number(item.width_mm || 1000)
  const depth = Number(item.depth_mm || 800)
  const offset = Number(item.offset_mm || 0)
  const distance = Number(item.wall_distance_mm || 0)
  const align = item.align || 'center'
  const aligned = (minimum, maximum, extent) => {
    if (align === 'start' || align === 'left' || align === 'top') return minimum + offset + extent / 2
    if (align === 'end' || align === 'right' || align === 'bottom') return maximum - offset - extent / 2
    return (minimum + maximum) / 2 + offset
  }

  if (item.wall === 'top') return { xMm: aligned(minX, maxX, width), yMm: minY + distance + depth / 2 }
  if (item.wall === 'bottom') return { xMm: aligned(minX, maxX, width), yMm: maxY - distance - depth / 2 }
  if (item.wall === 'left') return { xMm: minX + distance + width / 2, yMm: aligned(minY, maxY, depth) }
  return { xMm: maxX - distance - width / 2, yMm: aligned(minY, maxY, depth) }
}

async function runGatewayCommand(payload) {
  const bridge = new SceneBridge()
  bridge.loadDefault()

  if (payload.sceneSnapshot && payload.sceneSnapshot.nodes && Object.keys(payload.sceneSnapshot.nodes).length > 0) {
    try {
      bridge.loadScene(payload.sceneSnapshot)
    } catch {
      // Fallback to default if snapshot is empty/partial
    }
  }

  const server = createPascalMcpServer({ bridge })
  const [srvT, cliT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'atelier-mcp-gateway', version: '1.0.0' })
  await Promise.all([server.connect(srvT), client.connect(cliT)])

  try {
    const action = payload.action || 'list_tools'

    if (action === 'list_tools') {
      const res = await client.listTools()
      return {
        ok: true,
        toolCount: res.tools.length,
        tools: res.tools.map((t) => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || {},
        })),
      }
    }

    if (action === 'call_tool') {
      const toolRes = await client.callTool({
        name: payload.toolName,
        arguments: payload.arguments || {},
      })
      const exported = await client.callTool({
        name: 'export_json',
        arguments: { pretty: false },
      })
      const verify = await client.callTool({
        name: 'verify_scene',
        arguments: {},
      })
      const collisions = await client.callTool({
        name: 'check_collisions',
        arguments: {},
      })
      let sceneJson = null
      try {
        sceneJson = JSON.parse(exported.structuredContent?.json || '{}')
      } catch {
        sceneJson = null
      }
      return {
        ok: !toolRes.isError,
        toolName: payload.toolName,
        result: toolRes.structuredContent || toolRes.content,
        verification: verify.structuredContent,
        collisions: collisions.structuredContent,
        scene: sceneJson,
      }
    }

    if (action === 'sync_from_canonical') {
      // Build full Pascal scene from ATELIER AI Canonical Project Schema (mm -> m)
      const canonical = payload.canonical || {}
      await client.callTool({
        name: 'clear_scene',
        arguments: { reason: 'Sync from ATELIER AI Canonical Model' },
      })

      const executedCalls = []
      const rooms = canonical.rooms || []
      const walls = canonical.walls || []
      const openings = canonical.openings || []
      const windows = canonical.windows || []
      const furniture = canonical.furniture_instances || []

      if (rooms.length > 0) {
        for (const room of rooms) {
          if (!Array.isArray(room.polygon_mm) || room.polygon_mm.length < 3) {
            throw new Error(`Room ${room.id} requires a source polygon`)
          }
          const polyMeters = room.polygon_mm.map((pt) => [Number((pt[0] / 1000).toFixed(4)), Number((pt[1] / 1000).toFixed(4))])
          const openingWallIndex = (opening) => {
            if (opening.wall_id) {
              const wall = walls.find((candidate) => candidate.id === opening.wall_id)
              if (!wall) throw new Error(`Unknown wall ${opening.wall_id} for ${opening.id}`)
              const index = room.polygon_mm.findIndex((point, i) => {
                const next = room.polygon_mm[(i + 1) % room.polygon_mm.length]
                const same = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01
                return (same(point, wall.start_mm) && same(next, wall.end_mm)) ||
                  (same(point, wall.end_mm) && same(next, wall.start_mm))
              })
              if (index < 0) throw new Error(`Wall ${opening.wall_id} is outside room ${room.id}`)
              return index
            }
            if (Number.isInteger(opening.wall_index) && opening.wall_index >= 0 && opening.wall_index < polyMeters.length) return opening.wall_index
            throw new Error(`Opening ${opening.id} requires a source wall reference`)
          }

          const roomDoors = openings
            .filter((d) => d.room_id === room.id || !d.room_id)
            .map((d, idx) => ({
              wallIndex: openingWallIndex(d),
              t: typeof d.t === 'number' ? d.t : 0.5,
              width: Number(((d.width_mm || 900) / 1000).toFixed(3)),
              height: Number(((d.height_mm || 2100) / 1000).toFixed(3)),
            }))

          const roomWindows = windows
            .filter((w) => w.room_id === room.id || !w.room_id)
            .map((w, idx) => ({
              wallIndex: openingWallIndex(w),
              t: typeof w.t === 'number' ? w.t : 0.5,
              width: Number(((w.width_mm || 1500) / 1000).toFixed(3)),
              height: Number(((w.height_mm || 1400) / 1000).toFixed(3)),
              sillHeight: Number(((w.sill_height_mm || 900) / 1000).toFixed(3)),
            }))

          const createRoomRes = await client.callTool({
            name: 'create_room',
            arguments: {
              name: room.name || 'Living Room',
              polygon: polyMeters,
              wallHeight: Number(((room.ceiling_height_mm || 2800) / 1000).toFixed(3)),
              wallThickness: Number(((walls[0]?.thickness_mm || 200) / 1000).toFixed(3)),
              doors: roomDoors,
              windows: roomWindows,
            },
          })
          executedCalls.push({ tool: 'create_room', result: createRoomRes.structuredContent })

          // Paint walls & floor if material refs provided
          const createdWallIds = createRoomRes.structuredContent?.wallIds || []
          if (createdWallIds.length > 0 && room.wall_pascal_ref) {
            const paintWallsRes = await client.callTool({
              name: 'paint',
              arguments: {
                targets: createdWallIds,
                role: 'interior',
                material: room.wall_pascal_ref,
              },
            })
            executedCalls.push({ tool: 'paint_walls', result: paintWallsRes.structuredContent })
          }

          // Accent walls (Section 7B)
          walls.forEach((w, idx) => {
            if (w.is_accent_wall && createdWallIds[idx] && w.accent_pascal_ref) {
              executedCalls.push({
                tool: 'paint_accent_wall',
                wallId: createdWallIds[idx],
                material: w.accent_pascal_ref,
              })
            }
          })
        }
      }

      // Author dimensioned objects from canonical data. Catalog IDs are never guessed:
      // an incorrect catalog proxy changes both shape and dimensions.
      if (furniture.length > 0) {
        for (const item of furniture) {
          if (!String(item.category || '').trim()) {
            throw new Error(`Furniture ${item.id || '<unknown>'} requires category`)
          }
          if (!String(item.pascal_asset_id || '').trim()) {
            throw new Error(`Furniture ${item.id || '<unknown>'} requires pascal_asset_id`)
          }
        }
        const noAdditionalDressing = {
          textiles: { none: 'Preserve the existing source scene only.' },
          light: { none: 'Preserve the existing source scene only.' },
          windows: { none: 'Openings come from canonical source data.' },
          walls: { none: 'Preserve the existing source scene only.' },
          floor: { none: 'Preserve the existing source scene only.' },
          plants: { none: 'No new objects are authorized.' },
          objects: { none: 'No new objects are authorized.' },
          smallFurniture: { none: 'No new objects are authorized.' },
        }
        const briefRes = await client.callTool({
          name: 'design_brief',
          arguments: {
            axes: {
              action: { kind: 'bounded', quote: 'Sửa lỗi scene đang mở', reading: 'Repair geometry in the existing scene.' },
              size: { kind: 'bounded', quote: 'vị trí, kích thước và chiều cao', reading: 'Canonical dimensions and coordinates are fixed.' },
              pieces: { kind: 'bounded', quote: 'Không tự thêm vật thể', reading: 'Use exactly the canonical furniture list.', extent: 'exact' },
              openings: { kind: 'bounded', quote: 'Cửa nằm tường trái, phía dưới, mở vào trong', reading: 'Use only canonical doors and windows.' },
              style: { kind: 'bounded', quote: 'Không đổi phong cách', reading: 'Keep the existing style unchanged.' },
              materials: { kind: 'bounded', quote: 'không đổi màu sắc, vật liệu', reading: 'Keep canonical colors and materials unchanged.' },
              dressing: { kind: 'bounded', quote: 'Không tự thêm vật thể', reading: 'Do not add decorative layers.', extent: 'exact' },
            },
            source: 'open',
            vision: 'Faithfully reconstruct the supplied source plan with no redesign or extra objects.',
            beyond: noAdditionalDressing,
          },
        })
        if (briefRes.isError) {
          throw new Error(`Pascal rejected source design brief: ${JSON.stringify(briefRes.structuredContent || briefRes.content)}`)
        }
        executedCalls.push({ tool: 'design_brief', result: briefRes.structuredContent })

        for (const item of furniture) {
          const anchored = anchoredFurniturePosition(item, rooms.find((room) => room.id === item.room_id) || rooms[0])
          const addObjectRes = await client.callTool({
            name: 'add_object',
            arguments: {
              code: authoredFurnitureModule(item),
              position: [
                Number((anchored.xMm / 1000).toFixed(4)),
                Number(((item.z_mm ?? 0) / 1000).toFixed(4)),
                Number((anchored.yMm / 1000).toFixed(4)),
              ],
              rotation: `${Number(item.rotation_deg ?? 0).toFixed(3)}deg`,
              exact: true,
              name: String(item.name || item.category || 'Furniture').slice(0, 120),
              description: `Canonical ${String(item.category || 'furniture')} at source dimensions`.slice(0, 200),
              category: String(item.category || 'furniture').slice(0, 60),
              reason: 'Preserve source-plan dimensions and placement without a catalog proxy.',
            },
          })
          if (addObjectRes.isError) {
            const rejection = JSON.stringify(addObjectRes.structuredContent || addObjectRes.content)
            if (rejection.includes('scripts_unavailable')) {
              executedCalls.push({
                tool: 'add_object_skipped',
                canonicalId: item.id,
                reason: 'scripts_unavailable',
              })
              continue
            }
            throw new Error(`Pascal rejected ${item.id}: ${rejection}`)
          }
          executedCalls.push({
            tool: 'add_object',
            canonicalId: item.id,
            result: addObjectRes.structuredContent,
            isError: Boolean(addObjectRes.isError),
          })
        }
      }

      const verify = await client.callTool({ name: 'verify_scene', arguments: {} })
      const collisions = await client.callTool({ name: 'check_collisions', arguments: {} })
      const exported = await client.callTool({ name: 'export_json', arguments: { pretty: false } })
      let sceneJson = {}
      try {
        sceneJson = JSON.parse(exported.structuredContent?.json || '{}')
      } catch {
        sceneJson = {}
      }

      return {
        ok: true,
        executedCalls,
        verification: verify.structuredContent,
        collisions: collisions.structuredContent,
        scene: sceneJson,
      }
    }

    return { ok: false, error: `Unknown action: ${action}` }
  } finally {
    await client.close()
    await server.close()
  }
}

const inputFile = process.argv[2]
const raw = inputFile ? fs.readFileSync(inputFile, 'utf-8') : fs.readFileSync(0, 'utf-8')
const payload = JSON.parse(raw || '{}')
runGatewayCommand(payload)
  .then((out) => {
    process.stdout.write(JSON.stringify(out))
    process.exit(0)
  })
  .catch((err) => {
    process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    process.exit(1)
  })

