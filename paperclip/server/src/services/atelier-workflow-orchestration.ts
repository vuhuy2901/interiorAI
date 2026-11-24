import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  activityLog,
  agents,
  atelierWorkflowEvents,
  atelierWorkflowRuns,
  atelierWorkflowStageExecutions,
  goals,
  issues,
  projectGoals,
  projects,
  workflows,
  type AtelierWorkflowRunStatus,
  type AtelierWorkflowStageStatus,
  type Db,
} from "@paperclipai/db";
import { conflict, forbidden, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";
import { assertAtelierNodeAssignment, resolveActiveAtelierWorkflowName, upgradeLegacyAtelierDefinition } from "./atelier-workflow-builder.js";
import { readDeliverySnapshot, specialistDeliveryView } from "./atelier-specialist-delivery.js";

// The local Paperclip database uses the ATL company created by the current
// bootstrap. Keep this in sync with the persisted company rather than the
// retired seed UUID; otherwise project reconciliation is rejected before it
// can create or resume the workflow stages.
export const ATELIER_COMPANY_ID = "0873a79a-62ba-4bc3-9f2d-9277b4b6c6ed";
export const ATELIER_COMPANY_WORKFLOW_NAME = "Atelier Company Workflow";
export const ATELIER_COMPANY_WORKFLOW_VERSION = 1;
export const ATELIER_COMPANY_WORKFLOW_ORIGIN = `atelier-company-workflow:v${ATELIER_COMPANY_WORKFLOW_VERSION}`;

export type AtelierCanonicalStage = {
  key: string;
  label: string;
  agentKey: string;
  dependsOn: string[];
  description: string;
  requiredInputs: string[];
  gate: { decisionLedger: boolean; outputReferences: boolean; approval: boolean };
};

export const ATELIER_CANONICAL_STAGES: readonly AtelierCanonicalStage[] = [
  {
    key: "floorplan",
    label: "Floor Plan",
    agentKey: "agent_floorplan",
    dependsOn: [],
    description: "Xác thực mặt bằng, đơn vị mm, tường, cửa đi, cửa sổ và tỷ lệ.",
    requiredInputs: ["floor_plan_or_dimensions", "scale_confidence"],
    gate: { decisionLedger: true, outputReferences: true, approval: false },
  },
  {
    key: "geometry",
    label: "Geometry / BIM",
    agentKey: "agent_geometry",
    dependsOn: ["floorplan"],
    description: "Dựng hình học/BIM từ mặt bằng đã xác thực, có kiểm tra kích thước.",
    requiredInputs: ["floorplan_handoff", "room_dimensions"],
    gate: { decisionLedger: true, outputReferences: true, approval: false },
  },
  {
    key: "furniture",
    label: "Furniture",
    agentKey: "agent_furniture",
    dependsOn: ["geometry"],
    description: "Bố trí nội thất, kiểm tra va chạm, vùng mở cửa và lối lưu thông.",
    requiredInputs: ["geometry_handoff", "functional_needs"],
    gate: { decisionLedger: true, outputReferences: true, approval: false },
  },
  {
    key: "style",
    label: "Style / Materials",
    agentKey: "agent_style",
    dependsOn: ["geometry"],
    description: "Đề xuất và xác nhận phong cách, màu, vật liệu; unknown phải needs_input.",
    requiredInputs: ["geometry_handoff", "style_preferences", "material_preferences"],
    gate: { decisionLedger: true, outputReferences: true, approval: true },
  },
  {
    key: "lighting",
    label: "Render / Visualization",
    agentKey: "agent_render",
    dependsOn: ["furniture", "style"],
    description: "Inspect canonical scene, design lighting, run Blender Cycles render pipeline và publish gallery artifacts.",
    requiredInputs: ["furniture_handoff", "style_handoff"],
    gate: { decisionLedger: true, outputReferences: true, approval: false },
  },
  {
    key: "cost",
    label: "Cost / BOM",
    agentKey: "agent_cost",
    dependsOn: ["lighting"],
    description: "Bóc tách BOM từ GET /api/v1/projects/{canonical_scene_id}/cost-workflow trên canonical sidecar. Đọc estimates cùng scene_id; với external_scene chỉ tính nhóm GLB đúng asset hash, không dùng đồ phòng cũ. Handoff snapshot_id, revision, scene_asset_hash, lines, độ phủ, giá tham khảo riêng và mục thiếu. Ngân sách/giá/khối lượng thiếu phải needs_input; không tự chốt hoặc bỏ qua phê duyệt.",
    requiredInputs: ["design_handoff", "budget_range", "price_sources"],
    gate: { decisionLedger: true, outputReferences: true, approval: true },
  },
  {
    key: "qa",
    label: "QA",
    agentKey: "agent_qa",
    dependsOn: ["cost"],
    description: "Kiểm tra hình học, công năng, hồ sơ, nguồn giá và các quyết định còn thiếu.",
    requiredInputs: ["all_prior_outputs"],
    gate: { decisionLedger: true, outputReferences: true, approval: false },
  },
  {
    key: "final_review",
    label: "Final Review",
    agentKey: "agent_concierge",
    dependsOn: ["qa"],
    description: "Chief tổng hợp, nêu phần cần người dùng duyệt và chỉ kết luận sau approval.",
    requiredInputs: ["qa_handoff", "approval_record"],
    gate: { decisionLedger: true, outputReferences: true, approval: true },
  },
] as const;

export type AtelierWorkflowDefinition = {
  key: string;
  version: number;
  stages: AtelierCanonicalStage[];
  edges: Array<{ from: string; to: string }>;
  chiefResponsibilities: string[];
  stateMachine: string[];
  gatePolicy: Record<string, unknown>;
};

export type AtelierProjectWorkflowView = {
  run: typeof atelierWorkflowRuns.$inferSelect;
  rootIssue: typeof issues.$inferSelect | null;
  stages: Array<typeof atelierWorkflowStageExecutions.$inferSelect & {
    issue: typeof issues.$inferSelect | null;
    agent: typeof agents.$inferSelect | null;
    dependencies: string[];
  }>;
};

const workflowDefinition: AtelierWorkflowDefinition = {
  key: ATELIER_COMPANY_WORKFLOW_ORIGIN,
  version: ATELIER_COMPANY_WORKFLOW_VERSION,
  stages: ATELIER_CANONICAL_STAGES.map((stage) => ({ ...stage, dependsOn: [...stage.dependsOn], requiredInputs: [...stage.requiredInputs] })),
  edges: ATELIER_CANONICAL_STAGES.flatMap((stage) => stage.dependsOn.map((from) => ({ from, to: stage.key }))),
  chiefResponsibilities: ["intake", "planning", "delegation", "monitoring", "review"],
  stateMachine: ["pending", "ready", "running", "done", "needs_input", "blocked", "needs_review", "failed"],
  gatePolicy: {
    unknownData: "needs_input",
    noAutoDecision: true,
    approvalRequiredBefore: ["style", "cost", "final_review"],
    artifactRequiredForHandoff: true,
    decisionLedgerRequiredForHandoff: true,
  },
};

function validateCanonicalGraph(stages: readonly AtelierCanonicalStage[]) {
  const keys = new Set(stages.map((stage) => stage.key));
  if (keys.size !== stages.length || keys.size !== 8) throw new Error("Atelier canonical workflow must contain exactly eight unique stages");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const visit = (key: string) => {
    if (visiting.has(key)) throw new Error(`Atelier canonical workflow contains a cycle at ${key}`);
    if (visited.has(key)) return;
    const stage = byKey.get(key);
    if (!stage) throw new Error(`Unknown Atelier stage ${key}`);
    visiting.add(key);
    for (const dependency of stage.dependsOn) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const stage of stages) visit(stage.key);
}

validateCanonicalGraph(ATELIER_CANONICAL_STAGES);

function stageByKey(key: string) {
  return ATELIER_CANONICAL_STAGES.find((stage) => stage.key === key) ?? null;
}

function issueStatusToStageStatus(issue: typeof issues.$inferSelect | null, dependencyIssues: Array<typeof issues.$inferSelect>) : AtelierWorkflowStageStatus {
  if (!issue) return "pending";
  if (issue.status === "done") return "done";
  if (issue.status === "in_progress") return "running";
  if (issue.status === "in_review") return "needs_review";
  if (issue.status === "blocked") return "blocked";
  if (issue.status === "cancelled") return "failed";
  if (dependencyIssues.some((dependency) => dependency.status !== "done")) return "pending";
  return issue.status === "todo" ? "ready" : "pending";
}

async function lockProject(db: Db, companyId: string, projectId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-workflow:${companyId}:${projectId}`}, 0))`);
}

