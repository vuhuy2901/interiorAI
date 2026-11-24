import { and, eq } from "drizzle-orm";
import { agents, heartbeatRuns, issues, atelierWorkflowRuns, atelierWorkflowStageExecutions, type Db } from "@paperclipai/db";
import { forbidden } from "../errors.js";
import { readDeliverySnapshot } from "./atelier-specialist-delivery.js";

export function atelierOperationDomain(method: string, path: string, body: Record<string, any> = {}): string | null {
  const route = path.split("?")[0];
  if (/\/mcp\/call$/.test(route)) {
    const tool = String(body.tool_name ?? "");
    if (/^(get_|list_|inspect_|validate_|export_)/.test(tool)) return null;
    return "geometry";
  }
  if (/\/atelier\/scene$/.test(route)) {
    const op = String(body.operation ?? body.op ?? "").replace(/^scene\./, "");
    if (["read", "validate"].includes(op)) return null;
    return op === "cost" ? "cost" : "furniture";
  }
  if (/\/(cost-workflow|estimates)(\/|$)/.test(route) || /\/(cost|recalculate|estimate)$/.test(route)) return "cost";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  if (/\/projects\/[^/]+\/(confirm-scale|floorplan|house-plan)(\/|$)/.test(route)) return "floorplan";
  if (/\/chat\/messages$|\/workflows\/.+\/runs$/.test(route)) return "workflow";
  if (/\/projects\/[^/]+\/(brief|design-brief)$/.test(route)) return "brief";
  if (/\/projects\/[^/]+\/(surface|surfaces|finish|finishes|materials|style)(\/|$)/.test(route)) return "style";
  if (/\/projects\/[^/]+\/furniture(\/|$)/.test(route)) return "furniture";
  if (/\/projects\/[^/]+\/(render|renders|render-jobs|scene-bridge|camera|lighting)(\/|$)/.test(route)) return "render";
  if (/\/projects\/[^/]+(\/|$)/.test(route)) return "geometry";
  if (/\/floorplan|\/floor-plan|\/scale/.test(route)) return "floorplan";
  return "administration";
}

export async function assertAtelierOperationAuthority(db: Db, actor: {
  type: string; agentId?: string | null; runId?: string | null;
}, method: string, route: string, body: Record<string, any> = {}) {
  const domain = atelierOperationDomain(method, route, body);
  if (!domain || actor.type === "board") return;
  if (!actor.agentId || !actor.runId) throw forbidden("A task-linked authenticated run is required for Atelier operations");
  const [agent] = await db.select().from(agents).where(eq(agents.id, actor.agentId));
  const [execution] = await db.select().from(heartbeatRuns).where(and(eq(heartbeatRuns.id, actor.runId), eq(heartbeatRuns.agentId, actor.agentId), eq(heartbeatRuns.status, "running")));
  if (!agent || !execution?.issueId) throw forbidden("No active task-linked Atelier run");
  const agentKey = (agent.metadata as Record<string, unknown> | null)?.atelierAgentKey;
  const allowed: Record<string, string[]> = {
    agent_concierge: ["brief"], agent_floorplan: ["floorplan"], agent_geometry: ["geometry"],
    agent_style: ["style"], agent_furniture: ["furniture"], agent_render: ["render"], agent_cost: ["cost"], agent_qa: [],
  };
  if (!allowed[String(agentKey)]?.includes(domain)) throw forbidden(`Agent cannot execute ${domain}; delegate to the assigned specialist`, { code: "atelier_specialist_required" });
  const [task] = await db.select().from(issues).where(and(eq(issues.id, execution.issueId), eq(issues.companyId, agent.companyId)));
  const policy = (task?.executionPolicy as any)?.atelierWorkflow;
  if (!policy) throw forbidden("Specialist writes require a workflow stage binding");
  const [run] = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, policy.workflowRunId), eq(atelierWorkflowRuns.companyId, agent.companyId)));
  const snapshot = run && readDeliverySnapshot(run.decisionLedger);
  const [stage] = await db.select().from(atelierWorkflowStageExecutions).where(and(eq(atelierWorkflowStageExecutions.workflowRunId, policy.workflowRunId), eq(atelierWorkflowStageExecutions.issueId, task!.id), eq(atelierWorkflowStageExecutions.agentId, actor.agentId)));
  if (!stage || !["ready", "running"].includes(stage.status)) throw forbidden("Assigned workflow stage is not writable");
  if (snapshot) {
    const sceneId = route.match(/\/(?:projects|estimates)\/([^/?]+)/)?.[1] ?? body.project_id ?? body.projectId;
    if (sceneId !== snapshot.sceneId) throw forbidden("Operation does not target the assigned canonical scene");
  }
}
