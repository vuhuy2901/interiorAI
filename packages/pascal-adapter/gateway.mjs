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
          const polyMeters = (room.polygon_mm || [
            [0, 0],
            [4000, 0],
            [4000, 5000],
            [0, 5000],
          ]).map((pt) => [Number((pt[0] / 1000).toFixed(4)), Number((pt[1] / 1000).toFixed(4))])

          const roomDoors = openings
            .filter((d) => d.room_id === room.id || !d.room_id)
            .map((d, idx) => ({
              wallIndex: typeof d.wall_index === 'number' ? d.wall_index : idx % polyMeters.length,
              t: typeof d.t === 'number' ? d.t : 0.5,
              width: Number(((d.width_mm || 900) / 1000).toFixed(3)),
              height: Number(((d.height_mm || 2100) / 1000).toFixed(3)),
            }))

          const roomWindows = windows
            .filter((w) => w.room_id === room.id || !w.room_id)
            .map((w, idx) => ({
              wallIndex: typeof w.wall_index === 'number' ? w.wall_index : (idx + 1) % polyMeters.length,
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

      // Set design brief so Pascal allows item placement
      if (furniture.length > 0) {
        for (const item of furniture) {
          if (!String(item.category || '').trim()) {
            throw new Error(`Furniture ${item.id || '<unknown>'} requires category`)
          }
          if (!String(item.pascal_asset_id || '').trim()) {
            throw new Error(`Furniture ${item.id || '<unknown>'} requires pascal_asset_id`)
          }
        }
        const itemsToPlace = furniture.map((item) => ({
          assetId: item.pascal_asset_id,
          x: Number(((item.x_mm || 2000) / 1000).toFixed(3)),
          z: Number(((item.y_mm || 2500) / 1000).toFixed(3)),
          rotation: Number((((item.rotation_deg || 0) * Math.PI) / 180).toFixed(4)),
        }))
        const placeRes = await client.callTool({
          name: 'place_items',
          arguments: { items: itemsToPlace },
        })
        executedCalls.push({ tool: 'place_items', result: placeRes.structuredContent })
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

