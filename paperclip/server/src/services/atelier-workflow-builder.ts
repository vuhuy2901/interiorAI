import { and, desc, eq, max, sql } from "drizzle-orm";
import {
  agents,
  atelierWorkflowRuns,
  atelierWorkflowSelections,
  atelierWorkflowStageExecutions,
  issues,
  projects,
  workflows,
  type Db,
} from "@paperclipai/db";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
export const ATELIER_COMPANY_WORKFLOW_NAME = "Atelier Company Workflow";

export const ATELIER_NODE_TYPES = [
  "START", "AGENT_TASK", "TOOL_EXECUTION", "HUMAN_INPUT", "APPROVAL_GATE",
  "CONDITION", "PARALLEL_BRANCH", "JOIN", "RESEARCH", "VALIDATION",
  "RETRY_RECOVERY", "NOTIFICATION", "EXPORT", "END",
] as const;
export type AtelierNodeType = (typeof ATELIER_NODE_TYPES)[number];

export type AtelierWorkflowNode = {
  id: string;
  type: AtelierNodeType;
  name: string;
  description?: string;
  notes?: string;
  position?: { x: number; y: number };
  taskType?: string;
  requiredRole?: string;
  assignedAgentId?: string | null;
  agentSelector?: { strategy: "CAPABILITY_MATCH" | "EXPLICIT"; capability?: string };
  requiredInputs?: string[];
  requiredOutputs?: string[];
  requiredArtifacts?: string[];
  completionCriteria?: string[];
  allowedTools?: string[];
  timeoutSeconds?: number;
  retryPolicy?: { maxAttempts: number; backoffSeconds?: number };
  approval?: { required: boolean; approverRole?: string; approverAgentIds?: string[] };
  conditionOutcomes?: string[];
  stepNumber?: number;
  totalSteps?: number;
  stepLabel?: string;
  sourceNodes?: string[];
  stepSettings?: Record<string, unknown>;
  syncRule?: string;
};

export type AtelierWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  outcome?: string;
  name?: string;
  description?: string;
  condition?: string;
  trigger?: string;
  priority?: string;
  retryRule?: Record<string, unknown>;
  timeoutSeconds?: number;
  approvalRequired?: boolean;
  guard?: string;
  notes?: string;
};
export type AtelierEditableDefinition = {
  schemaVersion: 2;
  key: string;
  name: string;
  version: number;
  nodes: AtelierWorkflowNode[];
  edges: AtelierWorkflowEdge[];
  canvas?: { snapToGrid?: boolean; viewport?: { x: number; y: number; zoom: number } };
  gatePolicy?: Record<string, unknown>;
  stateMachine?: string[];
  canvasNotes?: unknown[];
  groupSections?: unknown[];
  optionalSteps?: Record<string, unknown>;
  activeForProjectIds?: string[];
};

export type WorkflowValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type AtelierAgentCapability = {
  agentId: string;
  name: string;
  status: string;
  lifecycleState: string;
  role: string;
  roleKeys: string[];
  capabilities: string[];
  allowedTaskTypes: string[];
  allowedTools: string[];
  atelierAgentKey: string | null;
  available: boolean;
};

