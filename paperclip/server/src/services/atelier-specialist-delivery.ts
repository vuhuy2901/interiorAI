import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { activityLog, agents, issueDocuments, issueThreadInteractions, atelierWorkflowEvents, atelierWorkflowRuns, atelierWorkflowStageExecutions, issues, projects, workflows, type Db } from "@paperclipai/db";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";
import { listAtelierAgentCapabilities, validateAtelierWorkflowDefinition, type AtelierEditableDefinition } from "./atelier-workflow-builder.js";
import { SPECIALIST_WORKFLOW_KEY, affectedDeliveryNodes, deliveryDependencies, deliveryNodes, specialistDeliveryDefinition, specialistWorkflowEnabled, validateDeliveryOutput } from "./atelier-delivery-contract.js";
import { notifyDeliveryWork, DELIVERY_QUEUES } from "./delivery-work-notifications.js";

export type DeliverySnapshot = {
  definition: AtelierEditableDefinition;
  agentBindings: Record<string, string>;
  sceneId: string;
  decisionPolicy: "specialist_autonomy";
};
export function readDeliverySnapshot(ledger: Record<string, unknown>): DeliverySnapshot | null {
  const snapshot = ledger.specialistDelivery as DeliverySnapshot | undefined;
  return snapshot?.definition?.key === SPECIALIST_WORKFLOW_KEY ? snapshot : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function lock(db: Db, companyId: string, projectId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-workflow:${companyId}:${projectId}`}, 0))`);
}

export async function ensureSpecialistDefinition(db: Db, companyId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-definition:${companyId}`}, 0))`);
  const rows = await db.select().from(workflows).where(and(eq(workflows.companyId, companyId), eq(workflows.name, "Atelier Company Workflow"))).orderBy(desc(workflows.version));
  const existing = rows.find(row => row.status === "published" && row.definition?.key === SPECIALIST_WORKFLOW_KEY);
  if (existing) return existing;
  const version = (rows[0]?.version ?? 0) + 1;
  const definition = specialistDeliveryDefinition(version);
  const validation = await validateAtelierWorkflowDefinition(db, companyId, definition);
  if (!validation.valid) throw unprocessable("Specialist workflow validation failed", { issues: validation.issues });
  return db.insert(workflows).values({ companyId, name: definition.name, prompt: "Chief coordinates; specialists execute and QA independently validates.", scope: "company", version, status: "published", definition: definition as unknown as Record<string, unknown> }).returning().then(rows => rows[0]!);
}

