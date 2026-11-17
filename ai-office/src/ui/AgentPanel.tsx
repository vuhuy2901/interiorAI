import { agentConfigById, statusLabels } from '../agents/agentConfig';
import { getDisplayAgentState } from '../events/useEventStore';
import { useEventStore } from '../events/useEventStore';

type AgentPanelProps = { selectedAgent: string | null; onClose: () => void };

export function AgentPanel({ selectedAgent, onClose }: AgentPanelProps) {
  const agents = useEventStore((state) => state.agents);
  if (!selectedAgent) return null;

  const agent = agentConfigById[selectedAgent];
  const state = getDisplayAgentState(selectedAgent, agents);
  if (!agent) return null;
  const progress = Math.min((state.tokens_used / 5000) * 100, 100);

  return (
    <aside className="agent-panel" aria-label={`Chi tiết ${agent.name}`}>
      <div className="panel-topline">
        <span className="eyebrow">AGENT PROFILE / {agent.id.toUpperCase()}</span>
        <button className="close-button" onClick={onClose} aria-label="Đóng panel">×</button>
      </div>
      <div className="agent-panel-heading">
        <div className="panel-agent-mark" style={{ background: agent.color, boxShadow: `0 0 22px ${agent.color}80` }} />
        <div>
          <h2>{agent.name}</h2>
          <p>{agent.roleLabel}</p>
          <code className="agent-model-key">{agent.modelKey}</code>
        </div>
        <span className={`status-badge status-${state.status}`}>{statusLabels[state.status]}</span>
      </div>
      <div className="panel-section">
        <span className="section-label">CURRENT TASK</span>
        <p className="task-copy">{state.task || 'Đang chờ event tiếp theo.'}</p>
        <code>{state.file || '—'}</code>
      </div>
      <div className="panel-metrics">
        <div><span>Tokens</span><strong>{state.tokens_used.toLocaleString('vi-VN')}</strong></div>
        <div><span>Cost USD</span><strong>${state.cost_usd.toFixed(3)}</strong></div>
      </div>
      <div className="token-progress">
        <div className="progress-label"><span>Token budget</span><span>{Math.round(progress)}%</span></div>
        <div className="progress-track"><div style={{ width: `${progress}%`, background: agent.color }} /></div>
      </div>
      <div className="timeline-section">
        <span className="section-label">RECENT EVENTS / {state.history.length}</span>
        <div className="timeline">
          {state.history.slice(-10).reverse().map((event, index) => (
            <div className="timeline-item" key={`${event.timestamp}-${index}`}>
              <span className={`timeline-dot status-${event.status}`} />
              <div><strong>{statusLabels[event.status]}</strong><span>{event.task}</span><small>{new Date(event.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small></div>
            </div>
          ))}
          {state.history.length === 0 && <p className="empty-state">Chưa có event.</p>}
        </div>
      </div>
      <button className="panel-close-action" onClick={onClose}>Đóng profile</button>
    </aside>
  );
}