const DEFAULT_CAPABILITIES: Record<string, Omit<AtelierAgentCapability, "agentId" | "name" | "status" | "lifecycleState" | "role" | "atelierAgentKey" | "available">> = {
  agent_concierge: { roleKeys: ["chief_architect", "project_manager"], capabilities: ["project.intake", "workflow.coordinate", "design.final_review"], allowedTaskTypes: ["CHIEF_INTAKE", "PROJECT_COORDINATION", "FINAL_REVIEW"], allowedTools: [] },
  agent_floorplan: { roleKeys: ["floor_plan_agent"], capabilities: ["floorplan.parse", "floorplan.scale_gate"], allowedTaskTypes: ["FLOOR_PLAN_RECOGNITION", "SCALE_CONFIRMATION"], allowedTools: [] },
  agent_geometry: { roleKeys: ["geometry_agent", "bim_agent"], capabilities: ["bim.scenegraph", "geometry.validate"], allowedTaskTypes: ["BIM_GEOMETRY"], allowedTools: [] },
  agent_furniture: { roleKeys: ["furniture_agent"], capabilities: ["furniture.plan", "furniture.smart_fit"], allowedTaskTypes: ["FURNITURE_PLANNING", "SMART_FIT_PLACEMENT"], allowedTools: [] },
  agent_style: { roleKeys: ["style_agent", "material_agent"], capabilities: ["style.research", "materials.specify"], allowedTaskTypes: ["STYLE_RESEARCH", "MATERIAL_RESEARCH"], allowedTools: [] },
  agent_ceiling_lighting: { roleKeys: ["lighting_agent", "render_agent"], capabilities: ["lighting.design", "render.execute"], allowedTaskTypes: ["LIGHTING_DESIGN", "RENDER"], allowedTools: [] },
  agent_research: { roleKeys: ["research_agent", "asset_research_agent"], capabilities: ["product.research", "asset.discover"], allowedTaskTypes: ["PRODUCT_RESEARCH", "ASSET_DISCOVERY"], allowedTools: [] },
  agent_cost: { roleKeys: ["inventory_agent", "cost_agent"], capabilities: ["inventory.bom", "cost.calculate"], allowedTaskTypes: ["BOM", "COST_CALCULATION"], allowedTools: [] },
  agent_qa: { roleKeys: ["qa_agent"], capabilities: ["spatial.qa", "render.qa", "inventory.qa", "acceptance.validate"], allowedTaskTypes: ["SPATIAL_QA", "RENDER_QA", "INVENTORY_QA", "ACCEPTANCE_VALIDATION"], allowedTools: [] },
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export async function listAtelierAgentCapabilities(db: Db, companyId: string): Promise<AtelierAgentCapability[]> {
  const rows = await db.select().from(agents).where(eq(agents.companyId, companyId));
  return rows.map((agent) => {
    const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
    const permissions = (agent.permissions ?? {}) as Record<string, unknown>;
    const key = typeof metadata.atelierAgentKey === "string" ? metadata.atelierAgentKey : null;
    const defaults = key ? DEFAULT_CAPABILITIES[key] : undefined;
    const explicit = metadata.atelierCapabilities && typeof metadata.atelierCapabilities === "object"
      ? metadata.atelierCapabilities as Record<string, unknown>
      : {};
    return {
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      lifecycleState: agent.lifecycleState,
      role: agent.role,
      roleKeys: stringArray(explicit.roleKeys).length ? stringArray(explicit.roleKeys) : defaults?.roleKeys ?? [],
      capabilities: stringArray(explicit.capabilities).length ? stringArray(explicit.capabilities) : defaults?.capabilities ?? [],
      allowedTaskTypes: stringArray(explicit.allowedTaskTypes).length ? stringArray(explicit.allowedTaskTypes) : defaults?.allowedTaskTypes ?? [],
      allowedTools: stringArray(explicit.allowedTools).length ? stringArray(explicit.allowedTools) : stringArray(permissions.allowedTools),
      atelierAgentKey: key,
      available: ["idle", "active", "running"].includes(agent.status) && agent.lifecycleState === "ready",
    };
  });
}

function asDefinition(value: unknown): AtelierEditableDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 2 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) return null;
  return input as unknown as AtelierEditableDefinition;
}

const stageTaskType: Record<string, { taskType: string; role: string; capability: string }> = {
  floorplan: { taskType: "FLOOR_PLAN_RECOGNITION", role: "floor_plan_agent", capability: "floorplan.parse" },
  geometry: { taskType: "BIM_GEOMETRY", role: "geometry_agent", capability: "bim.scenegraph" },
  furniture: { taskType: "FURNITURE_PLANNING", role: "furniture_agent", capability: "furniture.plan" },
  style: { taskType: "STYLE_RESEARCH", role: "style_agent", capability: "style.research" },
  lighting: { taskType: "LIGHTING_DESIGN", role: "lighting_agent", capability: "lighting.design" },
  cost: { taskType: "COST_CALCULATION", role: "cost_agent", capability: "cost.calculate" },
  qa: { taskType: "SPATIAL_QA", role: "qa_agent", capability: "spatial.qa" },
  final_review: { taskType: "FINAL_REVIEW", role: "chief_architect", capability: "design.final_review" },
};