async function findAgents(db: Db, companyId: string) {
  const rows = await db.select().from(agents).where(eq(agents.companyId, companyId));
  const byKey: Record<string, string> = {};
  for (const agent of rows) {
    const key = (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey;
    if (typeof key === "string") byKey[key] = agent.id;
  }
  return { rows, byKey };
}

export async function ensureAtelierCompanyWorkflowDefinition(db: Db, companyId: string, createdByAgentId?: string | null) {
  validateCanonicalGraph(ATELIER_CANONICAL_STAGES);
  // FEAT-2026-134: a company that selected a different workflow family runs
  // that one instead; a company that never opted in keeps the historical
  // hardcoded default name and auto-seed behavior below, unchanged.
  const activeName = await resolveActiveAtelierWorkflowName(db, companyId);
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-definition:${companyId}:${activeName}`}, 0))`);
  const existing = await db.select().from(workflows).where(and(
    eq(workflows.companyId, companyId),
    eq(workflows.name, activeName),
    eq(workflows.status, "published"),
  )).orderBy(desc(workflows.version)).then((rows) => rows[0] ?? null);
  if (existing) return existing;
  if (activeName !== ATELIER_COMPANY_WORKFLOW_NAME) {
    // The company explicitly selected this family; it must already have a
    // published version (selectAtelierWorkflowFamily enforces this at
    // selection time), so reaching here means the row was removed out of
    // band. Do not silently fall back to seeding the unrelated default.
    throw conflict("Selected workflow family has no published version", { code: "workflow_family_not_publishable" });
  }
  return db.insert(workflows).values({
    companyId,
    name: ATELIER_COMPANY_WORKFLOW_NAME,
    prompt: "Company-wide Atelier orchestration. Chief coordinates intake, delegation, monitoring and review; specialists execute only their gated stage.",
    scope: "company",
    version: ATELIER_COMPANY_WORKFLOW_VERSION,
    status: "published",
    definition: workflowDefinition as unknown as Record<string, unknown>,
    createdByAgentId: createdByAgentId ?? null,
  }).returning().then((rows) => rows[0]!);
}

