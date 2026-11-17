import { and, eq, inArray, like } from "drizzle-orm";
import { agents, issues, type Db } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import { issueService } from "./issues.js";

export const ATELIER_WORKFLOW_VERSION = 1;
export const ATELIER_WORKFLOW_ORIGIN = `atelier-agent-workflow:v${ATELIER_WORKFLOW_VERSION}`;

export type AtelierAgentKey =
  | "agent_concierge"
  | "agent_floorplan"
  | "agent_geometry"
  | "agent_furniture"
  | "agent_style"
  | "agent_ceiling_lighting"
  | "agent_qa"
  | "agent_research"
  | "agent_cost";

export type AtelierWorkflowStage = {
  key: string;
  label: string;
  agentKey: AtelierAgentKey;
  dependsOn: readonly string[];
  priority: "low" | "medium" | "high" | "urgent";
  description: string;
  legacyIssueNumber?: number;
};

export const ATELIER_WORKFLOW_STAGES: readonly AtelierWorkflowStage[] = [
  {
    key: "intake",
    label: "Chief Architect — chốt brief và phạm vi",
    agentKey: "agent_concierge",
    dependsOn: [],
    priority: "high",
    description: "Chốt yêu cầu, phạm vi, kích thước, ngân sách và tiêu chí phê duyệt trước khi giao việc chuyên môn.",
  },
  {
    key: "floorplan",
    label: "Floor Plan — xác thực mặt bằng và tỷ lệ",
    agentKey: "agent_floorplan",
    dependsOn: ["intake"],
    priority: "high",
    legacyIssueNumber: 2,
    description: "Đọc mặt bằng, xác nhận Scale Gate, tường, cửa đi, cửa sổ và các kích thước chuẩn theo mm.",
  },
  {
    key: "geometry",
    label: "Geometry & BIM — dựng SceneGraph",
    agentKey: "agent_geometry",
    dependsOn: ["floorplan"],
    priority: "high",
    legacyIssueNumber: 3,
    description: "Dựng hình học 3D/BIM từ mặt bằng đã xác thực và xuất hiện trạng kỹ thuật cho các bước thiết kế.",
  },
  {
    key: "furniture",
    label: "Furniture — bố trí nội thất",
    agentKey: "agent_furniture",
    dependsOn: ["geometry"],
    priority: "high",
    description: "Lập phương án bố trí nội thất, kiểm tra va chạm, vùng mở cửa và khoảng lưu thông.",
  },
  {
    key: "style",
    label: "Style & Materials — vật liệu và bảng màu",
    agentKey: "agent_style",
    dependsOn: ["geometry"],
    priority: "medium",
    legacyIssueNumber: 4,
    description: "Chốt phong cách, bảng màu và vật liệu hoàn thiện dựa trên hình học đã xác nhận.",
  },
  {
    key: "lighting",
    label: "Lighting & Visualization — trần, đèn và camera",
    agentKey: "agent_ceiling_lighting",
    dependsOn: ["furniture", "style"],
    priority: "medium",
    description: "Thiết kế trần/chiếu sáng, thiết lập camera và tạo bằng chứng phối cảnh bám sát SceneGraph.",
  },
  {
    key: "research",
    label: "Product Research — xác minh sản phẩm",
    agentKey: "agent_research",
    dependsOn: ["furniture", "style"],
    priority: "medium",
    description: "Xác minh SKU, kích thước, nguồn hàng, link và trạng thái giá cho vật liệu/nội thất được chọn.",
  },
  {
    key: "qa",
    label: "QA — kiểm định xung đột và quy chuẩn",
    agentKey: "agent_qa",
    dependsOn: ["geometry", "furniture", "style", "lighting"],
    priority: "high",
    description: "Kiểm định read-only hình học, va chạm, lối đi, góc mở cửa, vật liệu và tính nhất quán phối cảnh.",
  },
  {
    key: "cost",
    label: "Cost & BOM — bóc tách và dự toán",
    agentKey: "agent_cost",
    dependsOn: ["qa", "research"],
    priority: "high",
    legacyIssueNumber: 5,
    description: "Tính BOQ từ cảnh canonical hiện tại bằng GET /api/v1/projects/{canonical_scene_id}/cost-workflow và GET /api/v1/estimates/{canonical_scene_id} trên canonical sidecar. Khi có external_scene, chỉ dùng danh mục GLB đúng hash; không dùng furniture/rooms phòng cũ. Giá tham khảo (illustrative) có nguồn phải tách riêng, không coi là SKU thật. Handoff snapshot_id, revision, scene_asset_hash, lines, độ phủ và missing_item_ids. Thiếu giá/khối lượng trả needs_input; trình duyệt dự toán trước nghiệm thu.",
  },
  {
    key: "final_review",
    label: "Chief Architect — tổng hợp và xin phê duyệt",
    agentKey: "agent_concierge",
    dependsOn: ["cost"],
    priority: "high",
    description: "Tổng hợp phương án, QA, BOQ và nguồn hàng; trình người dùng phê duyệt trước khi commit/export cuối.",
  },
] as const;

