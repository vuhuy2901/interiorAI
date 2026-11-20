import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  FileText,
  GitBranch,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useActiveCompanyPrefix, useNavigate } from "@/lib/router";
import { OrthogonalEdge } from "./workflow-graph/OrthogonalEdge";
import { layoutWorkflowGraph, type LayoutDirection } from "./workflow-graph/layout";
import {
  PremiumWorkflowNode,
  type PremiumFlowNode,
  type LinearStepExecution,
  type LinearExecutionTrace,
} from "./workflow-graph/PremiumWorkflowNode";
import { CanvasStickyNote, type CanvasNoteFlowNode } from "./workflow-graph/CanvasStickyNote";
import { StudioTopToolbar, type ProjectOption } from "./workflow-graph/StudioTopToolbar";
import { WorkflowLibrarySidebar, type WorkflowItem } from "./workflow-graph/WorkflowLibrarySidebar";
import { StudioInspector, type AgentOption } from "./workflow-graph/StudioInspector";
import {
  WORKFLOW_NODE_KINDS,
  type CanvasNote,
  type OptionalCostBomStep,
  type RoutedEdgeData,
  type StepSettings,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "./workflow-graph/types";

type Version = {
  id: string;
  version: number;
  status: "draft" | "published" | "active" | "archived";
  name: string;
  updatedAt: string;
  definition: WorkflowDefinition;
};

type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

type SceneOption = {
  project_id: string;
  name: string;
  activeWorkflowId?: string | null;
};

type Snapshot = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  canvasNotes: CanvasNote[];
};

const clone = <T,>(value: T): T => structuredClone(value);

const DEFAULT_COST_BOM: OptionalCostBomStep = {
  id: "cost",
  name: "Cost/BOM (Tùy chọn sau duyệt)",
  enabled: false,
  runsAfterApproval: true,
  requiredRole: "cost_agent",
  taskType: "COST_CALCULATION",
  capability: "cost.calculate",
  description: "Bước tùy chọn: chỉ chạy SAU khi cổng NGƯỜI DUYỆT xác nhận nghiệm thu ở bước cuối.",
};

const nodeTypes = {
  premiumWorkflow: PremiumWorkflowNode,
  canvasNote: CanvasStickyNote,
};

const edgeTypes = {
  orthogonal: OrthogonalEdge,
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || body.detail || `API ${response.status}`);
  }
  return body as T;
}

