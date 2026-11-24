import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, companyMemberships, projects, atelierWorkflowEvents, atelierWorkflowStageExecutions, issueDocuments, documents, createDb, startEmbeddedPostgresTestDatabase, type Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { affectedDeliveryNodes, deliveryDependencies, deliveryNodes, specialistDeliveryDefinition, validateDeliveryOutput } from "../services/atelier-delivery-contract.js";
import { completeSpecialistStage, provisionSpecialistDelivery, requestSpecialistRework } from "../services/atelier-specialist-delivery.js";
import { atelierDeliveryDispatch } from "../services/atelier-delivery-dispatch.js";
import { atelierOperationDomain } from "../services/atelier-operation-authority.js";
import { assertAtelierOperationAuthority } from "../services/atelier-operation-authority.js";
import { heartbeatRuns } from "@paperclipai/db";
import { assertAtelierIssueExecutionAdmission } from "../services/atelier-workflow-builder.js";

describe("specialist delivery contracts", () => {
  it("has ten tasks, early independent QA, parallel design and parallel cost/render", () => {
    const graph = specialistDeliveryDefinition(5);
    expect(deliveryNodes(graph)).toHaveLength(10);
    expect(deliveryDependencies(graph, "geometry")).toEqual(["floorplan_qa"]);
    expect(deliveryDependencies(graph, "cost")).toEqual(["style", "furniture"]);
    expect(deliveryDependencies(graph, "render")).toEqual(["style", "furniture"]);
    expect(deliveryDependencies(graph, "final_qa")).toEqual(["cost", "render"]);
    expect(affectedDeliveryNodes(graph, "style")).toEqual(expect.arrayContaining(["cost", "render", "final_qa", "delivery"]));
    expect(affectedDeliveryNodes(graph, "style")).not.toContain("furniture");
  });
  it("rejects stale/cross-scene/fabricated evidence", () => {
    expect(() => validateDeliveryOutput({ sceneId: "other", revision: 2 }, "scene", 2)).toThrow(/canonical/);
    expect(() => validateDeliveryOutput({ sceneId: "scene", revision: 1 }, "scene", 2)).toThrow(/canonical/);
    expect(() => validateDeliveryOutput({ sceneId: "scene", revision: 2, summary: "done", decisions: {}, references: [{}] }, "scene", 2)).toThrow(/references/);
    expect(validateDeliveryOutput({ sceneId: "scene", revision: 2, summary: "done", decisions: [], references: [{ uri: "/api/issues/task/documents/brief" }] }, "scene", 2).decisions).toEqual({ entries: [] });
  });
  it("classifies computations and MCP writes independently of HTTP verb", () => {
    expect(atelierOperationDomain("GET", "/api/v1/projects/scene/cost-workflow")).toBe("cost");
    expect(atelierOperationDomain("POST", "/api/v1/mcp/call", { tool_name: "move_node" })).toBe("geometry");
    expect(atelierOperationDomain("POST", "/api/v1/mcp/call", { tool_name: "get_scene" })).toBeNull();
    expect(atelierOperationDomain("PATCH", "/api/v1/projects/scene/surfaces")).toBe("style");
  });
});

