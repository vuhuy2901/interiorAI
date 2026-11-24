import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Image as ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import { formatElapsed } from "./photorealRender";

const API_BASE = "/api/v1";

type AgentJob = {
  job_id: string;
  status: string;
  revision?: number;
  scene_id?: string;
  render_url?: string | null;
  download_url?: string | null;
  error?: string | null;
  elapsed_s?: number;
  plan?: { camera?: { preset_name?: string }; quality?: { preset?: string; width_px?: number; height_px?: number } };
  quality_report?: { passed?: boolean; issues?: string[] } | null;
};

type Plan = {
  status?: string;
  blocking_issues?: string[];
  plan?: { camera?: { preset_name?: string }; quality?: { width_px?: number; height_px?: number } };
};

const CAMERA_OPTIONS = [
  ["hero", "Hero View"], ["wide", "Wide Interior"], ["corner", "Corner View"],
  ["detail", "Detail View"], ["top_down", "Top-Down View"], ["isometric", "Isometric View"],
] as const;
const LIGHTING_OPTIONS = [
  ["daylight", "Natural Daylight"], ["evening", "Warm Evening"], ["luxury", "Luxury Interior"],
  ["studio", "Studio Architectural"], ["soft_minimalist", "Soft Minimalist"],
] as const;
const QUALITY_OPTIONS = [["draft", "Draft · 960×540"], ["standard", "Standard · 1920×1080"], ["high", "High · 2560×1440"], ["ultra", "Ultra · 3840×2160"]] as const;

function apiError(payload: any, fallback: string) {
  return String(payload?.detail || payload?.message || fallback);
}

function activeStatus(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}

export function AtelierPhotorealRenderPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { project } = useAtelierStudio();
  const [job, setJob] = useState<AgentJob | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [camera, setCamera] = useState("hero");
  const [lighting, setLighting] = useState("daylight");
  const [quality, setQuality] = useState("standard");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Thiết kế Nội thất" }, { label: "Render Studio" }]);
  }, [setBreadcrumbs]);

  const loadPlan = useCallback(async () => {
    if (!project?.project_id) return;
    try {
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/render/agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_preset: camera, lighting_preset: lighting, quality_preset: quality }),
      });
      const payload = await response.json();
      setPlan(response.ok ? payload : { status: "ERROR", blocking_issues: [apiError(payload, "Không lập được render plan")] });
    } catch (reason) {
      setPlan({ status: "ERROR", blocking_issues: [reason instanceof Error ? reason.message : "Không lập được render plan"] });
    }
  }, [camera, lighting, project?.project_id, quality]);

  useEffect(() => { void loadPlan(); }, [loadPlan, project?.revision]);

  useEffect(() => {
    if (!job?.job_id || !activeStatus(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/render/agent/${job.job_id}`);
        if (response.ok) setJob(await response.json());
      } catch {
        // Preserve the last real job state during a transient network failure.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.job_id, job?.status]);

  const startRender = useCallback(async () => {
    if (!project?.project_id || plan?.status !== "READY") return;
    setStarting(true);
    setError("");
    setJob(null);
    try {
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/render/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_preset: camera, lighting_preset: lighting, quality_preset: quality }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiError(payload, "Không tạo được render job"));
      const current = await fetch(`${API_BASE}/render/agent/${payload.job_id}`);
      setJob(current.ok ? await current.json() : payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tạo được render job");
    } finally {
      setStarting(false);
    }
  }, [camera, lighting, plan?.status, project?.project_id, quality]);

  const active = starting || activeStatus(job?.status);
  const completed = job?.status === "COMPLETED" && Boolean(job.render_url);
  const qaPassed = job?.quality_report?.passed !== false;

  return (
    <div className="photoreal-page">
      <header className="photoreal-topbar">
        <Link to="/design-studio" className="photoreal-icon-button photoreal-back"><ArrowLeft size={18} /> <span>Quay lại thiết kế</span></Link>
        <div className="photoreal-title"><strong>{project?.name || "Không gian nội thất"}</strong><span>Render Studio · Architectural Visualization Agent · Rev #{project?.revision || 0}</span></div>
        <a className={`photoreal-icon-button ${completed ? "" : "is-disabled"}`} href={job?.download_url || job?.render_url || undefined} download onClick={(event) => { if (!completed) event.preventDefault(); }}><Download size={17} /> <span>Tải ảnh</span></a>
      </header>

      <main className="photoreal-stage">
        {completed ? (
          <div className="photoreal-image-scroll"><img src={job.render_url || undefined} alt="Ảnh render từ canonical scene" className="photoreal-result-image" /></div>
        ) : (
          <div className="photoreal-empty"><div className="photoreal-empty-icon"><ImageIcon size={30} /></div><strong>{active ? "Render Agent đang xử lý" : "Sẵn sàng render từ Scene 3D"}</strong><p>{active ? "Đang dựng ảnh từ geometry, vật liệu và revision hiện tại." : "Agent sẽ kiểm tra SceneGraph, khóa camera/ánh sáng rồi chạy render thật."}</p></div>
        )}

        {active ? <div className="photoreal-processing" role="status"><LoaderCircle className="spin" size={22} /><div><strong>{job?.status === "RUNNING" ? "Đang kết xuất ảnh" : "Đang xếp hàng"}</strong><span>Đã chạy {formatElapsed(job?.elapsed_s)} · Không thay đổi SceneGraph.</span></div></div> : null}

        <section className="photoreal-controls is-open"><div className="photoreal-controls-body">
          <div className="photoreal-engine-state"><span className={`photoreal-status-dot ${plan?.status === "READY" ? "is-ready" : ""}`} /><div><strong>Architectural Visualization &amp; Rendering Agent</strong><span>{plan?.status === "READY" ? `Scene #${project?.project_id} · Rev #${project?.revision} đã qua geometry QA` : "Đang kiểm tra canonical scene…"}</span></div></div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs">Góc camera<select className="input mt-1 w-full" value={camera} onChange={(event) => setCamera(event.target.value)} disabled={active}>{CAMERA_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs">Ánh sáng<select className="input mt-1 w-full" value={lighting} onChange={(event) => setLighting(event.target.value)} disabled={active}>{LIGHTING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs">Chất lượng<select className="input mt-1 w-full" value={quality} onChange={(event) => setQuality(event.target.value)} disabled={active}>{QUALITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Camera: {plan?.plan?.camera?.preset_name || "—"}</span><span>·</span><span>{plan?.plan?.quality?.width_px || "—"}×{plan?.plan?.quality?.height_px || "—"}</span><span>·</span><span>Renderer: Cycles</span></div>
          <button type="button" className="photoreal-render-button photoreal-ai-button" onClick={() => void startRender()} disabled={active || starting || !project || plan?.status !== "READY"}>{active ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{active ? "Đang render" : "Render Scene hiện tại"}</button>
          {plan?.blocking_issues?.length ? <div className="photoreal-error" role="alert"><span>{plan.blocking_issues.slice(0, 2).join(" · ")}</span><button type="button" onClick={() => void loadPlan()} disabled={active}><RefreshCw size={14} /> Kiểm tra lại</button></div> : null}
          {error ? <div className="photoreal-error" role="alert"><span>{error}</span><button type="button" onClick={() => void startRender()} disabled={active}><RefreshCw size={14} /> Thử lại</button></div> : null}
          {job?.status === "FAILED" || job?.status === "BLOCKED" ? <div className="photoreal-error" role="alert"><span>{job.error || "Render không hoàn tất"}</span><button type="button" onClick={() => void startRender()} disabled={active}><RefreshCw size={14} /> Thử lại</button></div> : null}
          {completed ? <div className={`photoreal-success ${qaPassed ? "" : "photoreal-error"}`}>{qaPassed ? "Ảnh render hoàn tất · đã kiểm tra file và độ sáng." : `QA ảnh chưa đạt: ${(job.quality_report?.issues || []).join(" · ")}`}</div> : null}
        </div></section>
      </main>
    </div>
  );
}
