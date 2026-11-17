import { useEffect, useState, type FormEvent } from 'react';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
type Line = { id: string; title: string; specification: string; gross_quantity: number; unit: string; unit_price_vnd: number; subtotal_vnd: number; price_status: string; source_label: string; source_note: string; source_url?: string; checked_at: string };
type Estimate = { revision: number; scene_asset_hash: string; lines: Line[]; total_vnd: number; tax_vnd: number; tax_rate: number; reference_subtotal_vnd: number; known_subtotal_vnd: number; priced_line_count: number; unpriced_line_count: number; price_coverage_percent: number; total_is_complete: boolean; disclaimer: string };
type MaterialSuggestion = { id: string; title: string; material: string; finish: string; specs: string; bestFor: string; pros: string; cons: string; priceLabel: string };

function suggestionsForLine(line: Line): MaterialSuggestion[] {
  const text = `${line.title} ${line.specification}`.toLocaleLowerCase('vi');
  const current = line.price_status === 'unknown' ? 'Chưa có giá' : money(line.unit_price_vnd);
  if (/sàn|floor|gạch|đá|ốp|lát/.test(text)) return [
    { id: 'spc', title: 'Sàn SPC vân gỗ', material: 'SPC hèm khóa', finish: 'Vân gỗ mờ', specs: 'Dày 5–6 mm, chống ẩm, thi công nhanh', bestFor: 'Phòng ngủ và khu vực khô', pros: 'Ổn định, dễ vệ sinh, chi phí vừa phải', cons: 'Cần nền phẳng; không phù hợp nơi ngập nước', priceLabel: current },
    { id: 'tile', title: 'Gạch porcelain', material: 'Porcelain xương đá', finish: 'Matt chống trượt', specs: 'Khổ 600×1200 hoặc theo module đang có', bestFor: 'Khu vực cần độ bền và chống ẩm', pros: 'Bền, ít biến dạng, nhiều mẫu', cons: 'Thi công nặng và cần chốt ron/mạch', priceLabel: 'Cần báo giá theo mã gạch' },
    { id: 'wood', title: 'Sàn gỗ kỹ thuật', material: 'Engineered wood', finish: 'Sơn UV / dầu mờ', specs: 'Lớp mặt gỗ tự nhiên, cốt ổn định', bestFor: 'Không gian Japandi cần cảm giác tự nhiên', pros: 'Vân gỗ thật, cảm giác cao cấp', cons: 'Nhạy ẩm hơn SPC và cần bảo dưỡng', priceLabel: 'Cần báo giá theo mẫu' },
  ];
  if (/tường|trần|sơn|wall|ceiling|vách/.test(text)) return [
    { id: 'paint', title: 'Sơn nội thất lau chùi', material: 'Sơn nước acrylic', finish: 'Mờ nhẹ', specs: '2 lớp phủ + 1 lớp lót, màu theo palette hiện tại', bestFor: 'Tường và trần phòng ở', pros: 'Dễ đổi màu, dễ sửa chữa, ít ảnh hưởng hình học', cons: 'Cần xử lý bề mặt trước khi sơn', priceLabel: current },
    { id: 'microcement', title: 'Microcement', material: 'Xi măng trang trí', finish: 'Mờ, hiệu ứng liền mạch', specs: 'Hệ nhiều lớp, phủ bảo vệ chống bám bẩn', bestFor: 'Mảng nhấn hoặc phong cách tối giản', pros: 'Ít mạch, bề mặt đặc trưng', cons: 'Thi công phụ thuộc tay nghề', priceLabel: 'Cần báo giá thi công' },
    { id: 'wood-panel', title: 'Lam / ốp gỗ', material: 'MDF chống ẩm phủ veneer', finish: 'Vân gỗ tự nhiên', specs: 'Module theo kích thước vách, có khe âm', bestFor: 'Mảng tường đầu giường hoặc TV', pros: 'Tạo điểm nhấn và cải thiện âm học', cons: 'Cần kiểm tra khoảng hở, chống ẩm', priceLabel: 'Cần báo giá theo mẫu' },
  ];
  if (/rèm|lan can|cửa|cầu thang|tay vịn|đèn|lighting/.test(text)) return [
    { id: 'wood-metal', title: 'Gỗ tự nhiên + kim loại sơn tĩnh điện', material: 'Gỗ sồi / thép', finish: 'Gỗ dầu mờ, kim loại đen mờ', specs: 'Đo theo kích thước thực tế của hạng mục', bestFor: 'Lan can, tay vịn, chi tiết hoàn thiện', pros: 'Bền, dễ phối với Japandi', cons: 'Cần chốt mẫu và biện pháp lắp đặt', priceLabel: current },
    { id: 'fabric', title: 'Vải polyester chống nắng', material: 'Polyester dệt', finish: 'Mờ, cản sáng tùy cấp độ', specs: 'May đo theo ô cửa và ray hiện hữu', bestFor: 'Rèm cửa', pros: 'Dễ vệ sinh, nhiều mức cản sáng', cons: 'Màu thực tế cần duyệt mẫu', priceLabel: 'Cần báo giá theo kích thước' },
    { id: 'powder-coated', title: 'Kim loại sơn tĩnh điện', material: 'Thép / nhôm', finish: 'Sơn tĩnh điện mờ', specs: 'Màu theo bảng RAL hoặc mẫu duyệt', bestFor: 'Đèn, phụ kiện và khung', pros: 'Đồng nhất màu, dễ bảo trì', cons: 'Cần kiểm tra tải và điểm neo', priceLabel: 'Cần báo giá theo mẫu' },
  ];
  return [
    { id: 'melamine', title: 'MDF chống ẩm phủ Melamine', material: 'MDF MR', finish: 'Mờ, vân gỗ hoặc đơn sắc', specs: 'Cạnh dán kín, phụ kiện theo catalogue', bestFor: 'Tủ, kệ, bàn và nội thất rời', pros: 'Ổn định, dễ vệ sinh, nhiều màu', cons: 'Cạnh phải được xử lý kín nước', priceLabel: current },
    { id: 'veneer', title: 'Plywood phủ veneer', material: 'Plywood + veneer gỗ tự nhiên', finish: 'Sơn PU / dầu mờ', specs: 'Lớp mặt gỗ tự nhiên, cốt chịu lực tốt', bestFor: 'Nội thất cần độ bền và vân gỗ thật', pros: 'Bền hơn MDF, vân tự nhiên', cons: 'Giá và thời gian hoàn thiện cao hơn', priceLabel: 'Cần báo giá theo mẫu' },
    { id: 'solid', title: 'Gỗ tự nhiên', material: 'Sồi / óc chó tùy mẫu', finish: 'Dầu lau hoặc sơn mờ', specs: 'Đo và chọn mẫu vân trước khi đặt', bestFor: 'Mặt bàn, tay vịn, chi tiết điểm nhấn', pros: 'Cảm giác thật, sửa chữa được', cons: 'Cần kiểm soát độ ẩm và co ngót', priceLabel: 'Cần báo giá theo mẫu' },
  ];
}

