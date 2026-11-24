export type RenderResolutionId = "hd" | "full-hd" | "2k";
export type RenderQualityId = "draft" | "high" | "ultra";

export type CameraSnapshot = {
  eye_m: [number, number, number];
  target_m: [number, number, number];
  up_m: [number, number, number];
  projection: "perspective";
  vertical_fov_deg: number;
  aspect_ratio: number;
  near_m: number;
  far_m: number;
  lens_mm: number;
  hide_ceiling: boolean;
};

export const RENDER_RESOLUTIONS = [
  { id: "hd" as const, label: "HD · 1280 × 720", width: 1280, height: 720 },
  { id: "full-hd" as const, label: "Full HD · 1920 × 1080", width: 1920, height: 1080 },
  { id: "2k" as const, label: "2K · 2560 × 1440", width: 2560, height: 1440 },
];

export const RENDER_QUALITIES = [
  { id: "draft" as const, label: "Xem nhanh", mode: "preview" as const, samples: 24 },
  { id: "high" as const, label: "Chất lượng cao", mode: "final" as const, samples: 96 },
  { id: "ultra" as const, label: "Tối đa", mode: "final" as const, samples: 192 },
];

export function readCurrentCameraSnapshot(): CameraSnapshot | null {
  const viewerState = (window as any).__ATELIER_VIEWER_STATE__;
  const framing = viewerState?.cameraFraming;
  const position = framing?.position;
  const target = framing?.target;
  if (!Array.isArray(position) || position.length !== 3 || !Array.isArray(target) || target.length !== 3) {
    return null;
  }
  const values = [...position, ...target].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;

  const verticalFovDeg = Number(framing.verticalFovDeg || 45);
  const viewportAspect = Number(framing.aspectRatio || window.innerWidth / Math.max(1, window.innerHeight));
  const lensMm = 32 / (2 * Math.tan((Math.max(10, Math.min(100, verticalFovDeg)) * Math.PI) / 360));
  // glTF/Three.js is Y-up. Blender's glTF importer maps depth with the opposite
  // sign: (x, y, z) -> (x, -z, y). Keep the browser and Cycles views aligned.
  return {
    eye_m: [values[0], -values[2], values[1]],
    target_m: [values[3], -values[5], values[4]],
    up_m: [0, 0, 1],
    projection: "perspective",
    vertical_fov_deg: Number(Math.max(10, Math.min(100, verticalFovDeg)).toFixed(2)),
    aspect_ratio: Number(Math.max(0.2, Math.min(5, viewportAspect)).toFixed(4)),
    near_m: Number(Math.max(0.001, Number(framing.nearM || 0.01)).toFixed(4)),
    far_m: Number(Math.max(10, Number(framing.farM || 500)).toFixed(2)),
    lens_mm: Number(Math.max(12, Math.min(120, lensMm)).toFixed(2)),
    hide_ceiling: viewerState?.ceilingVisible === false,
  };
}

export function buildRenderPayload(options: {
  revision: number;
  camera: string;
  lighting: string;
  resolution: RenderResolutionId;
  quality: RenderQualityId;
  cameraSnapshot?: CameraSnapshot | null;
}) {
  const resolution = RENDER_RESOLUTIONS.find((item) => item.id === options.resolution) ?? RENDER_RESOLUTIONS[1];
  const quality = RENDER_QUALITIES.find((item) => item.id === options.quality) ?? RENDER_QUALITIES[1];
  return {
    camera: options.cameraSnapshot ? "orbit" : options.camera,
    time_of_day: options.lighting,
    mode: quality.mode,
    width_px: resolution.width,
    height_px: resolution.height,
    samples: quality.samples,
    expected_revision: options.revision,
    camera_snapshot: options.cameraSnapshot || undefined,
    async_exec: true,
    use_cache: true,
  };
}

export function isRenderActive(status?: string) {
  return status === "QUEUED" || status === "RUNNING";
}

export function renderStatusText(status?: string) {
  switch (status) {
    case "QUEUED": return "Đang chờ bộ máy render";
    case "RUNNING": return "Blender Cycles đang dựng ánh sáng và kết xuất";
    case "COMPLETED": return "Render hoàn tất";
    case "BLOCKED": return "Bộ máy render chưa sẵn sàng";
    case "FAILED": return "Render thất bại";
    case "CANCELLED": return "Đã hủy render";
    default: return "Sẵn sàng render";
  }
}

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