export function AtelierWorkflowBuilder() {
  const prefix = useActiveCompanyPrefix();
  const navigate = useNavigate();

  // Workflow versions & current selection
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeId, setActiveId] = useState("");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState("proj_demo_4x5m");
  const [activeWorkflowByProject, setActiveWorkflowByProject] = useState<Record<string, string>>({});

  // Workflow Graph State
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [canvasNotes, setCanvasNotes] = useState<CanvasNote[]>([]);
  const [optionalCostBom, setOptionalCostBom] = useState<OptionalCostBomStep>(DEFAULT_COST_BOM);
  const [routes, setRoutes] = useState<Record<string, { x: number; y: number }[]>>({});

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Executions & Mode
  const [executions, setExecutions] = useState<LinearExecutionTrace[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<"design" | "execution">("design");
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>("RIGHT");

  // Panels
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);

  // Search & Feedback
  const [canvasSearch, setCanvasSearch] = useState("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  // Undo / Redo
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  const flowRef = useRef<ReactFlowInstance<any, Edge> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check URL query parameters and sanitize away legacy ?diagram=lifecycle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("diagram") === "lifecycle") {
      params.delete("diagram");
      const newQuery = params.toString();
      const newPath = window.location.pathname + (newQuery ? `?${newQuery}` : "");
      window.history.replaceState(null, "", newPath);
    }
  }, []);

  const active = versions.find((v) => v.id === activeId) ?? null;
  const isDraft = active?.status === "draft";
  const editable = isDraft && workspaceMode === "design";

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedNote = canvasNotes.find((n) => n.id === selectedNoteId) ?? null;

  const isActiveWorkflowForProject = Boolean(
    active && activeWorkflowByProject[selectedSceneId] === active.id,
  );

  const latestExecution = executions[0] ?? null;

  // History checkpoint
  const checkpoint = useCallback(() => {
    setPast((prev) => [
      ...prev.slice(-29),
      { nodes: clone(nodes), edges: clone(edges), canvasNotes: clone(canvasNotes) },
    ]);
    setFuture([]);
    setDirty(true);
  }, [nodes, edges, canvasNotes]);

  // Layout calculation
  const calculateLayout = useCallback(
    async (
      inputNodes: WorkflowNode[],
      inputEdges: WorkflowEdge[],
      dir: LayoutDirection = layoutDirection,
    ) => {
      const result = await layoutWorkflowGraph(inputNodes, inputEdges, dir);
      return { nodes: result.nodes, routes: result.routes };
    },
    [layoutDirection],
  );

  // Refresh Executions
  const refreshExecutions = useCallback(async () => {
    try {
      const payload = await request<{
        latest_published: { id: string; version: number; status: string; name: string };
        scenes: SceneOption[];
        executions: LinearExecutionTrace[];
      }>("/api/atelier/workflow/executions");

      setExecutions(payload.executions);
      setScenes(payload.scenes);

      const mapping: Record<string, string> = {};
      for (const sc of payload.scenes) {
        if (sc.activeWorkflowId) mapping[sc.project_id] = sc.activeWorkflowId;
      }
      setActiveWorkflowByProject((prev) => ({ ...prev, ...mapping }));
    } catch {
      // Non-fatal background fetch
    }
  }, []);

  // Load initial studio data
  const load = useCallback(
    async (preferredId?: string) => {
      setBusy("load");
      setError("");
      try {
        const [versionPayload, agentPayload, execPayload] = await Promise.all([
          request<{ versions: Version[] }>("/api/atelier/workflow/definitions"),
          request<{ agents: AgentOption[] }>("/api/atelier/agent-capabilities"),
          request<{
            latest_published: { id: string; version: number; status: string; name: string };
            scenes: SceneOption[];
            executions: LinearExecutionTrace[];
          }>("/api/atelier/workflow/executions"),
        ]);

        setVersions(versionPayload.versions);
        setAgents(agentPayload.agents);
        setExecutions(execPayload.executions);
        setScenes(execPayload.scenes);

        if (execPayload.scenes.length && !execPayload.scenes.some((s) => s.project_id === selectedSceneId)) {
          setSelectedSceneId(execPayload.scenes[0].project_id);
        }

        const projectMap: Record<string, string> = {};
        for (const s of execPayload.scenes) {
          if (s.activeWorkflowId) projectMap[s.project_id] = s.activeWorkflowId;
        }
        setActiveWorkflowByProject(projectMap);

        // Pick preferred or draft v6 or published v5 or first
        const next =
          (preferredId ? versionPayload.versions.find((v) => v.id === preferredId) : null) ??
          versionPayload.versions.find((v) => v.status === "draft") ??
          versionPayload.versions.find((v) => v.status === "published") ??
          versionPayload.versions[0];

        if (next) {
          const layout = await calculateLayout(clone(next.definition.nodes), clone(next.definition.edges));
          setActiveId(next.id);
          setNodes(layout.nodes);
          setEdges(clone(next.definition.edges));
          setRoutes(layout.routes);
          setCanvasNotes((next.definition.canvasNotes as CanvasNote[]) ?? []);
          setOptionalCostBom(next.definition.optionalSteps?.costBomAfterApproval ?? DEFAULT_COST_BOM);
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setSelectedNoteId(null);
        }
        setDirty(false);
        setPast([]);
        setFuture([]);
        setIssues([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được workflow studio.");
      } finally {
        setBusy("");
      }
    },
    [calculateLayout, selectedSceneId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Select workflow version
  const selectWorkflow = async (id: string) => {
    const target = versions.find((v) => v.id === id);
    if (!target) return;
    const layout = await calculateLayout(clone(target.definition.nodes), clone(target.definition.edges));
    setActiveId(id);
    setNodes(layout.nodes);
    setEdges(clone(target.definition.edges));
    setRoutes(layout.routes);
    setCanvasNotes((target.definition.canvasNotes as CanvasNote[]) ?? []);
    setOptionalCostBom(target.definition.optionalSteps?.costBomAfterApproval ?? DEFAULT_COST_BOM);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNoteId(null);
    setIssues([]);
    setDirty(false);
    setPast([]);
    setFuture([]);
    requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.16, maxZoom: 0.95 }));
  };

  // Node operations
  const patchNode = (patch: Partial<WorkflowNode>) => {
    if (!selectedNode || !editable) return;
    checkpoint();
    setNodes((items) =>
      items.map((item) => (item.id === selectedNode.id ? { ...item, ...patch } : item)),
    );
  };

  const deleteNode = (nodeId: string) => {
    if (!editable) return;
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || ["START", "END"].includes(target.type)) return;
    checkpoint();
    setNodes((items) => items.filter((n) => n.id !== nodeId));
    setEdges((items) => items.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setRoutes({});
  };

  const addNode = (type: WorkflowNodeKind, position?: { x: number; y: number }) => {
    if (!editable) return;
    checkpoint();
    const id = `${type.toLowerCase()}_${crypto.randomUUID().slice(0, 6)}`;
    const isTask = ["AGENT_TASK", "RESEARCH", "VALIDATION"].includes(type);

    const pos = position ?? {
      x: 200 + nodes.length * 30,
      y: 120 + nodes.length * 20,
    };

    const newNode: WorkflowNode = {
      id,
      type,
      name: `Bước ${type}`,
      position: pos,
      ...(isTask
        ? {
            taskType: type,
            requiredRole: "specialist",
            requiredOutputs: ["output"],
            completionCriteria: ["Nghiệm thu đầu ra hợp lệ"],
            retryPolicy: { maxAttempts: 2, backoffSeconds: 15 },
          }
        : {}),
      ...(type === "APPROVAL_GATE"
        ? { approval: { required: true, approverRole: "authorized_approver" } }
        : {}),
      ...(type === "CONDITION" ? { conditionOutcomes: ["yes", "no"] } : {}),
      stepSettings: {
        retry: { maxAttempts: 2, backoffSeconds: 15 },
        logging: { enabled: true, level: "info" },
        notifications: { onStart: false, onComplete: true, onError: true },
      },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setSelectedNoteId(null);
    setRightInspectorOpen(true);
    setRoutes({});
  };

  // Edge operations
  const patchEdge = (patch: Partial<WorkflowEdge>) => {
    if (!selectedEdge || !editable) return;
    checkpoint();
    setEdges((items) =>
      items.map((item) => (item.id === selectedEdge.id ? { ...item, ...patch } : item)),
    );
    setRoutes({});
  };

  const deleteEdge = (edgeId: string) => {
    if (!editable) return;
    checkpoint();
    setEdges((items) => items.filter((e) => e.id !== edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    setRoutes({});
  };

  // Canvas Sticky Note operations
  const addStickyNote = (pos?: { x: number; y: number }) => {
    if (!editable) return;
    checkpoint();
    const id = `note_${crypto.randomUUID().slice(0, 6)}`;
    const newNote: CanvasNote = {
      id,
      title: "Ghi chú Studio",
      content: "",
      position: pos ?? { x: 120, y: 100 },
      color: "yellow",
      updatedAt: new Date().toISOString(),
    };
    setCanvasNotes((prev) => [...prev, newNote]);
    setSelectedNoteId(id);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setRightInspectorOpen(true);
  };

  const patchCanvasNote = (id: string, patch: Partial<CanvasNote>) => {
    if (!editable) return;
    checkpoint();
    setCanvasNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
    );
  };

  const deleteCanvasNote = (id: string) => {
    if (!editable) return;
    checkpoint();
    setCanvasNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  // Auto Layout
  const runAutoLayout = async (direction: LayoutDirection = "RIGHT") => {
    setBusy("layout");
    setLayoutDirection(direction);
    try {
      const result = await calculateLayout(nodes, edges, direction);
      if (editable) checkpoint();
      setNodes(result.nodes);
      setRoutes(result.routes);
      requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.16, maxZoom: 0.95 }));
      setMessage(`Đã sắp xếp graph theo hướng ${direction === "RIGHT" ? "Ngang" : "Dọc"}.`);
    } finally {
      setBusy("");
    }
  };

  // Fit View
  const handleFitView = () => {
    flowRef.current?.fitView({ padding: 0.16, maxZoom: 0.95, duration: 250 });
  };

  // Undo / Redo
  const undo = () => {
    const prevSnapshot = past.at(-1);
    if (!prevSnapshot) return;
    setFuture((prev) => [
      { nodes: clone(nodes), edges: clone(edges), canvasNotes: clone(canvasNotes) },
      ...prev,
    ]);
    setPast((prev) => prev.slice(0, -1));
    setNodes(prevSnapshot.nodes);
    setEdges(prevSnapshot.edges);
    setCanvasNotes(prevSnapshot.canvasNotes);
    setRoutes({});
    setDirty(true);
  };

  const redo = () => {
    const nextSnapshot = future[0];
    if (!nextSnapshot) return;
    setPast((prev) => [
      ...prev,
      { nodes: clone(nodes), edges: clone(edges), canvasNotes: clone(canvasNotes) },
    ]);
    setFuture((prev) => prev.slice(1));
    setNodes(nextSnapshot.nodes);
    setEdges(nextSnapshot.edges);
    setCanvasNotes(nextSnapshot.canvasNotes);
    setRoutes({});
    setDirty(true);
  };

  // Workflow Definition bundle
  const buildDefinition = (): WorkflowDefinition => ({
    ...active!.definition,
    schemaVersion: 2,
    version: active!.version,
    name: active!.name,
    nodes,
    edges,
    canvasNotes,
    optionalSteps: { costBomAfterApproval: optionalCostBom },
  });

  // Save Draft
  const handleSaveDraft = async () => {
    if (!active || !editable) return;
    setBusy("save");
    setError("");
    try {
      const payload = await request<{
        workflow: Version;
        validation: { issues: ValidationIssue[] };
      }>(`/api/atelier/workflow/definitions/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          definition: buildDefinition(),
          expected_updated_at: active.updatedAt,
        }),
      });
      setVersions((prev) => prev.map((v) => (v.id === active.id ? payload.workflow : v)));
      setIssues(payload.validation.issues);
      setDirty(false);
      setMessage(`Đã lưu thành công Draft v${active.version}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu draft thất bại.");
    } finally {
      setBusy("");
    }
  };

  // Validate
  const handleValidate = async () => {
    if (!active) return;
    setBusy("validate");
    setError("");
    try {
      const res = await request<{ valid: boolean; issues: ValidationIssue[] }>(
        `/api/atelier/workflow/definitions/${active.id}/validate`,
        {
          method: "POST",
          body: JSON.stringify({ definition: buildDefinition() }),
        },
      );
      setIssues(res.issues);
      if (res.valid) {
        setMessage(`Quy trình hợp lệ: 0 lỗi.`);
      } else {
        setMessage(`Phát hiện ${res.issues.length} cảnh báo / lỗi.`);
        setRightInspectorOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation thất bại.");
    } finally {
      setBusy("");
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!active || !isDraft) return;
    setBusy("publish");
    setError("");
    try {
      if (dirty) await handleSaveDraft();
      const res = await request<{ workflow: Version }>(
        `/api/atelier/workflow/definitions/${active.id}/publish`,
        { method: "POST" },
      );
      setVersions((prev) => prev.map((v) => (v.id === active.id ? res.workflow : v)));
      setMessage(`🎉 Đã Publish phiên bản v${res.workflow.version} thành công!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish thất bại.");
    } finally {
      setBusy("");
    }
  };

  // Activate workflow for current project
  const handleActivateWorkflow = async (workflowId = activeId) => {
    setBusy("activate");
    setError("");
    try {
      const res = await request<{ ok: boolean; activeWorkflowId: string }>(
        `/api/atelier/workflow/projects/${encodeURIComponent(selectedSceneId)}/activate`,
        {
          method: "POST",
          body: JSON.stringify({ workflow_id: workflowId }),
        },
      );
      setActiveWorkflowByProject((prev) => ({
        ...prev,
        [selectedSceneId]: res.activeWorkflowId,
      }));
      setMessage(`🎉 Đã kích hoạt workflow cho dự án ${selectedSceneId}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kích hoạt workflow cho dự án thất bại.");
    } finally {
      setBusy("");
    }
  };

  // Create new draft
  const handleCreateNewDraft = async () => {
    if (!active) return;
    setBusy("draft");
    setError("");
    try {
      const res = await request<{ workflow: Version }>(
        `/api/atelier/workflow/definitions/${active.id}/draft`,
        { method: "POST" },
      );
      await load(res.workflow.id);
      setMessage(`Đã tạo bản nháp mới Draft v${res.workflow.version}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo bản nháp mới.");
    } finally {
      setBusy("");
    }
  };

  // Execute workflow on project
  const handleExecute = async () => {
    setBusy("run");
    setError("");
    setMessage("");
    try {
      const res = await request<{ execution: LinearExecutionTrace }>(
        "/api/atelier/workflow/run",
        {
          method: "POST",
          body: JSON.stringify({
            scene_id: selectedSceneId,
            project_id: selectedSceneId,
            workflow_id: activeId,
            optional_cost_bom_enabled: optionalCostBom.enabled,
          }),
        },
      );
      setExecutions((prev) => [res.execution, ...prev]);
      setWorkspaceMode("execution");
      setMessage(`Đã khởi chạy quy trình cho dự án ${selectedSceneId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thực thi workflow thất bại.");
    } finally {
      setBusy("");
    }
  };

  // Approval decision
  const handleApprovalDecision = async (
    traceId: string,
    decision: "approve" | "reject",
    note?: string,
  ) => {
    setBusy("decision");
    try {
      const res = await request<{ execution: LinearExecutionTrace }>(
        `/api/atelier/workflow/executions/${encodeURIComponent(traceId)}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            note,
            optional_cost_bom_enabled: optionalCostBom.enabled,
          }),
        },
      );
      setExecutions((prev) => prev.map((e) => (e.traceId === traceId ? res.execution : e)));
      setMessage(
        decision === "approve"
          ? "Đã phê duyệt bàn giao thiết kế!"
          : "Đã từ chối bàn giao thiết kế.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi gửi quyết định phê duyệt.");
    } finally {
      setBusy("");
    }
  };

  // Export / Import JSON
  const handleExportJson = () => {
    const dataStr = JSON.stringify(buildDefinition(), null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atelier-workflow-v${active?.version ?? 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (file?: File) => {
    if (!file || !editable) return;
    try {
      const text = await file.text();
      const def = JSON.parse(text) as WorkflowDefinition;
      if (!Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
        throw new Error("File JSON thiếu mảng nodes hoặc edges hợp lệ.");
      }
      checkpoint();
      setNodes(def.nodes);
      setEdges(def.edges);
      setCanvasNotes(def.canvasNotes ?? []);
      setRoutes({});
      setDirty(true);
      setMessage("Đã import workflow thành công.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import JSON thất bại.");
    }
  };

  // Drag and Drop from palette
  const handleCanvasDrop = (event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/atelier-node") as WorkflowNodeKind;
    if (WORKFLOW_NODE_KINDS.includes(type) && flowRef.current) {
      const pos = flowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode(type, pos);
    }
  };

  // Auto-focus on active / running node when entering Execution Monitor
  useEffect(() => {
    if (workspaceMode === "execution" && latestExecution && flowRef.current) {
      const runningStep = latestExecution.steps.find(
        (s: LinearStepExecution) => s.status === "Đang chạy" || s.status === "Chờ duyệt" || s.status === "Lỗi",
      );
      if (runningStep) {
        const target = nodes.find((n) => n.id === runningStep.nodeId);
        if (target?.position) {
          flowRef.current.setCenter(target.position.x + 135, target.position.y + 66, {
            zoom: 0.9,
            duration: 350,
          });
        }
      }
    }
  }, [workspaceMode, latestExecution, nodes]);

  // Map step runtime execution by node ID
  const runtimeStepByNodeId = useMemo(() => {
    const map = new Map<string, LinearStepExecution>();
    if (!latestExecution) return map;
    for (const step of latestExecution.steps) {
      map.set(step.nodeId, step);
    }
    return map;
  }, [latestExecution]);

  // React Flow Nodes
  const rfNodes = useMemo(() => {
    const nodeItems: Node[] = nodes.map((node) => {
      const isSelected = node.id === selectedNodeId;
      const isSearched =
        canvasSearch.trim() &&
        (node.name.toLowerCase().includes(canvasSearch.toLowerCase()) ||
          node.id.toLowerCase().includes(canvasSearch.toLowerCase()));

      return {
        id: node.id,
        type: "premiumWorkflow",
        position: node.position ?? { x: 0, y: 0 },
        selected: isSelected || Boolean(isSearched),
        data: {
          item: node,
          errors: issues.filter((iss) => iss.nodeId === node.id && iss.severity === "error").length,
          owner: node.assignedAgentId
            ? agents.find((a) => a.agentId === node.assignedAgentId)?.name ?? node.requiredRole
            : node.requiredRole ?? "System",
          state: active?.status ?? "configured",
          runtimeStep: runtimeStepByNodeId.get(node.id) ?? null,
          direction: layoutDirection,
          isSelected,
        },
      };
    });

    const noteItems: Node[] = canvasNotes.map((note) => ({
      id: note.id,
      type: "canvasNote",
      position: note.position,
      selected: note.id === selectedNoteId,
      data: {
        note,
        onUpdate: patchCanvasNote,
        onDelete: deleteCanvasNote,
        editable,
      },
    }));

    return [...nodeItems, ...noteItems];
  }, [
    nodes,
    canvasNotes,
    selectedNodeId,
    selectedNoteId,
    canvasSearch,
    issues,
    agents,
    active?.status,
    runtimeStepByNodeId,
    layoutDirection,
    editable,
  ]);

  // React Flow Edges
  const rfEdges = useMemo<Edge<RoutedEdgeData>[]>(() => {
    return edges.map((edge) => {
      const isSelected = edge.id === selectedEdgeId;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "orthogonal",
        sourceHandle: "out",
        targetHandle: "in",
        selected: isSelected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: isSelected ? "var(--primary)" : "var(--muted-foreground)",
        },
        data: {
          points: routes[edge.id],
          outcome: edge.outcome,
          edge,
          hasNotes: Boolean(edge.notes),
        },
      };
    });
  }, [edges, routes, selectedEdgeId]);

  // Node position & drag changes
  const onNodesChange = (changes: NodeChange[]) => {
    if (!editable) return;
    const posChanges = changes.filter((c) => c.type === "position" || c.type === "remove");
    if (!posChanges.length) return;

    if (posChanges.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) {
      checkpoint();
    }

    const updatedFlowNodes = applyNodeChanges(posChanges, rfNodes);

    // Sync workflow nodes
    setNodes((prev) =>
      prev.map((n) => {
        const found = updatedFlowNodes.find((fn) => fn.id === n.id);
        return found ? { ...n, position: found.position } : n;
      }),
    );

    // Sync canvas notes
    setCanvasNotes((prev) =>
      prev.map((cn) => {
        const found = updatedFlowNodes.find((fn) => fn.id === cn.id);
        return found ? { ...cn, position: found.position } : cn;
      }),
    );

    setRoutes({});
    setDirty(true);
  };

  // Edge changes
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (!editable) return;
    if (changes.some((c) => c.type === "remove")) checkpoint();
    const remaining = applyEdgeChanges(changes, rfEdges);
    setEdges(
      remaining.map((e) => {
        const orig = edges.find((item) => item.id === e.id);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          outcome: orig?.outcome,
          condition: orig?.condition,
          notes: orig?.notes,
        };
      }),
    );
    setSelectedEdgeId(null);
    setRoutes({});
    setDirty(true);
  };

  // Connect new transition
  const onConnect = (connection: Connection) => {
    if (!editable || !connection.source || !connection.target) return;
    checkpoint();
    const newEdgeId = `edge_${crypto.randomUUID().slice(0, 8)}`;
    const newEdge: WorkflowEdge = {
      id: newEdgeId,
      source: connection.source,
      target: connection.target,
      outcome: "Chuyển tiếp",
      trigger: "automatic",
      priority: "medium",
    };
    setEdges((prev) => [...prev, newEdge]);
    setSelectedEdgeId(newEdgeId);
    setSelectedNodeId(null);
    setSelectedNoteId(null);
    setRightInspectorOpen(true);
    setRoutes({});
    setDirty(true);
  };

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Đang khởi động Atelier Visual Workflow Studio...
      </div>
    );
  }

  const projectOptions: ProjectOption[] = scenes.map((s) => ({
    id: s.project_id,
    name: s.name,
  }));

  const workflowItems: WorkflowItem[] = versions.map((v) => ({
    id: v.id,
    name: v.name,
    version: v.version,
    status: v.status,
    isActiveForProject: activeWorkflowByProject[selectedSceneId] === v.id,
    stepCount: v.definition?.nodes?.filter((n) => n.type !== "START" && n.type !== "END").length,
    updatedAt: v.updatedAt,
  }));

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-hidden">
      {/* 1. TOP TOOLBAR */}
      <StudioTopToolbar
        projectName={scenes.find((s) => s.project_id === selectedSceneId)?.name ?? selectedSceneId}
        projects={projectOptions}
        selectedProjectId={selectedSceneId}
        onSelectProject={(id) => setSelectedSceneId(id)}
        workflowName={active.name}
        onRenameWorkflow={(newName) => {
          checkpoint();
          setVersions((prev) =>
            prev.map((v) => (v.id === active.id ? { ...v, name: newName } : v)),
          );
        }}
        workflowVersion={active.version}
        workflowStatus={active.status}
        isActiveWorkflowForProject={isActiveWorkflowForProject}
        workspaceMode={workspaceMode}
        onSetWorkspaceMode={(mode) => {
          setWorkspaceMode(mode);
          if (mode === "execution") void refreshExecutions();
        }}
        onAutoLayout={runAutoLayout}
        layoutDirection={layoutDirection}
        onFitView={handleFitView}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onValidate={handleValidate}
        validationIssueCount={issues.length}
        onSaveDraft={handleSaveDraft}
        isDraft={isDraft}
        isDirty={dirty}
        isBusy={busy}
        onPublish={handlePublish}
        onActivate={() => handleActivateWorkflow(active.id)}
        onExecute={handleExecute}
        canExecute={!issues.some((i) => i.severity === "error")}
        onExportJson={handleExportJson}
        onImportJson={() => fileInputRef.current?.click()}
        onAddStickyNote={addStickyNote}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
        showMinimap={showMinimap}
        onBackToProjects={() => navigate(`/${prefix}/projects`)}
      />

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => void handleImportJson(e.target.files?.[0])}
      />

      {/* 2. FEEDBACK BANNER (Messages / Errors) */}
      {(message || error) && (
        <div
          className={`flex h-8 shrink-0 items-center justify-between px-4 text-xs font-semibold z-20 ${
            error
              ? "bg-destructive/15 text-destructive border-b border-destructive/20"
              : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-b border-emerald-500/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {error ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
            <span>{error || message}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setError("");
            }}
            className="hover:opacity-75"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 3. STUDIO MAIN BODY */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* LEFT SIDEBAR: Project Workflows & Node Library */}
        <WorkflowLibrarySidebar
          isOpen={leftSidebarOpen}
          onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
          workflows={workflowItems}
          activeWorkflowId={active.id}
          onSelectWorkflow={selectWorkflow}
          onCreateWorkflow={handleCreateNewDraft}
          onDuplicateWorkflow={handleCreateNewDraft}
          onActivateWorkflow={handleActivateWorkflow}
          editable={editable}
          onAddNode={addNode}
        />

        {/* Toggle Left Sidebar Button (floating) */}
        <button
          type="button"
          onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
          title={leftSidebarOpen ? "Thu gọn Sidebar" : "Mở rộng Sidebar"}
          className="absolute left-2 top-3 z-10 flex size-7 items-center justify-center rounded-md border border-border bg-card/90 shadow-sm text-muted-foreground hover:text-foreground"
        >
          {leftSidebarOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
        </button>

        {/* CENTER CANVAS: React Flow Studio */}
        <div
          className="flex-1 min-w-0 h-full relative bg-muted/15"
          onDrop={handleCanvasDrop}
          onDragOver={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!flowRef.current) return;
            const flowPos = flowRef.current.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            });
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              flowX: flowPos.x,
              flowY: flowPos.y,
            });
          }}
          onClick={() => setContextMenu(null)}
        >
          {/* Canvas Search Node Bar */}
          <div className="absolute left-12 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1 shadow-xs backdrop-blur">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm bước trong sơ đồ..."
              value={canvasSearch}
              onChange={(e) => setCanvasSearch(e.target.value)}
              className="h-6 w-36 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/70"
            />
            {canvasSearch && (
              <button
                type="button"
                onClick={() => setCanvasSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              if (node.type === "canvasNote") {
                setSelectedNoteId(node.id);
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              } else {
                setSelectedNodeId(node.id);
                setSelectedNoteId(null);
                setSelectedEdgeId(null);
              }
              setRightInspectorOpen(true);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              setSelectedNoteId(null);
              setRightInspectorOpen(true);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setSelectedNoteId(null);
              setContextMenu(null);
            }}
            nodesDraggable={editable}
            nodesConnectable={editable}
            edgesReconnectable={editable}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.16, maxZoom: 0.95 }}
            snapToGrid
            snapGrid={[16, 16]}
            minZoom={0.25}
            maxZoom={1.75}
            defaultEdgeOptions={{ type: "orthogonal" }}
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls position="bottom-left" showInteractive={false} />
            {showMinimap && (
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                className="!h-24 !w-36 !rounded-lg !border !border-border !bg-card/90 shadow-md backdrop-blur"
                nodeColor={(node) =>
                  node.id === selectedNodeId ? "var(--primary)" : "var(--muted-foreground)"
                }
              />
            )}
          </ReactFlow>

          {/* Canvas Right-Click Context Menu */}
          {contextMenu && editable && (
            <div
              className="absolute z-50 w-44 rounded-lg border border-border bg-card p-1 shadow-xl text-xs space-y-0.5"
              style={{ top: contextMenu.y - 60, left: contextMenu.x - 20 }}
            >
              <button
                type="button"
                onClick={() => {
                  addNode("AGENT_TASK", { x: contextMenu.flowX, y: contextMenu.flowY });
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-muted text-foreground"
              >
                <Plus className="size-3.5 text-primary" />
                <span>Thêm tác vụ Agent</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  addStickyNote({ x: contextMenu.flowX, y: contextMenu.flowY });
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-muted text-foreground"
              >
                <StickyNote className="size-3.5 text-amber-500" />
                <span>Thêm Sticky Note</span>
              </button>
              <div className="h-px bg-border/60 my-1" />
              <button
                type="button"
                onClick={() => {
                  void runAutoLayout(layoutDirection);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 hover:bg-muted text-foreground"
              >
                <LayoutGrid className="size-3.5 text-sky-500" />
                <span>Căn sơ đồ</span>
              </button>
            </div>
          )}

          {/* Toggle Right Inspector Button (floating) */}
          <button
            type="button"
            onClick={() => setRightInspectorOpen(!rightInspectorOpen)}
            title={rightInspectorOpen ? "Thu gọn Inspector" : "Mở rộng Inspector"}
            className="absolute right-2 top-3 z-10 flex size-7 items-center justify-center rounded-md border border-border bg-card/90 shadow-sm text-muted-foreground hover:text-foreground"
          >
            {rightInspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </button>
        </div>

        {/* RIGHT SIDEBAR: Studio Inspector */}
        <StudioInspector
          isOpen={rightInspectorOpen}
          onClose={() => setRightInspectorOpen(false)}
          selectedNode={selectedNode}
          onPatchNode={patchNode}
          onDeleteNode={deleteNode}
          selectedEdge={selectedEdge}
          onPatchEdge={patchEdge}
          onDeleteEdge={deleteEdge}
          selectedNote={selectedNote}
          onPatchNote={(patch) => selectedNote && patchCanvasNote(selectedNote.id, patch)}
          onDeleteNote={deleteCanvasNote}
          editable={editable}
          agents={agents}
          allNodes={nodes}
          runtimeStep={selectedNode ? runtimeStepByNodeId.get(selectedNode.id) ?? null : null}
          latestExecution={latestExecution}
          onApprovalDecision={handleApprovalDecision}
          optionalCostBom={optionalCostBom}
          onToggleCostBom={(enabled) => {
            setOptionalCostBom((prev) => ({ ...prev, enabled }));
            if (editable) setDirty(true);
          }}
          workflowMeta={{
            name: active.name,
            version: active.version,
            status: active.status,
            description: active.definition?.description,
          }}
        />
      </div>
    </div>
  );
}
