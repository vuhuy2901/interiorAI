import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { atelierApi } from "@/api/atelier";

export function useSelectableAtelierProjects(enabled = true) {
  return useQuery({
    queryKey: ["atelier", "selectable-projects"],
    queryFn: () => atelierApi.listProjects(),
    enabled,
    staleTime: 15_000,
  });
}

/** Màn chọn dự án cho Studio độc lập (không có task) khi chưa có lựa chọn hợp lệ. */
export function StudioProjectChooser({
  projects,
  onSelect,
}: {
  projects: Array<{ project_id: string; name?: string; revision?: number; hidden?: boolean }>;
  onSelect: (projectId: string) => void;
}) {
  const visible = projects.filter((item) => !item.hidden);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="studio-project-chooser" role="region" aria-label="Chọn dự án nội thất">
      <h2 className="text-base font-semibold">Chọn dự án nội thất</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {visible.length
          ? "Chưa có dự án đang mở. Hãy chọn một dự án để tiếp tục, hoặc tạo task mới để bắt đầu dự án mới."
          : "Chưa có dự án nào đang hiện. Hãy tạo task mới để bắt đầu một dự án nội thất."}
      </p>
      <div className="flex max-h-80 w-full max-w-md flex-col gap-1.5 overflow-y-auto">
        {visible.map((item) => (
          <button
            key={item.project_id}
            type="button"
            className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-teal-600 hover:bg-accent"
            onClick={() => onSelect(item.project_id)}
          >
            <span className="font-medium">{item.name || item.project_id}</span>
            {item.revision != null ? <span className="ml-2 text-xs text-muted-foreground">Rev #{item.revision}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Task cũ chưa có dự án: người dùng chọn tạo mới hoặc gắn dự án có sẵn. */
export function LegacyTaskProjectChoice({
  projects,
  busy,
  error,
  onCreateNew,
  onAttach,
}: {
  projects: Array<{ project_id: string; name?: string }>;
  busy: boolean;
  error: string | null;
  onCreateNew: () => void;
  onAttach: (sceneId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState("");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs" role="status" data-testid="sidecar-legacy-choice">
      <span className="font-medium text-foreground">Task này chưa có dự án nội thất</span>
      <span className="text-muted-foreground">Chọn cách gắn dự án cho task này.</span>
      {error ? <span className="text-destructive">{error}</span> : null}
      <button type="button" disabled={busy} className="w-full rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800 disabled:opacity-50" onClick={onCreateNew}>
        Tạo dự án mới
      </button>
      {picking ? (
        <div className="flex w-full items-center gap-1.5">
          <select aria-label="Chọn dự án có sẵn" className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Chọn dự án…</option>
            {projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.name || item.project_id}</option>)}
          </select>
          <button type="button" disabled={busy || !selected} className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50" onClick={() => onAttach(selected)}>
            Gắn
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} className="w-full rounded-md border border-border px-3 py-1.5 hover:bg-accent disabled:opacity-50" onClick={() => setPicking(true)}>
          Gắn dự án có sẵn…
        </button>
      )}
    </div>
  );
}
