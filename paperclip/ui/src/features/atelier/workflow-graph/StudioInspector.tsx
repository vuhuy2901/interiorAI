import { useState, useEffect, memo } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Flame,
  GitBranch,
  Layers,
  PanelRightClose,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Trash2,
  UserCheck,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import type {
  CanvasNote,
  CanvasNoteColor,
  OptionalCostBomStep,
  StepSettings,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
} from "./types";
import type { LinearExecutionTrace, LinearStepExecution } from "./PremiumWorkflowNode";

export type AgentOption = {
  agentId: string;
  name: string;
  role: string;
  status: string;
  available: boolean;
  roleKeys: string[];
  capabilities: string[];
  allowedTaskTypes: string[];
};

export type StudioInspectorProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: WorkflowNode | null;
  onPatchNode: (patch: Partial<WorkflowNode>) => void;
  onDeleteNode: (id: string) => void;
  selectedEdge: WorkflowEdge | null;
  onPatchEdge: (patch: Partial<WorkflowEdge>) => void;
  onDeleteEdge: (id: string) => void;
  selectedNote: CanvasNote | null;
  onPatchNote: (patch: Partial<CanvasNote>) => void;
  onDeleteNote: (id: string) => void;
  editable: boolean;
  agents: AgentOption[];
  allNodes: WorkflowNode[];
  runtimeStep: LinearStepExecution | null;
  latestExecution: LinearExecutionTrace | null;
  onApprovalDecision?: (traceId: string, decision: "approve" | "reject", note?: string) => void;
  optionalCostBom: OptionalCostBomStep;
  onToggleCostBom: (enabled: boolean) => void;
  workflowMeta: {
    name: string;
    version: number;
    status: string;
    description?: string;
  };
};

const NOTE_COLORS: Array<{ key: CanvasNoteColor; label: string; class: string }> = [
  { key: "yellow", label: "Vàng", class: "bg-amber-300" },
  { key: "blue", label: "Xanh dương", class: "bg-sky-300" },
  { key: "green", label: "Xanh lá", class: "bg-emerald-300" },
  { key: "purple", label: "Tím", class: "bg-purple-300" },
  { key: "neutral", label: "Trắng", class: "bg-zinc-200" },
];

