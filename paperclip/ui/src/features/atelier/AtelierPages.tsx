import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useTheme } from "@/context/ThemeContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import { SceneCostPanel } from "./SceneCostPanel";
import { UnifiedBOQPage } from "./UnifiedBOQPage";
import { AtelierProjectWorkflowMonitor, AtelierWorkflowControlCenter } from "./AtelierWorkflowMonitor";
import {
  FloorPlanImportPage,
  MaterialsAndCatalogPage,
  RenderAndCadPage,
  CostEstimationPage,
} from "./SupportingPages";
import {
  Activity,
  Box,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  ShoppingBag,
  ShieldCheck,
  Ruler,
  ArrowRight,
} from "lucide-react";

const API_BASE = "/api/v1";

function formatVND(val?: number | null): string {
  if (val === undefined || val === null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(Math.round(val)) + " ₫";
}

export function AtelierFloorPlanImportRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const {
    activeProjectId,
    project,
    refreshProjectBundle,
    showToast,
  } = useAtelierStudio();

  const [scaleWidthMm, setScaleWidthMm] = useState(4000);
  const [scaleDepthMm, setScaleDepthMm] = useState(5000);
  const [scaleCeilingMm, setScaleCeilingMm] = useState(2800);
  const [uploading, setUploading] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<any | null>(null);
  const [generatingMultiRoom, setGeneratingMultiRoom] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Nhập mặt bằng 2D & Xác thực tỷ lệ (mm)" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (project) {
      setScaleWidthMm(project.width_mm || 4000);
      setScaleDepthMm(project.depth_mm || 5000);
      setScaleCeilingMm(project.ceiling_height_mm || 2800);
    }
  }, [project]);

  const handleGenerateMultiRoom = async () => {
    setGeneratingMultiRoom(true);
    try {
      const pid = activeProjectId || project?.id;
      if (!pid) {
        showToast("Hãy chọn một project trước khi tạo mặt bằng đa phòng.");
        return;
      }
      const res = await fetch(`${API_BASE}/projects/${pid}/house-plan/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scale_confirmed: true,
          reference_length_mm: scaleDepthMm || 5000,
        }),
      });
      if (res.ok) {
        await refreshProjectBundle(pid);
        showToast(
          "🎉 Đã tự động tạo toàn bộ Căn hộ Đa phòng (52.5 m²) gồm Phòng Khách, Bếp, Ngủ Master, Vệ sinh & Hệ thống trần đèn!",
        );
      } else {
        throw new Error("Lỗi phản hồi máy chủ: " + res.status);
      }
    } catch (err: any) {
      showToast("Lỗi khi dựng căn hộ đa phòng: " + err.message);
    } finally {
      setGeneratingMultiRoom(false);
    }
  };

  const handleConfirmScale = async () => {
    setUploading(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/${activeProjectId}/confirm-scale`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            width_mm: scaleWidthMm,
            depth_mm: scaleDepthMm,
            ceiling_height_mm: scaleCeilingMm,
          }),
        },
      );
      if (res.ok) {
        await refreshProjectBundle(activeProjectId);
        showToast(
          `Đã xác nhận tỷ lệ chuẩn ${scaleWidthMm}×${scaleDepthMm}mm và đồng bộ Pascal 3D!`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFloorplan = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("reference_dimension_mm", String(scaleWidthMm));
      const res = await fetch(
        `${API_BASE}/projects/${activeProjectId}/floorplan/upload`,
        {
          method: "POST",
          body: formData,
        },
      );
      if (res.ok) {
        const data = await res.json();
        setLastImportResult(data);
        await refreshProjectBundle(activeProjectId);
        showToast(
          data.requires_scale_confirmation
            ? "Đã đọc mặt bằng! Vui lòng kiểm tra và bấm Xác nhận tỷ lệ chuẩn (mm)."
            : "Đã nhập mặt bằng DXF chuẩn tỷ lệ 1:1 (mm)!",
        );
      }
    } finally {
      setUploading(false);
    }
  };

  if (!project) return <div className="p-6 text-sm text-muted-foreground">Đang tải dữ liệu mặt bằng...</div>;

  return (
    <div className="atelier-surface-root h-full overflow-y-auto space-y-6" data-theme={theme}>
      <FloorPlanImportPage
        project={project}
        uploadingFile={uploading}
        lastImportResult={lastImportResult}
        scaleInputMm={scaleWidthMm}
        onScaleInputChange={setScaleWidthMm}
        onConfirmScale={handleConfirmScale}
        onUploadFloorplan={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUploadFloorplan(file);
        }}
      />

      {/* Upgrade 1 & 3: Multi-Room Whole House Generator Card */}
      <div className="mx-auto max-w-6xl px-6 pb-8">
        <div className="rounded-lg border border-teal-700/30 bg-teal-500/5 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-teal-700 text-white px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                  Nâng Cấp 1 & 3
                </span>
                <h3 className="text-base font-semibold text-foreground">
                  House Plan Designer — Tự Động Tạo Toàn Bộ Căn Hộ Đa Phòng 3D BIM
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Dựa trên tham chiếu House Plan Designer. Tự động sinh cấu trúc mặt bằng <strong>FloorSpec JSON</strong> đa phòng (Phòng Khách 20m², Khu Bếp Ăn 12m², Phòng Ngủ Master 16m², Vệ sinh 4.5m²), đồng bộ Pascal 3D BIM, trần thạch cao Vĩnh Tường, hệ thống đèn LED Rạng Đông và nội thất hoàn thiện.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateMultiRoom}
              disabled={generatingMultiRoom}
              className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-teal-800 disabled:opacity-50 transition-all cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${generatingMultiRoom ? "animate-spin" : ""}`} />
              <span>
                {generatingMultiRoom
                  ? "Đang tự động dựng căn hộ 3D..."
                  : "⚡ Dựng Toàn Bộ Căn Hộ Đa Phòng"}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2 border-t border-border/50 text-xs">
            <div className="rounded border border-border/60 bg-background/60 p-2.5">
              <div className="text-[11px] text-muted-foreground">Tổng diện tích căn hộ</div>
              <div className="font-mono font-semibold text-foreground">52.5 m² (7000×7500 mm)</div>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-2.5">
              <div className="text-[11px] text-muted-foreground">Số phòng chức năng</div>
              <div className="font-mono font-semibold text-foreground">4 Không gian biệt lập</div>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-2.5">
              <div className="text-[11px] text-muted-foreground">Hệ trần & Chiếu sáng</div>
              <div className="font-mono font-semibold text-teal-700 dark:text-teal-400">Giật cấp + LED 9W Rạng Đông</div>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-2.5">
              <div className="text-[11px] text-muted-foreground">Vật tư nội thất</div>
              <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">An Cường, KUKA, Nhà Xinh</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AtelierMaterialsCatalogRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const {
    project,
    materialsCatalog,
    productsCatalog,
    handleMaterialChange,
    handleReplaceProduct,
    activeProjectId,
    selectedEntityId,
    showToast,
    errorMessage,
  } = useAtelierStudio();
  const [fitCheckResults, setFitCheckResults] = useState<Record<string, any>>({});

  const handleFitCheck = async (sku: string) => {
    const response = await fetch(`${API_BASE}/catalog/fit-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId,
        sku,
        replace_furniture_id: selectedEntityId,
      }),
    });
    if (!response.ok) {
      showToast(`Kiểm tra kích thước thất bại (${response.status}).`);
      return;
    }
    const result = await response.json();
    setFitCheckResults((current) => ({ ...current, [sku]: result }));
    showToast(result.recommendation || "Đã hoàn tất kiểm tra kích thước.");
  };

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Vật liệu Bề mặt (Mục 7B) & Nội thất" },
    ]);
  }, [setBreadcrumbs]);

  if (!project) return (
    <div className="p-6 text-sm text-muted-foreground" role={errorMessage ? "alert" : "status"}>
      {errorMessage ? `Không thể tải dự án vật liệu: ${errorMessage}` : "Đang tải dự án và danh mục vật liệu..."}
    </div>
  );

  return (
    <div className="atelier-surface-root h-full overflow-y-auto" data-theme={theme}>
      <MaterialsAndCatalogPage
        project={project}
        materialsDb={materialsCatalog ?? { paints: [], tiles_and_flooring: [] }}
        catalog={productsCatalog}
        fitCheckResults={fitCheckResults}
        onUpdateSurfaces7B={(payload) => void handleMaterialChange(
          payload.wall_base_material_id,
          payload.accent_paint_id,
          payload.floor_material_id,
        )}
        onFitCheck={(sku) => void handleFitCheck(sku)}
        onReplaceFromCatalog={(sku) => void handleReplaceProduct(sku)}
      />
    </div>
  );
}

