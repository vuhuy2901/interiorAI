import importlib.util
import json
import math
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[1]

def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def test_full_reference_scope_keeps_commercial_limits_and_does_not_double_floor_or_labor():
    quote=load('prepare-current-scene-quote')
    manifest=json.loads((ROOT/'data/scene-cost/the_interior_14_spacious.json').read_text(encoding='utf-8'))
    references=json.loads((ROOT/'data/scene-cost/reference-prices.json').read_text(encoding='utf-8'))
    groups=[]
    for item in manifest['items']:
        if item['floor']==0:continue
        width,depth,height=item['dimensions_mm']
        groups.append({'id':item['id'],'dimensions_m':[width/1000,height/1000,depth/1000],
            'surface_area_m2':2,'members':[{'name':'Cube012_panel','dimensions_m':[2,.5,0]}]})
    audit={'groups':groups,'base':[{'name':'Plane','up_facing_area_m2':10},{'name':'Cube','up_facing_area_m2':6,'down_facing_area_m2':6}],
        'ungrouped':[{'name':name,'vertical_area_m2':3} for name in ['Plane001_Material002_0','Plane002_Material003_0','Plane003_Material002_0','node_0010_Material002_0']]}
    proposal=quote.build_quote(audit,manifest,references)
    assert len(proposal['rows'])==34
    assert len({row['id'] for row in proposal['rows']})==34
    assert proposal['commercial_quote_complete'] is False
    assert all(row['price_status']=='illustrative' and row['source_url'].startswith('https://') and row['source_note'] for row in proposal['rows'])
    assert all(math.isfinite(row['unit_price_vnd']) and row['unit_price_vnd']>0 and row['quantity']>0 for row in proposal['rows'])
    rows={row['id'].split(':')[1]:row for row in proposal['rows']}
    assert rows['surface-floor']['quantity']==16 # Never charge the slab underside.
    assert rows['installation']['unit_price_vnd']==pytest.approx((16*30000+12*100000+2*280000)/1.08)
    assert rows['surface-floor']['unit_price_vnd']==pytest.approx(435000/1.08) # Labor stays in its own line.
    assert rows['kitchen']['limitations'] and rows['railing-upper']['limitations']

def test_acceptance_cannot_reuse_old_human_approval_for_new_work():
    acceptance=load('complete-current-scene-workflow')
    acceptance.require_reviewed_approval(19,acceptance.APPROVED_COST_SNAPSHOT)
    with pytest.raises(RuntimeError,match='new review'):
        acceptance.require_reviewed_approval(20,acceptance.APPROVED_COST_SNAPSHOT)
    with pytest.raises(RuntimeError,match='new review'):
        acceptance.require_reviewed_approval(19,'different-prices')
