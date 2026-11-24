import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Image as ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import { formatElapsed } from "./photorealRender";

const API_BASE = "/api/v1";

type GalleryItem = {
  id: string;
  kind: "agent" | "ai";
  view?: string | null;
  camera?: string | null;
  revision: number;
  brief_hash?: string | null;
  created_at?: string | null;
  url?: string | null;
  base_url?: string | null;
  status: string;
  is_cover: boolean;
};

type AgentJob = { job_id: string; status: string; elapsed_s?: number; render_url?: string | null; error?: string | null };

function errorText(payload: any, fallback: string) {
  return String(payload?.detail || payload?.message || fallback);
}

function viewLabel(item: GalleryItem) {
  return ({ hero: "Hero", entrance: "Entrance", isometric: "Isometric", orbit: "Orbit", wide: "Wide", eye_level: "Eye level" } as Record<string, string>)[item.view || ""] || item.view || item.camera || "Góc mặc định";
}

function active(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}

export function AtelierRenderGalleryPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { project } = useAtelierStudio();
  const [renders, setRenders] = useState<GalleryItem[]>([]);
  const [revision, setRevision] = useState("all");
  const [briefHash, setBriefHash] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [job, setJob] = useState<AgentJob | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setBreadcrumbs([{ label: "Thiết kế Nội thất" }, { label: "Render Gallery" }]); }, [setBreadcrumbs]);

  const loadGallery = useCallback(async () => {
    if (!project?.project_id) return;
    const params = new URLSearchParams();
    if (revision !== "all") params.set("revision", revision);
    try {
      const [rendersResponse, briefResponse] = await Promise.all([
        fetch(`${API_BASE}/projects/${project.project_id}/renders?${params.toString()}`),
        fetch(`${API_BASE}/projects/${project.project_id}/render-brief`),
      ]);
      const payload = await rendersResponse.json();
      if (!rendersResponse.ok) throw new Error(errorText(payload, "Không tải được gallery render"));
      setRenders((Array.isArray(payload.renders) ? payload.renders : []).filter((item: GalleryItem) => item.kind === "agent" || item.kind === "ai"));
      if (briefResponse.ok) setBriefHash((await briefResponse.json()).brief_hash || null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được gallery render");
    }
  }, [project?.project_id, revision]);

  useEffect(() => { void loadGallery(); }, [loadGallery]);
  useEffect(() => { if (!selectedId || !renders.some((item) => item.id === selectedId)) setSelectedId(renders[0]?.id || null); }, [renders, selectedId]);

  useEffect(() => {
    if (!job?.job_id || !active(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_BASE}/render/agent/${job.job_id}`);
      if (response.ok) {
        const next = await response.json();
        setJob(next);
        if (!active(next.status)) void loadGallery();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.job_id, job?.status, loadGallery]);

  const selected = useMemo(() => renders.find((item) => item.id === selectedId) || null, [renders, selectedId]);
  const stale = Boolean(selected && (selected.revision !== Number(project?.revision) || (selected.brief_hash && briefHash && selected.brief_hash !== briefHash)));
  const jobActive = Boolean(job && active(job.status));

  const startAgent = useCallback(async () => {
    if (!project?.project_id) return;
    setBusy("Đang lập plan và tạo render job…");
    setError("");
    try {
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/render/agent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_preset: "hero", lighting_preset: "daylight", quality_preset: "standard", force: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorText(payload, "Không tạo được render-agent job"));
      setJob(payload);
      const current = await fetch(`${API_BASE}/render/agent/${payload.job_id}`);
      if (current.ok) setJob(await current.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tạo được render-agent job");
    } finally { setBusy(""); }
  }, [project?.project_id]);

  const setCover = useCallback(async () => {
    if (!project?.project_id || !selected) return;
    setBusy("Đang đặt ảnh bìa…");
    try {
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/renders/${selected.id}/cover`, { method: "PUT" });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorText(payload, "Không đặt được ảnh bìa"));
      await loadGallery();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không đặt được ảnh bìa"); }
    finally { setBusy(""); }
  }, [loadGallery, project?.project_id, selected]);

  return (
    <div className="atelier-surface-root flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="atelier-studio-header flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2"><Link to="/design-studio" className="btn btn-sm shrink-0"><ArrowLeft size={14} /><span className="hidden sm:inline">Thiết kế 3D</span></Link><div className="flex min-w-0 items-center gap-2"><ImageIcon size={17} className="text-primary" /><strong className="truncate text-sm">Render Gallery</strong></div><span className="text-xs text-muted-foreground">{project?.name || "Chưa chọn dự án"} · Rev #{project?.revision || "—"}</span></div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs text-primary">Render Agent · ảnh từ Scene thật</span><select className="input h-8 text-xs" value={revision} onChange={(event) => setRevision(event.target.value)} aria-label="Lọc revision"><option value="all">Mọi revision</option>{Array.from(new Set(renders.map((item) => item.revision))).map((value) => <option key={value} value={value}>Rev #{value}</option>)}</select><button type="button" className="btn btn-sm btn-ghost" onClick={() => void loadGallery()} title="Tải lại gallery"><RefreshCw size={14} /></button></div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-xs text-muted-foreground">Ảnh được gắn với scene ID, revision, camera và quality report.</div><button type="button" className="btn btn-sm btn-primary gap-1.5" onClick={() => void startAgent()} disabled={!project || jobActive || Boolean(busy)}><Sparkles size={14} />{jobActive ? "Agent đang render…" : "Render lại Scene"}</button></div>
        {busy ? <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary"><LoaderCircle className="spin" size={15} />{busy}{job?.elapsed_s ? ` · ${formatElapsed(job.elapsed_s)}` : ""}</div> : null}
        {error ? <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" role="alert">{error}</div> : null}
        {selected && active(selected.status) ? <div className="mb-3 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs">Render Agent đang chạy…</div> : null}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 rounded-lg border border-border bg-card p-2 sm:p-3">{selected?.url ? <div className="space-y-2"><div className="relative overflow-hidden rounded-md bg-muted">{selected.kind === "ai" && selected.base_url ? <div className="relative aspect-video overflow-hidden"><img src={selected.base_url} alt="Ảnh preview WebGL" className="absolute inset-0 h-full w-full object-contain" /><div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><img src={selected.url} alt="Ảnh AI Codex" className="h-full w-full object-contain" /></div><div className="absolute inset-y-0 border-l-2 border-primary" style={{ left: `${split}%` }} /></div> : <img src={selected.url} alt={`Ảnh render ${viewLabel(selected)}`} className="max-h-[70vh] w-full object-contain" />}</div>{selected.kind === "ai" && selected.base_url ? <label className="flex items-center gap-2 text-xs text-muted-foreground">Preview <input type="range" min="0" max="100" value={split} onChange={(event) => setSplit(Number(event.target.value))} className="flex-1" /> AI</label> : null}{stale ? <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">Ảnh thuộc revision/brief cũ; cần render lại để khớp Scene hiện tại.</div> : null}</div> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ImageIcon size={28} /><span>Chưa có ảnh Render Agent hoàn tất.</span></div>}</section>
          <aside className="space-y-3">{selected ? <div className="rounded-lg border border-border bg-card p-3 text-xs"><div className="mb-2 flex items-center justify-between"><span className="rounded-full bg-muted px-2 py-1 font-semibold">{selected.kind === "ai" ? "AI enhancement" : "Render Agent"}</span>{selected.is_cover ? <span className="flex items-center gap-1 text-primary"><Check size={13} /> Ảnh bìa</span> : null}</div><div className="space-y-1 text-muted-foreground"><div>View: <span className="text-foreground">{viewLabel(selected)}</span></div><div>Revision: <span className="text-foreground">#{selected.revision}</span></div><div>Trạng thái: <span className="text-foreground">{selected.status}</span></div><div>Thời gian: <span className="text-foreground">{selected.created_at ? new Date(selected.created_at).toLocaleString("vi-VN") : "—"}</span></div></div><div className="mt-3 flex flex-wrap gap-1.5"><a className="btn btn-sm btn-ghost gap-1" href={selected.url || undefined} download><Download size={13} /> Tải ảnh</a><button type="button" className="btn btn-sm btn-primary" onClick={() => void setCover()} disabled={selected.is_cover || Boolean(busy)}>Đặt làm ảnh bìa</button></div></div> : null}<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{renders.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`group overflow-hidden rounded-lg border text-left transition ${item.id === selectedId ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/60"}`}><div className="aspect-video bg-muted">{item.url ? <img src={item.url} alt={viewLabel(item)} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{item.status}</div>}</div><div className="space-y-1 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.kind === "ai" ? "AI enhancement" : "Render Agent"} · {viewLabel(item)}</span><span className="text-muted-foreground">Rev #{item.revision}</span></div><div className="text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleString("vi-VN") : item.status}</div></div></button>)}</div></aside>
        </div>
      </main>
    </div>
  );
}