export function upgradeLegacyAtelierDefinition(value: unknown, version: number, name = ATELIER_COMPANY_WORKFLOW_NAME): AtelierEditableDefinition {
  const current = asDefinition(value);
  if (current) return { ...current, version, name };
  const legacy = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const stages = Array.isArray(legacy.stages) ? legacy.stages as Array<Record<string, unknown>> : [];
  const agentTaskNodes: AtelierWorkflowNode[] = stages.map((stage, index) => {
    const id = String(stage.key ?? `stage_${index + 1}`);
    const mapping = stageTaskType[id] ?? { taskType: id.toUpperCase(), role: String(stage.agentKey ?? "specialist"), capability: id };
    const gate = stage.gate && typeof stage.gate === "object" ? stage.gate as Record<string, unknown> : {};
    return {
      id,
      type: "AGENT_TASK",
      name: String(stage.label ?? id),
      description: typeof stage.description === "string" ? stage.description : "",
      position: { x: 320 + (index % 2) * 280, y: 140 + index * 150 },
      taskType: mapping.taskType,
      requiredRole: mapping.role,
      agentSelector: { strategy: "CAPABILITY_MATCH", capability: mapping.capability },
      requiredInputs: stringArray(stage.requiredInputs),
      requiredOutputs: [`${id}_output`],
      requiredArtifacts: gate.outputReferences === true ? [`${id}_artifact`] : [],
      completionCriteria: [`${id}_output is persisted and validated`],
      retryPolicy: { maxAttempts: 2, backoffSeconds: 30 },
      approval: { required: gate.approval === true, approverRole: gate.approval === true ? "authorized_approver" : undefined },
    };
  });
  const start: AtelierWorkflowNode = { id: "start", type: "START", name: "Chief Architect Intake", position: { x: 40, y: 140 }, requiredInputs: ["project_brief"] };
  const end: AtelierWorkflowNode = { id: "end", type: "END", name: "Export and Delivery", position: { x: 880, y: 140 + Math.max(1, stages.length) * 150 }, requiredOutputs: ["delivery_package"] };
  const legacyEdges = Array.isArray(legacy.edges) ? legacy.edges as Array<Record<string, unknown>> : [];
  const edges: AtelierWorkflowEdge[] = legacyEdges.map((edge, index) => ({ id: `edge_${index + 1}`, source: String(edge.from), target: String(edge.to) }));
  const dependencyTargets = new Set(edges.map((edge) => edge.target));
  for (const node of agentTaskNodes.filter((candidate) => !dependencyTargets.has(candidate.id))) edges.push({ id: `edge_start_${node.id}`, source: start.id, target: node.id });
  const sources = new Set(edges.map((edge) => edge.source));
  for (const node of agentTaskNodes.filter((candidate) => !sources.has(candidate.id))) edges.push({ id: `edge_${node.id}_end`, source: node.id, target: end.id });
  return { schemaVersion: 2, key: `atelier-company-workflow:v${version}`, name, version, nodes: [start, ...agentTaskNodes, end], edges, canvas: { snapToGrid: true }, gatePolicy: legacy.gatePolicy as Record<string, unknown> ?? {}, stateMachine: stringArray(legacy.stateMachine) };
}

