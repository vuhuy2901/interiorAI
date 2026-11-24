import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useTheme } from "@/context/ThemeContext";
import { useAtelierStudio } from "./AtelierStudioContext";
import {
  ClipboardList,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Building2,
  Package,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface BOMItem {
  id: string;
  room: string;
  category: string;
  name: string;
  sku: string;
  dimensions_mm: [number, number, number];
  material: string;
  color_finish: string;
  quantity: number;
  unit: string;
  unit_price_vnd: number | null;
  total_price_vnd: number | null;
  price_status: string;
  approval_status: string;
  supplier: string;
  source_url?: string | null;
  model_3d_id?: string | null;
}

interface BOMData {
  project_id: string;
  revision: number;
  generated_at: string;
  total_items_count: number;
  priced_items_subtotal_vnd: number;
  unpriced_items_count: number;
  items_by_room: Record<string, BOMItem[]>;
  all_items: BOMItem[];
}

function formatVND(val?: number | null): string {
  if (val === undefined || val === null) return "Chưa có giá";
  return new Intl.NumberFormat("vi-VN").format(Math.round(val)) + " ₫";
}

export function AtelierInventoryBOMPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { activeProjectId, project } = useAtelierStudio();

  const [bomData, setBomData] = useState<BOMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Bóc tách Khối lượng & Danh mục Vật tư (BOM)" },
    ]);
  }, [setBreadcrumbs]);

  const fetchBOM = async () => {
    setLoading(true);
    setError(null);
    try {
      const pid = activeProjectId || project?.id || "proj_demo_4x5m";
      const res = await fetch(`/api/v1/projects/${pid}/inventory`);
      if (!res.ok) {
        throw new Error(`Không thể tải bảng BOM (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.ok && data.inventory_bom) {
        setBomData(data.inventory_bom);
      } else {
        throw new Error("Dữ liệu phản hồi không đúng định dạng BOM");
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBOM();
  }, [activeProjectId, project]);

  const handleExportCsv = () => {
    const pid = activeProjectId || project?.id || "proj_demo_4x5m";
    window.open(`/api/v1/projects/${pid}/inventory/export/csv`, "_blank");
  };

  const roomsList = Array.from(
    new Set(bomData?.all_items?.map((it) => it.room) || []),
  );
  const categoriesList = Array.from(
    new Set(bomData?.all_items?.map((it) => it.category) || []),
  );

  const filteredItems = (bomData?.all_items || []).filter((item) => {
    if (selectedRoom !== "all" && item.room !== selectedRoom) return false;
    if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchSku = item.sku.toLowerCase().includes(q);
      const matchSupplier = item.supplier.toLowerCase().includes(q);
      const matchMaterial = item.material.toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchSupplier && !matchMaterial) return false;
    }
    return true;
  });

  const categoryNameMap: Record<string, string> = {
    furniture: "Đồ nội thất",
    floor_tile: "Gạch / Sàn",
    floor_wood: "Sàn gỗ",
    paint: "Sơn tường",
    ceiling: "Trần thạch cao",
    lighting: "Đèn chiếu sáng",
    plant: "Cây xanh",
    curtain: "Rèm cửa",
    kitchen_cabinet: "Tủ bếp",
    coffee_table: "Bàn trà",
    sofa: "Sofa",
    bed: "Giường ngủ",
  };

  return (
    <div className="atelier-surface-root h-full overflow-y-auto p-6 space-y-6" data-theme={theme}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-teal-700 dark:text-teal-400" />
            <h1 className="text-xl font-semibold text-foreground">
              Bóc Tách Khối Lượng & Danh Mục Vật Tư (Design Inventory / BOM)
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tự động trích xuất từ mô hình Pascal 3D BIM & CanonicalProject. Đối khớp định danh SKU, vật liệu bề mặt, kích thước (mm) và đơn giá thị trường Việt Nam (Eurotile, An Cường, Rạng Đông, KUKA...).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchBOM()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Đồng bộ lại từ Scene</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-teal-700/30 bg-teal-50 dark:bg-teal-950/40 px-3 py-1.5 text-xs font-medium text-teal-800 dark:text-teal-200 hover:bg-teal-100"
          >
            <Download className="size-3.5" />
            <span>Xuất file BOM (CSV / Excel)</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/design-studio")}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
          >
            <span>Mở Studio 3D</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="size-4 text-teal-700" />
            <span>Tổng Hạng Mục Bóc Tách</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-foreground">
            {bomData ? bomData.total_items_count : "—"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Phân bổ trên {roomsList.length} không gian phòng
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="size-4 text-teal-700" />
            <span>Tổng Giá Trị Định Lượng</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-teal-700 dark:text-teal-400">
            {bomData ? formatVND(bomData.priced_items_subtotal_vnd) : "—"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Đơn giá thực tế có hóa đơn / báo giá
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>Hạng Mục Đã Có Giá</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {bomData ? bomData.total_items_count - bomData.unpriced_items_count : "—"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Tra cứu từ các nhà cung cấp Việt Nam
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="size-4 text-amber-600" />
            <span>Chờ Báo Giá Theo Dự Án</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-700 dark:text-amber-400">
            {bomData ? bomData.unpriced_items_count : "0"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Tuyệt đối không dùng AI bịa giá
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3.5" />
            <span>Lọc phòng:</span>
          </div>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs"
          >
            <option value="all">Tất cả phòng ({bomData?.all_items?.length || 0})</option>
            {roomsList.map((rm) => (
              <option key={rm} value={rm}>
                {rm}
              </option>
            ))}
          </select>

          <span className="text-muted-foreground text-xs">•</span>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Phân loại:</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs"
          >
            <option value="all">Tất cả nhóm</option>
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>
                {categoryNameMap[cat] || cat}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, SKU, nhà cung cấp..."
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1 text-xs outline-none focus:border-teal-700"
          />
        </div>
      </div>

      {/* BOM Table */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                <th className="py-2.5 px-3">Mã</th>
                <th className="py-2.5 px-3">Phòng sử dụng</th>
                <th className="py-2.5 px-3">Phân loại</th>
                <th className="py-2.5 px-3">Hạng mục & SKU</th>
                <th className="py-2.5 px-3">Quy cách (R×S×C)</th>
                <th className="py-2.5 px-3">Vật liệu / Hoàn thiện</th>
                <th className="py-2.5 px-3 text-center">SL & ĐVT</th>
                <th className="py-2.5 px-3 text-right">Đơn giá</th>
                <th className="py-2.5 px-3 text-right">Thành tiền</th>
                <th className="py-2.5 px-3">Nhà cung cấp</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-xs text-muted-foreground">
                    Không tìm thấy hạng mục nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const dims = item.dimensions_mm || [0, 0, 0];
                  const dimStr = `${dims[0]}×${dims[1]}×${dims[2]} mm`;
                  const isPriced = item.unit_price_vnd !== null;

                  return (
                    <tr key={item.id || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {item.id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {item.room}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          {categoryNameMap[item.category] || item.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {item.sku}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">
                        {dimStr}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground max-w-[180px] truncate" title={`${item.material} • ${item.color_finish}`}>
                        <div>{item.material}</div>
                        <div className="text-[10px]">{item.color_finish}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className="font-semibold">{item.quantity}</span>{" "}
                        <span className="text-muted-foreground">{item.unit}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {isPriced ? (
                          <span>{formatVND(item.unit_price_vnd)}</span>
                        ) : (
                          <span className="text-amber-600 italic">Chưa có giá</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {isPriced ? (
                          <span>{formatVND(item.total_price_vnd)}</span>
                        ) : (
                          <span className="text-amber-600 font-normal italic">Chờ dự toán</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span>{item.supplier}</span>
                          {item.source_url ? (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-700 hover:text-teal-800"
                              title="Xem nguồn cung cấp"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            item.approval_status === "approved"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {item.approval_status === "approved" ? "Đã duyệt" : "Chờ duyệt"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer with totals */}
        {bomData ? (
          <div className="flex flex-wrap items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              Hiển thị <strong>{filteredItems.length}</strong> / {bomData.total_items_count} hạng mục bóc tách
            </span>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-muted-foreground mr-2">Tổng chi phí định lượng:</span>
                <span className="font-mono text-sm font-semibold text-teal-700 dark:text-teal-400">
                  {formatVND(bomData.priced_items_subtotal_vnd)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
