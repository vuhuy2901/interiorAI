import { db } from '../db';
import { costEvents } from '../db/schema';
import { and, eq, gte, lte, sql, desc, asc } from 'drizzle-orm';

export interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalRuns: number;
  activeAgents: number;
  recordedCost?: { cents: number; status: string };
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

export async function getCompanyTokenSummary(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<TokenSummary> {
  const result = await db
    .select({
      totalInput: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
      totalCached: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      runCount: sql<number>`COUNT(DISTINCT ${costEvents.id})`,
      agentCount: sql<number>`COUNT(DISTINCT ${costEvents.agentId})`,
      totalCost: sql<string>`COALESCE(SUM(${costEvents.costCentsExact}), '0')`,
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
  const inputTokens = Number(row.totalInput) || 0;
  const cachedTokens = Number(row.totalCached) || 0;
  const outputTokens = Number(row.totalOutput) || 0;
  const totalTokens = inputTokens + outputTokens + cachedTokens;

  return {
    totalTokens,
    inputTokens: inputTokens - cachedTokens,
    outputTokens,
    cachedTokens,
    totalRuns: row.runCount || 0,
    activeAgents: row.agentCount || 0,
    recordedCost: row.totalCost ? { cents: parseInt(row.totalCost), status: 'reported' } : undefined,
  };
}

export async function getAgentTokenUsage(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<AgentTokenUsage[]> {
  const results = await db
    .select({
      agentId: costEvents.agentId,
      model: costEvents.model,
      inputTokens: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
      cachedTokens: sql<number>`COALESCE(SUM(${costEvents.cachedInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${costEvents.outputTokens}), 0)`,
      runCount: sql<number>`COUNT(*)`,
      lastActive: sql<Date>`MAX(${costEvents.occurredAt})`,
      totalCost: sql<string>`COALESCE(SUM(${costEvents.costCentsExact}), '0')`,
    })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.companyId, companyId),
        gte(costEvents.occurredAt, startDate),
        lte(costEvents.occurredAt, endDate)
      )
    )
    .groupBy(costEvents.agentId, costEvents.model)
    .orderBy(desc(sql`COALESCE(SUM(${costEvents.inputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0)`));

  return results.map(r => ({
    agentId: r.agentId || 'unknown',
    agentName: r.agentId || 'Unknown Agent',
    model: r.model || 'unknown',
    inputTokens: (Number(r.inputTokens) || 0) - (Number(r.cachedTokens) || 0),
    cachedTokens: Number(r.cachedTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    totalTokens: (Number(r.inputTokens) || 0) + (Number(r.outputTokens) || 0),
    runs: r.runCount || 0,
    avgTokensPerRun: r.runCount ? Math.round(((Number(r.inputTokens) || 0) + (Number(r.outputTokens) || 0)) / r.runCount) : 0,
    cost: r.totalCost ? { cents: parseInt(r.totalCost), status: 'reported' } : undefined,
    lastActive: r.lastActive || new Date(),
  }));
}

export async function getTokenUsageTimeseries(
  companyId: string,
  startDate: Date,
  endDate: Date,
  bucketSize: 'hour' | 'day' = 'hour'
): Promise<TokenTimeseries[]> {
  const bucket = bucketSize === 'hour' ? 'HOUR' : 'DAY';

  const results = await db
    .select({
      bucket: sql<Date>`DATE_TRUNC('${sql.raw(bucket)}', ${costEvents.occurredAt})`,
      inputTokens: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
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
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ModelTokenUsage[]> {
  const results = await db
    .select({
      provider: costEvents.provider,
      model: costEvents.model,
      inputTokens: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
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
    .groupBy(costEvents.provider, costEvents.model)
    .orderBy(desc(sql`COALESCE(SUM(${costEvents.inputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0))`));

  return results.map(r => ({
    provider: r.provider || 'unknown',
    model: r.model || 'unknown',
    inputTokens: Number(r.inputTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    cachedTokens: Number(r.cachedTokens) || 0,
    totalTokens: (Number(r.inputTokens) || 0) + (Number(r.outputTokens) || 0),
    runs: r.runCount || 0,
  }));
}

export async function getProjectTokenUsage(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ProjectTokenUsage[]> {
  const results = await db
    .select({
      projectId: costEvents.projectId,
      inputTokens: sql<number>`COALESCE(SUM(${costEvents.inputTokens}), 0)`,
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
    .orderBy(desc(sql`COALESCE(SUM(${costEvents.inputTokens}), 0) + COALESCE(SUM(${costEvents.outputTokens}), 0))`));

  return results.map(r => ({
    projectId: r.projectId || undefined,
    projectName: r.projectId || 'Unattributed',
    totalTokens: (Number(r.inputTokens) || 0) + (Number(r.outputTokens) || 0),
    inputTokens: Number(r.inputTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    runs: r.runCount || 0,
  }));
}

export async function getAgentRunTokenHistory(
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

  return results.map(r => ({
    runId: r.id,
    startTime: r.occurredAt || new Date(),
    endTime: new Date((r.occurredAt?.getTime() || 0) + 1000), // Approximate duration
    model: r.model || 'unknown',
    inputTokens: r.inputTokens || 0,
    outputTokens: r.outputTokens || 0,
    cachedTokens: r.cachedTokens || 0,
    totalTokens: (r.inputTokens || 0) + (r.outputTokens || 0),
    duration: 1,
    status: r.status || 'reported',
    taskId: r.taskId,
    projectId: r.projectId,
  }));
}
