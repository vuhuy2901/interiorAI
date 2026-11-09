/**
 * ATELIER AI — Premium Architectural SaaS & Multi-Agent Studio Shell
 * Implements Master Prompt Sections 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 + G3/G4/G5/G6/G7/G8:
 * - Global Collapsible Sidebar (8 Primary Items + Project Selector + Footer Theme/Settings/Status)
 * - Global Topbar (Breadcrumb, Project Name, Save Status, Total Estimate, Revision Badge, History Drawer Trigger, DXF/GLB Exports)
 * - Persistent 3D/2D Studio Workspace (Three.js Canvas stays mounted across tab switches to avoid GPU reload)
 * - Compact Floating Viewport Toolbar + Layer Toggles + Reset Camera
 * - Dedicated Collapsible Object & Material Inspector (Multi-Material Slot Editor, 3D Asset Switcher, Floor 800x800mm Tile Proposal)
 * - High-Craft Chief Architect AI Design Assistant & Deduplicated Proposal Approval Cards + Blender Cycles Inline Render Cards
 */
import React, { useEffect, useRef, useState } from 'react'
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
  Layers,
  Save,
  MoreHorizontal,
} from 'lucide-react'
import { StudioViewport } from './components/StudioViewport'
import { ObjectInspector } from './components/ObjectInspector'
import { AIDesignAssistant } from './components/AIDesignAssistant'
import { RevisionHistoryDrawer } from './components/RevisionHistoryDrawer'
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

type DockId = 'inspector' | 'architect'

const readDockWidth = (key: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback
  const stored = Number(window.localStorage.getItem(key))
  return Number.isFinite(stored) ? Math.min(520, Math.max(248, stored)) : fallback
}

