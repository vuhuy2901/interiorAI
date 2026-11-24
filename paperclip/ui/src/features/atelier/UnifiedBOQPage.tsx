import React, { useEffect, useRef, useState } from "react";
import { useAtelierStudio } from "./AtelierStudioContext";
import { useTheme } from "@/context/ThemeContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import {
  Calculator,
  Download,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  X,
  Box,
  Package,
  Building2,
  Clock,
  UserCheck,
  ArrowRight,
  Info,
} from "lucide-react";

interface MaterialSpecDetail {
  board_core: string;
  surface_finish: string;
  color_code: string;
  thickness_desc: string;
  thickness_mm?: number;
  brand_product_code: string;
  warranty_desc?: string;
}

interface MaterialProposalOption {
  option_id: string;
  title: string;
  board_core: string;
  surface_finish: string;
  color_code: string;
  thickness_desc: string;
  brand: string;
  product_code: string;
  pros: string[];
  cons: string[];
  durability_score: number;
  price_tier: "economy" | "standard" | "premium";
  proposed_by_agent: string;
  is_recommended: boolean;
}

interface SupplierQuoteOption {
  quote_id: string;
  supplier_name: string;
  sku: string;
  unit_price_vnd: number;
  unit: string;
  source_type: string;
  source_url?: string | null;
  queried_at: string;
  notes?: string | null;
  is_verified: boolean;
}

interface BOMSubItem {
  part_id: string;
  part_name: string;
  specification: string;
  quantity: number;
  unit: string;
  unit_price_vnd?: number | null;
  subtotal_vnd?: number | null;
  waste_rate: number;
  notes?: string | null;
}

interface UnifiedBOQItem {
  id: string;
  group_id: string;
  group_label: string;
  item_type: string;
  name: string;
  room_id?: string | null;
  room_name?: string | null;
  dimensions_desc: string;
  dimensions_mm?: number[] | null;
  quantity: number;
  unit: string;
  waste_rate: number;
  selected_material_spec?: MaterialSpecDetail | null;
  material_proposals: MaterialProposalOption[];
  supplier_quotes: SupplierQuoteOption[];
  selected_quote_id?: string | null;
  unit_price_vnd?: number | null;
  subtotal_vnd?: number | null;
  price_status: string;
  approval_state: string;
  proposed_by_agent: string;
  approved_by?: string | null;
  approved_at?: string | null;
  decision_version: string;
  calculation_formula: string;
  bom_breakdown: BOMSubItem[];
  is_included_in_total: boolean;
  source_entity_id?: string | null;
}

interface BOQGroupSummary {
  group_id: string;
  group_label: string;
  item_count: number;
  subtotal_vnd: number;
  priced_count: number;
  unpriced_count: number;
}

interface UnifiedProjectBOQ {
  project_id: string;
  project_name: string;
  revision: number;
  budget_limit_vnd: number;
  items: UnifiedBOQItem[];
  groups: BOQGroupSummary[];
  total_calculated_vnd: number;
  total_approved_vnd: number;
  unpriced_items_count: number;
  tax_rate: number;
  tax_vnd: number;
  total_with_tax_vnd: number;
  budget_variance_vnd: number;
  is_within_budget: boolean;
  generated_at: string;
}

function formatVnd(val?: number | null): string {
  if (val === undefined || val === null) return "Chưa có báo giá";
  return new Intl.NumberFormat("vi-VN").format(Math.round(val)) + " ₫";
}

