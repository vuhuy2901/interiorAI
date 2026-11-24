import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronUp, Download, Expand, Image as ImageIcon,
  LoaderCircle, Maximize2, Minus, Plus, RefreshCw, Sparkles,
} from "lucide-react";
import { useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import {
  buildRenderPayload, isRenderActive, readCurrentCameraSnapshot,
  RENDER_QUALITIES, RENDER_RESOLUTIONS, renderStatusText,
  type RenderQualityId, type RenderResolutionId,
} from "./photorealRender";

const API_BASE = "/api/v1";

type RenderJob = {
  job_id: string;
  project_id: string;
  revision: number;
  status: string;
  camera_id?: string;
  camera_snapshot?: Record<string, unknown> | null;
  mode?: string;
  resolution?: [number, number];
  render_url?: string;
  image_url?: string;
  download_url?: string;
  error_message?: string | null;
  error_code?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

function apiError(body: any, fallback: string) {
  return String(body?.detail || body?.error_message || body?.message || fallback);
}

async function renderWebglPreview(sourceUrl: string, width: number, height: number): Promise<string> {
  const source = new Image();
  source.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    source.onload = () => resolve();
    source.onerror = () => reject(new Error("Không đọc được ảnh xem trước từ Scene 3D"));
    source.src = sourceUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không hỗ trợ xuất ảnh Canvas");
  // Cover the output instead of letterboxing it. The previous contain strategy
  // introduced dark bands that users reasonably interpreted as broken walls.
  const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
  const drawWidth = source.naturalWidth * scale;
  const drawHeight = source.naturalHeight * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas.toDataURL("image/png");
}

export function AtelierPhotorealRenderPage() {
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { project, cameraPreset, lightingPreset } = useAtelierStudio();
  const stageRef = useRef<HTMLDivElement>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [job, setJob] = useState<RenderJob | null>(null);
  const [camera, setCamera] = useState("wide");
  const [resolution, setResolution] = useState<RenderResolutionId>("full-hd");
  const [quality, setQuality] = useState<RenderQualityId>("high");
  const [controlsOpen, setControlsOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fallbackResult, setFallbackResult] = useState("");
  const [fallbackRendering, setFallbackRendering] = useState(false);
  const [cameraPreview] = useState(() => {
    try { return window.sessionStorage.getItem("atelier.render.preview") || ""; }
    catch { return ""; }
  });
  const blenderAvailable = Boolean(capabilities?.available);
  const fallbackAvailable = Boolean(cameraPreview);

  useEffect(() => {
    setBreadcrumbs([{ label: "Thiết kế Nội thất" }, { label: "Render chân thực" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/render/capabilities`);
        const body = await response.json();
        if (!response.ok) throw new Error(apiError(body, "Không kiểm tra được Blender"));
        if (!cancelled) setCapabilities(body);
      } catch (reason) {
        if (!cancelled) setCapabilityError(reason instanceof Error ? reason.message : "Không kết nối được API render");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (capabilities && !capabilities.available) setCamera("current_view");
  }, [capabilities]);

  useEffect(() => {
    if (!project?.project_id) return;
    let cancelled = false;
    const loadLatest = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects/${project.project_id}/render-gallery`);
        const body = await response.json();
        const latest = body?.gallery?.[0];
        if (!cancelled && response.ok && latest) {
          setJob(latest);
          setCamera(latest.camera_snapshot ? "current_view" : (latest.camera_id || "wide"));
        }
      } catch {
        // Gallery is optional; capability and render errors are shown separately.
      }
    };
    void loadLatest();
    return () => { cancelled = true; };
  }, [project?.project_id]);

  useEffect(() => {
    if (!job?.job_id || !isRenderActive(job.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/render-jobs/${job.job_id}`);
        const body = await response.json();
        if (!cancelled && response.ok) setJob(body);
      } catch {
        // A temporary polling error must not destroy the active job state.
      }
    }, 1800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [job?.job_id, job?.status]);

  const submitRender = useCallback(async () => {
    if (!project?.project_id) return;
    setSubmitting(true);
    setError("");
    try {
      if (!blenderAvailable) {
        if (!cameraPreview) throw new Error("Hãy quay lại thiết kế 3D, chọn góc nhìn rồi mở Render chân thực lại.");
        if (camera !== "current_view") {
          throw new Error("WebGL fallback chỉ xuất được góc đã xem trước. Hãy chọn “Góc nhìn đang chọn”, hoặc bật Blender Cycles để dựng camera nội thất tầm mắt.");
        }
        setFallbackRendering(true);
        const selectedResolution = RENDER_RESOLUTIONS.find((item) => item.id === resolution) ?? RENDER_RESOLUTIONS[1];
        setFallbackResult(await renderWebglPreview(cameraPreview, selectedResolution.width, selectedResolution.height));
        setZoom(1);
        return;
      }
      const currentCamera = camera === "current_view" ? readCurrentCameraSnapshot() : null;
      if (camera === "current_view" && !currentCamera) {
        throw new Error("Không còn dữ liệu góc nhìn hiện tại. Hãy quay lại thiết kế, chọn góc camera rồi mở Render chân thực lại.");
      }
      const payload = buildRenderPayload({
        revision: Number(project.revision || 1),
        camera: camera === "current_view" ? cameraPreset : camera,
        lighting: lightingPreset,
        resolution,
        quality,
        cameraSnapshot: currentCamera,
      });
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/render-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Không thể tạo tác vụ render"));
      setJob(body);
      setZoom(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo tác vụ render");
    } finally {
      setFallbackRendering(false);
      setSubmitting(false);
    }
  }, [blenderAvailable, camera, cameraPreset, cameraPreview, lightingPreset, project, quality, resolution]);

  const retryRender = useCallback(async () => {
    if (!job?.job_id) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/render-jobs/${job.job_id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ async_exec: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Không thể thử lại render"));
      setJob(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể thử lại render");
    } finally {
      setSubmitting(false);
    }
  }, [job?.job_id]);

  const imageUrl = fallbackResult || job?.image_url || job?.render_url;
  const active = submitting || fallbackRendering || isRenderActive(job?.status);
  const engineReason = capabilityError || capabilities?.reason || capabilities?.message;

  return (
    <div className="photoreal-page">
      <header className="photoreal-topbar">
        <button type="button" className="photoreal-icon-button photoreal-back" onClick={() => navigate("../design-studio")}>
          <ArrowLeft size={18} /> <span>Quay lại thiết kế</span>
        </button>
        <div className="photoreal-title">
          <strong>{project?.name || "Không gian nội thất"}</strong>
          <span>{camera === "current_view" ? "Góc nhìn hiện tại" : camera} · Rev #{project?.revision || 0}</span>
        </div>
        <a
          className={`photoreal-icon-button ${imageUrl ? "" : "is-disabled"}`}
          href={fallbackResult || job?.download_url || (job?.job_id ? `${API_BASE}/render-jobs/${job.job_id}/download` : undefined)}
          download={fallbackResult ? `atelier-render-rev-${project?.revision || 0}.png` : true}
          aria-disabled={!imageUrl}
          onClick={(event) => {
            if (!imageUrl) event.preventDefault();
            else if (fallbackResult) event.currentTarget.href = fallbackResult;
          }}
        >
          <Download size={17} /> <span>Tải ảnh</span>
        </a>
      </header>

      <main ref={stageRef} className="photoreal-stage">
        {imageUrl ? (
          <div className="photoreal-image-scroll">
            <img
              src={imageUrl}
              alt={`Ảnh render chân thực ${project?.name || "căn phòng"}`}
              style={{ transform: `scale(${zoom})` }}
              className="photoreal-result-image"
            />
          </div>
        ) : camera === "current_view" && cameraPreview ? (
          <div className="photoreal-image-scroll photoreal-preview-wrap">
            <img src={cameraPreview} alt="Xem trước góc camera từ thiết kế 3D" className="photoreal-result-image photoreal-preview-image" />
            <span className="photoreal-preview-badge">Xem trước WebGL · ảnh cuối dùng Blender Cycles</span>
          </div>
        ) : (
          <div className="photoreal-empty">
            <div className="photoreal-empty-icon"><ImageIcon size={30} /></div>
            <strong>Render thiết kế đã chốt thành ảnh chân thực</strong>
            <p>Blender Cycles sẽ dùng đúng revision, camera, hình học, nội thất và dữ liệu PBR hiện tại.</p>
          </div>
        )}

        {active ? (
          <div className="photoreal-processing" role="status">
            <LoaderCircle className="spin" size={22} />
            <div>
              <strong>{fallbackRendering ? "Đang xuất ảnh WebGL/HDRI" : renderStatusText(job?.status || "QUEUED")}</strong>
              <span>{fallbackRendering ? "Đang tạo tệp PNG theo đúng độ phân giải đã chọn." : "Không ước lượng phần trăm khi Blender chưa cung cấp dữ liệu đáng tin cậy."}</span>
            </div>
          </div>
        ) : null}

        <div className="photoreal-zoom-tools" aria-label="Điều khiển ảnh">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} title="Thu nhỏ"><Minus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.1))} title="Phóng to"><Plus size={16} /></button>
          <button type="button" onClick={() => setZoom(1)} title="Vừa khung"><Expand size={16} /></button>
          <button type="button" onClick={() => void stageRef.current?.requestFullscreen()} title="Toàn màn hình"><Maximize2 size={16} /></button>
        </div>

        <section className={`photoreal-controls ${controlsOpen ? "is-open" : "is-collapsed"}`}>
          <button type="button" className="photoreal-controls-toggle" onClick={() => setControlsOpen((value) => !value)}>
            {controlsOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
            {controlsOpen ? "Thu gọn bảng render" : "Mở bảng render"}
          </button>
          {controlsOpen ? (
            <div className="photoreal-controls-body">
              <label>
                <span>Góc camera</span>
                <select
                  value={camera}
                  onChange={(event) => {
                    setCamera(event.target.value);
                    // A completed image belongs to one immutable camera job.
                    // Never display it under another camera selection.
                    setJob(null);
                    setFallbackResult("");
                    setError("");
                    setZoom(1);
                  }}
                  disabled={active || !blenderAvailable}
                >
                  <option value="wide">Góc rộng toàn phòng (khuyến nghị)</option>
                  <option value="eye_level">Tầm mắt tập trung nội thất</option>
                  <option value="current_view">Góc nhìn đang chọn</option>
                  <option value="corner">Góc phòng</option>
                  <option value="top">Nhìn từ trên</option>
                </select>
              </label>
              <label>
                <span>Độ phân giải</span>
                <select value={resolution} onChange={(event) => setResolution(event.target.value as RenderResolutionId)} disabled={active}>
                  {RENDER_RESOLUTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>Mức chất lượng</span>
                <select value={quality} onChange={(event) => setQuality(event.target.value as RenderQualityId)} disabled={active || !blenderAvailable}>
                  {RENDER_QUALITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="photoreal-engine-state">
                <span className={`photoreal-status-dot ${blenderAvailable || fallbackAvailable ? "is-ready" : ""}`} />
                <div>
                  <strong>{blenderAvailable ? "Blender Cycles sẵn sàng" : fallbackAvailable ? "WebGL HDRI fallback sẵn sàng" : capabilities ? "Chưa kết nối bộ máy render" : "Đang kiểm tra bộ máy render"}</strong>
                  <span>{blenderAvailable ? "Snapshot khóa đúng revision trước khi gửi" : fallbackAvailable ? "Xuất đúng khung camera hiện tại; Blender đang bị Windows Application Control chặn" : engineReason || "Vui lòng chờ kiểm tra cấu hình máy chủ"}</span>
                  {blenderAvailable ? (
                    <span>
                      AI enhancement: {capabilities?.ai_enhancement?.available
                        ? "ComfyUI + workflow đã kết nối"
                        : `chưa kết nối (${capabilities?.ai_enhancement?.message || "thiếu cấu hình"})`}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="photoreal-render-button"
                onClick={() => void submitRender()}
                disabled={active || (!blenderAvailable && !fallbackAvailable) || !project}
              >
                {active ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                {active ? "Đang render" : blenderAvailable ? "Render ảnh" : "Xuất ảnh WebGL"}
              </button>
            </div>
          ) : null}
          {(error || (job && ["FAILED", "BLOCKED", "CANCELLED"].includes(job.status))) ? (
            <div className="photoreal-error" role="alert">
              <span>{error || job?.error_message || renderStatusText(job?.status)}</span>
              {job?.job_id ? <button type="button" onClick={() => void retryRender()} disabled={submitting}><RefreshCw size={14} /> Thử lại</button> : null}
            </div>
          ) : null}
          {fallbackResult ? (
            <div className="photoreal-success">Đã xuất ảnh WebGL/HDRI từ đúng góc camera hiện tại · {RENDER_RESOLUTIONS.find((item) => item.id === resolution)?.label}</div>
          ) : job?.status === "COMPLETED" ? (
            <div className="photoreal-success">Ảnh hoàn tất từ revision #{job.revision} · {job.resolution?.join(" × ") || "đúng độ phân giải đã chọn"}</div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
