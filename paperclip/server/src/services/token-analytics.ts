import type { Db } from '@paperclipai/db';
import { costEvents, agents } from '@paperclipai/db';
import { and, eq, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { ordinaryInputTokens } from './costs.js';

export interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalRuns: number;
  activeAgents: number;
  recordedCost?: { cents: number; status: string };
  isSubscription?: boolean;
}

export interface AgentTokenUsage {
  agentId: string;
  agentName: string;
  model: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  runs: number;
  avgTokensPerRun: number;
  cost?: { cents: number; status: string };
  isSubscription?: boolean;
  lastActive: Date;
}

export interface TokenTimeseries {
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface ModelTokenUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  runs: number;
  isSubscription?: boolean;
}

export interface ProjectTokenUsage {
  projectId?: string;
  projectName: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

export interface AgentRunHistory {
  runId: string;
  startTime: Date;
  endTime: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  duration: number;
  status: string;
  taskId?: string;
  projectId?: string;
}

/** Returns true when every cost event in the aggregation is subscription-billed (cost = 0 is intentional, not missing). */
const isSubscriptionBilling = sql<boolean>`BOOL_AND(${costEvents.billingType} IN ('subscription_included', 'subscription_overage'))`;

export async function getCompanyTokenSummary(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<TokenSummary> {
  const result = await db
    .select({
      // ordinaryInputTokens handles legacy Codex rows (input included cache) vs new rows (input = net)
      totalInput: sql<number>`COALESCE(SUM(${ordinaryInputTokens}), 0)`,
      totalCached: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      runCount: sql<number>`COUNT(DISTINCT ${costEvents.id})`,
      agentCount: sql<number>`COUNT(DISTINCT ${costEvents.agentId})`,
      totalCost: sql<string>`COALESCE(SUM(${costEvents.costCents}), '0')`,
      allSubscription: isSubscriptionBilling,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    );

  const row = result[0];
  const inputTokens = Number(row?.totalInput) || 0;
  const cachedTokens = Number(row?.totalCached) || 0;
  const outputTokens = Number(row?.totalOutput) || 0;
  const totalTokens = inputTokens + cachedTokens + outputTokens;
  const isSubscription = Boolean(row?.allSubscription);

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cachedTokens,
    totalRuns: Number(row?.runCount) || 0,
    activeAgents: Number(row?.agentCount) || 0,
    recordedCost: !isSubscription && row?.totalCost
      ? { cents: Math.round(parseFloat(row.totalCost) * 100), status: 'reported' }
      : undefined,
    isSubscription,
  };
}

export async function getAgentTokenUsage(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<AgentTokenUsage[]> {
  const results = await db
    .select({
      agentId: costEvents.agentId,
      agentName: agents.name,
      model: costEvents.model,
      inputTokens: sql<number>`COALESCE(SUM(${ordinaryInputTokens}), 0)`,
      cachedTokens: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      runCount: sql<number>`COUNT(*)`,
      lastActive: sql<Date>`MAX(${costEvents.occurredAt})`,
      totalCost: sql<string>`COALESCE(SUM(${costEvents.costCents}), '0')`,
      allSubscription: isSubscriptionBilling,
    })
    .from(costEvents)
    .leftJoin(agents, eq(agents.id, costEvents.agentId))
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .groupBy(costEvents.agentId, costEvents.model, agents.name)
    .orderBy(desc(sql`COALESCE(SUM(${ordinaryInputTokens}), 0) + COALESCE(SUM(${costEvents.cachedInputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0)`));

  return results.map(r => {
    const input = Number(r.inputTokens) || 0;
    const cached = Number(r.cachedTokens) || 0;
    const output = Number(r.outputTokens) || 0;
    const total = input + cached + output;
    const runs = Number(r.runCount) || 0;
    const isSubscription = Boolean(r.allSubscription);
    return {
      agentId: r.agentId || 'unknown',
      agentName: r.agentName || r.agentId?.slice(0, 8) || 'Unknown Agent',
      model: r.model || 'unknown',
      inputTokens: input,
      cachedTokens: cached,
      outputTokens: output,
      totalTokens: total,
      runs,
      avgTokensPerRun: runs ? Math.round(total / runs) : 0,
      cost: !isSubscription && r.totalCost
        ? { cents: Math.round(parseFloat(r.totalCost) * 100), status: 'reported' }
        : undefined,
      isSubscription,
      lastActive: r.lastActive || new Date(),
    };
  });
}

export async function getTokenUsageTimeseries(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date,
  bucketSize: 'hour' | 'day' = 'hour'
): Promise<TokenTimeseries[]> {
  const bucket = bucketSize === 'hour' ? 'HOUR' : 'DAY';

  const results = await db
    .select({
      bucket: sql<Date>`DATE_TRUNC('${sql.raw(bucket)}', ${costEvents.occurredAt})`,
      inputTokens: sql<number>`COALESCE(SUM(${ordinaryInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      cachedTokens: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .groupBy(sql`DATE_TRUNC('${sql.raw(bucket)}', ${costEvents.occurredAt})`)
    .orderBy(asc(sql`DATE_TRUNC('${sql.raw(bucket)}', ${costEvents.occurredAt})`));

  return results.map(r => ({
    timestamp: r.bucket || new Date(),
    inputTokens: Number(r.inputTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    cachedTokens: Number(r.cachedTokens) || 0,
  }));
}

export async function getModelTokenBreakdown(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ModelTokenUsage[]> {
  const results = await db
    .select({
      provider: costEvents.provider,
      model: costEvents.model,
      inputTokens: sql<number>`COALESCE(SUM(${ordinaryInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      cachedTokens: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      runCount: sql<number>`COUNT(*)`,
      allSubscription: isSubscriptionBilling,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .groupBy(costEvents.provider, costEvents.model)
    .orderBy(desc(sql`COALESCE(SUM(${ordinaryInputTokens}), 0) + COALESCE(SUM(${costEvents.cachedInputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0)`));

  return results.map(r => {
    const input = Number(r.inputTokens) || 0;
    const cached = Number(r.cachedTokens) || 0;
    const output = Number(r.outputTokens) || 0;
    return {
      provider: r.provider || 'unknown',
      model: r.model || 'unknown',
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      totalTokens: input + cached + output,
      runs: Number(r.runCount) || 0,
      isSubscription: Boolean(r.allSubscription),
    };
  });
}

export async function getProjectTokenUsage(
  db: Db,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ProjectTokenUsage[]> {
  const results = await db
    .select({
      projectId: costEvents.projectId,
      inputTokens: sql<number>`COALESCE(SUM(${ordinaryInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      cachedTokens: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      runCount: sql<number>`COUNT(*)`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .groupBy(costEvents.projectId)
    .orderBy(desc(sql`COALESCE(SUM(${ordinaryInputTokens}), 0) + COALESCE(SUM(${costEvents.cachedInputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0)`));

  return results.map(r => {
    const input = Number(r.inputTokens) || 0;
    const cached = Number(r.cachedTokens) || 0;
    const output = Number(r.outputTokens) || 0;
    return {
      projectId: r.projectId || undefined,
      projectName: r.projectId || 'Unattributed',
      totalTokens: input + cached + output,
      inputTokens: input,
      outputTokens: output,
      runs: Number(r.runCount) || 0,
    };
  });
}

export async function getAgentRunTokenHistory(
  db: Db,
  agentId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 100
): Promise<AgentRunHistory[]> {
  const results = await db
    .select({
      id: costEvents.id,
      occurredAt: costEvents.occurredAt,
      model: costEvents.model,
      inputTokens: costEvents.inputTokens,
      outputTokens: costEvents.outputTokens,
      cachedTokens: costEvents.cachedInputTokens,
      status: costEvents.costStatus,
      taskId: costEvents.issueId,
      projectId: costEvents.projectId,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.agentId, agentId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .orderBy(desc(costEvents.occurredAt))
    .limit(limit);

  return results.map(r => {
    const input = r.inputTokens || 0;
    const cached = r.cachedTokens || 0;
    const output = r.outputTokens || 0;
    return {
      runId: r.id,
      startTime: r.occurredAt || new Date(),
      endTime: new Date((r.occurredAt?.getTime() || 0) + 1000),
      model: r.model || 'unknown',
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      totalTokens: input + cached + output,
      duration: 1,
      status: r.status || 'reported',
      taskId: r.taskId,
      projectId: r.projectId,
    };
  });
}
