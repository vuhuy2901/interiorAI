"""BOQ scope and deterministic prices for authoritative imported scenes."""
from __future__ import annotations
import json
import hashlib
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.models.contracts import CanonicalProject, CostEstimateSnapshot, EstimateLineItem

MANIFEST_DIR = Path(__file__).resolve().parents[4] / 'data' / 'scene-cost'
router = APIRouter()

def scene_scope(project: CanonicalProject) -> list[dict]:
    external = project.external_scene
    if not external:
        return []
    # Identity is checked inside the file, never construct a filesystem path from user input.
    for path in sorted(MANIFEST_DIR.glob('*.json')):
        manifest = json.loads(path.read_text(encoding='utf-8'))
        if manifest.get('asset_hash') == external.sha256:
            items = list(manifest['items'])
            from app.db import get_conn
            with closing(get_conn()) as conn:
                exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='construction_history'").fetchone()
                row = conn.execute('SELECT state_json FROM construction_history WHERE project_id=? AND asset_hash=?', (project.project_id, external.sha256)).fetchone() if exists else None
            # Legacy furniture is excluded by default; only explicit installed/queued additions join the GLB.
            state = json.loads(row['state_json']) if row else {}
            included = {item['id'] for item in state.get('history', []) + state.get('pending', [])}
            baseline = set(state.get('baseline', []))
            for furniture in project.furniture_instances:
                key = 'furniture:' + furniture.id
                if key in included and key not in baseline:
                    items.append(dict(id=key, name=furniture.name, floor=2 if furniture.z_mm > 1500 else 1,
                                      quantity=1, unit='bộ', category='furniture', dimensions_mm=[furniture.width_mm, furniture.depth_mm, furniture.height_mm],
                                      source_nodes=furniture.id, supplied_price=furniture.price_vnd, supplied_source=furniture.source_url))
            return items
    return []

def read_prices(project: CanonicalProject) -> dict:
    from app.db import get_conn
    with closing(get_conn()) as conn:
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='scene_cost_prices'").fetchone()
        if not exists:
            return {}
        rows = conn.execute('SELECT item_id,payload_json FROM scene_cost_prices WHERE project_id=? AND asset_hash=?', (project.project_id, project.external_scene.sha256)).fetchall()
        return {row['item_id']: json.loads(row['payload_json']) for row in rows}


def reference_prices(project: CanonicalProject) -> dict:
    """Dated comparable products, never the source GLB's product identity."""
    scoped = MANIFEST_DIR / f"{project.external_scene.sha256.lower()}-reference-prices.json"
    path = scoped if scoped.exists() else MANIFEST_DIR / 'reference-prices.json'
    if not path.exists(): return {}
    payload = json.loads(path.read_text(encoding='utf-8'))
    if payload.get('_asset_hash') and payload['_asset_hash'].upper() != project.external_scene.sha256.upper(): return {}
    payload.pop('_asset_hash', None)
    return payload