const stageByKey = new Map(ATELIER_WORKFLOW_STAGES.map((stage) => [stage.key, stage]));

export function validateAtelierWorkflowGraph(stages: readonly AtelierWorkflowStage[] = ATELIER_WORKFLOW_STAGES) {
  const keys = new Set(stages.map((stage) => stage.key));
  if (keys.size !== stages.length) throw new Error("Atelier workflow stage keys must be unique");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const visit = (key: string) => {
    if (visiting.has(key)) throw new Error(`Atelier workflow contains a cycle at ${key}`);
    if (visited.has(key)) return;
    const stage = byKey.get(key);
    if (!stage) throw new Error(`Atelier workflow references unknown stage ${key}`);
    visiting.add(key);
    for (const dependency of stage.dependsOn) {
      if (!keys.has(dependency)) throw new Error(`Atelier workflow stage ${key} depends on unknown stage ${dependency}`);
      visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const stage of stages) visit(stage.key);
  return true;
}

validateAtelierWorkflowGraph();

export function atelierHandoffTargets(sourceAgentKey: AtelierAgentKey): AtelierAgentKey[] {
  const targets = new Set<AtelierAgentKey>();
  for (const stage of ATELIER_WORKFLOW_STAGES) {
    for (const dependencyKey of stage.dependsOn) {
      const dependency = stageByKey.get(dependencyKey);
      if (dependency?.agentKey === sourceAgentKey && stage.agentKey !== sourceAgentKey) {
        targets.add(stage.agentKey);
      }
    }
  }
  return [...targets];
}

export function assertAtelierHandoffAllowed(sourceAgentKey: AtelierAgentKey, targetAgentKey: AtelierAgentKey) {
  if (!atelierHandoffTargets(sourceAgentKey).includes(targetAgentKey)) {
    throw unprocessable(`Handoff ${sourceAgentKey} -> ${targetAgentKey} is outside the Atelier workflow`);
  }
}

export type AtelierWorkflowReconcileInput = {
  companyId: string;
  projectId: string;
  goalId: string;
  chiefAgentId: string;
  agentIdsByKey: Record<string, string>;
};

export type AtelierWorkflowTaskSummary = {
  stageKey: string;
  issueId: string;
  identifier: string | null;
  status: string;
  assigneeAgentId: string | null;
  parentId: string | null;
  blockedByIssueIds: string[];
};

export type AtelierWorkflowSummary = {
  version: number;
  projectId: string;
  rootIssueId: string;
  stages: AtelierWorkflowTaskSummary[];
};

export function atelierWorkflowCompletion(tasks: readonly { id: string; status: string }[]) {
  const pending = tasks.filter(task => task.status !== 'done');
  return { status: tasks.length === ATELIER_WORKFLOW_STAGES.length && pending.length === 0 ? 'done' as const : 'todo' as const,
    blockedByIssueIds: pending.map(task => task.id) };
}

export async function listAtelierIssueWorkflowRoots(db: Db, companyId: string) {
  return db.select().from(issues).where(and(eq(issues.companyId, companyId), like(issues.originId, `${ATELIER_WORKFLOW_ORIGIN}:%:root`)));
}

export async function getAtelierIssueWorkflowView(db: Db, companyId: string, projectId: string) {
  const roots = await listAtelierIssueWorkflowRoots(db, companyId);
  const root = roots.find(row => row.projectId === projectId);
  if (!root) return null;
  const children = await db.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.projectId, projectId), eq(issues.parentId, root.id)));
  const assignedIds = [...new Set(children.map(row => row.assigneeAgentId).filter((id): id is string => Boolean(id)))];
  const owners = assignedIds.length ? await db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.companyId, companyId), inArray(agents.id, assignedIds))) : [];
  return atelierIssueWorkflowView(root, children, owners);
}

