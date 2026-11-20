import { useState, useMemo, memo } from "react";
import {
  ArchiveRestore,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  FileCode,
  FileSpreadsheet,
  FileText,
  Flame,
  GitBranch,
  History,
  Layers,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { WORKFLOW_NODE_KINDS, type WorkflowNodeKind } from "./types";

export type WorkflowItem = {
  id: string;
  name: string;
  version: number;
  status: "draft" | "published" | "active" | "archived";
  isActiveForProject?: boolean;
  stepCount?: number;
  updatedAt?: string;
};

export type WorkflowLibrarySidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  workflows: WorkflowItem[];
  activeWorkflowId: string;
  onSelectWorkflow: (id: string) => void;
  onCreateWorkflow: () => void;
  onDuplicateWorkflow: (id: string) => void;
  onDeleteDraft?: (id: string) => void;
  onActivateWorkflow: (id: string) => void;
  onPublishWorkflow?: (id: string) => void;
  editable: boolean;
  onAddNode: (type: WorkflowNodeKind) => void;
};

const PALETTE_GROUPS: Array<{
  name: string;
  title: string;
  items: Array<{ type: WorkflowNodeKind; label: string; desc: string; icon: any }>;
}> = [
  {
    name: "Planning",
    title: "Khảo sát & Mặt bằng",
    items: [
      { type: "START", label: "Chief Architect Intake", desc: "Tiếp nhận đầu vào, quy chuẩn diện tích", icon: Play },
      { type: "AGENT_TASK", label: "Floor Plan Agent", desc: "Xác thực mặt bằng 2D, tỷ lệ mm, tường, cửa", icon: Layers },
    ],
  },
  {
    name: "Design",
    title: "Dựng hình & Nội thất",
    items: [
      { type: "AGENT_TASK", label: "Geometry / BIM Agent", desc: "Dựng hình học 3D, phòng, cửa sổ, trần", icon: FileCode },
      { type: "AGENT_TASK", label: "Style / Materials Agent", desc: "Đề xuất vật liệu, màu sắc và phong cách", icon: Sparkles },
      { type: "AGENT_TASK", label: "Furniture Agent", desc: "Bố trí nội thất thông minh, chống va chạm", icon: Palette },
    ],
  },
  {
    name: "Production",
    title: "Render & Khai thác Asset",
    items: [
      { type: "AGENT_TASK", label: "Rendering Specialist", desc: "Khai thác Blender Cycles và camera", icon: Flame },
      { type: "RESEARCH", label: "Asset & Material Discovery", desc: "Tìm kiếm đồ đạc và thư viện FurniMesh", icon: Compass },
    ],
  },
  {
    name: "Quality",
    title: "Kiểm định & Phê duyệt",
    items: [
      { type: "VALIDATION", label: "QA Specialist", desc: "Kiểm tra kỹ thuật, kích thước và thẩm mỹ", icon: ShieldCheck },
      { type: "APPROVAL_GATE", label: "Cổng NGƯỜI DUYỆT", desc: "Dừng đợi phê duyệt của chuyên gia/khách", icon: UserCheck },
      { type: "CONDITION", label: "Khối Quyết định", desc: "Phân nhánh theo điều kiện (Yes/No)", icon: GitBranch },
    ],
  },
  {
    name: "Delivery",
    title: "Dự toán & Xuất giao",
    items: [
      { type: "AGENT_TASK", label: "Cost / BOM Agent", desc: "Bóc tách khối lượng và tính dự toán VND", icon: FileSpreadsheet },
      { type: "AGENT_TASK", label: "Final Review", desc: "Tổng kết hồ sơ toàn diện", icon: FileText },
      { type: "END", label: "Export and Delivery", desc: "Đóng gói bàn giao thiết kế hoàn chỉnh", icon: CheckCircle2 },
    ],
  },
];

