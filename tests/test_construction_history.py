from types import SimpleNamespace
import sqlite3
from app import construction_history as history

def test_history_is_scoped_idempotent_and_only_completes_pending(tmp_path, monkeypatch):
    database = tmp_path / 'history.sqlite'
    def connect():
        conn = sqlite3.connect(database)
        conn.row_factory = sqlite3.Row
        return conn
    monkeypatch.setattr(history, 'get_conn', connect)
    monkeypatch.setattr(history, 'get_project', lambda _: SimpleNamespace(external_scene=SimpleNamespace(sha256='asset')))
    def change(op, ids, project='p'):
        return history.update_construction_history(project, history.HistoryChange(asset_hash='asset', op=op, records=[history.HistoryRecord(id=id,name=id,floor=2) for id in ids]))
    assert len(change('initialize',['a','furniture:old'])['history']) == 1
    state = change('initialize',['a','b','furniture:old','furniture:new'])
    assert [r['id'] for r in state['pending']] == ['b','furniture:new']
    assert len(change('complete',['b','b'])['history']) == 2
    assert len(change('complete',['b'])['history']) == 2
    assert [r['id'] for r in change('initialize',['x'],'other')['history']] == ['x']
    change('initialize', ['construction:rail'])
    updated = history.update_construction_history('p', history.HistoryChange(asset_hash='asset', op='initialize', source_ids=['construction:rail'], records=[history.HistoryRecord(id='construction:rail',name='Lan can',floor=2)]))
    assert 'construction:rail' in [r['id'] for r in updated['history']]
    assert 'construction:rail' not in [r['id'] for r in updated['pending']]