async function projectGoalId(db: Db, companyId: string, project: typeof projects.$inferSelect) {
  if (project.goalId) {
    const goal = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, project.goalId), eq(goals.companyId, companyId))).then((rows) => rows[0] ?? null);
    if (goal) return goal.id;
  }
  const linked = await db.select({ goalId: projectGoals.goalId }).from(projectGoals).where(and(
    eq(projectGoals.companyId, companyId), eq(projectGoals.projectId, project.id),
  )).orderBy(asc(projectGoals.createdAt)).then((rows) => rows[0] ?? null);
  if (linked) return linked.goalId;
  return db.select({ id: goals.id }).from(goals).where(and(eq(goals.companyId, companyId), eq(goals.level, "company"))).orderBy(asc(goals.createdAt)).then((rows) => rows[0]?.id ?? null);
}

async function findReusableRoot(db: Db, companyId: string, projectId: string) {
  const candidates = await db.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.projectId, projectId))).orderBy(asc(issues.createdAt));
  return candidates.find((issue) =>
    issue.parentId === null && (
      issue.originId?.startsWith("atelier-agent-workflow:") ||
      issue.originId?.startsWith(ATELIER_COMPANY_WORKFLOW_ORIGIN) ||
      issue.title.startsWith("[ATELIER WORKFLOW]") ||
      issue.identifier === "ATL-26"
    )
  ) ?? null;
}

async function findProjectSourceIssue(db: Db, companyId: string, projectId: string) {
  const activity = await db.select({ details: activityLog.details }).from(activityLog).where(and(
    eq(activityLog.companyId, companyId),
    eq(activityLog.action, "project.created"),
    eq(activityLog.entityType, "project"),
    eq(activityLog.entityId, projectId),
  )).orderBy(desc(activityLog.createdAt)).then((rows) => rows[0] ?? null);
  const sourceIssueId = activity?.details?.sourceIssueId;
  if (typeof sourceIssueId !== "string" || !sourceIssueId) return null;
  return db.select().from(issues).where(and(
    eq(issues.companyId, companyId),
    eq(issues.id, sourceIssueId),
  )).then((rows) => rows[0] ?? null);
}

function stageOriginId(projectId: string, stageKey: string) {
  return `${ATELIER_COMPANY_WORKFLOW_ORIGIN}:${projectId}:stage:${stageKey}`;
}

