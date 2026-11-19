export interface DashboardRunActivityDay {
  date: string;
  succeeded: number;
  /**
   * True failures for the day, excluding process-loss/restart kills that were
   * later recovered by a successful retry (those are surfaced in `recovered`).
   */
  failed: number;
  /**
   * Runs that terminated as failed, timed_out, or interrupted (shutdown) but
   * whose retry chain eventually succeeded — e.g. restart-killed runs and
   * shutdown interrupts that recovered. Kept out of `failed` so the headline
   * failure count reflects true, unrecovered failures.
   */
  recovered: number;
  other: number;
  total: number;
  /**
   * Per-error-code breakdown of the (true) `failed` count for the day, so a
   * spike can be attributed to an error class (e.g. `process_lost`,
   * `provider_quota`, `workspace_validation_failed`). Recovered runs are not
   * included here. Runs with no error code are bucketed under `unknown`.
   */
  failedByErrorCode: Record<string, number>;
}

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
  runActivity: DashboardRunActivityDay[];
}

export interface AgentPerformanceRankingItem {
  agentId: string;
  agentName: string;
  agentAppearance?: Record<string, unknown> | null;
  adapterType?: string;
  totalRuns: number;
  totalRuntimeSeconds: number;
  avgRuntimeSeconds: number;
  successRate: number; // 0 to 100
  failedRuns: number;
  completedTasks: number;
}

export interface AgentRuntimeMetric {
  agentId: string;
  agentName: string;
  totalRuntimeSeconds: number;
  avgRuntimeSeconds: number;
  maxRuntimeSeconds: number;
  runCount: number;
}

export interface ExecutionDistribution {
  successful: number;
  failed: number;
  recovered: number;
  cancelled: number;
  total: number;
}

export interface AgentUsageTrendPoint {
  date: string;
  total: number;
  byAgent: Record<string, number>;
}

export interface LongestRunItem {
  runId: string;
  agentId: string;
  agentName: string;
  taskTitle: string;
  taskIdentifier?: string | null;
  taskId?: string | null;
  projectName?: string | null;
  runtimeSeconds: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentAnalyticsReport {
  companyId: string;
  timeRange: string;
  ranking: AgentPerformanceRankingItem[];
  runtimeStats: AgentRuntimeMetric[];
  executionDistribution: ExecutionDistribution;
  usageTrends: AgentUsageTrendPoint[];
  longestRuns: LongestRunItem[];
}

