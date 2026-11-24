// FEAT-2026-131: quy tắc cô lập dự án nội thất theo task (issue).
// Tách thành hàm thuần để kiểm thử được mà không cần render React.

export type TaskScopeStatus = "none" | "resolving" | "ready" | "error";

export interface TaskProjectScope {
  /** null = không gắn task (trang Studio độc lập, người dùng tự chọn dự án). */
  scoped: boolean;
  issueId: string | null;
  status: TaskScopeStatus;
  error: string | null;
}

export const UNSCOPED_TASK_SCOPE: TaskProjectScope = { scoped: false, issueId: null, status: "none", error: null };

export const EMPTY_CHAT_HISTORY = { messages: [], pending_questions: [], proposals: [] } as const;

/** Đang gắn task thì tuyệt đối không tự chọn dự án đầu danh sách. */
export function mayAutoPickFirstProject(scope: TaskProjectScope): boolean {
  return !scope.scoped;
}

/** Phản hồi mạng của dự án A không được ghi vào state khi dự án đang mở đã là B. */
export function isStaleProjectResponse(requestedProjectId: string, currentProjectId: string): boolean {
  return requestedProjectId !== currentProjectId;
}

export function issueSceneQueryKey(issueId: string | null | undefined) {
  return ["atelier", "issue-scene", issueId ?? "none"] as const;
}

/** Dự án dùng cho giao diện: chỉ khi scene đã nạp đúng là dự án đang chọn. */
export function visibleProjectFor<T extends { project_id?: string } | null>(project: T, activeProjectId: string): T | null {
  if (!project || !activeProjectId) return null;
  return project.project_id === activeProjectId ? project : null;
}

export function nextTaskScope(
  issueId: string | null,
  sceneId: string | null,
  failed: string | null,
): { scope: TaskProjectScope; activeProjectId: string } {
  if (!issueId) return { scope: { scoped: true, issueId: null, status: "resolving", error: null }, activeProjectId: "" };
  if (failed) return { scope: { scoped: true, issueId, status: "error", error: failed }, activeProjectId: "" };
  if (!sceneId) return { scope: { scoped: true, issueId, status: "resolving", error: null }, activeProjectId: "" };
  return { scope: { scoped: true, issueId, status: "ready", error: null }, activeProjectId: sceneId };
}

// ---- CR-1 (FEAT-2026-131 v1.1) ----

/** Task thuộc ngữ cảnh atelier khi người nhận là Chief Architect (cùng cách nhận biết với mặc định assignee của dialog). */
export function isAtelierAgent(agent: { name?: string | null; role?: string | null; title?: string | null; key?: string | null } | null | undefined): boolean {
  if (!agent) return false;
  const text = `${agent.name ?? ""} ${agent.role ?? ""} ${agent.title ?? ""}`.toLowerCase();
  return String(agent.key ?? "").toLowerCase() === "agent_chief_architect"
    || text.includes("chief architect")
    || text.includes("kiến trúc sư trưởng");
}

export interface SelectableProject { project_id: string; name?: string; hidden?: boolean }

/** Chỉ các dự án đang hiện; dự án ẩn không bao giờ là lựa chọn. */
export function selectableProjects<T extends SelectableProject>(projects: readonly T[] | null | undefined): T[] {
  return (projects ?? []).filter((item) => item && item.project_id && !item.hidden);
}

export const LAST_STUDIO_PROJECT_KEY = "atelier.studio.lastProjectId";

export function readLastStudioProject(storage: Pick<Storage, "getItem"> | null = safeStorage()): string | null {
  try {
    const value = storage?.getItem(LAST_STUDIO_PROJECT_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeLastStudioProject(projectId: string, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (projectId) storage?.setItem(LAST_STUDIO_PROJECT_KEY, projectId);
    else storage?.removeItem(LAST_STUDIO_PROJECT_KEY);
  } catch {
    /* localStorage có thể bị chặn: bỏ qua */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Studio độc lập: chỉ dùng dự án người dùng đã chọn lần cuối nếu còn tồn tại và không ẩn. KHÔNG bao giờ lấy projects[0]. */
export function pickRememberedProject(projects: readonly SelectableProject[] | null | undefined, rememberedId: string | null): string | null {
  if (!rememberedId) return null;
  return selectableProjects(projects).some((item) => item.project_id === rememberedId) ? rememberedId : null;
}

export type LegacyTaskState = "checking" | "linked" | "unlinked" | "error";

/** Kết quả GET scene của task: 404 = task cũ chưa link (không tự tạo scene rỗng). */
export function legacyTaskState(input: { isLoading: boolean; hasScene: boolean; errorStatus: number | null; hasError: boolean }): LegacyTaskState {
  if (input.hasScene) return "linked";
  if (input.isLoading) return "checking";
  if (input.hasError) return input.errorStatus === 404 ? "unlinked" : "error";
  return "checking";
}
