import React, { useState, useEffect, useCallback } from 'react';
import styles from './TokenAnalytics.module.css';
import { useCompany } from '../context/CompanyContext';

const fmtRelTime = (dateStr: string): string => {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} ngày trước`;
    return `${Math.floor(d / 30)} tháng trước`;
  } catch { return '—'; }
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalRuns: number;
  activeAgents: number;
  recordedCost?: { cents: number; status: string };
  isSubscription?: boolean;
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
  isSubscription?: boolean;
  lastActive: string;
}

interface TokenTimeseries {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

interface ModelTokenUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  runs: number;
}

interface ProjectTokenUsage {
  projectId?: string;
  projectName: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

interface AgentRunHistory {
  runId: string;
  startTime: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  status: string;
  taskId?: string;
  projectId?: string;
}

type TabId = 'overview' | 'agents' | 'models' | 'projects';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtTokens = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return n.toString();
};

const fmtCost = (cents: number): string =>
  cents > 0 ? `$${(cents / 100).toFixed(4)}` : '$0.0000';

const fmtCostCell = (agent: { cost?: { cents: number }; isSubscription?: boolean }): string => {
  if (agent.isSubscription) return 'Subscription';
  if (!agent.cost) return '—';
  return fmtCost(agent.cost.cents);
};

const shortId = (id: string): string =>
  id.length > 16 ? id.slice(0, 8) + '…' : id;

// ─── Timeseries SVG Chart ────────────────────────────────────────────────────

const TimeseriesChart: React.FC<{ data: TokenTimeseries[] }> = ({ data }) => {
  const W = 800, H = 180, PL = 50, PR = 16, PT = 16, PB = 32;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  if (data.length === 0) {
    return (
      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart}>
          <line x1={PL} y1={PT + iH} x2={PL + iW} y2={PT + iH} stroke="var(--panel-border)" strokeWidth="1" />
          <text x={PL + iW / 2} y={PT + iH / 2} textAnchor="middle" fill="var(--ink-dim)" fontSize="12">
            Chưa có dữ liệu
          </text>
        </svg>
      </div>
    );
  }

  const maxVal = Math.max(1, ...data.flatMap(d => [d.inputTokens, d.outputTokens, d.cachedTokens]));
  const toX = (i: number) => PL + (i / (data.length - 1 || 1)) * iW;
  const toY = (v: number) => PT + iH - (v / maxVal) * iH;

  const polyline = (key: keyof Pick<TokenTimeseries, 'inputTokens' | 'outputTokens' | 'cachedTokens'>, color: string) => {
    const pts = data.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' ');
    return <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />;
  };

  const labels = data.length <= 7
    ? data.map((d, i) => ({ i, label: new Date(d.timestamp).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }) }))
    : [0, Math.floor(data.length / 2), data.length - 1].map(i => ({
        i,
        label: new Date(data[i]!.timestamp).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }),
      }));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartLegend}>
        <span><span className={styles.dot} style={{ background: '#60a5fa' }} /> Input</span>
        <span><span className={styles.dot} style={{ background: '#34d399' }} /> Output</span>
        <span><span className={styles.dot} style={{ background: '#fbbf24' }} /> Cached</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} preserveAspectRatio="none">
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PL} y1={PT + iH * t} x2={PL + iW} y2={PT + iH * t}
            stroke="var(--panel-border)" strokeWidth="0.5" strokeDasharray="4 4" />
        ))}
        {[0, 0.5, 1].map(t => (
          <text key={t} x={PL - 4} y={PT + iH * t + 4} textAnchor="end" fill="var(--ink-dim)" fontSize="10">
            {fmtTokens(maxVal * (1 - t))}
          </text>
        ))}
        {polyline('inputTokens', '#60a5fa')}
        {polyline('outputTokens', '#34d399')}
        {polyline('cachedTokens', '#fbbf24')}
        {labels.map(({ i, label }) => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill="var(--ink-dim)" fontSize="10">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
};

// ─── Drilldown panel ─────────────────────────────────────────────────────────

const AgentDrilldown: React.FC<{ agentId: string; range: string }> = ({ agentId, range }) => {
  const [history, setHistory] = useState<AgentRunHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/agents/${agentId}/token-analytics/history?range=${range}&limit=50`)
      .then(r => r.ok ? r.json() : [])
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [agentId, range]);

  if (loading) return <div className={styles.drillLoading}>Đang tải lịch sử…</div>;
  if (!history.length) return <div className={styles.drillEmpty}>Chưa có lịch sử run cho khoảng thời gian này</div>;

  return (
    <table className={styles.table} style={{ marginTop: 0, borderRadius: 8 }}>
      <thead>
        <tr>
          <th>Run ID</th>
          <th>Model</th>
          <th className={styles.number}>Input</th>
          <th className={styles.number}>Output</th>
          <th className={styles.number}>Cached</th>
          <th className={styles.number}>Total</th>
          <th>Status</th>
          <th>Thời gian</th>
        </tr>
      </thead>
      <tbody>
        {history.map(run => (
          <tr key={run.runId}>
            <td className={styles.model}>{shortId(run.runId)}</td>
            <td className={styles.model}>{run.model}</td>
            <td className={styles.number}>{fmtTokens(run.inputTokens)}</td>
            <td className={styles.number}>{fmtTokens(run.outputTokens)}</td>
            <td className={styles.number}>{fmtTokens(run.cachedTokens)}</td>
            <td className={`${styles.number} ${styles.total}`}>{fmtTokens(run.totalTokens)}</td>
            <td><span className={styles.statusBadge}>{run.status}</span></td>
            <td className={styles.time}>{fmtRelTime(run.startTime)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ─── Main page ───────────────────────────────────────────────────────────────

export const TokenAnalytics: React.FC = () => {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? '';
  const [dateRange, setDateRange] = useState('last_30_days');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [agents, setAgents] = useState<AgentTokenUsage[]>([]);
  const [timeseries, setTimeseries] = useState<TokenTimeseries[]>([]);
  const [models, setModels] = useState<ModelTokenUsage[]>([]);
  const [projects, setProjects] = useState<ProjectTokenUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [agentSort, setAgentSort] = useState<keyof AgentTokenUsage>('totalTokens');
  const [agentSortAsc, setAgentSortAsc] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setFetchError(null);
    const p = `range=${dateRange}`;
    try {
      const [sumRes, agRes, tsRes, modRes, projRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/token-analytics/summary?${p}`),
        fetch(`/api/companies/${companyId}/token-analytics/agents?${p}`),
        fetch(`/api/companies/${companyId}/token-analytics/timeseries?${p}&bucket=day`),
        fetch(`/api/companies/${companyId}/token-analytics/models?${p}`),
        fetch(`/api/companies/${companyId}/token-analytics/projects?${p}`),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (agRes.ok) setAgents(await agRes.json());
      if (tsRes.ok) setTimeseries(await tsRes.json());
      if (modRes.ok) setModels(await modRes.json());
      if (projRes.ok) setProjects(await projRes.json());
      if (!sumRes.ok) setFetchError(`API lỗi ${sumRes.status} — kiểm tra backend token-analytics routes`);
    } catch (err) {
      console.error('[TokenAnalytics] Fetch error:', err);
      setFetchError(err instanceof Error ? err.message : 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, [companyId, dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAgentSort = (key: keyof AgentTokenUsage) => {
    if (agentSort === key) setAgentSortAsc(v => !v);
    else { setAgentSort(key); setAgentSortAsc(false); }
  };

  const sortedAgents = agents
    .filter(a => a.agentName.toLowerCase().includes(agentSearch.toLowerCase()) ||
                 a.agentId.toLowerCase().includes(agentSearch.toLowerCase()))
    .sort((a, b) => {
      let av: unknown = a[agentSort], bv: unknown = b[agentSort];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av === bv) return 0;
      return agentSortAsc ? (av! > bv! ? 1 : -1) : (av! < bv! ? 1 : -1);
    });

  const handleExportAgents = () => {
    if (!agents.length) return;
    const csv = [
      ['Agent', 'Model', 'Input', 'Cached', 'Output', 'Total', 'Runs', 'Avg/Run', 'Last Active', 'Cost'].join(','),
      ...agents.map(a => [
        `"${a.agentName}"`, `"${a.model}"`,
        a.inputTokens, a.cachedTokens, a.outputTokens, a.totalTokens,
        a.runs, a.avgTokensPerRun, a.lastActive,
        a.cost ? fmtCost(a.cost.cents) : '',
      ].join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const el = document.createElement('a');
    el.href = url; el.download = `token-agents-${dateRange}-${Date.now()}.csv`; el.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'agents', label: `Agents${agents.length ? ` (${agents.length})` : ''}` },
    { id: 'models', label: 'Models' },
    { id: 'projects', label: 'Dự án' },
  ];

  const sortArrow = (active: boolean, asc: boolean) => active ? (asc ? ' ↑' : ' ↓') : '';

  if (!companyId) {
    return (
      <div className={styles.container}>
        <header className={styles.header}><h1>Token Analytics</h1></header>
        <div className={styles.empty} style={{ marginTop: 60, fontSize: 16 }}>
          Chưa chọn công ty — vui lòng chọn workspace trước.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Token Analytics</h1>
        <div className={styles.headerControls}>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={styles.dateSelect}>
            <option value="today">Hôm nay</option>
            <option value="yesterday">Hôm qua</option>
            <option value="last_7_days">7 ngày qua</option>
            <option value="last_30_days">30 ngày qua</option>
            <option value="this_month">Tháng này</option>
            <option value="all_time">Tất cả</option>
          </select>
          <button onClick={fetchAll} className={styles.refreshBtn} disabled={loading}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </header>

      {/* Loading indicator */}
      {loading && (
        <div style={{ padding: '12px 0', color: 'var(--ink-dim)', fontSize: 14 }}>
          Đang tải dữ liệu token…
        </div>
      )}

      {/* Error state */}
      {fetchError && !loading && (
        <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, color: '#f87171', fontSize: 13, marginBottom: 16 }}>
          ⚠ {fetchError}
        </div>
      )}

      {/* Summary cards — always visible */}
      {summary && (
        <section className={styles.summaryCards}>
          {[
            { label: 'Tổng Token', value: fmtTokens(summary.totalTokens) },
            { label: 'Input (net)', value: fmtTokens(summary.inputTokens) },
            { label: 'Output', value: fmtTokens(summary.outputTokens) },
            { label: 'Cached', value: fmtTokens(summary.cachedTokens) },
            { label: 'Runs', value: summary.totalRuns.toLocaleString() },
            { label: 'Active Agents', value: summary.activeAgents.toString() },
            {
              label: 'Chi phí',
              value: summary.isSubscription ? 'Subscription' : (summary.recordedCost ? fmtCost(summary.recordedCost.cents) : 'N/A'),
            },
          ].map(({ label, value }) => (
            <div key={label} className={styles.card}>
              <div className={styles.label}>{label}</div>
              <div className={styles.value}>{value}</div>
            </div>
          ))}
        </section>
      )}

      {!summary && !loading && !fetchError && (
        <div style={{ padding: '20px 0', marginBottom: 24, fontSize: 14, color: 'var(--ink)' }}>
          Chưa có dữ liệu — chạy một agent để ghi nhận cost event đầu tiên.
        </div>
      )}

      {/* Tab bar */}
      <nav className={styles.tabs}>
        {tabs.map(t => (
          <button key={t.id} className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Tab: Tổng quan ── */}
      {activeTab === 'overview' && (
        <section>
          <h2 className={styles.sectionTitle}>Token theo thời gian</h2>
          <TimeseriesChart data={timeseries} />
        </section>
      )}

      {/* ── Tab: Agents ── */}
      {activeTab === 'agents' && (
        <section className={styles.agentTable}>
          <div className={styles.tableHeader}>
            <h2>Agent Token Statistics</h2>
            <div className={styles.tableControls}>
              <input type="text" placeholder="Tìm agent…" value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)} className={styles.searchInput} />
              <button onClick={handleExportAgents} className={styles.exportBtn}>Export CSV</button>
            </div>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => handleAgentSort('agentName')} className={styles.sortable}>
                  Agent{sortArrow(agentSort === 'agentName', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('model')} className={styles.sortable}>
                  Model{sortArrow(agentSort === 'model', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('inputTokens')} className={`${styles.sortable} ${styles.number}`}>
                  Input{sortArrow(agentSort === 'inputTokens', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('cachedTokens')} className={`${styles.sortable} ${styles.number}`}>
                  Cached{sortArrow(agentSort === 'cachedTokens', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('outputTokens')} className={`${styles.sortable} ${styles.number}`}>
                  Output{sortArrow(agentSort === 'outputTokens', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('totalTokens')} className={`${styles.sortable} ${styles.number}`}>
                  Total{sortArrow(agentSort === 'totalTokens', agentSortAsc)}
                </th>
                <th onClick={() => handleAgentSort('runs')} className={`${styles.sortable} ${styles.number}`}>
                  Runs{sortArrow(agentSort === 'runs', agentSortAsc)}
                </th>
                <th className={styles.number}>Avg/Run</th>
                <th className={styles.number}>Chi phí</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map(agent => (
                <React.Fragment key={`${agent.agentId}-${agent.model}`}>
                  <tr className={expandedAgent === agent.agentId ? styles.rowExpanded : ''}
                    onClick={() => setExpandedAgent(expandedAgent === agent.agentId ? null : agent.agentId)}
                    style={{ cursor: 'pointer' }}>
                    <td className={styles.agentName}>
                      <span className={styles.expandIcon}>{expandedAgent === agent.agentId ? '▾' : '▸'}</span>
                      {agent.agentName.length > 32 ? shortId(agent.agentName) : agent.agentName}
                    </td>
                    <td className={styles.model}>{agent.model}</td>
                    <td className={styles.number}>{fmtTokens(agent.inputTokens)}</td>
                    <td className={styles.number}>{fmtTokens(agent.cachedTokens)}</td>
                    <td className={styles.number}>{fmtTokens(agent.outputTokens)}</td>
                    <td className={`${styles.number} ${styles.total}`}>{fmtTokens(agent.totalTokens)}</td>
                    <td className={styles.number}>{agent.runs}</td>
                    <td className={styles.number}>{fmtTokens(agent.avgTokensPerRun)}</td>
                    <td className={styles.number}>{fmtCostCell(agent)}</td>
                    <td className={styles.time}>{fmtRelTime(agent.lastActive)}</td>
                  </tr>
                  {expandedAgent === agent.agentId && (
                    <tr>
                      <td colSpan={10} className={styles.drilldownCell}>
                        <AgentDrilldown agentId={agent.agentId} range={dateRange} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {sortedAgents.length === 0 && (
            <div className={styles.empty}>Không có agent nào trong khoảng thời gian này</div>
          )}
        </section>
      )}

      {/* ── Tab: Models ── */}
      {activeTab === 'models' && (
        <section>
          <h2 className={styles.sectionTitle}>Phân tích theo Model / Provider</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th className={styles.number}>Input</th>
                <th className={styles.number}>Output</th>
                <th className={styles.number}>Cached</th>
                <th className={styles.number}>Total</th>
                <th className={styles.number}>Runs</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={i}>
                  <td className={styles.model}>{m.provider}</td>
                  <td className={styles.model}>{m.model}</td>
                  <td className={styles.number}>{fmtTokens(m.inputTokens)}</td>
                  <td className={styles.number}>{fmtTokens(m.outputTokens)}</td>
                  <td className={styles.number}>{fmtTokens(m.cachedTokens)}</td>
                  <td className={`${styles.number} ${styles.total}`}>{fmtTokens(m.totalTokens)}</td>
                  <td className={styles.number}>{m.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {models.length === 0 && <div className={styles.empty}>Chưa có dữ liệu model</div>}
        </section>
      )}

      {/* ── Tab: Projects ── */}
      {activeTab === 'projects' && (
        <section>
          <h2 className={styles.sectionTitle}>Phân tích theo Dự án</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Dự án</th>
                <th className={styles.number}>Input</th>
                <th className={styles.number}>Output</th>
                <th className={styles.number}>Total</th>
                <th className={styles.number}>Runs</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr key={i}>
                  <td className={styles.agentName}>
                    {p.projectName === 'Unattributed' ? 'Không gán dự án' :
                      p.projectName.length > 40 ? shortId(p.projectName) : p.projectName}
                  </td>
                  <td className={styles.number}>{fmtTokens(p.inputTokens)}</td>
                  <td className={styles.number}>{fmtTokens(p.outputTokens)}</td>
                  <td className={`${styles.number} ${styles.total}`}>{fmtTokens(p.totalTokens)}</td>
                  <td className={styles.number}>{p.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects.length === 0 && <div className={styles.empty}>Chưa có dữ liệu dự án</div>}
        </section>
      )}
    </div>
  );
};

export default TokenAnalytics;