function bedroomMasterBrief(project: typeof projects.$inferSelect) {
  const normalized = project.name.toLocaleLowerCase("vi");
  if (!normalized.includes("phòng ngủ") || !normalized.includes("master")) return null;
  return {
    source: "existing_project_brief",
    confirmedRequirements: {
      roomDimensionsMm: { width: 4190, depth: 4040 },
      windowWidthMm: 1910,
      desk: { placement: "near_window", maxDepthMm: 500 },
      airConditioning: { rule: "airflow_must_not_blow_directly_at_bed" },
      budgetVndRange: { min: 75000000, max: 120000000 },
    },
    needsInput: [
      "paint_color",
      "interior_finish_materials",
      "verified_outlet_positions",
      "verified_switch_positions",
      "confirmed_air_conditioner_position_and_airflow",
    ],
    policy: "Unknown technical or preference data is needs_input; do not silently finalize.",
  };
}

async function findReusableStage(existing: Array<typeof issues.$inferSelect>, projectId: string, rootId: string, stageKey: string) {
  const origin = stageOriginId(projectId, stageKey);
  return existing.find((issue) => issue.originId === origin) ?? existing.find((issue) =>
    issue.projectId === projectId && issue.parentId === rootId && issue.title.toLowerCase().includes(`[atelier • ${stageKey}]`)
  ) ?? null;
}

