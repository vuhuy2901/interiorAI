export type RenderResolutionId = "hd" | "full-hd" | "2k";
export type RenderQualityId = "draft" | "high" | "ultra";

export type CameraSnapshot = {
  eye_m: [number, number, number];
  target_m: [number, number, number];
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
  const framing = (window as any).__ATELIER_VIEWER_STATE__?.cameraFraming;
  const position = framing?.position;
  const target = framing?.target;
  if (!Array.isArray(position) || position.length !== 3 || !Array.isArray(target) || target.length !== 3) {
    return null;
  }
  const values = [...position, ...target].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;

  const verticalFovDeg = Number(framing.verticalFovDeg || 45);
  const lensMm = 32 / (2 * Math.tan((Math.max(10, Math.min(100, verticalFovDeg)) * Math.PI) / 360));
  // Three.js: X horizontal, Y vertical, Z depth. Blender bridge: X/Y horizontal, Z vertical.
  return {
    eye_m: [values[0], values[2], values[1]],
    target_m: [values[3], values[5], values[4]],
    lens_mm: Number(Math.max(12, Math.min(120, lensMm)).toFixed(2)),
    hide_ceiling: false,
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