export async function provisionSpecialistDelivery(db: Db, input: {
  companyId: string; projectId: string; sceneId: string; rootIssueId?: string | null;
  workflowDefinitionId?: string; sourceIssueId?: string | null; responsibleUserId?: string;
}) {
  if (!specialistWorkflowEnabled()) throw conflict("Specialist workflow dispatch is disabled");
  return db.transaction(async raw => {
    const tx = raw as unknown as Db;
    await lock(tx, input.companyId, input.projectId);
    const [project] = await tx.select().from(projects).where(and(eq(projects.companyId, input.companyId), eq(projects.id, input.projectId)));
    if (!project) throw notFound("Project not found");
    const existing = await tx.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, input.companyId), eq(atelierWorkflowRuns.projectId, input.projectId))).orderBy(asc(atelierWorkflowRuns.createdAt));
    if (existing.length) {
      if (!readDeliverySnapshot(existing[0].decisionLedger)) throw conflict("Project already has a legacy workflow; start a new project to rebuild");
      if (readDeliverySnapshot(existing[0].decisionLedger)!.sceneId !== input.sceneId) throw conflict("Project canonical scene binding changed");
      return specialistDeliveryView(tx, input.companyId, existing[0].id);
    }
    const definitionRow = input.workflowDefinitionId
      ? (await tx.select().from(workflows).where(and(eq(workflows.id, input.workflowDefinitionId), eq(workflows.companyId, input.companyId), eq(workflows.status, "published"))))[0]
      : await ensureSpecialistDefinition(tx, input.companyId);
    if (!definitionRow || definitionRow.definition?.key !== SPECIALIST_WORKFLOW_KEY) throw unprocessable("Select a published specialist delivery workflow");
    const definition = structuredClone(definitionRow.definition) as unknown as AtelierEditableDefinition;
    const validation = await validateAtelierWorkflowDefinition(tx, input.companyId, definition);
    if (!validation.valid) throw unprocessable("Workflow validation failed", { issues: validation.issues });
    // Repair only stale orchestration-generated readiness errors, never auth/provider failures.
    const roster = await tx.select().from(agents).where(eq(agents.companyId, input.companyId));
    for (const agent of roster) if (agent.status === "error" && ["Agent assignment rejected by Atelier routing policy", "Workflow node is not ready for execution"].includes(agent.errorReason ?? "")) {
      await tx.update(agents).set({ status: "idle", errorReason: null, updatedAt: new Date() }).where(eq(agents.id, agent.id));
    }
    const registry = await listAtelierAgentCapabilities(tx, input.companyId);
    const bindings: Record<string, string> = {};
    for (const node of deliveryNodes(definition)) {
      const candidates = registry.filter(agent => agent.available && agent.roleKeys.includes(node.requiredRole!) && agent.allowedTaskTypes.includes(node.taskType!) && (!node.agentSelector?.capability || agent.capabilities.includes(node.agentSelector.capability)));
      const owner = node.assignedAgentId ? candidates.find(agent => agent.agentId === node.assignedAgentId) : candidates[0];
      if (!owner) throw unprocessable(`No available specialist for ${node.id}`);
      bindings[node.id] = owner.agentId;
      node.assignedAgentId = owner.agentId;
    }
    const svc = issueService(tx);
    let root = input.rootIssueId ? await svc.getById(input.rootIssueId) : null;
    if (input.rootIssueId && (!root || root.companyId !== input.companyId || root.conversationAgentId || (root.projectId && root.projectId !== project.id))) throw conflict("Invalid workflow root binding");
    if (!root) root = await svc.create(input.companyId, {
      projectId: project.id, title: `[ATELIER WORKFLOW] ${project.name}`, description: `${project.description ?? ""}${input.sourceIssueId ? `\n\nSource task: /api/issues/${input.sourceIssueId} (preserved original)` : ""}`,
      status: "backlog", assigneeAgentId: bindings.brief, responsibleUserId: input.responsibleUserId ?? "local-board",
      createdByUserId: input.responsibleUserId ?? "local-board", originKind: "manual",
      idempotencyKey: `${SPECIALIST_WORKFLOW_KEY}:${project.id}:root`, allowDuplicate: true,
    });
    const userDecisions = input.sourceIssueId ? await tx.select({ interactionId: issueThreadInteractions.id, question: issueThreadInteractions.payload, answer: issueThreadInteractions.result, answeredAt: issueThreadInteractions.resolvedAt }).from(issueThreadInteractions).where(and(eq(issueThreadInteractions.companyId, input.companyId), eq(issueThreadInteractions.issueId, input.sourceIssueId), eq(issueThreadInteractions.kind, "ask_user_questions"), eq(issueThreadInteractions.status, "answered"))) : [];
    const snapshot: DeliverySnapshot = { definition, sceneId: input.sceneId, agentBindings: bindings, decisionPolicy: "specialist_autonomy" };
    const [run] = await tx.insert(atelierWorkflowRuns).values({ companyId: input.companyId, projectId: project.id, workflowDefinitionId: definitionRow.id, workflowVersion: definitionRow.version, rootIssueId: root.id, decisionLedger: { specialistDelivery: snapshot, sourceIssueId: input.sourceIssueId ?? null, userDecisions }, status: "running" }).returning();
    await svc.update(root.id, { companyGuard: input.companyId, projectId: project.id, executionPolicy: { atelierDeliveryRoot: { workflowRunId: run.id } }, status: "backlog" });
    const byNode = new Map<string, string>();
    // All stage tasks are created before any wake can be committed.
    for (const node of deliveryNodes(definition)) {
      const task = await svc.create(input.companyId, {
        projectId: project.id, parentId: root.id, parentDepthPolicy: "allow_nested", expectedParentId: root.id,
        title: `[ATELIER • ${node.id}] ${node.name}`, status: "backlog", assigneeAgentId: bindings[node.id],
        description: `${project.description ?? ""}\n\n${specialistTaskInstructions(run.id, node.id, input.sceneId, project.id)}${input.sourceIssueId ? `\nSource brief/attachments: /api/issues/${input.sourceIssueId}. Read the attachment, not old generated geometry.` : ""}`,
        executionPolicy: { atelierWorkflow: { workflowRunId: run.id, workflowVersion: run.workflowVersion, nodeId: node.id, node } },
        responsibleUserId: input.responsibleUserId ?? "local-board", createdByUserId: input.responsibleUserId ?? "local-board",
        originKind: "manual", originId: `${SPECIALIST_WORKFLOW_KEY}:${run.id}:${node.id}`,
        idempotencyKey: `${SPECIALIST_WORKFLOW_KEY}:${run.id}:${node.id}`, allowDuplicate: false,
      });
      byNode.set(node.id, task.id);
      await tx.insert(activityLog).values({ companyId: input.companyId, actorType: "system", actorId: "atelier-workflow", action: "issue.created", entityType: "issue", entityId: task.id, details: { identifier: task.identifier, title: task.title, projectId: project.id, parentId: root.id, workflowRunId: run.id, nodeId: node.id, assigneeAgentId: bindings[node.id] } });
      await tx.insert(atelierWorkflowStageExecutions).values({ companyId: input.companyId, projectId: project.id, workflowRunId: run.id, stageKey: node.id, issueId: task.id, agentId: bindings[node.id], status: "pending", approvalState: "not_required", blockerReason: "Waiting for predecessor outputs" });
    }
    for (const node of deliveryNodes(definition)) await svc.update(byNode.get(node.id)!, { companyGuard: input.companyId, blockedByIssueIds: deliveryDependencies(definition, node.id).map(id => byNode.get(id)!) });
    await advance(tx, run, snapshot);
    await tx.insert(atelierWorkflowEvents).values({ companyId: input.companyId, projectId: project.id, workflowRunId: run.id, eventType: "delivery_provisioned", idempotencyKey: `provision:${run.id}`, payload: { rootIssueId: root.id, sceneId: input.sceneId, sourceIssueId: input.sourceIssueId ?? null } });
    return specialistDeliveryView(tx, input.companyId, run.id);
  });
}

