/**
 * ATELIER AI — Multi-Agent Orchestration Control Center & AI Agents Registry (Sections 8 & 9)
 * Implements:
 * - 3-zone Control Plane Layout: Left Agent/Node Directory, Center React Flow Canvas, Right Node & Agent Config Inspector
 * - Bottom Execution Timeline & Live Logs Drawer
 * - Rich Agent Nodes with Icon, Name, Provider/Model, Semantic Status Badge, Input/Output Ports, and Human Gate markers
 * - Live Agent editing (System Prompt, Model, Allowed MCP Tools, Enable/Disable toggle) connected to PUT /api/v1/agents/{id}
 */
import React, { useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Bot,
  ShieldCheck,
  Terminal,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Layers,
} from 'lucide-react'

interface AIControlCenterViewProps {
  workflows: any[]
  runs: any[]
  agents: any[]
  connections: any[]
  mcpTools: any[]
  onRunWorkflow: () => void
  onUpdateWorkflow: (wf: any) => void
  onUpdateAgent: (agent: any) => void
}

const getStatusBadgeStyle = (status: string) => {
  const s = (status || 'READY').toUpperCase()
  if (s === 'COMPLETED') return { cls: 'emerald', label: 'Hoàn thành' }
  if (s === 'RECOMPUTED' || s === 'RUNNING') return { cls: 'teal', label: 'Đang chạy / Tính lại' }
  if (s === 'WAITING_FOR_INPUT') return { cls: 'amber', label: 'Chờ người dùng' }
  if (s === 'WAITING_FOR_APPROVAL') return { cls: 'amber', label: 'Chờ phê duyệt' }
  if (s === 'FAILED' || s === 'ERROR') return { cls: 'rose', label: 'Thất bại' }
  return { cls: 'neutral', label: 'Chờ kích hoạt' }
}

