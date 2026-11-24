"""Project/asset-scoped installation ledger; independent of design revisions."""
import json
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.db import get_conn, get_project

router = APIRouter()

class HistoryRecord(BaseModel):
    id: str = Field(min_length=1, max_length=250)
    name: str = Field(max_length=250)
    floor: int = Field(ge=1, le=100)

class HistoryChange(BaseModel):
    asset_hash: str = Field(min_length=1, max_length=100)
    op: Literal['initialize', 'complete']
    records: list[HistoryRecord] = Field(max_length=1000)
    source_ids: list[str] = Field(default_factory=list, max_length=1000)

@router.get('/api/v1/projects/{project_id}/construction-history')
def get_construction_history(project_id: str):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(404, 'Project not found')
    if project.external_scene is None:
        return {'history': [], 'pending': [], 'baseline': []}
    with get_conn() as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS construction_history (project_id TEXT NOT NULL, asset_hash TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(project_id, asset_hash))')
        row = conn.execute('SELECT state_json FROM construction_history WHERE project_id=? AND asset_hash=?', (project_id, project.external_scene.sha256)).fetchone()
        return json.loads(row['state_json']) if row else {'history': [], 'pending': [], 'baseline': []}


@router.post('/api/v1/projects/{project_id}/construction-history')
def update_construction_history(project_id: str, body: HistoryChange):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(404, 'Project not found')
    if project.external_scene is None or body.asset_hash != project.external_scene.sha256:
        raise HTTPException(409, 'Scene asset changed; reload the design')
    with get_conn() as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS construction_history (project_id TEXT NOT NULL, asset_hash TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(project_id, asset_hash))')
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT state_json FROM construction_history WHERE project_id=? AND asset_hash=?', (project_id, body.asset_hash)).fetchone()
        state = json.loads(row['state_json']) if row else {'history': [], 'pending': [], 'baseline': []}
        known = {item['id'] for item in state['history'] + state['pending']}
        if body.op == 'initialize':
            source_ids = set(body.source_ids)
            # A newer viewer may split a formerly monolithic GLB group into
            # independently installable objects. Remove stale generated IDs so
            # the panel and replay contain only the current source partition.
            for key in ('history', 'pending'):
                state[key] = [item for item in state[key]
                              if not item['id'].startswith('construction:') or item['id'] in source_ids]
            known = {item['id'] for item in state['history'] + state['pending']}
            existing_records = {item['id']: item for item in state['history'] + state['pending']}
            for record in body.records:
                if row is None and record.id.startswith('furniture:'):
                    state['baseline'].append(record.id)
                    continue
                if record.id in state.get('baseline', []):
                    continue
                if record.id in known:
                    existing_records[record.id].update(name=record.name, floor=record.floor)
                    if record.id in source_ids:
                        for pending_item in list(state['pending']):
                            if pending_item['id'] == record.id:
                                state['pending'].remove(pending_item)
                                state['history'].append(pending_item)
                    continue
                item = record.model_dump()
                state['history' if row is None or record.id in source_ids else 'pending'].append(item)
                known.add(record.id)
        else:
            pending = {item['id']: item for item in state['pending']}
            for record in body.records:
                if record.id not in pending:
                    continue
                item = pending.pop(record.id)
                item['completed_at'] = datetime.now(timezone.utc).isoformat()
                state['history'].append(item)
            state['pending'] = list(pending.values())
        conn.execute('INSERT INTO construction_history VALUES(?,?,?) ON CONFLICT(project_id,asset_hash) DO UPDATE SET state_json=excluded.state_json', (project_id, body.asset_hash, json.dumps(state, ensure_ascii=False)))
        return state
