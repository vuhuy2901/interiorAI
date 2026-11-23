import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import styles from './TokenAnalytics.module.css';

interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalRuns: number;
  activeAgents: number;
  recordedCost?: { cents: number; status: string };
}

interface AgentTokenUsage {
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

const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

const formatCost = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

export const TokenAnalytics: React.FC = () => {
  const [companyId] = useState(() => localStorage.getItem('companyId') || '');
  const [dateRange, setDateRange] = useState('last_30_days');
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [agents, setAgents] = useState<AgentTokenUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<keyof AgentTokenUsage>('totalTokens');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: dateRange });

      const [summaryRes, agentsRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/token-analytics/summary?${params}`),
        fetch(`/api/companies/${companyId}/token-analytics/agents?${params}`),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } catch (err) {
      console.error('[TokenAnalytics] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof AgentTokenUsage) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  const filteredAndSortedAgents = agents
    .filter(a => a.agentName.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

  const handleExport = () => {
    if (!agents.length) return;

    const csv = [
      ['Agent', 'Model', 'Input Tokens', 'Cached Tokens', 'Output Tokens', 'Total Tokens', 'Runs', 'Avg/Run', 'Last Active'].join(','),
      ...agents.map(a =>
        [
          `"${a.agentName}"`,
          `"${a.model}"`,
          a.inputTokens,
          a.cachedTokens,
          a.outputTokens,
          a.totalTokens,
          a.runs,
          a.avgTokensPerRun,
          new Date(a.lastActive).toISOString(),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-analytics-${dateRange}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className={styles.container}>Loading...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🧮 Agent Token Analytics</h1>
        <div className={styles.headerControls}>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={styles.dateSelect}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="all_time">All Time</option>
          </select>
        </div>
      </header>

      {summary && (
        <section className={styles.summaryCards}>
          <div className={styles.card}>
            <div className={styles.label}>Total Tokens</div>
            <div className={styles.value}>{formatTokenCount(summary.totalTokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.label}>Input Tokens</div>
            <div className={styles.value}>{formatTokenCount(summary.inputTokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.label}>Output Tokens</div>
            <div className={styles.value}>{formatTokenCount(summary.outputTokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.label}>Cached Tokens</div>
            <div className={styles.value}>{formatTokenCount(summary.cachedTokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.label}>Total Runs</div>
            <div className={styles.value}>{summary.totalRuns}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.label}>Active Agents</div>
            <div className={styles.value}>{summary.activeAgents}</div>
          </div>
          {summary.recordedCost && (
            <div className={styles.card}>
              <div className={styles.label}>Recorded Cost</div>
              <div className={styles.value}>{formatCost(summary.recordedCost.cents)}</div>
            </div>
          )}
        </section>
      )}

      <section className={styles.agentTable}>
        <div className={styles.tableHeader}>
          <h2>Agent Token Statistics</h2>
          <div className={styles.tableControls}>
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <button onClick={handleExport} className={styles.exportBtn}>
              📥 Export CSV
            </button>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => handleSort('agentName')} className={styles.sortable}>
                Agent {sortBy === 'agentName' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('model')} className={styles.sortable}>
                Model {sortBy === 'model' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('inputTokens')} className={styles.sortable}>
                Input {sortBy === 'inputTokens' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('cachedTokens')} className={styles.sortable}>
                Cached {sortBy === 'cachedTokens' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('outputTokens')} className={styles.sortable}>
                Output {sortBy === 'outputTokens' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('totalTokens')} className={styles.sortable}>
                Total {sortBy === 'totalTokens' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('runs')} className={styles.sortable}>
                Runs {sortBy === 'runs' && (sortAsc ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('avgTokensPerRun')} className={styles.sortable}>
                Avg/Run {sortBy === 'avgTokensPerRun' && (sortAsc ? '↑' : '↓')}
              </th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedAgents.map(agent => (
              <tr key={`${agent.agentId}-${agent.model}`}>
                <td className={styles.agentName}>{agent.agentName}</td>
                <td className={styles.model}>{agent.model}</td>
                <td className={styles.number}>{formatTokenCount(agent.inputTokens)}</td>
                <td className={styles.number}>{formatTokenCount(agent.cachedTokens)}</td>
                <td className={styles.number}>{formatTokenCount(agent.outputTokens)}</td>
                <td className={styles.number + ' ' + styles.total}>{formatTokenCount(agent.totalTokens)}</td>
                <td className={styles.number}>{agent.runs}</td>
                <td className={styles.number}>{agent.avgTokensPerRun}</td>
                <td className={styles.time}>{formatDistanceToNow(new Date(agent.lastActive), { addSuffix: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedAgents.length === 0 && (
          <div className={styles.empty}>No agents found for the selected period</div>
        )}
      </section>
    </div>
  );
};

export default TokenAnalytics;