const readDockOpen = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback
  const stored = window.localStorage.getItem(key)
  return stored == null ? fallback : stored === 'true'
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
  const [pbrMaterials, setPbrMaterials] = useState<any[]>([])
  const [assetLibrary, setAssetLibrary] = useState<any[]>([])

  // Workspace Viewport & Panel States
  const [viewMode, setViewMode] = useState<'split' | '2d' | '3d'>('split')
  const [cameraPreset, setCameraPreset] = useState<'orbit' | 'top' | 'cutaway' | 'walk'>('cutaway')
  const [lightingPreset, setLightingPreset] = useState<'day' | 'sunset' | 'night'>('day')
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>('furn_sofa_main')
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => readDockOpen('atelier.inspectorOpen', true))
  const [architectPanelOpen, setArchitectPanelOpen] = useState<boolean>(() => readDockOpen('atelier.architectPanelOpen', true))
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => readDockWidth('atelier.inspectorWidth', 316))
  const [architectPanelWidth, setArchitectPanelWidth] = useState<number>(() => readDockWidth('atelier.architectPanelWidth', 392))
  const [resizingDock, setResizingDock] = useState<DockId | null>(null)
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null)
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false)
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false)
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false)
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
  const [savingScene, setSavingScene] = useState<boolean>(false)
  const [exportingFormat, setExportingFormat] = useState<'dxf' | 'glb' | null>(null)
  const [scaleInputMm, setScaleInputMm] = useState<number>(4000)
  const [uploadingFile, setUploadingFile] = useState<boolean>(false)
  const [lastImportResult, setLastImportResult] = useState<any | null>(null)
  const [fitCheckResults, setFitCheckResults] = useState<Record<string, any>>({})

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('atelier.inspectorWidth', String(inspectorWidth))
  }, [inspectorWidth])

  useEffect(() => {
    window.localStorage.setItem('atelier.inspectorOpen', String(inspectorOpen))
  }, [inspectorOpen])

  useEffect(() => {
    window.localStorage.setItem('atelier.architectPanelWidth', String(architectPanelWidth))
  }, [architectPanelWidth])

  useEffect(() => {
    window.localStorage.setItem('atelier.architectPanelOpen', String(architectPanelOpen))
  }, [architectPanelOpen])

  useEffect(() => {
    if (!resizingDock) return

    const handlePointerMove = (event: PointerEvent) => {
      const origin = resizeOrigin.current
      if (!origin) return
      const nextWidth = Math.min(520, Math.max(248, origin.width + origin.x - event.clientX))
      if (resizingDock === 'inspector') setInspectorWidth(nextWidth)
      else setArchitectPanelWidth(nextWidth)
    }

    const stopResizing = () => {
      resizeOrigin.current = null
      setResizingDock(null)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopResizing, { once: true })
    document.body.classList.add('is-resizing-dock')

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', stopResizing)
      document.body.classList.remove('is-resizing-dock')
    }
  }, [resizingDock])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key !== 'Escape') return
      if (showLayerMenu) {
        setShowLayerMenu(false)
        return
      }
      if (showMoreMenu) {
        setShowMoreMenu(false)
        return
      }
      if (architectPanelOpen) setArchitectPanelOpen(false)
      else if (inspectorOpen) setInspectorOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [architectPanelOpen, inspectorOpen, showLayerMenu, showMoreMenu])

  const notify = (msg: string) => {
    setStatusToast(msg)
    setTimeout(() => setStatusToast(null), 4000)
  }

  const startDockResize = (dock: DockId, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = dock === 'inspector' ? inspectorWidth : architectPanelWidth
    setResizingDock(dock)
    document.body.classList.add('is-resizing-dock')

    const onMove = (e: MouseEvent | PointerEvent) => {
      const delta = startX - e.clientX
      const nextWidth = Math.min(520, Math.max(248, startWidth + delta))
      if (dock === 'inspector') setInspectorWidth(nextWidth)
      else setArchitectPanelWidth(nextWidth)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('is-resizing-dock')
      setResizingDock(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    ;(window as any).__atelierSetDockWidth = (dock: DockId, width: number) => {
      if (dock === 'inspector') setInspectorWidth(width)
      else setArchitectPanelWidth(width)
    }
  }, [])

  const resetWorkspaceLayout = () => {
    setInspectorWidth(316)
    setArchitectPanelWidth(392)
    setInspectorOpen(true)
    setArchitectPanelOpen(true)
    setViewMode('split')
    setShowMoreMenu(false)
    notify('Đã khôi phục bố cục Design Studio mặc định.')
  }

  const loadAllData = async (projectId?: string) => {
    const targetId =
      projectId ||
      window.localStorage.getItem('atelier.activeProjectId') ||
      'proj_demo_4x5m'
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
        pbrRes,
        assetsRes,
      ] = await Promise.all([
        fetch('/api/v1/projects').then((r) => r.json()),
        fetch(`/api/v1/projects/${targetId}`).then(async (r) => {
          if (!r.ok) {
            return fetch('/api/v1/projects/proj_demo_4x5m').then((r2) => r2.json())
          }
          return r.json()
        }),
        fetch('/api/v1/materials').then((r) => r.json()),
        fetch('/api/v1/catalog').then((r) => r.json()),
        fetch(`/api/v1/chat/history?project_id=${targetId}`).then((r) => r.json()),
        fetch('/api/v1/workflows').then((r) => r.json()),
        fetch('/api/v1/runs').then((r) => r.json()),
        fetch('/api/v1/agents').then((r) => r.json()),
        fetch('/api/v1/connections').then((r) => r.json()),
        fetch('/api/v1/mcp/tools').then((r) => r.json()),
        fetch('/api/v1/pbr-materials').then((r) => r.json()),
        fetch('/api/v1/assets/library').then((r) => r.json()),
      ])
      setProjects(Array.isArray(projListRes) ? projListRes : [])
      setProject(projRes)
      if (projRes?.project_id) {
        window.localStorage.setItem('atelier.activeProjectId', projRes.project_id)
      }
      setMaterialsDb(matRes || { paints: [], tiles_and_flooring: [], skirting_options: [] })
      setCatalog(Array.isArray(catRes) ? catRes : [])
      setChatHistory(chatRes || { messages: [], pending_questions: [], proposals: [] })
      setWorkflows(Array.isArray(wfRes) ? wfRes : [])
      setRuns(Array.isArray(runsRes) ? runsRes : [])
      setAgents(Array.isArray(agRes) ? agRes : [])
      setConnections(Array.isArray(connRes) ? connRes : [])
      setMcpTools(mcpRes?.tools || [])
      setPbrMaterials(pbrRes?.materials || [])
      setAssetLibrary(assetsRes?.assets || [])
    } catch (err) {
      console.error('Failed to load initial studio data:', err)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [])

  // ============================================================================
  // PRESERVED & EXTENDED BACKEND API HANDLERS
  // ============================================================================
  const handleCreateProject = async (name: string, style: string, budgetLimitVnd: number) => {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        style,
        budget_limit_vnd: budgetLimitVnd,
      }),
    }).then((r) => r.json())
    if (res?.project_id) {
      await loadAllData(res.project_id)
      notify(`Đã tạo dự án mới "${res.name}" (${res.project_id}).`)
    }
    return res
  }

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
    if (res.ok === false) {
      notify(res.message || 'Đề xuất đã cũ và không thể ghi đè revision hiện tại.')
      return
    }
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
    setSavingScene(true)
    try {
      const response = await fetch(`/api/v1/projects/${project.project_id}/scene`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })
      if (!response.ok) throw new Error(`Save failed: ${response.status}`)
      const saved = await response.json()
      const fullProj = await fetch(`/api/v1/projects/${saved.project_id}`).then((r) => r.json())
      setProject(fullProj)
      notify(`Đã lưu Scene 3D, Rev #${fullProj.revision}.`)
    } catch (error) {
      console.error('Failed to save scene:', error)
      notify('Không thể lưu Scene. Vui lòng thử lại.')
    } finally {
      setSavingScene(false)
    }
  }

  const handlePreviewMaterial = (payload: any) => {
    window.dispatchEvent(new CustomEvent('atelier:material-preview', { detail: payload }))
  }

  const handleCreateMaterialProposal = async (objectId: string, payload: any) => {
    if (!project) return null
    const response = await fetch(
      `/api/v1/projects/${project.project_id}/furniture/${objectId}/material-proposals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const result = await response.json()
    if (!response.ok) {
      notify(result.detail || 'Không thể tạo đề xuất vật liệu.')
      return null
    }
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify('Đã tạo SceneProposal vật liệu. Preview chưa ghi đè revision hiện tại.')
    return result
  }

  const handleCreateSurfaceMaterialProposal = async (surfaceId: string, payload: any) => {
    if (!project) return null
    const response = await fetch(
      `/api/v1/projects/${project.project_id}/surfaces/${surfaceId}/material-proposals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const result = await response.json()
    if (!response.ok) {
      notify(result.detail || 'Không thể tạo đề xuất vật liệu bề mặt.')
      return null
    }
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify('Đã tạo SceneProposal vật liệu bề mặt sàn 800×800mm (ron 3mm).')
    return result
  }

  const handleAssignAsset = async (objectId: string, assetId: string) => {
    if (!project) return null
    const response = await fetch(
      `/api/v1/projects/${project.project_id}/furniture/${objectId}/assign-asset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId }),
      }
    )
    const result = await response.json()
    if (!response.ok) {
      notify(result.detail || 'Không thể gán 3D asset.')
      return null
    }
    const fullProj = await fetch(`/api/v1/projects/${project.project_id}`).then((r) => r.json())
    setProject(fullProj)
    notify(`Đã gán 3D Asset ${assetId} (${result.asset?.material_slots?.length || 1} material slots).`)
    return result
  }

  const handleResetMaterialPreview = () => {
    if (project) loadAllData(project.project_id)
  }

  const handleRequestSmartFit = async (objectId: string) => {
    if (!project) return null
    return fetch(`/api/v1/projects/${project.project_id}/furniture/${objectId}/smart-fit`).then((r) => r.json())
  }

  const handleRequestPlacementOptions = async (objectId: string) => {
    if (!project) return null
    return fetch(`/api/v1/projects/${project.project_id}/furniture/${objectId}/placement-options?limit=2`).then((r) => r.json())
  }

  const handleCreatePlacementProposal = async (objectId: string, option: any) => {
    if (!project) return null
    const response = await fetch(`/api/v1/projects/${project.project_id}/furniture/${objectId}/placement-proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(option),
    })
    const result = await response.json()
    if (!response.ok) {
      notify(result.detail?.message || result.detail || 'Phương án không đạt Smart Fit.')
      return null
    }
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
    notify('Đã tạo SceneProposal bố trí; revision hiện tại chưa bị thay đổi.')
    return result
  }

  const handleExport = async (format: 'dxf' | 'glb') => {
    if (!project || exportingFormat) return
    setExportingFormat(format)
    try {
      const response = await fetch(`/api/v1/exports/${project.project_id}/${format}`)
      if (!response.ok) throw new Error(`Export failed: ${response.status}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${project.project_id}_rev${project.revision}.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      notify(`Đã xuất file ${format.toUpperCase()}.`)
    } catch (error) {
      console.error(`Failed to export ${format}:`, error)
      notify(`Không thể xuất file ${format.toUpperCase()}. Vui lòng thử lại.`)
    } finally {
      setExportingFormat(null)
    }
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
    const runsRes = await fetch('/api/v1/runs').then((r) => r.json())
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

  const refreshChatHistory = async () => {
    if (!project?.project_id) return
    const chatRes = await fetch(`/api/v1/chat/history?project_id=${project.project_id}`).then((r) => r.json())
    setChatHistory(chatRes)
  }

  const est = project?.estimate_snapshot
  const pendingProposalCount = (chatHistory.proposals || []).filter((p: any) => p.status === 'PENDING').length
  const estimateLabel = est?.total_vnd == null ? 'Chưa tính' : formatVnd(est.total_vnd)
  const sceneGraphStatus = project?.pascal_scene_json?.validation?.scenegraph || project?.scenegraph_status
  const sceneStatusLabel = sceneGraphStatus === 'VALID' ? 'SceneGraph hợp lệ' : sceneGraphStatus ? `SceneGraph ${sceneGraphStatus}` : 'SceneGraph chưa xác thực'

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
                data-testid="project-switcher-select"
                className="project-switcher"
                aria-label="Chọn dự án"
                value={project?.project_id || 'proj_demo_4x5m'}
                onChange={(e) => loadAllData(e.target.value)}
              >
                {projects.map((p: any) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
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
            <span data-testid="topbar-project-name" className="breadcrumb-current" title={project?.name}>
              {project?.name || 'Đang tải dự án...'}
            </span>
            {project && (
              <>
                <span className="save-status-pill" title="Trạng thái tỷ lệ bản vẽ">
                  <span className={`status-dot ${project.scale_calibrated ? '' : 'amber'}`} />
                  <span>{project.scale_calibrated ? 'Tỷ lệ 1:1 đã xác nhận' : 'Chờ xác nhận tỷ lệ'}</span>
                </span>
                <span className="save-status-pill scene-status-pill" title="Trạng thái SceneGraph">
                  <span className={`status-dot ${sceneGraphStatus === 'VALID' ? '' : 'amber'}`} />
                  <span>{sceneStatusLabel}</span>
                </span>
              </>
            )}
          </div>

          {/* Right: Total Estimate, Revision, History Trigger, Export DXF/GLB */}
          <div className="topbar-right">
            {project && (
              <>
                <button
                  data-testid="topbar-estimate-btn"
                  className="topbar-metric topbar-metric-button"
                  onClick={() => setActiveTab('cost')}
                  title="Xem chi tiết bảng dự toán BOQ"
                >
                  <span className="topbar-metric-label">Dự toán:</span>
                  <span className="topbar-metric-value" style={{ color: 'var(--accent)' }}>
                    {estimateLabel}
                  </span>
                </button>

                <button
                  data-testid="topbar-save-scene-btn"
                  className="btn btn-sm"
                  onClick={handleCommitCanvasPosition}
                  disabled={savingScene}
                  title="Lưu Scene hiện tại"
                >
                  <Save size={13} /> {savingScene ? 'Đang lưu...' : 'Lưu Scene'}
                </button>

                <button
                  data-testid="topbar-history-btn"
                  className="btn btn-sm"
                  onClick={() => setShowHistoryDrawer(true)}
                  title="Mở lịch sử phiên bản & Khôi phục (Undo/Restore)"
                >
                  <History size={13} />
                  <span className="mono">Rev #{project.revision}</span>
                </button>

                <button
                  data-testid="topbar-export-dxf-btn"
                  className="btn btn-sm hide-mobile"
                  onClick={() => handleExport('dxf')}
                  disabled={exportingFormat !== null}
                  title="Xuất bản vẽ kỹ thuật AutoCAD DXF 1:1 (mm)"
                >
                  <Download size={13} /> {exportingFormat === 'dxf' ? 'Đang xuất...' : 'DXF'}
                </button>

                <button
                  data-testid="topbar-export-glb-btn"
                  className="btn btn-sm btn-primary hide-mobile"
                  onClick={() => handleExport('glb')}
                  disabled={exportingFormat !== null}
                  title="Xuất mô hình 3D glTF Binary (.GLB)"
                >
                  <Download size={13} /> {exportingFormat === 'glb' ? 'Đang xuất...' : 'Xuất GLB'}
                </button>
              </>
            )}
          </div>
        </header>

        {/* FLOATING TOAST FEEDBACK */}
        {statusToast && (
          <div
            role="status"
            data-testid="status-toast"
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
          {project && (
            <div
              className="workspace-layout"
              style={{
                display: activeTab === 'workspace' ? 'flex' : 'none',
                '--inspector-width': `${inspectorWidth}px`,
                '--architect-panel-width': `${architectPanelWidth}px`,
                '--architect-offset': architectPanelOpen ? `${architectPanelWidth}px` : '0px',
              } as React.CSSProperties}
            >
              {/* CENTER: EXPANSIVE 3D / 2D VIEWPORT WITH COMPACT FLOATING TOOLBAR */}
              <section className="viewport-stage-wrapper">
                <div className="floating-viewport-bar" role="toolbar" aria-label="Công cụ góc nhìn 2D/3D">
                  {/* 2D / 3D Mode Segmented Control */}
                  <div className="segmented-group">
                    <button
                      className={`seg-btn ${viewMode === 'split' ? 'active' : ''}`}
                      onClick={() => setViewMode('split')}
                      aria-pressed={viewMode === 'split'}
                      title="Hiển thị mặt bằng 2D và phối cảnh 3D"
                    >
                      2D + 3D
                    </button>
                    <button
                      className={`seg-btn ${viewMode === '2d' ? 'active' : ''}`}
                      onClick={() => setViewMode('2d')}
                      aria-pressed={viewMode === '2d'}
                      title="Chỉ hiển thị mặt bằng 2D"
                    >
                      2D
                    </button>
                    <button
                      className={`seg-btn ${viewMode === '3d' ? 'active' : ''}`}
                      onClick={() => setViewMode('3d')}
                      aria-pressed={viewMode === '3d'}
                      title="Chỉ hiển thị phối cảnh 3D"
                    >
                      3D
                    </button>
                  </div>

                  <div className="toolbar-divider" />

                  <div className="segmented-group" aria-label="Môi trường ánh sáng">
                    {(['day', 'sunset', 'night'] as const).map((preset) => (
                      <button
                        key={preset}
                        data-testid={`lighting-${preset}`}
                        className={`seg-btn ${lightingPreset === preset ? 'active' : ''}`}
                        onClick={() => setLightingPreset(preset)}
                        aria-pressed={lightingPreset === preset}
                      >
                        {preset === 'day' ? 'Ngày' : preset === 'sunset' ? 'Hoàng hôn' : 'Đêm'}
                      </button>
                    ))}
                  </div>

                  <div className="toolbar-divider" />

                  {/* Camera Presets Segmented Control */}
                  <div className="segmented-group camera-presets" aria-label="Góc camera">
                    <button
                      className={`seg-btn ${cameraPreset === 'cutaway' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('cutaway')}
                      aria-pressed={cameraPreset === 'cutaway'}
                      title="Góc cắt mở, nhìn rõ tường và nội thất"
                    >
                      Cutaway
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'orbit' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('orbit')}
                      aria-pressed={cameraPreset === 'orbit'}
                      title="Góc phối cảnh tự do"
                    >
                      Orbit
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'top' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('top')}
                      aria-pressed={cameraPreset === 'top'}
                      title="Nhìn từ trên xuống"
                    >
                      Top
                    </button>
                    <button
                      className={`seg-btn ${cameraPreset === 'walk' ? 'active' : ''}`}
                      onClick={() => setCameraPreset('walk')}
                      aria-pressed={cameraPreset === 'walk'}
                      title="Góc nhìn người cao 1,55m"
                    >
                      Walk
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
                    data-testid="toggle-inspector"
                    className={`btn btn-sm ${inspectorOpen ? 'btn-soft' : ''}`}
                    onClick={() => setInspectorOpen(!inspectorOpen)}
                    aria-expanded={inspectorOpen}
                    aria-controls="inspector-dock"
                    title="Đóng/mở bảng Thuộc tính & Vật liệu"
                  >
                    <Sliders size={12} /> {inspectorOpen ? 'Inspector' : 'Mở Inspector'}
                  </button>

                  <button
                    data-testid="toggle-ai-panel"
                    className={`btn btn-sm ${architectPanelOpen ? 'btn-soft' : ''}`}
                    onClick={() => setArchitectPanelOpen(!architectPanelOpen)}
                    aria-expanded={architectPanelOpen}
                    aria-controls="architect-panel-dock"
                    title="Đóng/mở Trợ lý Thiết kế AI"
                  >
                    <Sparkles size={12} /> {architectPanelOpen ? 'Trợ lý AI' : 'Mở AI'}
                  </button>

                  <div className="toolbar-menu-anchor">
                    <button
                      className={`btn btn-sm ${showMoreMenu ? 'btn-soft' : ''}`}
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      aria-expanded={showMoreMenu}
                      aria-haspopup="menu"
                      title="Thêm công cụ Design Studio"
                    >
                      <MoreHorizontal size={14} /> Thêm
                    </button>
                    {showMoreMenu && (
                      <div className="surface-card toolbar-overflow-menu" role="menu">
                        <button className="btn btn-sm" role="menuitem" onClick={resetWorkspaceLayout}>
                          <RotateCcw size={12} /> Đặt lại bố cục
                        </button>
                        <button
                          className="btn btn-sm"
                          role="menuitem"
                          onClick={() => {
                            setCameraResetTrigger((c) => c + 1)
                            setShowMoreMenu(false)
                          }}
                        >
                          <RotateCcw size={12} /> Đặt lại camera
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Persistent 2D CAD + 3D Pascal SceneGraph Viewport */}
                <StudioViewport
                  project={project}
                  materialsDb={materialsDb}
                  pbrMaterials={pbrMaterials}
                  viewMode={viewMode}
                  cameraPreset={cameraPreset}
                  lightingPreset={lightingPreset}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={(id) => {
                    setSelectedEntityId(id)
                  }}
                  onMoveFurniture={handleMoveFurniture}
                  lowSpecMode={lowSpecMode}
                  theme={theme}
                  cameraResetTrigger={cameraResetTrigger}
                  visibleLayers={visibleLayers}
                />
              </section>

              {/* COLLAPSIBLE OBJECT & MATERIAL INSPECTOR DOCK (Section 6.3 & 11) */}
              {inspectorOpen && (
                <div className="dock-column inspector-column" style={{ width: `${inspectorWidth}px` }}>
                  <button
                    className="dock-resize-handle"
                    onPointerDown={(event) => startDockResize('inspector', event)}
                    aria-label="Kéo để thay đổi chiều rộng Inspector"
                    title="Kéo để thay đổi chiều rộng Inspector"
                  />
                  <ObjectInspector
                    project={project}
                    materialsDb={materialsDb}
                    pbrMaterials={pbrMaterials}
                    assetLibrary={assetLibrary}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={setSelectedEntityId}
                    onUpdateFurnitureField={handleUpdateFurnitureField}
                    onCommitCanvasPosition={handleCommitCanvasPosition}
                    onUpdateSurfaces7B={handleUpdateSurfaces7B}
                    onPreviewMaterial={handlePreviewMaterial}
                    onCreateMaterialProposal={handleCreateMaterialProposal}
                    onCreateSurfaceMaterialProposal={handleCreateSurfaceMaterialProposal}
                    onAssignAsset={handleAssignAsset}
                    onResetMaterialPreview={handleResetMaterialPreview}
                    onRequestSmartFit={handleRequestSmartFit}
                    onRequestPlacementOptions={handleRequestPlacementOptions}
                    onCreatePlacementProposal={handleCreatePlacementProposal}
                    onClose={() => setInspectorOpen(false)}
                    savingScene={savingScene}
                  />
                </div>
              )}

              {/* COLLAPSIBLE CHIEF ARCHITECT AI DESIGN ASSISTANT DOCK (Section 7 & 10) */}
              {architectPanelOpen && (
                <div className="dock-column architect-column">
                  <button
                    className="dock-resize-handle"
                    onPointerDown={(event) => startDockResize('architect', event)}
                    aria-label="Kéo để thay đổi chiều rộng trợ lý AI"
                    title="Kéo để thay đổi chiều rộng trợ lý AI"
                  />
                  <AIDesignAssistant
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
                    onCloseMobile={() => setArchitectPanelOpen(false)}
                  />
                </div>
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
                if (pid && pid !== project?.project_id) loadAllData(pid)
                setActiveTab('workspace')
              }}
              onNavigate={setActiveTab}
              onCreateProject={handleCreateProject}
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
            <RenderAndCadPage
              project={project}
              materialsDb={materialsDb}
              pbrMaterials={pbrMaterials}
              onNotify={notify}
              onRefreshChat={refreshChatHistory}
            />
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
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        project={project}
        onRestoreRevision={handleRestoreRevision}
      />
    </div>
  )
}
