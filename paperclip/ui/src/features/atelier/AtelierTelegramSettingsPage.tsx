import React, { useEffect, useState } from 'react'
import {
  Send,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  Users,
  Copy,
  ExternalLink,
  Trash2,
  Play,
  Square,
  Terminal,
  Clock,
  Radio,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react'

interface TelegramStatus {
  status: 'stopped' | 'polling' | 'connected' | 'error'
  botEnabled: boolean
  isConfigured: boolean
  tokenPreview: string | null
  botInfo: {
    id: number
    is_bot: boolean
    first_name: string
    username: string
  } | null
  lastPollAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  startedAt: string | null
  uptimeSeconds: number
  lastUpdateId: number
  stats: {
    incomingMessages: number
    tasksCreated: number
    commentsCreated: number
    approvalsProcessed: number
    errors: number
  }
  pairedUserCount: number
  whitelistedUserCount: number
  configuredChatIds: number[]
  notificationsEnabled: boolean
  inboundMode?: 'interactive' | 'notifications_only'
  defaultAgentId: string | null
}

interface AgentItem {
  id: string
  name: string
  role: string
  key: string
}

interface PairingItem {
  telegramUserId: number
  telegramUsername?: string
  telegramFirstName?: string
  paperclipUserId: string
  pairedAt: string
}

interface LogItem {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  details?: any
}

export const AtelierTelegramSettingsPage: React.FC = () => {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [pairings, setPairings] = useState<PairingItem[]>([])
  const [allowedChatIdsStr, setAllowedChatIdsStr] = useState('')
  const [allowedUserIdsStr, setAllowedUserIdsStr] = useState('')
  const [allowedUsernamesStr, setAllowedUsernamesStr] = useState('')
  const [logs, setLogs] = useState<LogItem[]>([])

  const [botTokenInput, setBotTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [botEnabled, setBotEnabled] = useState(true)
  const [defaultAgentId, setDefaultAgentId] = useState<string>('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [inboundMode, setInboundMode] = useState<'interactive' | 'notifications_only'>('notifications_only')
  const [notificationLevel, setNotificationLevel] = useState<'all' | 'mentions_and_tasks' | 'approvals_only'>('all')

  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activePairingCode, setActivePairingCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/atelier/telegram/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        setBotEnabled(data.botEnabled)
        setNotificationsEnabled(data.notificationsEnabled)
        setInboundMode(data.inboundMode === 'interactive' ? 'interactive' : 'notifications_only')
        if (data.defaultAgentId) setDefaultAgentId(data.defaultAgentId)
      }
    } catch {
      // ignore
    }
  }

  const fetchPairings = async () => {
    try {
      const res = await fetch('/api/atelier/telegram/pairings')
      if (res.ok) {
        const data = await res.json()
        setPairings(data.pairings || [])
        setAllowedChatIdsStr((data.allowedChatIds || []).join(', '))
        setAllowedUserIdsStr((data.allowedUserIds || []).join(', '))
        setAllowedUsernamesStr((data.allowedUsernames || []).join(', '))
      }
    } catch {
      // ignore
    }
  }

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/atelier/telegram/agents')
      if (res.ok) {
        const list = await res.json()
        setAgents(list)
        if (!defaultAgentId && list.length > 0) {
          const chief = list.find((a: any) => a.key === 'agent_chief_architect') || list[0]
          setDefaultAgentId(chief.id)
        }
      }
    } catch {
      // ignore
    }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/atelier/telegram/logs?limit=30')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchPairings()
    fetchAgents()
    fetchLogs()

    const interval = setInterval(() => {
      fetchStatus()
      fetchLogs()
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  const handleSaveConfig = async () => {
    setLoading(true)
    setActionMsg(null)
    try {
      const allowedChatIds = allowedChatIdsStr
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(Number)
        .filter((n) => Number.isSafeInteger(n))

      const allowedIds = allowedUserIdsStr
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(Number)
        .filter((n) => !isNaN(n))

      const allowedNames = allowedUsernamesStr
        .split(',')
        .map((s) => s.trim().replace('@', ''))
        .filter((s) => s.length > 0)

      const payload: any = {
        botEnabled,
        defaultAgentId,
        notificationsEnabled,
        inboundMode,
        notificationLevel,
        allowedChatIds,
        allowedUserIds: allowedIds,
        allowedUsernames: allowedNames,
      }

      if (botTokenInput.trim().length > 0) {
        payload.botToken = botTokenInput.trim()
      }

      const res = await fetch('/api/atelier/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (json.ok) {
        setActionMsg({ type: 'success', text: 'Đã lưu cấu hình Telegram và khởi động lại Poller thành công!' })
        setBotTokenInput('')
        fetchStatus()
        fetchPairings()
      } else {
        setActionMsg({ type: 'error', text: json.error || 'Lỗi khi lưu cấu hình' })
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleTestChat = async () => {
    setLoading(true)
    setActionMsg(null)
    try {
      const firstChatId = allowedChatIdsStr
        .split(',')
        .map((value) => Number(value.trim()))
        .find((value) => Number.isSafeInteger(value))

      if (firstChatId === undefined) {
        setActionMsg({ type: 'error', text: 'Hãy nhập Chat ID trước khi gửi tin nhắn thử.' })
        return
      }

      const res = await fetch('/api/atelier/telegram/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: firstChatId,
          botToken: botTokenInput.trim() || undefined,
        }),
      })
      const json = await res.json()
      setActionMsg(json.ok
        ? { type: 'success', text: json.message }
        : { type: 'error', text: json.error || 'Không gửi được tin nhắn thử' })
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setLoading(true)
    setActionMsg(null)
    try {
      const res = await fetch('/api/atelier/telegram/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botTokenInput || undefined }),
      })
      const json = await res.json()
      if (json.ok) {
        setActionMsg({ type: 'success', text: json.message })
        fetchStatus()
      } else {
        setActionMsg({ type: 'error', text: json.error || 'Kiểm tra thất bại' })
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePairingCode = async () => {
    try {
      const res = await fetch('/api/atelier/telegram/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'local-board' }),
      })
      const json = await res.json()
      if (json.ok) {
        setActivePairingCode({ code: json.pairingCode, expiresAt: json.expiresAt })
        fetchLogs()
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    }
  }

  const handleUnpairUser = async (userId: number) => {
    try {
      const res = await fetch(`/api/atelier/telegram/pairings/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        setActionMsg({ type: 'success', text: `Đã hủy liên kết tài khoản Telegram ${userId}` })
        fetchPairings()
        fetchStatus()
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    }
  }

  const handleToggleBridge = async (enable: boolean) => {
    try {
      const res = await fetch('/api/atelier/telegram/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable }),
      })
      if (res.ok) {
        fetchStatus()
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message })
    }
  }

  const isPolling = status?.status === 'polling'
  const isError = status?.status === 'error'

  return (
    <div className="page-container" style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Send size={18} />
            </div>
            <div>
              <h1 className="text-page-title" style={{ fontSize: 20, margin: 0 }}>
                Trung Tâm Điều Khiển Telegram Agent (2 Chiều)
              </h1>
              <p className="text-body" style={{ margin: '2px 0 0 0', fontSize: 13, color: '#52525B' }}>
                Giao việc tự nhiên, hỏi đáp, nhận thông báo tiến độ và phê duyệt phương án thiết kế trực tiếp từ Telegram.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => handleToggleBridge(!isPolling)}>
            {isPolling ? <Square size={14} color="#E11D48" /> : <Play size={14} color="#059669" />}
            {isPolling ? 'Dừng Polling' : 'Bật Polling'}
          </button>
          <button className="btn" onClick={handleTestConnection} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Kiểm tra kết nối
          </button>
          <button className="btn btn-primary" onClick={handleTestChat} disabled={loading}>
            <Radio size={14} /> Gửi thử tới Chat ID
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: actionMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            color: actionMsg.type === 'success' ? '#166534' : '#991B1B',
            border: `1px solid ${actionMsg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          }}
        >
          {actionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Live Status Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>TRẠNG THÁI BRIDGE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isPolling ? '#10B981' : isError ? '#EF4444' : '#94A3B8',
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>
              {isPolling ? 'Đang Polling (Live)' : isError ? 'Lỗi kết nối' : 'Đã dừng'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            Uptime: {status?.uptimeSeconds || 0}s • Checkpoint: #{status?.lastUpdateId || 0}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>BOT TELEGRAM</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0F766E', marginTop: 6 }}>
            {status?.botInfo ? `@${status.botInfo.username}` : 'Chưa kết nối'}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            {status?.botInfo ? `${status.botInfo.first_name} (ID: ${status.botInfo.id})` : 'Token chưa hợp lệ'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>TÀI KHOẢN ĐÃ GHÉP NỐI</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginTop: 6 }}>
            {pairings.length} người dùng
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            Whitelist ID: {status?.whitelistedUserCount || 0}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>THỐNG KÊ ĐIỀU PHỐI</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginTop: 6 }}>
            {status?.stats.tasksCreated || 0} Task • {status?.stats.approvalsProcessed || 0} Phê duyệt
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            {status?.stats.incomingMessages || 0} tin nhắn • {status?.stats.commentsCreated || 0} comment
          </div>
        </div>
      </div>

      {/* Main Grid: Config Form & Pairing Management */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginTop: 18 }}>
        {/* Left Column: Config Form */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Key size={18} color="#0F766E" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0F172A' }}>
              Cấu Hình Token & Quyền Điều Phối
            </h2>
          </div>

          {/* Bot Token Input */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
              Telegram Bot Token (Từ @BotFather)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder={status?.tokenPreview || 'Dán Bot Token dạng 123456789:AA...'}
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 36px 8px 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                  }}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <ExternalLink size={13} /> BotFather
              </a>
            </div>
            <p style={{ fontSize: 11, color: '#64748B', marginTop: 4, margin: '4px 0 0 0' }}>
              🔒 Token được lưu trữ bảo mật cục bộ, không gửi ra ngoài và không hiển thị đầy đủ trong giao diện.
            </p>
          </div>

          {/* Direct notification and command Chat IDs */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
              Telegram Chat ID nhận báo cáo và giao việc
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="VD: 6556722178 (nhóm có thể là số âm)"
              value={allowedChatIdsStr}
              onChange={(e) => setAllowedChatIdsStr(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                fontFamily: 'monospace',
              }}
            />
            <p style={{ fontSize: 11, color: '#64748B', margin: '4px 0 0 0' }}>
              Có thể nhập nhiều Chat ID, cách nhau bằng dấu phẩy. Chat đã cấu hình sẽ nhận thông báo task hoàn thành và tiến độ dự án.
            </p>
          </div>

          {/* Default Agent Picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
              Agent Điều Phối Mặc Định (Default Coordinator)
            </label>
            <select
              value={defaultAgentId}
              onChange={(e) => setDefaultAgentId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                background: '#fff',
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: '#64748B', marginTop: 4, margin: '4px 0 0 0' }}>
              Agent này sẽ tiếp nhận các yêu cầu chung từ Telegram khi người dùng không chỉ định đích danh Agent.
            </p>
          </div>

          {/* Notification toggles */}
          <div style={{ marginBottom: 16, borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>Bật thông báo Telegram</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>
                  Gửi thông báo task hoàn thành kèm tiến độ dự án về Telegram.
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#0F766E' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>Chỉ nhận thông báo từ Telegram</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>
                  Giao task, gửi phản hồi và phê duyệt thực hiện trên web; Telegram chỉ báo task đã xong kèm tiến độ.
                </div>
              </div>
              <input
                type="checkbox"
                checked={inboundMode === 'notifications_only'}
                onChange={(e) => setInboundMode(e.target.checked ? 'notifications_only' : 'interactive')}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#0F766E' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>Mức độ thông báo</label>
              <select
                value={notificationLevel}
                onChange={(e) => setNotificationLevel(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 12,
                  background: '#fff',
                }}
              >
                <option value="all">Tất cả (Task, Chat, Phê duyệt)</option>
                <option value="mentions_and_tasks">Chỉ Task và Phê duyệt</option>
                <option value="approvals_only">Chỉ Phê duyệt phương án</option>
              </select>
            </div>
          </div>

          {/* Whitelist Settings */}
          <div style={{ marginBottom: 16, borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                Whitelist Telegram User ID (Cách nhau dấu phẩy)
              </label>
              <input
                type="text"
                placeholder="VD: 12345678, 87654321"
                value={allowedUserIdsStr}
                onChange={(e) => setAllowedUserIdsStr(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                Whitelist Telegram Usernames (Không cần @)
              </label>
              <input
                type="text"
                placeholder="VD: architect_tuan, designer_mai"
                value={allowedUsernamesStr}
                onChange={(e) => setAllowedUsernamesStr(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveConfig}
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu Cấu Hình & Cập Nhật Poller
          </button>
        </div>

        {/* Right Column: User Pairing Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Pairing Code Generator */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Shield size={18} color="#0F766E" />
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0F172A' }}>
                Ghép Nối Tài Khoản Bằng Mã (Pairing Code)
              </h2>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px 0' }}>
              Tạo mã 6 ký tự dùng một lần (hết hạn sau 15 phút) để người dùng gửi cho Bot và xác thực quyền giao việc.
            </p>

            {activePairingCode ? (
              <div
                style={{
                  background: '#F0FDFA',
                  border: '1px dashed #0F766E',
                  borderRadius: 8,
                  padding: 14,
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, textTransform: 'uppercase' }}>
                  Mã Ghép Nối Hoạt Động
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: '#134E4A',
                    fontFamily: 'monospace',
                    margin: '8px 0',
                  }}
                >
                  {activePairingCode.code}
                </div>
                <div style={{ fontSize: 12, color: '#52525B' }}>
                  Gửi tin nhắn: <code style={{ background: '#E0F2FE', padding: '2px 6px', borderRadius: 4 }}>/pair {activePairingCode.code}</code> vào Telegram Bot.
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    navigator.clipboard.writeText(`/pair ${activePairingCode.code}`)
                    setCopiedCode(true)
                    setTimeout(() => setCopiedCode(false), 2000)
                  }}
                  style={{ marginTop: 10, fontSize: 11 }}
                >
                  <Copy size={12} /> {copiedCode ? 'Đã sao chép lệnh!' : 'Sao chép cú pháp lệnh'}
                </button>
              </div>
            ) : null}

            <button
              className="btn"
              onClick={handleGeneratePairingCode}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Sparkles size={14} color="#0F766E" /> Tạo Mã Ghép Nối Mới
            </button>
          </div>

          {/* Paired Users Table */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} color="#0F766E" />
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0F172A' }}>
                  Tài Khoản Đang Liên Kết ({pairings.length})
                </h2>
              </div>
              <button className="btn" onClick={fetchPairings} style={{ fontSize: 11, padding: '4px 8px' }}>
                <RefreshCw size={11} /> Làm mới
              </button>
            </div>

            {pairings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: '#94A3B8', fontSize: 13 }}>
                Chưa có tài khoản Telegram nào được ghép nối. Hãy tạo mã và kết nối!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {pairings.map((p) => (
                  <div
                    key={p.telegramUserId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                        @{p.telegramUsername || p.telegramFirstName || 'User'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        ID: <code style={{ fontFamily: 'monospace' }}>{p.telegramUserId}</code> • Ngày nối:{' '}
                        {new Date(p.pairedAt).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnpairUser(p.telegramUserId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#E11D48',
                        padding: 4,
                      }}
                      title="Hủy liên kết"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Guide Card: Commands & Natural Language Cheat Sheet */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Terminal size={18} color="#0F766E" />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Cú Pháp Lệnh & Giao Việc Bằng Ngôn Ngữ Tự Nhiên
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
              📋 10 Lệnh Điều Khiển Trực Tiếp
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.8, color: '#334155', fontFamily: 'monospace' }}>
              <div><b>/start</b> — Kết nối & ghép nối tài khoản</div>
              <div><b>/agents</b> — Xem danh sách 8 Agent chuyên trách</div>
              <div><b>/newtask</b> — Giao công việc mới qua menu chọn Agent</div>
              <div><b>/tasks</b> — Danh sách công việc đang thực hiện</div>
              <div><b>/task &lt;mã&gt;</b> — Xem chi tiết công việc (VD: /task ATL-1)</div>
              <div><b>/approvals</b> — Xem đề xuất chờ duyệt (Nút Duyệt/Từ chối)</div>
              <div><b>/status</b> — Trạng thái hệ thống Local-Lite (RAM, CPU)</div>
              <div><b>/progress</b> — Tiến độ thực hiện dự án</div>
              <div><b>/report</b> — Báo cáo tổng hợp dự án mẫu</div>
              <div><b>/cancel &lt;mã&gt;</b> — Hủy công việc (VD: /cancel ATL-8)</div>
            </div>
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
              💬 Mẫu Câu Giao Việc Tự Nhiên (Được Hỗ Trợ Đầy Đủ)
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: '#334155' }}>
              <div style={{ marginBottom: 6 }}>
                👉 <b>Giao việc cho Geometry Agent:</b><br />
                <i>&quot;Giao cho Geometry Agent dựng một căn phòng 4×5m, có một cửa ra vào và hai cửa sổ.&quot;</i>
              </div>
              <div style={{ marginBottom: 6 }}>
                👉 <b>Trao đổi với KTS Trưởng:</b><br />
                <i>&quot;KTS Trưởng ơi, tư vấn phong cách thiết kế Japandi cho phòng khách mẫu.&quot;</i>
              </div>
              <div>
                👉 <b>Yêu cầu Dự toán & Bóc tách:</b><br />
                <i>&quot;Nhờ Cost Estimator tính toán lại ngân sách theo gói Tiêu chuẩn An Cường.&quot;</i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="#0F766E" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0F172A' }}>
              Nhật Ký Hoạt Động & Tin Nhắn Thời Gian Thực
            </h2>
          </div>
          <button className="btn" onClick={fetchLogs} style={{ fontSize: 11, padding: '4px 8px' }}>
            <RefreshCw size={11} /> Làm mới
          </button>
        </div>

        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', width: 90 }}>CẤP ĐỘ</th>
                <th style={{ padding: '8px 12px', width: 140 }}>THỜI GIAN</th>
                <th style={{ padding: '8px 12px' }}>NỘI DUNG SỰ KIỆN</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#94A3B8' }}>
                    Chưa có nhật ký ghi nhận.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '6px 12px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                          background: l.level === 'error' ? '#FEE2E2' : l.level === 'warn' ? '#FEF3C7' : '#E0F2FE',
                          color: l.level === 'error' ? '#991B1B' : l.level === 'warn' ? '#92400E' : '#0369A1',
                        }}
                      >
                        {l.level}
                      </span>
                    </td>
                    <td style={{ padding: '6px 12px', color: '#64748B', fontFamily: 'monospace' }}>
                      {new Date(l.timestamp).toLocaleTimeString('vi-VN')}
                    </td>
                    <td style={{ padding: '6px 12px', color: '#1E293B' }}>{l.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