export function atelierIssueWorkflowView(
  root: { id: string; identifier: string | null; title: string; status: string },
  children: Array<{ id: string; originId: string | null; identifier: string | null; status: string; assigneeAgentId: string | null }>,
  owners: Array<{ id: string; name: string }>,
) {
  const stageIssues = ATELIER_WORKFLOW_STAGES.map(stage => ({stage, issue: children.find(row => row.originId?.endsWith(`:stage:${stage.key}`))}));
  const missing = stageIssues.some(row => !row.issue);
  const complete = !missing && stageIssues.every(row => row.issue?.status === 'done') && root.status === 'done';
  const statusMap: Record<string,string> = {done:'done',in_review:'needs_review',in_progress:'running',blocked:'blocked',backlog:'pending',todo:'ready',cancelled:'blocked'};
  return {
    run: { id: root.id, status: complete ? 'done' : missing || children.some(row => row.status === 'blocked' || row.status === 'cancelled') ? 'blocked' : children.some(row => row.status === 'in_review') ? 'needs_review' : children.some(row => row.status === 'in_progress') ? 'running' : 'pending', workflowVersion: ATELIER_WORKFLOW_VERSION, source: 'issue_workflow' },
    rootIssue: root,
    stages: stageIssues.map(({stage,issue}) => ({stageKey:stage.key,status:issue ? statusMap[issue.status] ?? 'pending' : 'pending',
      blockerReason: !issue ? 'Chưa có task cho bước này' : issue.status === 'blocked' ? 'Task đang bị chặn; xem chi tiết công việc' : null,
      issue:issue ?? null,agent:owners.find(owner => owner.id === issue?.assigneeAgentId) ?? null,dependencies:[...stage.dependsOn]})),
  };
}

