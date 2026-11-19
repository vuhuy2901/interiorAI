import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { dashboardApi } from "../api/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "./StatusIcon";
import { AgentIdentity } from "./AgentIdentity";
import {
  Activity,
  BarChart3,
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowUpDown,
  Filter,
  ExternalLink,
  Layers,
  Calendar,
  PieChart as PieIcon,
  Flame,
  Info,
  RefreshCw,
} from "lucide-react";
import type {
  Agent,
  Project,
  AgentPerformanceRankingItem,
  LongestRunItem,
  AgentAnalyticsReport,
} from "@paperclipai/shared";

interface AgentPerformanceAnalyticsProps {
  companyId: string;
  agents?: Agent[];
  projects?: Project[];
}

type SortField = "runs" | "runtime" | "success" | "failed";

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

export function AgentPerformanceAnalytics({
  companyId,
  agents = [],
  projects = [],
}: AgentPerformanceAnalyticsProps) {
  // Filter States
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [rankingSort, setRankingSort] = useState<SortField>("runs");

  // Query Data
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      "agent-analytics",
      companyId,
      timeRange,
      selectedAgentId,
      selectedProjectId,
      selectedStatus,
    ],
    queryFn: () =>
      dashboardApi.agentAnalytics(companyId, {
        range: timeRange,
        agentId: selectedAgentId || undefined,
        projectId: selectedProjectId || undefined,
        status: selectedStatus || undefined,
      }),
    enabled: !!companyId,
  });

  // Sorted Ranking Items
  const sortedRanking = useMemo(() => {
    if (!report?.ranking) return [];
    const list = [...report.ranking];
    switch (rankingSort) {
      case "runtime":
        return list.sort((a, b) => b.totalRuntimeSeconds - a.totalRuntimeSeconds);
      case "success":
        return list.sort((a, b) => b.successRate - a.successRate);
      case "failed":
        return list.sort((a, b) => b.failedRuns - a.failedRuns);
      case "runs":
      default:
        return list.sort((a, b) => b.totalRuns - a.totalRuns);
    }
  }, [report?.ranking, rankingSort]);

  // Max runtime for horizontal bars
  const maxRuntimeInGroup = useMemo(() => {
    if (!report?.runtimeStats || report.runtimeStats.length === 0) return 1;
    return Math.max(...report.runtimeStats.map((s) => s.totalRuntimeSeconds), 1);
  }, [report?.runtimeStats]);

  // Donut chart calculations
  const donutData = useMemo(() => {
    const dist = report?.executionDistribution;
    if (!dist || dist.total === 0) {
      return { total: 0, segments: [] };
    }
    const total = dist.total;
    const slices = [
      { label: "Successful", count: dist.successful, color: "#10b981", percent: (dist.successful / total) * 100 },
      { label: "Failed", count: dist.failed, color: "#ef4444", percent: (dist.failed / total) * 100 },
      { label: "Recovered", count: dist.recovered, color: "#f59e0b", percent: (dist.recovered / total) * 100 },
      { label: "Cancelled", count: dist.cancelled, color: "#8b5cf6", percent: (dist.cancelled / total) * 100 },
    ];
    return { total, segments: slices };
  }, [report?.executionDistribution]);

  // Trend line chart SVG calculation
  const trendSvgData = useMemo(() => {
    const trends = report?.usageTrends ?? [];
    if (trends.length < 2) return null;

    const maxCount = Math.max(...trends.map((t) => t.total), 5);
    const width = 600;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;

    const points = trends.map((t, idx) => {
      const x = paddingX + (idx / (trends.length - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (t.total / maxCount) * (height - 2 * paddingY);
      return { x, y, total: t.total, date: t.date };
    });

    const pathD = points.reduce(
      (acc, pt, i) => (i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`),
      "",
    );

    const areaD = `${pathD} L ${points[points.length - 1].x},${height - paddingY} L ${points[0].x},${height - paddingY} Z`;

    return { width, height, points, pathD, areaD, maxCount, trends };
  }, [report?.usageTrends]);

  return (
    <div className="w-full rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/50 via-slate-50/70 to-purple-50/50 p-5 shadow-sm transition-all dark:border-indigo-900/40 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-indigo-950/40 md:p-7">
      {/* Header & Controls Bar */}
      <div className="flex flex-col gap-4 border-b border-indigo-100/80 pb-5 dark:border-indigo-900/30 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Activity className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              AGENT PERFORMANCE & ANALYTICS – THỐNG KÊ HIỆU SUẤT AGENTS
            </h2>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Báo cáo phân tích chuyên sâu hiệu năng hoạt động, thời gian xử lý và xu hướng thực thi của toàn bộ Đa Tác Tử.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time Range Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 text-xs shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              <option value="24h">24 Giờ qua</option>
              <option value="7d">7 Ngày qua</option>
              <option value="30d">30 Ngày qua</option>
              <option value="90d">90 Ngày qua</option>
              <option value="all">Toàn bộ thời gian</option>
            </select>
          </div>

          {/* Agent Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 text-xs shadow-2xs">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="">Tất cả Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 text-xs shadow-2xs">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer max-w-[130px] truncate"
            >
              <option value="">Tất cả Dự án</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 text-xs shadow-2xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              <option value="">Tất cả Trạng thái</option>
              <option value="succeeded">Thành công (Succeeded)</option>
              <option value="failed">Thất bại (Failed)</option>
              <option value="cancelled">Hủy bỏ (Cancelled)</option>
              <option value="running">Đang chạy (Running)</option>
            </select>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8 p-0"
            title="Làm mới thống kê"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-indigo-600" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm font-medium">Đang tổng hợp dữ liệu phân tích hiệu suất thực tế...</p>
        </div>
      ) : isError ? (
        <div className="my-6 rounded-xl border border-red-200 bg-red-50/60 p-6 text-center dark:border-red-900/30 dark:bg-red-950/20">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">Không thể tải dữ liệu thống kê</h4>
          <p className="text-xs text-red-700/80 dark:text-red-300/70 mt-1 max-w-md mx-auto">
            {error instanceof Error ? error.message : "Đã xảy ra lỗi khi truy vấn cơ sở dữ liệu."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Thử lại
          </Button>
        </div>
      ) : !report || (report.ranking.length === 0 && report.longestRuns.length === 0) ? (
        /* Empty State */
        <div className="my-6 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Bot className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-semibold text-foreground">Chưa có dữ liệu lượt chạy trong khoảng thời gian này</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Hệ thống chưa ghi nhận lượt thực thi nào khớp với bộ lọc đã chọn. Hãy thử nới rộng khoảng thời gian hoặc điều chỉnh bộ lọc.
          </p>
        </div>
      ) : (
        /* Analytics Content Grid */
        <div className="mt-6 space-y-6">
          {/* SECTION A: Agent Performance Ranking */}
          <Card className="overflow-hidden border border-border/80 bg-card/90 shadow-2xs backdrop-blur-xs">
            <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-amber-500" />
                  Bảng Xếp Hạng Hiệu Suất Agent (Agent Performance Ranking)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Đánh giá chi tiết hiệu suất thực thi, tỷ lệ thành công và số lượng task hoàn thành của từng tác tử.
                </p>
              </div>

              {/* Sorting Filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Sắp xếp theo:
                </span>
                <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
                  <button
                    onClick={() => setRankingSort("runs")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      rankingSort === "runs"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Chạy nhiều nhất
                  </button>
                  <button
                    onClick={() => setRankingSort("runtime")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      rankingSort === "runtime"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Chạy lâu nhất
                  </button>
                  <button
                    onClick={() => setRankingSort("success")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      rankingSort === "success"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tỷ lệ cao nhất
                  </button>
                  <button
                    onClick={() => setRankingSort("failed")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      rankingSort === "failed"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Nhiều lỗi nhất
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] border-b border-border/50">
                  <tr>
                    <th className="py-3 px-4">Thứ hạng & Agent</th>
                    <th className="py-3 px-4 text-center">Tổng lượt chạy</th>
                    <th className="py-3 px-4 text-center">Tổng thời gian</th>
                    <th className="py-3 px-4 text-center">Thời gian TB</th>
                    <th className="py-3 px-4 text-center">Tỷ lệ thành công</th>
                    <th className="py-3 px-4 text-center">Lượt chạy lỗi</th>
                    <th className="py-3 px-4 text-center">Tasks hoàn thành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedRanking.map((item, index) => {
                    const agentMeta = agents.find((a) => a.id === item.agentId);
                    return (
                      <tr key={item.agentId} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                index === 0
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : index === 1
                                    ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                    : index === 2
                                      ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                                      : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <AgentIdentity
                              agent={agentMeta ?? { id: item.agentId, name: item.agentName }}
                              size="sm"
                              className="font-medium"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium">
                          {item.totalRuns}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-muted-foreground">
                          {formatDuration(item.totalRuntimeSeconds)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-muted-foreground">
                          {formatDuration(item.avgRuntimeSeconds)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              item.successRate >= 90
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40"
                                : item.successRate >= 70
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40"
                            }`}
                          >
                            {item.successRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {item.failedRuns > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">{item.failedRuns}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.completedTasks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* MIDDLE ROW: 3 Visual Analytics Cards */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* SECTION B: Runtime Analytics (Horizontal Bar Chart) */}
            <Card className="flex flex-col border border-border/80 bg-card/90 p-5 shadow-2xs backdrop-blur-xs">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-indigo-600" />
                  Thống Kê Thời Gian Chạy (Runtime Analytics)
                </h3>
                <p className="text-xs text-muted-foreground">
                  So sánh tổng thời gian xử lý và tìm tác tử tiêu tốn nhiều tài nguyên nhất.
                </p>
              </div>

              <div className="flex-1 space-y-3.5 overflow-y-auto max-h-[300px] pr-1">
                {report.runtimeStats.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">Chưa có dữ liệu runtime</p>
                ) : (
                  report.runtimeStats.map((item, idx) => {
                    const percent = Math.min(100, Math.round((item.totalRuntimeSeconds / maxRuntimeInGroup) * 100));
                    return (
                      <div key={item.agentId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate max-w-[170px]" title={item.agentName}>
                            {item.agentName}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground font-semibold">
                            {formatDuration(item.totalRuntimeSeconds)}
                          </span>
                        </div>
                        {/* Horizontal Bar */}
                        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              idx === 0
                                ? "bg-indigo-600"
                                : idx === 1
                                  ? "bg-purple-500"
                                  : "bg-sky-500"
                            }`}
                            style={{ width: `${Math.max(percent, 3)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground/75">
                          <span>TB: {formatDuration(item.avgRuntimeSeconds)}</span>
                          <span>Max: {formatDuration(item.maxRuntimeSeconds)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* SECTION C: Execution Results (Donut Chart) */}
            <Card className="flex flex-col border border-border/80 bg-card/90 p-5 shadow-2xs backdrop-blur-xs">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <PieIcon className="h-4 w-4 text-emerald-600" />
                  Kết Quả Thực Thi (Execution Results)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Phân bố trạng thái thực thi của các tác vụ theo tỷ lệ phần trăm.
                </p>
              </div>

              {/* Donut Chart Presentation */}
              <div className="flex flex-1 flex-col items-center justify-center py-2">
                <div className="relative flex items-center justify-center">
                  <svg className="size-36 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-muted/20" />
                    {donutData.total > 0 && (() => {
                      let accumulatedPercent = 0;
                      const circumference = 2 * Math.PI * 38; // ~238.76
                      return donutData.segments.map((seg) => {
                        if (seg.count === 0) return null;
                        const dashLength = (seg.percent / 100) * circumference;
                        const dashOffset = -(accumulatedPercent / 100) * circumference;
                        accumulatedPercent += seg.percent;
                        return (
                          <circle
                            key={seg.label}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="12"
                            strokeDasharray={`${dashLength} ${circumference}`}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-700"
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Center Text */}
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="font-mono text-xl font-bold tracking-tight text-foreground">
                      {donutData.total}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Lượt chạy</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 w-full pt-2 border-t border-border/50 text-xs">
                  {donutData.segments.map((seg) => (
                    <div key={seg.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-muted-foreground truncate">{seg.label}</span>
                      </div>
                      <span className="font-mono font-medium text-foreground ml-1">
                        {seg.count} ({donutData.total > 0 ? seg.percent.toFixed(0) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* SECTION D: Agent Usage Trends (Line Chart) */}
            <Card className="flex flex-col border border-border/80 bg-card/90 p-5 shadow-2xs backdrop-blur-xs">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-purple-600" />
                  Xu Hướng Sử Dụng Agent (Agent Usage Trends)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Biểu đồ lượt thực thi hàng ngày giúp phát hiện mức độ biến thiên tải.
                </p>
              </div>

              <div className="flex flex-1 flex-col items-center justify-center w-full">
                {trendSvgData ? (
                  <div className="w-full flex-1 flex flex-col justify-between">
                    <svg
                      viewBox={`0 0 ${trendSvgData.width} ${trendSvgData.height}`}
                      className="w-full h-auto overflow-visible py-2"
                    >
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      <line x1="40" y1="25" x2="560" y2="25" stroke="currentColor" strokeDasharray="3 3" className="text-muted/30" />
                      <line x1="40" y1="85" x2="560" y2="85" stroke="currentColor" strokeDasharray="3 3" className="text-muted/30" />
                      <line x1="40" y1="155" x2="560" y2="155" stroke="currentColor" className="text-border" />

                      {/* Area Fill */}
                      <path d={trendSvgData.areaD} fill="url(#trendGradient)" />

                      {/* Trend Line */}
                      <path d={trendSvgData.pathD} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />

                      {/* Data Points */}
                      {trendSvgData.points.map((pt, i) => (
                        <g key={i}>
                          <circle cx={pt.x} cy={pt.y} r="3.5" fill="#8b5cf6" stroke="#ffffff" strokeWidth="1.5" />
                          <title>{`${pt.date}: ${pt.total} lượt chạy`}</title>
                        </g>
                      ))}
                    </svg>

                    {/* Timeline labels */}
                    <div className="flex justify-between text-[10px] text-muted-foreground/75 px-3 pt-1 border-t border-border/40 w-full font-mono">
                      <span>{trendSvgData.trends[0]?.date}</span>
                      <span>{trendSvgData.trends[Math.floor(trendSvgData.trends.length / 2)]?.date}</span>
                      <span>{trendSvgData.trends[trendSvgData.trends.length - 1]?.date}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Cần ít nhất 2 ngày dữ liệu để vẽ đường xu hướng.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* SECTION E: Top Longest Runs */}
          <Card className="overflow-hidden border border-border/80 bg-card/90 shadow-2xs backdrop-blur-xs">
            <div className="border-b border-border/60 p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-sky-600" />
                Top Longest Runs – Những Lượt Chạy Lâu Nhất
              </h3>
              <p className="text-xs text-muted-foreground">
                Danh sách các phiên thực thi có thời lượng kéo dài nhất cần được lưu ý tối ưu hóa hoặc kiểm tra hiệu năng.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] border-b border-border/50">
                  <tr>
                    <th className="py-3 px-4">Run ID</th>
                    <th className="py-3 px-4">Agent Name</th>
                    <th className="py-3 px-4">Workflow / Task</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4 text-center">Runtime</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Started At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {report.longestRuns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                        Không có lượt chạy nào được ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    report.longestRuns.map((run) => (
                      <tr key={run.runId} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          {run.taskId ? (
                            <Link
                              to={`/issues/${run.taskIdentifier ?? run.taskId}`}
                              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                              title="Xem chi tiết task"
                            >
                              {run.runId.slice(0, 8)}
                              <ExternalLink className="h-3 w-3 opacity-70" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{run.runId.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-sans font-medium text-foreground">
                          {run.agentName}
                        </td>
                        <td className="py-3 px-4 font-sans truncate max-w-[200px]" title={run.taskTitle}>
                          {run.taskIdentifier ? `[${run.taskIdentifier}] ` : ""}
                          {run.taskTitle}
                        </td>
                        <td className="py-3 px-4 font-sans text-muted-foreground">
                          {run.projectName}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-foreground">
                          {formatDuration(run.runtimeSeconds)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              run.status === "succeeded"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : run.status === "failed" || run.status === "timed_out"
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                  : run.status === "cancelled"
                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-[11px]">
                          {run.startedAt ? new Date(run.startedAt).toLocaleString("vi-VN") : "N/A"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