function specialistTaskInstructions(runId: string, nodeId: string, sceneId: string, projectId: string) {
  const base = `Workflow run: ${runId}; node: ${nodeId}; native project: ${projectId}; canonical scene: ${sceneId}.
Read GET /api/atelier/workflow/runs/${runId} for verified predecessor outputs. Chief only writes the brief/delivery, never geometry, finish, furniture or estimates. QA is read-only. Specialists decide reversible details within the brief, recording reason, evidence, confidence and fallback; never label agent choices as user-confirmed. Ask Chief only for brief changes, safety, missing scale or financial commitments. No demo fallback. Use revision-checked writes.
When ready, persist a task document via Paperclip and POST /api/atelier/workflow/runs/${runId}/stages/${nodeId}/complete with idempotencyKey and output {sceneId, revision, summary, decisions, references:[{uri:"/api/issues/<task-id>/documents/<key>"}]}. QA must include verdict:"pass" or "fail" and corrections:[{nodeId,reason}] where nodeId is a workflow stage key (brief, floorplan, geometry, etc.), NOT an issue identifier like ATL-xxx. Delivery waits for final human approval via the same endpoint, called by board with approve:true. Backend owns task completion and next-stage wake; do not PATCH done or create duplicate downstream tasks.`;

  const stageGuide: Record<string, string> = {
    geometry: `
SCENE WRITE API — durable geometry (rooms, walls, openings, windows, stairs, any furniture_instances) MUST go through PUT /api/v1/projects/${sceneId}/scene with a FULL CanonicalProject body (project_id, name, revision, rooms, walls, openings, windows, furniture_instances, etc.), never with operations/patch/empty scene objects. Read current state first with GET /api/v1/projects/${sceneId}, add/modify the relevant arrays in the full body, and PUT it back.
Bound Pascal MCP tools via POST /api/v1/mcp/call are VALIDATION ONLY (verify_scene, check_collisions) — do not rely on create_room/add_wall/add_door/add_window/update_node/delete_nodes to persist anything: the MCP gateway mutates an ephemeral in-process scene graph for that single request and returns it in the response, but the sidecar never writes it back to the canonical project, and exports/BOQ read only the canonical rooms/walls/furniture_instances fields — never the Pascal scene graph. Anything created only via these MCP tools is silently lost on the next read.
Exports live at GET /api/v1/exports/{project_id}/{fmt} (fmt: dxf, glb, dae, ifc, csv, xlsx) — not /projects/{id}/export/{fmt} (404). All of dxf/glb/ifc work today with no external driver or GPU dependency (export_project_to_glb builds glTF 2.0 in pure Python); do not report GLB as blocked by a "headless renderer" — that limitation belongs only to the separate Render stage's Blender Cycles pipeline, never to this export endpoint.
Workflow: 1) GET /api/v1/projects/${sceneId} to read current state and revision. 2) PUT the full CanonicalProject body with all rooms, walls, doors, windows and other structural/furniture elements from the brief added. 3) Call POST /api/v1/mcp/call with tool_name:"verify_scene" to validate (read-only). 4) Fetch exports from GET /api/v1/exports/${sceneId}/{fmt}. 5) Persist handoff document and POST .../stages/${nodeId}/complete.
The scene starts as a placeholder (one room, revision 1). You must create all rooms, walls and openings from the brief via the full-body PUT. If an element (e.g. a stair) cannot be added because its dimensions have no sourced measurement evidence, do not invent values to force the write through — explicitly record it as a deferred item in the handoff document with the reason, rather than silently omitting it or retrying indefinitely.`,
    floorplan_qa: `
QA SCOPE — floorplan_qa: You judge ONLY the Floor Plan stage output (scale/unit verification, spatial program completeness in the handoff DOCUMENT, source reconciliation, provenance). The canonical scene is expected to be a placeholder at this point — scene geometry, Pascal node links, walkway clearance, furniture collision and door swing checks belong to geometry/furniture/final_qa stages. Mark those as "deferred to <stage>" in your document, NOT as reasons for FAIL.
FAIL only when Floor Plan's own deliverables (scale gate, program reconciliation, topology extraction from source, dimension evidence) are incorrect or missing.
corrections[].nodeId must be a workflow stage key: "floorplan" or "brief". Never use issue identifiers (ATL-xxx).`,
    final_qa: `
QA SCOPE — final_qa: You judge ALL completed predecessor stages together: geometry (scene rooms/walls/openings match brief), furniture (collision-free, walkway >=750mm), style (materials consistent), cost (BOQ complete), render (visualization present). Read the canonical scene via GET /api/v1/projects/${sceneId} and POST /api/v1/mcp/call with tool_name:"get_scene" to verify actual state.
corrections[].nodeId must be a workflow stage key (geometry, furniture, style, cost, render). Never use issue identifiers (ATL-xxx).`,
    floorplan: `
Floorplan must reconcile design area versus envelope dimensions and axis sums against the source image; never invent calibrated dimensions. Record scale gate evidence, spatial program and topology in the handoff document. The canonical scene write belongs to the geometry stage, not floorplan.`,
    render: `
RENDER JOB API: POST /api/v1/projects/${sceneId}/render-jobs is SYNCHRONOUS by default (blocks until the Blender Cycles render finishes, typically 15-35 seconds) — a client-side timeout on that single call can abort before the response arrives even though the server finishes the job anyway. ALWAYS send {"async_exec": true} (or {"wait_for_completion": false}) to get {job_id} back immediately, then poll with a SEPARATE call to GET /api/v1/render-jobs/{job_id} (or GET /api/v1/projects/${sceneId}/render-jobs to list) until status is "COMPLETED", and read render_url/image_url from that response.
Before reporting the renderer sidecar as unavailable, re-check GET /api/v1/projects/${sceneId}/render-jobs — a job you enqueued earlier may have already completed with a real image even if your enqueue call appeared to return nothing.
Every render image carries the mandatory watermark/label "ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG"; this is expected, not an error.`,
  };

  return base + (stageGuide[nodeId] ?? "");
}

