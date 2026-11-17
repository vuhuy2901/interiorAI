import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, MarkerType,
  MiniMap, Position, ReactFlow, type Connection, type Edge, type EdgeChange, type Node,
  type NodeChange, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle, ArchiveRestore, Bot, Braces, Check, CheckCircle2, ChevronsLeft,
  ChevronsRight, CirclePlay, Clock3, Download, Eye, GitBranch, LayoutTemplate,
  PanelLeftClose, PanelRightClose, Play, Redo2, RefreshCw, Save, Search, Send,
  ShieldCheck, Sparkles, Trash2, Undo2, Upload, X, XCircle,
} from "lucide-react";
import { useActiveCompanyPrefix, useNavigate } from "@/lib/router";
import { OrthogonalEdge } from "./workflow-graph/OrthogonalEdge";
import { layoutWorkflowGraph } from "./workflow-graph/layout";
import { TASK_LIFECYCLE_STATES, taskLifecycleGraph } from "./workflow-graph/lifecycle";
import {
  WORKFLOW_NODE_KINDS, type OptionalCostBomStep, type RoutedEdgeData, type StepSettings,
  type WorkflowDefinition, type WorkflowEdge, type WorkflowNode, type WorkflowNodeKind,
} from "./workflow-graph/types";

type Version = { id: string; version: number; status: string; updatedAt: string; definition: WorkflowDefinition };
type Agent = { agentId: string; name: string; role: string; status: string; available: boolean; roleKeys: string[]; capabilities: string[]; allowedTaskTypes: string[] };
type ValidationIssue = { code: string; severity: "error" | "warning"; message: string; nodeId?: string; edgeId?: string };
type Project = { id: string; name: string; workflow_status: string; workflow_run_id: string | null };
type SceneOption = { project_id: string; name: string; active_style_preset?: string };
type SimpleTaskState = "Chờ" | "Đang chạy" | "Chờ duyệt" | "Hoàn thành" | "Lỗi" | "Đã hủy";

type LinearStepExecution = {
  stepNumber: number;
  totalSteps: number;
  stepLabel: string;
  nodeId: string;
  name: string;
  agentName: string;
  status: SimpleTaskState;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  summary: string;
  error: string | null;
  logs: Array<{ at: string; level: string; message: string }>;
  output?: Record<string, unknown>;
};

type LinearExecutionTrace = {
  traceId: string;
  mode: "run" | "test_run";
  workflowDefinitionId: string;
  workflowVersion: number;
  workflowStatus: string;
  workflowName: string;
  sceneId: string;
  sceneName: string;
  status: SimpleTaskState;
  currentStepNumber: number;
  totalSteps: number;
  currentStepLabel: string;
  failedStep: { stepNumber: number; nodeId: string; name: string; error: string } | null;
  awaitingHumanApproval: boolean;
  humanApproval: {
    decision: "pending" | "approved" | "rejected";
    note?: string | null;
    decidedAt?: string | null;
    gateLabel: "NGƯỜI DUYỆT";
  };
  optionalCostBom: {
    enabled: boolean;
    status: SimpleTaskState | "Tắt";
    summary: string;
    totalVnd?: number | null;
    itemCount?: number | null;
    error?: string | null;
  };
  renderOutput?: {
    renderUrl: string;
    outPath: string;
    fileName?: string;
    fileSizeBytes?: number;
    materialHash?: string;
    cameraId?: string;
    verifiedAfterStep3: boolean;
  } | null;
  renderOrderVerified: boolean;
  step3CompletedBeforeRender: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: LinearStepExecution[];
};

type Snapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
type GraphNodeData = {
  item: WorkflowNode;
  errors: number;
  owner: string;
  state: string;
  runtimeStep?: LinearStepExecution | null;
};
type FlowNode = Node<GraphNodeData>;

const nodeMeta: Record<WorkflowNodeKind, { label: string; group: string; accent: string; icon: string }> = {
  START: { label: "Bắt đầu", group: "Luồng chính", accent: "border-emerald-500/50", icon: "bg-emerald-500" },
  END: { label: "Kiểm tra & Giao", group: "Luồng chính", accent: "border-amber-500/60", icon: "bg-amber-500" },
  AGENT_TASK: { label: "Bước xử lý", group: "Luồng chính", accent: "border-sky-500/50", icon: "bg-sky-500" },
  TOOL_EXECUTION: { label: "Công cụ", group: "Khác", accent: "border-indigo-500/50", icon: "bg-indigo-500" },
  RESEARCH: { label: "Nghiên cứu", group: "Khác", accent: "border-cyan-500/50", icon: "bg-cyan-500" },
  HUMAN_INPUT: { label: "Hỏi người dùng", group: "Phê duyệt", accent: "border-amber-500/50", icon: "bg-amber-500" },
  APPROVAL_GATE: { label: "Cổng NGƯỜI DUYỆT", group: "Phê duyệt", accent: "border-amber-500/50", icon: "bg-amber-500" },
  CONDITION: { label: "Điều kiện", group: "Logic", accent: "border-violet-500/50", icon: "bg-violet-500" },
  PARALLEL_BRANCH: { label: "Nhánh song song", group: "Logic", accent: "border-violet-500/50", icon: "bg-violet-500" },
  JOIN: { label: "Hợp nhánh", group: "Logic", accent: "border-violet-500/50", icon: "bg-violet-500" },
  VALIDATION: { label: "Validator", group: "Chất lượng", accent: "border-rose-500/50", icon: "bg-rose-500" },
  RETRY_RECOVERY: { label: "Thử lại", group: "Chất lượng", accent: "border-rose-500/50", icon: "bg-rose-500" },
  NOTIFICATION: { label: "Thông báo", group: "Khác", accent: "border-teal-500/50", icon: "bg-teal-500" },
  EXPORT: { label: "Xuất giao", group: "Khác", accent: "border-teal-500/50", icon: "bg-teal-500" },
};

// Retry and Notification were moved into each step's settings instead of standalone node types.
const PALETTE_NODE_KINDS = WORKFLOW_NODE_KINDS.filter(
  (kind) => !["RETRY_RECOVERY", "NOTIFICATION", "PARALLEL_BRANCH", "JOIN"].includes(kind),
);

const SIMPLE_STATE_TONE: Record<string, string> = {
  "Chờ": "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200",
  "Đang chạy": "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "Chờ duyệt": "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "Hoàn thành": "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "Lỗi": "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "Đã hủy": "border-zinc-400/50 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  "Tắt": "border-border bg-muted/40 text-muted-foreground",
};

const clone = <T,>(value: T): T => structuredClone(value);
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-55";
const buttonClass = "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

function SimpleStateBadge({ status }: { status: string }) {
  const tone = SIMPLE_STATE_TONE[status] ?? "border-border bg-muted/40 text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>;
}