export async function validateAtelierWorkflowDefinition(db: Db, companyId: string, value: unknown): Promise<{ valid: boolean; issues: WorkflowValidationIssue[]; definition: AtelierEditableDefinition | null }> {
  const definition = asDefinition(value);
  const issues: WorkflowValidationIssue[] = [];
  if (!definition) return { valid: false, definition: null, issues: [{ code: "invalid_schema", severity: "error", message: "Definition must use schemaVersion 2 with nodes and edges arrays." }] };
  const capabilities = await listAtelierAgentCapabilities(db, companyId);
  const byAgent = new Map(capabilities.map((item) => [item.agentId, item]));
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id || ids.has(node.id)) issues.push({ code: "duplicate_node_id", severity: "error", message: `Node id '${node.id}' is missing or duplicated.`, nodeId: node.id });
    ids.add(node.id);
    if (!ATELIER_NODE_TYPES.includes(node.type)) issues.push({ code: "invalid_node_type", severity: "error", message: `Node '${node.id}' uses unsupported type.`, nodeId: node.id });
    if (node.type === "AGENT_TASK" || node.type === "RESEARCH" || node.type === "VALIDATION") {
      if (!node.taskType) issues.push({ code: "missing_task_type", severity: "error", message: "Agent node requires taskType.", nodeId: node.id });
      if (!node.requiredRole) issues.push({ code: "missing_required_role", severity: "error", message: "Agent node requires requiredRole.", nodeId: node.id });
      if (!node.requiredOutputs?.length) issues.push({ code: "missing_output_contract", severity: "error", message: "Agent node requires at least one output.", nodeId: node.id });
      if (!node.completionCriteria?.length) issues.push({ code: "missing_completion_criteria", severity: "error", message: "Agent node requires completion criteria.", nodeId: node.id });
      if (node.retryPolicy && (!Number.isInteger(node.retryPolicy.maxAttempts) || node.retryPolicy.maxAttempts < 1 || node.retryPolicy.maxAttempts > 10)) issues.push({ code: "invalid_retry_policy", severity: "error", message: "Retry maxAttempts must be between 1 and 10.", nodeId: node.id });
      if (node.assignedAgentId) {
        const agent = byAgent.get(node.assignedAgentId);
        if (!agent) issues.push({ code: "agent_not_found", severity: "error", message: "Assigned agent does not exist.", nodeId: node.id });
        else {
          if (!agent.available) issues.push({ code: "agent_unavailable", severity: "error", message: `Agent '${agent.name}' is not available.`, nodeId: node.id });
          if (node.requiredRole && !agent.roleKeys.includes(node.requiredRole)) issues.push({ code: "role_mismatch", severity: "error", message: `Agent '${agent.name}' does not have role '${node.requiredRole}'.`, nodeId: node.id });
          if (node.taskType && !agent.allowedTaskTypes.includes(node.taskType)) issues.push({ code: "task_type_not_allowed", severity: "error", message: `Agent '${agent.name}' cannot perform '${node.taskType}'.`, nodeId: node.id });
          const requiredCapability = node.agentSelector?.capability;
          if (requiredCapability && !agent.capabilities.includes(requiredCapability)) issues.push({ code: "capability_missing", severity: "error", message: `Agent '${agent.name}' lacks '${requiredCapability}'.`, nodeId: node.id });
        }
      } else if (!node.agentSelector?.capability) issues.push({ code: "missing_agent_selector", severity: "error", message: "Agent node requires an assigned agent or capability selector.", nodeId: node.id });
    }
    if (node.type === "APPROVAL_GATE" && (!node.approval?.required || (!node.approval.approverRole && !node.approval.approverAgentIds?.length))) issues.push({ code: "missing_approver", severity: "error", message: "Approval gate requires an approver role or agent.", nodeId: node.id });
    if (node.type === "CONDITION" && (!node.conditionOutcomes || node.conditionOutcomes.length < 2)) issues.push({ code: "incomplete_condition", severity: "error", message: "Condition requires at least two outcomes.", nodeId: node.id });
  }
  const starts = definition.nodes.filter((node) => node.type === "START");
  const ends = definition.nodes.filter((node) => node.type === "END");
  if (starts.length !== 1) issues.push({ code: "start_count", severity: "error", message: "Workflow requires exactly one Start node." });
  if (ends.length !== 1) issues.push({ code: "end_count", severity: "error", message: "Workflow requires exactly one End node." });
  const outgoing = new Map<string, AtelierWorkflowEdge[]>();
  const incoming = new Map<string, AtelierWorkflowEdge[]>();
  const edgeSignatures = new Set<string>();

  for (const edge of definition.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ code: "dangling_edge", severity: "error", message: `Edge '${edge.id}' references a missing node.`, edgeId: edge.id });
    }
    const sig = `${edge.source}->${edge.target}:${edge.outcome ?? ""}:${edge.condition ?? ""}`;
    if (edgeSignatures.has(sig)) {
      issues.push({ code: "duplicate_edge", severity: "error", message: `Duplicate transition from '${edge.source}' to '${edge.target}'.`, edgeId: edge.id });
    }
    edgeSignatures.add(sig);

    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  for (const node of definition.nodes) {
    if (node.type === "JOIN" && (incoming.get(node.id)?.length ?? 0) < 2) issues.push({ code: "invalid_join", severity: "error", message: "Join requires at least two incoming edges.", nodeId: node.id });
    if (node.type === "CONDITION") {
      const outcomes = new Set((outgoing.get(node.id) ?? []).map((edge) => edge.outcome).filter(Boolean));
      for (const outcome of node.conditionOutcomes ?? []) if (!outcomes.has(outcome)) issues.push({ code: "missing_condition_branch", severity: "error", message: `Condition outcome '${outcome}' has no edge.`, nodeId: node.id });
    }
  }

  if (ends.length === 1 && (incoming.get(ends[0].id)?.length ?? 0) === 0) {
    issues.push({ code: "end_unreachable", severity: "error", message: `End node '${ends[0].name}' has no incoming transitions.`, nodeId: ends[0].id });
  }

  if (starts.length === 1) {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string, path: string[]) => {
      if (visiting.has(id)) {
        if (id === starts[0].id) {
          issues.push({ code: "cycle", severity: "error", message: `Cycle detected returning to Start node '${id}'.`, nodeId: id });
          return;
        }
        const sourceNode = path[path.length - 1];
        const loopEdges = (outgoing.get(sourceNode) ?? []).filter((e) => e.target === id);
        const hasGuard = loopEdges.some(
          (e) =>
            Boolean(e.condition) ||
            e.trigger === "event" ||
            Boolean(e.retryRule?.maxAttempts) ||
            Boolean(e.outcome && /retry|reject|không|hủy/i.test(e.outcome)),
        );
        if (!hasGuard) {
          issues.push({ code: "cycle", severity: "error", message: `Cycle detected at '${id}' without a retry limit or exit guard.`, nodeId: id });
        }
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const edge of outgoing.get(id) ?? []) visit(edge.target, [...path, id]);
      visiting.delete(id);
      visited.add(id);
    };
    visit(starts[0].id, []);
    for (const node of definition.nodes) if (!visited.has(node.id)) issues.push({ code: "unreachable_node", severity: "error", message: `Node '${node.name}' is unreachable from Start.`, nodeId: node.id });
  }
  return { valid: !issues.some((issue) => issue.severity === "error"), issues, definition };
}