const lines = (val: string) =>
  val
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export const StudioInspector = memo(function StudioInspector({
  isOpen,
  onClose,
  selectedNode,
  onPatchNode,
  onDeleteNode,
  selectedEdge,
  onPatchEdge,
  onDeleteEdge,
  selectedNote,
  onPatchNote,
  onDeleteNote,
  editable,
  agents,
  allNodes,
  runtimeStep,
  latestExecution,
  onApprovalDecision,
  optionalCostBom,
  onToggleCostBom,
  workflowMeta,
}: StudioInspectorProps) {
  const [approvalNoteInput, setApprovalNoteInput] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"general" | "settings" | "notes" | "runtime">("general");

  useEffect(() => {
    if (runtimeStep) {
      setInspectorTab("runtime");
    } else {
      setInspectorTab("general");
    }
  }, [selectedNode?.id, selectedEdge?.id, selectedNote?.id, runtimeStep?.nodeId]);

  if (!isOpen) return null;

  const fieldClass =
    "w-full rounded-md border border-input bg-background/80 px-2.5 py-1.5 text-xs text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <aside className="flex w-80 md:w-96 flex-col border-l border-border bg-card/95 backdrop-blur z-10 shrink-0 select-none">
      {/* 1. INSPECTOR HEADER */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 px-4 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          {selectedNode ? (
            <>
              <Bot className="size-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-foreground">
                  {selectedNode.name}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">
                  Node #{selectedNode.id}
                </div>
              </div>
            </>
          ) : selectedEdge ? (
            <>
              <GitBranch className="size-4 text-violet-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-foreground">
                  Transition: {selectedEdge.outcome || selectedEdge.id}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {selectedEdge.source} → {selectedEdge.target}
                </div>
              </div>
            </>
          ) : selectedNote ? (
            <>
              <StickyNote className="size-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-foreground">
                  {selectedNote.title || "Sticky Note"}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Ghi chú Canvas
                </div>
              </div>
            </>
          ) : (
            <>
              <Layers className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-foreground">
                  Tổng quan Workflow
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {workflowMeta.name} v{workflowMeta.version}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Đóng Inspector"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>

      {/* 2. INSPECTOR SUB-TABS (when Node is selected) */}
      {selectedNode && (
        <div className="flex border-b border-border/70 bg-muted/10 px-2 py-1 gap-1">
          <button
            type="button"
            onClick={() => setInspectorTab("general")}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              inspectorTab === "general"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Thuộc tính
          </button>
          <button
            type="button"
            onClick={() => setInspectorTab("settings")}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              inspectorTab === "settings"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cài đặt bước
          </button>
          <button
            type="button"
            onClick={() => setInspectorTab("notes")}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              inspectorTab === "notes"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ghi chú
          </button>
          {runtimeStep && (
            <button
              type="button"
              onClick={() => setInspectorTab("runtime")}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
                inspectorTab === "runtime"
                  ? "bg-primary/10 text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="size-3" />
              Runtime
            </button>
          )}
        </div>
      )}

      {/* 3. INSPECTOR CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CASE A: NODE SELECTED */}
        {selectedNode ? (
          <>
            {inspectorTab === "general" && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Tên bước xử lý
                  </label>
                  <input
                    disabled={!editable}
                    className={fieldClass}
                    value={selectedNode.name}
                    onChange={(e) => onPatchNode({ name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Mô tả công việc
                  </label>
                  <textarea
                    disabled={!editable}
                    rows={2}
                    className={`${fieldClass} resize-y`}
                    value={selectedNode.description ?? ""}
                    onChange={(e) => onPatchNode({ description: e.target.value })}
                  />
                </div>

                {/* Agent Assignment */}
                {["AGENT_TASK", "RESEARCH", "VALIDATION"].includes(selectedNode.type) && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>Agent phụ trách</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {selectedNode.requiredRole}
                      </span>
                    </div>

                    <select
                      disabled={!editable}
                      className={fieldClass}
                      value={selectedNode.assignedAgentId ?? ""}
                      onChange={(e) =>
                        onPatchNode({ assignedAgentId: e.target.value || null })
                      }
                    >
                      <option value="">Tự động theo năng lực ({selectedNode.requiredRole})</option>
                      {agents.map((ag) => (
                        <option key={ag.agentId} value={ag.agentId}>
                          {ag.name} ({ag.role}) {ag.available ? "" : "— bận"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Approval Gate Settings */}
                {selectedNode.type === "APPROVAL_GATE" || selectedNode.approval?.required ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={Boolean(selectedNode.approval?.required)}
                        onChange={(e) =>
                          onPatchNode({
                            approval: {
                              required: e.target.checked,
                              approverRole: selectedNode.approval?.approverRole || "authorized_approver",
                            },
                          })
                        }
                      />
                      <span>Bắt buộc có phê duyệt (Cổng NGƯỜI DUYỆT)</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Quy trình sẽ tạm dừng tại bước này cho đến khi người dùng xác nhận nghiệm thu.
                    </p>
                  </div>
                ) : null}

                {/* Decision Outcomes */}
                {selectedNode.type === "CONDITION" && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="text-xs font-bold text-foreground">Nhánh điều kiện</div>
                    <div className="text-[11px] text-muted-foreground">
                      Hỗ trợ phân luồng Đạt (Yes) và Chưa đạt (No/Retry).
                    </div>
                  </div>
                )}

                {/* Parallel/Join Sync Rule */}
                {["PARALLEL_BRANCH", "JOIN"].includes(selectedNode.type) && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <label className="block text-xs font-bold text-foreground">Quy tắc đồng bộ</label>
                    <select
                      disabled={!editable}
                      className={fieldClass}
                      value={selectedNode.syncRule ?? "all_completed"}
                      onChange={(e) =>
                        onPatchNode({ syncRule: e.target.value as "all_completed" | "any_completed" })
                      }
                    >
                      <option value="all_completed">Đợi tất cả nhánh hoàn thành (All completed)</option>
                      <option value="any_completed">Chỉ cần 1 nhánh hoàn thành (Any completed)</option>
                    </select>
                  </div>
                )}

                {/* Input / Output Contract */}
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="text-xs font-bold text-foreground">Hợp đồng Dữ liệu (Inputs / Outputs)</div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                      Đầu vào bắt buộc
                    </label>
                    <textarea
                      disabled={!editable}
                      rows={2}
                      className={fieldClass}
                      value={(selectedNode.requiredInputs ?? []).join("\n")}
                      onChange={(e) => onPatchNode({ requiredInputs: lines(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                      Đầu ra bàn giao
                    </label>
                    <textarea
                      disabled={!editable}
                      rows={2}
                      className={fieldClass}
                      value={(selectedNode.requiredOutputs ?? []).join("\n")}
                      onChange={(e) => onPatchNode({ requiredOutputs: lines(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Delete Node Action */}
                {editable && !["START", "END"].includes(selectedNode.type) && (
                  <div className="pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => onDeleteNode(selectedNode.id)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition"
                    >
                      <Trash2 className="size-3.5" />
                      Xóa bước này khỏi quy trình
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Step Settings */}
            {inspectorTab === "settings" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <RotateCcw className="size-3.5 text-primary" />
                    Chính sách Thử lại (Retry Policy)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Thử lại tối đa
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        disabled={!editable}
                        className={fieldClass}
                        value={
                          selectedNode.stepSettings?.retry?.maxAttempts ??
                          selectedNode.retryPolicy?.maxAttempts ??
                          1
                        }
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                          const curr: { maxAttempts?: number; backoffSeconds?: number } = selectedNode.stepSettings?.retry ?? {};
                          onPatchNode({
                            stepSettings: {
                              ...selectedNode.stepSettings,
                              retry: { ...curr, maxAttempts: val },
                            },
                            retryPolicy: { maxAttempts: val, backoffSeconds: curr.backoffSeconds || 15 },
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Chờ giữa lần (giây)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        disabled={!editable}
                        className={fieldClass}
                        value={
                          selectedNode.stepSettings?.retry?.backoffSeconds ??
                          selectedNode.retryPolicy?.backoffSeconds ??
                          15
                        }
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          const curr: { maxAttempts?: number; backoffSeconds?: number } = selectedNode.stepSettings?.retry ?? {};
                          onPatchNode({
                            stepSettings: {
                              ...selectedNode.stepSettings,
                              retry: { maxAttempts: curr.maxAttempts ?? 1, backoffSeconds: val },
                            },
                            retryPolicy: { maxAttempts: curr.maxAttempts ?? 1, backoffSeconds: val },
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Logging Settings */}
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <FileText className="size-3.5 text-primary" />
                    Ghi log thực thi
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={selectedNode.stepSettings?.logging?.enabled !== false}
                      onChange={(e) =>
                        onPatchNode({
                          stepSettings: {
                            ...selectedNode.stepSettings,
                            logging: {
                              enabled: e.target.checked,
                              level: selectedNode.stepSettings?.logging?.level ?? "info",
                            },
                          },
                        })
                      }
                    />
                    <span>Kích hoạt ghi log chi tiết cho bước này</span>
                  </label>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                      Mức log (Logging Level)
                    </label>
                    <select
                      disabled={!editable || selectedNode.stepSettings?.logging?.enabled === false}
                      className={fieldClass}
                      value={selectedNode.stepSettings?.logging?.level ?? "info"}
                      onChange={(e) =>
                        onPatchNode({
                          stepSettings: {
                            ...selectedNode.stepSettings,
                            logging: {
                              enabled: true,
                              level: e.target.value as "info" | "debug" | "error",
                            },
                          },
                        })
                      }
                    >
                      <option value="info">Thông tin chung (info)</option>
                      <option value="debug">Chi tiết kỹ thuật (debug)</option>
                      <option value="error">Chỉ khi lỗi (error)</option>
                    </select>
                  </div>
                </div>

                {/* Notifications */}
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    Thông báo trạng thái
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={Boolean(selectedNode.stepSettings?.notifications?.onStart)}
                      onChange={(e) =>
                        onPatchNode({
                          stepSettings: {
                            ...selectedNode.stepSettings,
                            notifications: {
                              ...selectedNode.stepSettings?.notifications,
                              onStart: e.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>Thông báo khi bắt đầu bước</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={selectedNode.stepSettings?.notifications?.onComplete !== false}
                      onChange={(e) =>
                        onPatchNode({
                          stepSettings: {
                            ...selectedNode.stepSettings,
                            notifications: {
                              ...selectedNode.stepSettings?.notifications,
                              onComplete: e.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>Thông báo khi hoàn tất</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={selectedNode.stepSettings?.notifications?.onError !== false}
                      onChange={(e) =>
                        onPatchNode({
                          stepSettings: {
                            ...selectedNode.stepSettings,
                            notifications: {
                              ...selectedNode.stepSettings?.notifications,
                              onError: e.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>Cảnh báo khẩn cấp khi gặp sự cố</span>
                  </label>
                </div>
              </div>
            )}

            {/* TAB: Node Notes */}
            {inspectorTab === "notes" && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary" />
                  Ghi chú chuyên môn cho bước
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Ghi chú nội bộ dành cho kiến trúc sư hoặc lưu ý kỹ thuật riêng của bước này. Không tự động chèn vào prompt thực thi agent trừ khi được cấu hình.
                </p>
                <textarea
                  disabled={!editable}
                  rows={8}
                  placeholder="Soạn ghi chú kỹ thuật, tiêu chuẩn nghiệm thu hoặc tài liệu tham khảo..."
                  className={`${fieldClass} resize-y leading-relaxed font-sans`}
                  value={selectedNode.notes ?? ""}
                  onChange={(e) => onPatchNode({ notes: e.target.value })}
                />
              </div>
            )}

            {/* TAB: Runtime Execution Details */}
            {inspectorTab === "runtime" && runtimeStep && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-bold text-foreground">
                    {runtimeStep.stepLabel} · {runtimeStep.name}
                  </span>
                  <span className="text-xs font-semibold">{runtimeStep.status}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/20 p-2.5 rounded-lg border border-border">
                  <div>
                    <span className="text-muted-foreground block">Agent:</span>
                    <span className="font-semibold">{runtimeStep.agentName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Thời gian chạy:</span>
                    <span className="font-mono font-semibold">
                      {runtimeStep.durationMs ? `${Math.round(runtimeStep.durationMs)} ms` : "Chưa hoàn tất"}
                    </span>
                  </div>
                </div>

                {runtimeStep.summary && (
                  <div className="text-xs bg-card p-2.5 rounded border border-border">
                    <span className="font-semibold block mb-1 text-[11px] text-muted-foreground">Tóm tắt:</span>
                    <p className="text-xs leading-relaxed">{runtimeStep.summary}</p>
                  </div>
                )}

                {runtimeStep.error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <span className="font-bold flex items-center gap-1 mb-1">
                      <AlertTriangle className="size-3.5" />
                      Lỗi thực thi:
                    </span>
                    <p className="font-mono text-[11px]">{runtimeStep.error}</p>
                  </div>
                )}

                {/* Logs list */}
                {runtimeStep.logs?.length > 0 && (
                  <div className="space-y-1.5 border-t border-border/60 pt-2">
                    <span className="text-xs font-bold text-foreground">Nhật ký thực thi (Logs)</span>
                    <div className="max-h-48 overflow-y-auto rounded border border-border bg-black/80 p-2 font-mono text-[10px] text-green-400 space-y-1">
                      {runtimeStep.logs.map((log, idx) => (
                        <div key={idx} className="flex gap-1.5">
                          <span className="text-zinc-500 shrink-0">[{log.level}]</span>
                          <span>{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Render output preview if available */}
                {latestExecution?.renderOutput?.renderUrl && selectedNode.id.includes("lighting") && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1.5">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      <Flame className="size-3.5 text-amber-500" />
                      Ảnh Render Blender Cycles
                    </span>
                    <img
                      src={latestExecution.renderOutput.renderUrl}
                      alt="Blender Render output"
                      className="w-full rounded border border-border object-cover max-h-48"
                    />
                  </div>
                )}

                {/* Human Approval Gate inside Inspector */}
                {latestExecution?.awaitingHumanApproval && onApprovalDecision && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 mt-2">
                    <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <UserCheck className="size-4" />
                      Cổng NGƯỜI DUYỆT (Chờ xác nhận)
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Xác nhận để hoàn tất bước nghiệm thu và cho phép xuất giao thiết kế.
                    </p>
                    <input
                      placeholder="Ghi chú duyệt..."
                      value={approvalNoteInput}
                      onChange={(e) => setApprovalNoteInput(e.target.value)}
                      className={fieldClass}
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          onApprovalDecision(latestExecution.traceId, "approve", approvalNoteInput)
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Check className="size-3.5" />
                        Duyệt &amp; Giao
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onApprovalDecision(latestExecution.traceId, "reject", approvalNoteInput)
                        }
                        className="inline-flex items-center justify-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-500/20"
                      >
                        <X className="size-3.5" />
                        Từ chối
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : selectedEdge ? (
          /* CASE B: TRANSITION SELECTED */
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Nhãn chuyển bước (Outcome / Label pill)
              </label>
              <input
                disabled={!editable}
                className={fieldClass}
                placeholder="VD: Start, Task Completed, Approved, Rejected, Retry..."
                value={selectedEdge.outcome ?? ""}
                onChange={(e) => onPatchEdge({ outcome: e.target.value || undefined })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                  Từ bước (Source)
                </label>
                <select
                  disabled={!editable}
                  className={fieldClass}
                  value={selectedEdge.source}
                  onChange={(e) => onPatchEdge({ source: e.target.value })}
                >
                  {allNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} (#{n.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                  Đến bước (Target)
                </label>
                <select
                  disabled={!editable}
                  className={fieldClass}
                  value={selectedEdge.target}
                  onChange={(e) => onPatchEdge({ target: e.target.value })}
                >
                  {allNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} (#{n.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Behavior Settings */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="text-xs font-bold text-foreground">Hành vi chuyển tiếp</div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                  Điều kiện kích hoạt (Condition / Guard)
                </label>
                <input
                  disabled={!editable}
                  className={fieldClass}
                  placeholder="VD: qa_passed == true"
                  value={selectedEdge.condition ?? ""}
                  onChange={(e) => onPatchEdge({ condition: e.target.value || undefined })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                    Loại kích hoạt (Trigger)
                  </label>
                  <select
                    disabled={!editable}
                    className={fieldClass}
                    value={selectedEdge.trigger ?? "automatic"}
                    onChange={(e) =>
                      onPatchEdge({
                        trigger: e.target.value as "automatic" | "manual" | "event",
                      })
                    }
                  >
                    <option value="automatic">Tự động</option>
                    <option value="manual">Người dùng bấm</option>
                    <option value="event">Sự kiện / Lỗi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                    Độ ưu tiên
                  </label>
                  <select
                    disabled={!editable}
                    className={fieldClass}
                    value={selectedEdge.priority ?? "medium"}
                    onChange={(e) =>
                      onPatchEdge({
                        priority: e.target.value as "highest" | "high" | "medium" | "low",
                      })
                    }
                  >
                    <option value="highest">Cao nhất</option>
                    <option value="high">Cao</option>
                    <option value="medium">Bình thường</option>
                    <option value="low">Thấp</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Transition Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Ghi chú chuyển tiếp (Transition Notes)
              </label>
              <textarea
                disabled={!editable}
                rows={3}
                placeholder="VD: Chỉ chuyển sang Rendering khi Geometry và Furniture đã được xác minh..."
                className={`${fieldClass} resize-y leading-snug`}
                value={selectedEdge.notes ?? ""}
                onChange={(e) => onPatchEdge({ notes: e.target.value || undefined })}
              />
            </div>

            {/* Delete Transition Action */}
            {editable && (
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => onDeleteEdge(selectedEdge.id)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition"
                >
                  <Trash2 className="size-3.5" />
                  Xóa đường nối này
                </button>
              </div>
            )}
          </div>
        ) : selectedNote ? (
          /* CASE C: CANVAS STICKY NOTE SELECTED */
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Tiêu đề ghi chú
              </label>
              <input
                disabled={!editable}
                className={fieldClass}
                placeholder="VD: Lưu ý phòng ngủ Master..."
                value={selectedNote.title ?? ""}
                onChange={(e) => onPatchNote({ title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Màu sắc ghi chú
              </label>
              <div className="flex gap-2 pt-1">
                {NOTE_COLORS.map((nc) => (
                  <button
                    key={nc.key}
                    type="button"
                    onClick={() => onPatchNote({ color: nc.key })}
                    className={`size-6 rounded-full border border-black/20 ${nc.class} ${
                      selectedNote.color === nc.key ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    title={nc.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Nội dung ghi chú
              </label>
              <textarea
                disabled={!editable}
                rows={6}
                placeholder="Soạn nội dung ghi chú tự do trên canvas..."
                className={`${fieldClass} resize-y leading-relaxed`}
                value={selectedNote.content}
                onChange={(e) => onPatchNote({ content: e.target.value })}
              />
            </div>

            {editable && (
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => onDeleteNote(selectedNote.id)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition"
                >
                  <Trash2 className="size-3.5" />
                  Xóa Sticky Note
                </button>
              </div>
            )}
          </div>
        ) : (
          /* CASE D: NOTHING SELECTED (WORKFLOW & PROJECT OVERVIEW) */
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Định nghĩa quy trình
              </div>
              <h3 className="text-sm font-bold text-foreground">{workflowMeta.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {workflowMeta.description || "Quy trình điều phối AI chuyên nghiệp cho dự án nội thất Atelier."}
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="font-mono font-semibold">v{workflowMeta.version}</span>
                <span className="text-border">·</span>
                <span className="font-medium capitalize text-muted-foreground">
                  {workflowMeta.status}
                </span>
                <span className="text-border">·</span>
                <span>{allNodes.length} bước xử lý</span>
              </div>
            </div>

            {/* Optional Steps Toggle */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="text-xs font-bold text-foreground">Bước tùy chọn sau duyệt</div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={optionalCostBom.enabled}
                  onChange={(e) => onToggleCostBom(e.target.checked)}
                />
                <span className="font-semibold">Bóc tách Cost/BOM sau duyệt</span>
              </label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {optionalCostBom.description ||
                  "Chỉ chạy khi cổng NGƯỜI DUYỆT ở bước kiểm định cuối đã được chuyên gia xác nhận nghiệm thu."}
              </p>
            </div>

            {/* Helper tips */}
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground block">Mẹo thao tác:</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Bấm vào một node để chỉnh sửa vai trò agent và tham số thử lại.</li>
                <li>Bấm vào đường nối để chỉnh nhãn transition và điều kiện phân nhánh.</li>
                <li>Kéo handle từ node này sang node khác để tạo transition mới.</li>
                <li>Sử dụng menu "More" để thêm Sticky Note lên canvas.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});
