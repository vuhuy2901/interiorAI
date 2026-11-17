import { lazy, Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Focus,
  History,
  Layers,
  MessageCircle,
  Moon,
  RotateCcw,
  Save,
  Sliders,
  Sun,
  Sunset,
  Sparkles,
  Maximize2,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { atelierApi } from "@/api/atelier";
import { useAtelierStudio } from "./AtelierStudioContext";
import { ObjectInspector } from "./ObjectInspector";
import { AIDesignAssistant } from "./AIDesignAssistant";
import { RevisionHistoryDrawer } from "./RevisionHistoryDrawer";
import "./atelier-studio.css";

const LazyStudioViewport = lazy(() =>
  import("./StudioViewport").then((mod) => ({ default: mod.StudioViewport })),
);

type DockId = "inspector" | "assistant";

function formatVND(value?: number | null) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value || 0)) + " ₫";
}

function readDockWidth(key: string, fallback: number) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value >= 260 && value <= 480 ? value : fallback;
}

interface Project3DStudioTabProps {
  projectId: string;
  projectName: string;
  companyId: string;
}

export function Project3DStudioTab({
  projectId,
  projectName,
  companyId,
}: Project3DStudioTabProps) {
  const { theme } = useTheme();
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    project,
    estimate,
    materialsCatalog,
    pbrMaterials,
    assetLibrary,
    chatHistory,
    revisions,
    selectedEntityId,
    setSelectedEntityId,
    viewMode,
    setViewMode,
    cameraPreset,
    setCameraPreset,
    lightingPreset,
    setLightingPreset,
    busyMessage,
    errorMessage,
    refreshProjectBundle,
    handleSendChat,
    handleAnswerQuestion,
    handleProposalDecision,
    handleRestoreRevision,
    handleUpdateFurnitureField,
    handleSaveScene,
    handleExport,
    handleAssignAsset,
    handleImportAssetAndAssign,
    handleRequestSmartFit,
    handleRequestPlacementOptions,
    handleCreatePlacementProposal,
  } = useAtelierStudio();

  // Fetch native project workspace to resolve linked scenes
  const workspaceQuery = useQuery({
    queryKey: ["atelier", "workspace", projectId],
    queryFn: () => atelierApi.workspace(projectId),
    enabled: !!projectId,
    staleTime: 10_000,
  });

  const workspace = workspaceQuery.data;
  const linkedScenes = useMemo(() => (workspace?.scenes ?? []).filter((scene) => !scene.archived), [workspace?.scenes]);
  const primaryScene = linkedScenes[0] ?? null;

  // Auto-activate scene linked to this native project
  useEffect(() => {
    if (!primaryScene?.scene_id) return;
    if (activeProjectId !== primaryScene.scene_id) {
      setActiveProjectId(primaryScene.scene_id);
    }
  }, [primaryScene?.scene_id, activeProjectId, setActiveProjectId]);

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [revisionDrawerOpen, setRevisionDrawerOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; type: "fit" | "focus" | "reset" }>({
    id: 0,
    type: "fit",
  });
  const [cutawayEnabled, setCutawayEnabled] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [inspectorWidth, setInspectorWidth] = useState(() => readDockWidth("atelier.project.inspectorWidth", 340));
  const [assistantWidth, setAssistantWidth] = useState(() => readDockWidth("atelier.project.assistantWidth", 360));
  const resizeOrigin = useRef<{ dock: DockId; x: number; width: number } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const origin = resizeOrigin.current;
      if (!origin) return;
      const next = Math.max(260, Math.min(480, origin.width + origin.x - event.clientX));
      if (origin.dock === "inspector") setInspectorWidth(next);
      else setAssistantWidth(next);
    };
    const onPointerUp = () => {
      if (!resizeOrigin.current) return;
      window.localStorage.setItem("atelier.project.inspectorWidth", String(inspectorWidth));
      window.localStorage.setItem("atelier.project.assistantWidth", String(assistantWidth));
      resizeOrigin.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [assistantWidth, inspectorWidth]);

  const beginResize = (dock: DockId, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizeOrigin.current = {
      dock,
      x: event.clientX,
      width: dock === "inspector" ? inspectorWidth : assistantWidth,
    };
  };

  const isCurrentProjectLoaded = Boolean(
    project && primaryScene && project.project_id === primaryScene.scene_id
  );

  const selectedEntity =
    project?.furniture_instances?.find((item: any) => item.id === selectedEntityId) ||
    project?.walls?.find((item: any) => item.id === selectedEntityId) ||
    null;

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-border bg-card/60 p-8 text-center backdrop-blur-xs">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
        <h3 className="text-base font-semibold text-foreground">Đang tải không gian 3D Studio...</h3>
        <p className="mt-1 text-sm text-muted-foreground">Đang đồng bộ dữ liệu bản vẽ BIM và liên kết dự án</p>
      </div>
    );
  }

  if (linkedScenes.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <div className="rounded-full bg-primary/10 p-3 text-primary mb-3">
          <Layers className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Chưa có Scene 3D liên kết</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Dự án <span className="font-medium text-foreground">{projectName}</span> chưa có không gian 3D Studio. Bạn có thể liên kết bản vẽ hoặc yêu cầu Agent khởi tạo phòng.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Liên kết scene của dự án trước khi mở bản vẽ. Scene mẫu không được tự động dùng thay thế.
        </p>
      </div>
    );
  }

  return (
    <div
      className="atelier-surface-root relative flex flex-col rounded-xl border border-border bg-background shadow-xs overflow-hidden"
      data-theme={theme}
      style={{ minHeight: "720px", height: "calc(100vh - 220px)" }}
    >
      {/* Studio Header Bar */}
      <header className="atelier-studio-header shrink-0 border-b border-border/80 px-4 py-2.5">
        <div className="atelier-header-group flex items-center gap-3">
          <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {primaryScene.name}
          </span>
          <span className={`status-badge ${project?.scale_calibrated ? "emerald" : "amber"} text-xs`}>
            {project?.scale_calibrated ? "Tỷ lệ chuẩn 1:1 mm" : "Chờ xác nhận tỷ lệ"}
          </span>
          {project?.room_type && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {project.room_type}
            </span>
          )}
        </div>

        <div className="atelier-header-actions flex items-center gap-2">
          <span className="atelier-estimate text-xs font-mono font-medium px-2.5 py-1 rounded bg-muted/60" title="Tổng dự toán BOQ">
            {estimate?.total_is_complete === false ? 'Tạm tính: ' : ''}{estimate?.priced_line_count === 0 ? 'Chưa có giá' : formatVND(estimate?.total_vnd)}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            data-testid="save-scene"
            onClick={() => void handleSaveScene()}
            disabled={Boolean(busyMessage)}
            title="Lưu trạng thái Scene vào CSDL"
          >
            <Save size={13} /> {busyMessage?.includes("lưu Scene") ? "Đang lưu..." : "Lưu Scene"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setRevisionDrawerOpen(true)}
            title="Lịch sử phiên bản Scene"
          >
            <History size={13} /> Rev #{project?.revision || 0}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            data-testid="export-dxf"
            onClick={() => void handleExport("dxf")}
            title="Xuất bản vẽ kỹ thuật DXF"
          >
            <Download size={13} /> DXF
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="export-glb"
            onClick={() => void handleExport("glb")}
            title="Xuất mô hình 3D định dạng GLB"
          >
            <Download size={13} /> GLB
          </button>
        </div>
      </header>

      {/* Viewport Toolbar */}
      <div className="atelier-view-toolbar shrink-0 px-4 py-2 border-b border-border/60 bg-muted/20" role="toolbar" aria-label="Điều khiển không gian 3D Studio">
        <div className="segmented-group" aria-label="Chế độ hiển thị">
          {(["split", "2d", "3d"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`seg-btn ${viewMode === mode ? "active" : ""}`}
              onClick={() => {
                setViewMode(mode);
                if (mode === "2d" && cameraPreset === "walk") setCameraPreset("orbit");
              }}
            >
              {mode === "split" ? "2D + 3D" : mode.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="segmented-group" aria-label="Ánh sáng môi trường">
          <button
            type="button"
            className={`seg-btn ${lightingPreset === "day" ? "active" : ""}`}
            onClick={() => setLightingPreset("day")}
            title="Ánh sáng ban ngày"
          >
            <Sun size={12} /> Ngày
          </button>
          <button
            type="button"
            className={`seg-btn ${lightingPreset === "sunset" ? "active" : ""}`}
            onClick={() => setLightingPreset("sunset")}
            title="Ánh sáng hoàng hôn"
          >
            <Sunset size={12} /> Hoàng hôn
          </button>
          <button
            type="button"
            className={`seg-btn ${lightingPreset === "night" ? "active" : ""}`}
            onClick={() => setLightingPreset("night")}
            title="Ánh sáng ban đêm"
          >
            <Moon size={12} /> Đêm
          </button>
        </div>

        <div className="segmented-group" aria-label="Góc nhìn Camera">
          {(["orbit", "top", "walk"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={viewMode === "2d"}
              className={`seg-btn ${viewMode !== "2d" && cameraPreset === preset ? "active" : ""}`}
              onClick={() => setCameraPreset(preset)}
            >
              {preset === "orbit" ? "Orbit" : preset === "top" ? "Top" : "Walk"}
            </button>
          ))}
          <button
            type="button"
            disabled={viewMode === "2d"}
            className={`seg-btn ${cutawayEnabled ? "active" : ""}`}
            onClick={() => setCutawayEnabled((value) => !value)}
            title="Cắt mặt tường nhìn trực diện"
          >
            Cutaway
          </button>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "fit" }))}
          title="Đưa toàn bộ phòng vào khung hình"
        >
          <Maximize2 size={12} /> Fit Room
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!selectedEntityId}
          onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "focus" }))}
          title="Tập trung vào vật thể đang chọn"
        >
          <Focus size={12} /> Focus
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }))}
          title="Khôi phục vị trí camera ban đầu"
        >
          <RotateCcw size={12} /> Reset
        </button>

        <span className="atelier-toolbar-spacer" />

        <button
          type="button"
          className={`btn btn-sm ${inspectorOpen ? "btn-soft ring-1 ring-primary/40" : ""}`}
          onClick={() => setInspectorOpen((value) => !value)}
          title="Bảng thuộc tính vật liệu và đồ nội thất"
        >
          <Sliders size={12} /> Inspector
        </button>
        <button
          type="button"
          className={`btn btn-sm ${assistantOpen ? "btn-soft ring-1 ring-primary/40" : ""}`}
          onClick={() => setAssistantOpen((value) => !value)}
          title="Trợ lý AI thiết kế đa Agent"
        >
          <MessageCircle size={12} /> AI Copilot
        </button>
      </div>

      {errorMessage ? (
        <div className="atelier-error-banner shrink-0" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {/* Main Studio Viewport & Side Docks */}
      <div
        className="workspace-layout flex-1 min-h-0 relative"
        style={
          {
            "--inspector-width": `${inspectorWidth}px`,
            "--assistant-width": `${assistantWidth}px`,
          } as React.CSSProperties
        }
      >
        {isCurrentProjectLoaded ? (
          <>
            <Suspense
              fallback={
                <div className="atelier-loading-state flex flex-col items-center justify-center h-full">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
                  <span>Đang tải Pascal 3D BIM Scene...</span>
                </div>
              }
            >
              <LazyStudioViewport
                project={project}
                materialsDb={materialsCatalog}
                pbrMaterials={pbrMaterials}
                viewMode={viewMode}
                cameraPreset={cameraPreset}
                lightingPreset={lightingPreset}
                cameraResetTrigger={0}
                cameraCommand={cameraCommand}
                cutawayEnabled={cutawayEnabled}
                selectedEntityId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
                theme={theme}
              />
            </Suspense>

            {inspectorOpen ? (
              <div className="dock-column inspector-column">
                <button
                  className="dock-resize-handle"
                  type="button"
                  onPointerDown={(event) => beginResize("inspector", event)}
                  aria-label="Thay đổi chiều rộng Inspector"
                />
                <ObjectInspector
                  project={project}
                  assetLibrary={assetLibrary}
                  selectedEntityId={selectedEntityId}
                  onSelectEntity={setSelectedEntityId}
                  onUpdateFurnitureField={handleUpdateFurnitureField}
                  onCommitCanvasPosition={() => void handleSaveScene()}
                  onAssignAsset={handleAssignAsset}
                  onImportAsset={handleImportAssetAndAssign}
                  onOpenAICopilot={() => setAssistantOpen(true)}
                  onRequestSmartFit={handleRequestSmartFit}
                  onRequestPlacementOptions={handleRequestPlacementOptions}
                  onCreatePlacementProposal={handleCreatePlacementProposal}
                  onClose={() => setInspectorOpen(false)}
                  savingScene={Boolean(busyMessage?.includes("lưu"))}
                />
              </div>
            ) : null}

            {assistantOpen ? (
              <div className="dock-column assistant-column">
                <button
                  className="dock-resize-handle"
                  type="button"
                  onPointerDown={(event) => beginResize("assistant", event)}
                  aria-label="Thay đổi chiều rộng AI Copilot"
                />
                <AIDesignAssistant
                  project={project}
                  chatHistory={chatHistory}
                  sendingChat={Boolean(busyMessage?.includes("Chief Architect"))}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  onSendChat={(text) => {
                    const message = (text ?? chatInput).trim();
                    if (!message) return;
                    void handleSendChat(message);
                    if (!text) setChatInput("");
                  }}
                  onAnswerQuestion={(questionId, answer) =>
                    void handleAnswerQuestion(questionId, answer)
                  }
                  onApproveProposal={(proposalId) =>
                    void handleProposalDecision(proposalId, "approve")
                  }
                  onRejectProposal={(proposalId) =>
                    void handleProposalDecision(proposalId, "reject")
                  }
                  onUndoLastRevision={() =>
                    void handleRestoreRevision(Math.max(1, (project.revision || 1) - 1))
                  }
                  onCloseMobile={() => setAssistantOpen(false)}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="atelier-loading-state flex flex-col items-center justify-center h-full">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
            <span>Đang kết nối Scene 3D: {primaryScene.scene_id}...</span>
          </div>
        )}
      </div>

      <RevisionHistoryDrawer
        isOpen={revisionDrawerOpen}
        onClose={() => setRevisionDrawerOpen(false)}
        project={project ? { ...project, revisions } : project}
        onRestoreRevision={handleRestoreRevision}
      />
      {selectedEntity ? (
        <span className="sr-only">Đang chọn đối tượng {selectedEntity.name || selectedEntity.id}</span>
      ) : null}
    </div>
  );
}
