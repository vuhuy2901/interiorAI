import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { StudioProjectChooser } from "./AtelierProjectPicker";
import {
  ArrowLeft,
  Download,
  History,
  Image as ImageIcon,
  MessageCircle,
  Moon,
  PackageOpen,
  Focus,
  RotateCcw,
  Save,
  Sliders,
  Sun,
  Sunset,
  X,
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
    projects, activeProjectId, setActiveProjectId, projectsLoaded, taskScope, showHiddenProjects, setShowHiddenProjects, setProjectHidden, project, estimate,
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const captureRef = useRef<(() => string | null) | null>(null);
  const [galleryRenders, setGalleryRenders] = useState<Array<{ id: string; url?: string | null; view?: string | null; revision: number; kind: string; status: string }>>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [renderingCamera, setRenderingCamera] = useState<string | null>(null);
  const [renderQuality, setRenderQuality] = useState<"preview" | "1080p" | "1440p">("1080p");
  const [previewRender, setPreviewRender] = useState<{ url: string; camera: string } | null>(null);
  const [renderMode, setRenderMode] = useState<"blender" | "ai">("ai");

  // Map viewport camera mode → render preset
  const viewportToRenderCam: Record<string, string> = { orbit: "wide", top: "top", walk: "tour" };
  const selectedRenderCam = viewportToRenderCam[cameraPreset] ?? "tour";
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

  useEffect(() => {
    if (!galleryOpen || !activeProjectId) return;
    setGalleryLoading(true);
    fetch(`/api/v1/projects/${activeProjectId}/render-gallery`)
      .then((r) => (r.ok ? r.json() : { gallery: [] }))
      .then((data: any) => {
        const items: typeof galleryRenders = (Array.isArray(data) ? data : (data?.gallery ?? [])).map((j: any) => ({
          id: j.job_id ?? j.id,
          url: j.render_url ?? j.url ?? null,
          view: j.camera ?? j.view ?? j.camera_id ?? null,
          revision: j.revision ?? 0,
          kind: j.render_kind ?? j.kind ?? "blender",
          status: j.status ?? "COMPLETED",
        }));
        setGalleryRenders(items);
      })
      .catch(() => setGalleryRenders([]))
      .finally(() => setGalleryLoading(false));
  }, [galleryOpen, activeProjectId]);

  const RENDER_QUALITY_MAP: Record<string, { width: number; height: number; samples: number }> = {
    preview: { width: 960, height: 540, samples: 24 },
    "1080p": { width: 1920, height: 1080, samples: 48 },
    "1440p": { width: 2560, height: 1440, samples: 64 },
  };

  const triggerAiRender = (cameraId: string) => {
    if (!activeProjectId || renderingCamera) return;
    setRenderingCamera(cameraId);
    const dataUrl = captureRef.current?.() ?? null;
    const body: Record<string, unknown> = { camera: cameraId, force: true };
    if (dataUrl) body.base_image_data_url = dataUrl;
    fetch(`/api/v1/projects/${activeProjectId}/render/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.cache_hit && data?.image_url) {
          setPreviewRender({ url: data.image_url, camera: cameraId });
          setRenderingCamera(null);
          return;
        }
        const jobId: string | undefined = data?.job_id;
        if (!jobId) { setRenderingCamera(null); return; }
        const poll = setInterval(() => {
          fetch(`/api/v1/render/ai/${jobId}`)
            .then((r) => r.json())
            .then((j: any) => {
              const st = j?.status;
              if (st === "COMPLETED" || st === "FAILED") {
                clearInterval(poll);
                setRenderingCamera(null);
                if (st === "COMPLETED" && j?.image_url) {
                  setPreviewRender({ url: j.image_url, camera: cameraId });
                  setGalleryLoading(true);
                  fetch(`/api/v1/projects/${activeProjectId}/render-gallery`)
                    .then((r) => r.json())
                    .then((d: any) => {
                      setGalleryRenders((Array.isArray(d) ? d : (d?.gallery ?? [])).map((jj: any) => ({
                        id: jj.job_id ?? jj.id, url: jj.render_url ?? jj.url ?? null,
                        view: jj.camera ?? jj.view ?? null, revision: jj.revision ?? 0,
                        kind: jj.render_kind ?? "ai", status: jj.status ?? "COMPLETED",
                      })));
                    })
                    .finally(() => setGalleryLoading(false));
                }
              }
            })
            .catch(() => { clearInterval(poll); setRenderingCamera(null); });
        }, 5000);
      })
      .catch(() => setRenderingCamera(null));
  };

  const triggerQuickRender = (cameraId: string, quality?: string) => {
    if (!activeProjectId || renderingCamera) return;
    const q = quality ?? renderQuality;
    const { width, height, samples } = RENDER_QUALITY_MAP[q] ?? RENDER_QUALITY_MAP["1080p"];
    setRenderingCamera(cameraId);
    fetch(`/api/v1/projects/${activeProjectId}/render-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera_id: cameraId, mode: "final", width_px: width, height_px: height, samples, async_exec: true }),
    })
      .then((r) => r.json())
      .then((data: any) => {
        const jobId: string | undefined = data?.job_id ?? data?.id;
        if (!jobId) return;
        const poll = setInterval(() => {
          fetch(`/api/v1/render-jobs/${jobId}`)
            .then((r) => r.json())
            .then((j: any) => {
              if (j?.status === "COMPLETED" || j?.status === "FAILED") {
                clearInterval(poll);
                setRenderingCamera(null);
                if (j?.status === "COMPLETED" && j?.render_url) {
                  setPreviewRender({ url: j.render_url, camera: cameraId });
                  setGalleryLoading(true);
                  fetch(`/api/v1/projects/${activeProjectId}/render-gallery`)
                    .then((r) => r.json())
                    .then((d: any) => {
                      setGalleryRenders((Array.isArray(d) ? d : (d?.gallery ?? [])).map((jj: any) => ({
                        id: jj.job_id ?? jj.id, url: jj.render_url ?? jj.url ?? null,
                        view: jj.camera ?? jj.view ?? null, revision: jj.revision ?? 0,
                        kind: jj.render_kind ?? "blender", status: jj.status ?? "COMPLETED",
                      })));
                    })
                    .finally(() => setGalleryLoading(false));
                }
              }
            })
            .catch(() => { clearInterval(poll); setRenderingCamera(null); });
        }, 4000);
      })
      .catch(() => setRenderingCamera(null));
  };

  const beginResize = (dock: DockId, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizeOrigin.current = { dock, x: event.clientX, width: dock === "inspector" ? inspectorWidth : assistantWidth };
  };

  const activeProjectMeta = projects.find((item: any) => item.project_id === activeProjectId);
  const selectedEntity =
    project?.furniture_instances?.find((item: any) => item.id === selectedEntityId) ||
    project?.walls?.find((item: any) => item.id === selectedEntityId) || null;
  const linkedIssueIdentifier = new URLSearchParams(location.search).get("issueIdentifier");
  const selectedConstructionObject = project?.external_scene
    ? externalSceneObjects.find((item) => item.id === selectedEntityId)
    : project?.furniture_instances?.find((item: any) => item.id === selectedEntityId);

  // FEAT-2026-131 CR-1: studio độc lập không tự lấy dự án đầu danh sách; chưa có lựa chọn hợp lệ thì hiện màn chọn.
  if (!activeProjectId && !taskScope.scoped && projectsLoaded) {
    return (
      <div className="atelier-surface-root flex h-full w-full flex-col overflow-hidden" data-theme={theme}>
        <StudioProjectChooser projects={projects} onSelect={setActiveProjectId} />
      </div>
    );
  }

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
          <select aria-label="Chọn dự án nội thất" className="field-select atelier-project-select" value={activeProjectId} style={activeProjectMeta?.hidden ? { opacity: 0.5 } : undefined} onChange={(event) => setActiveProjectId(event.target.value)}>
            {projects.map((item: any) => <option key={item.project_id} value={item.project_id}>{item.name} (Rev #{item.revision}){item.hidden ? " — đã ẩn" : ""}</option>)}
          </select>
          <label className="text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={showHiddenProjects} onChange={(event) => setShowHiddenProjects(event.target.checked)} />
            Hiện dự án đã ẩn
          </label>
          {activeProjectMeta?.hidden ? (
            <button type="button" className="btn btn-sm" onClick={() => void setProjectHidden(activeProjectId, false)}>Bật lại</button>
          ) : activeProjectMeta ? (
            <button type="button" className="btn btn-sm" onClick={() => void setProjectHidden(activeProjectId, true)}>Ẩn</button>
          ) : null}
          <span className={`status-badge ${project?.scale_calibrated ? "emerald" : "amber"}`}>
            {project?.scale_calibrated ? "Tỷ lệ 1:1 mm" : "Chờ xác nhận tỷ lệ"}
          </span>
        </div>
        <div className="atelier-header-actions">
          <span className="atelier-estimate" title="Dự toán phần có giá, gồm giá tham khảo">{estimate?.total_is_complete === false ? 'Tạm tính: ' : ''}{estimate?.priced_line_count === 0 ? 'Chưa có giá' : formatVND(estimate?.total_vnd)}</span>
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
          className={`btn btn-sm ${galleryOpen ? "btn-soft ring-1 ring-primary/40" : ""}`}
          disabled={!project}
          onClick={() => setGalleryOpen((v) => !v)}
          title="Xem ảnh render của dự án (toggle panel)"
        >
          <ImageIcon size={12} /> Ảnh render
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
              <LazyStudioViewport project={project} materialsDb={materialsCatalog} pbrMaterials={pbrMaterials} viewMode={viewMode} cameraPreset={cameraPreset} onCameraPresetChange={setCameraPreset} lightingPreset={lightingPreset} cameraResetTrigger={cameraResetTrigger} deliveryReplayTrigger={deliveryReplayTrigger} cameraCommand={cameraCommand} cutawayEnabled={cutawayEnabled} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} onExternalSceneObjects={setExternalSceneObjects} theme={theme} captureRef={captureRef} />
            </Suspense>

            {inspectorOpen ? (
              <div className="dock-column inspector-column">
                <button className="dock-resize-handle" type="button" onPointerDown={(event) => beginResize("inspector", event)} aria-label="Thay đổi chiều rộng Inspector" />
                <ObjectInspector project={project} assetLibrary={assetLibrary} externalSceneObjects={externalSceneObjects} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} onUpdateFurnitureField={handleUpdateFurnitureField} onCommitCanvasPosition={() => void handleSaveScene()} onAssignAsset={handleAssignAsset} onImportAsset={handleImportAssetAndAssign} onRequestSmartFit={handleRequestSmartFit} onRequestPlacementOptions={handleRequestPlacementOptions} onCreatePlacementProposal={handleCreatePlacementProposal} onClose={() => setInspectorOpen(false)} savingScene={Boolean(busyMessage?.includes("lưu"))} />
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

      {galleryOpen && (
        <div className="shrink-0 border-t border-border bg-muted/30" style={{ height: "192px" }}>
          {/* Render panel header */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 flex-wrap">
            <span className="text-xs font-semibold text-foreground shrink-0">Render</span>
            {/* Camera badge: linked to viewport mode */}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
              {selectedRenderCam === "tour" ? "Tham quan" : selectedRenderCam === "wide" ? "Góc rộng" : selectedRenderCam === "top" ? "Nhìn trên" : "Eye-level"}
              {" "}({cameraPreset})
            </span>
            {/* Mode: AI Generate vs Blender 3D */}
            <div className="flex items-center gap-1">
              {(["ai", "blender"] as const).map((m) => (
                <button key={m} type="button"
                  className={`btn btn-xs ${renderMode === m ? "btn-primary" : ""}`}
                  onClick={() => setRenderMode(m)}
                  title={m === "ai" ? "AI sinh ảnh đẹp từ brief dự án" : "Blender Cycles 3D render"}
                >
                  {m === "ai" ? "AI Gen" : "3D"}
                </button>
              ))}
            </div>
            {/* Quality: only for Blender mode */}
            {renderMode === "blender" && (
              <div className="flex items-center gap-1">
                {(["preview", "1080p", "1440p"] as const).map((q) => (
                  <button key={q} type="button"
                    className={`btn btn-xs ${renderQuality === q ? "btn-primary" : ""}`}
                    onClick={() => setRenderQuality(q)}
                  >
                    {q === "preview" ? "Thử" : q}
                  </button>
                ))}
              </div>
            )}
            {/* Main render button */}
            <button
              type="button"
              disabled={!!renderingCamera}
              className={`btn btn-sm btn-primary ${renderingCamera ? "opacity-60" : ""}`}
              onClick={() => renderMode === "ai" ? triggerAiRender(selectedRenderCam) : triggerQuickRender(selectedRenderCam)}
            >
              {renderingCamera ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" />
                  {renderMode === "ai" ? "AI đang gen..." : "Đang render..."}
                </span>
              ) : renderMode === "ai" ? "AI Gen" : "Render 3D"}
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <button type="button" className="btn btn-xs" onClick={() => navigate("../render-gallery")}>Xem tất cả →</button>
              <button type="button" className="btn btn-xs" onClick={() => setGalleryOpen(false)} aria-label="Đóng"><X size={11} /></button>
            </div>
          </div>
          {/* Panel body: latest render preview (left) + gallery strip (right) */}
          <div className="flex h-[148px] gap-2 px-2 py-1.5 overflow-hidden">
            {/* Latest render preview */}
            <div className="shrink-0 w-[196px] h-full rounded-md overflow-hidden border border-border bg-muted/40 flex items-center justify-center relative">
              {renderingCamera ? (
                <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span>Đang render {renderQuality}...</span>
                </div>
              ) : previewRender?.url ? (
                <a href={previewRender.url} target="_blank" rel="noreferrer" className="block w-full h-full">
                  <img src={previewRender.url} alt="latest render" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/50 text-white text-center py-0.5 truncate px-1">
                    {previewRender.camera}
                  </span>
                </a>
              ) : galleryRenders.filter(r => r.url).length > 0 ? (
                <a href={galleryRenders.filter(r => r.url)[0].url ?? "#"} target="_blank" rel="noreferrer" className="block w-full h-full">
                  <img src={galleryRenders.filter(r => r.url)[0].url ?? ""} alt="latest render" className="w-full h-full object-cover" />
                </a>
              ) : (
                <span className="text-[10px] text-muted-foreground text-center px-2">Nhấn Render để tạo ảnh</span>
              )}
            </div>
            {/* Gallery strip */}
            <div className="flex-1 flex items-center overflow-x-auto gap-2 py-0.5">
              {galleryLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Đang tải...
                </div>
              ) : galleryRenders.filter((r) => r.url).length === 0 ? (
                <span className="text-[10px] text-muted-foreground">Chưa có ảnh render</span>
              ) : (
                galleryRenders.filter((r) => r.url).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="shrink-0 flex flex-col items-center gap-0.5 rounded-md overflow-hidden border border-border hover:border-primary/60 transition-colors focus:outline-none"
                    style={{ width: "104px" }}
                    title={`${r.view || r.kind} · Rev #${r.revision}`}
                    onClick={() => setPreviewRender({ url: r.url ?? "", camera: r.view ?? r.kind })}
                  >
                    <img src={r.url ?? ""} alt={r.view || "render"} className="h-[100px] w-full object-cover" loading="lazy" />
                    <span className="text-[9px] text-muted-foreground pb-0.5 px-1 truncate w-full text-center">
                      {r.view || r.kind} · Rev #{r.revision}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <RevisionHistoryDrawer isOpen={revisionDrawerOpen} onClose={() => setRevisionDrawerOpen(false)} project={project ? { ...project, revisions } : project} onRestoreRevision={handleRestoreRevision} />
      {selectedEntity ? <span className="sr-only">Đang chọn {selectedEntity.name || selectedEntity.id}</span> : null}
    </div>
  );
}