function WorkflowCard({ data, selected }: NodeProps<FlowNode>) {
  const { item, errors, owner, state, runtimeStep } = data;

  if (item.lifecycleStateOnly) {
    const tone = SIMPLE_STATE_TONE[item.name] ?? "border-border bg-card text-foreground";
    return (
      <div className={`h-[104px] w-[244px] rounded-lg border bg-card shadow-sm ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md" : "border-border"}`}>
        <Handle id="in" type="target" position={Position.Left} className="!size-2.5 !border-2 !border-background !bg-muted-foreground/60" />
        <div className="flex h-8 items-center justify-between border-b border-border/60 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Trạng thái việc</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{item.name}</span>
        </div>
        <div className="px-3 py-2">
          <div className="truncate text-sm font-semibold">{item.name}</div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.description}</p>
        </div>
        <Handle id="out" type="source" position={Position.Right} className="!size-2.5 !border-2 !border-background !bg-muted-foreground/60" />
      </div>
    );
  }

  const appearance = nodeMeta[item.type];
  const stepBadge = item.stepLabel ?? (item.stepNumber ? `Bước ${item.stepNumber}/${item.totalSteps ?? 5}` : null);
  const displayState = runtimeStep ? runtimeStep.status : state;
  const runtimeRing = runtimeStep?.status === "Lỗi"
    ? "border-rose-500 ring-2 ring-rose-500/30"
    : runtimeStep?.status === "Đang chạy"
      ? "border-sky-500 ring-2 ring-sky-500/30"
      : runtimeStep?.status === "Chờ duyệt"
        ? "border-amber-500 ring-2 ring-amber-500/30"
        : runtimeStep?.status === "Hoàn thành"
          ? "border-emerald-500/70"
          : appearance.accent;

  return (
    <div className={`h-[104px] w-[244px] rounded-lg border bg-card shadow-sm transition-shadow ${runtimeRing} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md" : ""}`}>
      {item.type !== "START" ? <Handle id="in" type="target" position={Position.Left} className="!size-3 !border-2 !border-background !bg-primary" /> : null}
      <div className="flex h-8 items-center justify-between gap-1 border-b border-border/60 px-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span className={`size-2 rounded-sm ${appearance.icon}`} />
          {stepBadge ?? appearance.label}
        </span>
        {errors ? (
          <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">{errors}</span>
        ) : runtimeStep ? (
          <SimpleStateBadge status={runtimeStep.status} />
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Check className="size-3 text-emerald-600" />
            {displayState}
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-sm font-semibold leading-5">{item.name}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{owner}</span>
          {item.approval?.required ? (
            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-800 dark:text-amber-300">
              Cổng NGƯỜI DUYỆT
            </span>
          ) : item.includesValidator ? (
            <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
              Gồm Validator
            </span>
          ) : (
            <span className="max-w-24 truncate font-mono">{item.taskType ?? item.id}</span>
          )}
        </div>
      </div>
      {item.type !== "END" ? <Handle id="out" type="source" position={Position.Right} className="!size-3 !border-2 !border-background !bg-primary" /> : null}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowCard };
const edgeTypes = { orthogonal: OrthogonalEdge };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || body.detail || `API ${response.status}`);
  return body as T;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>{label}</span>{hint ? <span className="font-normal opacity-75">{hint}</span> : null}</span>{children}</label>;
}