async function advance(tx: Db, run: typeof atelierWorkflowRuns.$inferSelect, snapshot: DeliverySnapshot) {
  const rows = await tx.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id));
  for (const node of deliveryNodes(snapshot.definition)) {
    const stage = rows.find(row => row.stageKey === node.id)!;
    if (stage.status !== "pending" || !stage.issueId) continue;
    if (deliveryDependencies(snapshot.definition, node.id).some(id => rows.find(row => row.stageKey === id)?.status !== "done")) continue;
    await notifyDeliveryWork(tx, DELIVERY_QUEUES.atelierDelivery, run.id);
    await tx.update(atelierWorkflowStageExecutions).set({ status: "ready", blockerReason: null, updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, stage.id));
    await issueService(tx).update(stage.issueId, { companyGuard: run.companyId, status: "todo" });
    await tx.insert(atelierWorkflowEvents).values({ companyId: run.companyId, projectId: run.projectId, workflowRunId: run.id, stageExecutionId: stage.id, eventType: "dispatch_pending", idempotencyKey: `dispatch:${run.id}:${stage.id}:${stage.updatedAt.toISOString()}`, targetAgentId: stage.agentId, payload: { issueId: stage.issueId } }).onConflictDoNothing();
  }
}

export async function specialistDeliveryView(db: Db, companyId: string, runId: string) {
  const [run] = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, companyId), eq(atelierWorkflowRuns.id, runId)));
  if (!run) throw notFound("Workflow run not found");
  const snapshot = readDeliverySnapshot(run.decisionLedger);
  if (!snapshot) throw conflict("Not a specialist delivery workflow");
  const rows = await db.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id)).orderBy(asc(atelierWorkflowStageExecutions.createdAt));
  const tasks = rows.length ? await db.select().from(issues).where(inArray(issues.id, rows.flatMap(row => row.issueId ? [row.issueId] : []))) : [];
  const owners = await db.select().from(agents).where(eq(agents.companyId, companyId));
  const [rootIssue] = run.rootIssueId ? await db.select().from(issues).where(eq(issues.id, run.rootIssueId)) : [];
  return { run, rootIssue: rootIssue ?? null, stages: rows.map(row => {
    const task = tasks.find(task => task.id === row.issueId) ?? null;
    const status = row.status === "ready" && task?.executionRunId && task.status === "in_progress" ? "running" as const
      : row.status === "ready" && task?.status === "in_review" ? "needs_review" as const : row.status;
    return { ...row, status, dependencies: deliveryDependencies(snapshot.definition, row.stageKey), issue: task, agent: owners.find(agent => agent.id === row.agentId) ?? null };
  }) };
}