export function AtelierRenderCompareRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { project, materialsCatalog } = useAtelierStudio();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Phối cảnh 3D & Xuất hồ sơ CAD/BIM" },
    ]);
  }, [setBreadcrumbs]);

  if (!project) return <div className="p-6 text-sm text-muted-foreground">Đang tải thông tin phối cảnh...</div>;

  return (
    <div className="atelier-surface-root h-full overflow-y-auto" data-theme={theme}>
      <RenderAndCadPage
        project={project}
        materialsDb={materialsCatalog ?? { paints: [], tiles_and_flooring: [] }}
      />
    </div>
  );
}

export function AtelierCostEstimationRoute() {
  const { project, refreshProjectBundle, activeProjectId, projects } = useAtelierStudio();
  const [resolvedProject, setResolvedProject] = useState<any | null>(null);

  useEffect(() => {
    if (project?.external_scene) return;
    const targetId = activeProjectId || (projects && projects[0]?.project_id) || "proj_the_interior_14";
    fetch(`/api/v1/projects/${encodeURIComponent(targetId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.external_scene) {
          setResolvedProject(data);
        }
      })
      .catch(() => {});
  }, [project, activeProjectId, projects]);

  const target = project?.external_scene ? project : resolvedProject;

  if (target?.external_scene) {
    return (
      <div className="atelier-surface-root h-full overflow-y-auto">
        <SceneCostPanel
          key={`${target.project_id}:${target.external_scene.sha256}`}
          project={target}
          onRefresh={() => refreshProjectBundle(target.project_id)}
        />
      </div>
    );
  }

  return <UnifiedBOQPage />;
}

export function AtelierShoppingCatalogRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const {
    project,
    productsCatalog,
    handleReplaceProduct,
  } = useAtelierStudio();

  const [tierFilter, setTierFilter] = useState<"all" | "low" | "mid" | "high">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Danh mục Mua sắm & Kiểm tra Lọt cửa (Doorway Fit-Check)" },
    ]);
  }, [setBreadcrumbs]);

  const categories = Array.from(
    new Set((productsCatalog || []).map((p: any) => p.category)),
  );

  const filteredProducts = (productsCatalog || []).filter((p: any) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (tierFilter === "low" && p.price_vnd > 6_000_000) return false;
    if (
      tierFilter === "mid" &&
      (p.price_vnd <= 6_000_000 || p.price_vnd > 12_000_000)
    ) {
      return false;
    }
    if (tierFilter === "high" && p.price_vnd <= 12_000_000) return false;
    return true;
  });

  const doorOpening = project?.openings?.find((o: any) => o.kind === "door") ?? {
    width_mm: 900,
    height_mm: 2100,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Danh Mục Mua Sắm Nội Thất Việt Nam (Shopping Assistant)
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Đối khớp kích thước thực tế (mm), kiểm tra lọt lòng cửa chính (
            <span className="font-mono font-semibold text-foreground">
              {doorOpening.width_mm}×{doorOpening.height_mm} mm
            </span>
            ) và phân tích theo 3 phân khúc ngân sách (Tiết kiệm / Tiêu chuẩn / Cao cấp). Dữ liệu có nguồn xác minh, không tạo giá giả.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/design-studio")}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
        >
          <span>Mở Không gian 3D</span>
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Phân khúc giá:
          </span>
          {(
            [
              ["all", "Tất cả phân khúc"],
              ["low", "Tiết kiệm (≤ 6 triệu)"],
              ["mid", "Tiêu chuẩn (6 – 12 triệu)"],
              ["high", "Cao cấp (> 12 triệu)"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTierFilter(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tierFilter === key
                  ? "bg-teal-700 text-white"
                  : "border border-border bg-background text-foreground hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Nhóm sản phẩm:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs"
          >
            <option value="all">Tất cả ({productsCatalog.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((prod: any) => {
          const minDim = Math.min(prod.depth_mm || 800, prod.height_mm || 750);
          const fitsDoor = minDim <= (doorOpening.width_mm || 900) - 30;
          const tierLabel =
            prod.price_vnd <= 6_000_000
              ? "Tiết kiệm"
              : prod.price_vnd <= 12_000_000
                ? "Tiêu chuẩn"
                : "Cao cấp";

          return (
            <div
              key={prod.id}
              className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {prod.sku}
                  </span>
                  <span className="rounded-full border border-teal-700/25 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300">
                    {tierLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span
                    className="size-5 shrink-0 rounded border border-border"
                    style={{ backgroundColor: prod.hex_color || "#D6C7B2" }}
                  />
                  <h3 className="text-sm font-semibold text-foreground">
                    {prod.name}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-md bg-secondary/50 p-2.5 text-xs">
                  <div>
                    <div className="text-[11px] text-muted-foreground">
                      Kích thước (R×S×C)
                    </div>
                    <div className="font-mono font-medium text-foreground">
                      {prod.width_mm}×{prod.depth_mm}×{prod.height_mm} mm
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">
                      Đơn giá niêm yết
                    </div>
                    <div className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                      {formatVND(prod.price_vnd)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Nhà cung cấp: {prod.brand || prod.supplier || "Việt Nam"}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="size-3" />
                    {fitsDoor
                      ? `Qua lọt cửa ${doorOpening.width_mm}mm`
                      : "Cần tháo rời khi vận chuyển"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => void handleReplaceProduct(prod.id)}
                  className="flex-1 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                >
                  Đề xuất đưa vào Phòng 3D
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AtelierSystemHealthRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/atelier/health-metrics");
      if (res.ok) {
        setMetrics(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setBreadcrumbs([
      { label: "Hệ thống" },
      { label: "Local-Lite Health & RAM Benchmark" },
    ]);
    void loadMetrics();
  }, [setBreadcrumbs]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Trạng Thái Hạ Tầng Local-Lite & Đo Lường RAM/CPU Thực Tế
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Chạy trực tiếp trên máy cá nhân (8GB RAM + iGPU target) — Không yêu cầu Docker Desktop, Redis, RabbitMQ hay Kubernetes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMetrics()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới số đo thực tế</span>
        </button>
      </div>

      {metrics ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="size-4 text-teal-700" />
                <span>Paperclip Node RSS RAM</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                {metrics.memory?.nodeRssMb} MB
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                Heap Used: {metrics.memory?.nodeHeapUsedMb} / {metrics.memory?.nodeHeapTotalMb} MB
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HardDrive className="size-4 text-teal-700" />
                <span>RAM Hệ thống (OS Memory)</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
                {metrics.memory?.systemUsedRamGb} / {metrics.memory?.systemTotalRamGb} GB
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                Còn trống: {metrics.memory?.systemFreeRamGb} GB
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="size-4 text-emerald-600" />
                <span>Database & Hạ tầng</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Embedded PostgreSQL
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Docker: OFF • Redis: OFF • RabbitMQ: OFF
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Box className="size-4 text-teal-700" />
                <span>Pascal MCP & Scene Lock</span>
              </div>
              <div className="mt-2 font-mono text-lg font-semibold text-foreground">
                {metrics.services?.pascalMcpToolsCount ?? 80} MCP Tools
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Max Scene Writers/Project: {metrics.concurrency?.maxConcurrentSceneMutationsPerProject}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Chi tiết Dịch vụ & Concurrency Gate (ATELIER_LOCAL_LITE)
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
              <div className="flex items-center justify-between rounded border border-border p-2.5">
                <span className="text-muted-foreground">Node.js Runtime:</span>
                <span className="font-mono font-medium">{metrics.runtime?.nodeVersion} ({metrics.runtime?.platform}/{metrics.runtime?.arch})</span>
              </div>
              <div className="flex items-center justify-between rounded border border-border p-2.5">
                <span className="text-muted-foreground">Active Agent Runs:</span>
                <span className="font-mono font-medium">{metrics.concurrency?.activeAgentRuns} / {metrics.concurrency?.maxActiveAgentRuns}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-border p-2.5">
                <span className="text-muted-foreground">Pascal 3D MCP Gateway:</span>
                <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">{metrics.services?.pascalMcpGateway}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-border p-2.5">
                <span className="text-muted-foreground">Python CAD/DXF/IFC/Cost Sidecar:</span>
                <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">{metrics.services?.pythonCadAndCostSidecar}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="p-6 text-sm text-muted-foreground">Đang đo thông số hệ thống...</div>
      )}
    </div>
  );
}

export function AtelierControlCenterRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Điều phối AI" },
      { label: "Company Workflow / Project Monitor" },
    ]);
  }, [setBreadcrumbs]);

  return <AtelierWorkflowControlCenter />;
}

export function AtelierProjectWorkflowRoute() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Điều phối AI" }, { label: "Project Workflow Monitor" }]);
  }, [setBreadcrumbs]);
  return <AtelierProjectWorkflowMonitor />;
}
