import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowLeft,
  Download,
  History,
  MessageCircle,
  Moon,
  PackageOpen,
  Focus,
  RotateCcw,
  Save,
  Sliders,
  Sun,
  Sunset,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useTheme } from "@/context/ThemeContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import { commandEvent, constructionKey } from "./constructionHistory";
import { ObjectInspector } from "./ObjectInspector";
import { AIDesignAssistant } from "./AIDesignAssistant";
import { RevisionHistoryDrawer } from "./RevisionHistoryDrawer";

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

export function AtelierDesignStudioPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    projects, activeProjectId, setActiveProjectId, project, estimate,
    materialsCatalog, pbrMaterials, assetLibrary, chatHistory, revisions,
    selectedEntityId, setSelectedEntityId, viewMode, setViewMode,
    cameraPreset, setCameraPreset, lightingPreset, setLightingPreset,
    busyMessage, errorMessage, handleSendChat,
    handleAnswerQuestion, handleProposalDecision, handleRestoreRevision,
    handleUpdateFurnitureField, handleSaveScene, handleExport, handleAssignAsset, handleImportAssetAndAssign,
    handleRequestSmartFit, handleRequestPlacementOptions, handleCreatePlacementProposal,
  } = useAtelierStudio();

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [revisionDrawerOpen, setRevisionDrawerOpen] = useState(false);
  const [cameraResetTrigger, setCameraResetTrigger] = useState(0);
  const [deliveryReplayTrigger, setDeliveryReplayTrigger] = useState(0);
  const [externalSceneObjects, setExternalSceneObjects] = useState<Array<{ id: string; name: string; parentName: string; dimensionsMm: [number, number, number] }>>([]);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; type: "fit" | "focus" | "reset" }>({ id: 0, type: "fit" });
  const [cutawayEnabled, setCutawayEnabled] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [inspectorWidth, setInspectorWidth] = useState(() => readDockWidth("atelier.inspectorWidth", 320));
  const [assistantWidth, setAssistantWidth] = useState(() => readDockWidth("atelier.assistantWidth", 360));
  const resizeOrigin = useRef<{ dock: DockId; x: number; width: number } | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Thiết kế Nội thất" }, { label: "Không gian thiết kế 2D/3D (Pascal BIM)" }]);
  }, [setBreadcrumbs]);

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
      window.localStorage.setItem("atelier.inspectorWidth", String(inspectorWidth));
      window.localStorage.setItem("atelier.assistantWidth", String(assistantWidth));
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
    resizeOrigin.current = { dock, x: event.clientX, width: dock === "inspector" ? inspectorWidth : assistantWidth };
  };

  const selectedEntity =
    project?.furniture_instances?.find((item: any) => item.id === selectedEntityId) ||
    project?.walls?.find((item: any) => item.id === selectedEntityId) || null;
  const linkedIssueIdentifier = new URLSearchParams(location.search).get("issueIdentifier");
  const selectedConstructionObject = project?.external_scene
    ? externalSceneObjects.find((item) => item.id === selectedEntityId)
    : project?.furniture_instances?.find((item: any) => item.id === selectedEntityId);

  return (
    <div className="atelier-surface-root flex h-full w-full flex-col overflow-hidden" data-theme={theme}>
      {linkedIssueIdentifier ? (
        <div className="atelier-context-banner">
          <span>Đang mở Scene liên kết với công việc {linkedIssueIdentifier}</span>
          <button type="button" className="btn btn-sm" onClick={() => navigate(`/issues/${linkedIssueIdentifier}`)}>Quay lại công việc</button>
        </div>
      ) : null}

      <header className="atelier-studio-header">
        <div className="atelier-header-group">
          <Link to="/chats" className="btn btn-sm" title="Quay lại Hội thoại"><ArrowLeft size={13} /> Hội thoại</Link>
          <select aria-label="Chọn dự án nội thất" className="field-select atelier-project-select" value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
            {projects.map((item: any) => <option key={item.project_id} value={item.project_id}>{item.name} (Rev #{item.revision})</option>)}
          </select>
          <span className={`status-badge ${project?.scale_calibrated ? "emerald" : "amber"}`}>
            {project?.scale_calibrated ? "Tỷ lệ 1:1 mm" : "Chờ xác nhận tỷ lệ"}
          </span>
        </div>
        <div className="atelier-header-actions">
          <span className="atelier-estimate" title="Dự toán hiện tại">{formatVND(estimate?.grand_total_vnd)}</span>
          <button type="button" className="btn btn-sm" data-testid="save-scene" onClick={() => void handleSaveScene()} disabled={Boolean(busyMessage)}><Save size={13} /> {busyMessage?.includes("lưu Scene") ? "Đang lưu" : "Lưu Scene"}</button>
          <button type="button" className="btn btn-sm" onClick={() => setRevisionDrawerOpen(true)}><History size={13} /> Rev #{project?.revision || 0}</button>
          <button type="button" className="btn btn-sm" data-testid="export-dxf" onClick={() => void handleExport("dxf")}><Download size={13} /> DXF</button>
          <button type="button" className="btn btn-sm btn-primary" data-testid="export-glb" onClick={() => void handleExport("glb")}><Download size={13} /> GLB</button>
        </div>
      </header>

      <div className="atelier-view-toolbar" role="toolbar" aria-label="Điều khiển không gian thiết kế">
        <div className="segmented-group" aria-label="Chế độ hiển thị">
          {(["split", "2d", "3d"] as const).map((mode) => <button key={mode} type="button" className={`seg-btn ${viewMode === mode ? "active" : ""}`} onClick={() => { setViewMode(mode); if (mode === "2d" && cameraPreset === "walk") setCameraPreset("orbit"); }}>{mode === "split" ? "2D + 3D" : mode.toUpperCase()}</button>)}
        </div>
        <div className="segmented-group" aria-label="Ánh sáng">
          <button type="button" className={`seg-btn ${lightingPreset === "day" ? "active" : ""}`} onClick={() => setLightingPreset("day")}><Sun size={12} /> Ngày</button>
          <button type="button" className={`seg-btn ${lightingPreset === "sunset" ? "active" : ""}`} onClick={() => setLightingPreset("sunset")}><Sunset size={12} /> Hoàng hôn</button>
          <button type="button" className={`seg-btn ${lightingPreset === "night" ? "active" : ""}`} onClick={() => setLightingPreset("night")}><Moon size={12} /> Đêm</button>
        </div>
        <div className="segmented-group" aria-label="Camera">
          {(["orbit", "top", "walk"] as const).map((preset) => <button key={preset} type="button" disabled={viewMode === "2d"} className={`seg-btn ${viewMode !== "2d" && cameraPreset === preset ? "active" : ""}`} onClick={() => setCameraPreset(preset)}>{preset === "orbit" ? "Orbit" : preset === "top" ? "Top" : "Tham quan"}</button>)}
          <button type="button" disabled={viewMode === "2d"} className={`seg-btn ${cutawayEnabled ? "active" : ""}`} onClick={() => setCutawayEnabled((value) => !value)}>Cutaway</button>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "fit" }))} title="Đưa toàn bộ phòng vào khung hình">Fit Room</button>
        <button type="button" className="btn btn-sm" disabled={!selectedEntityId} onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "focus" }))} title="Đưa đối tượng đang chọn vào giữa khung hình"><Focus size={12} /> Focus</button>
        <button type="button" className="btn btn-sm" onClick={() => setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }))} title="Khôi phục camera mặc định"><RotateCcw size={12} /> Reset</button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-testid="replay-delivery"
          disabled={!selectedConstructionObject}
          onClick={() => {
            if (!selectedConstructionObject) return;
            if (viewMode === "2d") setViewMode("3d");
            if (project?.external_scene) {
              window.dispatchEvent(new CustomEvent(commandEvent, { detail: {
                key: constructionKey(project.project_id, project.external_scene.sha256),
                action: "replay", ids: [selectedEntityId],
              }}));
            } else setDeliveryReplayTrigger((value) => value + 1);
          }}
          title="Phát mô phỏng nhân vật mang món đang chọn tới đúng vị trí"
        >
          <PackageOpen size={12} /> Xem thi công
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-testid="open-photoreal-render"
          disabled={!project || viewMode === "2d"}
          onClick={() => {
            const captureAndOpen = () => {
              try {
                const canvas = document.querySelector('[data-testid="viewport-3d-canvas"] canvas') as HTMLCanvasElement | null;
                if (canvas) window.sessionStorage.setItem("atelier.render.preview", canvas.toDataURL("image/jpeg", 0.92));
              } catch {
                // Preview capture is optional; the immutable scene/camera snapshot remains authoritative.
              }
              navigate("../render-compare");
            };
            if (cameraPreset === "top") {
              setCameraPreset("orbit");
              setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
              window.setTimeout(captureAndOpen, 350);
            } else {
              captureAndOpen();
            }
          }}
          title="Kết xuất ảnh chân thực từ đúng Scene và góc camera hiện tại"
        >
          <Aperture size={12} /> Render chân thực
        </button>
        <span className="atelier-toolbar-spacer" />
        <button type="button" className={`btn btn-sm ${inspectorOpen ? "btn-soft" : ""}`} onClick={() => setInspectorOpen((value) => !value)}><Sliders size={12} /> Inspector</button>
        <button type="button" className={`btn btn-sm ${assistantOpen ? "btn-soft" : ""}`} onClick={() => setAssistantOpen((value) => !value)}><MessageCircle size={12} /> AI Copilot</button>
      </div>

      {errorMessage ? <div className="atelier-error-banner" role="alert">{errorMessage}</div> : null}

      <div className="workspace-layout flex-1 min-h-0" style={{ "--inspector-width": `${inspectorWidth}px`, "--assistant-width": `${assistantWidth}px` } as React.CSSProperties}>
        {project ? (
          <>
            <Suspense fallback={<div className="atelier-loading-state">Đang tải Pascal 3D BIM...</div>}>
              <LazyStudioViewport project={project} materialsDb={materialsCatalog} pbrMaterials={pbrMaterials} viewMode={viewMode} cameraPreset={cameraPreset} onCameraPresetChange={setCameraPreset} lightingPreset={lightingPreset} cameraResetTrigger={cameraResetTrigger} deliveryReplayTrigger={deliveryReplayTrigger} cameraCommand={cameraCommand} cutawayEnabled={cutawayEnabled} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} onExternalSceneObjects={setExternalSceneObjects} theme={theme} />
            </Suspense>

            {inspectorOpen ? (
              <div className="dock-column inspector-column">
                <button className="dock-resize-handle" type="button" onPointerDown={(event) => beginResize("inspector", event)} aria-label="Thay đổi chiều rộng Inspector" />
                <ObjectInspector project={project} assetLibrary={assetLibrary} externalSceneObjects={externalSceneObjects} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} onUpdateFurnitureField={handleUpdateFurnitureField} onCommitCanvasPosition={() => void handleSaveScene()} onAssignAsset={handleAssignAsset} onImportAsset={handleImportAssetAndAssign} onOpenAICopilot={() => setAssistantOpen(true)} onRequestSmartFit={handleRequestSmartFit} onRequestPlacementOptions={handleRequestPlacementOptions} onCreatePlacementProposal={handleCreatePlacementProposal} onClose={() => setInspectorOpen(false)} savingScene={Boolean(busyMessage?.includes("lưu"))} />
              </div>
            ) : null}

            {assistantOpen ? (
              <div className="dock-column assistant-column">
                <button className="dock-resize-handle" type="button" onPointerDown={(event) => beginResize("assistant", event)} aria-label="Thay đổi chiều rộng AI Copilot" />
                <AIDesignAssistant project={project} chatHistory={chatHistory} sendingChat={Boolean(busyMessage?.includes("Chief Architect"))} chatInput={chatInput} onChatInputChange={setChatInput} onSendChat={(text) => { const message = (text ?? chatInput).trim(); if (!message) return; void handleSendChat(message); if (!text) setChatInput(""); }} onAnswerQuestion={(questionId, answer) => void handleAnswerQuestion(questionId, answer)} onApproveProposal={(proposalId) => void handleProposalDecision(proposalId, "approve")} onRejectProposal={(proposalId) => void handleProposalDecision(proposalId, "reject")} onUndoLastRevision={() => void handleRestoreRevision(Math.max(1, (project.revision || 1) - 1))} onCloseMobile={() => setAssistantOpen(false)} />
              </div>
            ) : null}
          </>
        ) : <div className="atelier-loading-state">Đang kết nối Pascal SceneGraph...</div>}
      </div>

      <RevisionHistoryDrawer isOpen={revisionDrawerOpen} onClose={() => setRevisionDrawerOpen(false)} project={project ? { ...project, revisions } : project} onRestoreRevision={handleRestoreRevision} />
      {selectedEntity ? <span className="sr-only">Đang chọn {selectedEntity.name || selectedEntity.id}</span> : null}
    </div>
  );
}
