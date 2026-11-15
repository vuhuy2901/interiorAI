/**
 * ATELIER AI — Managed Pascal MCP Gateway & SceneBridge Runner
 *
 * Runs @pascal-app/mcp SceneBridge + MCP Server over in-memory transport,
 * providing deterministic tool discovery, schema-validated tool execution,
 * canonical <-> Pascal scene synchronization, and scene verification.
 */
import fs from 'node:fs'
import { canonicalFurnitureObject, canonicalSyncBrief } from './canonical-furniture.mjs'
import { compileGeometryScript } from '@pascal-app/geometry-script/compile'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createPascalMcpServer, SceneBridge } from '@pascal-app/mcp'

async function runGatewayCommand(payload) {
  const action = payload.action || 'list_tools'
  if (action === 'call_tool' && payload.sceneSnapshot == null) {
    throw new Error('Canonical scene snapshot is required for call_tool; refusing to use the default scaffold')
  }
  const bridge = new SceneBridge()
  bridge.loadDefault()

  if (payload.sceneSnapshot != null) {
    if (!payload.sceneSnapshot.nodes || Object.keys(payload.sceneSnapshot.nodes).length === 0) {
      throw new Error('Supplied scene snapshot has no nodes; refusing to substitute a default scene')
    }
    bridge.loadJSON(payload.sceneSnapshot)
  }

  const artifacts = {...(payload.sceneSnapshot?.atelier_artifacts || {})}
  // Compilation is available only for our generated canonical-sync modules.
  // Generic call_tool requests do not gain an arbitrary-code execution host.
  const geometryScripts = payload.action === 'sync_from_canonical' ? {
    async compile(input) {
      const compiled = await compileGeometryScript({...input, usageShape: true})
      return {...compiled, glb: new Uint8Array(compiled.glb)}
    },
    async storeArtifact({sha256, bytes, mimeType}) {
      artifacts[sha256] = {mimeType, base64: Buffer.from(bytes).toString('base64')}
      return sha256
    },
    async readArtifact({sha256}) {
      return artifacts[sha256] ? Buffer.from(artifacts[sha256].base64, 'base64') : null
    },
  } : undefined
  const server = createPascalMcpServer({ bridge, geometryScripts })
  const [srvT, cliT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'atelier-mcp-gateway', version: '1.0.0' })
  await Promise.all([server.connect(srvT), client.connect(cliT)])

  try {
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
      if (sceneJson && Object.keys(artifacts).length > 0) {
        sceneJson.atelier_artifacts = artifacts
        sceneJson.atelier_canonical_node_ids = Object.fromEntries(
          Object.entries(payload.sceneSnapshot?.atelier_canonical_node_ids || {})
            .filter(([, nodeId]) => sceneJson.nodes?.[nodeId]),
        )
      }
      return {
        ok: !toolRes.isError,
        toolName: payload.toolName,
        result: toolRes.structuredContent || toolRes.content,
        verification: verify.structuredContent,
        collisions: collisions.structuredContent,
        scene: sceneJson,
        sceneJson,
      }
    }

    if (action === 'sync_from_canonical') {
      const checkedCall = async (request) => {
        const result = await client.callTool(request)
        if (result.isError || result.structuredContent?.ok === false) {
          throw new Error(`Pascal ${request.name} failed: ${JSON.stringify(result.structuredContent || result.content)}`)
        }
        return result
      }
      // Build full Pascal scene from ATELIER AI Canonical Project Schema (mm -> m)
      const canonical = payload.canonical || {}
      await checkedCall({
        name: 'clear_scene',
        arguments: { reason: 'Sync from ATELIER AI Canonical Model' },
      })
      bridge.setActiveScene({id: canonical.project_id || 'canonical-sync', name: canonical.name || 'Canonical scene',
        projectId: null, ownerId: null, thumbnailUrl: null, version: canonical.revision || 1, graphHash: null})

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

          const createRoomRes = await checkedCall({
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
            const paintWallsRes = await checkedCall({
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

      const furnitureNodeIds = {}
      // Record the synchronization brief before authoring measured geometry.
      if (furniture.length > 0) {
        await checkedCall({name: 'design_brief', arguments: canonicalSyncBrief()})
        for (const item of furniture) {
          const placed = await checkedCall({name: 'add_object', arguments: canonicalFurnitureObject(item)})
          const nodeId = placed.structuredContent?.nodeId
          if (!nodeId) throw new Error(`Pascal add_object returned no nodeId for ${item.id}: ${JSON.stringify(placed.structuredContent)}`)
          furnitureNodeIds[item.id] = nodeId
          executedCalls.push({tool: 'add_object', canonicalId: item.id, result: placed.structuredContent})
        }
      }

      const verify = await checkedCall({ name: 'verify_scene', arguments: {} })
      const collisions = await checkedCall({ name: 'check_collisions', arguments: {} })
      const exported = await checkedCall({ name: 'export_json', arguments: { pretty: false } })
      let sceneJson = {}
      try {
        sceneJson = JSON.parse(exported.structuredContent?.json || '{}')
      } catch {
        sceneJson = {}
      }

      // Self-contained artifacts survive the short-lived gateway process;
      // canonical SQLite persistence remains the API's atomic responsibility.
      sceneJson.atelier_artifacts = artifacts
      sceneJson.atelier_canonical_node_ids = furnitureNodeIds

      return {
        ok: true,
        executedCalls,
        furnitureNodeIds,
        geometryRepresentation: 'authored_bench_and_canonical_furniture_envelopes',
        verification: verify.structuredContent,
        collisions: collisions.structuredContent,
        scene: sceneJson,
        sceneJson,
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