function ToolButton({ title, disabled, active, onClick, children }: { title: string; disabled?: boolean; active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${buttonClass} ${active ? "border-primary bg-primary/10 text-primary" : ""}`}>{children}</button>;
}

const DEFAULT_COST_BOM: OptionalCostBomStep = {
  id: "cost",
  name: "Cost/BOM (Tùy chọn sau duyệt)",
  enabled: false,
  runsAfterApproval: true,
  requiredRole: "cost_agent",
  taskType: "COST_CALCULATION",
  capability: "cost.calculate",
  description: "Bước tùy chọn: chỉ chạy SAU khi cổng NGƯỜI DUYỆT xác nhận Bước 5.",
};

export function AtelierWorkflowBuilder() {
  const prefix = useActiveCompanyPrefix();
  const navigate = useNavigate();
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeId, setActiveId] = useState("");
  const [latestPublished, setLatestPublished] = useState<{ id: string; version: number; status: string; name: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState("proj_demo_4x5m");
  const [executions, setExecutions] = useState<LinearExecutionTrace[]>([]);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [optionalCostBom, setOptionalCostBom] = useState<OptionalCostBomStep>(DEFAULT_COST_BOM);
  const [routes, setRoutes] = useState<Record<string, { x: number; y: number }[]>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<"library" | "design" | "execution">("library");
  const [diagramMode, setDiagramMode] = useState<"pipeline" | "lifecycle">(() => new URLSearchParams(window.location.search).get("diagram") === "lifecycle" ? "lifecycle" : "pipeline");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [lifecycle, setLifecycle] = useState<{ nodes: WorkflowNode[]; edges: WorkflowEdge[]; routes: Record<string, { x: number; y: number }[]> } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const flowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = versions.find((item) => item.id === activeId) ?? null;
  const draftVersion = versions.find((item) => item.status === "draft") ?? null;
  const editable = active?.status === "draft" && diagramMode === "pipeline" && workspaceMode === "design";
  const selectedNode = nodes.find((item) => item.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((item) => item.id === selectedEdgeId) ?? null;
  const latestExecution = executions[0] ?? null;

  const calculateLayout = useCallback(async (inputNodes: WorkflowNode[], inputEdges: WorkflowEdge[]) => {
    const result = await layoutWorkflowGraph(inputNodes, inputEdges);
    return { nodes: result.nodes, routes: result.routes };
  }, []);

  const refreshExecutions = useCallback(async () => {
    try {
      const payload = await request<{
        latest_published: { id: string; version: number; status: string; name: string };
        scenes: SceneOption[];
        executions: LinearExecutionTrace[];
      }>("/api/atelier/workflow/executions");
      setLatestPublished(payload.latest_published);
      setScenes(payload.scenes);
      if (payload.scenes.length && !payload.scenes.some((s) => s.project_id === selectedSceneId)) {
        setSelectedSceneId(payload.scenes[0].project_id);
      }
      setExecutions(payload.executions);
    } catch {
      // Non-fatal during initial bootstrap
    }
  }, [selectedSceneId]);

  const load = useCallback(async (preferredId?: string) => {
    setBusy("load"); setError("");
    try {
      const [versionPayload, agentPayload, companyPayload, execPayload] = await Promise.all([
        request<{ versions: Version[] }>("/api/atelier/workflow/definitions"),
        request<{ agents: Agent[] }>("/api/atelier/agent-capabilities"),
        request<{ projects: Project[] }>("/api/atelier/company-workflow"),
        request<{
          latest_published: { id: string; version: number; status: string; name: string };
          scenes: SceneOption[];
          executions: LinearExecutionTrace[];
        }>("/api/atelier/workflow/executions"),
      ]);
      setVersions(versionPayload.versions);
      setAgents(agentPayload.agents);
      setProjects(companyPayload.projects);
      setLatestPublished(execPayload.latest_published);
      setScenes(execPayload.scenes);
      setExecutions(execPayload.executions);
      if (execPayload.scenes.length) {
        setSelectedSceneId((cur) => execPayload.scenes.some((s) => s.project_id === cur) ? cur : execPayload.scenes[0].project_id);
      }

      // Prefer newest draft (e.g. v6) so user immediately sees the simplified draft for review, else latest version.
      const next = (preferredId ? versionPayload.versions.find((item) => item.id === preferredId) : null)
        ?? versionPayload.versions.find((item) => item.status === "draft" && item.version >= 6)
        ?? versionPayload.versions[0];
      if (next) {
        const layout = await calculateLayout(clone(next.definition.nodes), clone(next.definition.edges));
        setActiveId(next.id);
        setNodes(layout.nodes);
        setEdges(clone(next.definition.edges));
        setRoutes(layout.routes);
        setOptionalCostBom(next.definition.optionalSteps?.costBomAfterApproval ?? DEFAULT_COST_BOM);
        setSelectedNodeId(next.definition.nodes[0]?.id ?? null);
        setSelectedEdgeId(null);
      }
      setLifecycle(taskLifecycleGraph());
      setDirty(false); setPast([]); setFuture([]); setIssues([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được workflow"); }
    finally { setBusy(""); }
  }, [calculateLayout]);

  useEffect(() => { void load(); }, [load]);

  const selectVersion = async (id: string) => {
    const next = versions.find((item) => item.id === id);
    if (!next) return;
    const layout = await calculateLayout(clone(next.definition.nodes), clone(next.definition.edges));
    setActiveId(id);
    setNodes(layout.nodes);
    setEdges(clone(next.definition.edges));
    setRoutes(layout.routes);
    setOptionalCostBom(next.definition.optionalSteps?.costBomAfterApproval ?? DEFAULT_COST_BOM);
    setSelectedNodeId(next.definition.nodes[0]?.id ?? null);
    setSelectedEdgeId(null); setIssues([]); setDirty(false); setPast([]); setFuture([]);
  };

  const checkpoint = useCallback(() => {
    setPast((items) => [...items.slice(-29), { nodes: clone(nodes), edges: clone(edges) }]);
    setFuture([]); setDirty(true);
  }, [nodes, edges]);

  const patchNode = (patch: Partial<WorkflowNode>) => {
    if (!selectedNode || !editable) return;
    checkpoint(); setNodes((items) => items.map((item) => item.id === selectedNode.id ? { ...item, ...patch } : item));
  };
  const patchStepSettings = (patch: Partial<StepSettings>) => {
    if (!selectedNode || !editable) return;
    const cur = selectedNode.stepSettings ?? {};
    const merged: StepSettings = {
      retry: patch.retry ?? cur.retry ?? selectedNode.retryPolicy ?? { maxAttempts: 2, backoffSeconds: 15 },
      logging: patch.logging ?? cur.logging ?? { enabled: true, level: "info" },
      notifications: patch.notifications ?? cur.notifications ?? { onStart: false, onComplete: true, onError: true, channel: "execution_tab" },
    };
    patchNode({
      stepSettings: merged,
      ...(patch.retry ? { retryPolicy: patch.retry } : {}),
    });
  };
  const patchEdge = (patch: Partial<WorkflowEdge>) => {
    if (!selectedEdge || !editable) return;
    checkpoint(); setEdges((items) => items.map((item) => item.id === selectedEdge.id ? { ...item, ...patch } : item)); setRoutes({});
  };
  const undo = () => { const state = past.at(-1); if (!state) return; setFuture((items) => [{ nodes: clone(nodes), edges: clone(edges) }, ...items]); setPast((items) => items.slice(0, -1)); setNodes(state.nodes); setEdges(state.edges); setRoutes({}); setDirty(true); };
  const redo = () => { const state = future[0]; if (!state) return; setPast((items) => [...items, { nodes: clone(nodes), edges: clone(edges) }]); setFuture((items) => items.slice(1)); setNodes(state.nodes); setEdges(state.edges); setRoutes({}); setDirty(true); };

  const runAutoLayout = async () => {
    if (diagramMode === "lifecycle") { flowRef.current?.fitView({ padding: 0.16, duration: 250 }); return; }
    setBusy("layout");
    try { const result = await calculateLayout(nodes, edges); if (editable) checkpoint(); setNodes(result.nodes); setRoutes(result.routes); if (editable) setDirty(true); requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.16, duration: 250 })); setMessage("Đã căn graph thẳng hàng theo dependency."); }
    finally { setBusy(""); }
  };

  const definition = (): WorkflowDefinition => ({
    ...active!.definition,
    schemaVersion: 2,
    version: active!.version,
    nodes,
    edges,
    optionalSteps: { costBomAfterApproval: optionalCostBom },
    stateMachine: TASK_LIFECYCLE_STATES.map((s) => s.name),
  });

  const save = async () => {
    if (!active || !editable) return;
    setBusy("save"); setError("");
    try {
      const payload = await request<{ workflow: Version; validation: { issues: ValidationIssue[] } }>(
        `/api/atelier/workflow/definitions/${active.id}`,
        { method: "PATCH", body: JSON.stringify({ definition: definition(), expected_updated_at: active.updatedAt }) },
      );
      setVersions((items) => items.map((item) => item.id === active.id ? payload.workflow : item));
      setIssues(payload.validation.issues);
      setDirty(false);
      setMessage(`Đã lưu Draft v${active.version}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lưu thất bại"); }
    finally { setBusy(""); }
  };

  const validate = async () => {
    if (!active) return;
    setBusy("validate"); setError("");
    try {
      const result = await request<{ valid: boolean; issues: ValidationIssue[] }>(
        `/api/atelier/workflow/definitions/${active.id}/validate`,
        { method: "POST", body: JSON.stringify({ definition: definition() }) },
      );
      setIssues(result.issues);
      setMessage(result.valid ? `Validate Draft v${active.version} thành công: 0 lỗi.` : `Phát hiện ${result.issues.length} vấn đề.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Validation thất bại"); }
    finally { setBusy(""); }
  };

  const runRealExecution = async (mode: "run" | "test_run") => {
    if (!active) return;
    setBusy(mode); setError(""); setMessage("");
    try {
      if (mode === "test_run" && editable && dirty) {
        await save();
      }
      const url = mode === "run"
        ? "/api/atelier/workflow/run"
        : `/api/atelier/workflow/definitions/${active.id}/test-run`;
      const payload = await request<{ execution: LinearExecutionTrace }>(url, {
        method: "POST",
        body: JSON.stringify({
          scene_id: selectedSceneId,
          optional_cost_bom_enabled: optionalCostBom.enabled,
        }),
      });
      setExecutions((prev) => [payload.execution, ...prev.filter((item) => item.traceId !== payload.execution.traceId)]);
      setWorkspaceMode("execution");
      if (payload.execution.status === "Lỗi" && payload.execution.failedStep) {
        setError(`Lỗi ở ${payload.execution.currentStepLabel} (${payload.execution.failedStep.name}): ${payload.execution.failedStep.error}`);
      } else if (payload.execution.awaitingHumanApproval) {
        setMessage(`Đã chạy đến ${payload.execution.currentStepLabel} và đang dừng tại cổng NGƯỜI DUYỆT.`);
      } else {
        setMessage(`Hoàn tất thực thi ở ${payload.execution.currentStepLabel}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Thực thi workflow thất bại");
    } finally {
      setBusy("");
    }
  };

  const handleApprovalDecision = async (traceId: string, decision: "approve" | "reject") => {
    setBusy(`decide_${decision}`); setError("");
    try {
      const payload = await request<{ execution: LinearExecutionTrace }>(
        `/api/atelier/workflow/executions/${encodeURIComponent(traceId)}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            note: approvalNote.trim() || undefined,
            optional_cost_bom_enabled: optionalCostBom.enabled,
          }),
        },
      );
      setExecutions((prev) => prev.map((item) => item.traceId === traceId ? payload.execution : item));
      setApprovalNote("");
      setMessage(
        decision === "approve"
          ? "NGƯỜI DUYỆT đã phê duyệt Bước 5/5 và mở xuất bàn giao."
          : "NGƯỜI DUYỆT đã hủy yêu cầu xuất bàn giao.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không gửi được quyết định duyệt");
    } finally {
      setBusy("");
    }
  };

  const newDraft = async (restore = false) => {
    if (!active) return;
    setBusy("draft"); setError("");
    try { const payload = await request<{ workflow: Version }>(`/api/atelier/workflow/definitions/${active.id}/${restore ? "restore" : "draft"}`, { method: "POST", body: "{}" }); await load(payload.workflow.id); setMessage(`${restore ? "Đã khôi phục" : "Đã tạo"} draft v${payload.workflow.version}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được draft"); }
    finally { setBusy(""); }
  };

  const addNode = (type: WorkflowNodeKind, position?: { x: number; y: number }) => {
    if (!editable) return;
    checkpoint();
    const id = `${type.toLowerCase()}_${crypto.randomUUID().slice(0, 8)}`;
    const task = ["AGENT_TASK", "RESEARCH", "VALIDATION"].includes(type);
    const item: WorkflowNode = {
      id, type, name: nodeMeta[type].label, position: position ?? { x: 160 + nodes.length * 20, y: 100 + nodes.length * 20 },
      ...(task ? { taskType: type, requiredRole: "specialist", agentSelector: { strategy: "CAPABILITY_MATCH", capability: "configure.capability" }, requiredOutputs: ["output"], completionCriteria: ["Output persisted and validated"], retryPolicy: { maxAttempts: 2, backoffSeconds: 30 } } : {}),
      ...(type === "APPROVAL_GATE" ? { approval: { required: true, approverRole: "authorized_approver" } } : {}),
      ...(type === "CONDITION" ? { conditionOutcomes: ["yes", "no"] } : {}),
      stepSettings: { retry: { maxAttempts: 2, backoffSeconds: 15 }, logging: { enabled: true, level: "info" }, notifications: { onStart: false, onComplete: true, onError: true } },
    };
    setNodes((items) => [...items, item]); setSelectedNodeId(id); setSelectedEdgeId(null); setRoutes({}); setDirty(true);
  };
  const removeNode = () => {
    if (!selectedNode || !editable || ["START", "END"].includes(selectedNode.type)) return;
    checkpoint(); setNodes((items) => items.filter((item) => item.id !== selectedNode.id)); setEdges((items) => items.filter((item) => item.source !== selectedNode.id && item.target !== selectedNode.id)); setSelectedNodeId(null); setRoutes({});
  };
  const removeEdge = () => { if (!selectedEdge || !editable) return; checkpoint(); setEdges((items) => items.filter((item) => item.id !== selectedEdge.id)); setSelectedEdgeId(null); setRoutes({}); };
  const exportJson = () => { const blob = new Blob([JSON.stringify(definition(), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `atelier-workflow-v${active?.version}.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importJson = async (file?: File) => { if (!file || !editable) return; try { const value = JSON.parse(await file.text()) as WorkflowDefinition; if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error("JSON thiếu nodes hoặc edges"); checkpoint(); setNodes(value.nodes); setEdges(value.edges); setRoutes({}); setDirty(true); setMessage("Đã import vào draft. Hãy Auto Layout, Validate và Save."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Import thất bại"); } };
  const drop = (event: DragEvent) => { event.preventDefault(); const type = event.dataTransfer.getData("application/atelier-node") as WorkflowNodeKind; if (WORKFLOW_NODE_KINDS.includes(type) && flowRef.current) addNode(type, flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })); };

  const visibleNodes = diagramMode === "pipeline" ? nodes : lifecycle?.nodes ?? [];
  const visibleEdges = diagramMode === "pipeline" ? edges : lifecycle?.edges ?? [];
  const visibleRoutes = diagramMode === "pipeline" ? routes : lifecycle?.routes ?? {};

  const runtimeStepByNodeId = useMemo(() => {
    const map = new Map<string, LinearStepExecution>();
    if (!latestExecution) return map;
    for (const s of latestExecution.steps) map.set(s.nodeId, s);
    return map;
  }, [latestExecution]);

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const rfNodes = useMemo<FlowNode[]>(() => visibleNodes.map((item) => ({
    id: item.id,
    type: "workflow",
    position: item.position ?? { x: 0, y: 0 },
    width: 244,
    height: 104,
    data: {
      item,
      errors: diagramMode === "pipeline" ? issues.filter((issue) => issue.nodeId === item.id && issue.severity === "error").length : 0,
      owner: item.assignedAgentId ? agentById.get(item.assignedAgentId)?.name ?? "Unknown agent" : item.requiredRole ?? "System",
      state: diagramMode === "lifecycle" ? "chỉ đọc" : active?.status ?? "configured",
      runtimeStep: diagramMode === "pipeline" && latestExecution && latestExecution.workflowDefinitionId === active?.id
        ? runtimeStepByNodeId.get(item.id) ?? null
        : null,
    },
  })), [visibleNodes, diagramMode, issues, agentById, active?.status, active?.id, latestExecution, runtimeStepByNodeId]);

  const rfEdges = useMemo<Edge<RoutedEdgeData>[]>(() => visibleEdges.map((item) => ({
    id: item.id, source: item.source, target: item.target, type: "orthogonal", sourceHandle: "out", targetHandle: "in",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    data: { points: visibleRoutes[item.id], outcome: item.outcome },
    style: { stroke: "var(--muted-foreground)" },
  })), [visibleEdges, visibleRoutes]);

  const nodeChanges = (changes: NodeChange<FlowNode>[]) => {
    if (!editable) return;
    const persistedChanges = changes.filter((item) => item.type === "remove" || item.type === "position");
    if (!persistedChanges.length) return;
    const next = applyNodeChanges(persistedChanges, rfNodes);
    if (persistedChanges.some((item) => item.type === "remove" || (item.type === "position" && item.dragging === false))) checkpoint();
    setNodes((items) => next.map((node) => ({ ...items.find((item) => item.id === node.id)!, position: node.position })));
    setRoutes({}); setDirty(true);
  };
  const edgeChanges = (changes: EdgeChange[]) => {
    if (!editable) return;
    if (changes.some((item) => item.type === "remove")) checkpoint();
    const remaining = applyEdgeChanges(changes, rfEdges);
    setEdges(remaining.map((item) => ({ id: item.id, source: item.source, target: item.target, outcome: edges.find((edge) => edge.id === item.id)?.outcome })));
    setSelectedEdgeId(null); setRoutes({}); setDirty(true);
  };
  const connect = (connection: Connection) => {
    if (!editable || !connection.source || !connection.target) return;
    checkpoint();
    const next = addEdge({ ...connection, id: `edge_${crypto.randomUUID()}` }, rfEdges);
    setEdges(next.map((item) => ({ id: item.id, source: item.source, target: item.target })));
    setRoutes({}); setDirty(true);
  };

  const groups = [...new Set(PALETTE_NODE_KINDS.map((kind) => nodeMeta[kind].group))];
  const filteredKinds = PALETTE_NODE_KINDS.filter((kind) => nodeMeta[kind].label.toLowerCase().includes(search.toLowerCase()) || kind.toLowerCase().includes(search.toLowerCase()));
  const eligibleAgents = selectedNode ? agents.filter((agent) => agent.available && (!selectedNode.requiredRole || agent.roleKeys.includes(selectedNode.requiredRole)) && (!selectedNode.taskType || agent.allowedTaskTypes.includes(selectedNode.taskType))) : [];
  const readonlyReason = diagramMode === "lifecycle"
    ? "Task Lifecycle chỉ để hiển thị 6 trạng thái của một việc (Chờ, Đang chạy, Chờ duyệt, Hoàn thành, Lỗi, Đã hủy). Cài đặt Thử lại / Ghi log / Thông báo nằm trong từng bước của Pipeline Workflow."
    : active?.status !== "draft"
      ? `v${active?.version} đã publish và bất biến. Bản nháp v6 đang ở chế độ chờ duyệt.`
      : null;

  if (!active) return <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">{error || "Đang nạp workflow authority..."}</div>;

  if (workspaceMode === "library") {
    const published = latestPublished ?? versions.find((item) => item.status === "published") ?? null;
    const draft = draftVersion;
    const stepCount = published?.definition.nodes.filter((node) => !node.lifecycleStateOnly && node.type !== "START" && node.type !== "END").length ?? 0;
    const workflowName = published?.definition.name ?? active.definition.name;
    const workflowDescription = published?.definition.description ?? "Workflow điều phối AI của công ty.";
    return (
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <header className="shrink-0 border-b border-border bg-card px-5 py-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="mr-auto"><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Workflow Manager</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Thư viện workflow</h1><p className="mt-1 text-sm text-muted-foreground">Chọn workflow để xem chi tiết hoặc mở Designer khi cần tinh chỉnh.</p></div>
            <button type="button" className={buttonClass} onClick={() => void load()} disabled={busy === "load"}><RefreshCw className="size-4" /> Làm mới</button>
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground" onClick={() => void newDraft(true)}><Sparkles className="size-4" /> Tạo workflow</button>
          </div>
          <nav className="mt-4 flex gap-1" aria-label="Workflow Manager sections">
            <button className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">Workflow Library</button>
            <button className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => { setWorkspaceMode("execution"); void refreshExecutions(); }}>Đang thực thi</button>
            <button className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => { setWorkspaceMode("execution"); void refreshExecutions(); }}>Lịch sử</button>
          </nav>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-5 md:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input className={`${fieldClass} pl-9`} placeholder="Tìm workflow…" /></div><select className={fieldClass + " w-auto"}><option>Tất cả trạng thái</option><option>Published</option><option>Draft</option><option>Archived</option></select></div>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Danh sách workflow">
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50">
                <div className="flex items-start justify-between gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><GitBranch className="size-5" /></div><SimpleStateBadge status={published ? "Published" : "Draft"} /></div>
                <h2 className="mt-4 text-base font-semibold">{workflowName}</h2><p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{workflowDescription}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-xs"><span><b className="block text-foreground">v{published?.version ?? active.version}</b><span className="text-muted-foreground">Published</span></span><span><b className="block text-foreground">{stepCount}</b><span className="text-muted-foreground">Bước</span></span><span><b className="block text-foreground">{projects.length}</b><span className="text-muted-foreground">Dự án</span></span></div>
                <div className="mt-4 flex gap-2"><button type="button" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground" onClick={() => setWorkspaceMode("design")}><Eye className="size-4" /> Xem chi tiết</button><button type="button" className={buttonClass} onClick={() => setWorkspaceMode("design")}><LayoutTemplate className="size-4" /> Tinh chỉnh</button></div>
                {draft ? <p className="mt-3 text-[11px] text-amber-700">Có bản nháp v{draft.version} chưa publish.</p> : null}
              </article>
            </section>
            <section className="mt-6 rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Dự án đang theo dõi</h2><p className="mt-1 text-sm text-muted-foreground">Mở project để xem execution và trạng thái các bước.</p></div><span className="text-xs text-muted-foreground">{projects.length} dự án</span></div><div className="mt-4 divide-y divide-border">{projects.slice(0, 8).map((project) => <button key={project.id} type="button" className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/30" onClick={() => navigate(`/${prefix}/projects/${project.id}/workflow`)}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="font-mono text-[11px] text-muted-foreground">{project.id}</span></span><SimpleStateBadge status={project.workflow_status} /><ChevronRight className="size-4 text-muted-foreground" /></button>)}</div></section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-2">
          <div className="mr-auto min-w-56">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4 text-primary" />
              {active.definition.name}
              <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {active.status === "draft" ? `Draft v${active.version} · Chờ duyệt` : `v${active.version} · Published`}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {latestPublished
                ? `Nút Chạy luôn dùng bản publish mới nhất (v${latestPublished.version}).`
                : "Pipeline 5 bước thẳng · Không nhánh song song"}
            </div>
          </div>

          <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-xs ${workspaceMode === "design" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              onClick={() => setWorkspaceMode("design")}
            >
              Design
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-xs ${workspaceMode === "execution" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              onClick={() => { setWorkspaceMode("execution"); void refreshExecutions(); }}
            >
              Execution
            </button>
          </div>

          {diagramMode === "pipeline" ? (
            <>
              <select
                aria-label="Chọn scene để chạy"
                className="h-9 max-w-60 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:border-primary"
                value={selectedSceneId}
                onChange={(event) => setSelectedSceneId(event.target.value)}
              >
                {(scenes.length ? scenes : [{ project_id: "proj_demo_4x5m", name: "Căn hộ Studio Phòng Khách 4×5m" }]).map((scene) => (
                  <option key={scene.project_id} value={scene.project_id}>
                    Scene: {scene.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void runRealExecution("run")}
                disabled={!!busy}
                title={latestPublished ? `Chạy workflow đã publish mới nhất (v${latestPublished.version})` : "Chạy workflow đã publish mới nhất"}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-40"
              >
                <Play className="size-3.5" />
                {busy === "run" ? "Đang chạy..." : "Chạy"}
              </button>
            </>
          ) : null}

          {workspaceMode === "design" && diagramMode === "pipeline" ? (
            <>
              {latestPublished && draftVersion ? (
                <ToolButton
                  title={active.id === draftVersion.id ? `Xem bản v${latestPublished.version} (Published, bất biến)` : `Quay lại Draft v${draftVersion.version}`}
                  onClick={() => void selectVersion(active.id === draftVersion.id ? latestPublished.id : draftVersion.id)}
                >
                  <Eye className="size-4" />
                  {active.id === draftVersion.id ? `Xem v${latestPublished.version}` : `Mở Draft v${draftVersion.version}`}
                </ToolButton>
              ) : null}
              {!editable && !draftVersion ? (
                <ToolButton title="Tạo bản nháp mới" onClick={() => void newDraft()}>Tạo Draft</ToolButton>
              ) : null}
              {editable ? (
                <>
                  <ToolButton title="Undo" onClick={undo} disabled={!past.length}><Undo2 className="size-4" /></ToolButton>
                  <ToolButton title="Redo" onClick={redo} disabled={!future.length}><Redo2 className="size-4" /></ToolButton>
                  <ToolButton title="Validate" onClick={() => void validate()} disabled={!!busy}><ShieldCheck className="size-4" />Validate</ToolButton>
                  <ToolButton title="Chạy thử từ đầu đến cuối trên scene thật (không publish)" onClick={() => void runRealExecution("test_run")} disabled={!!busy}>
                    <CirclePlay className="size-4" />
                    {busy === "test_run" ? "Đang Test Run..." : "Test Run"}
                  </ToolButton>
                  <ToolButton title="Lưu Draft" onClick={() => void save()} disabled={!dirty || !!busy}><Save className="size-4" />Lưu</ToolButton>
                </>
              ) : null}
            </>
          ) : null}

          {diagramMode === "pipeline" || workspaceMode === "design" ? (
            <ToolButton title="Căn sơ đồ" onClick={() => void runAutoLayout()} disabled={!!busy}>
              <LayoutTemplate className="size-4" />
              Căn sơ đồ
            </ToolButton>
          ) : null}
        </div>

        <div className="flex min-h-10 flex-wrap items-center gap-2 border-t border-border/70 px-4 py-1.5">
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${diagramMode === "pipeline" ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => { setDiagramMode("pipeline"); setSelectedEdgeId(null); }}
          >
            Pipeline Workflow
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${diagramMode === "lifecycle" ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => { setDiagramMode("lifecycle"); setSelectedNodeId(null); setSelectedEdgeId(null); setLeftOpen(false); requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.16 })); }}
          >
            Task Lifecycle
          </button>

          {diagramMode === "pipeline" && workspaceMode === "design" ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={leftOpen ? "Đóng thư viện bước" : "Mở thư viện bước"} onClick={() => setLeftOpen((value) => !value)}>
                {leftOpen ? <PanelLeftClose className="size-4" /> : <ChevronsRight className="size-4" />}
              </button>
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={rightOpen ? "Đóng cài đặt bước" : "Mở cài đặt bước"} onClick={() => setRightOpen((value) => !value)}>
                {rightOpen ? <PanelRightClose className="size-4" /> : <ChevronsLeft className="size-4" />}
              </button>

              <label className="ml-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={optionalCostBom.enabled}
                  disabled={!editable}
                  onChange={(e) => {
                    setOptionalCostBom((prev) => ({ ...prev, enabled: e.target.checked }));
                    if (editable) setDirty(true);
                  }}
                />
                <span>Bước tùy chọn sau duyệt: Cost/BOM</span>
              </label>
            </>
          ) : null}

          <span className="ml-auto text-[11px] text-muted-foreground">
            {diagramMode === "lifecycle"
              ? `${visibleNodes.length} trạng thái (chỉ hiển thị)`
              : `${visibleNodes.length} bước · ${visibleEdges.length} chuyển tiếp`}
          </span>
        </div>
      </header>

      {(message || error || readonlyReason) ? (
        <div className={`flex min-h-9 shrink-0 items-center gap-2 border-b px-4 py-2 text-xs ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : readonlyReason ? "bg-muted/60 text-muted-foreground" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
          {error ? <AlertTriangle className="size-4 shrink-0" /> : readonlyReason ? <ShieldCheck className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}
          <span className="flex-1">{error || readonlyReason || message}</span>
          {(error || message) ? <button onClick={() => { setError(""); setMessage(""); }}><X className="size-4" /></button> : null}
        </div>
      ) : null}

      {workspaceMode === "execution" ? (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-semibold">Theo dõi thực thi (Execution)</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hiển thị lượt chạy đang ở bước mấy (Bước n/5), log từng bước và chỉ rõ lỗi ở đâu nếu thất bại.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ToolButton title="Làm mới danh sách" onClick={() => void refreshExecutions()} disabled={!!busy}>
                  <RefreshCw className={busy === "load" ? "size-4 animate-spin" : "size-4"} />
                  Làm mới
                </ToolButton>
                {active.status === "draft" ? (
                  <ToolButton title="Test Run Draft v6 trên scene đang chọn" onClick={() => void runRealExecution("test_run")} disabled={!!busy}>
                    <CirclePlay className="size-4" />
                    Test Run v{active.version}
                  </ToolButton>
                ) : null}
              </div>
            </div>

            {executions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                Chưa có lượt chạy nào trong phiên này. Nhấn <strong>Chạy</strong> (bản publish mới nhất) hoặc <strong>Test Run</strong> (bản nháp v{active.version}) để xem tiến trình Bước 1/5 → Bước 5/5.
              </div>
            ) : (
              <div className="space-y-6">
                {executions.map((exec) => (
                  <section key={exec.traceId} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                            {exec.currentStepLabel}
                          </span>
                          <SimpleStateBadge status={exec.status} />
                          <span className="text-sm font-semibold">{exec.sceneName}</span>
                          <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {exec.mode === "test_run" ? `Test Run · Draft v${exec.workflowVersion}` : `Chạy chính · Published v${exec.workflowVersion}`}
                          </span>
                        </div>
                        <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                          Trace: {exec.traceId} · Bắt đầu: {new Date(exec.startedAt).toLocaleString("vi-VN")}
                          {exec.renderOrderVerified ? " · Đã kiểm tra: Render chạy SAU Bước 3" : ""}
                        </div>
                      </div>
                    </div>

                    {exec.failedStep ? (
                      <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3.5 text-sm text-rose-800 dark:text-rose-200">
                        <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" />
                        <div>
                          <div className="font-semibold">
                            Lỗi tại Bước {exec.failedStep.stepNumber}/5 — {exec.failedStep.name}
                          </div>
                          <div className="mt-0.5 text-xs">{exec.failedStep.error}</div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      {exec.steps.map((step) => (
                        <div
                          key={step.nodeId}
                          className={`flex flex-col rounded-lg border p-3 ${
                            step.status === "Lỗi"
                              ? "border-rose-500/50 bg-rose-500/5"
                              : step.status === "Chờ duyệt"
                                ? "border-amber-500/50 bg-amber-500/5"
                                : step.status === "Hoàn thành"
                                  ? "border-emerald-500/40 bg-emerald-500/5"
                                  : "border-border bg-muted/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-primary">{step.stepLabel}</span>
                            <SimpleStateBadge status={step.status} />
                          </div>
                          <div className="mt-1.5 text-xs font-semibold">{step.name}</div>
                          <div className="text-[10px] text-muted-foreground">{step.agentName}</div>
                          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{step.summary}</p>
                          {step.error ? (
                            <div className="mt-2 rounded bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                              {step.error}
                            </div>
                          ) : null}
                          {step.durationMs !== null ? (
                            <div className="mt-auto pt-2 text-[10px] text-muted-foreground">
                              Thời gian: {Math.round(step.durationMs)} ms
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {exec.renderOutput?.renderUrl ? (
                        <div className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="size-3.5 text-primary" />
                              Ảnh Render Blender Cycles (Bước 4/5)
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              MAT_HASH={exec.renderOutput.materialHash}
                            </span>
                          </div>
                          <img
                            src={exec.renderOutput.renderUrl}
                            alt={`Render ${exec.sceneName}`}
                            className="max-h-64 w-full rounded-md border border-border object-cover"
                          />
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            File: {exec.renderOutput.fileName} ({Math.round((exec.renderOutput.fileSizeBytes ?? 0) / 1024)} KB)
                            {exec.renderOutput.verifiedAfterStep3 ? " · Đã xác nhận dùng vật liệu từ Bước 3" : ""}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/20 p-3">
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                            <span>Cổng NGƯỜI DUYỆT (Bước 5/5) &amp; Bước tùy chọn Cost/BOM</span>
                            <SimpleStateBadge status={exec.optionalCostBom.status} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {exec.awaitingHumanApproval
                              ? "QA đã kiểm tra xong. Agent không thể tự đóng — cần NGƯỜI DUYỆT xác nhận trước khi xuất giao."
                              : exec.humanApproval.decision === "approved"
                                ? `Đã phê duyệt lúc ${exec.humanApproval.decidedAt ? new Date(exec.humanApproval.decidedAt).toLocaleString("vi-VN") : ""}.`
                                : exec.humanApproval.decision === "rejected"
                                  ? `Đã từ chối: ${exec.humanApproval.note ?? ""}`
                                  : "Đang chờ bước trước hoàn tất."}
                          </p>
                          <div className="mt-3 rounded-md border border-border bg-background/70 p-2.5 text-xs">
                            <div className="font-medium">Cost/BOM sau duyệt: {exec.optionalCostBom.enabled ? "Đang BẬT" : "Đang TẮT"}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">{exec.optionalCostBom.summary}</div>
                          </div>
                        </div>

                        {exec.awaitingHumanApproval ? (
                          <div className="mt-4 space-y-2 border-t border-border pt-3">
                            <input
                              className={fieldClass}
                              placeholder="Ghi chú duyệt (tùy chọn)..."
                              value={approvalNote}
                              onChange={(e) => setApprovalNote(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void handleApprovalDecision(exec.traceId, "approve")}
                                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                              >
                                <CheckCircle2 className="size-4" />
                                Phê duyệt &amp; Giao
                              </button>
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void handleApprovalDecision(exec.traceId, "reject")}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-300"
                              >
                                <XCircle className="size-4" />
                                Từ chối / Hủy
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}

            <section className="border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-muted-foreground">Lịch sử Project Monitor cũ (v1–v5 được bảo toàn)</h3>
              <div className="mt-3 grid gap-2.5">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-5 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-muted/30"
                    onClick={() => navigate(`/${prefix}/projects/${project.id}/workflow`)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{project.name}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        Node run: {project.workflow_run_id || "not provisioned"}
                      </span>
                    </span>
                    <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">
                      {project.workflow_status}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <main className={`grid min-h-0 flex-1 ${leftOpen && rightOpen && diagramMode === "pipeline" ? "grid-cols-[232px_minmax(420px,1fr)_340px]" : leftOpen && diagramMode === "pipeline" ? "grid-cols-[232px_minmax(420px,1fr)]" : rightOpen ? "grid-cols-[minmax(420px,1fr)_340px]" : "grid-cols-1"}`}>
          {leftOpen && diagramMode === "pipeline" ? (
            <aside className="overflow-auto border-r border-border bg-card p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold">Thư viện bước</span>
                <span className="text-[10px] text-muted-foreground">kéo hoặc bấm</span>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <input className={`${fieldClass} pl-8`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm loại bước" />
              </div>
              {groups.map((group) => {
                const groupKinds = filteredKinds.filter((kind) => nodeMeta[kind].group === group);
                return groupKinds.length ? (
                  <section key={group} className="mb-4">
                    <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group}</h3>
                    {groupKinds.map((kind) => (
                      <button
                        key={kind}
                        draggable={editable}
                        onDragStart={(event) => event.dataTransfer.setData("application/atelier-node", kind)}
                        onClick={() => addNode(kind)}
                        disabled={!editable}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className={`size-2.5 rounded-sm ${nodeMeta[kind].icon}`} />
                        {nodeMeta[kind].label}
                      </button>
                    ))}
                  </section>
                ) : null;
              })}
              <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] leading-4 text-muted-foreground">
                Thử lại, Ghi log và Thông báo được cấu hình trực tiếp trong <strong>Cài đặt bước</strong> (panel bên phải).
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
                <button onClick={exportJson} className={buttonClass}><Download className="size-3.5" />Export</button>
                <button disabled={!editable} onClick={() => fileRef.current?.click()} className={buttonClass}><Upload className="size-3.5" />Import</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(event) => void importJson(event.target.files?.[0])} />
              <button onClick={() => void newDraft(true)} className={`${buttonClass} mt-2 w-full`}><ArchiveRestore className="size-3.5" />Nhân bản version mới</button>
            </aside>
          ) : null}

          <section className="relative min-h-0 bg-muted/20" onDrop={drop} onDragOver={(event) => event.preventDefault()}>
            <ReactFlow<FlowNode, Edge<RoutedEdgeData>>
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => { flowRef.current = instance; }}
              onNodesChange={nodeChanges}
              onEdgesChange={edgeChanges}
              onConnect={connect}
              onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); setRightOpen(true); }}
              onEdgeClick={(_, edge) => { if (diagramMode === "pipeline") { setSelectedEdgeId(edge.id); setSelectedNodeId(null); setRightOpen(true); } }}
              onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
              nodesDraggable={editable}
              nodesConnectable={editable}
              edgesReconnectable={editable}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.14, maxZoom: 0.92 }}
              snapToGrid
              snapGrid={[16, 16]}
              deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
              minZoom={0.2}
              maxZoom={1.8}
            >
              <Background gap={24} size={1} color="var(--border)" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap position="bottom-right" pannable zoomable className="!h-24 !w-36 !rounded-md !border !border-border !bg-card/95" nodeColor={(node) => node.id === selectedNodeId ? "var(--primary)" : "var(--muted-foreground)"} maskColor="color-mix(in srgb, var(--background) 72%, transparent)" />
            </ReactFlow>

            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
              <span className="font-semibold">
                {diagramMode === "pipeline" ? `v${active.version}` : "Task Lifecycle"}
              </span>
              <span className="text-muted-foreground">
                {diagramMode === "pipeline" ? (active.status === "draft" ? "Draft (chờ duyệt)" : active.status) : "chỉ hiển thị 6 trạng thái"}
              </span>
              {dirty && diagramMode === "pipeline" ? <span className="font-medium text-amber-600">Chưa lưu</span> : null}
            </div>

            {issues.length && diagramMode === "pipeline" ? (
              <div className="absolute bottom-4 left-1/2 max-h-40 w-[min(660px,76%)] -translate-x-1/2 overflow-auto rounded-lg border border-destructive/30 bg-card/95 p-3 shadow-lg backdrop-blur">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><AlertTriangle className="size-4 text-destructive" />Validation · {issues.length}</div>
                {issues.map((issue, index) => (
                  <button key={`${issue.code}-${index}`} className="block w-full truncate rounded px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => issue.nodeId && setSelectedNodeId(issue.nodeId)}>
                    {issue.nodeId ? `${issue.nodeId}: ` : ""}{issue.message}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {rightOpen ? (
            <aside className="overflow-auto border-l border-border bg-card p-4">
              {diagramMode === "lifecycle" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Braces className="size-4 text-primary" />
                    Task Lifecycle (Chỉ hiển thị)
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Màn hình này chỉ mô tả 6 trạng thái của một công việc. Không dùng để chọn chạy.
                  </p>
                  <div className="space-y-2 pt-2">
                    {TASK_LIFECYCLE_STATES.map((st) => (
                      <div key={st.key} className="rounded-lg border border-border bg-muted/20 p-2.5">
                        <SimpleStateBadge status={st.name} />
                        <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{st.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
                    Các chức năng <strong>Thử lại</strong>, <strong>Ghi log</strong> và <strong>Thông báo</strong> đã được chuyển vào mục <em>Cài đặt bước</em> của từng ô trong <strong>Pipeline Workflow</strong>.
                  </div>
                </div>
              ) : selectedEdge ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Chuyển bước</div>
                      <h2 className="mt-1 text-sm font-semibold">{selectedEdge.source} → {selectedEdge.target}</h2>
                    </div>
                    <button onClick={removeEdge} disabled={!editable} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4" /></button>
                  </div>
                  <Field label="Nhãn chuyển bước"><input disabled={!editable} className={fieldClass} value={selectedEdge.outcome ?? ""} onChange={(event) => patchEdge({ outcome: event.target.value || undefined })} /></Field>
                  <Field label="Từ bước"><select disabled={!editable} className={fieldClass} value={selectedEdge.source} onChange={(event) => patchEdge({ source: event.target.value })}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></Field>
                  <Field label="Đến bước"><select disabled={!editable} className={fieldClass} value={selectedEdge.target} onChange={(event) => patchEdge({ target: event.target.value })}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></Field>
                </div>
              ) : selectedNode ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        {selectedNode.stepLabel ?? `Bước ${selectedNode.stepNumber ?? "?"}/5`} · {selectedNode.type}
                      </div>
                      <h2 className="mt-1 text-sm font-semibold">{selectedNode.name}</h2>
                      {selectedNode.sourceNodes?.length ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">Gộp từ: {selectedNode.sourceNodes.join(" + ")}</div>
                      ) : null}
                    </div>
                    <button onClick={removeNode} disabled={!editable || ["START", "END"].includes(selectedNode.type)} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4" /></button>
                  </div>

                  <Field label="Tên bước"><input disabled={!editable} className={fieldClass} value={selectedNode.name} onChange={(event) => patchNode({ name: event.target.value })} /></Field>
                  <Field label="Mô tả"><textarea disabled={!editable} rows={3} className={`${fieldClass} resize-y leading-5`} value={selectedNode.description ?? ""} onChange={(event) => patchNode({ description: event.target.value })} /></Field>

                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="text-xs font-semibold">Cài đặt bước (Thử lại · Ghi log · Thông báo)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Thử lại tối đa">
                        <input
                          disabled={!editable}
                          type="number"
                          min={1}
                          max={10}
                          className={fieldClass}
                          value={selectedNode.stepSettings?.retry?.maxAttempts ?? selectedNode.retryPolicy?.maxAttempts ?? 1}
                          onChange={(event) => patchStepSettings({
                            retry: {
                              maxAttempts: Math.max(1, Math.min(10, Number(event.target.value) || 1)),
                              backoffSeconds: selectedNode.stepSettings?.retry?.backoffSeconds ?? selectedNode.retryPolicy?.backoffSeconds ?? 15,
                            },
                          })}
                        />
                      </Field>
                      <Field label="Chờ giữa lần (s)">
                        <input
                          disabled={!editable}
                          type="number"
                          min={0}
                          className={fieldClass}
                          value={selectedNode.stepSettings?.retry?.backoffSeconds ?? selectedNode.retryPolicy?.backoffSeconds ?? 0}
                          onChange={(event) => patchStepSettings({
                            retry: {
                              maxAttempts: selectedNode.stepSettings?.retry?.maxAttempts ?? selectedNode.retryPolicy?.maxAttempts ?? 1,
                              backoffSeconds: Math.max(0, Number(event.target.value) || 0),
                            },
                          })}
                        />
                      </Field>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={selectedNode.stepSettings?.logging?.enabled !== false}
                          onChange={(e) => patchStepSettings({
                            logging: { enabled: e.target.checked, level: selectedNode.stepSettings?.logging?.level ?? "info" },
                          })}
                        />
                        <span>Ghi log thực thi cho bước này</span>
                      </label>
                      <Field label="Mức ghi log">
                        <select
                          disabled={!editable || selectedNode.stepSettings?.logging?.enabled === false}
                          className={fieldClass}
                          value={selectedNode.stepSettings?.logging?.level ?? "info"}
                          onChange={(e) => patchStepSettings({
                            logging: { enabled: true, level: e.target.value as "info" | "debug" | "error" },
                          })}
                        >
                          <option value="info">Chuẩn (info)</option>
                          <option value="debug">Chi tiết (debug)</option>
                          <option value="error">Chỉ khi lỗi (error)</option>
                        </select>
                      </Field>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1.5 text-xs">
                      <div className="font-medium text-muted-foreground">Thông báo trạng thái</div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={Boolean(selectedNode.stepSettings?.notifications?.onStart)}
                          onChange={(e) => patchStepSettings({ notifications: { ...(selectedNode.stepSettings?.notifications ?? {}), onStart: e.target.checked } })}
                        />
                        <span>Thông báo khi bắt đầu bước</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={selectedNode.stepSettings?.notifications?.onComplete !== false}
                          onChange={(e) => patchStepSettings({ notifications: { ...(selectedNode.stepSettings?.notifications ?? {}), onComplete: e.target.checked } })}
                        />
                        <span>Thông báo khi hoàn thành</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={selectedNode.stepSettings?.notifications?.onError !== false}
                          onChange={(e) => patchStepSettings({ notifications: { ...(selectedNode.stepSettings?.notifications ?? {}), onError: e.target.checked } })}
                        />
                        <span>Thông báo ngay khi gặp lỗi</span>
                      </label>
                    </div>
                  </div>

                  {["AGENT_TASK", "RESEARCH", "VALIDATION"].includes(selectedNode.type) ? (
                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="text-xs font-semibold">Agent phụ trách</div>
                      <Field label="Agent được gán" hint={`${eligibleAgents.length} khả dụng`}>
                        <select disabled={!editable} className={fieldClass} value={selectedNode.assignedAgentId ?? ""} onChange={(event) => patchNode({ assignedAgentId: event.target.value || null })}>
                          <option value="">Tự chọn theo năng lực ({selectedNode.requiredRole})</option>
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId} disabled={!eligibleAgents.some((item) => item.agentId === agent.agentId)}>
                              {agent.name}{agent.available ? "" : " · unavailable"}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : null}

                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="text-xs font-semibold">Đầu vào / Đầu ra &amp; Tiêu chí</div>
                    <Field label="Đầu vào bắt buộc"><textarea disabled={!editable} rows={2} className={fieldClass} value={(selectedNode.requiredInputs ?? []).join("\n")} onChange={(event) => patchNode({ requiredInputs: lines(event.target.value) })} /></Field>
                    <Field label="Đầu ra bắt buộc"><textarea disabled={!editable} rows={2} className={fieldClass} value={(selectedNode.requiredOutputs ?? []).join("\n")} onChange={(event) => patchNode({ requiredOutputs: lines(event.target.value) })} /></Field>
                    <Field label="Tiêu chí hoàn thành"><textarea disabled={!editable} rows={3} className={fieldClass} value={(selectedNode.completionCriteria ?? []).join("\n")} onChange={(event) => patchNode({ completionCriteria: lines(event.target.value) })} /></Field>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <Bot className="mb-3 size-8 opacity-40" />
                  <p className="text-sm font-medium">Chọn một bước trên sơ đồ</p>
                  <p className="mt-1 max-w-52 text-xs leading-5">Xem và chỉnh sửa Thử lại, Ghi log, Thông báo và thông tin agent phụ trách.</p>
                </div>
              )}
            </aside>
          ) : null}
        </main>
      )}
    </div>
  );
}