export async function completeSpecialistStage(db: Db, input: {
  companyId: string; runId: string; nodeId: string; agentId: string | null; board: boolean;
  idempotencyKey: string; output: unknown; approve?: boolean; sceneId: string; revision: number;
}) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw unprocessable("idempotencyKey is required (max 200 characters)");
  let output: Record<string, unknown>;
  const submittedRevision = (input.output as { revision?: number } | null)?.revision;
  if (!Number.isInteger(submittedRevision) || submittedRevision! < 1) throw unprocessable("A positive canonical revision is required");
  try { output = validateDeliveryOutput(input.output, input.sceneId, submittedRevision!); } catch (error) { throw unprocessable((error as Error).message); }
  const fingerprint = createHash("sha256").update(canonicalJson({ nodeId: input.nodeId, output, approve: input.approve === true })).digest("hex");
  return db.transaction(async raw => {
    const tx = raw as unknown as Db;
    const [lookup] = await tx.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, input.runId), eq(atelierWorkflowRuns.companyId, input.companyId)));
    if (!lookup) throw notFound("Workflow run not found");
    await lock(tx, input.companyId, lookup.projectId);
    const [run] = await tx.select().from(atelierWorkflowRuns).where(eq(atelierWorkflowRuns.id, lookup.id));
    const snapshot = readDeliverySnapshot(run.decisionLedger);
    if (!snapshot || snapshot.sceneId !== input.sceneId) throw conflict("Canonical scene binding mismatch");
    const node = deliveryNodes(snapshot.definition).find(node => node.id === input.nodeId);
    const [stage] = await tx.select().from(atelierWorkflowStageExecutions).where(and(eq(atelierWorkflowStageExecutions.workflowRunId, run.id), eq(atelierWorkflowStageExecutions.stageKey, input.nodeId)));
    if (!node || !stage?.issueId) throw notFound("Workflow stage not found");
    if (!input.board && input.agentId !== stage.agentId) throw forbidden("Only the assigned specialist can submit this stage");
    const key = `complete:${run.id}:${input.idempotencyKey}`;
    const [prior] = await tx.select().from(atelierWorkflowEvents).where(and(eq(atelierWorkflowEvents.companyId, input.companyId), eq(atelierWorkflowEvents.idempotencyKey, key)));
    if (prior) {
      if (prior.payload.fingerprint !== fingerprint) throw conflict("Idempotency key was used with a different output");
      return { duplicate: true, view: await specialistDeliveryView(tx, input.companyId, run.id) };
    }
    if (submittedRevision !== input.revision) throw conflict("Canonical revision changed; re-read the scene before submitting output");
    if (!["ready", "running", "needs_review"].includes(stage.status)) throw conflict("Stage is not ready for completion");
    for (const reference of output.references as Array<{ uri: string }>) {
      const match = reference.uri.match(/^\/api\/issues\/([^/]+)\/documents\/([^/?]+)$/);
      if (!match || match[1] !== stage.issueId) throw unprocessable("Output evidence must reference this task's persisted documents");
      const [document] = await tx.select().from(issueDocuments).where(and(eq(issueDocuments.companyId, input.companyId), eq(issueDocuments.issueId, stage.issueId), eq(issueDocuments.key, decodeURIComponent(match[2]))));
      if (!document) throw unprocessable("Referenced output document is not persisted");
    }
    if (node.id === "delivery" && input.approve === true) {
      const submitted = stage.decisionLedger.output;
      if (!input.board || stage.status !== "needs_review" || !isDeepStrictEqual(submitted, output)) throw conflict("Approve the exact delivery submitted for human review");
    }
    const allStages = await tx.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id));
    if (deliveryDependencies(snapshot.definition, stage.stageKey).some(id => allStages.find(row => row.stageKey === id)?.status !== "done")) throw conflict("Stage has unresolved dependencies");
    const verdict = output.verdict;
    if (node.requiredRole === "qa_agent" && !["pass", "fail"].includes(String(verdict))) throw unprocessable("QA requires an explicit pass/fail verdict");
    if (node.requiredRole === "qa_agent" && verdict === "fail") {
      const corrections = output.corrections as Array<{ nodeId: string; reason: string }>;
      const predecessors = new Set<string>();
      function collect(id: string) { for (const dep of deliveryDependencies(snapshot!.definition, id)) if (!predecessors.has(dep)) { predecessors.add(dep); collect(dep); } }
      collect(node.id);
      if (!Array.isArray(corrections) || !corrections.length || corrections.some(c => !predecessors.has(c.nodeId) || typeof c.reason !== "string" || !c.reason.trim())) throw unprocessable("QA failure requires corrections for predecessor stages");
      const invalidated = new Set(corrections.flatMap(c => [c.nodeId, ...affectedDeliveryNodes(snapshot.definition, c.nodeId)]));
      for (const id of invalidated) {
        const row = allStages.find(row => row.stageKey === id);
        if (!row?.issueId) continue;
        const task = await issueService(tx).getById(row.issueId);
        if (id !== node.id && (task?.executionRunId || task?.checkoutRunId)) throw conflict("Wait for affected active stages to settle before requesting correction");
        await tx.update(atelierWorkflowStageExecutions).set({ status: "pending", outputReferences: [], completedAt: null, blockerReason: `QA correction: ${corrections.map(c => c.reason).join("; ")}`, decisionLedger: {}, updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, row.id));
        await issueService(tx).update(row.issueId, { companyGuard: input.companyId, status: "backlog" });
      }
    } else {
      const waiting = node.id === "delivery" && !(input.board && input.approve === true);
      await tx.update(atelierWorkflowStageExecutions).set({ status: waiting ? "needs_review" : "done", decisionLedger: { ...output.decisions as Record<string, unknown>, output }, outputReferences: output.references as Array<Record<string, unknown>>, completedAt: waiting ? null : new Date(), approvalState: waiting ? "pending" : node.id === "delivery" ? "approved" : "not_required", updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, stage.id));
      await issueService(tx).update(stage.issueId, { companyGuard: input.companyId, status: waiting ? "in_review" : "done", actorAgentId: input.agentId ?? undefined });
      if (node.id === "delivery" && !waiting) {
        await tx.update(atelierWorkflowRuns).set({ status: "done", completedAt: new Date(), updatedAt: new Date() }).where(eq(atelierWorkflowRuns.id, run.id));
        if (run.rootIssueId) await issueService(tx).update(run.rootIssueId, { companyGuard: input.companyId, status: "done" });
      } else await tx.update(atelierWorkflowRuns).set({ status: waiting ? "needs_review" : "running", updatedAt: new Date() }).where(eq(atelierWorkflowRuns.id, run.id));
    }
    await tx.insert(atelierWorkflowEvents).values({ companyId: input.companyId, projectId: run.projectId, workflowRunId: run.id, stageExecutionId: stage.id, sourceAgentId: input.agentId, eventType: verdict === "fail" ? "qa_correction_requested" : "stage_output_accepted", idempotencyKey: key, payload: { fingerprint, output, approvedByHuman: input.board && input.approve === true } });
    await tx.insert(activityLog).values({ companyId: input.companyId, actorType: input.board ? "user" : "agent", actorId: input.agentId ?? "local-board", action: "atelier.stage_output_accepted", entityType: "issue", entityId: stage.issueId, details: { workflowRunId: run.id, nodeId: stage.stageKey, verdict: verdict ?? null, sceneId: input.sceneId, revision: input.revision } });
    await advance(tx, run, snapshot);
    return { duplicate: false, view: await specialistDeliveryView(tx, input.companyId, run.id) };
  });
}