export async function activateAtelierWorkflowForProject(
  db: Db,
  companyId: string,
  projectId: string,
  workflowId: string,
) {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-workflow-activate:${companyId}:${projectId}`}, 0))`);

    const project = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!project) throw notFound("Project not found");

    // Enforce concurrency rule: if an execution is currently running, block switching
    const activeRun = await tx
      .select({ id: atelierWorkflowRuns.id, status: atelierWorkflowRuns.status })
      .from(atelierWorkflowRuns)
      .where(
        and(
          eq(atelierWorkflowRuns.companyId, companyId),
          eq(atelierWorkflowRuns.projectId, projectId),
          eq(atelierWorkflowRuns.status, "running"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (activeRun) {
      throw conflict(
        "Không thể đổi Active Workflow khi dự án đang có quy trình đang thực thi. Hãy hoàn thành hoặc dừng lượt chạy trước.",
        { code: "execution_in_progress", runId: activeRun.id },
      );
    }

    const workflow = await tx
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!workflow) throw notFound("Workflow definition not found");

    const currentMeta = (project.metadata ?? {}) as Record<string, unknown>;
    const updatedMeta = {
      ...currentMeta,
      activeWorkflowId: workflow.id,
      activeWorkflowVersion: workflow.version,
    };

    await tx
      .update(projects)
      .set({ metadata: updatedMeta, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return {
      ok: true,
      projectId,
      activeWorkflowId: workflow.id,
      activeWorkflowVersion: workflow.version,
      workflowName: workflow.name,
      status: workflow.status,
    };
  });
}

export async function listAtelierWorkflowVersions(db: Db, companyId: string) {
  return db.select().from(workflows).where(and(eq(workflows.companyId, companyId), eq(workflows.name, ATELIER_COMPANY_WORKFLOW_NAME))).orderBy(desc(workflows.version));
}

export async function createAtelierWorkflowDraft(db: Db, companyId: string, sourceId: string, actorUserId?: string | null) {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-workflow-version:${companyId}`}, 0))`);
    const source = await tx.select().from(workflows).where(and(eq(workflows.id, sourceId), eq(workflows.companyId, companyId))).then((rows) => rows[0] ?? null);
    if (!source) throw notFound("Workflow source version not found");
    const currentMax = await tx.select({ value: max(workflows.version) }).from(workflows).where(and(eq(workflows.companyId, companyId), eq(workflows.name, source.name))).then((rows) => rows[0]?.value ?? 0);
    const version = currentMax + 1;
    const definition = upgradeLegacyAtelierDefinition(source.definition, version, source.name);
    return tx.insert(workflows).values({ companyId, name: source.name, prompt: source.prompt, scope: source.scope, version, status: "draft", definition: definition as unknown as Record<string, unknown>, createdByUserId: actorUserId ?? null }).returning().then((rows) => rows[0]!);
  });
}