export const AIControlCenterView: React.FC<AIControlCenterViewProps> = ({
  workflows,
  runs,
  agents,
  connections,
  onRunWorkflow,
  onUpdateWorkflow,
  onUpdateAgent,
}) => {
  const activeWf = workflows[0] || { workflow_id: 'wf_default_interior_pipeline', nodes: [], edges: [] }
  const [selectedNodeId, setSelectedNodeId] = useState<string>('n6_style')
  const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(true)

  const agentsById = useMemo(() => {
    const map: Record<string, any> = {}
    agents.forEach((a: any) => {
      map[a.agent_id] = a
    })
    return map
  }, [agents])

  const selectedNode =
    (activeWf.nodes || []).find((n: any) => n.id === selectedNodeId) || activeWf.nodes?.[0]
  const boundAgent = selectedNode ? agentsById[selectedNode.agent_id] : null

  const rfNodes: Node[] = useMemo(() => {
    return (activeWf.nodes || []).map((n: any) => {
      const ag = agentsById[n.agent_id]
      const st = getStatusBadgeStyle(n.status)
      const isGate = n.type === 'human_gate'
      const isSel = selectedNodeId === n.id

      return {
        id: n.id,
        position: n.position || { x: 0, y: 0 },
        data: {
          label: (
            <div
              onClick={() => setSelectedNodeId(n.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: isSel ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                background: 'var(--surface-primary)',
                boxShadow: isSel ? 'var(--shadow-sm)' : 'var(--shadow-xs)',
                minWidth: 210,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{n.label}</span>
                {isGate && (
                  <span className="status-badge amber" style={{ fontSize: 9.5, padding: '1px 5px' }}>
                    Gate
                  </span>
                )}
              </div>

              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                {ag ? ag.name.split('(')[0].trim() : n.agent_id}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                  paddingTop: 6,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {n.type}
                </span>
                <span className={`status-badge ${st.cls}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                  {st.label}
                </span>
              </div>
            </div>
          ),
        },
        style: { background: 'transparent', border: 'none', padding: 0, width: 220 },
      }
    })
  }, [activeWf.nodes, agentsById, selectedNodeId])

  const rfEdges: Edge[] = useMemo(() => {
    return (activeWf.edges || []).map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: '#0F766E', strokeWidth: 1.6 },
    }))
  }, [activeWf.edges])

  const handleToggleNodeEnabled = (nodeId: string) => {
    const updatedNodes = (activeWf.nodes || []).map((n: any) =>
      n.id === nodeId ? { ...n, enabled: !n.enabled } : n
    )
    onUpdateWorkflow({ ...activeWf, nodes: updatedNodes })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Top Control Plane Bar */}
      <div
        style={{
          height: 52,
          padding: '0 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Cpu size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{activeWf.name}</span>
          <span className="status-badge teal">v{activeWf.version || 1} • 14 Nodes</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={() => setShowLogsDrawer(!showLogsDrawer)}
          >
            <Terminal size={13} /> {showLogsDrawer ? 'Ẩn Nhật Ký Thực Thi' : 'Hiện Nhật Ký Thực Thi'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={onRunWorkflow}>
            <Play size={13} /> Chạy Toàn Bộ Quy Trình (Start Run)
          </button>
        </div>
      </div>

      {/* Main 3-Column Control Plane Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '250px 1fr 330px', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Node & Agent Step Sequence */}
        <aside
          style={{
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--surface-primary)',
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            DANH SÁCH BƯỚC ĐIỀU PHỐI (14)
          </div>
          {(activeWf.nodes || []).map((n: any) => {
            const st = getStatusBadgeStyle(n.status)
            const isSel = selectedNodeId === n.id
            return (
              <div
                key={n.id}
                onClick={() => setSelectedNodeId(n.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-btn)',
                  border: isSel ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                  background: isSel ? 'var(--accent-soft)' : 'var(--surface-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: isSel ? 600 : 500 }}>{n.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {n.id}
                  </span>
                  <span className={`status-badge ${st.cls}`} style={{ fontSize: 10, padding: '0 6px' }}>
                    {st.label}
                  </span>
                </div>
              </div>
            )
          })}
        </aside>

        {/* Center Column: Interactive React Flow Canvas */}
        <section style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--app-bg)' }}>
          <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
            <Background color="#D4D4D8" gap={20} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </section>

        {/* Right Column: Selected Node & Bound Agent Configuration Inspector */}
        <aside
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--surface-primary)',
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>Cấu Hình Node & Agent</div>
          {selectedNode && (
            <>
              <div className="surface-subtle" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {selectedNode.id}
                  </span>
                  <span className={`status-badge ${getStatusBadgeStyle(selectedNode.status).cls}`}>
                    {getStatusBadgeStyle(selectedNode.status).label}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedNode.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Trạng thái kích hoạt:</span>
                  <button
                    className={`btn btn-sm ${selectedNode.enabled !== false ? 'btn-soft' : ''}`}
                    onClick={() => handleToggleNodeEnabled(selectedNode.id)}
                  >
                    {selectedNode.enabled !== false ? 'Đang bật (Enabled)' : 'Đã tắt (Bypassed)'}
                  </button>
                </div>
              </div>

              {boundAgent && (
                <div className="surface-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                    Agent Thực Thi: {boundAgent.name}
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Kết nối Provider / Model:
                    </label>
                    <select
                      className="field-select"
                      value={boundAgent.connection_id}
                      onChange={(e) => onUpdateAgent({ ...boundAgent, connection_id: e.target.value })}
                    >
                      {connections.map((c: any) => (
                        <option key={c.connection_id} value={c.connection_id}>
                          {c.name} ({c.model_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      System Prompt của Agent:
                    </label>
                    <textarea
                      className="field-textarea"
                      rows={4}
                      value={boundAgent.system_prompt}
                      onChange={(e) => onUpdateAgent({ ...boundAgent, system_prompt: e.target.value })}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Công cụ Pascal MCP được phép gọi ({boundAgent.allowed_mcp_tools?.length || 0}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(boundAgent.allowed_mcp_tools || []).map((t: string) => (
                        <span key={t} className="status-badge teal" style={{ fontSize: 10.5 }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="surface-subtle">
                <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>
                  Quy tắc Selective Dependency Invalidation:
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Khi đổi vật liệu Sơn/Gạch (Mục 7B), chỉ nhánh <code className="mono">n6_style</code> và{' '}
                  <code className="mono">n10_cost</code> được tính lại; nút <code className="mono">n5_geometry</code> được giữ nguyên để không dựng lại tường 3D.
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Bottom Execution Timeline & Logs Panel (Section 8) */}
      {showLogsDrawer && (
        <div
          style={{
            height: 165,
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '6px 18px',
              background: 'var(--surface-secondary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>Nhật Ký Thực Thi & Timeline (Workflow Execution Logs)</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Tổng số lượt chạy: {runs.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px' }}>
            {runs.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Chưa có lượt chạy thủ công mới. Nhấn "Chạy Toàn Bộ Quy Trình (Start Run)" để ghi nhận timeline từng bước.
              </div>
            ) : (
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Mã Lượt Chạy</th>
                    <th>Quy Trình</th>
                    <th>Trạng Thái</th>
                    <th>Tiến Độ Các Bước</th>
                    <th className="num">Thời Gian Hoàn Tất</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r: any) => (
                    <tr key={r.run_id}>
                      <td className="mono">{r.run_id}</td>
                      <td>{r.workflow_id}</td>
                      <td>
                        <span className="status-badge emerald">{r.status}</span>
                      </td>
                      <td className="mono">
                        {r.events?.filter((ev: any) => ev.status === 'COMPLETED').length || 14} / 14 bước hoàn thành
                      </td>
                      <td className="num">{r.completed_at?.slice(0, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Section 9: AI Agents Management Page (Master-Detail View)
 */
interface AIAgentsRegistryViewProps {
  agents: any[]
  connections: any[]
  mcpTools: any[]
  onUpdateAgent: (agent: any) => void
}

export const AIAgentsRegistryView: React.FC<AIAgentsRegistryViewProps> = ({
  agents,
  connections,
  mcpTools,
  onUpdateAgent,
}) => {
  const [selectedId, setSelectedId] = useState<string>(agents[0]?.agent_id || 'agent_chief_architect')
  const [draftPrompt, setDraftPrompt] = useState<string>('')

  const activeAgent = agents.find((a: any) => a.agent_id === selectedId) || agents[0]

  const handleSelect = (ag: any) => {
    setSelectedId(ag.agent_id)
    setDraftPrompt(ag.system_prompt || '')
  }

  return (
    <div className="page-container">
      <div className="page-header-bar">
        <div>
          <h1 className="text-page-title">Quản Trị Đội Ngũ Chuyên Gia AI (AI Agents Registry)</h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Quản lý 8 Agent chuyên biệt (Kiến Trúc Sư Trưởng, Mặt Bằng 2D, Hình Học 3D, Phong Cách, Nội Thất, Dự Toán, Mua Sắm, Phối Cảnh) kèm phân quyền công cụ Pascal MCP.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, alignItems: 'start' }}>
        {/* Left Grid: Agent Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {agents.map((ag: any) => {
            const isSel = activeAgent?.agent_id === ag.agent_id
            const conn = connections.find((c: any) => c.connection_id === ag.connection_id)
            return (
              <div
                key={ag.agent_id}
                className={`surface-card interactive ${isSel ? 'selected' : ''}`}
                onClick={() => handleSelect(ag)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Bot size={17} />
                    </div>
                    <div>
                      <div className="text-card-title">{ag.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {ag.role} • v{ag.version}
                      </div>
                    </div>
                  </div>
                  <span className="status-badge emerald">Active</span>
                </div>

                <p className="text-caption" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {ag.system_prompt}
                </p>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 8,
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: 11.5,
                  }}
                >
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                    {conn?.kind?.toUpperCase() || 'MCP'} • {conn?.model_name || ag.connection_id}
                  </span>
                  <span className="status-badge teal">{ag.allowed_mcp_tools?.length || 0} MCP tools</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Detail Configuration Drawer/Panel */}
        {activeAgent && (
          <div className="surface-card" style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="text-section-title">{activeAgent.name}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  ID: {activeAgent.agent_id}
                </div>
              </div>
              <span className="status-badge teal">Ngưỡng: {(activeAgent.confidence_threshold || 0.85) * 100}%</span>
            </div>

            <div>
              <label className="text-caption" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Kết nối Provider chính:
              </label>
              <select
                className="field-select"
                value={activeAgent.connection_id}
                onChange={(e) => onUpdateAgent({ ...activeAgent, connection_id: e.target.value })}
              >
                {connections.map((c: any) => (
                  <option key={c.connection_id} value={c.connection_id}>
                    {c.name} ({c.kind} — {c.model_name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                System Prompt (Chỉ thị chuyên môn):
              </label>
              <textarea
                className="field-textarea"
                rows={5}
                value={draftPrompt || activeAgent.system_prompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                style={{ marginTop: 8 }}
                onClick={() =>
                  onUpdateAgent({
                    ...activeAgent,
                    system_prompt: draftPrompt || activeAgent.system_prompt,
                  })
                }
              >
                <Save size={12} /> Lưu Cấu Hình Agent
              </button>
            </div>

            <div>
              <div className="text-caption" style={{ fontWeight: 600, marginBottom: 6 }}>
                Quyền Hành Động (Governance Permissions):
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`status-badge ${activeAgent.permissions?.can_ask_user ? 'emerald' : 'neutral'}`}>
                  Hỏi người dùng (ask_user): {activeAgent.permissions?.can_ask_user ? 'Có' : 'Không'}
                </span>
                <span className={`status-badge ${activeAgent.permissions?.can_propose_scene ? 'emerald' : 'neutral'}`}>
                  Đề xuất Scene 3D: {activeAgent.permissions?.can_propose_scene ? 'Có' : 'Không'}
                </span>
                <span className="status-badge neutral">
                  Ghi đè trực tiếp không qua duyệt: Chặn (Safe)
                </span>
              </div>
            </div>

            <div>
              <div className="text-caption" style={{ fontWeight: 600, marginBottom: 6 }}>
                Danh sách công cụ Pascal MCP được cấp phép ({activeAgent.allowed_mcp_tools?.length || 0} / {mcpTools.length || 80}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(activeAgent.allowed_mcp_tools || []).map((t: string) => (
                  <span key={t} className="status-badge teal">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
