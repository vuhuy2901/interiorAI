/**
 * ATELIER AI — Chief Architect AI Design Assistant & Proposal Approval Dock (Sections 7 & 10)
 * Implements:
 * - Agent Header with live connection & reasoning status
 * - Structured Interactive Question Cards (ask_user human-in-the-loop gate)
 * - Redesigned Proposal Cards (Title, Status, Origin Agent, Reason, Cost Delta, New Total, Affected Entities)
 * - Inline Blender Cycles Render Output Card (G6 Conversation Output with Revision, Camera ID, Material Hash, and mandatory label)
 * - Strict Proposal Deduplication & Priority Grouping (Pending prioritized at top, Processed in collapsible archive,
 *   no re-approving already APPROVED proposals, Undo action button when applied)
 * - Auto-expanding textarea & contextual quick actions
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Bot,
  X,
} from 'lucide-react'

interface AIDesignAssistantProps {
  project: any
  chatHistory: {
    messages: any[]
    pending_questions: any[]
    proposals: any[]
  }
  sendingChat: boolean
  chatInput: string
  onChatInputChange: (val: string) => void
  onSendChat: (textOverride?: string) => void
  onAnswerQuestion: (questionId: string, answer: string) => void
  onApproveProposal: (proposalId: string, optionId?: string) => void
  onRejectProposal: (proposalId: string) => void
  onUndoLastRevision: () => void
  onCloseMobile?: () => void
}

const formatVnd = (v?: number) => `${Math.round(v || 0).toLocaleString('vi-VN')} ₫`
const formatDeltaVnd = (v?: number) => {
  const num = Math.round(v || 0)
  if (num === 0) return '0 ₫'
  return num > 0 ? `+${num.toLocaleString('vi-VN')} ₫` : `−${Math.abs(num).toLocaleString('vi-VN')} ₫`
}

export const AIDesignAssistant: React.FC<AIDesignAssistantProps> = ({
  project,
  chatHistory,
  sendingChat,
  chatInput,
  onChatInputChange,
  onSendChat,
  onAnswerQuestion,
  onApproveProposal,
  onRejectProposal,
  onUndoLastRevision,
  onCloseMobile,
}) => {
  const [subTab, setSubTab] = useState<'chat' | 'proposals' | 'brief'>('chat')
  const [showProcessedHistory, setShowProcessedHistory] = useState(false)
  const scrollEndRef = useRef<HTMLDivElement | null>(null)

  const proposals = chatHistory.proposals || []

  // Map proposal_id -> latest status from canonical proposals table so chat cards never allow re-approving
  const proposalStatusMap = useMemo(() => {
    const map: Record<string, string> = {}
    proposals.forEach((p: any) => {
      if (p.proposal_id) map[p.proposal_id] = p.status
    })
    return map
  }, [proposals])

  // Group & Deduplicate Proposals Visually (Section 10 rules: keep audit intact, group identical title+delta+status)
  const { pendingProposals, processedGroups } = useMemo(() => {
    const pending: any[] = []
    const processedMap = new Map<string, { item: any; count: number }>()

    proposals.forEach((p: any) => {
      if (p.status === 'PENDING') {
        pending.push(p)
      } else {
        const key = `${p.title}|${p.status}|${Math.round(p.cost_delta_vnd || 0)}`
        const existing = processedMap.get(key)
        if (existing) {
          existing.count += 1
        } else {
          processedMap.set(key, { item: p, count: 1 })
        }
      }
    })

    return {
      pendingProposals: pending,
      processedGroups: Array.from(processedMap.values()),
    }
  }, [proposals])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory.messages?.length, sendingChat])

  // Render a single high-craft Proposal Card (Section 10)
  const renderProposalCard = (prop: any, duplicateCount = 1) => {
    const liveStatus = proposalStatusMap[prop.proposal_id] || prop.status || 'PENDING'
    const isPending = liveStatus === 'PENDING'
    const isApproved = liveStatus === 'APPROVED'
    const delta = Math.round(prop.cost_delta_vnd || 0)

    return (
      <div
        key={prop.proposal_id}
        data-testid={`proposal-card-${prop.proposal_id}`}
        className="surface-card"
        style={{
          padding: 14,
          marginTop: 10,
          borderColor: isPending ? 'var(--accent)' : 'var(--border-subtle)',
          background: isPending ? 'var(--surface-primary)' : 'var(--surface-secondary)',
        }}
      >
        {/* Top Row: Short Title + Status Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {prop.title}
            {duplicateCount > 1 && (
              <span className="status-badge neutral" style={{ marginLeft: 6 }}>
                ×{duplicateCount}
              </span>
            )}
          </div>
          <span
            data-testid={`proposal-status-${prop.proposal_id}`}
            className={`status-badge ${
              isPending ? 'amber' : isApproved ? 'emerald' : 'neutral'
            }`}
          >
            {isPending ? 'Chờ duyệt' : isApproved ? 'Đã áp dụng' : 'Đã từ chối'}
          </span>
        </div>

        {/* Origin Agent & Reason */}
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
          Đề xuất bởi <span className="mono">{prop.origin_agent || 'agent_chief_architect'}</span> • {prop.reason}
        </div>

        {/* Affected Entities Diff Summary */}
        {prop.diffs && prop.diffs.length > 0 && (
          <div
            className="surface-subtle"
            style={{ marginTop: 10, padding: '8px 10px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {prop.diffs.map((d: any, idx: number) => (
              <div key={idx} style={{ borderBottom: idx < prop.diffs.length - 1 ? '1px dashed var(--border-subtle)' : 'none', paddingBottom: idx < prop.diffs.length - 1 ? 6 : 0 }}>
                {d.before_summary && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>
                    Trước: {d.before_summary}
                  </div>
                )}
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 1 }}>
                  Sau: {d.after_summary}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cost Delta & New Projected Total */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 'var(--radius-btn)',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Chênh lệch chi phí</div>
            <div
              className="mono"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: delta < 0 ? 'var(--emerald-text)' : delta > 0 ? 'var(--amber-text)' : 'var(--text-primary)',
              }}
            >
              {formatDeltaVnd(delta)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Tổng dự toán mới</div>
            <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatVnd(prop.projected_total_vnd)}
            </div>
          </div>
        </div>

        {/* Multi-Option A / B / C Selector if Proposal includes DesignOptionCards */}
        {prop.options && prop.options.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {prop.options.map((opt: any) => (
              <div
                key={opt.option_id}
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-btn)',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 12.5 }}>{opt.title}</strong>
                  <span className="status-badge teal">Lối đi {opt.min_walkway_mm}mm</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>{opt.summary}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {formatVnd(opt.estimated_total_vnd)}
                  </span>
                  {isPending && (
                    <button
                      data-testid={`approve-option-${prop.proposal_id}-${opt.option_id}`}
                      className="btn btn-sm btn-primary"
                      onClick={() => onApproveProposal(prop.proposal_id, opt.option_id)}
                    >
                      <CheckCircle2 size={12} /> Chọn Phương án {opt.option_id}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons: Pending -> Approve/Reject; Approved -> Undo Option */}
        {(!prop.options || prop.options.length === 0) && isPending && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              data-testid={`approve-proposal-${prop.proposal_id}`}
              className="btn btn-sm btn-primary"
              style={{ flex: 1 }}
              onClick={() => onApproveProposal(prop.proposal_id)}
            >
              <CheckCircle2 size={13} /> Duyệt & Áp dụng
            </button>
            <button
              data-testid={`reject-proposal-${prop.proposal_id}`}
              className="btn btn-sm"
              onClick={() => onRejectProposal(prop.proposal_id)}
            >
              <XCircle size={13} /> Từ chối
            </button>
          </div>
        )}

        {isApproved && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--emerald-text)', fontWeight: 500 }}>
              ✓ Đã đồng bộ vào Pascal Scene 3D
            </span>
            <button className="btn btn-sm" onClick={onUndoLastRevision}>
              <RotateCcw size={11} /> Hoàn tác (Undo)
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside id="architect-panel-dock" className="ai-assistant-dock" aria-label="Kiến trúc sư trưởng AI">
      {/* Assistant Header (Section 7) */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bot size={16} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
              Kiến Trúc Sư Trưởng AI
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              <span className={`status-dot ${sendingChat ? 'amber' : ''}`} />
              <span>{sendingChat ? 'Đang xử lý yêu cầu...' : 'Chờ yêu cầu mới'}</span>
            </div>
          </div>
        </div>

        {onCloseMobile && (
          <button
            className="btn btn-icon btn-sm"
            onClick={onCloseMobile}
            aria-label="Đóng bảng Kiến trúc sư trưởng AI"
            title="Đóng trợ lý AI"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Segmented Navigation Bar */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-secondary)',
          display: 'flex',
          gap: 4,
        }}
      >
        <button
          data-testid="ai-subtab-chat"
          className={`seg-btn ${subTab === 'chat' ? 'active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setSubTab('chat')}
        >
          Hội Thoại ({chatHistory.messages?.length || 0})
        </button>
        <button
          data-testid="ai-subtab-proposals"
          className={`seg-btn ${subTab === 'proposals' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          onClick={() => setSubTab('proposals')}
        >
          <span>Đề Xuất</span>
          {pendingProposals.length > 0 && (
            <span className="status-badge amber" style={{ padding: '0 6px', fontSize: 10 }}>
              {pendingProposals.length}
            </span>
          )}
        </button>
        <button
          data-testid="ai-subtab-brief"
          className={`seg-btn ${subTab === 'brief' ? 'active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setSubTab('brief')}
        >
          Hồ Sơ Brief
        </button>
      </div>

      {/* TAB 1: CONVERSATIONAL CONCIERGE */}
      {subTab === 'chat' && (
        <>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'var(--app-bg)',
            }}
          >
            {/* Suggested Quick Prompts */}
            <div className="surface-subtle" style={{ padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Gợi ý yêu cầu thiết kế nhanh:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {[
                  'Đề xuất 3 phương án A/B/C dưới 120 triệu',
                  'Sofa hơi to, đổi sofa nhỏ hơn 1.8m',
                  'Đổi sơn tường nhấn sang Xanh Cổ Vịt & lát gạch 800×800',
                  'Kiểm tra lối đi và vùng mở cửa 900mm',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    className="btn btn-sm"
                    style={{ fontSize: 11, height: 26, padding: '0 8px' }}
                    onClick={() => onSendChat(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Messages */}
            {(chatHistory.messages || []).map((m: any) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={m.message_id}
                  data-testid={`chat-message-${m.message_id}`}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'stretch',
                    maxWidth: isUser ? '88%' : '100%',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-card)',
                    background: isUser ? 'var(--accent)' : 'var(--surface-primary)',
                    color: isUser ? '#FFFFFF' : 'var(--text-primary)',
                    border: isUser ? 'none' : '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-xs)',
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      fontWeight: 600,
                      color: isUser ? 'rgba(255,255,255,0.85)' : 'var(--accent)',
                      marginBottom: 4,
                    }}
                  >
                    <span>{m.sender_name}</span>
                    {m.metadata?.agent_id && !isUser && (
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {m.metadata.agent_id}
                      </span>
                    )}
                  </div>

                  <div style={{ whiteSpace: 'pre-line' }}>{m.content}</div>

                  {/* Interactive Question Request Card (ask_user interrupt) */}
                  {m.metadata?.question && (
                    <div
                      className="surface-card"
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderColor: 'var(--amber-border)',
                        background: 'var(--amber-bg)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5, color: 'var(--amber-text)' }}>
                        <HelpCircle size={14} />
                        <span>Cần xác nhận từ bạn ({m.metadata.question.origin_agent})</span>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 6, fontSize: 13 }}>
                        {m.metadata.question.question_text}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                        Vì sao cần biết: {m.metadata.question.why_needed}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                        {(m.metadata.question.choices || []).map((c: any) => (
                          <button
                            key={c.id}
                            className="btn btn-sm btn-primary"
                            style={{ justifyContent: 'flex-start', height: 'auto', padding: '7px 10px', whiteSpace: 'normal', textAlign: 'left' }}
                            onClick={() => onAnswerQuestion(m.metadata.question.question_id, c.label)}
                          >
                            ✓ {c.label} {c.description ? `— ${c.description}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interactive Proposal Card inside Chat Stream */}
                  {m.metadata?.proposal && renderProposalCard(m.metadata.proposal)}

                  {/* G6 Conversation Output: Blender Cycles Rendered Image inside Chat Stream */}
                  {m.metadata?.render_job && m.metadata.render_job.image_url && (
                    <div
                      className="surface-subtle"
                      data-testid={`chat-render-card-${m.metadata.render_job.job_id}`}
                      style={{ marginTop: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <img
                        src={m.metadata.render_job.image_url}
                        alt={`Blender Cycles ${m.metadata.render_job.job_id}`}
                        style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border-strong)' }}
                      />
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                        REV #{m.metadata.render_job.revision} | CAM: {m.metadata.render_job.camera_id} | MAT_HASH:{' '}
                        {m.metadata.render_job.material_hash?.slice(0, 12)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber-text)' }}>
                        {m.metadata.render_job.mandatory_label || 'ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG.'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {sendingChat && (
              <div className="surface-card" style={{ padding: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Đang phân tích không gian 3D & tính toán dự toán BOQ...
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>

          {/* Chat Composer Footer */}
          <div
            style={{
              padding: 12,
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--surface-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                data-testid="concierge-chat-input"
                className="field-textarea"
                rows={2}
                style={{ resize: 'none' }}
                placeholder="Nhập yêu cầu thiết kế (VD: Tôi thấy phòng hơi chật, đổi sofa 1.8m...)"
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSendChat()
                  }
                }}
              />
              <button
                data-testid="concierge-chat-send"
                className="btn btn-primary"
                style={{ height: 48, padding: '0 14px' }}
                disabled={sendingChat}
                onClick={() => onSendChat()}
                aria-label="Gửi tin nhắn"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: DEDICATED PROPOSALS & APPROVALS INBOX (Section 10) */}
      {subTab === 'proposals' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: 'var(--app-bg)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              ĐỀ XUẤT ĐANG CHỜ DUYỆT ({pendingProposals.length})
            </div>
            {pendingProposals.length === 0 ? (
              <div className="surface-subtle" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Không có đề xuất nào đang chờ phê duyệt. Bạn có thể yêu cầu AI đề xuất phương án mới trong mục Hội Thoại.
              </div>
            ) : (
              pendingProposals.map((p: any) => renderProposalCard(p))
            )}
          </div>

          {/* Collapsible Processed Proposals Archive */}
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm"
              style={{ width: '100%', justifyContent: 'space-between' }}
              onClick={() => setShowProcessedHistory(!showProcessedHistory)}
            >
              <span>Lịch sử đề xuất đã xử lý ({processedGroups.length} nhóm)</span>
              {showProcessedHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {showProcessedHistory && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {processedGroups.map(({ item, count }) => renderProposalCard(item, count))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DESIGN BRIEF SUMMARY */}
      {subTab === 'brief' && project && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: 'var(--app-bg)' }}>
          <div className="surface-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="text-card-title">Hồ Sơ Thiết Kế (Design Brief)</div>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Phong cách chủ đạo:</span>{' '}
              <strong>{project.design_brief?.style}</strong>
            </div>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Công năng:</span>{' '}
              <strong>{project.design_brief?.room_function}</strong>
            </div>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Ngân sách trần:</span>{' '}
              <strong className="mono" style={{ color: 'var(--accent)' }}>
                {formatVnd(project.design_brief?.budget_limit_vnd)}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Bảng màu chủ đạo:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(project.design_brief?.color_palette || []).map((hex: string) => (
                  <div
                    key={hex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--surface-secondary)',
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: hex,
                        border: '1px solid rgba(0,0,0,0.15)',
                      }}
                    />
                    <span className="mono">{hex}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Yếu tố ưu tiên:</span>{' '}
              {(project.design_brief?.liked_elements || []).join(', ')}
            </div>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Ràng buộc bắt buộc:</span>{' '}
              {(project.design_brief?.must_have_constraints || []).join(' • ')}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