export async function requestSpecialistRework(db: Db, input: { companyId: string; runId: string; nodeIds: string[]; reason: string; idempotencyKey: string }) {
  if (!input.nodeIds.length || !input.reason.trim() || !input.idempotencyKey) throw unprocessable("nodeIds, reason and idempotencyKey are required");
  return db.transaction(async raw => {
    const tx = raw as unknown as Db;
    const [run] = await tx.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, input.companyId), eq(atelierWorkflowRuns.id, input.runId)));
    if (!run) throw notFound("Workflow run not found");
    await lock(tx, input.companyId, run.projectId);
    const snapshot = readDeliverySnapshot(run.decisionLedger);
    if (!snapshot) throw conflict("Not a specialist workflow");
    const fingerprint = canonicalJson({ nodeIds: [...input.nodeIds].sort(), reason: input.reason });
    const key = `rework:${run.id}:${input.idempotencyKey}`;
    const [prior] = await tx.select().from(atelierWorkflowEvents).where(and(eq(atelierWorkflowEvents.companyId, input.companyId), eq(atelierWorkflowEvents.idempotencyKey, key)));
    if (prior) {
      if (prior.payload.fingerprint !== fingerprint) throw conflict("Rework key reused for a different request");
      return specialistDeliveryView(tx, input.companyId, run.id);
    }
    const executable = new Set(deliveryNodes(snapshot.definition).map(node => node.id));
    if (input.nodeIds.some(id => !executable.has(id))) throw unprocessable("Unknown rework stage");
    const affected = new Set(input.nodeIds.flatMap(id => [id, ...affectedDeliveryNodes(snapshot.definition, id)]));
    const rows = await tx.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id));
    for (const stage of rows.filter(row => affected.has(row.stageKey))) {
      if (!stage.issueId) throw conflict("Workflow task binding is missing");
      const task = await issueService(tx).getById(stage.issueId);
      if (task?.executionRunId || task?.checkoutRunId) throw conflict("Affected specialist work is active; retry after its current run settles");
      await tx.update(atelierWorkflowStageExecutions).set({ status: "pending", completedAt: null, outputReferences: [], decisionLedger: {}, approvalState: "not_required", blockerReason: input.reason, updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, stage.id));
      await issueService(tx).update(stage.issueId, { companyGuard: input.companyId, status: "backlog" });
    }
    await tx.update(atelierWorkflowRuns).set({ status: "running", completedAt: null, updatedAt: new Date() }).where(eq(atelierWorkflowRuns.id, run.id));
    if (run.rootIssueId) await issueService(tx).update(run.rootIssueId, { companyGuard: input.companyId, status: "backlog" });
    await tx.insert(atelierWorkflowEvents).values({ companyId: input.companyId, projectId: run.projectId, workflowRunId: run.id, eventType: "rework_requested", idempotencyKey: key, payload: { fingerprint, reason: input.reason, nodeIds: input.nodeIds } });
    await advance(tx, run, snapshot);
    return specialistDeliveryView(tx, input.companyId, run.id);
  });
}
