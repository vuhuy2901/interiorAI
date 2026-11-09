/**
 * ATELIER AI — Premium Architectural SaaS & Multi-Agent Studio Shell
 * Implements Master Prompt Sections 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18:
 * - Global Collapsible Sidebar (8 Primary Items + Project Selector + Footer Theme/Settings/Status)
 * - Global Topbar (Breadcrumb, Project Name, Save Status, Total Estimate, Revision Badge, History Drawer Trigger, DXF/GLB Exports)
 * - Persistent 3D/2D Studio Workspace (Three.js Canvas stays mounted across tab switches to avoid GPU reload)
 * - Compact Floating Viewport Toolbar + Layer Toggles + Reset Camera
 * - Dedicated Collapsible Object & Material Inspector
 * - High-Craft Chief Architect AI Design Assistant & Deduplicated Proposal Approval Cards
 */
import React, { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Upload,
  Box,
  Cpu,
  Bot,
  Palette,
  Camera,
  Calculator,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  Download,
  Sun,
  Moon,
  Sliders,
  Sparkles,
  RotateCcw,
  Eye,
  Layers,
} from 'lucide-react'
import { StudioViewport } from './components/StudioViewport'
import { ObjectInspector } from './components/ObjectInspector'
import { AIDesignAssistant } from './components/AIDesignAssistant'
import { RevisionHistoryDrawer } from './components/RevisionHistoryDrawer'
import { CreateProjectModal } from './components/CreateProjectModal'
import { AIControlCenterView, AIAgentsRegistryView } from './components/AIControlCenterView'
import {
  DashboardOverviewPage,
  FloorPlanImportPage,
  MaterialsAndCatalogPage,
  RenderAndCadPage,
  CostEstimationPage,
  AIConnectionsSettingsPage,
} from './components/SupportingPages'