export function UnifiedBOQPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    refreshProjectBundle,
    showToast,
  } = useAtelierStudio();

  const [boqData, setBoqData] = useState<UnifiedProjectBOQ | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedBomItems, setExpandedBomItems] = useState<Record<string, boolean>>({});

  // Slide-over Detail Drawer
  const [activeItem, setActiveItem] = useState<UnifiedBOQItem | null>(null);
  const [selectedOptId, setSelectedOptId] = useState<string>("");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [customQuotePrice, setCustomQuotePrice] = useState<string>("");
  const [customQuoteSupplier, setCustomQuoteSupplier] = useState<string>("");
  const [savingDecision, setSavingDecision] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất 2D/3D" },
      { label: "Bảng Dự Toán Khối Lượng & Ngân Sách (BOQ)" },
    ]);
  }, [setBreadcrumbs]);

  // Load BOQ whenever active project changes
  const boqRequestedPid = useRef("");
  const fetchBOQ = async (pid: string) => {
    if (!pid) return;
    boqRequestedPid.current = pid;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${pid}/unified-boq`);
      if (!res.ok) {
        throw new Error(`Không thể tải bảng dự toán BOQ (HTTP ${res.status})`);
      }
      const data: UnifiedProjectBOQ = await res.json();
      if (boqRequestedPid.current !== pid) return; // response của dự án trước, bỏ qua
      setBoqData(data);

      // Default expand all returned groups
      const exp: Record<string, boolean> = {};
      data.groups.forEach((g) => {
        exp[g.group_id] = true;
      });
      setExpandedGroups(exp);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // FEAT-2026-131: không tự mượn dự án đầu danh sách hay dự án mẫu; xóa BOQ cũ ngay khi đổi dự án.
    setBoqData(null);
    if (!activeProjectId) return;
    void fetchBOQ(activeProjectId);
  }, [activeProjectId]);

  const handleProjectChange = async (newPid: string) => {
    setActiveProjectId(newPid);
    setActiveItem(null);
    await refreshProjectBundle(newPid);
    await fetchBOQ(newPid);
    showToast(`Đã chuyển sang công trình: ${newPid}`);
  };

  const handleOpenItemDetail = (item: UnifiedBOQItem) => {
    setActiveItem(item);
    if (item.material_proposals && item.material_proposals.length > 0) {
      const rec = item.material_proposals.find((p) => p.is_recommended);
      setSelectedOptId(rec ? rec.option_id : item.material_proposals[0].option_id);
    } else {
      setSelectedOptId("");
    }
    setSelectedQuoteId(item.selected_quote_id || (item.supplier_quotes?.[0]?.quote_id ?? ""));
    setCustomQuotePrice("");
    setCustomQuoteSupplier("");
  };

  const handleSaveDecision = async () => {
    if (!activeItem || !boqData) return;
    setSavingDecision(true);
    try {
      const payload: any = {
        selected_option_id: selectedOptId || null,
        selected_quote_id: selectedQuoteId || null,
        approved: true,
        approved_by: "Chủ Project (TUAN)",
      };

      if (customQuotePrice && !isNaN(Number(customQuotePrice))) {
        payload.custom_quote = {
          supplier_name: customQuoteSupplier || "Báo giá gia chủ tự cung cấp",
          unit_price_vnd: Number(customQuotePrice),
          source_url: null,
        };
      }

      const res = await fetch(
        `/api/v1/projects/${boqData.project_id}/boq-items/${activeItem.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        throw new Error(`Lỗi cập nhật quyết định (HTTP ${res.status})`);
      }

      const result = await res.json();
      if (result.ok && result.updated_boq) {
        setBoqData(result.updated_boq);
        const updatedTarget = result.updated_boq.items.find((it: UnifiedBOQItem) => it.id === activeItem.id);
        if (updatedTarget) setActiveItem(updatedTarget);
        showToast(`🎉 Đã phê duyệt vật liệu & giá cho ${activeItem.name}!`);
      }
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`);
    } finally {
      setSavingDecision(false);
    }
  };

  const toggleGroup = (gid: string) => {
    setExpandedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  };

  const toggleBom = (itemId: string) => {
    setExpandedBomItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Rooms list for filtering
  const roomNames = Array.from(
    new Set(
      (boqData?.items || [])
        .map((it) => it.room_name)
        .filter((r): r is string => Boolean(r))
    )
  );

  // Filter items
  const filteredItems = (boqData?.items || []).filter((it) => {
    if (roomFilter !== "all" && it.room_name !== roomFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = it.name.toLowerCase().includes(q);
      const matchCore = it.selected_material_spec?.board_core.toLowerCase().includes(q);
      const matchColor = it.selected_material_spec?.color_code.toLowerCase().includes(q);
      if (!matchName && !matchCore && !matchColor) return false;
    }
    return true;
  });

  return (
    <div className="atelier-surface-root h-full overflow-y-auto" data-theme={theme}>
      <div className="page-container space-y-6 p-6">
        {/* TOP HEADER BAR */}
        <div className="page-header-bar flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="size-5 text-teal-600" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                BẢNG DỰ TOÁN KHỐI LƯỢNG & QUẢN TRỊ NGÂN SÁCH (BOQ)
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Hợp nhất bóc tách BOM kỹ thuật và dự toán BOQ xác định theo công trình thực tế. AI đề xuất vật liệu, gia chủ lựa chọn và chốt báo giá minh bạch.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => boqData && fetchBOQ(boqData.project_id)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Làm mới</span>
            </button>

            <a
              href={`/api/v1/projects/${boqData?.project_id || activeProjectId}/unified-boq/export/xlsx`}
              download
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-teal-800"
            >
              <Download className="size-3.5" />
              <span>Xuất Báo Giá Excel (.xlsx)</span>
            </a>
          </div>
        </div>

        {/* 1. PROJECT SELECTOR & FILTER TOOLBAR */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:grid-cols-12">
          {/* Project Selector */}
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Công trình / Dự án đang xem:
            </label>
            <div className="relative">
              <select
                value={boqData?.project_id || activeProjectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs font-medium text-foreground shadow-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                {projects && projects.length > 0 ? (
                  projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.name} (#{p.revision})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="proj_kid_bedroom">
                      Phòng Ngủ Trẻ Em — Giường Tầng & Tủ Áo (3.6m × 3.2m)
                    </option>
                    <option value="proj_bedroom_japandi_4x4m">
                      Phòng Ngủ Master Japandi (4.19m × 4.04m)
                    </option>
                    <option value="proj_demo_4x5m">
                      Căn hộ Studio Phòng Khách 4×5m — Japandi Minh Họa
                    </option>
                  </>
                )}
              </select>
              <Building2 className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* Room Filter */}
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Khu vực / Phòng:
            </label>
            <div className="relative">
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs font-medium text-foreground shadow-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="all">Tất cả khu vực ({boqData?.items.length || 0})</option>
                {roomNames.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <Filter className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* Search box */}
          <div className="md:col-span-5">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Tìm kiếm hạng mục, vật liệu, màu sắc:
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="VD: Tủ quần áo, óc chó, melamine, An Cường..."
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs font-medium text-foreground shadow-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* FINANCIAL SUMMARY METRICS */}
        {boqData && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-teal-600/30 bg-teal-50/40 p-4 dark:bg-teal-950/20">
              <div className="text-[11px] font-semibold tracking-wider text-teal-800 uppercase dark:text-teal-300">
                TỔNG DỰ TOÁN (GỒM VAT 8%)
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-teal-900 dark:text-teal-100">
                {formatVnd(boqData.total_with_tax_vnd)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Trước thuế: {formatVnd(boqData.total_calculated_vnd)}</span>
                <span>•</span>
                <span>VAT 8%: {formatVnd(boqData.tax_vnd)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                TIẾN ĐỘ PHÊ DUYỆT VẬT LIỆU
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {boqData.items.filter((it) => it.approval_state === "USER_APPROVED").length} / {boqData.items.length} hạng mục
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                <span>Đã chốt: {formatVnd(boqData.total_approved_vnd)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                TRẠNG THÁI BÁO GIÁ
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {boqData.unpriced_items_count === 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400">100% Đầy đủ báo giá</span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    {boqData.unpriced_items_count} mục chờ báo giá
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Dữ liệu có nguồn xác minh từ thị trường Việt Nam
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                SO VỚI NGÂN SÁCH ({formatVnd(boqData.budget_limit_vnd)})
              </div>
              <div
                className={`mt-1 font-mono text-xl font-bold ${
                  boqData.is_within_budget ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {boqData.is_within_budget
                  ? `Tiết kiệm ${formatVnd(boqData.budget_variance_vnd)}`
                  : `Vượt ngân sách ${formatVnd(Math.abs(boqData.budget_variance_vnd))}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {boqData.is_within_budget ? "✓ Đạt tiêu chuẩn tài chính gia chủ" : "⚠️ Cần tối ưu phân khúc vật tư"}
              </div>
            </div>
          </div>
        )}

        {/* LOADING & ERROR STATES */}
        {loading && (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <RefreshCw className="mr-2 size-4 animate-spin text-teal-600" />
            Đang tải dữ liệu bóc tách và dự toán BOQ theo công trình...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="mr-1.5 inline size-4" />
            {error}
          </div>
        )}

        {/* 2. GROUPED BOQ ITEMS ACCORDIONS */}
        {!loading && boqData && (
          <div className="space-y-4">
            {boqData.groups.map((grp) => {
              const grpItems = filteredItems.filter((it) => it.group_id === grp.group_id);
              if (grpItems.length === 0) return null;

              const isExp = expandedGroups[grp.group_id] ?? true;

              return (
                <div
                  key={grp.group_id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
                >
                  {/* Group Header Banner */}
                  <div
                    onClick={() => toggleGroup(grp.group_id)}
                    className="flex cursor-pointer select-none items-center justify-between border-b border-border bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/70"
                  >
                    <div className="flex items-center gap-2">
                      {isExp ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <span className="font-semibold text-foreground text-sm">
                        {grp.group_label.toUpperCase()}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {grpItems.length} hạng mục
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Tạm tính nhóm:</span>
                      <span className="font-mono text-sm font-bold text-foreground">
                        {formatVnd(grp.subtotal_vnd)}
                      </span>
                    </div>
                  </div>

                  {/* Group Items Table */}
                  {isExp && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border bg-secondary/20 text-[11px] font-semibold text-muted-foreground uppercase">
                          <tr>
                            <th className="w-12 px-3 py-2.5 text-center">STT</th>
                            <th className="px-3 py-2.5">Hạng Mục & Quy Cách</th>
                            <th className="px-3 py-2.5">Khu Vực</th>
                            <th className="px-3 py-2.5">Vật Liệu Đã Chốt</th>
                            <th className="w-24 px-3 py-2.5 text-right">Khối Lượng</th>
                            <th className="w-32 px-3 py-2.5 text-right">Đơn Giá</th>
                            <th className="w-36 px-3 py-2.5 text-right">Thành Tiền</th>
                            <th className="w-32 px-3 py-2.5 text-center">Trạng Thái</th>
                            <th className="w-28 px-3 py-2.5 text-center">Thao Tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {grpItems.map((it, idx) => {
                            const spec = it.selected_material_spec;
                            const isApproved = it.approval_state === "USER_APPROVED";
                            const bomExp = expandedBomItems[it.id] ?? false;

                            return (
                              <React.Fragment key={it.id}>
                                <tr className="transition-colors hover:bg-secondary/30">
                                  <td className="px-3 py-3 text-center font-mono text-muted-foreground">
                                    {idx + 1}
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="font-semibold text-foreground">
                                      {it.name}
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                      {it.dimensions_desc || "Kích thước theo thiết kế"}
                                    </div>
                                    {it.bom_breakdown && it.bom_breakdown.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleBom(it.id)}
                                        className="mt-1.5 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-teal-800 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-950"
                                      >
                                        <Layers className="size-3" />
                                        <span>
                                          {bomExp ? "Ẩn" : "Xem"} bóc tách BOM ({it.bom_breakdown.length} chi tiết)
                                        </span>
                                      </button>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 text-muted-foreground">
                                    {it.room_name || "—"}
                                  </td>

                                  <td className="px-3 py-3">
                                    {spec ? (
                                      <div>
                                        <div className="font-medium text-foreground">
                                          {spec.board_core}
                                        </div>
                                        <div className="text-[11px] text-teal-800 dark:text-teal-300">
                                          {spec.surface_finish} • {spec.color_code}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {spec.brand_product_code}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="italic text-muted-foreground">Theo quy cách hoàn thiện</span>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 text-right">
                                    <span className="font-mono font-medium text-foreground">
                                      {it.quantity}
                                    </span>{" "}
                                    <span className="text-[11px] text-muted-foreground">{it.unit}</span>
                                    {it.waste_rate > 0 && (
                                      <div className="text-[10px] text-muted-foreground">
                                        (Hao hụt {Math.round(it.waste_rate * 100)}%)
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                                    {formatVnd(it.unit_price_vnd)}
                                  </td>

                                  <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                                    {formatVnd(it.subtotal_vnd)}
                                  </td>

                                  <td className="px-3 py-3 text-center">
                                    {isApproved ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        <CheckCircle2 className="size-3" />
                                        <span>Đã chốt</span>
                                      </span>
                                    ) : it.unit_price_vnd ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        <Clock className="size-3" />
                                        <span>Tham khảo</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-600/30 bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                                        <AlertCircle className="size-3" />
                                        <span>Chờ giá</span>
                                      </span>
                                    )}
                                    {it.approved_by && (
                                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        Duyệt: {it.approved_by}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenItemDetail(it)}
                                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs hover:border-teal-600 hover:bg-teal-50/50 hover:text-teal-800 dark:hover:bg-teal-950/50"
                                    >
                                      <span>Chọn vật liệu</span>
                                      <ArrowRight className="size-3" />
                                    </button>
                                  </td>
                                </tr>

                                {/* BOM SUB-ITEMS BREAKDOWN (IF EXPANDED) */}
                                {bomExp && it.bom_breakdown && it.bom_breakdown.length > 0 && (
                                  <tr className="bg-secondary/15">
                                    <td colSpan={9} className="p-3">
                                      <div className="rounded-lg border border-border bg-background p-3 shadow-2xs">
                                        <div className="mb-2 flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                            <Layers className="size-3.5 text-teal-600" />
                                            <span>Bóc Tách Chi Tiết Cấu Thành (BOM) — {it.name}</span>
                                          </div>
                                          <span className="rounded bg-teal-50 px-2 py-0.5 text-[10.5px] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                            ✓ Đã bao gồm trong giá thành phẩm tủ — Không cộng trùng
                                          </span>
                                        </div>

                                        <table className="w-full text-left text-[11px]">
                                          <thead className="border-b border-border text-muted-foreground">
                                            <tr>
                                              <th className="py-1">Chi Tiết Cấu Thành</th>
                                              <th className="py-1">Quy Cách Kỹ Thuật</th>
                                              <th className="py-1 text-right">Khối Lượng</th>
                                              <th className="py-1 text-center">Đơn Vị</th>
                                              <th className="py-1 text-center">Hao Hụt</th>
                                              <th className="py-1 text-right">Đơn Giá Tham Khảo</th>
                                              <th className="py-1 text-right">Ghi Chú</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-border/60">
                                            {it.bom_breakdown.map((part) => (
                                              <tr key={part.part_id}>
                                                <td className="py-1.5 font-medium text-foreground">
                                                  {part.part_name}
                                                </td>
                                                <td className="py-1.5 text-muted-foreground">
                                                  {part.specification}
                                                </td>
                                                <td className="py-1.5 text-right font-mono">
                                                  {part.quantity}
                                                </td>
                                                <td className="py-1.5 text-center text-muted-foreground">
                                                  {part.unit}
                                                </td>
                                                <td className="py-1.5 text-center font-mono">
                                                  {Math.round(part.waste_rate * 100)}%
                                                </td>
                                                <td className="py-1.5 text-right font-mono text-muted-foreground">
                                                  {formatVnd(part.unit_price_vnd)}
                                                </td>
                                                <td className="py-1.5 text-right text-[10.5px] text-muted-foreground">
                                                  {part.notes || "—"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 3. SLIDE-OVER DETAIL DRAWER FOR MATERIAL PROPOSALS & QUOTES */}
        {activeItem && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
            <div className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-teal-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                      {activeItem.group_label}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{activeItem.room_name}</span>
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-foreground">
                    {activeItem.name}
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    Kích thước Scene: {activeItem.dimensions_desc || "Theo hình học 3D"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Drawer Content Body */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6 text-xs">
                {/* Section A: Materials AI Proposals */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-foreground text-sm">
                      <Sparkles className="size-4 text-teal-600" />
                      <span>1. Đề Xuất Vật Liệu Từ Materials AI</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Đề xuất theo công năng & độ bền
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {activeItem.material_proposals.map((prop) => {
                      const isSelected = selectedOptId === prop.option_id;

                      return (
                        <div
                          key={prop.option_id}
                          onClick={() => setSelectedOptId(prop.option_id)}
                          className={`cursor-pointer rounded-lg border p-3.5 transition-all ${
                            isSelected
                              ? "border-teal-600 bg-teal-50/30 ring-1 ring-teal-600 dark:bg-teal-950/20"
                              : "border-border bg-background hover:border-border/80 hover:bg-secondary/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={isSelected}
                                onChange={() => setSelectedOptId(prop.option_id)}
                                className="size-4 text-teal-600 focus:ring-teal-500"
                              />
                              <h4 className="font-semibold text-foreground text-xs">
                                {prop.title}
                              </h4>
                            </div>

                            {prop.is_recommended && (
                              <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                Khuyên dùng
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 gap-2 rounded bg-secondary/40 p-2.5 text-[11px]">
                            <div>
                              <span className="text-muted-foreground">Loại cốt ván: </span>
                              <span className="font-medium text-foreground">{prop.board_core}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Bề mặt: </span>
                              <span className="font-medium text-foreground">{prop.surface_finish}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Màu / Vân gỗ: </span>
                              <span className="font-semibold text-teal-800 dark:text-teal-300">
                                {prop.color_code}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Quy cách độ dày: </span>
                              <span className="font-mono text-foreground">{prop.thickness_desc}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Thương hiệu & Mã SP: </span>
                              <span className="font-mono font-medium text-foreground">
                                {prop.brand} ({prop.product_code})
                              </span>
                            </div>
                          </div>

                          {/* Pros & Cons */}
                          <div className="mt-2 space-y-1 text-[11px]">
                            {prop.pros.map((p, pIdx) => (
                              <div key={pIdx} className="text-emerald-700 dark:text-emerald-400">
                                ✓ {p}
                              </div>
                            ))}
                            {prop.cons.map((c, cIdx) => (
                              <div key={cIdx} className="text-amber-700 dark:text-amber-400">
                                ⚠️ {c}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section B: Shopping/Sourcing AI Quotes */}
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-foreground text-sm">
                      <Package className="size-4 text-teal-600" />
                      <span>2. Báo Giá Thực Tế Từ Shopping AI</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Không dùng đơn giá bịa
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeItem.supplier_quotes.map((quote) => {
                      const isQuoteSelected = selectedQuoteId === quote.quote_id;

                      return (
                        <div
                          key={quote.quote_id}
                          onClick={() => setSelectedQuoteId(quote.quote_id)}
                          className={`flex cursor-pointer items-start justify-between rounded-lg border p-3 transition-all ${
                            isQuoteSelected
                              ? "border-teal-600 bg-teal-50/20 ring-1 ring-teal-600 dark:bg-teal-950/20"
                              : "border-border bg-background hover:bg-secondary/20"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="radio"
                              checked={isQuoteSelected}
                              onChange={() => setSelectedQuoteId(quote.quote_id)}
                              className="mt-0.5 size-4 text-teal-600 focus:ring-teal-500"
                            />
                            <div>
                              <div className="font-semibold text-foreground">
                                {quote.supplier_name}
                              </div>
                              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                SKU: {quote.sku} • Tra cứu: {quote.queried_at}
                              </div>
                              {quote.notes && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {quote.notes}
                                </div>
                              )}
                              {quote.source_url && (
                                <a
                                  href={quote.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-teal-700 hover:underline dark:text-teal-400"
                                >
                                  <span>Xem nguồn báo giá</span>
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono text-sm font-bold text-foreground">
                              {formatVnd(quote.unit_price_vnd)}
                            </div>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {quote.source_type}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom Quote Input Option */}
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <div className="font-semibold text-foreground text-xs">
                      Hoặc nhập báo giá thực tế của bạn:
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Tên nhà cung cấp / xưởng mộc..."
                        value={customQuoteSupplier}
                        onChange={(e) => setCustomQuoteSupplier(e.target.value)}
                        className="rounded border border-border bg-background p-1.5 text-xs text-foreground"
                      />
                      <input
                        type="number"
                        placeholder="Đơn giá (VNĐ)..."
                        value={customQuotePrice}
                        onChange={(e) => {
                          setCustomQuotePrice(e.target.value);
                          setSelectedQuoteId("quote_custom_user");
                        }}
                        className="rounded border border-border bg-background p-1.5 text-xs text-foreground"
                      />
                    </div>
                  </div>
                </div>

                {/* Section C: Cost AI Formula Explanation */}
                <div className="rounded-lg border border-border bg-secondary/30 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Info className="size-3.5 text-teal-600" />
                    <span>Công thức dự toán minh bạch (Cost AI):</span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {activeItem.calculation_formula || "Tính theo khối lượng hình học 1:1 mm từ Scene 3D"}
                  </p>
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground">Người phê duyệt:</div>
                  <div className="font-semibold text-foreground">Chủ Project (TUAN)</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    className="rounded-md border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Đóng
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDecision}
                    disabled={savingDecision}
                    className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
                  >
                    <UserCheck className="size-4" />
                    <span>{savingDecision ? "Đang lưu..." : "Phê duyệt vật liệu & Báo giá"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
