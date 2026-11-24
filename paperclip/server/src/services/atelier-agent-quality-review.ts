import { and, asc, eq } from "drizzle-orm";
import {
  type Db,
  agents,
  atelierWorkflowEvents,
  atelierWorkflowRuns,
  atelierWorkflowStageExecutions,
  companySkills,
  issues,
} from "@paperclipai/db";

const stageTerms: Record<string, string[]> = {
  brief: ["brief", "decision", "requirements", "interior", "project"],
  floorplan: ["floor", "plan", "cad", "spatial", "dimension"],
  floorplan_qa: ["qa", "review", "floor", "spatial", "validation"],
  geometry: ["bim", "geometry", "3d", "scene", "blender"],
  style: ["material", "style", "texture", "interior", "render"],
  furniture: ["furniture", "layout", "interior", "collision", "catalog"],
  cost: ["cost", "bom", "boq", "pricing", "procurement"],
  render: ["render", "blender", "visualization", "camera", "lighting"],
  final_qa: ["qa", "review", "testing", "validation", "audit"],
  delivery: ["delivery", "project", "review", "documentation", "handoff"],
};

function skillScore(skill: { name: string; description: string | null; categories: string[]; key: string }, terms: string[]) {
  const haystack = `${skill.key} ${skill.name} ${skill.description ?? ""} ${skill.categories.join(" ")}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export async function buildAtelierAgentQualityReview(db: Db, companyId: string, runId: string) {
  const [run] = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.id, runId), eq(atelierWorkflowRuns.companyId, companyId)));
  if (!run) return null;
  const stages = await db.select().from(atelierWorkflowStageExecutions)
    .where(eq(atelierWorkflowStageExecutions.workflowRunId, runId)).orderBy(asc(atelierWorkflowStageExecutions.createdAt));
  const events = await db.select().from(atelierWorkflowEvents)
    .where(eq(atelierWorkflowEvents.workflowRunId, runId)).orderBy(asc(atelierWorkflowEvents.createdAt));
  const historicalStages = await db.select().from(atelierWorkflowStageExecutions)
    .where(eq(atelierWorkflowStageExecutions.companyId, companyId));
  const historicalEvents = await db.select().from(atelierWorkflowEvents)
    .where(eq(atelierWorkflowEvents.companyId, companyId));
  const owners = await db.select().from(agents).where(eq(agents.companyId, companyId));
  const tasks = await db.select().from(issues).where(eq(issues.projectId, run.projectId));
  const skills = await db.select({ id: companySkills.id, key: companySkills.key, name: companySkills.name,
    description: companySkills.description, categories: companySkills.categories }).from(companySkills).where(eq(companySkills.companyId, companyId));

  const historicalBugSignals = new Map<string, Set<string>>();
  const registerHistoricalBug = (workflowRunId: string, stageKey: string) => {
    const stage = historicalStages.find(candidate => candidate.workflowRunId === workflowRunId && candidate.stageKey === stageKey);
    if (stage) {
      const affectedStages = historicalBugSignals.get(stage.agentId) ?? new Set<string>();
      affectedStages.add(stage.id);
      historicalBugSignals.set(stage.agentId, affectedStages);
    }
  };
  for (const event of historicalEvents) {
    if (event.eventType === "rework_requested" && Array.isArray((event.payload as any)?.nodeIds)) {
      for (const nodeId of (event.payload as any).nodeIds) registerHistoricalBug(event.workflowRunId, nodeId);
    }
    if (event.eventType === "qa_correction_requested" && Array.isArray((event.payload as any)?.output?.corrections)) {
      for (const correction of (event.payload as any).output.corrections) {
        if (typeof correction?.nodeId === "string") registerHistoricalBug(event.workflowRunId, correction.nodeId);
      }
    }
  }

  const reviews = stages.map(stage => {
    const owner = owners.find(agent => agent.id === stage.agentId);
    const task = tasks.find(issue => issue.id === stage.issueId);
    const output = (stage.decisionLedger as any)?.output ?? {};
    const references = Array.isArray(output.references) ? output.references : stage.outputReferences;
    const targetedReworks = events.filter(event => event.eventType === "rework_requested" &&
      Array.isArray((event.payload as any)?.nodeIds) && (event.payload as any).nodeIds.includes(stage.stageKey));
    const qaCorrections = events.filter(event => event.eventType === "qa_correction_requested" &&
      Array.isArray((event.payload as any)?.output?.corrections) &&
      (event.payload as any).output.corrections.some((correction: any) => correction?.nodeId === stage.stageKey));
    const bugCount = targetedReworks.length + qaCorrections.length + (["failed", "blocked"].includes(stage.status) ? 1 : 0);
    const historicalRuns = historicalStages.filter(candidate => candidate.agentId === stage.agentId).length;
    const historicalBugs = historicalBugSignals.get(stage.agentId)?.size ?? 0;
    const historicalBugRate = historicalRuns ? historicalBugs / historicalRuns : 0;
    const evidenceComplete = references.length > 0 && typeof output.summary === "string" && output.summary.trim().length > 0;
    const completed = stage.status === "done";
    const reliabilityPenalty = Math.min(15, Math.round(historicalBugRate * 30));
    const score = Math.max(0, Math.min(100, 45 + (completed ? 30 : 0) + (evidenceComplete ? 15 : 0) +
      (output.sceneId && Number.isInteger(output.revision) ? 10 : 0) - bugCount * 18 - reliabilityPenalty));
    const strengths = [
      ...(completed ? ["Hoàn thành stage và bàn giao đúng dependency."] : []),
      ...(evidenceComplete ? ["Có tài liệu bằng chứng và tóm tắt đầu ra truy vết được."] : []),
      ...(output.sceneId && Number.isInteger(output.revision) ? ["Đầu ra gắn với canonical scene/revision cụ thể."] : []),
      ...(bugCount === 0 ? ["Không ghi nhận rework hoặc QA correction trong run này."] : []),
    ];
    const weaknesses = [
      ...(!completed ? [`Stage kết thúc ở trạng thái ${stage.status}.`] : []),
      ...(!evidenceComplete ? ["Bằng chứng hoặc summary chưa đầy đủ theo contract."] : []),
      ...(targetedReworks.length ? [`Bị mở lại ${targetedReworks.length} lần qua yêu cầu rework.`] : []),
      ...(qaCorrections.length ? [`Bị QA trả về ${qaCorrections.length} lần.`] : []),
      ...(stage.blockerReason ? [`Blocker gần nhất: ${stage.blockerReason}`] : []),
    ];
    const terms = [...(stageTerms[stage.stageKey] ?? []), ...(bugCount ? ["debug", "testing", "recovery"] : [])];
    const suggestedSkills = skills.map(skill => ({ ...skill, score: skillScore(skill, terms) }))
      .filter(skill => skill.score > 0).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)).slice(0, 5)
      .map(({ score: _score, ...skill }) => ({ ...skill, reason: bugCount
        ? "Tăng kiểm tra, phục hồi lỗi và độ ổn định cho stage này."
        : `Bổ sung năng lực chuyên môn cho stage ${stage.stageKey}.` }));
    return { stageKey: stage.stageKey, agentId: stage.agentId, agentName: owner?.name ?? "Unknown agent",
      issueId: stage.issueId, issueIdentifier: task?.identifier ?? null, score, bugCount,
      historicalBugs, historicalRuns, historicalBugRate: Number(historicalBugRate.toFixed(3)),
      bugRisk: bugCount >= 2 || historicalBugRate >= 0.3 ? "high" : bugCount === 1 || historicalBugRate >= 0.1 ? "medium" : "low",
      strengths, weaknesses: weaknesses.length ? weaknesses : ["Chưa thấy điểm yếu nổi bật trong bằng chứng của run này."], suggestedSkills };
  });
  const averageScore = reviews.length ? Math.round(reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length) : 0;
  return { reviewer: { key: "agent_quality_reviewer", name: "Agent Quality Reviewer" }, runId, runStatus: run.status,
    generatedAt: new Date().toISOString(), summary: { averageScore, reviewedAgents: new Set(reviews.map(review => review.agentId)).size,
      reviewedStages: reviews.length, totalBugSignals: reviews.reduce((sum, review) => sum + review.bugCount, 0) }, reviews };
}
