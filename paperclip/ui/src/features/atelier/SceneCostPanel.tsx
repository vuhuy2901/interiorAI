import { useEffect, useState, type FormEvent } from 'react';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
type Line = { id: string; title: string; specification: string; gross_quantity: number; unit: string; unit_price_vnd: number; subtotal_vnd: number; price_status: string; source_label: string; source_note: string; source_url?: string; checked_at: string };
type Estimate = { revision: number; scene_asset_hash: string; lines: Line[]; total_vnd: number; tax_vnd: number; tax_rate: number; reference_subtotal_vnd: number; known_subtotal_vnd: number; priced_line_count: number; unpriced_line_count: number; price_coverage_percent: number; total_is_complete: boolean; disclaimer: string };

export function SceneCostPanel({ project, onRefresh }: { project: any; onRefresh: () => Promise<void> }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const base = `/api/v1/projects/${encodeURIComponent(project.project_id)}`;
  async function load(signal?: AbortSignal) {
    const response = await fetch(`${base}/cost-workflow`, { signal });
    if (!response.ok) throw new Error(`Không tải được dự toán (${response.status})`);
    const data = await response.json();
    if (data.asset_hash !== project.external_scene.sha256) throw new Error('Cảnh đã thay đổi. Hãy mở lại dự toán.');
    setEstimate(data.estimate);
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [base, project.revision, project.external_scene.sha256]);
  async function refresh() {
    setBusy(true); setError('');
    try { await load(); await onRefresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${base}/cost-items/${encodeURIComponent(editing.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_hash: project.external_scene.sha256, unit_price_vnd: Number(form.get('price')), quantity: Number(form.get('quantity')), unit: form.get('unit'), price_status: form.get('status'), source_note: form.get('note'), source_url: form.get('url') || null }),
      });
      if (!response.ok) { const data = await response.json(); throw new Error(typeof data.detail === 'string' ? data.detail : `Không lưu được đơn giá (${response.status})`); }
      setEstimate(await response.json()); setEditing(null); await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!editing) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${base}/cost-items/${encodeURIComponent(editing.id)}?asset_hash=${encodeURIComponent(project.external_scene.sha256)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Không bỏ được giá nhập (${response.status})`);
      setEstimate(await response.json()); setEditing(null); await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const lines = estimate?.lines.filter(line => (!missingOnly || line.price_status === 'unknown') && `${line.title} ${line.specification}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))) ?? [];
  return <div className="page-container" data-testid="scene-cost-panel">
    <div className="page-header-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div><h1 className="text-page-title">Dự toán cảnh hiện tại</h1><p className="text-body">{project.name} · Rev #{project.revision}</p><p className="text-caption">Đơn giá được lưu riêng theo dự án và mô hình nguồn.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => void refresh()} disabled={busy}>Tính lại dự toán</button>
        <a className="btn" href={`/api/v1/exports/${encodeURIComponent(project.project_id)}/csv`} download>Xuất CSV</a>
        <a className="btn btn-primary" href={`/api/v1/exports/${encodeURIComponent(project.project_id)}/xlsx`} download>Xuất Excel</a>
      </div>
    </div>
    {error && <p role="alert" className="surface-card" style={{ color: 'var(--destructive, #b42318)' }}>{error} <button className="btn" onClick={() => void refresh()} disabled={busy}>Thử lại</button></p>}
    {!estimate ? <p role="status">Đang bóc tách dự toán từ cảnh GLB…</p> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="surface-card"><div className="text-caption">TẠM TÍNH PHẦN CÓ GIÁ · GỒM VAT GIẢ ĐỊNH {estimate.tax_rate * 100}%</div><strong className="mono text-xl">{estimate.priced_line_count ? money(estimate.total_vnd) : 'Chưa có giá'}</strong><p className="text-caption">Chưa phải báo giá toàn công trình</p></div>
        <div className="surface-card"><div className="text-caption">GIÁ THAM KHẢO · TRƯỚC VAT</div><strong className="mono text-xl">{money(estimate.reference_subtotal_vnd)}</strong><p className="text-caption">Sản phẩm đối chiếu có thể khác mẫu, kích thước và vật liệu GLB</p></div>
        <div className="surface-card"><div className="text-caption">GIÁ ĐÃ NHẬP · TRƯỚC VAT</div><strong className="mono text-xl">{money(estimate.known_subtotal_vnd)}</strong><p className="text-caption">Giá người dùng cung cấp, chưa xác minh độc lập</p></div>
        <div className="surface-card"><div className="text-caption">ĐỘ PHỦ ĐƠN GIÁ</div><strong className="text-xl">{estimate.priced_line_count}/{estimate.lines.length} hạng mục · {estimate.price_coverage_percent}%</strong><p className="text-caption">Còn {estimate.unpriced_line_count} hạng mục cần bổ sung</p></div>
      </div>
      <div className="surface-card" style={{ marginBottom: 16 }} data-testid="cost-workflow-status">
        {project.design_brief?.budget_mode === 'estimate_first' && <p className="text-body">Lập dự toán trước, chưa giới hạn ngân sách.</p>}
        <strong>Cost / BOM → QA → Final Review</strong>
        <p className="text-body">{estimate.total_is_complete ? 'Đã có đơn giá cho các hạng mục. Cần agent kiểm tra nguồn, khối lượng và trình phê duyệt.' : 'Cost/BOM cần bổ sung dữ liệu giá hoặc khối lượng trước khi nghiệm thu.'}</p>
        <p className="text-caption">{estimate.disclaimer} Đây là độ phủ dự toán; trạng thái task của agent được theo dõi trong Công việc. Lưu giá không tự đánh dấu task hoàn thành.</p>
      </div>
      {editing && <form onSubmit={event => void save(event)} className="surface-card" style={{ marginBottom: 16 }} aria-label="Chỉnh đơn giá" key={editing.id}>
        <h2 className="text-lg font-semibold">Chỉnh đơn giá · {editing.title}</h2>
        <div className="grid gap-3 sm:grid-cols-3 my-3">
          <label>Đơn giá (VNĐ)<input className="field-input w-full" name="price" type="number" min="0" max="1000000000000" step="1" required defaultValue={editing.unit_price_vnd || ''} /></label>
          <label>Khối lượng<input className="field-input w-full" name="quantity" type="number" min="0.001" max="1000000" step="any" required defaultValue={editing.gross_quantity} /></label>
          <label>Đơn vị<input className="field-input w-full" name="unit" maxLength={30} required defaultValue={editing.unit} /></label>
          <label>Loại giá<select className="field-select w-full" name="status" defaultValue={editing.price_status === 'illustrative' ? 'illustrative' : 'provided_unverified'}><option value="illustrative">Giá tham khảo</option><option value="provided_unverified">Giá người dùng cung cấp</option></select></label>
          <label className="sm:col-span-2">Nguồn / căn cứ đơn giá<input className="field-input w-full" name="note" maxLength={1000} required defaultValue={editing.source_note} /></label>
          <label className="sm:col-span-3">Link nguồn (nếu có)<input className="field-input w-full" name="url" type="url" defaultValue={editing.source_url || ''} /></label>
        </div>
        <p className="text-caption mb-3">Nhập 0 để đánh dấu chưa có giá. Khối lượng theo bộ/gói GLB; chỉ đổi sang m² hoặc mét dài khi có số đo. Giá không làm thay đổi mô hình.</p>
        <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Lưu đơn giá'}</button><button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Hủy</button><button className="btn" type="button" disabled={busy} onClick={() => void reset()} title="Trở về giá tham khảo nếu có, hoặc đánh dấu chưa có giá">Bỏ giá đã nhập</button></div>
      </form>}
      <div className="flex flex-wrap gap-4 items-center mb-3"><input aria-label="Tìm hạng mục" className="field-input" placeholder="Tìm đồ vật, tầng…" value={search} onChange={event => setSearch(event.target.value)} /><label><input type="checkbox" checked={missingOnly} onChange={event => setMissingOnly(event.target.checked)} /> Chỉ mục chưa có giá</label></div>
      <p className="text-caption mb-2 sm:hidden">Kéo bảng sang ngang để xem đơn giá và chỉnh giá.</p>
      <div style={{ overflowX: 'auto' }}><table className="w-full text-sm" style={{ minWidth: 850 }}>
        <thead><tr className="text-left border-b"><th className="p-3">Hạng mục / nguồn</th><th className="p-3">Khối lượng</th><th className="p-3 text-right">Đơn giá</th><th className="p-3 text-right">Thành tiền</th><th className="p-3">Thao tác</th></tr></thead>
        <tbody>{lines.map(line => <tr key={line.id} className="border-b" data-testid="cost-line"><td className="p-3" style={{ maxWidth: 560 }}><strong>{line.title}</strong><p className="text-caption">{line.specification}</p><p className="text-caption" style={{ color: line.price_status === 'unknown' ? '#b45309' : 'var(--accent)' }}>{line.source_label}</p>{line.source_note && <p className="text-caption">{line.source_note}</p>}{line.source_url && <a className="underline text-caption" href={line.source_url} target="_blank" rel="noopener noreferrer">Nguồn đối chiếu · {line.checked_at}</a>}</td><td className="p-3 whitespace-nowrap">{line.gross_quantity} {line.unit}</td><td className="p-3 text-right font-mono whitespace-nowrap">{line.price_status === 'unknown' ? 'Chưa có giá' : money(line.unit_price_vnd)}</td><td className="p-3 text-right font-mono whitespace-nowrap">{line.price_status === 'unknown' ? 'Chưa tính' : money(line.subtotal_vnd)}</td><td className="p-3"><button className="btn btn-sm" disabled={busy} onClick={() => setEditing(line)} aria-label={`Chỉnh giá ${line.title}`}>Chỉnh giá</button></td></tr>)}</tbody>
      </table>{!lines.length && <p className="p-4">Không có hạng mục phù hợp.</p>}</div>
    </>}
  </div>;
}