def calculate_external_estimate(project: CanonicalProject) -> CostEstimateSnapshot:
    items, prices = scene_scope(project), read_prices(project)
    references = reference_prices(project)
    lines = []
    for item in items:
        price = prices.get(item['id'], references.get(item['id'], {}))
        amount = price.get('unit_price_vnd', item.get('supplied_price', 0)) or 0
        quantity = price.get('quantity', item['quantity'])
        status = price.get('price_status', 'provided_unverified' if amount else 'unknown') if amount else 'unknown'
        source = price.get('source_note', item.get('supplied_source') or '')
        dimensions = ' × '.join(str(round(v)) for v in item.get('dimensions_mm', []))
        labels = {'provided_unverified':'GIÁ NGƯỜI DÙNG CUNG CẤP', 'illustrative':'GIÁ THAM KHẢO', 'unknown':'CHƯA CÓ GIÁ'}
        lines.append(EstimateLineItem(
            id=item['id'], category=item['category'], title=item['name'],
            specification=f"{'Tầng '+str(item['floor']) if item['floor'] else 'Toàn cảnh'} | {dimensions+' mm | ' if dimensions else ''}Nguồn: {item['source_nodes'] or 'Lắp đặt'}",
            net_quantity=quantity, gross_quantity=quantity, unit=price.get('unit', item['unit']),
            unit_price_vnd=amount, subtotal_vnd=round(quantity*amount), price_status=status,
            source_label=labels[status], source_note=source, source_url=price.get('source_url'), checked_at=price.get('checked_at',''),
            formula_explanation=f"{quantity:g} × {amount:,.0f} đ. {source}" if amount else 'Chưa có đơn giá; chưa cộng vào tổng. Khối lượng theo nhóm GLB, không phải số mesh.',
        ))
    if not items:
        lines.append(EstimateLineItem(id='missing-scene-scope', category='furniture', title='Chưa có danh mục dự toán cho GLB này', specification='Cần bóc tách đúng asset hash', net_quantity=1,gross_quantity=1,unit='gói',unit_price_vnd=0,subtotal_vnd=0,price_status='unknown',source_label='CHƯA BÓC TÁCH',formula_explanation='Không dùng dữ liệu phòng cũ để thay thế.'))
    unknown = [line.id for line in lines if line.price_status == 'unknown']
    reference = sum(line.subtotal_vnd for line in lines if line.price_status == 'illustrative')
    known = sum(line.subtotal_vnd for line in lines if line.price_status == 'provided_unverified')
    materials = sum(line.subtotal_vnd for line in lines if line.category not in ('furniture','labor'))
    furniture = sum(line.subtotal_vnd for line in lines if line.category == 'furniture')
    labor = sum(line.subtotal_vnd for line in lines if line.category == 'labor')
    tax = round((materials+furniture+labor)*.08)
    total = materials+furniture+labor+tax
    budget = project.design_brief.budget_limit_vnd if project.design_brief.budget_mode == 'fixed' else 0
    fingerprint = json.dumps([project.project_id, project.external_scene.sha256, project.revision, budget, project.scale_calibrated, [line.model_dump() for line in lines]], sort_keys=True, ensure_ascii=False)
    return CostEstimateSnapshot(snapshot_id='est_glb_'+hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:16],project_id=project.project_id,revision=project.revision,
        scene_asset_hash=project.external_scene.sha256,source_kind='external_glb',created_at=datetime.now(timezone.utc).isoformat(),
        scale_verified=project.scale_calibrated,confidence_level='HIGH_VERIFIED_SCALE' if project.scale_calibrated else 'LOW_UNVERIFIED_SCALE',lines=lines,materials_subtotal_vnd=materials,furniture_subtotal_vnd=furniture,labor_subtotal_vnd=labor,
        shipping_fee_vnd=0,tax_rate=.08,tax_vnd=tax,total_vnd=total,priced_line_count=len(lines)-len(unknown),unpriced_line_count=len(unknown),
        unpriced_item_ids=unknown,price_coverage_percent=round((len(lines)-len(unknown))*100/len(lines),1),total_is_complete=not unknown,
        reference_line_count=sum(line.price_status=='illustrative' for line in lines),reference_subtotal_vnd=reference,known_subtotal_vnd=known,
        budget_mode=project.design_brief.budget_mode,budget_limit_vnd=budget,within_budget=project.design_brief.budget_mode == 'fixed' and not unknown and total<=budget,budget_status='not_set' if project.design_brief.budget_mode == 'estimate_first' else 'incomplete' if unknown else 'within_budget' if total<=budget else 'over_budget',
        disclaimer=f"Dự toán cảnh GLB hiện tại: {len(lines)-len(unknown)}/{len(lines)} hạng mục có giá. Giá tham khảo tách riêng; chưa bao gồm vận chuyển và các hạng mục chưa báo giá. Khối lượng theo nhóm/gói hoặc số đo mô hình đã nhập, chưa phải đo hiện trạng. Sản phẩm/vật liệu đối chiếu không xác nhận SKU gốc; cần kiểm tra phạm vi, phụ kiện và thuế khi mua/thi công thật.")

