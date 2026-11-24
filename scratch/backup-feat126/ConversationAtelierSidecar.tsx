import React, { useState, Suspense, lazy } from "react";
import { useNavigate } from "@/lib/router";
import { useAtelierStudio } from "./AtelierStudioContext";
import {
  Box,
  Check,
  X,
  Maximize2,
  Sparkles,
  FileCode2,
  Calculator,
  Layers,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Send,
  RotateCcw,
  Download,
  Bot,
  ExternalLink,
} from "lucide-react";

const LazyStudioViewport = lazy(() =>
  import("./StudioViewport").then((mod) => ({ default: mod.StudioViewport }))
);

interface ConversationAtelierSidecarProps {
  agentName?: string;
}

export function ConversationAtelierSidecar({
  agentName = "Chief Architect",
}: ConversationAtelierSidecarProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [show3DPreview, setShow3DPreview] = useState(true);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [selectedChip, setSelectedChip] = useState("Japandi / Modern Warm");

  const {
    project,
    materialsCatalog,
    pbrMaterials,
    chatHistory,
    estimate,
    handleSendChat,
    handleProposalDecision,
    handleRestoreRevision,
    revisions,
    viewMode,
    setViewMode,
    cameraPreset,
    setCameraPreset,
    lightingPreset,
    selectedEntityId,
    setSelectedEntityId,
  } = useAtelierStudio();

  const messages = chatHistory.messages || [];
  const workflowMessages = messages
    .filter((message: any) => message.metadata?.event_id && message.metadata?.workflow_run_id)
    .slice(-12);
  const proposals = chatHistory.proposals || [];
  const pendingProposals = proposals.filter((p: any) => p.status === "pending");
  const latestApplied = proposals.find((p: any) => p.status === "applied");
  const undoScene = async () => {
    const previous = revisions
      .map((revision: any) => Number(revision.revision ?? revision.revision_number))
      .filter((revision: number) => Number.isFinite(revision) && revision < Number(project?.revision ?? 0))
      .sort((a: number, b: number) => b - a)[0];
    if (previous !== undefined) await handleRestoreRevision(previous);
  };

  const handleQuickSend = async (text?: string) => {
    const msg = (text ?? quickPrompt).trim();
    if (!msg) return;
    setQuickPrompt("");
    await handleSendChat(msg);
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-11 shrink-0 flex-col items-center border-l border-border bg-card/80 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
          title="Mở Contextual Sidecar Nội Thất 3D"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-3 text-muted-foreground">
          <Box className="h-4 w-4 text-teal-600" />
          <Calculator className="h-4 w-4" />
          <FileCode2 className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-card/60 text-foreground xl:w-[420px]">
      {/* Sidecar Header */}
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-600/10 text-teal-700 dark:text-teal-400">
            <Box className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">
              Bối cảnh Thiết kế & Pascal 3D
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              Đồng bộ trực tiếp với {agentName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate("/design-studio")}
            className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-medium text-white shadow-xs transition hover:bg-teal-800"
            title="Mở toàn màn hình Không gian thiết kế 2D/3D"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Mở 3D Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Thu gọn Sidecar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 text-xs">
        {/* 1. Live 2D/3D Mini Viewport */}
        <div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xs">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <Layers className="h-3.5 w-3.5 text-teal-600" />
              <span>Pascal SceneGraph (Rev #{project?.revision ?? 1})</span>
            </div>
            <div className="flex items-center gap-1">
              {(["3d", "2d", "split"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    viewMode === m
                      ? "bg-teal-700 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShow3DPreview((v) => !v)}
                className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {show3DPreview ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          {show3DPreview && (
            <div className="relative h-52 w-full bg-zinc-950/5">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                    Đang tải Pascal 3D Preview...
                  </div>
                }
              >
                <LazyStudioViewport
                  project={project}
                  materialsDb={materialsCatalog ?? { paints: [], tiles_and_flooring: [] }}
                  pbrMaterials={pbrMaterials}
                  viewMode={viewMode}
                  cameraPreset={cameraPreset}
                  lightingPreset={lightingPreset}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={setSelectedEntityId}
                />
              </Suspense>
              <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex items-center justify-between rounded bg-background/90 px-2 py-1 text-[10px] backdrop-blur-xs border border-border/60">
                <span>
                  {project?.rooms?.[0]?.label ?? "Phòng khách 4.0×5.0m"} (
                  {project?.rooms?.[0]?.area_m2 ?? 20} m²)
                </span>
                <span className="font-mono text-teal-700 dark:text-teal-400">
                  {project?.furniture_instances?.length ?? 0} nội thất · {project?.walls?.length ?? 0} tường
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Persisted native-task lifecycle, rendered in this Studio conversation. */}
        <section className="rounded-lg border border-border bg-background p-3 shadow-2xs space-y-2" aria-label="Tiến độ nhóm agent">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              Nhóm agent theo Workflow
            </span>
            <span className="text-[10px] text-muted-foreground">Sự kiện đã xác minh</span>
          </div>
          {workflowMessages.length ? (
            <div className="space-y-2">
              {workflowMessages.map((message: any) => {
                const metadata = message.metadata || {};
                const taskRef = metadata.task_identifier || metadata.native_task_id;
                return (
                  <article key={metadata.event_id} className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-semibold text-foreground">{message.sender_name || metadata.agent_id}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{metadata.role_title || metadata.node_label || metadata.node_id}</div>
                      </div>
                      <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {metadata.status || metadata.event_type}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">{message.content}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>{message.created_at ? new Date(message.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      {taskRef ? (
                        <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`/ATL/issues/${taskRef}`}>
                          {metadata.task_identifier || "Mở task"}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
              Chưa có sự kiện native task đã xác minh cho project này.
            </div>
          )}
        </section>

        {/* 2. DesignBrief: ConfirmedFacts / Assumptions / Preferences */}
        <div className="rounded-lg border border-border bg-background p-3 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
              Hồ sơ Thiết kế (DesignBrief)
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              Đã xác thực kích thước
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="rounded border border-border/70 bg-muted/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                ConfirmedFacts
              </div>
              <div className="mt-0.5 font-medium">Rộng 4.0m × Dài 5.0m</div>
              <div className="text-muted-foreground">Trần 2.7m · Cửa Nam 0.9m</div>
            </div>
            <div className="rounded border border-border/70 bg-muted/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Assumptions & Style
              </div>
              <div className="mt-0.5 font-medium">{selectedChip}</div>
              <div className="text-muted-foreground">Hành lang thông thủy ≥600mm</div>
            </div>
          </div>

          {/* Structured Style / Action Chips (Max 1-3 quick choices per turn) */}
          <div className="pt-1">
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">
              Chọn nhanh phương án với Chief Architect:
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                "Đổi sang phong cách Japandi ấm áp",
                "Đổi sang phong cách Indochine",
                "Tối ưu lối đi >= 750mm",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setSelectedChip(chip);
                    void handleQuickSend(chip);
                  }}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-foreground transition hover:border-teal-600 hover:bg-teal-500/10"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Direct Consultation Input bridged to Pascal Scene Proposal */}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleQuickSend();
              }}
              placeholder="Yêu cầu sửa bố cục / vật liệu 3D..."
              className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-[11px] outline-none focus:border-teal-600"
            />
            <button
              type="button"
              onClick={() => void handleQuickSend()}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-white hover:bg-teal-800"
              title="Gửi yêu cầu thiết kế"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 3. Pending Proposals & Approval Gate */}
        <div className="rounded-lg border border-border bg-background p-3 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Đề xuất thay đổi Scene (Approval Gate)
            </span>
            <button
              type="button"
              onClick={() => void undoScene()}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              title="Hoàn tác phiên bản Scene trước"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Undo
            </button>
          </div>

          {pendingProposals.length > 0 ? (
            <div className="space-y-2">
              {pendingProposals.map((prop) => (
                <div
                  key={prop.id}
                  className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] text-amber-800 dark:text-amber-300">
                      {prop.agent_name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {prop.diffs?.length ?? 0} thay đổi
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {prop.summary}
                  </p>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleProposalDecision(prop.id, "approve")}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-teal-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-800"
                    >
                      <Check className="h-3 w-3" />
                      Phê duyệt & Áp dụng
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleProposalDecision(prop.id, "reject")}
                      className="inline-flex items-center justify-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
              {latestApplied
                ? `Đã áp dụng: ${latestApplied.summary}`
                : "Chưa có đề xuất chờ duyệt. Hãy chọn chip hoặc nhập yêu cầu ở trên để tạo Proposal."}
            </div>
          )}

          {messages.length > 0 && (
            <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Phản hồi mới nhất: </span>
              {messages[messages.length - 1]?.content ?? messages[messages.length - 1]?.text}
            </div>
          )}
        </div>

        {/* 4. Deterministic Cost Summary (Vietnam BOQ) */}
        <div className="rounded-lg border border-border bg-background p-3 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-teal-600" />
              Dự toán Định lượng (VNĐ)
            </span>
            <button
              type="button"
              onClick={() => navigate("/cost-estimation")}
              className="text-[10px] font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Xem BOQ chi tiết →
            </button>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="text-muted-foreground">Tổng cộng (gồm VAT 10%):</span>
            <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
              {(estimate?.total_vnd ?? 0).toLocaleString("vi-VN")} ₫
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Tính toán bởi Cost Engine (hao hụt gạch 5%, sơn 8%, gỗ 7% + nhân công + dự phòng 8%)
          </div>
        </div>

        {/* 5. Artifacts & Exports */}
        <div className="rounded-lg border border-border bg-background p-3 shadow-2xs space-y-2">
          <div className="font-semibold flex items-center gap-1.5">
            <FileCode2 className="h-3.5 w-3.5 text-teal-600" />
            Artifacts & Xuất Hồ sơ Kỹ thuật
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <a
              href="/api/v1/projects/proj_demo_4x5m/export/dxf"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded border border-border bg-muted/30 px-2 py-1.5 text-[10px] font-medium hover:border-teal-600 hover:text-teal-700"
            >
              <Download className="h-3 w-3" />
              CAD .DXF
            </a>
            <a
              href="/api/v1/projects/proj_demo_4x5m/export/glb"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded border border-border bg-muted/30 px-2 py-1.5 text-[10px] font-medium hover:border-teal-600 hover:text-teal-700"
            >
              <Download className="h-3 w-3" />
              3D .GLB
            </a>
            <a
              href="/api/v1/projects/proj_demo_4x5m/export/xlsx"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded border border-border bg-muted/30 px-2 py-1.5 text-[10px] font-medium hover:border-teal-600 hover:text-teal-700"
            >
              <Download className="h-3 w-3" />
              BOQ .XLSX
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
