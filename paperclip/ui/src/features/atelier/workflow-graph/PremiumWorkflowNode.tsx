import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  FileCode,
  FileSpreadsheet,
  FileText,
  Flame,
  GitBranch,
  GitMerge,
  HelpCircle,
  Layers,
  Palette,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import type { WorkflowNode, WorkflowNodeKind } from "./types";

export type SimpleTaskState = "Chờ" | "Đang chạy" | "Chờ duyệt" | "Hoàn thành" | "Lỗi" | "Đã hủy" | "Blocked" | "Ready";

export type LinearStepExecution = {
  stepNumber: number;
  totalSteps: number;
  stepLabel: string;
  nodeId: string;
  name: string;
  agentName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  summary: string;
  error: string | null;
  logs: Array<{ at: string; level: string; message: string }>;
  output?: Record<string, unknown>;
};

export type PremiumNodeData = {
  item: WorkflowNode;
  errors?: number;
  owner?: string;
  agentAvatar?: string;
  state?: string;
  runtimeStep?: LinearStepExecution | null;
  direction?: "RIGHT" | "DOWN";
  isSelected?: boolean;
};

export type PremiumFlowNode = Node<PremiumNodeData, "premiumWorkflow">;

export type LinearExecutionTrace = {
  traceId: string;
  steps: LinearStepExecution[];
  renderOutput?: { renderUrl: string } | null;
  awaitingHumanApproval?: boolean;
};

const NODE_KIND_META: Record<
  WorkflowNodeKind,
  { label: string; group: string; accentColor: string; bgTone: string; icon: any }
