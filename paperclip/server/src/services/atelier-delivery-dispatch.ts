import { and, eq, sql } from "drizzle-orm";
import { atelierWorkflowEvents, atelierWorkflowRuns, atelierWorkflowStageExecutions, issues, type Db } from "@paperclipai/db";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import { specialistWorkflowEnabled } from "./atelier-delivery-contract.js";

export function atelierDeliveryDispatch(db: Db, heartbeat: IssueAssignmentWakeupDeps) {
  const pending = () => db.select().from(atelierWorkflowEvents).where(eq(atelierWorkflowEvents.eventType, "dispatch_pending"));
  return {
    async hasPending() { return specialistWorkflowEnabled() && (await pending()).length > 0; },
    async sweep(signal: AbortSignal) {
      if (!specialistWorkflowEnabled()) return;
      for (const event of await pending()) {
        if (signal.aborted) return;
        const [stage] = await db.select().from(atelierWorkflowStageExecutions).where(eq(atelierWorkflowStageExecutions.id, event.stageExecutionId!));
        const [run] = await db.select().from(atelierWorkflowRuns).where(eq(atelierWorkflowRuns.id, event.workflowRunId));
        const [task] = stage?.issueId ? await db.select().from(issues).where(eq(issues.id, stage.issueId)) : [];
        if (run?.status !== "done" && stage?.status === "ready" && task?.status === "todo") {
          // Wake admission is durable and idempotent. A crash after admission but
          // before this acknowledgement replays the same wake receipt.
          await heartbeat.wakeup(stage.agentId, {
            source: "assignment", triggerDetail: "system", reason: "issue_assigned",
            idempotencyKey: event.idempotencyKey, requestedByActorType: "system", requestedByActorId: "atelier-workflow",
            payload: { issueId: task.id, stageKey: stage.stageKey },
            contextSnapshot: { issueId: task.id, taskId: task.id, source: "atelier.specialist.delivery" },
          });
        }
        await db.update(atelierWorkflowEvents).set({ eventType: "dispatch_admitted" }).where(and(eq(atelierWorkflowEvents.id, event.id), eq(atelierWorkflowEvents.eventType, "dispatch_pending")));
      }
    },
  };
}
