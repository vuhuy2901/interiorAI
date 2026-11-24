import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@/lib/router";
import "./atelier-studio.css";
import {
  UNSCOPED_TASK_SCOPE,
  isStaleProjectResponse,
  mayAutoPickFirstProject,
  nextTaskScope,
  visibleProjectFor,
  type TaskProjectScope,
} from "./taskProjectScope";

export interface SpatialPinItem {
  id: string;
  project_id: string;
  entity_id: string | null;
  entity_name: string;
  position_mm: [number, number, number];
  comment: string;
  author: string;
  status: "open" | "in_progress" | "resolved";
  paperclip_issue_id: string | null;
  paperclip_issue_identifier: string | null;
  proposal_id: string | null;
  created_at: string;
}

interface AtelierStudioContextValue {
  projects: any[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  taskScope: TaskProjectScope;
  bindTaskScene: (issueId: string | null, sceneId: string | null, failed?: string | null) => void;
  releaseTaskScope: () => void;
  showHiddenProjects: boolean;
  setShowHiddenProjects: (value: boolean) => void;
  setProjectHidden: (projectId: string, hidden: boolean) => Promise<void>;
  project: any | null;
  estimate: any | null;
  materialsCatalog: any | null;
  productsCatalog: any[];
  chatHistory: { messages: any[]; pending_questions: any[]; proposals: any[] };
  pbrMaterials: any[];
  assetLibrary: any[];
  revisions: any[];
  pins: SpatialPinItem[];
  selectedEntityId: string | null;
  setSelectedEntityId: (id: string | null) => void;
  viewMode: "split" | "2d" | "3d";
  setViewMode: (mode: "split" | "2d" | "3d") => void;
  cameraPreset: "orbit" | "top" | "walk" | "cutaway";
  setCameraPreset: (preset: "orbit" | "top" | "walk" | "cutaway") => void;
  lightingPreset: "day" | "sunset" | "night";
  setLightingPreset: (preset: "day" | "sunset" | "night") => void;
  workflows: any[];
  runs: any[];
  agents: any[];
  connections: any[];
  mcpTools: any[];
  handleRunWorkflow: (wfId: string) => Promise<void>;
  handleUpdateWorkflow: (wf: any) => Promise<void>;
  handleUpdateAgent: (agent: any) => Promise<void>;
  handleTestConnection: (connId: string) => Promise<void>;
  handleSaveConnection: (conn: any) => Promise<void>;
  busyMessage: string | null;
  errorMessage: string | null;
  toast: string | null;
  showToast: (msg: string) => void;
  refreshProjectBundle: (pid?: string) => Promise<void>;
  handleMaterialChange: (
    basePaintId?: string,
    accentPaintId?: string,
    floorMatId?: string,
  ) => Promise<void>;
  handleSendChat: (text?: string) => Promise<void>;
  handleAnswerQuestion: (questionId: string, answer: string) => Promise<void>;
  handleProposalDecision: (
    proposalId: string,
    decision: "approve" | "reject",
  ) => Promise<void>;
  handleRestoreRevision: (revNum: number) => Promise<void>;
  handleApplyDesignOption: (opt: any) => Promise<void>;
  handleReplaceProduct: (productId: string) => Promise<void>;
  handleSaveSelectedFurnitureTransform: (
    entityId: string,
    xMm: number,
    yMm: number,
    rotDeg: number,
  ) => Promise<void>;
  handleUpdateFurnitureField: (entityId: string, field: string, value: unknown) => void;
  handleSaveScene: () => Promise<void>;
  handleExport: (format: "dxf" | "glb") => Promise<void>;
  handleAssignAsset: (entityId: string, assetId: string) => Promise<void>;
  handleImportAssetAndAssign: (entityId: string, file: File) => Promise<void>;
  handleCreateMaterialProposal: (entityId: string, payload: any) => Promise<any>;
  handleCreateSurfaceMaterialProposal: (surfaceKey: string, payload: any) => Promise<any>;
  handleRequestSmartFit: (entityId: string) => Promise<any>;
  handleRequestPlacementOptions: (entityId: string) => Promise<any>;
  handleCreatePlacementProposal: (entityId: string, option: any) => Promise<any>;
  handleCreateProject: (
    name: string,
    style: string,
    budgetVnd: number,
  ) => Promise<void>;
  handleCreateSpatialPin: (input: {
    entityId: string | null;
    entityName: string;
    positionMm: [number, number, number];
    comment: string;
  }) => Promise<void>;
}

const AtelierStudioContext = createContext<AtelierStudioContextValue | null>(null);

const API_BASE = "/api/v1";
const projectListUrl = (includeHidden: boolean) =>
  `${API_BASE}/projects?include_fixtures=false${includeHidden ? "&include_hidden=true" : ""}`;

export function AtelierStudioProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const atelierProjectRouteActive = /\/(?:design-studio|floorplan-import|render-compare|render-gallery|cost-estimation|inventory-bom|shopping-catalog|chats\/|projects\/)/.test(pathname);
  const surfaceCatalogRouteActive = /\/(?:design-studio|render-compare|render-gallery|chats\/|projects\/)/.test(pathname);
  const productCatalogRouteActive = /\/(?:design-studio|shopping-catalog|projects\/)/.test(pathname);
  const studioAssetRouteActive = /\/(?:design-studio|chats\/|projects\/)/.test(pathname);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string>("");
  const [taskScope, setTaskScope] = useState<TaskProjectScope>(UNSCOPED_TASK_SCOPE);
  // Ref cập nhật đồng bộ để chặn response muộn của dự án trước ghi đè dự án đang mở.
  const activeProjectIdRef = useRef<string>("");
  const taskScopeRef = useRef<TaskProjectScope>(UNSCOPED_TASK_SCOPE);
  const setActiveProjectId = useCallback((id: string) => {
    activeProjectIdRef.current = id;
    setActiveProjectIdState(id);
  }, []);
  const bindTaskScene = useCallback((issueId: string | null, sceneId: string | null, failed: string | null = null) => {
    const next = nextTaskScope(issueId, sceneId, failed);
    taskScopeRef.current = next.scope;
    setTaskScope(next.scope);
    setActiveProjectId(next.activeProjectId);
  }, [setActiveProjectId]);
  const releaseTaskScope = useCallback(() => {
    taskScopeRef.current = UNSCOPED_TASK_SCOPE;
    setTaskScope(UNSCOPED_TASK_SCOPE);
  }, []);
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);
  const [project, setProject] = useState<any | null>(null);
  const [estimate, setEstimate] = useState<any | null>(null);
  const [materialsCatalog, setMaterialsCatalog] = useState<any | null>(null);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<{
    messages: any[];
    pending_questions: any[];
    proposals: any[];
  }>({ messages: [], pending_questions: [], proposals: [] });
  const [pbrMaterials, setPbrMaterials] = useState<any[]>([]);
  const [assetLibrary, setAssetLibrary] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [pins, setPins] = useState<SpatialPinItem[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>("furn_sofa_main");
  const [viewMode, setViewMode] = useState<"split" | "2d" | "3d">("split");
  const [cameraPreset, setCameraPreset] = useState<"orbit" | "top" | "walk" | "cutaway">(
    "cutaway",
  );
  const [lightingPreset, setLightingPreset] = useState<"day" | "sunset" | "night">("day");
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [productsCatalogLoaded, setProductsCatalogLoaded] = useState(false);
  const [studioAssetsLoaded, setStudioAssetsLoaded] = useState(false);
  const [backendRetryNonce, setBackendRetryNonce] = useState(0);
  const initialProjectLoadStarted = useRef(false);
  const surfaceCatalogLoadStarted = useRef(false);
  const productCatalogLoadStarted = useRef(false);
  const studioAssetLoadStarted = useRef(false);
  const backendRetryTimer = useRef<number | null>(null);

  // Đổi dự án (đổi task) thì xóa sạch dữ liệu dự án trước TRƯỚC khi vẽ, không lóe dữ liệu cũ.
  useLayoutEffect(() => {
    setProject(null);
    setEstimate(null);
    setChatHistory({ messages: [], pending_questions: [], proposals: [] });
    setRevisions([]);
    setPins([]);
    setSelectedEntityId(null);
  }, [activeProjectId]);

  const scheduleBackendRetry = useCallback(() => {
    if (backendRetryTimer.current !== null) return;
    backendRetryTimer.current = window.setTimeout(() => {
      backendRetryTimer.current = null;
      setBackendRetryNonce((value) => value + 1);
    }, 2000);
  }, []);

  useEffect(() => () => {
    if (backendRetryTimer.current !== null) window.clearTimeout(backendRetryTimer.current);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshProjectBundle = useCallback(
    async (pid: string = activeProjectId) => {
      try {
        if (!pid) {
          // Đang gắn task: chưa có dự án của task thì chờ, tuyệt đối không mượn dự án khác.
          if (!mayAutoPickFirstProject(taskScopeRef.current)) return;
          const listRes = await fetch(projectListUrl(showHiddenProjects));
          if (!listRes.ok) throw new Error(`Không thể tải danh sách project (${listRes.status})`);
          const listJson = await listRes.json();
          const nextProjects = Array.isArray(listJson) ? listJson : listJson.projects || [];
          setProjects(nextProjects);
          const firstProjectId = nextProjects[0]?.project_id;
          if (typeof firstProjectId === "string") setActiveProjectId(firstProjectId);
          return;
        }
        const [projRes, estRes, chatRes, listRes, pinsRes] =
          await Promise.all([
            fetch(`${API_BASE}/projects/${pid}`),
            fetch(`${API_BASE}/estimates/${pid}`),
            fetch(`${API_BASE}/chat/history?project_id=${encodeURIComponent(pid)}`),
            fetch(projectListUrl(showHiddenProjects)),
            fetch(`/api/atelier/pins/${pid}`),
          ]);
        if (!projRes.ok) throw new Error(`Không thể tải Scene (${projRes.status})`);
        const projectJson = await projRes.json();
        if (isStaleProjectResponse(pid, activeProjectIdRef.current)) return;
        setProject(projectJson);
        setRevisions(projectJson.revisions || []);
        if (estRes.ok) { const est = await estRes.json(); if (!isStaleProjectResponse(pid, activeProjectIdRef.current)) setEstimate(est); }
        if (chatRes.ok) { const chat = await chatRes.json(); if (!isStaleProjectResponse(pid, activeProjectIdRef.current)) setChatHistory(chat); }
        if (listRes.ok) {
          const listJson = await listRes.json();
          setProjects(Array.isArray(listJson) ? listJson : listJson.projects || []);
        }
        if (pinsRes.ok) {
          const pinsJson = await pinsRes.json();
          if (!isStaleProjectResponse(pid, activeProjectIdRef.current)) setPins(pinsJson.pins || []);
        }
        setErrorMessage(null);
      } catch (error) {
        if (!pid) initialProjectLoadStarted.current = false;
        scheduleBackendRetry();
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu ATELIER");
      }
    },
    [activeProjectId, scheduleBackendRetry, showHiddenProjects],
  );

  const setProjectHidden = useCallback(
    async (projectId: string, hidden: boolean) => {
      try {
        const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/visibility`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden }),
        });
        if (!res.ok) throw new Error(`Không thể đổi trạng thái dự án (${res.status})`);
        const listRes = await fetch(projectListUrl(showHiddenProjects));
        if (!listRes.ok) throw new Error(`Không thể tải danh sách project (${listRes.status})`);
        const listJson = await listRes.json();
        const nextProjects: any[] = Array.isArray(listJson) ? listJson : listJson.projects || [];
        setProjects(nextProjects);
        const nextVisible = nextProjects.find((item) => !item.hidden);
        if (hidden && projectId === activeProjectId && nextVisible && mayAutoPickFirstProject(taskScopeRef.current)) {
          // Dự án đang mở vừa bị ẩn: chuyển sang dự án đầu tiên còn hiện.
          setActiveProjectId(nextVisible.project_id);
        } else {
          await refreshProjectBundle(activeProjectId);
        }
        showToast(hidden ? "Đã ẩn dự án" : "Đã bật lại dự án");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Không thể đổi trạng thái dự án");
      }
    },
    [activeProjectId, refreshProjectBundle, showHiddenProjects, showToast],
  );

  useEffect(() => {
    if (!atelierProjectRouteActive) return;
    if (!activeProjectId) {
      if (!mayAutoPickFirstProject(taskScopeRef.current)) return;
      if (initialProjectLoadStarted.current) return;
      initialProjectLoadStarted.current = true;
    }
    void refreshProjectBundle(activeProjectId);
  }, [activeProjectId, atelierProjectRouteActive, backendRetryNonce, refreshProjectBundle, taskScope.scoped]);

  // Section 5: Real-time Multi-Agent Chat Reconciliation Polling (every 2.5s)
  useEffect(() => {
    if (!atelierProjectRouteActive || !activeProjectId) return;
    let isMounted = true;
    let consecutiveErrors = 0;

    const pollChatHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/chat/history?project_id=${encodeURIComponent(activeProjectId)}`);
        if (!res.ok) {
          consecutiveErrors += 1;
          return;
        }
        consecutiveErrors = 0;
        const data = await res.json();
        if (!isMounted || isStaleProjectResponse(activeProjectId, activeProjectIdRef.current)) return;
        setChatHistory((prev) => {
          if (
            prev.messages?.length !== data.messages?.length ||
            prev.proposals?.length !== data.proposals?.length ||
            prev.pending_questions?.length !== data.pending_questions?.length
          ) {
            return data;
          }
          const prevLast = prev.messages?.[prev.messages.length - 1]?.message_id;
          const newLast = data.messages?.[data.messages.length - 1]?.message_id;
          if (prevLast !== newLast) return data;
          return prev;
        });
      } catch {
        consecutiveErrors += 1;
      }
    };

    const interval = setInterval(() => {
      if (consecutiveErrors < 5) {
        void pollChatHistory();
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeProjectId, atelierProjectRouteActive]);

  useEffect(() => {
    if (!surfaceCatalogRouteActive || materialsCatalog || surfaceCatalogLoadStarted.current) return;
    surfaceCatalogLoadStarted.current = true;
    void (async () => {
      try {
        const matRes = await fetch(`${API_BASE}/materials`);
        if (!matRes.ok) throw new Error(`Catalog vật liệu không phản hồi (${matRes.status})`);
        setMaterialsCatalog(await matRes.json());
      } catch (error) {
        surfaceCatalogLoadStarted.current = false;
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải catalog ATELIER");
      }
    })();
  }, [materialsCatalog, surfaceCatalogRouteActive]);

  useEffect(() => {
    if (!productCatalogRouteActive || productsCatalogLoaded || productCatalogLoadStarted.current) return;
    productCatalogLoadStarted.current = true;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/catalog`);
        if (!response.ok) throw new Error(`Catalog nội thất không phản hồi (${response.status})`);
        const payload = await response.json();
        setProductsCatalog(Array.isArray(payload) ? payload : payload.products || []);
        setProductsCatalogLoaded(true);
      } catch (error) {
        productCatalogLoadStarted.current = false;
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải catalog nội thất");
      }
    })();
  }, [productCatalogRouteActive, productsCatalogLoaded]);

  useEffect(() => {
    if (!studioAssetRouteActive || studioAssetsLoaded || studioAssetLoadStarted.current) return;
    studioAssetLoadStarted.current = true;
    void (async () => {
      try {
        const [pbrResponse, assetResponse] = await Promise.all([
          fetch(`${API_BASE}/pbr-materials`),
          fetch(`${API_BASE}/assets/library`),
        ]);
        if (!pbrResponse.ok || !assetResponse.ok) throw new Error("PBR/asset library không phản hồi");
        setPbrMaterials((await pbrResponse.json()).materials || []);
        setAssetLibrary((await assetResponse.json()).assets || []);
        setStudioAssetsLoaded(true);
        setErrorMessage(null);
      } catch (error) {
        studioAssetLoadStarted.current = false;
        scheduleBackendRetry();
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải PBR/asset library");
      }
    })();
  }, [backendRetryNonce, scheduleBackendRetry, studioAssetRouteActive, studioAssetsLoaded]);

  const handleMaterialChange = useCallback(
    async (basePaintId?: string, accentPaintId?: string, floorMatId?: string) => {
      if (!project) return;
      setBusyMessage("Đang cập nhật vật liệu Mục 7B & tính lại dự toán...");
      try {
        const res = await fetch(
          `${API_BASE}/projects/${activeProjectId}/surfaces`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wall_base_material_id:
                basePaintId ?? project.rooms?.[0]?.wall_base_material_id,
              accent_paint_id:
                accentPaintId ?? project.walls?.find((wall: any) => wall.is_accent_wall)?.face_a_material_id,
              floor_material_id:
                floorMatId ?? project.rooms?.[0]?.floor_material_id,
            }),
          },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast(
            "Đã áp dụng vật liệu Sơn/Gạch 7B & cập nhật Dự toán BOQ (giữ nguyên khối tường 3D).",
          );
        } else throw new Error(`Cập nhật vật liệu thất bại (${res.status})`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Cập nhật vật liệu thất bại");
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, project, refreshProjectBundle, showToast],
  );

  const handleSendChat = useCallback(
    async (customMessage?: string) => {
      const msg = (customMessage ?? "").trim();
      if (!msg) return;
      setBusyMessage("Chief Architect Agent đang phân tích & điều phối...");
      try {
        const res = await fetch(
          `${API_BASE}/projects/${activeProjectId}/chat/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast(
            "Kiến Trúc Sư Trưởng đã phản hồi và đồng bộ với Paperclip Conversation.",
          );
        } else throw new Error(`AI Chat thất bại (${res.status})`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "AI Chat không phản hồi");
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleAnswerQuestion = useCallback(
    async (questionId: string, answer: string) => {
      setBusyMessage("Đang ghi nhận vào DesignBrief & tiếp tục quy trình...");
      try {
        const res = await fetch(
          `${API_BASE}/questions/${questionId}/answer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer }),
          },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast("Đã lưu câu trả lời vào DesignBrief & tạo phương án A/B!");
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleProposalDecision = useCallback(
    async (proposalId: string, decision: "approve" | "reject") => {
      setBusyMessage(
        decision === "approve"
          ? "Đang áp dụng đề xuất vào Pascal 3D Scene & BOQ..."
          : "Đang từ chối đề xuất...",
      );
      try {
        const res = await fetch(
          `${API_BASE}/proposals/${proposalId}/${decision}`,
          { method: "POST" },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast(
            decision === "approve"
              ? "Đã duyệt & đồng bộ trực tiếp vào Pascal 3D Scene + Dự toán BOQ!"
              : "Đã từ chối đề xuất (Scene 3D giữ nguyên).",
          );
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleRestoreRevision = useCallback(
    async (revNum: number) => {
      setBusyMessage(`Đang khôi phục dự án về Phiên bản #${revNum}...`);
      try {
        const res = await fetch(
          `${API_BASE}/projects/${activeProjectId}/revisions/${revNum}/restore`,
          { method: "POST" },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast(`Đã khôi phục thành công trạng thái Phiên bản #${revNum}!`);
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleApplyDesignOption = useCallback(
    async (opt: any) => {
      if (!project) return;
      setBusyMessage(`Đang áp dụng ${opt.title} vào Scene 3D...`);
      try {
        await fetch(`${API_BASE}/projects/${activeProjectId}/surfaces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_wall_paint_id: opt.surface_materials.base_wall_paint_id,
            accent_wall_paint_id: opt.surface_materials.accent_wall_paint_id,
            floor_material_id: opt.surface_materials.floor_material_id,
          }),
        });
        await fetch(`${API_BASE}/projects/${activeProjectId}/furniture`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            furniture: opt.furniture,
            reason: `Áp dụng ${opt.title}`,
          }),
        });
        await refreshProjectBundle(activeProjectId);
        showToast(`Đã áp dụng ${opt.title} vào Pascal Scene 3D & Dự toán!`);
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, project, refreshProjectBundle, showToast],
  );

  const handleReplaceProduct = useCallback(
    async (productId: string) => {
      if (!project) return;
      const product = productsCatalog.find(
        (item: any) => item.id === productId || item.sku === productId,
      );
      const sku = product?.sku ?? productId;
      const targetInstance =
        (project.furniture_instances || []).find((f: any) => f.id === selectedEntityId) ||
        (project.furniture_instances || [])[0];
      if (!targetInstance) return;
      setBusyMessage("Đang kiểm tra kích thước lọt cửa & tạo đề xuất thay thế...");
      try {
        const res = await fetch(
          `${API_BASE}/catalog/replace`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: activeProjectId,
              sku,
              replace_furniture_id: targetInstance.id,
            }),
          },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast("Đã tạo Đề xuất thay thế sản phẩm (Chờ duyệt)!");
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, productsCatalog, project, refreshProjectBundle, selectedEntityId, showToast],
  );

  const handleSaveSelectedFurnitureTransform = useCallback(
    async (entityId: string, xMm: number, yMm: number, rotDeg: number) => {
      if (!project) return;
      const updated = (project.furniture_instances || []).map((f: any) =>
        f.id === entityId
          ? {
              ...f,
              x_mm: xMm,
              y_mm: yMm,
              rotation_deg: rotDeg,
            }
          : f,
      );
      const updatedProject = { ...project, furniture_instances: updated };
      setBusyMessage("Đang lưu tọa độ nội thất & kiểm tra va chạm...");
      try {
        const res = await fetch(
          `${API_BASE}/projects/${activeProjectId}/scene`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedProject),
          },
        );
        if (res.ok) {
          await refreshProjectBundle(activeProjectId);
          showToast("Đã lưu vị trí nội thất mới vào Pascal SceneGraph!");
        } else throw new Error(`Lưu transform thất bại (${res.status})`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Lưu transform thất bại");
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, project, refreshProjectBundle, showToast],
  );

  const handleUpdateFurnitureField = useCallback(
    (entityId: string, field: string, value: unknown) => {
      setProject((current: any) => current ? {
        ...current,
        furniture_instances: (current.furniture_instances || []).map((item: any) =>
          item.id === entityId ? { ...item, [field]: value } : item,
        ),
      } : current);
    },
    [],
  );

  const handleSaveScene = useCallback(async () => {
    if (!project) return;
    setBusyMessage("Đang lưu SceneGraph và tạo revision...");
    try {
      const response = await fetch(`${API_BASE}/projects/${activeProjectId}/scene`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!response.ok) throw new Error(`Lưu Scene thất bại (${response.status})`);
      await refreshProjectBundle(activeProjectId);
      showToast("Đã lưu SceneGraph và tạo revision mới.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Lưu Scene thất bại");
    } finally {
      setBusyMessage(null);
    }
  }, [activeProjectId, project, refreshProjectBundle, showToast]);

  const handleExport = useCallback(async (format: "dxf" | "glb") => {
    setBusyMessage(`Đang xuất ${format.toUpperCase()}...`);
    try {
      const response = await fetch(`${API_BASE}/exports/${activeProjectId}/${format}`);
      if (!response.ok) throw new Error(`Xuất ${format.toUpperCase()} thất bại (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activeProjectId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast(`Đã xuất ${format.toUpperCase()} thực tế.`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Xuất ${format.toUpperCase()} thất bại`);
    } finally {
      setBusyMessage(null);
    }
  }, [activeProjectId, showToast]);

  const handleAssignAsset = useCallback(async (entityId: string, assetId: string) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/assign-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId }),
    });
    if (!response.ok) throw new Error(`Gán GLB thất bại (${response.status})`);
    await refreshProjectBundle(activeProjectId);
    return response.json();
  }, [activeProjectId, refreshProjectBundle]);

  const handleImportAssetAndAssign = useCallback(async (entityId: string, file: File) => {
    const selectedFurniture = project?.furniture_instances?.find((item: any) => item.id === entityId);
    if (!selectedFurniture) throw new Error("Không tìm thấy nội thất cần gắn model");
    const form = new FormData();
    form.append("file", file);
    form.append("name", selectedFurniture.name || file.name.replace(/\.glb$/i, ""));
    form.append("category", selectedFurniture.category || "furniture");
    form.append("author", "Người dùng ATELIER AI");
    form.append("license_name", "User-provided — quyền sử dụng do người tải lên xác nhận");
    form.append("scene_object_id", entityId);

    setBusyMessage("Đang kiểm tra và chuẩn hóa GLB...");
    try {
      const importedResponse = await fetch(`${API_BASE}/assets/import/user`, {
        method: "POST",
        body: form,
      });
      if (!importedResponse.ok) {
        const payload = await importedResponse.json().catch(() => null);
        throw new Error(payload?.detail || `Nhập GLB thất bại (${importedResponse.status})`);
      }
      const imported = await importedResponse.json();
      const asset = imported.asset;
      if (!asset?.asset_id) throw new Error("Asset GLB không có mã định danh");

      const assignResponse = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/assign-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: asset.asset_id }),
      });
      if (!assignResponse.ok) throw new Error(`Gắn GLB thất bại (${assignResponse.status})`);
      setAssetLibrary((current) => [asset, ...current.filter((item) => item.asset_id !== asset.asset_id)]);
      await refreshProjectBundle(activeProjectId);
      showToast(`Đã gắn model GLB thật cho ${selectedFurniture.name}.`);
    } finally {
      setBusyMessage(null);
    }
  }, [activeProjectId, project, refreshProjectBundle, showToast]);

  const handleCreateMaterialProposal = useCallback(async (entityId: string, payload: any) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/material-proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Tạo đề xuất vật liệu thất bại (${response.status})`);
    const result = await response.json();
    await refreshProjectBundle(activeProjectId);
    return result;
  }, [activeProjectId, refreshProjectBundle]);

  const handleCreateSurfaceMaterialProposal = useCallback(async (surfaceKey: string, payload: any) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/surfaces/${surfaceKey}/material-proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Tạo đề xuất vật liệu bề mặt thất bại (${response.status})`);
    const result = await response.json();
    await refreshProjectBundle(activeProjectId);
    return result;
  }, [activeProjectId, refreshProjectBundle]);

  const handleRequestSmartFit = useCallback(async (entityId: string) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/smart-fit`);
    if (!response.ok) throw new Error(`Smart Fit thất bại (${response.status})`);
    return response.json();
  }, [activeProjectId]);

  const handleRequestPlacementOptions = useCallback(async (entityId: string) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/placement-options?limit=2`);
    if (!response.ok) throw new Error(`Không tạo được phương án bố trí (${response.status})`);
    return response.json();
  }, [activeProjectId]);

  const handleCreatePlacementProposal = useCallback(async (entityId: string, option: any) => {
    const response = await fetch(`${API_BASE}/projects/${activeProjectId}/furniture/${entityId}/placement-proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(option),
    });
    if (!response.ok) throw new Error(`Tạo đề xuất bố trí thất bại (${response.status})`);
    const result = await response.json();
    await refreshProjectBundle(activeProjectId);
    return result;
  }, [activeProjectId, refreshProjectBundle]);

  const handleCreateProject = useCallback(
    async (name: string, style: string, budgetVnd: number) => {
      if (!name.trim()) return;
      setBusyMessage("Đang khởi tạo dự án mới...");
      try {
        const res = await fetch(`${API_BASE}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            room_type: "living_room",
            style_goal: style,
            budget_vnd: budgetVnd,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          setActiveProjectId(created.id);
          await refreshProjectBundle(created.id);
          showToast(`Đã tạo dự án "${created.name}" thành công!`);
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [refreshProjectBundle, showToast],
  );

  const handleCreateSpatialPin = useCallback(
    async (input: {
      entityId: string | null;
      entityName: string;
      positionMm: [number, number, number];
      comment: string;
    }) => {
      setBusyMessage("Đang ghim nhận xét lên 3D & tạo Task + Đề xuất Paperclip...");
      try {
        const res = await fetch(`/api/atelier/pins/${activeProjectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_id: input.entityId,
            entity_name: input.entityName,
            position_mm: input.positionMm,
            comment: input.comment,
            create_proposal: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          await refreshProjectBundle(activeProjectId);
          showToast(
            `Đã ghim nhận xét 3D & tạo công việc ${data.pin?.paperclip_issue_identifier ?? "Paperclip"}!`,
          );
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleRunWorkflow = useCallback(
    async (wfId: string) => {
      setBusyMessage("Đang thực thi luồng 14 Node Multi-Agent...");
      try {
        const res = await fetch(
          `${API_BASE}/workflows/${wfId}/runs?project_id=${activeProjectId}`,
          { method: "POST" },
        );
        if (res.ok) {
          const runsRes = await fetch(`${API_BASE}/runs`);
          if (runsRes.ok) setRuns(await runsRes.json());
          await refreshProjectBundle(activeProjectId);
          showToast("Đã thực thi luồng 14 Node Multi-Agent thành công!");
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectId, refreshProjectBundle, showToast],
  );

  const handleUpdateWorkflow = useCallback(
    async (wf: any) => {
      setBusyMessage("Đang cập nhật cấu hình quy trình...");
      try {
        const res = await fetch(`${API_BASE}/workflows/${wf.workflow_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(wf),
        });
        if (res.ok) {
          const updated = await res.json();
          setWorkflows((prev) =>
            prev.map((w) => (w.workflow_id === updated.workflow_id ? updated : w)),
          );
          showToast("Đã lưu cấu hình luồng Multi-Agent!");
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [showToast],
  );

  const handleUpdateAgent = useCallback(
    async (agent: any) => {
      setBusyMessage("Đang cập nhật thuộc tính Agent...");
      try {
        const res = await fetch(`${API_BASE}/agents/${agent.agent_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(agent),
        });
        if (res.ok) {
          const updated = await res.json();
          setAgents((prev) =>
            prev.map((a) => (a.agent_id === updated.agent_id ? updated : a)),
          );
          showToast(`Đã lưu cấu hình Tác tử: ${updated.name}`);
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [showToast],
  );

  const handleTestConnection = useCallback(
    async (connId: string) => {
      setBusyMessage("Đang kiểm tra kết nối...");
      try {
        const res = await fetch(`${API_BASE}/connections/${connId}/test`, {
          method: "POST",
        });
        if (res.ok) {
          const updated = await res.json();
          setConnections((prev) =>
            prev.map((c) => (c.connection_id === connId ? updated : c)),
          );
          showToast(`Kiểm tra kết nối ${updated.name}: ${updated.status} (${updated.latency_ms}ms)`);
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [showToast],
  );

  const handleSaveConnection = useCallback(
    async (conn: any) => {
      setBusyMessage("Đang lưu kết nối...");
      try {
        const res = await fetch(`${API_BASE}/connections/${conn.connection_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(conn),
        });
        if (res.ok) {
          const updated = await res.json();
          setConnections((prev) =>
            prev.map((c) => (c.connection_id === updated.connection_id ? updated : c)),
          );
          showToast(`Đã lưu thông số kết nối ${updated.name}`);
        }
      } finally {
        setBusyMessage(null);
      }
    },
    [showToast],
  );

  const value = useMemo(
    () => ({
      projects,
      activeProjectId,
      setActiveProjectId,
      taskScope,
      bindTaskScene,
      releaseTaskScope,
      showHiddenProjects,
      setShowHiddenProjects,
      setProjectHidden,
      project: visibleProjectFor(project, activeProjectId),
      estimate,
      materialsCatalog,
      productsCatalog,
      pbrMaterials,
      assetLibrary,
      chatHistory,
      revisions,
      pins,
      selectedEntityId,
      setSelectedEntityId,
      viewMode,
      setViewMode,
      cameraPreset,
      setCameraPreset,
      lightingPreset,
      setLightingPreset,
      workflows,
      runs,
      agents,
      connections,
      mcpTools,
      handleRunWorkflow,
      handleUpdateWorkflow,
      handleUpdateAgent,
      handleTestConnection,
      handleSaveConnection,
      busyMessage,
      errorMessage,
      toast,
      showToast,
      refreshProjectBundle,
      handleMaterialChange,
      handleSendChat,
      handleAnswerQuestion,
      handleProposalDecision,
      handleRestoreRevision,
      handleApplyDesignOption,
      handleReplaceProduct,
      handleSaveSelectedFurnitureTransform,
      handleUpdateFurnitureField,
      handleSaveScene,
      handleExport,
      handleAssignAsset,
      handleImportAssetAndAssign,
      handleCreateMaterialProposal,
      handleCreateSurfaceMaterialProposal,
      handleRequestSmartFit,
      handleRequestPlacementOptions,
      handleCreatePlacementProposal,
      handleCreateProject,
      handleCreateSpatialPin,
    }),
    [
      projects,
      activeProjectId,
      taskScope,
      bindTaskScene,
      releaseTaskScope,
      showHiddenProjects,
      setProjectHidden,
      project,
      estimate,
      materialsCatalog,
      productsCatalog,
      pbrMaterials,
      assetLibrary,
      chatHistory,
      revisions,
      pins,
      selectedEntityId,
      viewMode,
      cameraPreset,
      lightingPreset,
      workflows,
      runs,
      agents,
      connections,
      mcpTools,
      handleRunWorkflow,
      handleUpdateWorkflow,
      handleUpdateAgent,
      handleTestConnection,
      handleSaveConnection,
      busyMessage,
      errorMessage,
      toast,
      showToast,
      refreshProjectBundle,
      handleMaterialChange,
      handleSendChat,
      handleAnswerQuestion,
      handleProposalDecision,
      handleRestoreRevision,
      handleApplyDesignOption,
      handleReplaceProduct,
      handleSaveSelectedFurnitureTransform,
      handleUpdateFurnitureField,
      handleSaveScene,
      handleExport,
      handleAssignAsset,
      handleImportAssetAndAssign,
      handleCreateMaterialProposal,
      handleCreateSurfaceMaterialProposal,
      handleRequestSmartFit,
      handleRequestPlacementOptions,
      handleCreatePlacementProposal,
      handleCreateProject,
      handleCreateSpatialPin,
    ],
  );

  return (
    <AtelierStudioContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-teal-700/30 bg-teal-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </AtelierStudioContext.Provider>
  );
}

export function useAtelierStudio() {
  const ctx = useContext(AtelierStudioContext);
  if (!ctx) {
    throw new Error("useAtelierStudio must be used within AtelierStudioProvider");
  }
  return ctx;
}