export async function updateAtelierWorkflowDraft(db: Db, companyId: string, id: string, value: unknown, expectedUpdatedAt?: string) {
  const row = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.companyId, companyId))).then((rows) => rows[0] ?? null);
  if (!row) throw notFound("Workflow version not found");
  if (row.status !== "draft") throw conflict("Published or archived workflow versions are immutable", { code: "workflow_version_immutable" });
  if (expectedUpdatedAt && row.updatedAt.toISOString() !== expectedUpdatedAt) throw conflict("Workflow draft changed since it was opened", { code: "workflow_version_conflict", currentUpdatedAt: row.updatedAt.toISOString() });
  const definition = upgradeLegacyAtelierDefinition(value, row.version, row.name);
  return db.update(workflows).set({ definition: definition as unknown as Record<string, unknown>, updatedAt: new Date() }).where(and(eq(workflows.id, id), eq(workflows.companyId, companyId), eq(workflows.status, "draft"))).returning().then((rows) => rows[0]!);
}

export async function publishAtelierWorkflowDraft(db: Db, companyId: string, id: string) {
  const row = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.companyId, companyId))).then((rows) => rows[0] ?? null);
  if (!row) throw notFound("Workflow version not found");
  if (row.status !== "draft") throw conflict("Only draft workflows can be published", { code: "workflow_not_draft" });
  const validation = await validateAtelierWorkflowDefinition(db, companyId, row.definition);
  if (!validation.valid) throw unprocessable("Workflow validation failed", { code: "workflow_validation_failed", issues: validation.issues });
  const publishedSummary = buildWorkflowSummary(validation.definition);
  return db.update(workflows).set({ status: "published", publishedSummary, updatedAt: new Date() }).where(and(eq(workflows.id, id), eq(workflows.companyId, companyId), eq(workflows.status, "draft"))).returning().then((rows) => rows[0]!);
}

function buildWorkflowSummary(definition: AtelierEditableDefinition | null): string {
  if (!definition) return "";
  const parts: string[] = [];
  for (const node of definition.nodes) {
    if (node.type === "AGENT_TASK") {
      parts.push(node.name);
      if (node.requiredRole) parts.push(node.requiredRole);
    } else if (node.type === "END") {
      parts.push("Ket thuc");
    }
  }
  return parts.join(", ");
}

export async function resolveActiveAtelierWorkflowName(db: Db, companyId: string): Promise<string> {
  const row = await db.select().from(atelierWorkflowSelections).where(eq(atelierWorkflowSelections.companyId, companyId)).then((rows) => rows[0] ?? null);
  return row?.workflowName ?? ATELIER_COMPANY_WORKFLOW_NAME;
}

