import { memo } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import { StickyNote, Trash2 } from "lucide-react";
import type { CanvasNote, CanvasNoteColor } from "./types";

export type CanvasNoteData = {
  note: CanvasNote;
  onUpdate?: (id: string, patch: Partial<CanvasNote>) => void;
  onDelete?: (id: string) => void;
  editable?: boolean;
};

export type CanvasNoteFlowNode = Node<CanvasNoteData, "canvasNote">;

const COLOR_CLASSES: Record<
  CanvasNoteColor,
  { bg: string; border: string; header: string; text: string }
> = {
  yellow: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-700/60",
    header: "text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50",
    text: "text-amber-900 dark:text-amber-100",
  },
  blue: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-300 dark:border-sky-700/60",
    header: "text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/50",
    text: "text-sky-900 dark:text-sky-100",
  },
  green: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-300 dark:border-emerald-700/60",
    header: "text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-300 dark:border-purple-700/60",
    header: "text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/50",
    text: "text-purple-900 dark:text-purple-100",
  },
  neutral: {
    bg: "bg-card dark:bg-card",
    border: "border-border",
    header: "text-foreground border-border/60",
    text: "text-muted-foreground",
  },
};

export const CanvasStickyNote = memo(function CanvasStickyNote({
  data,
  selected,
}: NodeProps<CanvasNoteFlowNode>) {
  const { note, onUpdate, onDelete, editable = true } = data;
  const color = note.color ?? "yellow";
  const colorStyle = COLOR_CLASSES[color] ?? COLOR_CLASSES.yellow;

  return (
    <div
      className={`group relative flex w-[220px] min-h-[120px] flex-col rounded-xl border p-3 shadow-md backdrop-blur-sm transition-all select-none ${
        colorStyle.bg
      } ${colorStyle.border} ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg scale-[1.02]" : ""
      }`}
    >
      <div className={`flex items-center justify-between pb-1.5 border-b ${colorStyle.header}`}>
        <div className="flex items-center gap-1.5">
          <StickyNote className="size-3.5 opacity-70" />
          <span className="text-[11px] font-semibold tracking-wide uppercase">
            {note.title || "Ghi chú"}
          </span>
        </div>

        {editable && onDelete && (
          <button
            type="button"
            title="Xóa ghi chú"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>

      <div className="mt-2 flex-1">
        <p className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${colorStyle.text}`}>
          {note.content || "Nhấp đúp hoặc mở Inspector để soạn nội dung ghi chú..."}
        </p>
      </div>

      <div className="mt-2 text-right">
        <span className="text-[9px] opacity-50 font-mono">Note</span>
      </div>
    </div>
  );
});
