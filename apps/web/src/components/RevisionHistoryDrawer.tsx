/**
 * ATELIER AI — Slide-Over Revision History & Snapshot Drawer (Section 13)
 * Displays version snapshots with Revision ID, timestamp, author/agent, description,
 * active badge, and 1-click Undo/Restore without losing audit history.
 */
import React from 'react'
import { History, RotateCcw, X, CheckCircle2 } from 'lucide-react'

interface RevisionHistoryDrawerProps {
  isOpen: boolean
  onClose: () => void
  project: any
  onRestoreRevision: (rev: number) => void
}

export const RevisionHistoryDrawer: React.FC<RevisionHistoryDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onRestoreRevision,
}) => {
  if (!isOpen || !project) return null

  const revisions = project.revisions || []

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        data-testid="revision-history-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Lịch sử phiên bản dự án"
      >
        <div
          style={{
            height: 54,
            padding: '0 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <History size={16} style={{ color: 'var(--accent)' }} />
            <span>Lịch Sử Phiên Bản (Revision Snapshots)</span>
          </div>
          <button
            data-testid="close-history-drawer-btn"
            className="btn btn-icon btn-sm"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '12px 18px', background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
          Dự án <strong>{project.name}</strong> đang ở phiên bản{' '}
          <span className="status-badge teal">Rev #{project.revision}</span>. Khôi phục phiên bản trước sẽ tạo một snapshot mới để bảo toàn toàn bộ lịch sử kiểm toán.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {revisions.map((r: any, idx: number) => {
            const isCurrent = idx === 0 && r.revision === project.revision
            return (
              <div
                key={r.id || `${r.revision}-${idx}`}
                data-testid={`revision-item-${r.revision}`}
                className="surface-card"
                style={{
                  padding: 14,
                  borderColor: isCurrent ? 'var(--accent)' : 'var(--border-subtle)',
                  background: isCurrent ? 'var(--accent-soft)' : 'var(--surface-primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="status-badge teal">Rev #{r.revision}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.author || 'System'}</span>
                  </div>
                  {isCurrent ? (
                    <span className="status-badge emerald">
                      <CheckCircle2 size={11} /> Hiện tại
                    </span>
                  ) : (
                    <button
                      data-testid={`restore-revision-${r.revision}`}
                      className="btn btn-sm"
                      onClick={() => {
                        onRestoreRevision(r.revision)
                        onClose()
                      }}
                    >
                      <RotateCcw size={12} /> Khôi phục
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 8, fontWeight: 500 }}>
                  {r.reason}
                </div>

                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Thời gian: {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '--'}
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