export async function selectAtelierWorkflowFamily(db: Db, companyId: string, name: string, userId?: string | null): Promise<{ workflowName: string }> {
  const hasPublished = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.companyId, companyId), eq(workflows.name, name), eq(workflows.status, "published"))).limit(1).then((rows) => rows.length > 0);
  if (!hasPublished) throw unprocessable("Workflow family has no published version", { code: "workflow_family_not_publishable" });
  await db.insert(atelierWorkflowSelections).values({ companyId, workflowName: name, updatedByUserId: userId ?? null }).onConflictDoUpdate({ target: atelierWorkflowSelections.companyId, set: { workflowName: name, updatedAt: new Date(), updatedByUserId: userId ?? null } });
  return { workflowName: name };
}

export async function createAtelierWorkflowFamily(db: Db, companyId: string, input: { name: string; prompt: string; definition: AtelierEditableDefinition }): Promise<typeof workflows.$inferSelect> {
  const existing = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.companyId, companyId), eq(workflows.name, input.name))).limit(1).then((rows) => rows[0] ?? null);
  if (existing) throw conflict("A workflow family with this name already exists", { code: "workflow_family_name_conflict" });
  return db.insert(workflows).values({ companyId, name: input.name, prompt: input.prompt, scope: "company", version: 1, status: "draft", definition: input.definition as unknown as Record<string, unknown> }).returning().then((rows) => rows[0]!);
}

export type AtelierWorkflowFamilySummary = {
  id: string;
  name: string;
  prompt: string;
  status: string;
  latestVersion: number;
  hasPublishedVersion: boolean;
  publishedVersion: number | null;
  publishedSummary: string | null;
  isActive: boolean;
};

export async function getAtelierWorkflowVersionById(db: Db, companyId: string, id: string) {
  const row = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.companyId, companyId))).then((rows) => rows[0] ?? null);
  if (!row) throw notFound("Workflow version not found");
  return row;
}

export async function listAtelierWorkflowFamilies(db: Db, companyId: string): Promise<AtelierWorkflowFamilySummary[]> {
  const activeName = await resolveActiveAtelierWorkflowName(db, companyId);
  const rows = await db.select().from(workflows).where(eq(workflows.companyId, companyId)).orderBy(desc(workflows.version));
  const byName = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name)!.push(row);
  }
  const result: AtelierWorkflowFamilySummary[] = [];
  for (const [name, versions] of byName) {
    const latest = versions[0]!;
    const published = versions.find((v) => v.status === "published");
    result.push({
      id: latest.id,
      name,
      prompt: latest.prompt,
      status: latest.status,
      latestVersion: latest.version,
      hasPublishedVersion: !!published,
      publishedVersion: published?.version ?? null,
      publishedSummary: published?.publishedSummary ?? null,
      isActive: name === activeName,
    });
  }
  return result;
}

export async function assertAtelierNodeAssignment(db: Db, input: { companyId: string; node: AtelierWorkflowNode; agentId: string }) {
  const registry = await listAtelierAgentCapabilities(db, input.companyId);
  const agent = registry.find((item) => item.agentId === input.agentId);
  const failures: string[] = [];
  if (!agent) failures.push("agent_not_found");
  else {
    if (!agent.available) failures.push("agent_unavailable");
    if (input.node.requiredRole && !agent.roleKeys.includes(input.node.requiredRole)) failures.push("role_mismatch");
    if (input.node.taskType && !agent.allowedTaskTypes.includes(input.node.taskType)) failures.push("task_type_not_allowed");
    if (input.node.agentSelector?.capability && !agent.capabilities.includes(input.node.agentSelector.capability)) failures.push("capability_missing");
  }
  if (failures.length) {
    const alternatives = registry.filter((candidate) => candidate.available && (!input.node.requiredRole || candidate.roleKeys.includes(input.node.requiredRole)) && (!input.node.taskType || candidate.allowedTaskTypes.includes(input.node.taskType))).map((candidate) => ({ agentId: candidate.agentId, name: candidate.name }));
    throw forbidden("Agent assignment rejected by Atelier routing policy", { code: "atelier_assignment_rejected", failures, requestedAgentId: input.agentId, nodeId: input.node.id, taskType: input.node.taskType, alternatives });
  }
  return agent!;
}

type WorkflowIssuePolicy = {
  workflowRunId: string;
  workflowVersion: number;
  nodeId: string;
  node: AtelierWorkflowNode;
};

