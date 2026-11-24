import type { Project } from "@paperclipai/shared";
import { api } from "./client";

export interface AtelierRoomSummary {
  room_id: string;
  native_project_id: string;
  name: string;
  room_type: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface AtelierSceneSummary {
  scene_id: string;
  native_project_id: string;
  room_id: string | null;
  name: string;
  provenance: "native" | "legacy" | "fixture" | "unknown";
  is_fixture: boolean;
  archived: boolean;
  latest_revision: number;
  revision_count: number;
  updated_at: string;
}

export interface AtelierProjectWorkspace {
  native_project_id: string;
  company_id: string;
  project_name: string;
  brief: string;
  conversation_issue_id: string | null;
  initialization_status: "pending" | "ready" | "failed";
  initialization_error: string | null;
  rooms: AtelierRoomSummary[];
  scenes: AtelierSceneSummary[];
}

export interface AtelierProjectIntakeResult {
  project: Project;
  conversationIssueId: string | null;
  initializationStatus: "ready" | "retry_required" | "blocked";
  error: string | null;
  workflowRunId?: string;
  rootIssueId?: string;
  stages?: Array<{ stageKey: string; status: string; issueId: string | null; agentId: string }>;
}

export interface AtelierIssueScene {
  issue_id: string;
  company_id: string;
  scene_id: string;
  native_project_id: string | null;
  origin: "new" | "continued";
  created: boolean;
}

export interface AtelierSelectableProject {
  project_id: string;
  name: string;
  revision?: number;
  hidden?: boolean;
}

export const atelierApi = {
  /** Danh sách dự án có thể chọn (đã loại dự án ẩn và fixture ở phía API). */
  listProjects: async (): Promise<AtelierSelectableProject[]> => {
    const res = await fetch("/api/v1/projects?include_fixtures=false");
    if (!res.ok) throw new Error(`Không thể tải danh sách dự án (${res.status})`);
    const json = await res.json();
    const rows: AtelierSelectableProject[] = Array.isArray(json) ? json : json.projects || [];
    return rows.filter((item) => item && item.project_id && !item.hidden);
  },
  /** Scene của đúng task này; idempotent. continueSceneId chỉ truyền khi người dùng chủ động chọn tiếp tục dự án cũ. */
  ensureIssueScene: (issueId: string, continueSceneId?: string | null) =>
    api.post<AtelierIssueScene>(`/issues/${encodeURIComponent(issueId)}/atelier/scene`, {
      continueSceneId: continueSceneId ?? null,
    }),
  issueScene: (issueId: string) =>
    api.get<AtelierIssueScene>(`/issues/${encodeURIComponent(issueId)}/atelier/scene`),
  startProject: (companyId: string, brief: string, idempotencyKey: string, options?: { sourceIssueId?: string; workflowDefinitionId?: string; executionMode?: "delivery" | "consultation" }) =>
    api.post<AtelierProjectIntakeResult>(`/companies/${encodeURIComponent(companyId)}/atelier/project-intakes`, {
      brief,
      idempotencyKey,
      executionMode: "delivery",
      decisionPolicy: "specialist_autonomy",
      ...options,
    }),
  deliveryRun: (runId: string) => api.get<Record<string, unknown>>(`/atelier/workflow/runs/${encodeURIComponent(runId)}`),
  workspace: (projectId: string) =>
    api.get<AtelierProjectWorkspace>(`/projects/${encodeURIComponent(projectId)}/atelier/workspace`),
  scene: (projectId: string, sceneId: string) =>
    api.get<Record<string, unknown>>(`/projects/${encodeURIComponent(projectId)}/atelier/scenes/${encodeURIComponent(sceneId)}`),
  createRoom: (projectId: string, name: string, roomType = "other") =>
    api.post<AtelierRoomSummary>(`/projects/${encodeURIComponent(projectId)}/atelier/rooms`, { name, room_type: roomType }),
  linkScene: (projectId: string, sceneId: string, roomId: string | null) =>
    api.post<AtelierSceneSummary>(`/projects/${encodeURIComponent(projectId)}/atelier/scenes/${encodeURIComponent(sceneId)}/link`, {
      room_id: roomId,
      provenance: "legacy",
    }),
};