export async function ensureAtelierProjectWorkflow(db: Db, input: {
  companyId: string;
  projectId: string;
  rootIssueId?: string | null;
  chiefAgentId?: string | null;
  agentIdsByKey?: Record<string, string>;
}): Promise<AtelierProjectWorkflowView> {
  const retained = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, input.companyId), eq(atelierWorkflowRuns.projectId, input.projectId))).orderBy(asc(atelierWorkflowRuns.createdAt)).then(rows => rows[0]);
  if (retained && readDeliverySnapshot(retained.decisionLedger)) return specialistDeliveryView(db, input.companyId, retained.id);
  if (input.companyId !== ATELIER_COMPANY_ID) throw forbidden("Atelier canonical workflow is not enabled for this company");
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    await lockProject(tx, input.companyId, input.projectId);
    const project = await tx.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.companyId, input.companyId))).then((rows) => rows[0] ?? null);
    if (!project) throw unprocessable("Project does not belong to the Atelier company");
    const foundAgents = await findAgents(tx, input.companyId);
    const chiefAgentId = input.chiefAgentId ?? foundAgents.byKey.agent_concierge;
    if (!chiefAgentId) throw unprocessable("Atelier Chief Architect agent is unavailable");
    const agentIds = { ...foundAgents.byKey, ...(input.agentIdsByKey ?? {}) };
    for (const stage of ATELIER_CANONICAL_STAGES) if (!agentIds[stage.agentKey]) throw unprocessable(`Atelier agent ${stage.agentKey} is unavailable`);
    const definition = retained
      ? (await tx.select().from(workflows).where(eq(workflows.id, retained.workflowDefinitionId)))[0]!
      : await ensureAtelierCompanyWorkflowDefinition(tx, input.companyId, chiefAgentId);
    const editableDefinition = upgradeLegacyAtelierDefinition(definition.definition, definition.version, definition.name);
    const goalId = await projectGoalId(tx, input.companyId, project);
    const svc = issueService(tx);
    const explicitRoot = input.rootIssueId
      ? await tx.select().from(issues).where(and(
          eq(issues.companyId, input.companyId),
          eq(issues.id, input.rootIssueId),
        )).then((rows) => rows[0] ?? null)
      : null;
    if (input.rootIssueId && !explicitRoot) throw unprocessable("Atelier workflow root issue does not belong to this company");
    const sourceRoot = explicitRoot ?? await findProjectSourceIssue(tx, input.companyId, input.projectId);
    if (sourceRoot?.projectId && sourceRoot.projectId !== input.projectId) {
      throw conflict("The project source task already belongs to a different project");
    }
    let root = sourceRoot ?? await findReusableRoot(tx, input.companyId, input.projectId);
    if (root && (root.projectId !== input.projectId || (!root.goalId && goalId))) {
      root = await svc.update(root.id, {
        companyGuard: input.companyId,
        projectId: input.projectId,
        ...(!root.goalId && goalId ? { goalId } : {}),
      }) ?? root;
    }
    if (!root) {
      root = await svc.create(input.companyId, {
        projectId: input.projectId,
        goalId,
        title: "[ATELIER WORKFLOW] Điều phối thiết kế nội thất end-to-end",
        description: "Chief Architect quản lý intake, lập kế hoạch, giao việc, theo dõi và review. Dữ liệu chưa biết phải chuyển needs_input; root không tự chốt chuyên môn.",
        status: "backlog",
        priority: "high",
        assigneeAgentId: chiefAgentId,
        createdByAgentId: chiefAgentId,
        responsibleUserId: "local-board",
        originKind: "manual",
        originId: `${ATELIER_COMPANY_WORKFLOW_ORIGIN}:${input.projectId}:root`,
        idempotencyKey: `${ATELIER_COMPANY_WORKFLOW_ORIGIN}:${input.projectId}:root`,
        allowDuplicate: false,
      });
    }
    const existingIssues = await tx.select().from(issues).where(and(eq(issues.companyId, input.companyId), eq(issues.projectId, input.projectId)));
    let run = await tx.select().from(atelierWorkflowRuns).where(and(
      eq(atelierWorkflowRuns.companyId, input.companyId), eq(atelierWorkflowRuns.projectId, input.projectId),
      eq(atelierWorkflowRuns.workflowDefinitionId, definition.id), eq(atelierWorkflowRuns.workflowVersion, definition.version),
    )).then((rows) => rows[0] ?? null);
    const specialBrief = bedroomMasterBrief(project);
    if (!run) {
      run = await tx.insert(atelierWorkflowRuns).values({
        companyId: input.companyId,
        projectId: input.projectId,
        workflowDefinitionId: definition.id,
        workflowVersion: definition.version,
        rootIssueId: root.id,
        status: specialBrief ? "needs_input" : "pending",
        decisionLedger: specialBrief ? { briefRequirements: specialBrief } : {},
      }).returning().then((rows) => rows[0]!);
    } else if (run.rootIssueId !== root.id || (specialBrief && Object.keys(run.decisionLedger ?? {}).length === 0)) {
      run = await tx.update(atelierWorkflowRuns).set({
        rootIssueId: root.id,
        ...(specialBrief && Object.keys(run.decisionLedger ?? {}).length === 0 ? { status: "needs_input" as const, decisionLedger: { briefRequirements: specialBrief } } : {}),
        updatedAt: new Date(),
      }).where(eq(atelierWorkflowRuns.id, run.id)).returning().then((rows) => rows[0]!);
    }
    const stageIssues = new Map<string, typeof issues.$inferSelect>();
    for (const stage of ATELIER_CANONICAL_STAGES) {
      const workflowNode = editableDefinition.nodes.find((node) => node.id === stage.key);
      if (!workflowNode) throw unprocessable(`Workflow node ${stage.key} is missing from definition v${definition.version}`);
      const assignedAgentId = agentIds[stage.agentKey];
      const assignedAgent = await tx.select({ id: agents.id, status: agents.status, errorReason: agents.errorReason })
        .from(agents)
        .where(eq(agents.id, assignedAgentId))
        .then((rows) => rows[0] ?? null);
      // A failed readiness check can leave the agent marked `error` even after
      // the underlying workflow state is repaired. Clear only those two
      // orchestration-generated errors; provider/auth errors remain visible.
      if (assignedAgent?.status === "error" && [
        "Agent assignment rejected by Atelier routing policy",
        "Workflow node is not ready for execution",
      ].includes(assignedAgent.errorReason ?? "")) {
        await tx.update(agents).set({ status: "idle", errorReason: null, updatedAt: new Date() })
          .where(eq(agents.id, assignedAgent.id));
      }
      await assertAtelierNodeAssignment(tx, { companyId: input.companyId, node: workflowNode, agentId: assignedAgentId });
      const executionPolicy = {
        atelierWorkflow: {
          workflowRunId: run.id,
          workflowVersion: definition.version,
          nodeId: stage.key,
          node: { ...workflowNode, assignedAgentId },
        },
      };
      const existingStage = await findReusableStage(existingIssues, input.projectId, root.id, stage.key);
      const dependencyIds = stage.dependsOn.map((dependency) => stageIssues.get(dependency)?.id).filter((id): id is string => Boolean(id));
      let stageIssue = existingStage ?? await svc.create(input.companyId, {
        projectId: input.projectId,
        goalId,
        parentId: root.id,
        parentDepthPolicy: "allow_nested",
        expectedParentId: root.id,
        title: `[ATELIER • ${stage.key}] ${stage.label}`,
        description: `${stage.description}\n\nRequired inputs: ${stage.requiredInputs.join(", ")}. Unknown technical or preference data must be reported as needs_input; do not infer or silently finalize.\n\nHandoff only through the canonical workflow and include decision ledger plus artifact/output references.`,
        status: stage.dependsOn.length === 0 && !specialBrief ? "todo" : "backlog",
        priority: stage.key === "qa" || stage.key === "cost" ? "high" : "medium",
        assigneeAgentId: assignedAgentId,
        executionPolicy,
        createdByAgentId: chiefAgentId,
        responsibleUserId: "local-board",
        originKind: "manual",
        originId: stageOriginId(input.projectId, stage.key),
        blockedByIssueIds: dependencyIds,
        idempotencyKey: stageOriginId(input.projectId, stage.key),
        allowDuplicate: false,
      });
      if (existingStage) {
        const stagePatch: Partial<typeof issues.$inferInsert> & {
          companyGuard: string;
          parentDepthPolicy?: "allow_nested";
          expectedParentId?: string;
        } = { companyGuard: input.companyId };
        if (existingStage.parentId !== root.id) {
          stagePatch.parentId = root.id;
          stagePatch.parentDepthPolicy = "allow_nested";
          stagePatch.expectedParentId = root.id;
        }
        if (JSON.stringify(existingStage.executionPolicy ?? {}) !== JSON.stringify(executionPolicy)) {
          stagePatch.executionPolicy = executionPolicy;
        }
        if (stage.dependsOn.length === 0 && !specialBrief && existingStage.status === "backlog") {
          stagePatch.status = "todo";
        }
        if (Object.keys(stagePatch).length > 1) {
          stageIssue = await svc.update(existingStage.id, stagePatch) ?? existingStage;
        }
      }
      stageIssues.set(stage.key, stageIssue);
      const dependencyIssueRows = dependencyIds.length > 0 ? await tx.select().from(issues).where(inArray(issues.id, dependencyIds)) : [];
      const derivedStatus = specialBrief && stage.key === "floorplan"
        ? (stageIssue.status === "done" ? "done" : "needs_input" as AtelierWorkflowStageStatus)
        : issueStatusToStageStatus(stageIssue, dependencyIssueRows);
      const current = await tx.select().from(atelierWorkflowStageExecutions).where(and(
        eq(atelierWorkflowStageExecutions.workflowRunId, run.id), eq(atelierWorkflowStageExecutions.stageKey, stage.key),
      )).then((rows) => rows[0] ?? null);
      if (!current) {
        await tx.insert(atelierWorkflowStageExecutions).values({
          companyId: input.companyId,
          projectId: input.projectId,
          workflowRunId: run.id,
          stageKey: stage.key,
          issueId: stageIssue.id,
          agentId: assignedAgentId,
          status: derivedStatus,
          blockerReason: derivedStatus === "pending" ? `Waiting for: ${stage.dependsOn.join(", ") || "Chief intake"}` : derivedStatus === "needs_input" ? "Need verified electrical/AC data and user-confirmed finish preferences before execution." : null,
        });
      } else if (
        current.issueId !== stageIssue.id ||
        current.agentId !== assignedAgentId ||
        current.status !== derivedStatus ||
        (specialBrief && stage.key === "floorplan" && current.status === "pending")
      ) {
        await tx.update(atelierWorkflowStageExecutions).set({
          issueId: stageIssue.id,
          agentId: assignedAgentId,
          status: derivedStatus,
          blockerReason: derivedStatus === "pending"
            ? `Waiting for: ${stage.dependsOn.join(", ") || "Chief intake"}`
            : derivedStatus === "needs_input"
              ? "Need verified electrical/AC data and user-confirmed finish preferences before execution."
              : null,
          updatedAt: new Date(),
        }).where(eq(atelierWorkflowStageExecutions.id, current.id));
      }
    }
    if (sourceRoot) {
      const obsoleteRoots = existingIssues.filter((issue) =>
        issue.id !== root.id &&
        issue.parentId === null &&
        issue.hiddenAt === null &&
        issue.originId?.startsWith(`${ATELIER_COMPANY_WORKFLOW_ORIGIN}:${input.projectId}:root`),
      );
      for (const obsoleteRoot of obsoleteRoots) {
        await svc.update(obsoleteRoot.id, {
          companyGuard: input.companyId,
          status: "cancelled",
          hiddenAt: new Date(),
        });
      }
    }
    return getAtelierProjectWorkflowView(tx, input.companyId, input.projectId, run.id);
  });
}

