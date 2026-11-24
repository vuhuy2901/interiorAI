import io
base = r"c:/QLDAPM-final/interiorAI/paperclip/ui/src/features/atelier/"


def read(name):
    with io.open(base + name, encoding="utf8", newline="") as f:
        s = f.read()
    nl = "\r\n" if "\r\n" in s else "\n"
    return s.replace("\r\n", "\n"), nl


def write(name, s, nl):
    with io.open(base + name, "w", encoding="utf8", newline="") as f:
        f.write(s.replace("\n", nl))


TS_ADD = '''
// FEAT-2026-129: render đẹp bằng AI (Codex). Blender dựng khung, Codex tạo ảnh photoreal.
export type AiRenderJob = {
  job_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | string;
  image_url?: string | null;
  base_image_url?: string | null;
  brief_hash?: string | null;
  elapsed_s?: number;
  codex_summary?: string | null;
  error?: string | null;
  missing_decisions?: string[];
};

export const AI_RENDER_POLL_MS = 5000;

const MISSING_LABELS: Record<string, string> = {
  wall_paint: "màu sơn tường",
  accent_wall: "tường nhấn",
  ceiling_color: "màu trần",
  floor: "vật liệu sàn",
  lighting: "ánh sáng",
  wood_tone: "tông gỗ",
  style: "phong cách",
  furniture: "đồ nội thất",
  room: "phòng",
};

export function aiRenderMissingText(missing?: string[]): string {
  if (!missing || missing.length === 0) return "";
  return `Còn chưa chốt: ${missing.map((key) => MISSING_LABELS[key] || key).join(", ")}`;
}

export function formatElapsed(seconds?: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes} phút ${rest} giây` : `${rest} giây`;
}

export function aiRenderStatusText(status?: string): string {
  switch (status) {
    case "QUEUED": return "Đang xếp hàng (mỗi lúc chỉ chạy một ảnh AI)";
    case "RUNNING": return "Blender dựng khung, Codex đang tạo ảnh (khoảng 2–3 phút)";
    case "COMPLETED": return "Ảnh AI hoàn tất";
    case "FAILED": return "Render AI thất bại";
    default: return "Sẵn sàng";
  }
}

export function isAiRenderActive(status?: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}
'''

s, nl = read("photorealRender.ts")
if "FEAT-2026-129" not in s:
    write("photorealRender.ts", s + TS_ADD, nl)

s, nl = read("AtelierPhotorealRenderPage.tsx")


def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


rep('''  buildRenderPayload, isRenderActive, readCurrentCameraSnapshot,
  RENDER_QUALITIES, RENDER_RESOLUTIONS, renderStatusText,
  type RenderQualityId, type RenderResolutionId,''', '''  AI_RENDER_POLL_MS, aiRenderMissingText, aiRenderStatusText, formatElapsed, isAiRenderActive,
  buildRenderPayload, isRenderActive, readCurrentCameraSnapshot,
  RENDER_QUALITIES, RENDER_RESOLUTIONS, renderStatusText,
  type AiRenderJob, type RenderQualityId, type RenderResolutionId,''')
rep('''  const [fallbackRendering, setFallbackRendering] = useState(false);
''', '''  const [fallbackRendering, setFallbackRendering] = useState(false);
  const [aiJob, setAiJob] = useState<AiRenderJob | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiStarting, setAiStarting] = useState(false);
  const [aiMissing, setAiMissing] = useState<string[]>([]);
''')
rep('''  const submitRender = useCallback(async () => {''', '''  // FEAT-2026-129: poll job AI mỗi 5 giây cho tới khi xong hoặc lỗi.
  useEffect(() => {
    if (!aiJob?.job_id || !isAiRenderActive(aiJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/render/ai/${aiJob.job_id}`);
        const body = await response.json();
        if (!cancelled && response.ok) setAiJob(body);
      } catch {
        // Lỗi mạng tạm thời không được làm mất job đang chạy.
      }
    }, AI_RENDER_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [aiJob?.job_id, aiJob?.status]);

  useEffect(() => {
    if (!project?.project_id) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/projects/${project.project_id}/render-brief`);
        const body = await response.json();
        if (!cancelled && response.ok) setAiMissing(body.missing_decisions || []);
      } catch {
        // Brief chỉ để cảnh báo; lỗi thì bỏ qua.
      }
    })();
    return () => { cancelled = true; };
  }, [project?.project_id, project?.revision]);

  const startAiRender = useCallback(async () => {
    if (!project?.project_id) return;
    setAiStarting(true);
    setAiError("");
    setAiJob(null);
    try {
      const response = await fetch(`${API_BASE}/projects/${project.project_id}/render/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera: "eye_level" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiError(body, "Không thể tạo tác vụ render AI"));
      const poll = await fetch(`${API_BASE}/render/ai/${body.job_id}`);
      setAiJob(poll.ok ? await poll.json() : { job_id: body.job_id, status: body.status });
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "Không thể tạo tác vụ render AI");
    } finally {
      setAiStarting(false);
    }
  }, [project?.project_id]);

  const submitRender = useCallback(async () => {''')
