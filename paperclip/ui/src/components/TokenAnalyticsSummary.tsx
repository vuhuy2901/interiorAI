import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, TrendingUp } from 'lucide-react';
import { Link } from '@/lib/router';

interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalRuns: number;
  activeAgents: number;
}

const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

export interface TokenAnalyticsSummaryProps {
  companyId: string;
}

export const TokenAnalyticsSummary: React.FC<TokenAnalyticsSummaryProps> = ({ companyId }) => {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const params = new URLSearchParams({ range: 'last_30_days' });
        const res = await fetch(`/api/companies/${companyId}/token-analytics/summary?${params}`);
        if (res.ok) {
          setSummary(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch token summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [companyId]);

  if (loading || !summary) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Agent Token Statistics
        </h3>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/token-analytics" className="text-xs">
            View Full Analytics →
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Total Tokens</div>
          <div className="text-lg font-bold mt-1">{formatTokenCount(summary.totalTokens)}</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Input</div>
          <div className="text-lg font-bold mt-1">{formatTokenCount(summary.inputTokens)}</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Output</div>
          <div className="text-lg font-bold mt-1">{formatTokenCount(summary.outputTokens)}</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Cached</div>
          <div className="text-lg font-bold mt-1">{formatTokenCount(summary.cachedTokens)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Total Runs</div>
          <div className="text-lg font-bold mt-1">{summary.totalRuns}</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-medium text-muted-foreground">Active Agents</div>
          <div className="text-lg font-bold mt-1">{summary.activeAgents}</div>
        </Card>

        <Card className="p-3 md:col-span-1">
          <div className="text-xs font-medium text-muted-foreground">Period</div>
          <div className="text-lg font-bold mt-1">Last 30d</div>
        </Card>
      </div>
    </div>
  );
};