export async function getAtelierProjectWorkflowView(db: Db, companyId: string, projectId: string, runId?: string): Promise<AtelierProjectWorkflowView> {
  const run = await db.select().from(atelierWorkflowRuns).where(and(
    eq(atelierWorkflowRuns.companyId, companyId), eq(atelierWorkflowRuns.projectId, projectId), ...(runId ? [eq(atelierWorkflowRuns.id, runId)] : []),
  )).orderBy(asc(atelierWorkflowRuns.createdAt)).then((rows) => rows[0] ?? null);
  if (!run) throw unprocessable("Atelier workflow run not found for this project");
  if (readDeliverySnapshot(run.decisionLedger)) return specialistDeliveryView(db, companyId, run.id);
  const stageRows = await db.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id)).orderBy(asc(atelierWorkflowStageExecutions.createdAt));
  const issueIds = stageRows.map((row) => row.issueId).filter((id): id is string => Boolean(id));
  const issueRows = issueIds.length > 0 ? await db.select().from(issues).where(and(eq(issues.companyId, companyId), inArray(issues.id, issueIds))) : [];
  const agentIds = stageRows.map((row) => row.agentId);
  const agentRows = agentIds.length > 0 ? await db.select().from(agents).where(and(eq(agents.companyId, companyId), inArray(agents.id, agentIds))) : [];
  const issueById = new Map(issueRows.map((row) => [row.id, row]));
  const agentById = new Map(agentRows.map((row) => [row.id, row]));
  const rootIssue = run.rootIssueId ? await db.select().from(issues).where(and(eq(issues.companyId, companyId), eq(issues.id, run.rootIssueId))).then((rows) => rows[0] ?? null) : null;
  return {
    run,
    rootIssue,
    stages: stageRows.map((row) => ({
      ...row,
      issue: row.issueId ? issueById.get(row.issueId) ?? null : null,
      agent: agentById.get(row.agentId) ?? null,
      dependencies: stageByKey(row.stageKey)?.dependsOn ?? [],
    })),
  };
}