export type NavSectionId =
  | 'dashboard'
  | 'import'
  | 'workspace'
  | 'control_center'
  | 'agents'
  | 'materials'
  | 'renders'
  | 'cost'
  | 'settings'

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`

const SECTION_LABELS: Record<NavSectionId, string> = {
  dashboard: 'Tổng quan',
  import: 'Nhập mặt bằng 2D',
  workspace: 'Không gian thiết kế',
  control_center: 'AI Control Center',
  agents: 'AI Agents',
  materials: 'Sơn & Vật liệu',
  renders: 'Phối cảnh Render',
  cost: 'Dự toán',
  settings: 'Cài đặt & Kết nối AI',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavSectionId>('workspace')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Core Application Data State (100% Real Backend APIs)
  const [projects, setProjects] = useState<any[]>([])
  const [project, setProject] = useState<any | null>(null)
  const [materialsDb, setMaterialsDb] = useState<any>({
    paints: [],
    tiles_and_flooring: [],
    skirting_options: [],
  })
  const [catalog, setCatalog] = useState<any[]>([])
  const [chatHistory, setChatHistory] = useState<any>({
    messages: [],
    pending_questions: [],
    proposals: [],
  })
  const [workflows, setWorkflows] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const [mcpTools, setMcpTools] = useState<any[]>([])

  // Workspace Viewport & Panel States
  const [viewMode, setViewMode] = useState<'split' | '2d' | '3d'>('split')
  const [cameraPreset, setCameraPreset] = useState<'orbit' | 'top' | 'cutaway' | 'walk'>('cutaway')
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>('furn_sofa_main')
  const [showInspector, setShowInspector] = useState<boolean>(true)
  const [showAiPanel, setShowAiPanel] = useState<boolean>(true)
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false)
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false)
  const [visibleLayers, setVisibleLayers] = useState({
    dimensions: true,
    doorSwings: true,
    furnitureLabels: true,
    grid: true,
  })

  // Chat, Import & Toast States
  const [chatInput, setChatInput] = useState<string>('')
  const [sendingChat, setSendingChat] = useState<boolean>(false)
  const [lowSpecMode, setLowSpecMode] = useState<boolean>(false)
  const [statusToast, setStatusToast] = useState<string | null>(null)
  const [scaleInputMm, setScaleInputMm] = useState<number>(4000)
  const [uploadingFile, setUploadingFile] = useState<boolean>(false)
  const [lastImportResult, setLastImportResult] = useState<any | null>(null)
  const [fitCheckResults, setFitCheckResults] = useState<Record<string, any>>({})
  const [showCreateProject, setShowCreateProject] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const notify = (msg: string) => {
    setStatusToast(msg)
    setTimeout(() => setStatusToast(null), 4000)
  }

  const switchProject = async (projectId = 'proj_demo_4x5m') => {
    setChatInput('')
    setFitCheckResults({})
    setLastImportResult(null)
    setSelectedEntityId(null)
    setChatHistory({ messages: [], pending_questions: [], proposals: [] })
    setShowHistoryDrawer(false)
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
        fetch(`/api/v1/runs?project_id=${projectId}`).then((r) => r.json()),
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
      setConnections(Array.isArray(connRes) ? connRes : [])
      setMcpTools(mcpRes?.tools || [])
      setSelectedEntityId(projRes?.furniture_instances?.[0]?.id || null)
      localStorage.setItem('atelier_active_project_id', projectId)
    } catch (err) {
      console.error('Failed to load initial studio data:', err)
    }
  }

  useEffect(() => {
    switchProject(localStorage.getItem('atelier_active_project_id') || 'proj_demo_4x5m')
  }, [])

  // ============================================================================
  // PRESERVED BACKEND API HANDLERS (ZERO FUNCTIONAL REGRESSION)
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
      if (res.project) {
        const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
        setProject(fullProj)
      }
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
    if (!project) return
    const res = await fetch(`/api/v1/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    }).then((r) => r.json())
    if (res.project) {
      const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
      setProject(fullProj)
    }
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify(`Đã xác nhận "${answer}" — Mở khóa dự toán chính xác!`)
  }

  const handleApproveProposal = async (proposalId: string, optionId?: string) => {
    if (!project) return
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
    notify(`Đã duyệt & áp dụng vào Scene 3D (Rev #${res.project?.revision})!`)
  }

  const handleRejectProposal = async (proposalId: string) => {
    if (!project) return
    await fetch(`/api/v1/proposals/${proposalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Người dùng từ chối đề xuất' }),
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
    notify('Đã đồng bộ Vật Liệu Bề Mặt (Mục 7B) & Tính lại dự toán tức thì.')
  }

  const handleRestoreRevision = async (rev: number) => {
    if (!project) return
    await fetch(`/api/v1/projects/${project.project_id}/revisions/${rev}/restore`, { method: 'POST' })
    const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
    setProject(fullProj)
    notify(`Đã khôi phục (Restore) về phiên bản #${rev}!`)
  }

  const handleUndoLastRevision = () => {
    if (!project || !project.revisions || project.revisions.length < 2) return
    const prevRev = project.revisions[1]?.revision || Math.max(1, project.revision - 1)
    handleRestoreRevision(prevRev)
  }

  const handleMoveFurniture = (furnId: string, newX: number, newY: number) => {
    if (!project) return
    const updatedFurn = project.furniture_instances.map((f: any) =>
      f.id === furnId ? { ...f, x_mm: newX, y_mm: newY } : f
    )
    setProject({ ...project, furniture_instances: updatedFurn })
  }

  const handleUpdateFurnitureField = (furnId: string, field: string, value: any) => {
    if (!project) return
    const updatedFurn = project.furniture_instances.map((f: any) =>
      f.id === furnId ? { ...f, [field]: value } : f
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
    notify(`Đã lưu trạng thái Scene 3D (Rev #${fullProj.revision}).`)
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
    notify(`Đã xác nhận tỷ lệ chuẩn 1 cạnh = ${scaleInputMm} mm!`)
  }

  const handleRunWorkflow = async () => {
    const wfId = workflows[0]?.workflow_id || 'wf_default_interior_pipeline'
    await fetch(`/api/v1/workflows/${wfId}/runs?project_id=${project?.project_id || 'proj_demo_4x5m'}`, {
      method: 'POST',
    })
    const runsRes = await fetch(`/api/v1/runs?project_id=${project?.project_id || ''}`).then((r) => r.json())
    setRuns(runsRes)
    notify('Đã thực thi luồng 14 Node Multi-Agent thành công!')
  }

  const handleUpdateWorkflow = async (wfPayload: any) => {
    const updated = await fetch(`/api/v1/workflows/${wfPayload.workflow_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wfPayload),
    }).then((r) => r.json())
    setWorkflows([updated])
    notify('Đã cập nhật cấu hình Workflow.')
  }

  const handleUpdateAgent = async (agentPayload: any) => {
    const updated = await fetch(`/api/v1/agents/${agentPayload.agent_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentPayload),
    }).then((r) => r.json())
    setAgents((prev) => prev.map((a) => (a.agent_id === updated.agent_id ? updated : a)))
    notify(`Đã cập nhật cấu hình ${updated.name}.`)
  }

  const handleTestConnection = async (connId: string) => {
    const updated = await fetch(`/api/v1/connections/${connId}/test`, { method: 'POST' }).then((r) => r.json())
    setConnections((prev) => prev.map((c) => (c.connection_id === connId ? updated : c)))
    notify(`Kiểm tra kết nối ${updated.name}: ${updated.status} (${updated.latency_ms}ms)`)
  }

  const handleSaveConnectionKey = async (connId: string, key: string) => {
    const updated = await fetch(`/api/v1/connections/${connId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    }).then((r) => r.json())
    setConnections((prev) => prev.map((c) => (c.connection_id === connId ? updated : c)))
    notify('Đã mã hóa và lưu API Key (REDACTED).')
  }

  const est = project?.estimate_snapshot
  const pendingProposalCount = (chatHistory.proposals || []).filter((p: any) => p.status === 'PENDING').length

  // 8 Primary Navigation Items in Global Sidebar (Section 5.1)
  const primaryNavItems: { id: NavSectionId; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={16} /> },
    { id: 'import', label: 'Nhập mặt bằng 2D', icon: <Upload size={16} /> },
    {
      id: 'workspace',
      label: 'Không gian thiết kế',
      icon: <Box size={16} />,
      badge: pendingProposalCount > 0 ? pendingProposalCount : undefined,
    },
    { id: 'control_center', label: 'AI Control Center', icon: <Cpu size={16} />, badge: '14' },
    { id: 'agents', label: 'AI Agents', icon: <Bot size={16} />, badge: agents.length || 8 },
    { id: 'materials', label: 'Sơn & Vật liệu', icon: <Palette size={16} /> },
    { id: 'renders', label: 'Phối cảnh Render', icon: <Camera size={16} /> },
    { id: 'cost', label: 'Dự toán', icon: <Calculator size={16} /> },
  ]

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-stage">
        Chuyển đến vùng làm việc chính
      </a>

      {/* ====================================================================
          5.1 GLOBAL SIDEBAR (NAVIGATION ONLY — NO CLUTTERED FORMS)
         ==================================================================== */}
      <aside className={`global-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Điều hướng chính">
        <div>
          <div className="sidebar-header">
            <div className="sidebar-brand-row">
              <div className="brand-identity">
                <div className="brand-glyph">A</div>
                {!sidebarCollapsed && (
                  <div className="brand-titles">
                    <span className="brand-name">ATELIER AI</span>
                    <span className="brand-tag">Pascal 3D & Multi-Agent</span>
                  </div>
                )}
              </div>
              <button
                className="btn btn-icon btn-sm"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
                title={sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>
            </div>

            {!sidebarCollapsed && (
              <select
                className="project-switcher"
                aria-label="Chọn dự án"
                value={project?.project_id || 'proj_demo_4x5m'}
                onChange={(e) => switchProject(e.target.value)}
              >
                {projects.map((p: any) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {!sidebarCollapsed && <button className="btn btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={() => setShowCreateProject(true)}>+ Dự án mới · {projects.length} dự án</button>}
          </div>

          {/* 8 Primary Navigation Links */}
          <nav className="sidebar-nav">
            {!sidebarCollapsed && <div className="sidebar-section-label">KHÔNG GIAN LÀM VIỆC</div>}
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && <span>{item.label}</span>}
                {!sidebarCollapsed && item.badge !== undefined && (
                  <span className="sidebar-link-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer: Settings, Theme Toggle & Data/Revision Status */}
        <div className="sidebar-footer">
          <button
            data-testid="nav-settings"
            className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Cài đặt & Kết nối AI"
          >
            <Settings size={16} />
            {!sidebarCollapsed && <span>Cài đặt & Kết nối AI</span>}
          </button>

          <button
            className="sidebar-link"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title="Chuyển đổi giao diện Sáng / Tối"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            {!sidebarCollapsed && (
              <span>Giao diện: {theme === 'light' ? 'Sáng (Studio)' : 'Tối (Dark)'}</span>
            )}
          </button>

          {!sidebarCollapsed && project && (
            <div className="sidebar-status-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Pascal MCP</span>
                <span className="mono" style={{ color: 'var(--emerald-text)', fontWeight: 600 }}>
                  ● {mcpTools.length || 80} tools
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Phiên bản</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  Rev #{project.revision}
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ====================================================================
          5.2 GLOBAL TOPBAR + 5.3 MAIN STAGE COLUMN
         ==================================================================== */}
      <div className="shell-main-column">
        <header className="global-topbar">
          {/* Left: Breadcrumb, Project Name, Save/Scale Status */}
          <div className="topbar-left">
            <span className="breadcrumb-root">{SECTION_LABELS[activeTab]}</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current" title={project?.name}>
              {project?.name || 'Đang tải dự án...'}
            </span>
            {project && (
              <span className="save-status-pill">
                <span className={`status-dot ${project.scale_calibrated ? '' : 'amber'}`} />
                <span>{project.scale_calibrated ? 'Đã lưu • Tỷ lệ 1:1 (mm)' : 'Chờ xác nhận tỷ lệ'}</span>
              </span>
            )}
          </div>

          {/* Right: Total Estimate, Revision, History Trigger, Export DXF/GLB */}
          <div className="topbar-right">
            {project && (
              <>
                <div className="topbar-metric" onClick={() => setActiveTab('cost')} style={{ cursor: 'pointer' }} title="Xem chi tiết bảng dự toán BOQ">
                  <span className="topbar-metric-label">Dự toán:</span>
                  <span className="topbar-metric-value" style={{ color: 'var(--accent)' }}>
                    {formatVnd(est?.total_vnd)}
                  </span>
                </div>

                <button
                  className="btn btn-sm"
                  onClick={() => setShowHistoryDrawer(true)}
                  title="Mở lịch sử phiên bản & Khôi phục (Undo/Restore)"
                >
                  <History size={13} />
                  <span className="mono">Rev #{project.revision}</span>
                </button>

                <a
                  className="btn btn-sm hide-mobile"
                  href={`/api/v1/exports/${project.project_id}/dxf`}
                  download
                  title="Xuất bản vẽ kỹ thuật AutoCAD DXF 1:1 (mm)"
                >
                  <Download size={13} /> DXF
                </a>

                <a
                  className="btn btn-sm btn-primary hide-mobile"
                  href={`/api/v1/exports/${project.project_id}/glb`}
                  download
                  title="Xuất mô hình 3D glTF Binary (.GLB)"
                >
                  <Download size={13} /> Xuất 3D GLB
                </a>
              </>
            )}
          </div>
        </header>

        {/* FLOATING TOAST FEEDBACK */}
        {statusToast && (
          <div
            role="status"
            style={{
              position: 'fixed',
              bottom: 20,
              right: 24,
              background: '#171717',
              color: '#FFFFFF',
              padding: '10px 16px',
              borderRadius: 'var(--radius-card)',
              fontSize: 12.5,
              fontWeight: 500,
              zIndex: 999,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {statusToast}
          </div>
        )}

        {/* ==================================================================
            5.3 MAIN STAGE (PERSISTENT WORKSPACE + SUPPORTING VIEWS)
           ================================================================== */}
        <main id="main-stage" className="shell-stage">
          {/*
            SECTION 6 & 18 PERFORMANCE RULE:
            Keep the 3D/2D Design Workspace mounted in the DOM and hide via display:none
            when visiting non-workspace tabs so Three.js WebGL context never remounts!
          */}
          {project && (
            <div
              className="workspace-layout"
              style={{ display: activeTab === 'workspace' ? 'flex' : 'none' }}
            >
              {/* CENTER: EXPANSIVE 3D / 2D VIEWPORT WITH COMPACT FLOATING TOOLBAR */}
              <section className="viewport-stage-wrapper">
                <div className="floating-viewport-bar" role="toolbar" aria-label="Công cụ góc nhìn 2D/3D">
                  {/* 2D / 3D Mode Segmented Control */}
                  <div className="segmented-group">
                    <button
                      className={`seg-btn ${viewMode === 'split' ? 'active' : ''}`}
                      onClick={() => setViewMode('split')}
                    >
                      Song song 2D + 3D
                    </button>
                    <button
                      className={`seg-btn ${viewMode === '2d' ? 'active' : ''}`}
                      onClick={() => setViewMode('2d')}
                    >
                      Chỉ mặt bằng 2D
                    </button>
                    <button
                      className={`seg-btn ${viewMode === '3d' ? 'active' : ''}`}
                      onClick={() => setViewMode('3d')}
                    >
                      Chỉ 3D
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  {/* Camera Presets Segmented Control */}
                  <div className="segmented-group">
                    <button
                      className={`seg-btn ${cameraPreset === 'cutaway' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('cutaway')}
                    >
                      Cutaway
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'orbit' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('orbit')}
                    >
                      Góc phối cảnh
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'top' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('top')}
                    >
                      Nhìn từ trên
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'walk' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('walk')}
                    >
                      Góc nhìn người 1,55m
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  {/* Reset Camera & Layer Visibility Menu */}
                  <button
                    className="btn btn-sm"
                    onClick={() => setCameraResetTrigger((c) => c + 1)}
                    title="Đặt lại góc nhìn Camera"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>

                  <div style={{ position: 'relative' }}>
                    <button
                      className={`btn btn-sm ${showLayerMenu ? 'btn-soft' : ''}`}
                      onClick={() => setShowLayerMenu(!showLayerMenu)}
                      title="Bật/tắt các lớp hiển thị"
                    >
                      <Layers size={12} /> Lớp hiển thị
                    </button>
                    {showLayerMenu && (
                      <div
                        className="surface-card"
                        style={{
                          position: 'absolute',
                          top: 34,
                          right: 0,
                          width: 210,
                          padding: 10,
                          zIndex: 50,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          boxShadow: 'var(--shadow-md)',
                        }}
                      >
                        {[
                          { key: 'dimensions', label: 'Kích thước (mm/m)' },
                          { key: 'doorSwings', label: 'Vùng mở cửa đi' },
                          { key: 'furnitureLabels', label: 'Nhãn đồ nội thất' },
                          { key: 'grid', label: 'Lưới sàn 3D (Grid)' },
                        ].map((ly) => (
                          <label
                            key={ly.key}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={(visibleLayers as any)[ly.key]}
                              onChange={(e) =>
                                setVisibleLayers((prev) => ({ ...prev, [ly.key]: e.target.checked }))
                              }
                            />
                            <span>{ly.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="toolbar-divider" />

                  {/* Toggle Inspector & AI Assistant Docks */}
                  <button
                    className={`btn btn-sm ${showInspector ? 'btn-soft' : ''}`}
                    onClick={() => setShowInspector(!showInspector)}
                    title="Đóng/mở bảng Thuộc tính & Vật liệu"
                  >
                    <Sliders size={12} /> Inspector
                  </button>

                  <button
                    className={`btn btn-sm ${showAiPanel ? 'btn-soft' : ''}`}
                    onClick={() => setShowAiPanel(!showAiPanel)}
                    title="Đóng/mở Trợ lý Thiết kế AI"
                  >
                    <Sparkles size={12} /> Trợ lý AI
                  </button>
                </div>

                {/* Persistent 2D CAD + 3D Pascal SceneGraph Viewport */}
                <StudioViewport
                  project={project}
                  materialsDb={materialsDb}
                  viewMode={viewMode}
                  cameraPreset={cameraPreset}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={(id) => {
                    setSelectedEntityId(id)
                    if (id && !showInspector) setShowInspector(true)
                  }}
                  onMoveFurniture={handleMoveFurniture}
                  lowSpecMode={lowSpecMode}
                  theme={theme}
                  cameraResetTrigger={cameraResetTrigger}
                  visibleLayers={visibleLayers}
                />
              </section>

              {/* COLLAPSIBLE OBJECT & MATERIAL INSPECTOR DOCK (Section 6.3 & 11) */}
              {showInspector && (
                <ObjectInspector
                  project={project}
                  materialsDb={materialsDb}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={setSelectedEntityId}
                  onUpdateFurnitureField={handleUpdateFurnitureField}
                  onCommitCanvasPosition={handleCommitCanvasPosition}
                  onUpdateSurfaces7B={handleUpdateSurfaces7B}
                  onClose={() => setShowInspector(false)}
                />
              )}

              {/* COLLAPSIBLE CHIEF ARCHITECT AI DESIGN ASSISTANT DOCK (Section 7 & 10) */}
              {showAiPanel && (
                <AIDesignAssistant
                  key={project?.project_id}
                  project={project}
                  chatHistory={chatHistory}
                  sendingChat={sendingChat}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  onSendChat={handleSendChat}
                  onAnswerQuestion={handleAnswerQuestion}
                  onApproveProposal={handleApproveProposal}
                  onRejectProposal={handleRejectProposal}
                  onUndoLastRevision={handleUndoLastRevision}
                  onCloseMobile={() => setShowAiPanel(false)}
                />
              )}
            </div>
          )}

          {/* OTHER SUPPORTING VIEWS */}
          {activeTab === 'dashboard' && (
            <DashboardOverviewPage
              projects={projects}
              project={project}
              mcpToolsCount={mcpTools.length}
              onOpenWorkspace={(pid) => {
                if (pid && pid !== project?.project_id) switchProject(pid)
                setActiveTab('workspace')
              }}
              onCreateProject={() => setShowCreateProject(true)}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'import' && (
            <FloorPlanImportPage
              project={project}
              uploadingFile={uploadingFile}
              lastImportResult={lastImportResult}
              scaleInputMm={scaleInputMm}
              onScaleInputChange={setScaleInputMm}
              onUploadFloorplan={handleUploadFloorplan}
              onConfirmScale={handleConfirmScale}
            />
          )}

          {activeTab === 'control_center' && (
            <AIControlCenterView
              key={project?.project_id}
              projectId={project?.project_id || 'proj_demo_4x5m'}
              workflows={workflows}
              runs={runs}
              agents={agents}
              connections={connections}
              mcpTools={mcpTools}
              onRunWorkflow={handleRunWorkflow}
              onUpdateWorkflow={handleUpdateWorkflow}
              onUpdateAgent={handleUpdateAgent}
            />
          )}

          {activeTab === 'agents' && (
            <AIAgentsRegistryView
              agents={agents}
              connections={connections}
              mcpTools={mcpTools}
              onUpdateAgent={handleUpdateAgent}
            />
          )}

          {activeTab === 'materials' && (
            <MaterialsAndCatalogPage
              project={project}
              materialsDb={materialsDb}
              catalog={catalog}
              fitCheckResults={fitCheckResults}
              onUpdateSurfaces7B={handleUpdateSurfaces7B}
              onFitCheck={handleFitCheck}
              onReplaceFromCatalog={handleReplaceFromCatalog}
            />
          )}

          {activeTab === 'renders' && (
            <RenderAndCadPage project={project} materialsDb={materialsDb} />
          )}

          {activeTab === 'cost' && <CostEstimationPage project={project} />}

          {activeTab === 'settings' && (
            <AIConnectionsSettingsPage
              connections={connections}
              lowSpecMode={lowSpecMode}
              onToggleLowSpec={() => {
                setLowSpecMode(!lowSpecMode)
                notify(!lowSpecMode ? 'Đã bật Chế độ Máy Yếu (2D-First).' : 'Đã bật lại 3D WebGL đầy đủ.')
              }}
              onTestConnection={handleTestConnection}
              onSaveConnectionKey={handleSaveConnectionKey}
            />
          )}
        </main>

        {/* MOBILE ACTION BAR (<768px) */}
        <nav
          className="mobile-bottom-bar"
          style={{
            display: 'none',
            height: 52,
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-primary)',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '0 8px',
            zIndex: 45,
          }}
        >
          {primaryNavItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className={`seg-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10.5 }}
            >
              {item.icon}
              <span>{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* SLIDE-OVER REVISION HISTORY DRAWER (Section 13) */}
      <RevisionHistoryDrawer
        key={project?.project_id}
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        project={project}
        onRestoreRevision={handleRestoreRevision}
      />
      <CreateProjectModal open={showCreateProject} onClose={() => setShowCreateProject(false)} onCreated={async (created) => { setShowCreateProject(false); await switchProject(created.project_id); setActiveTab('workspace'); notify(`Đã tạo dự án ${created.name}`) }} />
    </div>
  )
}