export const WorkflowLibrarySidebar = memo(function WorkflowLibrarySidebar({
  isOpen,
  onToggle,
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onCreateWorkflow,
  onDuplicateWorkflow,
  onDeleteDraft,
  onActivateWorkflow,
  onPublishWorkflow,
  editable,
  onAddNode,
}: WorkflowLibrarySidebarProps) {
  const [activeTab, setActiveTab] = useState<"library" | "palette">("library");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows;
    const q = searchQuery.toLowerCase();
    return workflows.filter(
      (w) => w.name.toLowerCase().includes(q) || `v${w.version}`.includes(q) || w.status.includes(q),
    );
  }, [workflows, searchQuery]);

  if (!isOpen) return null;

  return (
    <aside className="flex w-64 md:w-72 flex-col border-r border-border bg-card/95 backdrop-blur z-10 shrink-0 select-none">
      {/* Top Tab Bar: Workflows list vs Node Palette */}
      <div className="flex border-b border-border/80 p-2 gap-1 bg-muted/20">
        <button
          type="button"
          onClick={() => setActiveTab("library")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            activeTab === "library"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Project Workflows
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("palette")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            activeTab === "palette"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Thư viện bước
        </button>
      </div>

      {activeTab === "library" ? (
        <div className="flex flex-1 flex-col min-h-0">
          {/* Header & Actions */}
          <div className="p-3 border-b border-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Quy trình dự án ({workflows.length})
              </span>
              <button
                type="button"
                onClick={onCreateWorkflow}
                className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
              >
                <Plus className="size-3" />
                Mới
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm workflow..."
                className="w-full rounded-md border border-input bg-background/80 py-1 pl-8 pr-2.5 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Workflow List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredWorkflows.map((wf) => {
              const isSelected = wf.id === activeWorkflowId;
              const isActive = wf.isActiveForProject;

              return (
                <div
                  key={wf.id}
                  onClick={() => onSelectWorkflow(wf.id)}
                  className={`group relative flex flex-col rounded-lg border p-2.5 transition cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/70 hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs truncate text-foreground">
                          {wf.name}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1 rounded shrink-0">
                          v{wf.version}
                        </span>
                      </div>
                    </div>

                    {/* Status Pill */}
                    {isActive ? (
                      <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    ) : wf.status === "draft" ? (
                      <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Draft
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                        Published
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
                    <span>{wf.stepCount ? `${wf.stepCount} bước` : "Pipeline AI"}</span>

                    {/* Hover actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        title="Nhân bản workflow"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateWorkflow(wf.id);
                        }}
                        className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="size-3" />
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          title="Kích hoạt cho dự án này"
                          onClick={(e) => {
                            e.stopPropagation();
                            onActivateWorkflow(wf.id);
                          }}
                          className="rounded p-1 hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-600 font-semibold"
                        >
                          <Sparkles className="size-3" />
                        </button>
                      )}

                      {wf.status === "draft" && onDeleteDraft && (
                        <button
                          type="button"
                          title="Xóa bản nháp này"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDraft(wf.id);
                          }}
                          className="rounded p-1 hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredWorkflows.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Không tìm thấy workflow nào khớp.
              </div>
            )}
          </div>

          {/* Footer Notice */}
          <div className="p-3 border-t border-border/60 bg-muted/20 text-[10px] text-muted-foreground leading-relaxed">
            Mỗi dự án chỉ có <strong>1 Active Workflow</strong> tại một thời điểm để điều phối agent nhất quán.
          </div>
        </div>
      ) : (
        /* Palette Tab: Drag and Drop Node Palette */
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div className="text-[11px] text-muted-foreground leading-snug">
            Kéo thả hoặc bấm vào loại bước để bổ sung vào sơ đồ quy trình Atelier.
          </div>

          {PALETTE_GROUPS.map((group) => (
            <div key={group.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
                <span>{group.name}</span>
                <span className="text-[10px] font-normal opacity-70">{group.title}</span>
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      draggable={editable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/atelier-node", item.type);
                        e.dataTransfer.setData("application/atelier-node-label", item.label);
                      }}
                      onClick={() => editable && onAddNode(item.type)}
                      className={`group flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-background/60 p-2 text-xs transition ${
                        editable
                          ? "cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-card hover:shadow-sm"
                          : "opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                          <Icon className="size-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate text-foreground">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                        </div>
                      </div>

                      <Plus className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
});
