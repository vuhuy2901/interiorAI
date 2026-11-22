import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolCatalogEntry } from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FurniMeshResult = {
  model_id?: string;
  name?: string;
  description?: string;
  thumbnail_url?: string;
  detail_url?: string;
  glb_url?: string;
  category?: string;
  available_formats?: string[];
  heavy?: boolean;
};

function readCategoryNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.categories)) {
    return record.categories
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).category_name : null))
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  }
  if (Array.isArray(record.content)) {
    const text = record.content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "text");
    const raw = text && typeof text === "object" ? (text as Record<string, unknown>).text : null;
    if (typeof raw === "string") {
      try { return readCategoryNames(JSON.parse(raw)); } catch { return []; }
    }
  }
  return [];
}

function readResults(value: unknown): FurniMeshResult[] {
  if (Array.isArray(value)) return value.filter((item): item is FurniMeshResult => !!item && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.results)) return readResults(record.results);
  if (Array.isArray(record.items)) return readResults(record.items);
  if (Array.isArray(record.content)) {
    const text = record.content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "text");
    const raw = text && typeof text === "object" ? (text as Record<string, unknown>).text : null;
    if (typeof raw === "string") {
      try {
        return readResults(JSON.parse(raw));
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function FurniMeshLibraryPanel({
  connectionId,
  catalog,
  agents,
}: {
  connectionId: string;
  catalog: ToolCatalogEntry[];
  agents: Array<{ id: string; name: string }>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<FurniMeshResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sceneWinRef = useRef<Window | null>(null);
  const SCENE_URL = "http://localhost:8123/";

  const addToScene = (item: FurniMeshResult) => {
    if (!item.glb_url) return;
    if (!sceneWinRef.current || sceneWinRef.current.closed) {
      sceneWinRef.current = window.open(SCENE_URL, "aioffice");
    }
    const win = sceneWinRef.current;
    if (!win) return;
    const msg = { type: "furnimesh:add", glb_url: item.glb_url, name: item.name ?? item.model_id ?? "Furniture", thumbnail_url: item.thumbnail_url };
    // Allow 1.5s for a freshly opened window to register its listener.
    setTimeout(() => { try { win.postMessage(msg, SCENE_URL); } catch { /* cross-origin guard */ } }, 1500);
  };
  const searchTool = useMemo(() => catalog.find((entry) => entry.toolName === "search_furniture" && entry.status === "active"), [catalog]);
  const categoriesTool = useMemo(() => catalog.find((entry) => entry.toolName === "list_furniture_categories" && entry.status === "active"), [catalog]);
  const agent = agents[0];
  useEffect(() => {
    if (!categoriesTool || !agent) return;
    let cancelled = false;
    void toolsApi.runTestCall(connectionId, { agentId: agent.id, toolName: categoriesTool.toolName, parameters: {} })
      .then((response) => {
        if (cancelled || response.decision !== "allowed") return;
        const names = readCategoryNames(response.result);
        if (names.length > 0) setCategories(names);
      })
      .catch(() => { /* category list is optional; search still works without it */ });
    return () => { cancelled = true; };
  }, [connectionId, categoriesTool, agent]);
  const search = async () => {
    if (!searchTool || !agent) return;
    setPending(true);
    setError(null);
    try {
      const response = await toolsApi.runTestCall(connectionId, {
        agentId: agent.id,
        toolName: searchTool.toolName,
        parameters: { query, category: category || undefined, limit: 12, page: 1 },
      });
      if (response.decision === "allowed") setResults(readResults(response.result));
      else setError(response.error?.message ?? `Search was ${response.decision}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "FurniMesh search failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">FurniMesh library</h2>
        <p className="text-sm text-muted-foreground">Searches the public FurniMesh library on demand through the governed MCP tool.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 space-y-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="armchair, oak table…" />
        </label>
        <label className="min-w-48 space-y-1 text-sm">
          <span className="text-muted-foreground">Category</span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["", ...categories].map((item) => <option key={item} value={item}>{item || "All categories"}</option>)}
          </select>
        </label>
        <Button type="button" disabled={!searchTool || !agent || pending} onClick={() => void search()}>
          {pending ? "Searching…" : "Search library"}
        </Button>
      </div>
      {!searchTool ? <p className="text-sm text-muted-foreground">Refresh the connection to discover the FurniMesh search tool.</p> : null}
      {searchTool && !agent ? <p className="text-sm text-muted-foreground">Assign an agent before running a governed search.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => (
            <article key={item.model_id ?? item.detail_url ?? item.name} className="overflow-hidden rounded-lg border border-border/70 bg-background">
              {item.thumbnail_url ? <img className="aspect-[4/3] w-full object-cover" src={item.thumbnail_url} alt={item.name ?? "FurniMesh model"} loading="lazy" /> : <div className="aspect-[4/3] w-full bg-muted" />}
              <div className="space-y-2 p-3">
                <h3 className="line-clamp-2 text-sm font-medium">{item.name ?? item.model_id ?? "Untitled model"}</h3>
                {item.category ? <p className="text-xs text-muted-foreground">{item.category}</p> : null}
                {item.heavy ? <p className="text-xs text-destructive">Heavy model: may be slow to load in the scene.</p> : null}
                <div className="flex flex-wrap gap-2 text-xs">
                  {item.detail_url ? <a className="text-primary underline-offset-4 hover:underline" href={item.detail_url} target="_blank" rel="noreferrer">Details</a> : null}
                  {item.glb_url ? <a className="text-primary underline-offset-4 hover:underline" href={item.glb_url} target="_blank" rel="noreferrer">Preview GLB</a> : null}
                  {item.glb_url ? <Button type="button" size="sm" variant="outline" onClick={() => addToScene(item)}>Use in Scene</Button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">No FurniMesh results loaded yet.</p>}
    </section>
  );
}