class ScenePrice(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    asset_hash: str
    unit_price_vnd: float = Field(ge=0, le=1e12)
    quantity: float = Field(gt=0, le=1e6)
    unit: str = Field(min_length=1,max_length=30)
    price_status: Literal['provided_unverified','illustrative'] = 'provided_unverified'
    source_note: str = Field(min_length=1,max_length=1000)
    source_url: str | None = Field(default=None,max_length=2000)

    @field_validator('unit', 'source_note')
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('Required text cannot be blank')
        return value.strip()

    @field_validator('source_url')
    @classmethod
    def safe_url(cls, value: str | None) -> str | None:
        if value and not value.startswith(('https://', 'http://')):
            raise ValueError('Use an http(s) source URL')
        return value or None

@router.put('/api/v1/projects/{project_id}/cost-items/{item_id:path}')
def put_scene_price(project_id: str,item_id: str,body: ScenePrice):
    from app.db import get_conn, get_project
    project = get_project(project_id)
    if not project: raise HTTPException(404,'Project not found')
    if not project.external_scene or project.external_scene.sha256 != body.asset_hash: raise HTTPException(409,'Cảnh đã thay đổi; tải lại trước khi sửa giá')
    if item_id not in {item['id'] for item in scene_scope(project)}: raise HTTPException(404,'Không có hạng mục trong cảnh đang mở')
    payload = body.model_dump();payload['checked_at']=datetime.now(timezone.utc).date().isoformat()
    with closing(get_conn()) as conn, conn:
        conn.execute('CREATE TABLE IF NOT EXISTS scene_cost_prices (project_id TEXT,asset_hash TEXT,item_id TEXT,payload_json TEXT,PRIMARY KEY(project_id,asset_hash,item_id))')
        conn.execute('INSERT INTO scene_cost_prices VALUES(?,?,?,?) ON CONFLICT(project_id,asset_hash,item_id) DO UPDATE SET payload_json=excluded.payload_json',(project_id,body.asset_hash,item_id,json.dumps(payload,ensure_ascii=False)))
    # Prices never rewrite a stale scene payload or bump its geometry revision.
    current = get_project(project_id)
    if not current or not current.external_scene or current.external_scene.sha256 != body.asset_hash:
        raise HTTPException(409, 'Scene changed while saving; reload the estimate')
    return calculate_external_estimate(current).model_dump()

@router.get('/api/v1/projects/{project_id}/cost-workflow')
def cost_workflow(project_id: str):
    from app.db import get_project
    project=get_project(project_id)
    if not project: raise HTTPException(404,'Project not found')
    from app.services.cost_engine import calculate_project_estimate
    estimate=calculate_project_estimate(project)
    return {'stage':'cost','agent_key':'agent_cost','status':'blocked' if not project.scale_calibrated else 'needs_review',
            'project_id':project_id,'revision':project.revision,'asset_hash':getattr(estimate, 'scene_asset_hash', None) or (project.external_scene.sha256 if project.external_scene else None),
            'estimate_url':f'/api/v1/estimates/{project_id}','missing_item_ids':estimate.unpriced_item_ids,
            'overridden_item_ids': sorted(read_prices(project)) if project.external_scene else [],
            'estimate':estimate.model_dump(),'approval_required':True,
            'proposal_state':'PROVISIONAL' if not estimate.total_is_complete else 'READY_FOR_APPROVAL',
            'user_input_required':False}


@router.delete('/api/v1/projects/{project_id}/cost-items/{item_id:path}')
def reset_scene_price(project_id: str, item_id: str, asset_hash: str):
    from app.db import get_conn, get_project
    project = get_project(project_id)
    if not project:
        raise HTTPException(404, 'Project not found')
    if not project.external_scene or project.external_scene.sha256 != asset_hash:
        raise HTTPException(409, 'Scene changed; reload the estimate')
    if item_id not in {item['id'] for item in scene_scope(project)}:
        raise HTTPException(404, 'Item not found in current scene')
    with closing(get_conn()) as conn, conn:
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='scene_cost_prices'").fetchone():
            conn.execute('DELETE FROM scene_cost_prices WHERE project_id=? AND asset_hash=? AND item_id=?', (project_id, asset_hash, item_id))
    return calculate_external_estimate(project).model_dump()
