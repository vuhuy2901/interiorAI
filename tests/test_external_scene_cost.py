"""Imported-scene scope, price isolation, exports and real Cost executor regression."""
import asyncio
import csv
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from app import db
from app.models.contracts import ExternalSceneAsset
from app.services import scene_cost
from app.services.cost_engine import calculate_project_estimate
from app.services.inventory_bom import generate_project_inventory_bom
from app.services.cad_export import export_boq_csv, export_boq_xlsx

HASH = '19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'

@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(db, 'DB_PATH', tmp_path / 'cost.db')
    db.init_db()
    project = db.build_japandi_master_bedroom_project()
    project.project_id = 'cost_test'
    project.external_scene = ExternalSceneAsset(asset_id='test', name='Source GLB', file_url='/assets/test.glb', sha256=HASH)
    return db.save_project(project, bump_revision=False)

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(scene_cost.router)
    return TestClient(app)

def price(project, **changes):
    return dict(asset_hash=project.external_scene.sha256, unit_price_vnd=1000000, quantity=2,
                unit='bộ', source_note='Báo giá người dùng', price_status='provided_unverified', **changes)

def test_glb_scope_replaces_all_legacy_furniture_and_surfaces(project):
    estimate = calculate_project_estimate(project)
    assert len(estimate.lines) == 37
    assert len({line.id for line in estimate.lines}) == 37
    assert all(line.id.startswith('construction:') for line in estimate.lines)
    assert not any('bedroom' in line.id or 'bench' in line.title.lower() for line in estimate.lines)
    assert estimate.reference_line_count == 9
    assert estimate.reference_subtotal_vnd == 49910000
    assert estimate.tax_vnd == round(49910000 * .08)
    assert not estimate.total_is_complete and not estimate.within_budget
    assert calculate_project_estimate(project).snapshot_id == estimate.snapshot_id
    bom = generate_project_inventory_bom(project)
    assert {item.id for item in bom.all_items} == {line.id for line in estimate.lines}
    assert bom.unpriced_items_count == 28
    assert {line.id for line in estimate.lines if line.id.startswith('construction:stair-')} == {
        'construction:stair-structure', 'construction:stair-railing', 'construction:stair-installation'
    }
    assert all(item.sku == '' for item in bom.all_items)

def test_estimate_first_does_not_reuse_old_room_budget(project):
    project.design_brief.budget_mode = 'estimate_first'
    result = calculate_project_estimate(project)
    assert result.budget_status == 'not_set'
    assert result.budget_limit_vnd == 0
    assert result.budget_mode == 'estimate_first'
    assert result.within_budget is False

def test_price_edit_persists_without_rewriting_scene_and_is_project_scoped(project, client):
    with db.get_conn() as conn:
        before = conn.execute('SELECT payload_json FROM projects WHERE project_id=?', (project.project_id,)).fetchone()[0]
    response = client.put(f'/api/v1/projects/{project.project_id}/cost-items/construction:kitchen', json=price(project))
    assert response.status_code == 200, response.text
    estimate = response.json()
    assert estimate['priced_line_count'] == 10
    assert estimate['known_subtotal_vnd'] == 2000000
    assert estimate['total_vnd'] == round((49910000 + 2000000) * 1.08)
    with db.get_conn() as conn:
        assert conn.execute('SELECT payload_json FROM projects WHERE project_id=?', (project.project_id,)).fetchone()[0] == before
    assert calculate_project_estimate(db.get_project(project.project_id)).snapshot_id == estimate['snapshot_id']
    other = project.model_copy(deep=True)
    other.project_id = 'other'
    assert calculate_project_estimate(other).known_subtotal_vnd == 0
    workflow = client.get(f'/api/v1/projects/{project.project_id}/cost-workflow').json()
    assert workflow['status'] == 'needs_input' and workflow['approval_required']
    assert workflow['estimate']['snapshot_id'] == estimate['snapshot_id']
    assert workflow['overridden_item_ids'] == ['construction:kitchen']

@pytest.mark.parametrize('update', [dict(unit_price_vnd=-1), dict(quantity=0), dict(source_note='   '), dict(unit=' '), dict(source_url='javascript:alert(1)'), dict(price_status='verified')])
def test_reject_invalid_or_unverified_claimed_prices(project, client, update):
    body = price(project); body.update(update)
    assert client.put(f'/api/v1/projects/{project.project_id}/cost-items/construction:kitchen', json=body).status_code == 422

