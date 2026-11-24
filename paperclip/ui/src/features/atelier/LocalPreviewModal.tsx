/**
 * ATELIER AI — "Xuất link 3D — Local Preview" (FEAT-2026-165).
 * Publishes the SAVED scene revision to the LAN preview server. Local network only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, QrCode, RefreshCw, Save, Smartphone, StopCircle, X } from 'lucide-react'

const API_BASE = '/api/v1'

interface NetworkCandidate { ip: string; adapter: string; virtual: boolean; recommended: boolean }
interface NetworkInfo {
  server: { running: boolean; port: number; bind: string; error: string | null }
  candidates: NetworkCandidate[]
  selected_ip: string | null
  firewall_hint: string
}
interface ShareInfo {
  publication_id: string
  status: 'active' | 'revoked'
  revision: number
  url: string
  created_at: string
  updated_at: string
  package?: { size_bytes: number; asset_count: number }
  warnings?: string[]
}
interface DiagnosticsInfo {
  checks: Array<{ id: string; label: string; ok: boolean | null; detail: string }>
  lan_reachable: 'verified_from_this_pc' | 'not_verified'
  troubleshooting: string[]
}
interface UiError { title: string; detail?: string; missing?: string[] }

interface LocalPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  project: any
  onSaveScene: () => Promise<void>
  busy: boolean
}

const VOLATILE_KEYS = new Set(['updated_at', 'estimate_snapshot', 'revision'])

function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => !VOLATILE_KEYS.has(key))
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isLoopbackHost(host: string) {
  const value = host.trim().toLowerCase()
  return value === 'localhost' || value === '0.0.0.0' || value === '::1' || value.startsWith('127.')
}

function hostOfUrl(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function formatBytes(bytes?: number) {
  if (!bytes && bytes !== 0) return 'Chưa có'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function toUiError(response: Response | null, fallback: string, cause?: unknown): Promise<UiError> {
  if (!response) {
    return {
      title: 'Không kết nối được API Atelier (cổng 8000).',
      detail: cause instanceof Error ? cause.message : fallback,
    }
  }
  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const detail = body?.detail
  const code: string = typeof detail === 'object' && detail ? String(detail.code || '') : ''
  const message: string = typeof detail === 'string' ? detail : detail?.message || ''
  const missing: string[] | undefined = Array.isArray(detail?.missing_assets)
    ? detail.missing_assets.map((item: any) => (typeof item === 'string' ? item : item?.name || item?.asset_id || JSON.stringify(item)))
    : undefined
  switch (code) {
    case 'preview_server_down':
      return { title: 'Server preview chưa chạy.', detail: 'Chạy scripts\\start-preview.ps1 rồi thử lại. ' + message }
    case 'no_lan_ip':
      return { title: 'Không tìm thấy địa chỉ IP LAN phù hợp.', detail: 'Kết nối Wi-Fi/LAN hoặc nhập IP thủ công. ' + message }
    case 'port_busy':
      return { title: 'Cổng preview đang bị chiếm.', detail: 'Đóng chương trình đang dùng cổng này hoặc đổi cổng. ' + message }
    case 'scene_not_saved':
      return { title: 'Scene chưa được lưu.', detail: 'Bấm "Lưu Scene" trước khi xuất link. ' + message }
    case 'missing_assets':
    case 'missing_glb':
      return {
        title: 'Thiếu file GLB cục bộ nên không thể publish offline.',
        detail: 'Hệ thống không thay bằng mô hình giả. Hãy nhập các asset này vào thư viện cục bộ. ' + message,
        missing,
      }
    case 'export_failed':
      return { title: 'Xuất gói preview thất bại.', detail: message }
    default:
      return { title: message || `${fallback} (HTTP ${response.status})`, missing }
  }
}

export const LocalPreviewModal: React.FC<LocalPreviewModalProps> = ({ isOpen, onClose, project, onSaveScene, busy }) => {
  const projectId: string | undefined = project?.project_id
  const [serverProject, setServerProject] = useState<any | null>(null)
  const [network, setNetwork] = useState<NetworkInfo | null>(null)
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null)
  const [selectedIp, setSelectedIp] = useState('')
  const [manualIp, setManualIp] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<UiError | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshedFrom, setRefreshedFrom] = useState<{ from: number; to: number } | null>(null)
  const linkInputRef = useRef<HTMLInputElement | null>(null)

  const activeShare = useMemo(() => shares.find((item) => item.status === 'active') || null, [shares])
  const effectiveIp = (manualIp.trim() || selectedIp).trim()
  const chosenCandidate = network?.candidates.find((item) => item.ip === effectiveIp)
  const loopbackBlocked = effectiveIp !== '' && isLoopbackHost(effectiveIp)
  const activeHostBad = activeShare ? isLoopbackHost(hostOfUrl(activeShare.url)) : false

  const dirty = useMemo(() => {
    if (!project || !serverProject) return false
    return stableStringify(project) !== stableStringify(serverProject)
  }, [project, serverProject])

  const loadAll = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const [projectRes, networkRes, sharesRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}`),
        fetch(`${API_BASE}/preview/network`),
        fetch(`${API_BASE}/projects/${projectId}/preview-shares`),
      ])
      if (projectRes.ok) setServerProject(await projectRes.json())
      if (networkRes.ok) {
        const info: NetworkInfo = await networkRes.json()
        setNetwork(info)
        setSelectedIp((current) => current || info.selected_ip || info.candidates.find((item) => item.recommended)?.ip || '')
      } else {
        setError(await toUiError(networkRes, 'Không đọc được thông tin mạng'))
      }
      if (sharesRes.ok) {
        const body = await sharesRes.json()
        setShares(Array.isArray(body.shares) ? body.shares : [])
      }
    } catch (cause) {
      setError(await toUiError(null, 'Không tải được dữ liệu preview', cause))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadDiagnostics = useCallback(async (publicationId: string) => {
    try {
      const response = await fetch(`${API_BASE}/preview-shares/${publicationId}/diagnostics`)
      if (response.ok) setDiagnostics(await response.json())
    } catch {
      setDiagnostics(null)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setShowQr(false)
    setConfirmStop(false)
    setRefreshedFrom(null)
    setDiagnostics(null)
    void loadAll()
  }, [isOpen, loadAll])

  useEffect(() => {
    if (isOpen && activeShare) void loadDiagnostics(activeShare.publication_id)
  }, [isOpen, activeShare?.publication_id, activeShare?.revision, loadDiagnostics])

  const post = useCallback(async (path: string, body?: unknown) => {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!response.ok) {
        setError(await toUiError(response, 'Thao tác thất bại'))
        return null
      }
      return await response.json()
    } catch (cause) {
      setError(await toUiError(null, 'Thao tác thất bại', cause))
      return null
    }
  }, [])

  const handleGenerate = async () => {
    if (!projectId || dirty || loopbackBlocked) return
    setWorking('generate')
    setError(null)
    const result = await post(`/projects/${projectId}/preview-shares`, effectiveIp ? { lan_ip: effectiveIp } : {})
    if (result) {
      setRefreshedFrom(null)
      await loadAll()
    }
    setWorking(null)
  }

  const handleRefreshPublished = async () => {
    if (!activeShare || dirty || loopbackBlocked) return
    setWorking('refresh')
    setError(null)
    const previous = activeShare.revision
    const result = await post(`/preview-shares/${activeShare.publication_id}/refresh`, effectiveIp ? { lan_ip: effectiveIp } : {})
    if (result) {
      setRefreshedFrom({ from: previous, to: Number(result.revision ?? previous) })
      await loadAll()
    }
    setWorking(null)
  }

  const handleStop = async () => {
    if (!activeShare) return
    setWorking('stop')
    setError(null)
    const result = await post(`/preview-shares/${activeShare.publication_id}/revoke`)
    if (result) {
      setConfirmStop(false)
      setShowQr(false)
      setDiagnostics(null)
      await loadAll()
    }
    setWorking(null)
  }

  const handleSave = async () => {
    setWorking('save')
    await onSaveScene()
    await loadAll()
    setWorking(null)
  }

  const handleCopy = async () => {
    if (!activeShare) return
    try {
      await navigator.clipboard.writeText(activeShare.url)
    } catch {
      const input = linkInputRef.current
      if (input) {
        input.focus()
        input.select()
        document.execCommand('copy')
      }
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!isOpen || !project) return null

  const serverRevision = serverProject?.revision ?? project.revision
  const sceneName = project.rooms?.[0]?.name || project.name
  const packageInfo = activeShare?.package
  const generateDisabled = Boolean(busy || working || dirty || loopbackBlocked || !network?.server.running || !effectiveIp)

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Xuất link 3D — Local Preview" data-testid="local-preview-modal">
        <div style={{ height: 54, padding: '0 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Smartphone size={16} style={{ color: 'var(--accent)' }} />
            <span>Xuất link 3D — Local Preview</span>
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Đóng"><X size={15} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="surface-card" style={{ padding: 12, fontSize: 12, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Dự án</span><strong>{project.name}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Scene</span><span>{sceneName}</span>
            <span style={{ color: 'var(--text-muted)' }}>Revision đã lưu</span><span className="status-badge teal" style={{ justifySelf: 'start' }}>Rev #{serverRevision}</span>
            <span style={{ color: 'var(--text-muted)' }}>Phạm vi</span><span>Toàn bộ scene</span>
            <span style={{ color: 'var(--text-muted)' }}>Local Preview</span>
            <span>
              {activeShare ? <span className="status-badge emerald">Đang chia sẻ (Rev #{activeShare.revision})</span> : <span className="status-badge amber">Chưa chia sẻ</span>}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>Tối ưu mobile</span>
            <span>
              {packageInfo
                ? `Gói ${formatBytes(packageInfo.size_bytes)} · ${packageInfo.asset_count} GLB`
                : 'Chưa có gói — sẽ tính khi tạo link'}
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Chỉ dùng trong mạng LAN tin cậy (HTTP, không mã hóa). Điện thoại và máy tính phải cùng một mạng Wi-Fi. Máy này không thể xác nhận điện thoại có truy cập được hay không.
          </div>

          {loading ? <div style={{ fontSize: 12 }}>Đang tải trạng thái...</div> : null}

          {dirty ? (
            <div className="surface-card" role="alert" style={{ padding: 12, borderColor: 'var(--amber, #d97706)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <AlertTriangle size={14} /> Scene có thay đổi chưa lưu
              </div>
              <div style={{ fontSize: 12 }}>Link chỉ được tạo từ revision đã lưu. Hãy lưu Scene trước khi xuất link.</div>
              <div>
                <button type="button" className="btn btn-sm btn-primary" data-testid="preview-save-first" disabled={busy || Boolean(working)} onClick={() => void handleSave()}>
                  <Save size={13} /> Lưu Scene
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="surface-card" role="alert" data-testid="preview-error" style={{ padding: 12, borderColor: 'var(--danger, #dc2626)', fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{error.title}</div>
              {error.detail ? <div style={{ marginTop: 4 }}>{error.detail}</div> : null}
              {error.missing && error.missing.length > 0 ? (
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {error.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          {network && !network.server.running ? (
            <div className="surface-card" role="alert" style={{ padding: 12, fontSize: 12 }}>
              <strong>Server preview chưa chạy</strong> (cổng {network.server.port}).{' '}
              {network.server.error ? `${network.server.error} ` : ''}Chạy <span className="mono">scripts\start-preview.ps1</span> rồi mở lại hộp thoại này.
            </div>
          ) : null}

          {network ? (
            <div className="surface-card" style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Địa chỉ LAN</div>
              {network.candidates.length === 0 ? (
                <div>Không tìm thấy IP LAN. Kết nối Wi-Fi/LAN hoặc nhập IP thủ công bên dưới.</div>
              ) : (
                <select
                  aria-label="Chọn IP LAN"
                  className="field-select"
                  value={manualIp.trim() ? '' : selectedIp}
                  onChange={(event) => { setSelectedIp(event.target.value); setManualIp('') }}
                >
                  {network.candidates.map((item) => (
                    <option key={item.ip} value={item.ip}>
                      {item.ip} — {item.adapter}{item.virtual ? ' (ảo/VPN)' : ''}{item.recommended ? ' (khuyến nghị)' : ''}
                    </option>
                  ))}
                  {manualIp.trim() ? <option value="">(đang dùng IP nhập tay)</option> : null}
                </select>
              )}
              <input
                aria-label="Nhập IP LAN thủ công"
                className="field-input"
                placeholder="Hoặc nhập IP thủ công, ví dụ 192.168.1.100"
                value={manualIp}
                onChange={(event) => setManualIp(event.target.value)}
              />
              {chosenCandidate?.virtual ? (
                <div style={{ color: 'var(--amber, #d97706)' }}>
                  <AlertTriangle size={12} /> Đây là adapter ảo/VPN; điện thoại thường không truy cập được địa chỉ này.
                </div>
              ) : null}
              {loopbackBlocked ? (
                <div role="alert" style={{ color: 'var(--danger, #dc2626)' }}>
                  <AlertTriangle size={12} /> localhost/127.0.0.1 chỉ truy cập được từ chính máy này nên bị chặn. Chọn IP LAN thật.
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {!activeShare ? (
              <button type="button" className="btn btn-sm btn-primary" data-testid="preview-generate" disabled={generateDisabled} onClick={() => void handleGenerate()}>
                {working === 'generate' ? 'Đang tạo gói...' : 'Generate Local Link'}
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-sm" data-testid="preview-copy" onClick={() => void handleCopy()} disabled={activeHostBad}>
                  {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />} {copied ? 'Đã sao chép' : 'Copy Link'}
                </button>
                <button type="button" className="btn btn-sm" data-testid="preview-qr" onClick={() => setShowQr((value) => !value)}>
                  <QrCode size={13} /> {showQr ? 'Ẩn QR' : 'Show QR Code'}
                </button>
                <button type="button" className="btn btn-sm" data-testid="preview-open" onClick={() => window.open(activeShare.url, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink size={13} /> Open Preview
                </button>
                <button type="button" className="btn btn-sm" data-testid="preview-refresh" disabled={Boolean(busy || working || dirty || loopbackBlocked)} onClick={() => void handleRefreshPublished()}>
                  <RefreshCw size={13} /> {working === 'refresh' ? 'Đang cập nhật...' : 'Refresh Published Version'}
                </button>
                <button type="button" className="btn btn-sm" data-testid="preview-stop" disabled={Boolean(working)} onClick={() => setConfirmStop(true)}>
                  <StopCircle size={13} /> Stop Sharing
                </button>
              </>
            )}
          </div>

          {confirmStop && activeShare ? (
            <div className="surface-card" role="alertdialog" style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>Dừng chia sẻ sẽ thu hồi link ngay lập tức; mọi thiết bị đang mở sẽ không tải được dữ liệu nữa.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm btn-primary" data-testid="preview-stop-confirm" disabled={Boolean(working)} onClick={() => void handleStop()}>Xác nhận dừng</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmStop(false)}>Hủy</button>
              </div>
            </div>
          ) : null}

          {activeShare ? (
            <div className="surface-card" style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={linkInputRef} readOnly aria-label="Link xem 3D" className="field-input mono" value={activeShare.url} onFocus={(event) => event.currentTarget.select()} />
              {activeHostBad ? (
                <div role="alert" style={{ color: 'var(--danger, #dc2626)' }}>
                  <AlertTriangle size={12} /> Link này dùng localhost nên điện thoại không mở được. Chọn IP LAN và bấm Refresh Published Version.
                </div>
              ) : null}
              <div style={{ color: 'var(--text-muted)' }}>
                Đang phát hành Rev #{activeShare.revision}
                {Number(activeShare.revision) < Number(serverRevision) ? ` — scene đã có Rev #${serverRevision}, bấm Refresh Published Version để cập nhật.` : ' (mới nhất).'}
              </div>
              {refreshedFrom ? <div className="status-badge emerald" style={{ alignSelf: 'start' }}>Đã cập nhật Rev #{refreshedFrom.from} → Rev #{refreshedFrom.to}</div> : null}
              {activeShare.warnings && activeShare.warnings.length > 0 ? (
                <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                  {activeShare.warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              {showQr ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img
                    data-testid="preview-qr-image"
                    alt="Mã QR mở link xem 3D"
                    src={`${API_BASE}/preview-shares/${activeShare.publication_id}/qr.svg?rev=${activeShare.revision}&u=${encodeURIComponent(activeShare.updated_at || '')}`}
                    style={{ width: 220, height: 220, background: '#fff', padding: 8, borderRadius: 8 }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>Quét bằng điện thoại cùng Wi-Fi.</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="surface-card" style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Chẩn đoán mạng</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>{network?.server.running ? '✔' : '✖'} Server preview: {network?.server.running ? `đang chạy, cổng ${network.server.port} (bind ${network.server.bind})` : 'không chạy'}</li>
              <li>{effectiveIp ? '✔' : '✖'} IP LAN: {effectiveIp || 'chưa có'}</li>
              <li>{activeShare ? '✔' : '–'} Scene publication: {activeShare ? `Rev #${activeShare.revision}` : 'chưa publish'}</li>
              {diagnostics?.checks.map((check) => (
                <li key={check.id}>{check.ok === true ? '✔' : check.ok === false ? '✖' : '–'} {check.label}: {check.detail}</li>
              ))}
            </ul>
            <div style={{ color: 'var(--text-muted)' }}>
              {diagnostics?.lan_reachable === 'verified_from_this_pc'
                ? 'Máy này truy cập được qua IP LAN, nhưng điều đó chưa chứng minh điện thoại truy cập được.'
                : 'Chưa xác nhận truy cập từ thiết bị khác. Hãy thử mở link trên điện thoại cùng Wi-Fi.'}
            </div>
            {network?.firewall_hint ? <div>{network.firewall_hint}</div> : null}
            <div style={{ fontWeight: 600, marginTop: 4 }}>Nếu điện thoại không mở được</div>
            <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
              {(diagnostics?.troubleshooting?.length ? diagnostics.troubleshooting : [
                'Đảm bảo điện thoại và máy tính cùng một mạng Wi-Fi (không dùng mạng khách/guest).',
                'Cho phép cổng preview qua Windows Firewall (mạng Private) — Atelier không tự thay đổi firewall.',
                'Tắt VPN hoặc chọn đúng IP của adapter Wi-Fi/Ethernet.',
                'Kiểm tra router không bật "AP isolation".',
              ]).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  )
}