describe("specialist delivery persistence", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: Db;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-specialist-delivery-");
    db = createDb(database.connectionString);
  }, 90_000);
  afterAll(async () => { await database?.cleanup(); });

  async function fixture() {
    const companyId = randomUUID();
    const userId = `user-${randomUUID()}`;
    await db.insert(companies).values({ id: companyId, name: "Workflow", issuePrefix: `T${companyId.replaceAll("-", "").toUpperCase()}` });
    await db.insert(companyMemberships).values({ companyId, principalId: userId, principalType: "user", status: "active", membershipRole: "owner" });
    const keys = ["agent_concierge", "agent_floorplan", "agent_qa", "agent_geometry", "agent_style", "agent_furniture", "agent_cost", "agent_render"];
    await db.insert(agents).values(keys.map(key => ({ companyId, name: key, role: "engineer", adapterType: "process", status: "idle", lifecycleState: "ready", metadata: { atelierAgentKey: key } })));
    const [project] = await db.insert(projects).values({ companyId, name: "House 107m²", description: "Verified source brief" }).returning();
    const input = { companyId, projectId: project.id, sceneId: `scene-${randomUUID()}`, responsibleUserId: userId };
    return { input, userId };
  }

  it("provisions exactly once under concurrent intake and persists all task links", async () => {
    const { input } = await fixture();
    const [one, two] = await Promise.all([provisionSpecialistDelivery(db, input), provisionSpecialistDelivery(db, input)]);
    expect(one.run.id).toBe(two.run.id);
    expect(one.stages).toHaveLength(10);
    expect(one.stages.every(stage => stage.issue?.projectId === input.projectId && stage.issue?.parentId === one.rootIssue?.id)).toBe(true);
    expect(one.stages.filter(stage => stage.status === "ready").map(stage => stage.stageKey)).toEqual(["brief"]);
    const wakeup = vi.fn().mockResolvedValue({ status: "queued" });
    const worker = atelierDeliveryDispatch(db, { wakeup });
    await worker.sweep(new AbortController().signal);
    await atelierDeliveryDispatch(db, { wakeup }).sweep(new AbortController().signal);
    expect(wakeup).toHaveBeenCalledTimes(1);
    expect(wakeup.mock.calls[0][1].contextSnapshot.issueId).toBe(one.stages[0].issueId);
    expect(await worker.hasPending()).toBe(false);
  });

  it("validates owner and persisted evidence, advances and deduplicates a handoff", async () => {
    const { input, userId } = await fixture();
    const view = await provisionSpecialistDelivery(db, input);
    const stage = view.stages.find(row => row.stageKey === "brief")!;
    const [document] = await db.insert(documents).values({ companyId: input.companyId, title: "Brief", format: "markdown", latestBody: "Source-verified brief", createdByUserId: userId }).returning();
    await db.insert(issueDocuments).values({ companyId: input.companyId, issueId: stage.issueId!, key: "handoff", documentId: document.id });
    const args = { ...input, runId: view.run.id, nodeId: "brief", agentId: stage.agentId, board: false, idempotencyKey: "brief-output", revision: 1,
      output: { sceneId: input.sceneId, revision: 1, summary: "Brief", decisions: {}, references: [{ uri: `/api/issues/${stage.issueId}/documents/handoff` }] } };
    await expect(completeSpecialistStage(db, { ...args, agentId: randomUUID() })).rejects.toThrow(/assigned specialist/);
    const completed = await completeSpecialistStage(db, args);
    expect(completed.view.stages.find(stage => stage.stageKey === "floorplan")?.status).toBe("ready");
    expect(completed.view.stages.find(stage => stage.stageKey === "geometry")?.status).toBe("pending");
    expect((await completeSpecialistStage(db, args)).duplicate).toBe(true);
    await expect(completeSpecialistStage(db, { ...args, output: { ...args.output, summary: "Changed" } })).rejects.toThrow(/different output/);
  });

  it("enforces Chief and QA operation ownership using the actual run identity", async () => {
    const { input } = await fixture();
    const view = await provisionSpecialistDelivery(db, input);
    const chief = view.stages.find(stage => stage.stageKey === "brief")!;
    const [execution] = await db.insert(heartbeatRuns).values({ companyId: input.companyId, agentId: chief.agentId, issueId: chief.issueId, status: "running", invocationSource: "assignment" }).returning();
    const actor = { type: "agent", agentId: chief.agentId, runId: execution.id };
    await expect(assertAtelierOperationAuthority(db, actor, "PUT", `/api/v1/projects/${input.sceneId}/scene`, { agent_id: "agent_geometry" })).rejects.toThrow(/delegate/);
    await expect(assertAtelierOperationAuthority(db, actor, "GET", `/api/v1/projects/${input.sceneId}/cost-workflow`)).rejects.toThrow(/delegate/);
    await expect(assertAtelierOperationAuthority(db, actor, "GET", `/api/v1/projects/${input.sceneId}`)).resolves.toBeUndefined();
  });

  it("recovers stale routing errors without hiding provider/authentication errors", async () => {
    const { input } = await fixture();
    const view = await provisionSpecialistDelivery(db, input);
    const chief = view.stages.find(stage => stage.stageKey === "brief")!;
    await db.update(agents).set({ status: "error", errorReason: "Agent assignment rejected by Atelier routing policy" }).where(eq(agents.id, chief.agentId));
    await expect(assertAtelierIssueExecutionAdmission(db, chief.issueId!, chief.agentId)).resolves.toBeTruthy();
    expect((await db.select().from(agents).where(eq(agents.id, chief.agentId)))[0].status).toBe("idle");
    await db.update(agents).set({ status: "error", errorReason: "Invalid provider API key" }).where(eq(agents.id, chief.agentId));
    await expect(assertAtelierIssueExecutionAdmission(db, chief.issueId!, chief.agentId)).rejects.toThrow(/routing policy/);
    expect((await db.select().from(agents).where(eq(agents.id, chief.agentId)))[0].errorReason).toBe("Invalid provider API key");
  });

  it("routes QA failure back to Floor Plan and only completes delivery after exact human acceptance", async () => {
    const { input, userId } = await fixture();
    let view = await provisionSpecialistDelivery(db, input);
    let attempt = 0;
    async function submit(nodeId: string, extras: Record<string, unknown> = {}, board = false, approve = false) {
      const stage = view.stages.find(stage => stage.stageKey === nodeId)!;
      const [document] = await db.insert(documents).values({ companyId: input.companyId, title: nodeId, latestBody: "Verified stage output", createdByUserId: userId }).returning();
      const key = `output-${++attempt}`;
      await db.insert(issueDocuments).values({ companyId: input.companyId, issueId: stage.issueId!, key, documentId: document.id });
      const output = { sceneId: input.sceneId, revision: 1, summary: nodeId, decisions: {}, references: [{ uri: `/api/issues/${stage.issueId}/documents/${key}` }], ...extras };
      const result = await completeSpecialistStage(db, { ...input, runId: view.run.id, nodeId, agentId: stage.agentId, board, approve, idempotencyKey: key, revision: 1, output });
      view = result.view;
      return { stage, output };
    }
    await submit("brief");
    await submit("floorplan");
    await submit("floorplan_qa", { verdict: "fail", corrections: [{ nodeId: "floorplan", reason: "Unverified scale" }] });
    expect(view.stages.find(stage => stage.stageKey === "floorplan")?.status).toBe("ready");
    expect(view.stages.find(stage => stage.stageKey === "geometry")?.status).toBe("pending");
    await submit("floorplan");
    await submit("floorplan_qa", { verdict: "pass" });
    await submit("geometry");
    expect(view.stages.filter(stage => stage.status === "ready").map(stage => stage.stageKey).sort()).toEqual(["furniture", "style"]);
    await submit("style");
    expect(view.stages.find(stage => stage.stageKey === "render")?.status).toBe("pending");
    await submit("furniture");
    await submit("cost"); await submit("render");
    await submit("final_qa", { verdict: "pass" });
    const delivery = await submit("delivery");
    expect(view.run.status).toBe("needs_review");
    await expect(completeSpecialistStage(db, { ...input, runId: view.run.id, nodeId: "delivery", agentId: delivery.stage.agentId, board: false, approve: true, idempotencyKey: "agent-approval", revision: 1, output: delivery.output })).rejects.toThrow(/exact delivery/);
    const accepted = await completeSpecialistStage(db, { ...input, runId: view.run.id, nodeId: "delivery", agentId: null, board: true, approve: true, idempotencyKey: "human-approval", revision: 1, output: delivery.output });
    expect(accepted.view.run.status).toBe("done");
    expect(accepted.view.rootIssue?.status).toBe("done");
    const revised = await requestSpecialistRework(db, { companyId: input.companyId, runId: view.run.id, nodeIds: ["style"], reason: "User changed the finish preference", idempotencyKey: "finish-revision" });
    expect(revised.run.status).toBe("running");
    expect(revised.rootIssue?.status).toBe("backlog");
    expect(revised.stages.find(stage => stage.stageKey === "style")?.status).toBe("ready");
    expect(revised.stages.find(stage => stage.stageKey === "furniture")?.status).toBe("done");
    expect(revised.stages.find(stage => stage.stageKey === "render")?.outputReferences).toEqual([]);
    expect((await requestSpecialistRework(db, { companyId: input.companyId, runId: view.run.id, nodeIds: ["style"], reason: "User changed the finish preference", idempotencyKey: "finish-revision" })).stages).toHaveLength(10);
  });
});