rep('''  const imageUrl = fallbackResult || job?.image_url || job?.render_url;''', '''  const aiActive = aiStarting || isAiRenderActive(aiJob?.status);
  const aiDone = aiJob?.status === "COMPLETED" && !!aiJob.image_url;
  const imageUrl = fallbackResult || job?.image_url || job?.render_url;''')
rep('''        {imageUrl ? (
          <div className="photoreal-image-scroll">''', '''        {aiDone ? (
          <div className="photoreal-ai-compare" aria-label="So sánh ảnh khung Blender và ảnh AI">
            <figure>
              <figcaption>Trước: ảnh khung Blender</figcaption>
              {aiJob?.base_image_url ? <img src={aiJob.base_image_url} alt="Ảnh khung Blender" /> : <div className="photoreal-ai-empty">Không có ảnh khung</div>}
            </figure>
            <figure>
              <figcaption>
                Sau: ảnh AI (Codex)
                <a href={aiJob?.image_url || undefined} download className="photoreal-ai-download"><Download size={14} /> Tải ảnh AI</a>
              </figcaption>
              <img src={aiJob?.image_url || undefined} alt="Ảnh minh họa AI" />
            </figure>
          </div>
        ) : imageUrl ? (
          <div className="photoreal-image-scroll">''')
rep('''        {active ? (
          <div className="photoreal-processing" role="status">''', '''        {aiActive ? (
          <div className="photoreal-processing" role="status">
            <LoaderCircle className="spin" size={22} />
            <div>
              <strong>{aiRenderStatusText(aiJob?.status || "QUEUED")}</strong>
              <span>Đã chạy {formatElapsed(aiJob?.elapsed_s)} · ảnh khung được gửi lên OpenAI qua tài khoản ChatGPT</span>
            </div>
          </div>
        ) : active ? (
          <div className="photoreal-processing" role="status">''')
rep('''              </button>
            </div>
          ) : null}
          {(error ||''', '''              </button>
              <button
                type="button"
                className="photoreal-render-button photoreal-ai-button"
                onClick={() => void startAiRender()}
                disabled={active || aiActive || !blenderAvailable || !project}
                title="Blender dựng khung đúng bố cục, Codex tạo ảnh photoreal theo brief. Mất khoảng 2–3 phút và dùng hạn mức ChatGPT."
              >
                {aiActive ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                {aiActive ? "AI đang render" : "Render đẹp bằng AI (Codex)"}
              </button>
              {aiMissing.length > 0 ? <div className="photoreal-ai-note">{aiRenderMissingText(aiMissing)}</div> : null}
            </div>
          ) : null}
          {(aiError || aiJob?.status === "FAILED") ? (
            <div className="photoreal-error" role="alert">
              <span>{aiError || aiJob?.error || aiRenderStatusText("FAILED")}</span>
            </div>
          ) : null}
          {aiDone ? (
            <div className="photoreal-success">
              Ảnh AI hoàn tất sau {formatElapsed(aiJob?.elapsed_s)}. Chỉ là ảnh minh họa, không dùng làm căn cứ thi công.
              {aiJob?.codex_summary ? ` ${aiJob.codex_summary}` : ""}
            </div>
          ) : null}
          {(error ||''')
write("AtelierPhotorealRenderPage.tsx", s, nl)

CSS = '''
/* FEAT-2026-129: so sánh trước/sau cho render AI (Codex) */
.photoreal-ai-compare { position: absolute; inset: 0; padding: 16px 16px 250px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; overflow: auto; background: var(--surface-primary, #0b1110); }
.photoreal-ai-compare figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.photoreal-ai-compare figcaption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text-primary, #e5e7eb); }
.photoreal-ai-compare img { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--border-primary, rgba(255,255,255,.14)); background: #000; }
.photoreal-ai-download { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 8px; color: #07110d; background: #6ee7b7; font-weight: 750; text-decoration: none; }
.photoreal-ai-empty { padding: 40px 12px; text-align: center; font-size: 12px; color: var(--text-secondary, #9ca3af); border: 1px dashed var(--border-primary, rgba(255,255,255,.2)); border-radius: 10px; }
.photoreal-ai-button { background: #fcd34d; }.photoreal-ai-button:hover { background: #fde68a; }
.photoreal-ai-note { grid-column: 1 / -1; font-size: 11px; color: #fde68a; }
@media (max-width: 760px) { .photoreal-ai-compare { grid-template-columns: 1fr; padding-bottom: 260px; } }
'''
s, nl = read("atelier-studio.css")
if "FEAT-2026-129" not in s:
    write("atelier-studio.css", s + CSS, nl)
print("ok")
