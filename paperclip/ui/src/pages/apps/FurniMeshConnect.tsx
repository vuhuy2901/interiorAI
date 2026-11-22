import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { toolsApi } from "@/api/tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { FurniMeshLibraryPanel } from "./app-detail/FurniMeshLibraryPanel";
import { FURNIMESH_DEFAULT_MCP_URL, FURNIMESH_DEFAULT_SCENE_URL, SCENE_URL_KEY, readFurniMeshSceneUrl } from "./furnimesh-config";

type Status = "disconnected" | "checking" | "connected" | "error";

const STATUS_LABEL: Record<Status, string> = {
  disconnected: "Chưa kết nối",
  checking: "Đang kiểm tra…",
  connected: "Đã kết nối",
  error: "Lỗi kết nối",
};

const STATUS_DOT: Record<Status, string> = {
  disconnected: "bg-muted-foreground",
  checking: "bg-primary",
  connected: "bg-success",
  error: "bg-destructive",
};

function isFurniMeshApplication(application: { applicationKey?: string; metadata?: Record<string, unknown> | null }) {
  const source = application.metadata?.sourceTemplateKey ?? application.metadata?.galleryKey;
  return source === "furnimesh" || application.applicationKey === "furnimesh" || application.applicationKey?.startsWith("app-gallery:furnimesh") === true;
}

export function FurniMeshConnect() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "__none__";
  const [mcpUrl, setMcpUrl] = useState(FURNIMESH_DEFAULT_MCP_URL);
  const [sceneUrl, setSceneUrl] = useState(readFurniMeshSceneUrl);
  const [status, setStatus] = useState<Status>("disconnected");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { setBreadcrumbs([{ label: "FurniMesh" }]); }, [setBreadcrumbs]);

  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(companyId),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(companyId),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const connection = useMemo(() => {
    const applications = applicationsQuery.data?.applications ?? [];
    const ids = new Set(applications.filter(isFurniMeshApplication).map((app) => app.id));
    return (connectionsQuery.data?.connections ?? []).find(
      (item) => (item.applicationId && ids.has(item.applicationId)) || item.config?.sourceTemplateKey === "furnimesh",
    ) ?? null;
  }, [applicationsQuery.data, connectionsQuery.data]);

  const catalogQuery = useQuery({
    queryKey: ["tools", "furnimesh-catalog", connection?.id ?? "none"],
    queryFn: () => toolsApi.listCatalog(connection!.id),
    enabled: !!connection,
  });

  useEffect(() => { if (!connection) setStatus("disconnected"); }, [connection]);

  const check = async (connectionId: string) => {
    setStatus("checking");
    setMessage(null);
    try {
      const result = await Promise.race([
        toolsApi.refreshCatalog(connectionId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Quá 5 giây không phản hồi — kiểm tra MCP đã chạy ở cổng 3180 chưa.")), 5000)),
      ]);
      void result;
      await catalogQuery.refetch();
      setStatus("connected");
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Không kết nối được tới FurniMesh MCP.");
    }
  };

  const connect = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Chưa chọn công ty.");
      if (connection) return connection;
      const applications = applicationsQuery.data?.applications ?? [];
      let application = applications.find(isFurniMeshApplication);
      if (!application) {
        application = await toolsApi.createApplication(selectedCompanyId, {
          name: "FurniMesh MCP",
          description: "Search and preview public furniture assets on demand for governed scene workflows.",
          type: "mcp_http",
          metadata: { sourceTemplateKey: "furnimesh", galleryKey: "furnimesh" },
        });
      }
      return toolsApi.createConnection(selectedCompanyId, {
        applicationId: application.id,
        name: "FurniMesh MCP",
        transport: "mcp_remote",
        config: { serverUrl: mcpUrl.trim() || FURNIMESH_DEFAULT_MCP_URL, sourceTemplateKey: "furnimesh", connectionMethodKey: "mcp" },
        enabled: true,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(companyId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(companyId) });
      await check(created.id);
    },
    onError: (cause) => {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Tạo kết nối thất bại.");
    },
  });

  const saveSceneUrl = () => {
    try { window.localStorage.setItem(SCENE_URL_KEY, sceneUrl.trim() || FURNIMESH_DEFAULT_SCENE_URL); } catch { /* storage unavailable */ }
    setMessage("Đã lưu địa chỉ scene AlterAI.");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">FurniMesh — thư viện nội thất 3D</h1>
        <p className="text-sm text-muted-foreground">Kết nối máy chủ MCP FurniMesh để tìm mẫu GLB và đặt thẳng vào scene AlterAI.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-block size-2.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
          <span role="status" className="text-sm font-medium">{STATUS_LABEL[status]}</span>
          {connection ? <span className="text-xs text-muted-foreground">Connection: {connection.name}</span> : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-72 flex-1 space-y-1 text-sm">
            <span className="text-muted-foreground">Địa chỉ MCP</span>
            <Input value={mcpUrl} onChange={(event) => setMcpUrl(event.target.value)} disabled={!!connection} />
          </label>
          {connection ? null : (
            <Button type="button" disabled={connect.isPending || !selectedCompanyId} onClick={() => connect.mutate()}>
              {connect.isPending ? "Đang kết nối…" : "Kết nối"}
            </Button>
          )}
          <Button type="button" variant="outline" disabled={!connection || status === "checking"} onClick={() => connection && void check(connection.id)}>
            Kiểm tra kết nối
          </Button>
        </div>
        {message ? <p role="alert" className="text-sm text-muted-foreground">{message}</p> : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-72 flex-1 space-y-1 text-sm">
            <span className="text-muted-foreground">Địa chỉ scene AlterAI</span>
            <Input value={sceneUrl} onChange={(event) => setSceneUrl(event.target.value)} />
          </label>
          <Button type="button" variant="outline" onClick={saveSceneUrl}>Lưu</Button>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border/70 bg-card/40 p-5">
        <h2 className="text-base font-semibold">Hướng dẫn 3 bước</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Bật MCP: script khởi động tự chạy ở cổng 3180 (hoặc chạy <code>node paperclip/packages/furnimesh-mcp/dist/http.js</code>).</li>
          <li>Bấm <strong>Kết nối</strong> để tạo connection FurniMesh trong Paperclip.</li>
          <li>Bấm <strong>Kiểm tra kết nối</strong>, tìm mẫu rồi bấm <strong>Use in Scene</strong>.</li>
        </ol>
      </section>

      {connection ? (
        <FurniMeshLibraryPanel connectionId={connection.id} catalog={catalogQuery.data?.catalog ?? []} agents={agentsQuery.data ?? []} />
      ) : null}
    </div>
  );
}
