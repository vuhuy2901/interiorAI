import type { AgentAnalyticsReport, DashboardSummary } from "@paperclipai/shared";
import { api } from "./client";

export interface AgentAnalyticsParams {
  range?: string;
  agentId?: string;
  projectId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  agentAnalytics: (companyId: string, params?: AgentAnalyticsParams) => {
    const qs = new URLSearchParams();
    if (params?.range) qs.set("range", params.range);
    if (params?.agentId) qs.set("agentId", params.agentId);
    if (params?.projectId) qs.set("projectId", params.projectId);
    if (params?.status) qs.set("status", params.status);
    if (params?.startDate) qs.set("startDate", params.startDate);
    if (params?.endDate) qs.set("endDate", params.endDate);
    const queryString = qs.toString();
    return api.get<AgentAnalyticsReport>(`/companies/${companyId}/agent-analytics${queryString ? `?${queryString}` : ""}`);
  },
};