def test_asset_and_item_mismatch_cannot_reuse_room_prices(project, client):
    body = price(project); body['asset_hash'] = 'other'
    assert client.put(f'/api/v1/projects/{project.project_id}/cost-items/construction:kitchen', json=body).status_code == 409
    assert client.put(f'/api/v1/projects/{project.project_id}/cost-items/legacy_bed', json=price(project)).status_code == 404
    project.external_scene.sha256 = 'unknown'
    estimate = calculate_project_estimate(project)
    assert [line.id for line in estimate.lines] == ['missing-scene-scope']
    assert estimate.total_vnd == 0 and not estimate.total_is_complete

def test_zero_override_disables_reference_and_full_coverage_still_needs_review(project, client):
    body = price(project); body['unit_price_vnd'] = 0
    result = client.put(f'/api/v1/projects/{project.project_id}/cost-items/construction:table-front', json=body).json()
    assert result['reference_line_count'] == 8
    assert 'construction:table-front' in result['unpriced_item_ids']
    reset = client.delete(f'/api/v1/projects/{project.project_id}/cost-items/construction:table-front', params={'asset_hash': HASH})
    assert reset.status_code == 200 and reset.json()['reference_line_count'] == 9
    for item in scene_cost.scene_scope(project):
        assert client.put(f'/api/v1/projects/{project.project_id}/cost-items/{item["id"]}', json=price(project)).status_code == 200
    workflow = client.get(f'/api/v1/projects/{project.project_id}/cost-workflow').json()
    assert workflow['status'] == 'needs_review' and workflow['approval_required']
    assert workflow['estimate']['total_is_complete']
    assert workflow['estimate']['reference_subtotal_vnd'] == 0

def test_added_furniture_requires_explicit_history_membership(project):
    new = project.furniture_instances[0].model_copy(update={'id':'new', 'price_vnd':1230000})
    project.furniture_instances.append(new)
    with db.get_conn() as conn:
        conn.execute('CREATE TABLE construction_history (project_id TEXT, asset_hash TEXT, state_json TEXT)')
        state = {'history': [{'id':'furniture:new'}], 'pending':[], 'baseline':['furniture:'+project.furniture_instances[0].id]}
        conn.execute('INSERT INTO construction_history VALUES(?,?,?)', (project.project_id,HASH,json.dumps(state)))
    estimate = calculate_project_estimate(project)
    assert len(estimate.lines) == 38
    assert next(line for line in estimate.lines if line.id == 'furniture:new').subtotal_vnd == 1230000

def test_exports_recalculate_current_prices_and_never_export_unknown_as_free(project, client, tmp_path):
    client.put(f'/api/v1/projects/{project.project_id}/cost-items/construction:kitchen', json=price(project))
    csv_path = export_boq_csv(project, tmp_path / 'boq.csv')
    rows = list(csv.reader(csv_path.open(encoding='utf-8-sig')))
    kitchen = next(row for row in rows if len(row) > 1 and row[1] == 'Hệ tủ bếp')
    assert kitchen[8:10] == ['1000000', '2000000']
    curtain = next(row for row in rows if len(row) > 1 and row[1] == 'Rèm tầng 1')
    assert curtain[8:10] == ['Chưa có giá', 'Chưa tính']
    wb = load_workbook(export_boq_xlsx(project, tmp_path / 'boq.xlsx'))
    assert next(row for row in wb.active.values if len(row) > 1 and row[1] == 'Hệ tủ bếp')[8:10] == (1000000,2000000)

def test_cost_executor_stops_incomplete_boq_before_handoff(project):
    from app.services.agent_orchestrator_engine import execute_real_workflow_run
    workflow = {'workflow_id':'cost_workflow_test','name':'Cost test','version':1,
        'nodes':[{'id':'cost','type':'deterministic_cost','agent_id':'agent_cost','enabled':True,'config':{}}], 'edges':[]}
    with db.get_conn() as conn:
        conn.execute('INSERT INTO workflows VALUES(?,?,?,?,?)', ('cost_workflow_test','Cost test',1,json.dumps(workflow),db.now_iso()))
    run = asyncio.run(execute_real_workflow_run('cost_workflow_test', project.project_id))
    event = run['events'][0]
    assert event['tool_called'] == 'deterministic_cost_engine', event
    assert event['status'] == 'WAITING_FOR_INPUT'
    assert event['output']['scene_asset_hash'] == HASH
    assert len(event['output']['lines']) == 37
    assert event['output']['missing_item_ids']
    assert not event.get('handoff')
