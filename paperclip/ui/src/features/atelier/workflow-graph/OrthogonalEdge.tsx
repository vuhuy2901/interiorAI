import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { FileText, GitBranch, RotateCcw } from "lucide-react";
import type { RoutedEdgeData, RoutedPoint } from "./types";

function roundedPathFrom(points: RoutedPoint[], radius = 8): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, dPrev / 2, dNext / 2);

    if (r <= 0) {
      path += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const vPrev = { x: (prev.x - curr.x) / dPrev, y: (prev.y - curr.y) / dPrev };
    const vNext = { x: (next.x - curr.x) / dNext, y: (next.y - curr.y) / dNext };

    const startArc = { x: curr.x + vPrev.x * r, y: curr.y + vPrev.y * r };
    const endArc = { x: curr.x + vNext.x * r, y: curr.y + vNext.y * r };

    path += ` L ${startArc.x} ${startArc.y} Q ${curr.x} ${curr.y} ${endArc.x} ${endArc.y}`;
  }

  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return path;
}

function midpoint(points: RoutedPoint[]) {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const half = lengths.reduce((sum, value) => sum + value, 0) / 2;
  let walked = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (walked + lengths[index] >= half) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = lengths[index] ? (half - walked) / lengths[index] : 0;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    walked += lengths[index];
  }
  return points.at(-1)!;
}

export const OrthogonalEdge = memo(function OrthogonalEdge(props: EdgeProps) {
  const data = (props.data ?? {}) as RoutedEdgeData;
  const edge = data.edge;

  const fallback: RoutedPoint[] = [
    { x: props.sourceX, y: props.sourceY },
    { x: (props.sourceX + props.targetX) / 2, y: props.sourceY },
    { x: (props.sourceX + props.targetX) / 2, y: props.targetY },
    { x: props.targetX, y: props.targetY },
  ];
  const points = data.points?.length ? data.points : fallback;
  const labelPos = midpoint(points);

  const isRetry =
    data.isRetry ||
    edge?.outcome?.toLowerCase().includes("retry") ||
    edge?.outcome?.toLowerCase().includes("reject") ||
    edge?.trigger === "event";

  const labelText = edge?.outcome || edge?.name || data.outcome;
  const hasNotes = Boolean(edge?.notes);
  const condition = edge?.condition;

  const strokeColor = props.selected
    ? "var(--primary)"
    : isRetry
      ? "rgba(244, 63, 94, 0.75)"
      : "var(--muted-foreground)";

  return (
    <>
      <BaseEdge
        id={props.id}
        path={roundedPathFrom(points, 10)}
        markerEnd={props.markerEnd}
        style={{
          ...props.style,
          stroke: strokeColor,
          strokeWidth: props.selected ? 2.5 : 1.75,
          strokeDasharray: isRetry ? "5 3" : undefined,
          transition: "stroke 0.2s, stroke-width 0.2s",
        }}
        interactionWidth={24}
      />

      {labelText ? (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shadow-sm transition-all duration-150 cursor-pointer ${
              props.selected
                ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20 shadow-md scale-105"
                : isRetry
                  ? "border-rose-400/60 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 hover:border-rose-500"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelPos.x}px,${labelPos.y}px)`,
            }}
          >
            {isRetry ? (
              <RotateCcw className="size-2.5 text-rose-500 shrink-0" />
            ) : condition ? (
              <GitBranch className="size-2.5 text-violet-500 shrink-0" />
            ) : null}
            <span className="truncate max-w-[140px]">{labelText}</span>
            {hasNotes && (
              <span title="Có ghi chú chuyển tiếp">
                <FileText className="size-2.5 opacity-60 ml-0.5" />
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