export function readAtelierWorkflowIssuePolicy(value: unknown): WorkflowIssuePolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  const raw = outer.atelierWorkflow;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const policy = raw as Record<string, unknown>;
  if (typeof policy.workflowRunId !== "string" || typeof policy.workflowVersion !== "number" || typeof policy.nodeId !== "string" || !policy.node || typeof policy.node !== "object") return null;
  return policy as unknown as WorkflowIssuePolicy;
}

export async function assertAtelierIssueAssignmentPolicy(db: Db, input: { companyId: string; executionPolicy: unknown; agentId: string }) {
  const policy = readAtelierWorkflowIssuePolicy(input.executionPolicy);
  if (!policy) return null;
  await assertAtelierNodeAssignment(db, { companyId: input.companyId, node: policy.node, agentId: input.agentId });
  const run = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, policy.workflowRunId), eq(atelierWorkflowRuns.companyId, input.companyId))).then((rows) => rows[0] ?? null);
  if (!run || run.workflowVersion !== policy.workflowVersion) throw conflict("Workflow task version does not match its run", { code: "atelier_workflow_version_mismatch", workflowRunId: policy.workflowRunId, expectedVersion: policy.workflowVersion, actualVersion: run?.workflowVersion ?? null });
  return policy;
}

export async function assertAtelierIssueExecutionAdmission(db: Db, issueId: string, agentId: string) {
  const issue = await db.select({ companyId: issues.companyId, executionPolicy: issues.executionPolicy }).from(issues).where(eq(issues.id, issueId)).then((rows) => rows[0] ?? null);
  if (!issue) throw notFound("Issue not found");
  const policy = await assertAtelierIssueAssignmentPolicy(db, { companyId: issue.companyId, executionPolicy: issue.executionPolicy, agentId });
  if (!policy) return null;
  const stage = await db.select().from(atelierWorkflowStageExecutions).where(and(eq(atelierWorkflowStageExecutions.workflowRunId, policy.workflowRunId), eq(atelierWorkflowStageExecutions.stageKey, policy.nodeId), eq(atelierWorkflowStageExecutions.issueId, issueId))).then((rows) => rows[0] ?? null);
  if (!stage) throw conflict("Workflow task is not mapped to a node execution", { code: "atelier_node_mapping_missing", nodeId: policy.nodeId });
  if (stage.agentId !== agentId) throw forbidden("Agent does not own this workflow node", { code: "atelier_node_owner_mismatch", nodeId: policy.nodeId, expectedAgentId: stage.agentId, requestedAgentId: agentId });
  if (["pending", "needs_input", "blocked", "failed"].includes(stage.status)) throw conflict("Workflow node is not ready for execution", { code: "atelier_node_not_ready", nodeId: policy.nodeId, status: stage.status, blockerReason: stage.blockerReason });
  if (policy.node.approval?.required && stage.approvalState !== "approved") throw conflict("Workflow node is waiting for approval", { code: "atelier_approval_required", nodeId: policy.nodeId, approvalState: stage.approvalState });
  return { policy, stage };
}

export async function assertAtelierIssueCompletionEvidence(db: Db, issueId: string) {
  const issue = await db.select({ companyId: issues.companyId, executionPolicy: issues.executionPolicy }).from(issues).where(eq(issues.id, issueId)).then((rows) => rows[0] ?? null);
  if (!issue) throw notFound("Issue not found");
  const policy = readAtelierWorkflowIssuePolicy(issue.executionPolicy);
  if (!policy) return null;
  const stage = await db.select().from(atelierWorkflowStageExecutions).where(and(eq(atelierWorkflowStageExecutions.workflowRunId, policy.workflowRunId), eq(atelierWorkflowStageExecutions.stageKey, policy.nodeId), eq(atelierWorkflowStageExecutions.issueId, issueId))).then((rows) => rows[0] ?? null);
  if (!stage || stage.status !== "done" || stage.outputReferences.length === 0) throw conflict("Workflow task cannot complete without validated output evidence", { code: "atelier_completion_evidence_missing", nodeId: policy.nodeId, stageStatus: stage?.status ?? null, outputReferenceCount: stage?.outputReferences.length ?? 0 });
  return { policy, stage };
}