export async function backfillAtelierCompanyProjects(db: Db, companyId: string, options: { dryRun: boolean; projectId?: string }) {
  if (companyId !== ATELIER_COMPANY_ID) throw forbidden("Atelier canonical workflow is not enabled for this company");
  const rows = await db.select().from(projects).where(and(eq(projects.companyId, companyId), ...(options.projectId ? [eq(projects.id, options.projectId)] : []))).orderBy(asc(projects.createdAt));
  const foundAgents = await findAgents(db, companyId);
  const definition = await ensureAtelierCompanyWorkflowDefinition(db, companyId, foundAgents.byKey.agent_concierge);
  const previews = [];
  for (const project of rows) {
    const existing = await db.select({ id: atelierWorkflowRuns.id }).from(atelierWorkflowRuns).where(and(
      eq(atelierWorkflowRuns.companyId, companyId), eq(atelierWorkflowRuns.projectId, project.id), eq(atelierWorkflowRuns.workflowDefinitionId, definition.id), eq(atelierWorkflowRuns.workflowVersion, definition.version),
    )).then((items) => items[0] ?? null);
    previews.push({ projectId: project.id, projectName: project.name, action: existing ? "exists" : "create", runId: existing?.id ?? null });
    if (!options.dryRun && !existing) await ensureAtelierProjectWorkflow(db, { companyId, projectId: project.id, agentIdsByKey: foundAgents.byKey });
  }
  return { companyId, definitionId: definition.id, version: definition.version, dryRun: options.dryRun, projects: previews, createdCount: previews.filter((item) => item.action === "create").length };
}

function requireObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unprocessable(`${label} is required`);
  return value as Record<string, unknown>;
}