> = {
  START: { label: "Bắt đầu", group: "Planning", accentColor: "border-emerald-500/70", bgTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: Play },
  END: { label: "Bàn giao", group: "Delivery", accentColor: "border-indigo-500/70", bgTone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", icon: CheckCircle2 },
  AGENT_TASK: { label: "Tác vụ Agent", group: "Execution", accentColor: "border-sky-500/60", bgTone: "bg-sky-500/10 text-sky-600 dark:text-sky-400", icon: Bot },
  CONDITION: { label: "Quyết định", group: "Logic", accentColor: "border-violet-500/70", bgTone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", icon: GitBranch },
  APPROVAL_GATE: { label: "Cổng duyệt", group: "Quality", accentColor: "border-amber-500/80", bgTone: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: UserCheck },
  PARALLEL_BRANCH: { label: "Rẽ nhánh", group: "Logic", accentColor: "border-purple-500/60", bgTone: "bg-purple-500/10 text-purple-600 dark:text-purple-400", icon: GitBranch },
  JOIN: { label: "Hợp nhánh", group: "Logic", accentColor: "border-purple-500/60", bgTone: "bg-purple-500/10 text-purple-600 dark:text-purple-400", icon: GitMerge },
  VALIDATION: { label: "Kiểm tra", group: "Quality", accentColor: "border-teal-500/60", bgTone: "bg-teal-500/10 text-teal-600 dark:text-teal-400", icon: ShieldCheck },
  RESEARCH: { label: "Tìm kiếm", group: "Discovery", accentColor: "border-cyan-500/60", bgTone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", icon: Compass },
  TOOL_EXECUTION: { label: "Công cụ", group: "Tools", accentColor: "border-blue-500/60", bgTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: Wrench },
  RETRY_RECOVERY: { label: "Khôi phục", group: "Reliability", accentColor: "border-rose-500/60", bgTone: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: RotateCcw },
  NOTIFICATION: { label: "Thông báo", group: "Events", accentColor: "border-emerald-500/60", bgTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: Zap },
  EXPORT: { label: "Xuất file", group: "Delivery", accentColor: "border-indigo-500/60", bgTone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", icon: FileSpreadsheet },
  HUMAN_INPUT: { label: "Hỏi ý kiến", group: "Governance", accentColor: "border-amber-500/70", bgTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: HelpCircle },
};

function getSpecialStepIcon(stepId: string, nodeType: WorkflowNodeKind) {
  const normalized = stepId.toLowerCase();
  if (normalized.includes("floorplan")) return Layers;
  if (normalized.includes("geometry") || normalized.includes("bim")) return FileCode;
  if (normalized.includes("furniture")) return Palette;
  if (normalized.includes("style") || normalized.includes("material")) return Sparkles;
  if (normalized.includes("lighting") || normalized.includes("render")) return Flame;
  if (normalized.includes("cost") || normalized.includes("bom")) return FileSpreadsheet;
  if (normalized.includes("qa") || normalized.includes("quality")) return ShieldCheck;
  if (normalized.includes("review")) return FileCheck;
  return NODE_KIND_META[nodeType]?.icon ?? Bot;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; cardRing: string; dotClass: string }
> = {
  "Hoàn thành": {
    label: "Hoàn thành",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    cardRing: "border-emerald-500/80 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.25)]",
    dotClass: "bg-emerald-500",
  },
  done: {
    label: "Hoàn thành",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    cardRing: "border-emerald-500/80 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.25)]",
    dotClass: "bg-emerald-500",
  },
  "Đang chạy": {
    label: "Đang chạy",
    badgeClass: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    cardRing: "border-sky-500 ring-2 ring-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.35)]",
    dotClass: "bg-sky-500 animate-pulse",
  },
  running: {
    label: "Đang chạy",
    badgeClass: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    cardRing: "border-sky-500 ring-2 ring-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.35)]",
    dotClass: "bg-sky-500 animate-pulse",
  },
  "Chờ duyệt": {
    label: "Chờ duyệt",
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
    cardRing: "border-amber-500 ring-2 ring-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.25)]",
    dotClass: "bg-amber-500 animate-ping",
  },
  needs_review: {
    label: "Chờ duyệt",
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
    cardRing: "border-amber-500 ring-2 ring-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.25)]",
    dotClass: "bg-amber-500 animate-ping",
  },
  "Lỗi": {
    label: "Lỗi",
    badgeClass: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
    cardRing: "border-rose-500 ring-2 ring-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.35)]",
    dotClass: "bg-rose-500",
  },
  failed: {
    label: "Lỗi",
    badgeClass: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
    cardRing: "border-rose-500 ring-2 ring-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.35)]",
    dotClass: "bg-rose-500",
  },
  blocked: {
    label: "Bị chặn",
    badgeClass: "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300",
    cardRing: "border-orange-500 ring-2 ring-orange-500/30",
    dotClass: "bg-orange-500",
  },
  ready: {
    label: "Sẵn sàng",
    badgeClass: "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    cardRing: "border-blue-400/50",
    dotClass: "bg-blue-400",
  },
  "Chờ": {
    label: "Chờ",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
    cardRing: "border-border/80",
    dotClass: "bg-muted-foreground/60",
  },
  pending: {
    label: "Chờ",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
    cardRing: "border-border/80",
    dotClass: "bg-muted-foreground/60",
  },
};

export const PremiumWorkflowNode = memo(function PremiumWorkflowNode({
  data,
  selected,
}: NodeProps<PremiumFlowNode>) {
  const { item, errors = 0, owner = "Tự động", runtimeStep, direction = "RIGHT" } = data;
  const isHorizontal = direction === "RIGHT";

  const meta = NODE_KIND_META[item.type] ?? NODE_KIND_META.AGENT_TASK;
  const StepIcon = getSpecialStepIcon(item.id, item.type);

  // Status mapping
  const activeStatusKey = runtimeStep ? runtimeStep.status : data.state ?? "pending";
  const statusCfg = STATUS_CONFIG[activeStatusKey] ?? STATUS_CONFIG["pending"];

  // Step label / badge
  const stepLabel =
    item.stepLabel ??
    (item.stepNumber
      ? `Bước ${item.stepNumber}/${item.totalSteps ?? 5}`
      : item.type === "START"
        ? "Khởi đầu"
        : item.type === "END"
          ? "Kết thúc"
          : meta.label);

  const isStart = item.type === "START";
  const isEnd = item.type === "END";
  const isDecision = item.type === "CONDITION";

  // Formatted duration if available
  const formattedDuration =
    runtimeStep?.durationMs !== null && runtimeStep?.durationMs !== undefined
      ? runtimeStep.durationMs < 1000
        ? `${Math.round(runtimeStep.durationMs)}ms`
        : `${(runtimeStep.durationMs / 1000).toFixed(1)}s`
      : null;

  return (
    <div
      className={`group relative flex w-[270px] min-h-[128px] flex-col rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 select-none ${
        statusCfg.cardRing
      } ${
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg scale-[1.01]"
          : "hover:shadow-md hover:border-primary/50"
      }`}
    >
      {/* Target Connection Handle (in) */}
      {!isStart && (
        <Handle
          id="in"
          type="target"
          position={isHorizontal ? Position.Left : Position.Top}
          className="!size-3.5 !-left-[7px] !border-2 !border-background !bg-primary transition-transform group-hover:scale-125"
        />
      )}

      {/* 1. HEADER */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/70 px-3 py-1.5 bg-muted/25 rounded-t-xl">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`flex size-5 shrink-0 items-center justify-center rounded-md ${meta.bgTone}`}>
            <StepIcon className="size-3" />
          </div>
          <span className="truncate text-[11px] font-semibold tracking-wide text-foreground uppercase">
            {stepLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {errors > 0 ? (
            <span
              title={`${errors} lỗi kiểm tra`}
              className="flex items-center gap-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive"
            >
              <AlertTriangle className="size-2.5" />
              {errors}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.badgeClass}`}
            >
              <span className={`size-1.5 rounded-full ${statusCfg.dotClass}`} />
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY */}
      <div className="flex flex-1 flex-col justify-between px-3.5 py-2.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-xs font-bold leading-tight tracking-tight text-foreground line-clamp-2">
              {item.name}
            </h4>
            <span className="shrink-0 font-mono text-[10px] font-medium text-muted-foreground/75 bg-muted/40 px-1 rounded">
              #{item.id}
            </span>
          </div>

          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>

        {/* Assigned Agent / Owner row */}
        <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-border/40 pt-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-2.5" />
            </div>
            <span className="truncate text-[11px] font-medium text-foreground/80">
              {owner}
            </span>
          </div>

          {formattedDuration ? (
            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Clock className="size-2.5" />
              {formattedDuration}
            </div>
          ) : item.taskType ? (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
              {item.taskType}
            </span>
          ) : null}
        </div>
      </div>

      {/* 3. FOOTER / ACCENT BAR */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/50 px-3 bg-muted/15 rounded-b-xl text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {item.approval?.required && (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold text-[10px]">
              <UserCheck className="size-3" />
              Cổng duyệt
            </span>
          )}
          {item.includesValidator && (
            <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300 font-medium text-[10px]">
              <ShieldCheck className="size-3" />
              Validator
            </span>
          )}
          {item.notes && (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-[10px]" title="Có ghi chú">
              <FileText className="size-3" />
            </span>
          )}
        </div>

        {item.retryPolicy?.maxAttempts && item.retryPolicy.maxAttempts > 1 ? (
          <span className="font-mono text-[9px] text-muted-foreground">
            {item.retryPolicy.maxAttempts}x retry
          </span>
        ) : null}
      </div>

      {/* Source Connection Handle (out) */}
      {!isEnd && (
        <Handle
          id="out"
          type="source"
          position={isHorizontal ? Position.Right : Position.Bottom}
          className="!size-3.5 !-right-[7px] !border-2 !border-background !bg-primary transition-transform group-hover:scale-125"
        />
      )}

      {/* Extra Decision branch handles if condition node */}
      {isDecision && (
        <>
          <Handle
            id="out_yes"
            type="source"
            position={Position.Top}
            className="!size-2.5 !-top-[5px] !border-2 !border-background !bg-emerald-500"
            title="Đạt / Hợp lệ (Yes/Approved)"
          />
          <Handle
            id="out_no"
            type="source"
            position={Position.Bottom}
            className="!size-2.5 !-bottom-[5px] !border-2 !border-background !bg-rose-500"
            title="Lỗi / Từ chối (No/Rejected)"
          />
        </>
      )}
    </div>
  );
});
