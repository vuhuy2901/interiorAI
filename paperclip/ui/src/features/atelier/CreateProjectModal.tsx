import React, { useState } from 'react'
import { X } from 'lucide-react'

export const CreateProjectModal: React.FC<{
  open: boolean
  onClose: () => void
  onCreated: (project: any) => void
}> = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState<any>({ name: '', description: '', width_mm: 4000, depth_mm: 5000, style: 'Japandi', budget_limit_vnd: 120000000, empty_furniture: false, room_type: 'living', scale_calibrated: true })
  const [saving, setSaving] = useState(false)
  const presets = [[4000, 5000, '4.0 × 5.0m · 20m²'], [5000, 6000, '5.0 × 6.0m · 30m²'], [3600, 4200, '3.6 × 4.2m · 15m²'], [6000, 7500, '6.0 × 7.5m · 45m²']]
  if (!open) return null
  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(await res.text())
      onCreated(await res.json())
    } finally { setSaving(false) }
  }
  return <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(23,25,28,.38)', display: 'grid', placeItems: 'center', padding: 20 }}>
    <div className="surface-card" style={{ width: 'min(680px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: 22, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Tạo dự án nội thất mới</h2><div className="text-caption">Khởi tạo workspace, chat KTS Trưởng và dữ liệu độc lập.</div></div><button className="btn btn-icon" onClick={onClose}><X size={16}/></button></div>
      <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        <label>Tên dự án *<input className="field-input" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Căn hộ Studio Vinhomes 35m²" /></label>
        <label>Mô tả / nhu cầu<textarea className="field-textarea" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <div><div style={{ fontSize: 12, marginBottom: 6 }}>Mẫu kích thước nhanh</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{presets.map(([w,d,label]) => <button key={String(label)} className="btn btn-sm" onClick={() => setForm({ ...form, width_mm: w, depth_mm: d })}>{label}</button>)}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Chiều rộng (mm)<input className="field-input" type="number" value={form.width_mm} onChange={e => setForm({ ...form, width_mm: Number(e.target.value) })}/></label><label>Chiều sâu (mm)<input className="field-input" type="number" value={form.depth_mm} onChange={e => setForm({ ...form, depth_mm: Number(e.target.value) })}/></label></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Loại phòng<select className="field-select" value={form.room_type} onChange={e => setForm({ ...form, room_type: e.target.value })}><option value="living">Phòng khách</option><option value="bedroom">Phòng ngủ</option><option value="office">Phòng làm việc</option><option value="kitchen">Phòng bếp</option></select></label><label>Phong cách<select className="field-select" value={form.style} onChange={e => setForm({ ...form, style: e.target.value })}>{['Japandi','Minimalist','Modern Indochine','Scandinavian','Wabi-Sabi','Modern Luxury'].map(x => <option key={x}>{x}</option>)}</select></label></div>
        <label>Ngân sách dự kiến (VNĐ)<input className="field-input" type="number" value={form.budget_limit_vnd} onChange={e => setForm({ ...form, budget_limit_vnd: Number(e.target.value) })}/></label>
        <div style={{ display: 'flex', gap: 6 }}>{[80000000,120000000,200000000,350000000].map(v => <button key={v} className="btn btn-sm" onClick={() => setForm({ ...form, budget_limit_vnd: v })}>{v/1000000} triệu</button>)}</div>
        <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={!form.empty_furniture} onChange={e => setForm({ ...form, empty_furniture: !e.target.checked })}/> Khởi tạo sẵn bộ nội thất mẫu theo kích thước phòng</label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={submit}>{saving ? 'Đang tạo…' : 'Tạo dự án & Mở không gian thiết kế'}</button></div>
      </div>
    </div>
  </div>
}
