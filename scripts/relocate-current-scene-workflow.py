"""Explicit, guarded relocation of the user-approved legacy workflow.

Dry-run by default. Preserves IDs/origins/comments and never marks work Done.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = '142c2363-1cec-42d6-92b5-27f77b3a2570'
TARGET = 'eb654960-2510-46d6-ade9-ea68a70bf64f'
SCENE = 'proj_bedroom_japandi_4x4m'
HASH = '19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'data' / 'exports' / (SCENE + '_workflow_review')

def api(path, body=None, method=None, port=3100):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    request = Request(f'http://127.0.0.1:{port}/api{path}', data=data,
                      method=method, headers={'Content-Type':'application/json; charset=utf-8'})
    with urlopen(request, timeout=30) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    companies = api('/companies')
    found = []
    for company in companies:
        rows = api(f'/companies/{company["id"]}/issues')
        roots = [row for row in rows if row.get('identifier') == 'ATL-7']
        if roots:
            found.append((company, rows, roots[0]))
    if len(found) != 1:
        raise RuntimeError('Expected exactly one authorized ATL-7 workflow')
    company, rows, root = found[0]
    if root['projectId'] not in (SOURCE, TARGET):
        raise RuntimeError('Workflow project changed; refusing relocation')
    if api(f'/companies/{company["id"]}/live-runs'):
        raise RuntimeError('Agent work is active; no records changed')
    workspace = api(f'/projects/{TARGET}/atelier/workspace')
    scene = api(f'/v1/projects/{SCENE}', port=8000)
    if scene.get('external_scene', {}).get('sha256') != HASH:
        raise RuntimeError('Unexpected authoritative GLB')
    # Workspace wrapper differs across native/source API versions.
    workspace_text = json.dumps(workspace)
    if SCENE not in workspace_text:
        raise RuntimeError('Target workspace does not contain the intended scene')
    children = [row for row in rows if row.get('parentId') == root['id']]
    if len(children) != 10 or any(row.get('projectId') not in (SOURCE,TARGET) for row in children):
        raise RuntimeError('Workflow membership changed; no records changed')
    selected = [root] + sorted(children, key=lambda row:row['issueNumber'])
    print(json.dumps({'apply':args.apply,'source':SOURCE,'target':TARGET,'scene':SCENE,
                      'revision':scene['revision'],'tasks':[{k:row.get(k) for k in ('identifier','status','projectId')} for row in selected]},ensure_ascii=False))
    if not args.apply:
        return
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    (ARTIFACTS / f'native-before-relocation-{stamp}.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
    marker = f'Current authoritative GLB: {SCENE}; asset SHA256 {HASH}; observed revision {scene["revision"]}.'
    for row in selected:
        if row['projectId'] == TARGET:
            continue
        description = (row.get('description') or '') + '\n\n' + marker + '\nUser explicitly requested moving this workflow from Studio to this project on 2026-11-17. Historical missing-input comments refer to previous work; reread the current linked scene before asking again. Revalidate current evidence before completion. Full 34-item sourced reference BOQ is required before final acceptance.'
        updated = api(f'/issues/{row["id"]}', {'projectId':TARGET,'status':'backlog','description':description}, 'PATCH')
        if updated.get('projectId') != TARGET:
            raise RuntimeError(f'Relocation not persisted for {row["identifier"]}; inspect backup before retry')
    after = api(f'/companies/{company["id"]}/issues')
    selected_ids = {row['id'] for row in selected}
    verified = [row for row in after if row['id'] in selected_ids]
    if len(verified) != 11 or any(row['projectId'] != TARGET for row in verified):
        raise RuntimeError('Relocation verification failed')
    (ARTIFACTS / f'native-after-relocation-{stamp}.json').write_text(json.dumps(verified,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Relocated 11 tasks; preserved IDs/origins/comments; tasks await current-scene evidence, not fabricated completion.')

if __name__ == '__main__':
    main()
