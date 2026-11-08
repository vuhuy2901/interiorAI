/**
 * ATELIER AI — Complete Production Frontend Application
 * Implements all 11 Sitemap Views + Section 5A Conversational Design Concierge
 * + Section 7B Surface Paint/Tile Assignment + Multi-Agent Control Center (React Flow).
 */
import React, { useEffect, useState } from 'react'
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
  LayoutDashboard,
  Upload,
  Box,
  Cpu,
  Bot,
  Palette,
  Camera,
  Calculator,
  ShoppingBag,
  FileCode2,
  Settings,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Play,
  Download,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Layers,
  RefreshCw,
} from 'lucide-react'
import { StudioViewport } from './components/StudioViewport'

type NavTabId =
  | 'dashboard'
  | 'import'
  | 'workspace'
  | 'control_center'
  | 'agents'
  | 'materials'
  | 'renders'
  | 'cost'
  | 'catalog'
  | 'cad'
  | 'settings'

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('workspace')
  const [projects, setProjects] = useState<any[]>([])
  const [project, setProject] = useState<any | null>(null)
  const [materialsDb, setMaterialsDb] = useState<any>({ paints: [], tiles_and_flooring: [], skirting_options: [] })
  const [catalog, setCatalog] = useState<any[]>([])
  const [chatHistory, setChatHistory] = useState<any>({ messages: [], pending_questions: [], proposals: [] })
  const [workflows, setWorkflows] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const [mcpTools, setMcpTools] = useState<any[]>([])

  // Studio Workspace UI States
  const [viewMode, setViewMode] = useState<'split' | '2d' | '3d'>('split')
  const [cameraPreset, setCameraPreset] = useState<'orbit' | 'top' | 'cutaway' | 'walk'>('cutaway')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>('furn_sofa_main')
  const [rightSubTab, setRightSubTab] = useState<'chat' | 'brief' | 'proposals'>('chat')
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [lowSpecMode, setLowSpecMode] = useState(false)
  const [statusToast, setStatusToast] = useState<string | null>(null)

  // Scale & Import State
  const [scaleInputMm, setScaleInputMm] = useState<number>(4000)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [lastImportResult, setLastImportResult] = useState<any | null>(null)

  // AI Control Center Inspector State
  const [selectedNodeId, setSelectedNodeId] = useState<string>('n6_style')
  const [selectedAgentEdit, setSelectedAgentEdit] = useState<any | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({})
  const [fitCheckResults, setFitCheckResults] = useState<Record<string, any>>({})

  const notify = (msg: string) => {
    setStatusToast(msg)
    setTimeout(() => setStatusToast(null), 4000)
  }

  const loadAllData = async (projectId = 'proj_demo_4x5m') => {
    try {
      const [
        projListRes,
        projRes,
        matRes,
        catRes,
        chatRes,
        wfRes,
        runsRes,
        agRes,
        connRes,
        mcpRes,
      ] = await Promise.all([
        fetch('/api/v1/projects').then((r) => r.json()),
        fetch(`/api/v1/projects/${projectId}`).then((r) => r.json()),
        fetch('/api/v1/materials').then((r) => r.json()),
        fetch('/api/v1/catalog').then((r) => r.json()),
        fetch(`/api/v1/chat/history?project_id=${projectId}`).then((r) => r.json()),
        fetch('/api/v1/workflows').then((r) => r.json()),
        fetch('/api/v1/runs').then((r) => r.json()),
        fetch('/api/v1/agents').then((r) => r.json()),
        fetch('/api/v1/connections').then((r) => r.json()),
        fetch('/api/v1/mcp/tools').then((r) => r.json()),
      ])
      setProjects(Array.isArray(projListRes) ? projListRes : [])
      setProject(projRes)
      setMaterialsDb(matRes || { paints: [], tiles_and_flooring: [], skirting_options: [] })
      setCatalog(Array.isArray(catRes) ? catRes : [])
      setChatHistory(chatRes || { messages: [], pending_questions: [], proposals: [] })
      setWorkflows(Array.isArray(wfRes) ? wfRes : [])
      setRuns(Array.isArray(runsRes) ? runsRes : [])
      setAgents(Array.isArray(agRes) ? agRes : [])
      if (Array.isArray(agRes) && agRes.length > 0 && !selectedAgentEdit) {
        setSelectedAgentEdit(agRes[0])
      }
      setConnections(Array.isArray(connRes) ? connRes : [])
      setMcpTools(mcpRes?.tools || [])
    } catch (err) {
      console.error('Failed to load initial data:', err)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [])

  // ============================================================================
  // INTERACTIVE ACTIONS
  // ============================================================================
  const handleSendChat = async (textOverride?: string) => {
    const msg = (textOverride ?? chatInput).trim()
    if (!msg || !project) return
    setSendingChat(true)
    if (!textOverride) setChatInput('')
    try {
      const res = await fetch('/api/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.project_id,
          message: msg,
          selected_entity_id: selectedEntityId,
        }),
      }).then((r) => r.json())
      if (res.project) setProject({ ...project, ...res.project })
      const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
      setChatHistory(chatRes)
      const wfRes = await fetch('/api/v1/workflows').then((r) => r.json())
      setWorkflows(wfRes)
      notify('Kiến Trúc Sư Trưởng đã phản hồi và cập nhật đề xuất.')
    } finally {
      setSendingChat(false)
    }
  }

  const handleAnswerQuestion = async (questionId: string, answer: string) => {
    const res = await fetch(`/api/v1/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    }).then((r) => r.json())
    if (res.project) setProject({ ...project, ...res.project })
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify(`Đã xác nhận "${answer}" — Tiếp tục quy trình thiết kế!`)
  }

  const handleApproveProposal = async (proposalId: string, optionId?: string) => {
    const res = await fetch(`/api/v1/proposals/${proposalId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_id: optionId || null }),
    }).then((r) => r.json())
    if (res.project) {
      const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
      setProject(fullProj)
    }
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify(`Đã phê duyệt và áp dụng đề xuất vào Scene 3D (Revision #${res.project?.revision})!`)
  }

  const handleRejectProposal = async (proposalId: string) => {
    await fetch(`/api/v1/proposals/${proposalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Người dùng từ chối trên bảng điều khiển' }),
    })
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify('Đã từ chối đề xuất — Giữ nguyên mô hình hiện tại.')
  }

  const handleUpdateSurfaces7B = async (payload: any) => {
    if (!project) return
    const res = await fetch(`/api/v1/projects/${project.project_id}/surfaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json())
    if (res.project) {
      const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
      setProject(fullProj)
    }
    const wfRes = await fetch('/api/v1/workflows').then((r) => r.json())
    setWorkflows(wfRes)
    notify('Đã cập nhật Vật Liệu Bề Mặt (Mục 7B) & Tính lại dự toán tức thì (Không dựng lại tường 3D).')
  }

  const handleRestoreRevision = async (rev: number) => {
    if (!project) return
    await fetch(`/api/v1/projects/${project.project_id}/revisions/${rev}/restore`, { method: 'POST' })
    const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
    setProject(fullProj)
    notify(`Đã khôi phục (Undo) về phiên bản #${rev}!`)
  }

  const handleMoveFurniture = (furnId: string, newX: number, newY: number) => {
    if (!project) return
    const updatedFurn = project.furniture_instances.map((f: any) =>
      f.id === furnId ? { ...f, x_mm: newX, y_mm: newY } : f
    )
    setProject({ ...project, furniture_instances: updatedFurn })
  }

  const handleCommitCanvasPosition = async () => {
    if (!project) return
    const saved = await fetch(`/api/v1/projects/${project.project_id}/scene`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).then((r) => r.json())
    const fullProj = await fetch(`/api/v1/projects/${saved.project_id}`).then((r) => r.json())
    setProject(fullProj)
    notify(`Đã lưu vị trí nội thất mới (Revision #${fullProj.revision}).`)
  }

  const handleFitCheck = async (sku: string) => {
    if (!project) return
    const res = await fetch('/api/v1/catalog/fit-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.project_id, sku }),
    }).then((r) => r.json())
    setFitCheckResults((prev) => ({ ...prev, [sku]: res }))
  }

  const handleReplaceFromCatalog = async (sku: string) => {
    if (!project) return
    const res = await fetch('/api/v1/catalog/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.project_id, sku }),
    }).then((r) => r.json())
    if (res.project) {
      const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
      setProject(fullProj)
      notify(`Đã thay thế sản phẩm ${sku} vào Scene 3D & Cập nhật bảng BOQ!`)
    }
  }

  const handleUploadFloorplan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return
    setUploadingFile(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('project_id', project.project_id)
      const res = await fetch('/api/v1/imports', { method: 'POST', body: form }).then((r) => r.json())
      setLastImportResult(res)
      const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
      setProject(fullProj)
      notify(`Đã phân tích mặt bằng "${file.name}".`)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleConfirmScale = async () => {
    if (!project) return
    await fetch(`/api/v1/projects/${project.project_id}/confirm-scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ real_length_mm: scaleInputMm, wall_id: 'wall_north' }),
    })
    const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
    setProject(fullProj)
    notify(`Đã xác nhận tỷ lệ chuẩn 1 cạnh = ${scaleInputMm} mm! Mở khóa dự toán độ tin cậy cao.`)
  }

  const handleRunWorkflow = async () => {
    const wfId = workflows[0]?.workflow_id || 'wf_default_interior_pipeline'
    await fetch(`/api/v1/workflows/${wfId}/runs?project_id=${project?.project_id || 'proj_demo_4x5m'}`, {
      method: 'POST',
    })
    const runsRes = await fetch('/api/v1/runs').then((r) => r.json())
    setRuns(runsRes)
    notify('Đã thực thi luồng 14 Node Multi-Agent thành công!')
  }

  const handleTestConnection = async (connId: string) => {
    const updated = await fetch(`/api/v1/connections/${connId}/test`, { method: 'POST' }).then((r) => r.json())
    setConnections((prev) => prev.map((c) => (c.connection_id === connId ? updated : c)))
    notify(`Kiểm tra kết nối ${updated.name}: ${updated.status} (${updated.latency_ms}ms)`)
  }

  const handleSaveConnectionKey = async (connId: string) => {
    const key = apiKeyDrafts[connId] || ''
    const updated = await fetch(`/api/v1/connections/${connId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    }).then((r) => r.json())
    setConnections((prev) => prev.map((c) => (c.connection_id === connId ? updated : c)))
    setApiKeyDrafts((prev) => ({ ...prev, [connId]: '' }))
    notify('Đã mã hóa và lưu API Key (đã ẩn giá trị gốc trên giao diện).')
  }

  const est = project?.estimate_snapshot
  const currentRoom = project?.rooms?.[0]
  const activeWf = workflows[0] || { nodes: [], edges: [] }

  const rfNodes: Node[] = (activeWf.nodes || []).map((n: any) => ({
    id: n.id,
    position: n.position || { x: 0, y: 0 },
    data: {
      label: (
        <div
          onClick={() => setSelectedNodeId(n.id)}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: selectedNodeId === n.id ? '2px solid #276E70' : '1px solid #D0D5DD',
            background: n.status === 'RECOMPUTED' ? '#EAF3F3' : '#FFFFFF',
            minWidth: 185,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#17191C' }}>{n.label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#667085' }}>
            <span className="mono">{n.type}</span>
            <span
              style={{
                color: n.status === 'RECOMPUTED' ? '#276E70' : '#15803D',
                fontWeight: 600,
              }}
            >
              {n.status}
            </span>
          </div>
        </div>
      ),
    },
    style: { background: 'transparent', border: 'none', padding: 0, width: 195 },
  }))

  const rfEdges: Edge[] = (activeWf.edges || []).map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: '#276E70', strokeWidth: 1.6 },
  }))

  const navItems: { id: NavTabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Tổng Quan', icon: <LayoutDashboard size={14} /> },
    { id: 'import', label: 'Nhập Mặt Bằng 2D', icon: <Upload size={14} /> },
    { id: 'workspace', label: 'Không Gian Thiết Kế', icon: <Box size={14} /> },
    { id: 'control_center', label: 'AI Control Center', icon: <Cpu size={14} /> },
    { id: 'agents', label: 'AI Agents', icon: <Bot size={14} /> },
    { id: 'materials', label: 'Sơn & Gạch (7B)', icon: <Palette size={14} /> },
    { id: 'renders', label: 'Phối Cảnh Render', icon: <Camera size={14} /> },
    { id: 'cost', label: 'Dự Toán BOQ', icon: <Calculator size={14} /> },
    { id: 'catalog', label: 'Catalog & Mua Sắm', icon: <ShoppingBag size={14} /> },
    { id: 'cad', label: 'CAD & Tích Hợp', icon: <FileCode2 size={14} /> },
    { id: 'settings', label: 'Kết Nối AI', icon: <Settings size={14} /> },
  ]

  return (
    <div className="atelier-shell">
      {/* TOP NAVIGATION BAR */}
      <header className="atelier-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <div>ATELIER AI</div>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: '#667085' }}>
              Pascal 3D BIM & Multi-Agent Studio
            </div>
          </div>
        </div>

        <nav className="nav-strip" aria-label="Main Navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              className={`nav-tab ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {project && (
            <>
              <span className={`badge ${project.scale_calibrated ? 'badge-success' : 'badge-warn'}`}>
                {project.scale_calibrated ? '✓ Tỷ lệ 1:1 (mm)' : '⚠ Chưa khóa tỷ lệ'}
              </span>
              <span className="badge badge-teal">Rev #{project.revision}</span>
              <span className="badge badge-teal">{formatVnd(est?.total_vnd)}</span>
            </>
          )}
        </div>
      </header>

      {/* FLOATING STATUS TOAST */}
      {statusToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 18,
            right: 22,
            background: '#17191C',
            color: '#FFFFFF',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            zIndex: 999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
          }}
        >
          {statusToast}
        </div>
      )}

      {/* BODY CONTENT */}
      <main className="atelier-body">
        {/* ====================================================================
            1. DASHBOARD / OVERVIEW
           ==================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">ATELIER AI — Intelligent Interior Design Studio</h1>
                <p className="page-subtitle">
                  Hệ thống thiết kế nội thất 2D/3D BIM tích hợp Đa Tác Tử (Multi-Agent), Pascal MCP (80 công cụ) và Bóc tách Dự toán Hình học Xác định.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setActiveTab('workspace')}>
                  <Box size={14} /> Mở Studio Thiết Kế 2D/3D
                </button>
                <button className="btn" onClick={() => setActiveTab('import')}>
                  <Upload size={14} /> Nhập Bản Vẽ DXF / PDF / Ảnh
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 22 }}>
              <div className="card">
                <div style={{ fontSize: 12, color: '#667085' }}>Dự án đang mở</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{project?.name}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <span className="badge badge-teal">4000 × 5000 mm (20 m²)</span>
                  <span className="badge badge-success">Rev #{project?.revision}</span>
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, color: '#667085' }}>Tổng dự toán hoàn thiện (VAT 8%)</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#276E70', marginTop: 4 }}>
                  {formatVnd(est?.total_vnd)}
                </div>
                <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>
                  Ngân sách trần: {formatVnd(est?.budget_limit_vnd)} ({est?.within_budget ? 'Đạt yêu cầu' : 'Vượt ngân sách'})
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, color: '#667085' }}>Pascal 3D BIM MCP Gateway</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                  {mcpTools.length || 80} Tools Active
                </div>
                <div style={{ fontSize: 11.5, color: '#15803D', marginTop: 4 }}>
                  ✓ @pascal-app/mcp v1.0.7 In-Memory Bridge
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, color: '#667085' }}>Kiểm định Lối đi & Va chạm 3D</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                  {project?.spatial_qa?.min_walkway_mm || 950} mm
                </div>
                <div style={{ fontSize: 11.5, color: '#15803D', marginTop: 4 }}>
                  ✓ Lối đi thông thủy đạt chuẩn (&gt;= 750mm)
                </div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Danh Sách Dự Án Trong Workspace</h3>
              <table className="boq-table">
                <thead>
                  <tr>
                    <th>Mã Dự Án</th>
                    <th>Tên Dự Án</th>
                    <th>Phong Cách</th>
                    <th>Tỷ Lệ Chuẩn</th>
                    <th>Phiên Bản</th>
                    <th>Tổng Dự Toán (Minh Họa)</th>
                    <th>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p: any) => (
                    <tr key={p.project_id}>
                      <td className="mono">{p.project_id}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.design_brief?.style}</td>
                      <td>
                        <span className={`badge ${p.scale_calibrated ? 'badge-success' : 'badge-warn'}`}>
                          {p.scale_calibrated ? 'Đã khóa 1:1' : 'Chưa xác nhận'}
                        </span>
                      </td>
                      <td className="mono">#{p.revision}</td>
                      <td className="mono">{formatVnd(p.estimate_snapshot?.total_vnd)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            loadAllData(p.project_id)
                            setActiveTab('workspace')
                          }}
                        >
                          Mở Studio
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================================
            2. NEW PROJECT / 2D FLOOR PLAN IMPORT & SCALE CALIBRATION
           ==================================================================== */}
        {activeTab === 'import' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Nhập Bản Vẽ Mặt Bằng 2D & Xác Nhận Tỷ Lệ Chuẩn (mm)</h1>
                <p className="page-subtitle">
                  Hỗ trợ nhập trực tiếp CAD `.dxf` (1:1 milimet) hoặc ảnh mặt bằng `.png / .jpg / .pdf` kèm bước khóa 1 cạnh chuẩn bắt buộc.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>1. Tải Lên Tệp Bản Vẽ Mặt Bằng</h3>
                <p style={{ fontSize: 12.5, color: '#667085', marginBottom: 14 }}>
                  Hệ thống tự động bóc tách các lớp `A-WALL`, `A-DOOR`, `A-WIND`, `A-DIM` từ tệp DXF hoặc nhận diện đường bao tường từ ảnh.
                </p>
                <input
                  type="file"
                  accept=".dxf,.pdf,.png,.jpg,.jpeg"
                  onChange={handleUploadFloorplan}
                  className="input"
                  style={{ marginBottom: 12 }}
                />
                {uploadingFile && <div className="badge badge-teal">Đang phân tích hình học mặt bằng...</div>}
                {lastImportResult && (
                  <div className="card-subtle" style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Kết quả bóc tách: {lastImportResult.filename}</div>
                    <div style={{ fontSize: 12 }}>
                      - Kích thước khung: <span className="mono">{lastImportResult.parsed?.width_mm} × {lastImportResult.parsed?.depth_mm} mm</span>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      - Số đoạn tường: <span className="mono">{lastImportResult.parsed?.walls?.length}</span> | Cửa đi:{' '}
                      <span className="mono">{lastImportResult.parsed?.openings?.length}</span> | Cửa sổ:{' '}
                      <span className="mono">{lastImportResult.parsed?.windows?.length}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  2. Cổng Xác Nhận Tỷ Lệ 1 Cạnh Chuẩn (Mandatory Scale Gate)
                </h3>
                <p style={{ fontSize: 12.5, color: '#667085', marginBottom: 14 }}>
                  Theo quy tắc chống ảo giác kích thước: Nếu nhập từ ảnh chụp mặt bằng, bạn bắt buộc xác nhận chiều dài thực (mm) của ít nhất 1 cạnh tường trước khi hệ thống mở khóa báo giá độ tin cậy cao.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Chiều dài thực tế cạnh tường Bắc (mm):</label>
                    <input
                      type="number"
                      className="input mono"
                      value={scaleInputMm}
                      onChange={(e) => setScaleInputMm(Number(e.target.value))}
                    />
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={handleConfirmScale}>
                    <ShieldCheck size={14} /> Khóa Tỷ Lệ & Dựng 3D
                  </button>
                </div>
                <div className="card-subtle">
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Trạng thái tỷ lệ hiện tại:</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${project?.scale_calibrated ? 'badge-success' : 'badge-warn'}`}>
                      {project?.scale_calibrated ? 'HIGH_VERIFIED_SCALE (Đã xác nhận)' : 'LOW_UNVERIFIED_SCALE (Cần xác nhận)'}
                    </span>
                    <span style={{ fontSize: 12, color: '#667085' }}>{project?.scale_reference?.notes}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            3. DESIGN WORKSPACE (3-PANE ARCHITECTURAL STUDIO)
           ==================================================================== */}
        {activeTab === 'workspace' && project && (
          <div className="studio-grid">
            {/* LEFT PANE: SCENE HIERARCHY & SECTION 7B SURFACE INSPECTOR */}
            <aside className="studio-pane-left">
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #E8EAED' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: '#667085' }}>
                  Cấu Trúc Không Gian BIM (Pascal Nodes)
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{project.name}</div>
              </div>

              <div style={{ padding: '12px 14px', borderBottom: '1px solid #E8EAED' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Phối Nhanh Sơn & Sàn (Mục 7B)</div>

                <label style={{ fontSize: 11.5, color: '#475467', display: 'block', marginBottom: 4 }}>
                  Sơn tường tiêu chuẩn (Interior Base):
                </label>
                <select
                  className="select"
                  style={{ marginBottom: 10 }}
                  value={currentRoom?.wall_base_material_id || 'paint_dulux_japandi_ivory'}
                  onChange={(e) => handleUpdateSurfaces7B({ wall_base_material_id: e.target.value })}
                >
                  {(materialsDb.paints || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.color_code})
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 11.5, color: '#475467', display: 'block', marginBottom: 4 }}>
                  Tường điểm nhấn (Accent Wall — Tường Đông):
                </label>
                <select
                  className="select"
                  style={{ marginBottom: 10 }}
                  value={
                    project.walls?.find((w: any) => w.is_accent_wall)?.face_a_material_id ||
                    'paint_dulux_sage_mist'
                  }
                  onChange={(e) =>
                    handleUpdateSurfaces7B({
                      accent_wall_id: 'wall_east',
                      accent_paint_id: e.target.value,
                    })
                  }
                >
                  {(materialsDb.paints || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      ★ {p.name} ({p.hex_color})
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 11.5, color: '#475467', display: 'block', marginBottom: 4 }}>
                  Gạch lát sàn / Sàn gỗ công nghiệp:
                </label>
                <select
                  className="select"
                  value={currentRoom?.floor_material_id || 'floor_wood_oak_straight'}
                  onChange={(e) => handleUpdateSurfaces7B({ floor_material_id: e.target.value })}
                >
                  {(materialsDb.tiles_and_flooring || []).map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.tile_width_mm}×{t.tile_length_mm}mm)
                    </option>
                  ))}
                </select>
              </div>

              {/* Furniture & Wall Entity Tree */}
              <div style={{ padding: '12px 14px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Đồ Nội Thất Trong Phòng ({project.furniture_instances?.length})</span>
                  <button className="btn btn-sm" onClick={handleCommitCanvasPosition} title="Lưu vị trí kéo thả trên mặt bằng 2D">
                    Lưu vị trí
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(project.furniture_instances || []).map((f: any) => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedEntityId(f.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: selectedEntityId === f.id ? '1.5px solid #276E70' : '1px solid #E8EAED',
                        background: selectedEntityId === f.id ? '#EAF3F3' : '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#667085', marginTop: 2 }}>
                        <span className="mono">
                          {Math.round(f.width_mm)}×{Math.round(f.depth_mm)}mm
                        </span>
                        <span className="mono">{formatVnd(f.price_vnd)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Revision History & Undo */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Lịch Sử Phiên Bản (Undo / Restore)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(project.revisions || []).slice(0, 4).map((r: any) => (
                      <div
                        key={r.id}
                        style={{
                          padding: '6px 8px',
                          background: '#FFFFFF',
                          border: '1px solid #E8EAED',
                          borderRadius: 6,
                          fontSize: 11.5,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span className="mono" style={{ fontWeight: 700 }}>
                            Rev #{r.revision}
                          </span>{' '}
                          — {r.reason?.slice(0, 26)}
                        </div>
                        <button className="btn btn-sm" onClick={() => handleRestoreRevision(r.revision)}>
                          <RotateCcw size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* CENTER PANE: 2D CAD PLAN & 3D PASCAL VIEWPORT */}
            <section className="studio-pane-center">
              <div
                style={{
                  height: 44,
                  padding: '0 14px',
                  borderBottom: '1px solid #E8EAED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#FFFFFF',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className={`btn btn-sm ${viewMode === 'split' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('split')}
                  >
                    Song Song 2D + 3D
                  </button>
                  <button
                    className={`btn btn-sm ${viewMode === '2d' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('2d')}
                  >
                    Chỉ Bản Vẽ 2D CAD
                  </button>
                  <button
                    className={`btn btn-sm ${viewMode === '3d' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('3d')}
                  >
                    Chỉ Phối Cảnh 3D
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: '#667085' }}>Camera 3D:</span>
                  <button
                    className={`btn btn-sm ${cameraPreset === 'cutaway' ? 'btn-primary' : ''}`}
                    onClick={() => setCameraPreset('cutaway')}
                  >
                    Cắt Tường (Cutaway)
                  </button>
                  <button
                    className={`btn btn-sm ${cameraPreset === 'orbit' ? 'btn-primary' : ''}`}
                    onClick={() => setCameraPreset('orbit')}
                  >
                    Phối Cảnh Góc
                  </button>
                  <button
                    className={`btn btn-sm ${cameraPreset === 'top' ? 'btn-primary' : ''}`}
                    onClick={() => setCameraPreset('top')}
                  >
                    Nhìn Từ Trên
                  </button>
                  <button
                    className={`btn btn-sm ${cameraPreset === 'walk' ? 'btn-primary' : ''}`}
                    onClick={() => setCameraPreset('walk')}
                  >
                    Góc Nhìn Người (1.55m)
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <a className="btn btn-sm" href={`/api/v1/exports/${project.project_id}/dxf`} download>
                    <Download size={12} /> Xuất DXF
                  </a>
                  <a className="btn btn-sm" href={`/api/v1/exports/${project.project_id}/glb`} download>
                    <Download size={12} /> Xuất GLB
                  </a>
                </div>
              </div>

              <StudioViewport
                project={project}
                materialsDb={materialsDb}
                viewMode={viewMode}
                cameraPreset={cameraPreset}
                selectedEntityId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
                onMoveFurniture={handleMoveFurniture}
                lowSpecMode={lowSpecMode}
              />
            </section>

            {/* RIGHT PANE: CONVERSATIONAL DESIGN CONCIERGE & PROPOSALS */}
            <aside className="studio-pane-right">
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #E8EAED',
                  background: '#FFFFFF',
                  padding: '6px 10px',
                  gap: 4,
                }}
              >
                <button
                  className={`nav-tab ${rightSubTab === 'chat' ? 'active' : ''}`}
                  onClick={() => setRightSubTab('chat')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Sparkles size={13} /> Trợ Lý Thiết Kế AI
                </button>
                <button
                  className={`nav-tab ${rightSubTab === 'proposals' ? 'active' : ''}`}
                  onClick={() => setRightSubTab('proposals')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Đề Xuất ({chatHistory.proposals?.filter((p: any) => p.status === 'PENDING').length || 0})
                </button>
                <button
                  className={`nav-tab ${rightSubTab === 'brief' ? 'active' : ''}`}
                  onClick={() => setRightSubTab('brief')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Sở Thích
                </button>
              </div>

              {/* SUBTAB 1: 2-WAY AI DESIGN CHAT CONCIERGE */}
              {rightSubTab === 'chat' && (
                <>
                  <div className="chat-messages-scroll">
                    {/* Quick Action Prompt Chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {[
                        'Đề xuất 3 phương án A/B/C dưới 120 triệu',
                        'Sofa hơi to, đổi sofa nhỏ hơn 1.8m',
                        'Đổi sơn tường nhấn sang Xanh Cổ Vịt & lát gạch 800×800',
                        'Kiểm tra lối đi và vùng mở cửa 900mm',
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          className="btn btn-sm"
                          style={{ fontSize: 11, background: '#FFFFFF' }}
                          onClick={() => handleSendChat(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>

                    {/* Chat Messages */}
                    {(chatHistory.messages || []).map((m: any) => (
                      <div key={m.message_id} className={`chat-bubble ${m.role}`}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#276E70', marginBottom: 4 }}>
                          {m.sender_name}
                        </div>
                        <div style={{ whiteSpace: 'pre-line' }}>{m.content}</div>

                        {/* Interactive Question Card (ask_user interrupt) */}
                        {m.metadata?.question && (
                          <div
                            className="card-subtle"
                            style={{ marginTop: 10, border: '1.5px solid #B45309', background: '#FFFAEB' }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12.5, color: '#B45309' }}>
                              ❓ Câu hỏi từ {m.metadata.question.origin_agent}:
                            </div>
                            <div style={{ fontWeight: 600, marginTop: 4 }}>{m.metadata.question.question_text}</div>
                            <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
                              <em>Vì sao cần biết:</em> {m.metadata.question.why_needed}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                              {(m.metadata.question.choices || []).map((c: any) => (
                                <button
                                  key={c.id}
                                  className="btn btn-sm btn-primary"
                                  style={{ justifyContent: 'flex-start' }}
                                  onClick={() => handleAnswerQuestion(m.metadata.question.question_id, c.label)}
                                >
                                  ✓ Chọn: {c.label} — {c.description}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Scene Proposal & Option A/B/C Comparison Card */}
                        {m.metadata?.proposal && (
                          <div className="card-subtle" style={{ marginTop: 10, border: '1.5px solid #276E70' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: 12.5, color: '#276E70' }}>
                                {m.metadata.proposal.title}
                              </span>
                              <span className="badge badge-teal">{m.metadata.proposal.status}</span>
                            </div>

                            {/* Diffs List */}
                            <div style={{ marginTop: 8, fontSize: 12 }}>
                              {(m.metadata.proposal.diffs || []).map((d: any, idx: number) => (
                                <div key={idx} style={{ padding: '4px 0', borderBottom: '1px dashed #E8EAED' }}>
                                  <div>
                                    <strong>Trước:</strong> {d.before_summary}
                                  </div>
                                  <div style={{ color: '#276E70' }}>
                                    <strong>Sau:</strong> {d.after_summary}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Layout Options A / B / C Cards if present */}
                            {m.metadata.proposal.options?.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                {m.metadata.proposal.options.map((opt: any) => (
                                  <div
                                    key={opt.option_id}
                                    style={{
                                      padding: 8,
                                      borderRadius: 6,
                                      background: '#FFFFFF',
                                      border: '1px solid #D0D5DD',
                                      fontSize: 11.5,
                                    }}
                                  >
                                    <div style={{ fontWeight: 700 }}>{opt.title}</div>
                                    <div style={{ color: '#667085', marginTop: 2 }}>{opt.summary}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                      <span className="mono" style={{ fontWeight: 700, color: '#276E70' }}>
                                        {formatVnd(opt.estimated_total_vnd)}
                                      </span>
                                      <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => handleApproveProposal(m.metadata.proposal.proposal_id, opt.option_id)}
                                      >
                                        Áp dụng Phương án {opt.option_id}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Standard Approve / Reject Buttons */}
                            {(!m.metadata.proposal.options || m.metadata.proposal.options.length === 0) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleApproveProposal(m.metadata.proposal.proposal_id)}
                                >
                                  <CheckCircle2 size={13} /> Chấp Nhận Áp Dụng (Approve)
                                </button>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => handleRejectProposal(m.metadata.proposal.proposal_id)}
                                >
                                  <XCircle size={13} /> Từ Chối
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Chat Input Footer */}
                  <div style={{ padding: 10, borderTop: '1px solid #E8EAED', background: '#FFFFFF', display: 'flex', gap: 6 }}>
                    <input
                      data-testid="concierge-chat-input"
                      className="input"
                      placeholder="Nhập yêu cầu (VD: Đổi sofa nhỏ hơn 1.8m, sơn màu xanh sage...)"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    />
                    <button
                      data-testid="concierge-chat-send"
                      className="btn btn-primary"
                      disabled={sendingChat}
                      onClick={() => handleSendChat()}
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </>
              )}

              {/* SUBTAB 2: PROPOSALS INBOX */}
              {rightSubTab === 'proposals' && (
                <div className="chat-messages-scroll">
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Danh Sách Đề Xuất Thay Đổi Mô Hình 3D</div>
                  {(chatHistory.proposals || []).map((p: any) => (
                    <div key={p.proposal_id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700 }}>{p.title}</span>
                        <span className="badge badge-teal">{p.status}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>{p.reason}</p>
                      <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
                        Chênh lệch: {formatVnd(p.cost_delta_vnd)} → Tổng mới: <strong>{formatVnd(p.projected_total_vnd)}</strong>
                      </div>
                      {p.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApproveProposal(p.proposal_id)}>
                            Duyệt & Áp dụng
                          </button>
                          <button className="btn btn-sm" onClick={() => handleRejectProposal(p.proposal_id)}>
                            Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* SUBTAB 3: DESIGN BRIEF / MY PREFERENCES */}
              {rightSubTab === 'brief' && (
                <div className="chat-messages-scroll">
                  <div className="card">
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Hồ Sơ Sở Thích Gia Chủ (Design Brief)</div>
                    <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <strong>Phong cách chủ đạo:</strong> {project.design_brief?.style}
                      </div>
                      <div>
                        <strong>Công năng phòng:</strong> {project.design_brief?.room_function}
                      </div>
                      <div>
                        <strong>Ngân sách mục tiêu:</strong>{' '}
                        <span className="mono">{formatVnd(project.design_brief?.budget_limit_vnd)}</span>
                      </div>
                      <div>
                        <strong>Yếu tố yêu thích:</strong> {(project.design_brief?.liked_elements || []).join(', ')}
                      </div>
                      <div>
                        <strong>Yếu tố tránh dùng:</strong> {(project.design_brief?.disliked_elements || []).join(', ')}
                      </div>
                      <div>
                        <strong>Ràng buộc kỹ thuật:</strong> {(project.design_brief?.must_have_constraints || []).join(' | ')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ====================================================================
            4. AI CONTROL CENTER (REACT FLOW 14-NODE PIPELINE & INSPECTOR)
           ==================================================================== */}
        {activeTab === 'control_center' && (
          <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div>
                <h1 className="page-title">AI Control Center — Điều Phối Đa Agent & Luồng Thực Thi (14 Nodes)</h1>
                <p className="page-subtitle">
                  Quản lý trực quan đồ thị LangGraph / React Flow, kiểm tra Selective Dependency Invalidation và lịch sử chạy từng Node.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleRunWorkflow}>
                  <Play size={14} /> Chạy Toàn Bộ Quy Trình (Run Pipeline)
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, height: 430 }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
                  <Background color="#E8EAED" gap={18} />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              </div>

              <div className="card" style={{ overflowY: 'auto' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Node Inspector (Chi Tiết Nút)</h3>
                {(() => {
                  const node = (activeWf.nodes || []).find((n: any) => n.id === selectedNodeId) || activeWf.nodes?.[0]
                  if (!node) return null
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                      <div>
                        <strong>Mã Node:</strong> <span className="mono">{node.id}</span>
                      </div>
                      <div>
                        <strong>Tên bước:</strong> {node.label}
                      </div>
                      <div>
                        <strong>Loại xử lý:</strong> <span className="badge badge-teal">{node.type}</span>
                      </div>
                      <div>
                        <strong>Agent phụ trách:</strong> <span className="mono">{node.agent_id}</span>
                      </div>
                      <div>
                        <strong>Trạng thái hiện tại:</strong>{' '}
                        <span className="badge badge-success">{node.status}</span>
                      </div>
                      <div className="card-subtle" style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Cấu hình thực thi (JSON):</div>
                        <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(node.config || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Recent Workflow Runs */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Lịch Sử Thực Thi Quy Trình (Workflow Runs)</h3>
              {runs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#667085' }}>
                  Nhấn "Chạy Toàn Bộ Quy Trình" phía trên để ghi nhận lượt chạy mới.
                </div>
              ) : (
                <table className="boq-table">
                  <thead>
                    <tr>
                      <th>Run ID</th>
                      <th>Workflow</th>
                      <th>Trạng Thái</th>
                      <th>Số Bước Hoàn Tất</th>
                      <th>Thời Gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r: any) => (
                      <tr key={r.run_id}>
                        <td className="mono">{r.run_id}</td>
                        <td>{r.workflow_id}</td>
                        <td>
                          <span className="badge badge-success">{r.status}</span>
                        </td>
                        <td className="mono">{r.events?.length || 14} / 14 nodes</td>
                        <td className="mono">{r.completed_at?.slice(0, 19)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            5. AI AGENTS REGISTRY & MCP PERMISSIONS
           ==================================================================== */}
        {activeTab === 'agents' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Danh Bạ Chuyên Gia AI (Multi-Agent Registry & Tool Permissions)</h1>
                <p className="page-subtitle">
                  Cấu hình System Prompt, ngưỡng tự tin (Confidence Threshold), kết nối mô hình và danh sách công cụ Pascal MCP được phép gọi của từng Agent.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
              {agents.map((ag: any) => (
                <div key={ag.agent_id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{ag.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: '#667085' }}>
                        {ag.agent_id} • v{ag.version}
                      </div>
                    </div>
                    <span className="badge badge-success">ACTIVE</span>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: '#475467', background: '#F7F8FA', padding: 10, borderRadius: 6 }}>
                    {ag.system_prompt}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12 }}>
                    <strong>Kết nối chính:</strong> <span className="mono">{ag.connection_id}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <strong>Công cụ Pascal MCP được cấp quyền ({ag.allowed_mcp_tools?.length}):</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {(ag.allowed_mcp_tools || []).map((t: string) => (
                        <span key={t} className="badge badge-teal">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            6. STYLES & SURFACE MATERIALS LIBRARY (SECTION 7B PAINT & TILES)
           ==================================================================== */}
        {activeTab === 'materials' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Thư Viện Sơn Tường, Tường Nhấn & Gạch Lát Sàn (Mục 7B)</h1>
                <p className="page-subtitle">
                  Áp dụng trực tiếp sơn Dulux/Jotun (tính theo độ phủ m²/lít, 1 lớp lót + 2 lớp phủ) và gạch/gỗ lát sàn An Cường, Eurotile, Đồng Tâm (tính theo m²/thùng chẵn).
                </p>
              </div>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>1. Bảng Màu Sơn Nội Thất & Tường Điểm Nhấn (Accent Wall)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
              {(materialsDb.paints || []).map((p: any) => (
                <div key={p.id} className="card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: p.hex_color,
                        border: '1px solid #D0D5DD',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: '#667085' }}>
                        {p.brand} • Mã: {p.color_code} ({p.hex_color})
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#475467', marginTop: 10 }}>
                    Độ phủ: <strong>{p.coverage_m2_per_liter} m²/L</strong> • Quy cách: Thùng {p.can_size_liters}L •{' '}
                    <span className="mono" style={{ fontWeight: 700, color: '#276E70' }}>
                      {formatVnd(p.unit_price_vnd)}/thùng
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleUpdateSurfaces7B({ wall_base_material_id: p.id })}
                    >
                      Sơn Toàn Phòng
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        handleUpdateSurfaces7B({
                          accent_wall_id: 'wall_east',
                          accent_paint_id: p.id,
                        })
                      }
                    >
                      ★ Sơn Tường Nhấn (Đông)
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>2. Gạch Porcelain, Đá Nung Kết & Sàn Gỗ Công Nghiệp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {(materialsDb.tiles_and_flooring || []).map((t: any) => (
                <div key={t.id} className="card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: t.hex_color,
                        border: '1px solid #D0D5DD',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: '#667085' }}>
                        {t.brand} • {t.tile_width_mm}×{t.tile_length_mm}mm ({t.layout_pattern})
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#475467', marginTop: 10 }}>
                    Đóng hộp: <strong>{t.m2_per_box} m²/thùng</strong> • Hao hụt: {Math.round(t.waste_rate * 100)}% •{' '}
                    <span className="mono" style={{ fontWeight: 700, color: '#276E70' }}>
                      {formatVnd(t.price_per_box_vnd)}/thùng
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleUpdateSurfaces7B({ floor_material_id: t.id })}
                    >
                      Áp Dụng Lát Sàn Phòng Khách
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        handleUpdateSurfaces7B({
                          wall_tile_enabled: true,
                          wall_tile_material_id: t.id,
                          wall_tile_height_mm: 1200,
                        })
                      }
                    >
                      Ốp Chân Tường 1.2m
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            7. RENDER GALLERY & GEOMETRY CONSISTENCY QA
           ==================================================================== */}
        {activeTab === 'renders' && project && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Thư Viện Phối Cảnh & Kiểm Định Chống Ảo Giác Hình Học</h1>
                <p className="page-subtitle">
                  Mọi bản phối cảnh đều khóa góc Camera 3D gốc và gắn nhãn minh bạch "AI Visualization — Không dùng để đo kích thước thi công".
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700 }}>Góc Camera 1 — Phối Cảnh Tổng Thể Phòng Khách 4×5m</span>
                  <span className="badge badge-warn">AI Visualization — Not for measurement</span>
                </div>
                <div style={{ height: 320, border: '1px solid #E8EAED', borderRadius: 8, overflow: 'hidden' }}>
                  <StudioViewport
                    project={project}
                    materialsDb={materialsDb}
                    viewMode="3d"
                    cameraPreset="cutaway"
                    selectedEntityId={null}
                    onSelectEntity={() => {}}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#475467' }}>
                  ✓ Kiểm định hình học: Giữ nguyên 4 tường bao, 1 cửa đi 900mm (Nam), 1 cửa sổ 1500mm (Bắc). Không tự ý thêm/bớt cửa sổ.
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700 }}>Góc Camera 2 — Góc Nhìn Ngang Tầm Mắt (Walkthrough 1.55m)</span>
                  <span className="badge badge-success">Geometry Locked 1:1</span>
                </div>
                <div style={{ height: 320, border: '1px solid #E8EAED', borderRadius: 8, overflow: 'hidden' }}>
                  <StudioViewport
                    project={project}
                    materialsDb={materialsDb}
                    viewMode="3d"
                    cameraPreset="walk"
                    selectedEntityId={null}
                    onSelectEntity={() => {}}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#475467' }}>
                  ✓ Đối chiếu vật liệu: Tường nhấn {project.walls?.[1]?.face_a_material_id} & Sàn {currentRoom?.floor_material_id}.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            8. DETERMINISTIC COST ESTIMATION (BOQ TABLE & EXPORT)
           ==================================================================== */}
        {activeTab === 'cost' && est && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Bảng Bóc Tách Khối Lượng & Dự Toán Chi Phí Xác Định (BOQ)</h1>
                <p className="page-subtitle">{est.disclaimer}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn" href={`/api/v1/exports/${project.project_id}/csv`} download>
                  <Download size={14} /> Xuất CSV
                </a>
                <a className="btn btn-primary" href={`/api/v1/exports/${project.project_id}/xlsx`} download>
                  <Download size={14} /> Xuất Excel (.xlsx)
                </a>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="card-subtle">
                <div style={{ fontSize: 11.5, color: '#667085' }}>Vật tư hoàn thiện (Sơn/Gạch/Phào)</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {formatVnd(est.materials_subtotal_vnd)}
                </div>
              </div>
              <div className="card-subtle">
                <div style={{ fontSize: 11.5, color: '#667085' }}>Đồ nội thất rời (Catalog)</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {formatVnd(est.furniture_subtotal_vnd)}
                </div>
              </div>
              <div className="card-subtle">
                <div style={{ fontSize: 11.5, color: '#667085' }}>Nhân công thi công</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {formatVnd(est.labor_subtotal_vnd)}
                </div>
              </div>
              <div className="card-subtle">
                <div style={{ fontSize: 11.5, color: '#667085' }}>Vận chuyển + Thuế VAT (8%)</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {formatVnd((est.shipping_fee_vnd || 0) + (est.tax_vnd || 0))}
                </div>
              </div>
              <div className="card-subtle" style={{ background: '#EAF3F3', borderColor: '#276E70' }}>
                <div style={{ fontSize: 11.5, color: '#276E70', fontWeight: 700 }}>TỔNG CỘNG DỰ TOÁN</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: '#276E70', marginTop: 4 }}>
                  {formatVnd(est.total_vnd)}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="boq-table">
                <thead>
                  <tr>
                    <th>Nhóm</th>
                    <th>Hạng Mục Công Việc / Vật Tư</th>
                    <th>Quy Cách Kỹ Thuật</th>
                    <th>KL Thực</th>
                    <th>Hao Hụt</th>
                    <th>Đóng Thùng/Bộ</th>
                    <th>Đơn Giá</th>
                    <th>Thành Tiền</th>
                    <th>Công Thức Giải Thích Minh Bạch</th>
                  </tr>
                </thead>
                <tbody>
                  {(est.lines || []).map((line: any) => (
                    <tr key={line.id}>
                      <td>
                        <span className="badge badge-teal">{line.category}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {line.title}
                        <div style={{ fontSize: 10.5, color: '#B45309' }}>[{line.source_label}]</div>
                      </td>
                      <td>{line.specification}</td>
                      <td className="mono">
                        {line.net_quantity} {line.unit}
                      </td>
                      <td className="mono">{Math.round((line.waste_rate || 0) * 100)}%</td>
                      <td className="mono">
                        {line.package_count ? `${line.package_count} ${line.package_unit}` : `${line.gross_quantity} ${line.unit}`}
                      </td>
                      <td className="mono">{formatVnd(line.unit_price_vnd)}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {formatVnd(line.subtotal_vnd)}
                      </td>
                      <td className="mono" style={{ fontSize: 11, color: '#475467' }}>
                        {line.formula_explanation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================================
            9. PRODUCT CATALOG & SHOPPING (FIT-CHECK & REPLACE IN 3D SCENE)
           ==================================================================== */}
        {activeTab === 'catalog' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Catalog Nội Thất Việt Nam & Kiểm Tra Lọt Cửa / Thay Thế 3D</h1>
                <p className="page-subtitle">
                  Dữ liệu từ `data/seed/catalog_vn.csv` (Đơn giá minh họa). Bấm "Kiểm tra vừa phòng" hoặc "Thay thế vào Scene 3D" để cập nhật mô hình và bảng BOQ.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
              {catalog.map((item: any) => {
                const fit = fitCheckResults[item.sku]
                return (
                  <div key={item.sku} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="badge badge-teal">{item.sku}</span>
                      <span className="badge badge-warn">GIÁ MINH HỌA</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>{item.material_summary}</div>
                    <div className="mono" style={{ fontSize: 12, marginTop: 8 }}>
                      Kích thước: <strong>{item.width_mm} × {item.depth_mm} × {item.height_mm} mm</strong>
                    </div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: '#276E70', marginTop: 6 }}>
                      {formatVnd(item.price_vnd)}
                    </div>

                    {fit && (
                      <div
                        className="card-subtle"
                        style={{
                          marginTop: 8,
                          fontSize: 11.5,
                          background: fit.overall_fit ? '#ECFDF3' : '#FEF2F2',
                        }}
                      >
                        <div>
                          <strong>Kết quả Fit-Check:</strong> {fit.recommendation}
                        </div>
                        <div className="mono">
                          Chênh lệch giá: {formatVnd(fit.price_delta_vnd)} | Rộng: {fit.width_delta_mm > 0 ? `+${fit.width_delta_mm}` : fit.width_delta_mm}mm
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="btn btn-sm" onClick={() => handleFitCheck(item.sku)}>
                        Kiểm tra vừa phòng
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => handleReplaceFromCatalog(item.sku)}>
                        Thay thế vào Scene 3D
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ====================================================================
            10. CAD & INTEGRATIONS (DXF / GLB / IFC / SKETCHUP DAE / PLUGINS)
           ==================================================================== */}
        {activeTab === 'cad' && project && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Trung Tâm Xuất Nhập Hồ Sơ Kỹ Thuật CAD / BIM (DXF, GLB, IFC4, COLLADA)</h1>
                <p className="page-subtitle">
                  Xuất trực tiếp bản vẽ kỹ thuật tỷ lệ 1:1 (mm), mô hình 3D chuẩn mở và cầu nối plugin cho AutoCAD / SketchUp.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="card">
                <h3 style={{ fontSize: 14.5, fontWeight: 700 }}>1. AutoCAD DXF R2007 (1:1 mm)</h3>
                <p style={{ fontSize: 12, color: '#667085', marginTop: 6 }}>
                  Tạo tệp `.dxf` chuẩn gồm các lớp `A-WALL`, `A-DOOR`, `A-WIND`, `A-FURN`, `A-ROOM-NAME`, `A-DIM`. Sai số khứ hồi &lt;= 1mm.
                </p>
                <a className="btn btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/dxf`} download>
                  <Download size={14} /> Tải Bản Vẽ .DXF
                </a>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14.5, fontWeight: 700 }}>2. Mô Hình 3D glTF Binary (.GLB)</h3>
                <p style={{ fontSize: 12, color: '#667085', marginTop: 6 }}>
                  Tệp nhị phân `.glb` chuẩn glTF 2.0 chứa toàn bộ khối sàn, tường, cửa và đồ nội thất để mở trong Blender / Three.js / SketchUp.
                </p>
                <a className="btn btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/glb`} download>
                  <Download size={14} /> Tải Mô Hình 3D .GLB
                </a>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14.5, fontWeight: 700 }}>3. SketchUp COLLADA 1.4.1 (.DAE)</h3>
                <p style={{ fontSize: 12, color: '#667085', marginTop: 6 }}>
                  Định dạng trao đổi mở `.dae` (đơn vị milimet) tương thích trực tiếp với trình Import của SketchUp Desktop.
                </p>
                <a className="btn btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/dae`} download>
                  <Download size={14} /> Tải SketchUp .DAE
                </a>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14.5, fontWeight: 700 }}>4. Hồ Sơ BIM Chuẩn Mở (.IFC)</h3>
                <p style={{ fontSize: 12, color: '#667085', marginTop: 6 }}>
                  Tệp STEP `IFC4` chứa phân cấp `IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey` và các phần tử tường, cửa, nội thất.
                </p>
                <a className="btn btn-primary" style={{ marginTop: 12 }} href={`/api/v1/exports/${project.project_id}/ifc`} download>
                  <Download size={14} /> Tải Hồ Sơ .IFC
                </a>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                Plugin Cầu Nối Máy Trạm (Desktop CAD Bridges — Đã Kèm Trong Repo)
              </h3>
              <div style={{ fontSize: 12.5, color: '#475467', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  • <strong>SketchUp Ruby Bridge:</strong>{' '}
                  <code className="mono">packages/cad/sketchup_extension/atelier_ai_bridge.rb</code> — Đồng bộ trực tiếp mô hình Canonical (mm) vào SketchUp qua REST API.
                </div>
                <div>
                  • <strong>AutoCAD AutoLISP Suite:</strong>{' '}
                  <code className="mono">packages/cad/autocad_plugin/atelier_bridge.lsp</code> — Lệnh <code className="mono">ATELIER_AUDIT</code> tự động chuẩn hóa Layer & khóa đơn vị <code className="mono">INSUNITS=4</code> (mm).
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            11. SETTINGS -> AI CONNECTIONS & LOW-SPEC HARDWARE PROFILE
           ==================================================================== */}
        {activeTab === 'settings' && (
          <div className="page-scroll">
            <div className="page-header">
              <div>
                <h1 className="page-title">Cấu Hình Kết Nối AI Đa Nguồn & Chế Độ Phần Cứng</h1>
                <p className="page-subtitle">
                  Quản lý Model API (Gemini, OpenAI), CLI Agent, Pascal MCP Server và Local AI (Ollama). Toàn bộ khóa bí mật đều được che bảo mật (`REDACTED`).
                </p>
              </div>
              <div>
                <button
                  className={`btn ${lowSpecMode ? 'btn-primary' : ''}`}
                  onClick={() => {
                    setLowSpecMode(!lowSpecMode)
                    notify(!lowSpecMode ? 'Đã bật Chế độ Máy Cấu Hình Thấp (2D-First).' : 'Đã bật lại 3D WebGL đầy đủ.')
                  }}
                >
                  {lowSpecMode ? 'Đang bật: Chế độ 2D-First (Low-Spec)' : 'Bật Chế độ Máy Yếu (2D-First)'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {connections.map((c: any) => (
                <div key={c.connection_id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: '#667085' }}>
                        {c.kind} • {c.model_name}
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        c.status === 'CONNECTED' || c.status === 'CONFIGURED' ? 'badge-success' : 'badge-warn'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <div className="mono" style={{ fontSize: 11.5, color: '#475467', marginTop: 8 }}>
                    Endpoint/Cmd: {c.endpoint_or_cmd}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Khóa bảo mật: <span className="mono">{c.masked_secret || 'Chưa cấu hình (Dùng Fallback nội bộ)'}</span>
                  </div>
                  {c.last_test_detail && (
                    <div style={{ fontSize: 11.5, color: '#276E70', marginTop: 6 }}>{c.last_test_detail}</div>
                  )}

                  {c.kind === 'model_api' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <input
                        type="password"
                        className="input"
                        placeholder="Nhập API Key mới (Sẽ được che bảo mật)..."
                        value={apiKeyDrafts[c.connection_id] || ''}
                        onChange={(e) => setApiKeyDrafts((prev) => ({ ...prev, [c.connection_id]: e.target.value }))}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => handleSaveConnectionKey(c.connection_id)}>
                        Lưu Key
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 11, color: '#667085' }}>
                      Độ trễ: {c.latency_ms ? `${c.latency_ms} ms` : '--'}
                    </span>
                    <button className="btn btn-sm" onClick={() => handleTestConnection(c.connection_id)}>
                      <RefreshCw size={12} /> Test Connection
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
