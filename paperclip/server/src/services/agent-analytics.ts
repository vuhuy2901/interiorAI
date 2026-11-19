import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues, projects } from "@paperclipai/db";
import type {
  AgentAnalyticsReport,
  AgentPerformanceRankingItem,
  AgentRuntimeMetric,
  ExecutionDistribution,
  AgentUsageTrendPoint,
  LongestRunItem,
} from "@paperclipai/shared";
import { retryIdempotentDatabaseOperation } from "../database-retry.js";

export interface AgentAnalyticsFilterQuery {
  range?: string; // '24h' | '7d' | '30d' | '90d' | 'all' | 'custom'
  agentId?: string;
  projectId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

function resolveDateRange(range = "30d", customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const end = customEnd ? new Date(customEnd) : new Date();
  if (range === "custom" && customStart) {
    return { start: new Date(customStart), end };
  }

  const start = new Date(end);
  switch (range) {
    case "24h":
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      start.setTime(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      start.setTime(new Date("2020-01-01T00:00:00Z").getTime());
      break;
    case "30d":
    default:
      start.setTime(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  return { start, end };
}

export function agentAnalyticsService(db: Db) {
  return {
    getReport: async (companyId: string, filter: AgentAnalyticsFilterQuery = {}): Promise<AgentAnalyticsReport> => {
      const { start, end } = resolveDateRange(filter.range, filter.startDate, filter.endDate);

      // 1. Fetch all company agents for baseline identity
      const agentRows = await retryIdempotentDatabaseOperation(() =>
        db
          .select({
            id: agents.id,
            name: agents.name,
            appearance: agents.appearance,
            adapterType: agents.adapterType,
          })
          .from(agents)
          .where(eq(agents.companyId, companyId)),
      );

      const agentMap = new Map(agentRows.map((a) => [a.id, a]));

      // 2. Fetch completed tasks (issues) for this company, grouped by assignee
      const completedTaskConditions = [
        eq(issues.companyId, companyId),
        eq(issues.status, "done"),
      ];
      if (filter.projectId) {
        completedTaskConditions.push(eq(issues.projectId, filter.projectId));
      }
      if (filter.agentId) {
        completedTaskConditions.push(eq(issues.assigneeAgentId, filter.agentId));
      }

      const completedTaskRows = await retryIdempotentDatabaseOperation(() =>
        db
          .select({
            assigneeAgentId: issues.assigneeAgentId,
            count: sql<number>`count(distinct ${issues.id})::int`,
          })
          .from(issues)
          .where(and(...completedTaskConditions))
          .groupBy(issues.assigneeAgentId),
      );

      const completedTasksByAgent = new Map<string, number>();
      for (const row of completedTaskRows) {
        if (row.assigneeAgentId) {
          completedTasksByAgent.set(row.assigneeAgentId, Number(row.count ?? 0));
        }
      }

      // 3. Query heartbeat runs matching company and date/filters
      // Join issues and projects to capture task title and project name
      const runQuery = db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          createdAt: heartbeatRuns.createdAt,
          retryOfRunId: heartbeatRuns.retryOfRunId,
          issueId: heartbeatRuns.issueId,
          taskTitle: issues.title,
          taskIdentifier: issues.identifier,
          projectId: issues.projectId,
          projectName: projects.name,
        })
        .from(heartbeatRuns)
        .leftJoin(issues, eq(heartbeatRuns.issueId, issues.id))
        .leftJoin(projects, eq(issues.projectId, projects.id));

      const runConditions = [
        eq(heartbeatRuns.companyId, companyId),
        gte(heartbeatRuns.createdAt, start),
        lte(heartbeatRuns.createdAt, end),
      ];

      if (filter.agentId) {
        runConditions.push(eq(heartbeatRuns.agentId, filter.agentId));
      }
      if (filter.status) {
        runConditions.push(eq(heartbeatRuns.status, filter.status));
      }
      if (filter.projectId) {
        runConditions.push(eq(issues.projectId, filter.projectId));
      }

      const runs = await retryIdempotentDatabaseOperation(() =>
        runQuery.where(and(...runConditions)).orderBy(desc(heartbeatRuns.createdAt)),
      );

      // 4. Compute metrics per agent and totals
      interface AgentAccumulator {
        agentId: string;
        agentName: string;
        appearance?: Record<string, unknown> | null;
        adapterType?: string;
        totalRuns: number;
        totalRuntimeSeconds: number;
        maxRuntimeSeconds: number;
        succeeded: number;
        failed: number;
        recovered: number;
        cancelled: number;
      }

      const agentStats = new Map<string, AgentAccumulator>();
      // Initialize with known agents if no specific agent filter
      if (!filter.agentId) {
        for (const agent of agentRows) {
          agentStats.set(agent.id, {
            agentId: agent.id,
            agentName: agent.name,
            appearance: agent.appearance,
            adapterType: agent.adapterType,
            totalRuns: 0,
            totalRuntimeSeconds: 0,
            maxRuntimeSeconds: 0,
            succeeded: 0,
            failed: 0,
            recovered: 0,
            cancelled: 0,
          });
        }
      }

      const execDist: ExecutionDistribution = {
        successful: 0,
        failed: 0,
        recovered: 0,
        cancelled: 0,
        total: 0,
      };

      const usageByDate = new Map<string, { total: number; byAgent: Record<string, number> }>();
      const longestCandidates: LongestRunItem[] = [];

      for (const run of runs) {
        const agentMeta = agentMap.get(run.agentId);
        const agentName = agentMeta?.name ?? `Agent ${run.agentId.slice(0, 6)}`;

        let acc = agentStats.get(run.agentId);
        if (!acc) {
          acc = {
            agentId: run.agentId,
            agentName,
            appearance: agentMeta?.appearance,
            adapterType: agentMeta?.adapterType,
            totalRuns: 0,
            totalRuntimeSeconds: 0,
            maxRuntimeSeconds: 0,
            succeeded: 0,
            failed: 0,
            recovered: 0,
            cancelled: 0,
          };
          agentStats.set(run.agentId, acc);
        }

        // Calculate runtime
        let runtimeSeconds = 0;
        if (run.startedAt) {
          const startTime = new Date(run.startedAt).getTime();
          const finishTime = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
          runtimeSeconds = Math.max(0, Math.round((finishTime - startTime) / 1000));
        } else if (run.finishedAt && run.createdAt) {
          runtimeSeconds = Math.max(
            0,
            Math.round((new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()) / 1000),
          );
        }

        acc.totalRuns += 1;
        acc.totalRuntimeSeconds += runtimeSeconds;
        if (runtimeSeconds > acc.maxRuntimeSeconds) {
          acc.maxRuntimeSeconds = runtimeSeconds;
        }

        execDist.total += 1;
        const st = run.status.toLowerCase();
        if (st === "succeeded") {
          acc.succeeded += 1;
          execDist.successful += 1;
        } else if (st === "failed" || st === "timed_out") {
          acc.failed += 1;
          execDist.failed += 1;
        } else if (st === "interrupted" || run.retryOfRunId) {
          acc.recovered += 1;
          execDist.recovered += 1;
        } else if (st === "cancelled") {
          acc.cancelled += 1;
          execDist.cancelled += 1;
        } else {
          // queued, running, etc.
        }

        // Date grouping for usage trends
        const dateKey = new Date(run.createdAt).toISOString().slice(0, 10);
        let dayBucket = usageByDate.get(dateKey);
        if (!dayBucket) {
          dayBucket = { total: 0, byAgent: {} };
          usageByDate.set(dateKey, dayBucket);
        }
        dayBucket.total += 1;
        dayBucket.byAgent[run.agentId] = (dayBucket.byAgent[run.agentId] ?? 0) + 1;

        // Longest run candidate
        longestCandidates.push({
          runId: run.id,
          agentId: run.agentId,
          agentName,
          taskTitle: run.taskTitle ?? "Lệnh thực thi độc lập",
          taskIdentifier: run.taskIdentifier ?? null,
          taskId: run.issueId ?? null,
          projectName: run.projectName ?? "Mặc định",
          runtimeSeconds,
          status: run.status,
          startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : new Date(run.createdAt).toISOString(),
          finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
        });
      }

      // Build ranking items
      const ranking: AgentPerformanceRankingItem[] = [];
      const runtimeStats: AgentRuntimeMetric[] = [];

      for (const acc of agentStats.values()) {
        const completedTasks = completedTasksByAgent.get(acc.agentId) ?? 0;
        const avgRuntimeSeconds = acc.totalRuns > 0 ? Math.round(acc.totalRuntimeSeconds / acc.totalRuns) : 0;
        const successRate = acc.totalRuns > 0 ? Number(((acc.succeeded / acc.totalRuns) * 100).toFixed(1)) : 100;

        ranking.push({
          agentId: acc.agentId,
          agentName: acc.agentName,
          agentAppearance: acc.appearance,
          adapterType: acc.adapterType,
          totalRuns: acc.totalRuns,
          totalRuntimeSeconds: acc.totalRuntimeSeconds,
          avgRuntimeSeconds,
          successRate,
          failedRuns: acc.failed,
          completedTasks,
        });

        runtimeStats.push({
          agentId: acc.agentId,
          agentName: acc.agentName,
          totalRuntimeSeconds: acc.totalRuntimeSeconds,
          avgRuntimeSeconds,
          maxRuntimeSeconds: acc.maxRuntimeSeconds,
          runCount: acc.totalRuns,
        });
      }

      // Default ranking sort: most runs desc
      ranking.sort((a, b) => b.totalRuns - a.totalRuns);
      runtimeStats.sort((a, b) => b.totalRuntimeSeconds - a.totalRuntimeSeconds);

      // Usage trends sorted chronologically
      const usageTrends: AgentUsageTrendPoint[] = Array.from(usageByDate.entries())
        .map(([date, data]) => ({
          date,
          total: data.total,
          byAgent: data.byAgent,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top longest runs: sort by runtimeSeconds desc, top 10
      longestCandidates.sort((a, b) => b.runtimeSeconds - a.runtimeSeconds);
      const longestRuns = longestCandidates.slice(0, 10);

      return {
        companyId,
        timeRange: filter.range ?? "30d",
        ranking,
        runtimeStats,
        executionDistribution: execDist,
        usageTrends,
        longestRuns,
      };
    },
  };
}
