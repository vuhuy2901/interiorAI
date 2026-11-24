/** Additive recovery for the exact source + workflow damaged by the singleton purge. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { and, eq, sql } from "drizzle-orm";
import { activityLog, atelierWorkflowEvents, atelierWorkflowRuns, atelierWorkflowStageExecutions, companies, createDb, issues, projects } from "@paperclipai/db";
import { readDeliverySnapshot } from "../src/services/atelier-specialist-delivery.js";
import { deliveryDependencies, deliveryNodes } from "../src/services/atelier-delivery-contract.js";
import { issueService } from "../src/services/issues.js";

const apply = process.argv.includes("--apply");
const companyId = "0873a79a-62ba-4bc3-9f2d-9277b4b6c6ed";
const runId = "512eb2a5-eca4-41ef-bcbc-491637f4e299";
const sourceId = "5294a477-565b-44c6-879d-40408a3d0202";
const backup = "C:/Users/DELL/.paperclip/instances/default/data/backups/paperclip-20261119-005335.sql.gz";
const metadata = JSON.parse(execFileSync("C:/QLDAPM-final/interiorAI/.venv/Scripts/python.exe", ["C:/QLDAPM-final/interiorAI/scripts/recover-feature133-sqlite.py", ...(apply ? ["--apply"] : [])], { encoding: "utf8" }));
const statements = gunzipSync(readFileSync(backup)).toString("utf8")
  .split("-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900")
  .flatMap(block => { const index = block.indexOf('INSERT INTO "public".'); return index < 0 ? [] : [block.slice(index).trim()]; });
const sourceRows = statements.filter(line => line.startsWith('INSERT INTO "public"."issues"') && line.includes(sourceId));
if (sourceRows.length !== 1) throw new Error("Exact source issue backup is required; no PostgreSQL changes made");
const db = createDb(process.env.DATABASE_URL ?? "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip");
const [run] = await db.select().from(atelierWorkflowRuns).where(and(eq(atelierWorkflowRuns.companyId, companyId), eq(atelierWorkflowRuns.id, runId)));
if (!run || run.projectId !== metadata.native.native_project_id || !run.rootIssueId) throw new Error("Recovery receipt does not match the exact project");
const snapshot = readDeliverySnapshot(run.decisionLedger);
if (!snapshot || !metadata.scene_ids.includes(snapshot.sceneId)) throw new Error("Canonical scene receipt mismatch");
const stages = await db.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.workflowRunId, run.id));
const audits = await db.select().from(activityLog).where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "issue.created")));
const auditById = new Map(audits.map(event => [event.entityId, event]));
for (const stage of stages) if (!stage.issueId || !auditById.get(stage.issueId)?.details?.identifier) throw new Error(`Exact task identity receipt is missing: ${stage.stageKey}`);
const ids = stages.map(stage => Number(String(auditById.get(stage.issueId!)!.details!.identifier).split("-").at(-1)));
console.log(JSON.stringify({ apply, sourceIssue: "ATL-139", projectId: run.projectId, runId, stageCount: stages.length, sqliteRows: metadata.inserted }));
async function restoreConversation(tx: typeof db) {
  if (!metadata.native.conversation_issue_id) return;
  await tx.insert(issues).values({ id: metadata.native.conversation_issue_id, companyId, projectId: run.projectId,
    title: `Intake — ${metadata.native.project_name}`, description: metadata.native.brief, status: "in_review",
    conversationAgentId: snapshot!.agentBindings.brief, conversationUserId: `atelier-project:local-board:${run.projectId}`,
    conversationState: "waiting", assigneeAgentId: snapshot!.agentBindings.brief, responsibleUserId: "local-board",
    createdByUserId: "local-board", issueNumber: Math.min(...ids) - 2, identifier: `ATL-${Math.min(...ids) - 2}`,
  }).onConflictDoNothing();
}
if (apply && process.argv.includes("--conversation-only")) {
  await restoreConversation(db);
  console.log("Restored the missing intake conversation only.");
  process.exit(0);
}
if (apply) await db.transaction(async raw => {
  const tx = raw as unknown as typeof db;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`atelier-workflow:${companyId}:${run.projectId}`},0))`);
  for (const line of sourceRows) await tx.execute(sql.raw(line.replace(/;$/, " ON CONFLICT (id) DO NOTHING;")));
  // Restore only records belonging to the original source; no whole-database restore.
  for (const table of ["heartbeat_runs", "issue_comments", "issue_attachments", "issue_documents", "issue_read_states", "issue_thread_interactions"]) {
    for (const line of statements.filter(line => line.startsWith(`INSERT INTO "public"."${table}"`) && line.includes(sourceId))) {
      await tx.execute(sql.raw(line.replace(/;$/, " ON CONFLICT DO NOTHING;")));
    }
  }
  await tx.insert(projects).values({ id: run.projectId, companyId, name: metadata.native.project_name, description: metadata.native.brief, status: "backlog", leadAgentId: snapshot.agentBindings.brief, privacyOwnerUserId: "local-board", createdAt: run.createdAt }).onConflictDoNothing();
  await tx.insert(issues).values({ id: run.rootIssueId!, companyId, projectId: run.projectId, title: `[ATELIER WORKFLOW] ${metadata.native.project_name}`, description: `${metadata.native.brief}\n\nSource: ATL-139 (preserved original)`, status: "backlog", assigneeAgentId: snapshot.agentBindings.brief, responsibleUserId: "local-board", createdByUserId: "local-board", issueNumber: Math.min(...ids) - 1, identifier: `ATL-${Math.min(...ids) - 1}`, createdAt: run.createdAt, executionPolicy: { atelierDeliveryRoot: { workflowRunId: run.id } } }).onConflictDoNothing();
  await restoreConversation(tx);
  for (const stage of stages) {
    const node = deliveryNodes(snapshot.definition).find(node => node.id === stage.stageKey)!;
    const dependencies = deliveryDependencies(snapshot.definition, stage.stageKey);
    const ready = dependencies.length === 0;
    await tx.insert(issues).values({ id: stage.issueId!, companyId, projectId: run.projectId, parentId: run.rootIssueId, title: `[ATELIER • ${node.id}] ${node.name}`, description: `${metadata.native.brief}\n\nWorkflow ${run.id}; node ${node.id}; canonical scene ${snapshot.sceneId}. Read GET /api/atelier/workflow/runs/${run.id} and source task /api/issues/${sourceId}. Use authenticated requests and current scene revision. Save a task document then POST /api/atelier/workflow/runs/${run.id}/stages/${node.id}/complete with idempotencyKey and output {sceneId,revision,summary,decisions:{},references:[{uri:"/api/issues/${stage.issueId}/documents/handoff"}]}. Backend owns downstream dispatch.`, status: ready ? "todo" : "backlog", assigneeAgentId: stage.agentId, responsibleUserId: "local-board", createdByUserId: "local-board", identifier: String(auditById.get(stage.issueId!)!.details!.identifier), issueNumber: Number(String(auditById.get(stage.issueId!)!.details!.identifier).split("-").at(-1)), createdAt: stage.createdAt, executionPolicy: { atelierWorkflow: { workflowRunId: run.id, workflowVersion: run.workflowVersion, nodeId: node.id, node } } }).onConflictDoNothing();
    await tx.update(atelierWorkflowStageExecutions).set({ status: ready ? "ready" : "pending", outputReferences: [], decisionLedger: {}, completedAt: null, blockerReason: ready ? null : `Waiting for ${dependencies.join(", ")}`, updatedAt: new Date() }).where(eq(atelierWorkflowStageExecutions.id, stage.id));
    if (ready) await tx.insert(atelierWorkflowEvents).values({ companyId, projectId: run.projectId, workflowRunId: run.id, stageExecutionId: stage.id, eventType: "dispatch_pending", idempotencyKey: `recovered:${run.id}:${stage.id}:singleton-purge`, targetAgentId: stage.agentId, payload: { issueId: stage.issueId, reason: "additive_backup_recovery" } }).onConflictDoNothing();
  }
  for (const stage of stages) await issueService(tx).update(stage.issueId!, { companyGuard: companyId, blockedByIssueIds: deliveryDependencies(snapshot.definition, stage.stageKey).map(key => stages.find(row => row.stageKey === key)!.issueId!) });
  await tx.update(companies).set({ issueCounter: sql`greatest(${companies.issueCounter}, ${Math.max(...ids) + 1})` }).where(eq(companies.id, companyId));
  await tx.insert(activityLog).values({ companyId, actorType: "system", actorId: "atelier-scoped-recovery", action: "atelier.workflow_recovered", entityType: "project", entityId: run.projectId, details: { runId, sourceId, backup: backup.split("/").at(-1), mode: "insert_missing_only" } });
});
console.log(apply ? "Recovered the exact source/project/task IDs; retained all other data." : "Inspection only. Pass --apply for additive recovery.");
process.exit(0);