export async function acceptAtelierStageHandoff(db: Db, input: {
  companyId: string;
  projectId: string;
  workflowRunId: string;
  sourceStageKey: string;
  targetStageKey: string;
  sourceAgentId: string;
  targetAgentId: string;
  idempotencyKey: string;
  decisionLedger: unknown;
  outputReferences: unknown;
  approvalReference?: unknown;
}) {
  const [deliveryRun] = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, input.workflowRunId), eq(atelierWorkflowRuns.companyId, input.companyId)));
  if (deliveryRun && readDeliverySnapshot(deliveryRun.decisionLedger)) throw conflict("Use the specialist stage completion endpoint; downstream dispatch is automatic");
  if (input.companyId !== ATELIER_COMPANY_ID) throw forbidden("Atelier canonical workflow is not enabled for this company");
  const source = stageByKey(input.sourceStageKey);
  const target = stageByKey(input.targetStageKey);
  if (!source || !target) throw unprocessable("Unknown Atelier workflow stage");
  if (!target.dependsOn.includes(source.key)) throw unprocessable(`Handoff ${source.key} -> ${target.key} violates dependency graph`);
  const ledger = requireObject(input.decisionLedger, "decision_ledger");
  if (Object.keys(ledger).length === 0) throw unprocessable("decision_ledger must contain a decision or needs_input record");
  if (!Array.isArray(input.outputReferences) || input.outputReferences.length === 0) throw unprocessable("output_references must contain at least one artifact or log reference");
  if (target.gate.approval && (!input.approvalReference || typeof input.approvalReference !== "object")) throw unprocessable(`Approval is required before entering ${target.key}`);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    await lockProject(tx, input.companyId, input.projectId);
    const run = await tx.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, input.workflowRunId), eq(atelierWorkflowRuns.companyId, input.companyId), eq(atelierWorkflowRuns.projectId, input.projectId))).then((rows) => rows[0] ?? null);
    if (!run) throw unprocessable("Workflow run does not belong to this project/company");
    const stageRows = await tx.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id));
    const sourceRow = stageRows.find((row) => row.stageKey === source.key);
    const targetRow = stageRows.find((row) => row.stageKey === target.key);
    if (!sourceRow || !targetRow) throw unprocessable("Workflow stage execution is missing");
    if (sourceRow.agentId !== input.sourceAgentId || targetRow.agentId !== input.targetAgentId) throw forbidden("Handoff agent binding does not match the workflow run");
    if (!["running", "needs_review", "done"].includes(sourceRow.status)) throw unprocessable("Source stage is not ready for handoff");
    const prior = await tx.select().from(atelierWorkflowEvents).where(and(eq(atelierWorkflowEvents.companyId, input.companyId), eq(atelierWorkflowEvents.idempotencyKey, input.idempotencyKey))).then((rows) => rows[0] ?? null);
    if (prior) return { accepted: true, duplicate: true, event: prior, view: await getAtelierProjectWorkflowView(tx, input.companyId, input.projectId, run.id) };
    const dependencies = stageRows.filter((row) => target.dependsOn.includes(row.stageKey));
    if (dependencies.some((row) => row.stageKey !== source.key && row.status !== "done")) throw unprocessable("Target stage has unresolved dependencies");
    await tx.insert(atelierWorkflowEvents).values({
      companyId: input.companyId, projectId: input.projectId, workflowRunId: run.id, stageExecutionId: sourceRow.id,
      eventType: "stage_handoff_accepted", idempotencyKey: input.idempotencyKey, sourceAgentId: input.sourceAgentId, targetAgentId: input.targetAgentId,
      payload: { sourceStageKey: source.key, targetStageKey: target.key, decisionLedger: ledger, outputReferences: input.outputReferences as Array<Record<string, unknown>>, approvalReference: input.approvalReference ?? null },
    });
    await tx.update(atelierWorkflowStageExecutions).set({ status: "done", decisionLedger: ledger, outputReferences: input.outputReferences as Array<Record<string, unknown>>, completedAt: new Date(), updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, sourceRow.id));
    const targetStatus = ["done", "running", "needs_review"].includes(targetRow.status) ? targetRow.status : "ready";
    await tx.update(atelierWorkflowStageExecutions).set({ status: targetStatus as AtelierWorkflowStageStatus, approvalState: target.gate.approval ? "approved" : targetRow.approvalState, blockerReason: null, updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, targetRow.id));
    if (targetRow.issueId) {
      const targetIssue = await tx.select().from(issues).where(eq(issues.id, targetRow.issueId)).then((rows) => rows[0] ?? null);
      if (targetIssue && targetIssue.status === "backlog") await issueService(tx).update(targetIssue.id, { companyGuard: input.companyId, status: "todo", actorAgentId: input.sourceAgentId });
    }
    await tx.update(atelierWorkflowRuns).set({ status: "running", updatedAt: new Date() }).where(eq(atelierWorkflowRuns.id, run.id));
    return { accepted: true, duplicate: false, view: await getAtelierProjectWorkflowView(tx, input.companyId, input.projectId, run.id) };
  });
}

export function atelierCanonicalWorkflowDefinition() {
  return workflowDefinition;
}
