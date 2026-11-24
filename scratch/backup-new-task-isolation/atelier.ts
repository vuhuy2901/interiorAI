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
}

export const atelierApi = {
  startProject: (companyId: string, brief: string, idempotencyKey: string) =>
    api.post<AtelierProjectIntakeResult>(`/companies/${encodeURIComponent(companyId)}/atelier/project-intakes`, {
      brief,
      idempotencyKey,
    }),
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
