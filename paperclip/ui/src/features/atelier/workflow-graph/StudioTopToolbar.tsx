import { useState, useRef, useEffect, memo } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Download,
  Eye,
  GitBranch,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Play,
  Redo2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Undo2,
  Upload,
} from "lucide-react";
import type { LayoutDirection } from "./layout";

export type ProjectOption = {
  id: string;
  name: string;
  workflow_status?: string;
};

export type StudioTopToolbarProps = {
  projectName: string;
  projects: ProjectOption[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  workflowName: string;
  onRenameWorkflow?: (newName: string) => void;
  workflowVersion: number;
  workflowStatus: "draft" | "published" | "active" | "archived";
  isActiveWorkflowForProject: boolean;
  workspaceMode: "design" | "execution";
  onSetWorkspaceMode: (mode: "design" | "execution") => void;
  onAutoLayout: (direction: LayoutDirection) => void;
  layoutDirection: LayoutDirection;
  onFitView: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  validationIssueCount: number;
  onSaveDraft: () => void;
  isDraft: boolean;
  isDirty: boolean;
  isBusy: string;
  onPublish: () => void;
  onActivate: () => void;
  onExecute: () => void;
  canExecute: boolean;
  onExportJson: () => void;
  onImportJson: () => void;
  onAddStickyNote: () => void;
  onToggleMinimap: () => void;
  showMinimap: boolean;
  onBackToProjects: () => void;
};

export const StudioTopToolbar = memo(function StudioTopToolbar({
  projectName,
  projects,
  selectedProjectId,
  onSelectProject,
  workflowName,
  onRenameWorkflow,
  workflowVersion,
  workflowStatus,
  isActiveWorkflowForProject,
  workspaceMode,
  onSetWorkspaceMode,
  onAutoLayout,
  layoutDirection,
  onFitView,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onValidate,
  validationIssueCount,
  onSaveDraft,
  isDraft,
  isDirty,
  isBusy,
  onPublish,
  onActivate,
  onExecute,
  canExecute,
  onExportJson,
  onImportJson,
  onAddStickyNote,
  onToggleMinimap,
  showMinimap,
  onBackToProjects,
}: StudioTopToolbarProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(workflowName);
  const [moreOpen, setMoreOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const moreRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameVal(workflowName);
  }, [workflowName]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
      if (layoutRef.current && !layoutRef.current.contains(event.target as Node)) {
        setLayoutMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleNameSubmit = () => {
    setEditingName(false);
    if (nameVal.trim() && nameVal.trim() !== workflowName && onRenameWorkflow) {
      onRenameWorkflow(nameVal.trim());
    }
  };

  const buttonBase =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 select-none";

  return (
    <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur z-20">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        {/* LEFT SECTION: Project & Workflow Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToProjects}
            title="Quay lại danh sách Projects"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <ArrowLeft className="size-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {/* Project Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">Dự án:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => onSelectProject(e.target.value)}
                className="h-8 max-w-[170px] truncate rounded-md border border-input bg-background/80 px-2 text-xs font-semibold text-foreground outline-none focus:border-primary"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-border">/</span>

            {/* Workflow Name & Version */}
            <div className="flex items-center gap-2 min-w-0">
              {editingName ? (
                <input
                  type="text"
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onBlur={handleNameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameSubmit();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  className="h-7 w-48 rounded border border-primary bg-background px-2 text-xs font-bold"
                />
              ) : (
                <span
                  onClick={() => isDraft && setEditingName(true)}
                  title={isDraft ? "Bấm để đổi tên workflow" : "Workflow đã publish"}
                  className={`truncate text-sm font-bold tracking-tight text-foreground ${
                    isDraft ? "cursor-pointer hover:underline" : ""
                  }`}
                >
                  {workflowName}
                </span>
              )}

              <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                v{workflowVersion}
              </span>

              {/* Status Badge */}
              {isActiveWorkflowForProject ? (
                <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Active
                </span>
              ) : isDraft ? (
                <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  Draft
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                  Published
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CENTER SECTION: Design Mode / Execution Monitor & Graph Tools */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mode Tabs */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => onSetWorkspaceMode("design")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                workspaceMode === "design"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Design Studio
            </button>
            <button
              type="button"
              onClick={() => onSetWorkspaceMode("execution")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition flex items-center gap-1.5 ${
                workspaceMode === "execution"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CirclePlay className="size-3.5" />
              Execution Monitor
            </button>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1 hidden md:block" />

          {/* Auto Layout Dropdown */}
          <div className="relative" ref={layoutRef}>
            <button
              type="button"
              onClick={() => setLayoutMenuOpen(!layoutMenuOpen)}
              className={`${buttonBase} border border-border bg-muted/20 hover:bg-muted text-foreground`}
              title="Tự động căn chỉnh sơ đồ workflow"
            >
              <LayoutGrid className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Auto Layout</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>

            {layoutMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-44 rounded-lg border border-border bg-card p-1 shadow-lg z-30">
                <button
                  type="button"
                  onClick={() => {
                    setLayoutMenuOpen(false);
                    onAutoLayout("RIGHT");
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left ${
                    layoutDirection === "RIGHT" ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
                  }`}
                >
                  <span>Ngang (Horizontal)</span>
                  {layoutDirection === "RIGHT" && <Check className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLayoutMenuOpen(false);
                    onAutoLayout("DOWN");
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left ${
                    layoutDirection === "DOWN" ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
                  }`}
                >
                  <span>Dọc (Vertical)</span>
                  {layoutDirection === "DOWN" && <Check className="size-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Fit View */}
          <button
            type="button"
            onClick={onFitView}
            className={`${buttonBase} border border-border bg-muted/20 hover:bg-muted text-foreground`}
            title="Căn vừa khung nhìn (Fit View)"
          >
            <Eye className="size-3.5" />
            <span className="hidden lg:inline">Fit View</span>
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center rounded-md border border-border bg-muted/20">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="size-3.5" />
            </button>
            <span className="h-3 w-px bg-border" />
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* RIGHT SECTION: Workflow Actions (Validate, Save, Publish, Activate, Execute, More) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Validate */}
          <button
            type="button"
            onClick={onValidate}
            disabled={Boolean(isBusy)}
            title="Kiểm tra tính hợp lệ của graph"
            className={`${buttonBase} border border-border bg-muted/20 hover:bg-muted text-foreground`}
          >
            <ShieldCheck className="size-3.5 text-sky-600" />
            <span className="hidden sm:inline">Validate</span>
            {validationIssueCount > 0 && (
              <span className="ml-1 rounded-full bg-destructive/15 px-1.5 py-0.2 text-[10px] font-bold text-destructive">
                {validationIssueCount}
              </span>
            )}
          </button>

          {/* Save Draft */}
          {isDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={!isDirty || Boolean(isBusy)}
              className={`${buttonBase} border border-border bg-card hover:bg-muted text-foreground ${
                isDirty ? "border-primary/60 font-semibold text-primary" : ""
              }`}
              title={isDirty ? "Lưu các thay đổi trên bản nháp" : "Bản nháp đã lưu mới nhất"}
            >
              <Save className="size-3.5" />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          )}

          {/* Publish (if draft) */}
          {isDraft && (
            <button
              type="button"
              onClick={onPublish}
              disabled={Boolean(isBusy) || isDirty}
              title="Đóng băng bản nháp này thành phiên bản Published bất biến"
              className={`${buttonBase} border border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300 font-semibold`}
            >
              <CheckCircle2 className="size-3.5" />
              <span>Publish</span>
            </button>
          )}

          {/* Activate for Project (if not active) */}
          {!isActiveWorkflowForProject && (
            <button
              type="button"
              onClick={onActivate}
              disabled={Boolean(isBusy)}
              title="Kích hoạt workflow này làm quy trình điều phối cho dự án hiện tại"
              className={`${buttonBase} border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 font-semibold`}
            >
              <Sparkles className="size-3.5" />
              <span>Activate</span>
            </button>
          )}

          {/* Primary Execute Button */}
          <button
            type="button"
            onClick={onExecute}
            disabled={!canExecute || Boolean(isBusy)}
            title="Thực thi quy trình AI cho dự án này"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-40"
          >
            <Play className="size-3.5 fill-current" />
            <span>{isBusy === "run" ? "Đang chạy..." : "Execute"}</span>
          </button>

          {/* More Actions Menu */}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Thao tác khác"
            >
              <MoreHorizontal className="size-4" />
            </button>

            {moreOpen && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-border bg-card p-1 shadow-lg z-30 divide-y divide-border/60">
                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onAddStickyNote();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-muted"
                  >
                    <StickyNote className="size-3.5 text-amber-500" />
                    <span>Thêm Sticky Note</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onToggleMinimap();
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-muted"
                  >
                    <span>Hiện Minimap</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {showMinimap ? "Bật" : "Tắt"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      toggleFullscreen();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-muted"
                  >
                    {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    <span>{isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</span>
                  </button>
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onExportJson();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-muted"
                  >
                    <Download className="size-3.5" />
                    <span>Xuất file JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onImportJson();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-muted"
                  >
                    <Upload className="size-3.5" />
                    <span>Nhập từ JSON</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