export async function reconcileAtelierAgentWorkflow(
  db: Db,
  input: AtelierWorkflowReconcileInput,
): Promise<AtelierWorkflowSummary> {
  validateAtelierWorkflowGraph();
  const svc = issueService(db);
  const rootOriginId = `${ATELIER_WORKFLOW_ORIGIN}:${input.projectId}:root`;
  const existing = await db.select().from(issues).where(eq(issues.companyId, input.companyId));
  let root = existing.find((issue) => issue.originId === rootOriginId) ?? null;
  if (!root) {
    root = await svc.create(input.companyId, {
      projectId: input.projectId,
      goalId: input.goalId,
      title: "[ATELIER WORKFLOW] Điều phối thiết kế nội thất end-to-end",
      description: "Workflow root do Chief Architect quản lý. Các task con và dependency là nguồn sự thật cho handoff giữa các Atelier agents.",
      status: "backlog",
      priority: "high",
      assigneeAgentId: input.chiefAgentId,
      createdByAgentId: input.chiefAgentId,
      responsibleUserId: "local-board",
      originKind: "manual",
      originId: rootOriginId,
      idempotencyKey: rootOriginId,
      allowDuplicate: false,
    });
  }

  // Origin IDs identify this workflow permanently. The board may explicitly
  // relocate its root to another project; startup must preserve that binding.
  const boundProjectId = root.projectId ?? input.projectId;

  const tasks = new Map<string, typeof issues.$inferSelect>();
  for (const stage of ATELIER_WORKFLOW_STAGES) {
    const agentId = input.agentIdsByKey[stage.agentKey];
    if (!agentId) throw new Error(`Missing Atelier agent ${stage.agentKey}`);
    const originId = `${ATELIER_WORKFLOW_ORIGIN}:${input.projectId}:stage:${stage.key}`;
    const taskTitle = `[ATELIER • ${stage.key}] ${stage.label}`;
    const taskDescription = `${stage.description}\n\nCurrent project binding: ${boundProjectId}. Read GET /api/v1/native-projects/${boundProjectId}/workspace on the canonical sidecar to resolve the linked scene before work. The active imported GLB, if present, is authoritative; do not reuse old bedroom/demo furniture or treat historical missing-input comments as current facts. Read current scene/revision and prior user decisions first.\n\nDecision gate: dữ liệu về ngân sách, công năng, phong cách, màu sơn/bảng màu, vật liệu hoặc nội thất chưa được người dùng xác nhận phải trả needs_input. Chỉ trình A/B/C và chờ người dùng chọn; không tự chốt, không dùng dữ liệu demo làm fact.\n\nKhi hoàn tất, chỉ handoff theo các target được công bố trong Atelier workflow.`;
    const blockerIds = stage.dependsOn.map((dependency) => {
      const task = tasks.get(dependency);
      if (!task) throw new Error(`Workflow dependency ${dependency} was not reconciled before ${stage.key}`);
      return task.id;
    });
    let task = existing.find((issue) => issue.originId === originId) ?? null;
    if (!task && stage.legacyIssueNumber !== undefined) {
      task = existing.find((issue) =>
        issue.projectId === boundProjectId && issue.issueNumber === stage.legacyIssueNumber) ?? null;
    }
    if (!task) {
      task = await svc.create(input.companyId, {
        projectId: boundProjectId,
        goalId: input.goalId,
        parentId: root.id,
        parentDepthPolicy: "allow_nested",
        expectedParentId: root.id,
        title: taskTitle,
        description: taskDescription,
        status: "todo",
        priority: stage.priority,
        assigneeAgentId: agentId,
        createdByAgentId: input.chiefAgentId,
        responsibleUserId: "local-board",
        originKind: "manual",
        originId,
        blockedByIssueIds: blockerIds,
        idempotencyKey: originId,
        allowDuplicate: false,
      });
    } else {
      const normalizeIdleInProgress = task.status === "in_progress" && !task.executionRunId && !task.checkoutRunId;
      const updated = await svc.update(task.id, {
        companyGuard: input.companyId,
        projectId: boundProjectId,
        goalId: input.goalId,
        parentId: root.id,
        parentDepthPolicy: "allow_nested",
        expectedParentId: root.id,
        title: taskTitle,
        description: taskDescription,
        assigneeAgentId: agentId,
        originKind: "manual",
        originId,
        blockedByIssueIds: blockerIds,
        ...(normalizeIdleInProgress ? { status: "todo", startedAt: null } : {}),
        actorAgentId: input.chiefAgentId,
      });
      if (updated) task = updated;
    }
    tasks.set(stage.key, task);
  }

  const finalTask = tasks.get("final_review");
  if (!finalTask) throw new Error("Atelier workflow final_review stage is missing");
  const completion = atelierWorkflowCompletion([...tasks.values()]);
  const updatedRoot = await svc.update(root.id, {
    companyGuard: input.companyId,
    projectId: boundProjectId,
    goalId: input.goalId,
    assigneeAgentId: input.chiefAgentId,
    status: completion.status,
    blockedByIssueIds: completion.blockedByIssueIds,
    actorAgentId: input.chiefAgentId,
  });
  if (updatedRoot) root = updatedRoot;

  const allAgentIds = Object.values(input.agentIdsByKey);
  const agentRows = await db.select().from(agents).where(and(
    eq(agents.companyId, input.companyId),
    inArray(agents.id, allAgentIds),
  ));
  const keyById = new Map(Object.entries(input.agentIdsByKey).map(([key, id]) => [id, key as AtelierAgentKey]));
  for (const agent of agentRows) {
    const agentKey = keyById.get(agent.id);
    if (!agentKey) continue;
    const handoffTargets = atelierHandoffTargets(agentKey);
    const metadata = (agent.metadata as Record<string, unknown> | null) ?? {};
    const permissions = (agent.permissions as Record<string, unknown> | null) ?? {};
    const allowedTools = new Set(Array.isArray(permissions.allowedTools) ? permissions.allowedTools.filter((tool): tool is string => typeof tool === "string") : []);
    if (handoffTargets.length > 0) {
      allowedTools.add("Tasks");
      allowedTools.add("Conversations");
    }
    await db.update(agents).set({
      metadata: {
        ...metadata,
        atelierWorkflow: {
          version: ATELIER_WORKFLOW_VERSION,
          stages: ATELIER_WORKFLOW_STAGES.filter((stage) => stage.agentKey === agentKey).map((stage) => stage.key),
          handoffTargets,
        },
      },
      permissions: { ...permissions, allowedTools: [...allowedTools] },
      updatedAt: new Date(),
    }).where(and(eq(agents.companyId, input.companyId), eq(agents.id, agent.id)));
  }

  const stageRows = [...tasks.entries()].map(([stageKey, issue]) => ({ stageKey, issue }));
  return {
    version: ATELIER_WORKFLOW_VERSION,
    projectId: boundProjectId,
    rootIssueId: root.id,
    stages: stageRows.map(({ stageKey, issue }) => ({
      stageKey,
      issueId: issue.id,
      identifier: issue.identifier,
      status: issue.status,
      assigneeAgentId: issue.assigneeAgentId,
      parentId: issue.parentId,
      blockedByIssueIds: ATELIER_WORKFLOW_STAGES.find((stage) => stage.key === stageKey)?.dependsOn
        .map((dependency) => tasks.get(dependency)?.id)
        .filter((id): id is string => Boolean(id)) ?? [],
    })),
  };
}