export function SceneCostPanel({ project, onRefresh }: { project: any; onRefresh: () => Promise<void> }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [materialLine, setMaterialLine] = useState<Line | null>(null);
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
        <tbody>{lines.map(line => <tr key={line.id} className="border-b" data-testid="cost-line"><td className="p-3" style={{ maxWidth: 560 }}><strong>{line.title}</strong><p className="text-caption">{line.specification}</p><p className="text-caption" style={{ color: line.price_status === 'unknown' ? '#b45309' : 'var(--accent)' }}>{line.source_label}</p>{line.source_note && <p className="text-caption">{line.source_note}</p>}{line.source_url && <a className="underline text-caption" href={line.source_url} target="_blank" rel="noopener noreferrer">Nguồn đối chiếu · {line.checked_at}</a>}</td><td className="p-3 whitespace-nowrap">{line.gross_quantity} {line.unit}</td><td className="p-3 text-right font-mono whitespace-nowrap">{line.price_status === 'unknown' ? 'Chưa có giá' : money(line.unit_price_vnd)}</td><td className="p-3 text-right font-mono whitespace-nowrap">{line.price_status === 'unknown' ? 'Chưa tính' : money(line.subtotal_vnd)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button className="btn btn-sm" disabled={busy} onClick={() => setMaterialLine(line)} aria-label={`Chọn vật liệu ${line.title}`}>Chọn vật liệu</button><button className="btn btn-sm" disabled={busy} onClick={() => setEditing(line)} aria-label={`Chỉnh giá ${line.title}`}>Chỉnh giá</button></div></td></tr>)}</tbody>
      </table>{!lines.length && <p className="p-4">Không có hạng mục phù hợp.</p>}</div>
      {materialLine && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Đề xuất vật liệu"><div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-caption">ĐỀ XUẤT CHO HẠNG MỤC</p><h2 className="text-xl font-semibold">{materialLine.title}</h2><p className="text-body">{materialLine.specification}</p></div><button className="btn" onClick={() => setMaterialLine(null)} aria-label="Đóng đề xuất">Đóng</button></div><div className="surface-card my-4"><strong>Đây là cơ sở tham khảo</strong><p className="text-caption">Chọn một phương án để xem thông số và ưu/nhược điểm. Vật liệu trong cảnh GLB không bị thay đổi tự động; muốn chốt đơn giá, mở “Chỉnh giá” và nhập nguồn hoặc link báo giá.</p>{materialLine.source_url ? <a className="underline" href={materialLine.source_url} target="_blank" rel="noopener noreferrer">Mở nguồn hiện có</a> : <p className="text-caption">Hạng mục này chưa có link nguồn. Có thể dán link báo giá trong form chỉnh giá.</p>}</div><div className="grid gap-3">{suggestionsForLine(materialLine).map(option => <article key={option.id} className="surface-card"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{option.title}</h3><p className="text-caption">{option.material} · {option.finish}</p></div><strong className="mono whitespace-nowrap">{option.priceLabel}</strong></div><p className="text-body mt-2"><strong>Quy cách:</strong> {option.specs}</p><p className="text-body"><strong>Phù hợp:</strong> {option.bestFor}</p><p className="text-caption"><strong>Ưu điểm:</strong> {option.pros}</p><p className="text-caption"><strong>Lưu ý:</strong> {option.cons}</p><button className="btn btn-sm mt-2" onClick={() => { setEditing(materialLine); setMaterialLine(null); }}>Dùng để nhập giá</button></article>)}</div><div className="mt-5 flex justify-end"><button className="btn btn-primary" onClick={() => { setEditing(materialLine); setMaterialLine(null); }}>Chỉnh giá mục này</button></div></div></div>}
    </>}
  </div>;
}
