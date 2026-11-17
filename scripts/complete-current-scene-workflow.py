"""Publish real current-scene evidence; close only the explicitly approved software scope.

No provider run is manufactured. Does not certify procurement/construction QA.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
PROJECT='eb654960-2510-46d6-ade9-ea68a70bf64f'
SCENE='proj_bedroom_japandi_4x4m'
HASH='19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'
ARTIFACTS=ROOT/'data'/'exports'/(SCENE+'_workflow_review')
ORDER=['ATL-8','ATL-2','ATL-3','ATL-9','ATL-4','ATL-10','ATL-11','ATL-12','ATL-5','ATL-13','ATL-7']
APPROVAL='2026-11-17: Người dùng duyệt cơ sở tham khảo cho 34 nhóm; nghiệm thu mô hình/phần mềm, không coi là báo giá mua hàng hay hồ sơ thi công thực tế.'
APPROVED_REVISION=19
APPROVED_COST_SNAPSHOT='est_glb_6c54791f391a888f'

def require_reviewed_approval(revision, snapshot_id):
    if revision!=APPROVED_REVISION or snapshot_id!=APPROVED_COST_SNAPSHOT:
        raise RuntimeError('User approval covers only the reviewed revision/snapshot; obtain a new review for changed work')

def request(path, body=None, method=None, port=3100):
    data=json.dumps(body,ensure_ascii=False).encode('utf-8') if body is not None else None
    req=Request(f'http://127.0.0.1:{port}/api'+path,data=data,method=method,headers={'Content-Type':'application/json; charset=utf-8'})
    with urlopen(req,timeout=40) as response:return json.load(response)

def upsert_document(issue_id, body):
    path=f'/issues/{issue_id}/documents/current-glb-acceptance'
    base=None
    try:
        current=request(path);doc=current.get('document',current);base=doc.get('latestRevisionId')
    except HTTPError as error:
        if error.code!=404:raise
    return request(path,{'format':'markdown','title':'Nghiệm thu GLB hiện tại và dự toán tham khảo','body':body,
        'baseRevisionId':base,'changeSummary':'Current source-bound evidence and explicit user-approved scope'},'PUT')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--complete-user-approved-scope',action='store_true')
    args=parser.parse_args()
    companies=request('/companies');matches=[]
    for company in companies:
        rows=request(f'/companies/{company["id"]}/issues')
        selected={row['identifier']:row for row in rows if row.get('identifier') in ORDER}
        if len(selected)==len(ORDER):matches.append((company,selected))
    if len(matches)!=1:raise RuntimeError('Ambiguous native workflow')
    company,selected=matches[0]
    if any(row['projectId']!=PROJECT for row in selected.values()):raise RuntimeError('Wrong native project binding')
    if request(f'/companies/{company["id"]}/live-runs'):raise RuntimeError('Agent work active; no mutation')
    project=request(f'/v1/projects/{SCENE}',port=8000)
    estimate=request(f'/v1/projects/{SCENE}/cost-workflow',port=8000)['estimate']
    audit=json.loads((ARTIFACTS/'source-audit.json').read_text(encoding='utf-8'))
    quote=json.loads((ARTIFACTS/'reference-quote-proposal.json').read_text(encoding='utf-8'))
    if project.get('external_scene',{}).get('sha256')!=HASH or audit['asset_hash']!=HASH or quote['asset_hash']!=HASH:raise RuntimeError('Wrong source hash')
    if quote['revision']!=project['revision'] or estimate['revision']!=project['revision']:raise RuntimeError('Stale evidence')
    require_reviewed_approval(project['revision'],estimate['snapshot_id'])
    if len(audit['groups'])!=31 or audit['source_counts']['meshes']!=77 or len(estimate['lines'])!=34:raise RuntimeError('Unexpected scope')
    if estimate['unpriced_line_count'] or estimate['priced_line_count']!=34 or estimate['reference_line_count']!=34:raise RuntimeError('Full reference pricing required')
    if estimate.get('budget_mode')!='estimate_first':raise RuntimeError('Budget decision not recorded')
    jobs=request(f'/v1/projects/{SCENE}/render-jobs',port=8000)['jobs']
    render=next((job for job in jobs if job['status']=='COMPLETED' and job['revision']==project['revision']),None)
    if not render:raise RuntimeError('Current-revision rendered evidence is required')
    image_url='http://127.0.0.1:8000'+render['render_url']
    with urlopen(image_url,timeout=15) as response:png=response.read()
    if not png.startswith(b'\x89PNG') or len(png)<1000:raise RuntimeError('Invalid render artifact')
    if render.get('image_sha256') and hashlib.sha256(png).hexdigest()!=render['image_sha256']:raise RuntimeError('Render digest mismatch')
    transform=project['external_scene']['root_transform']
    if transform!={'translation':[0,0,0],'rotation_euler_deg':[0,0,0],'scale':[1,1,1]}:raise RuntimeError('Inspect changed root transform before acceptance')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    (ARTIFACTS/f'native-before-acceptance-{stamp}.json').write_text(json.dumps(list(selected.values()),ensure_ascii=False,indent=2),encoding='utf-8')
    counts=audit['source_counts'];bbox=audit['geometry']['dimensions_m']
    common=f'''# Nghiệm thu phạm vi mô hình/phần mềm — revision {project['revision']}

{APPROVAL}

- Native project: `{PROJECT}`; canonical scene: `{SCENE}`.
- GLB SHA256: `{HASH}`. Nguồn chuẩn là GLB, không phải phòng ngủ/cảnh Studio cũ.
- Bản dựng: {counts['scenes']} scene, {counts['nodes']} node, {counts['meshes']} mesh, {counts['materials']} vật liệu, {counts['textures']} texture.
- Kích thước bao X/Y/Z glTF: {bbox[0]:.6f} × {bbox[1]:.6f} × {bbox[2]:.6f} m; tỷ lệ nguồn giữ nguyên, không tái hiệu chỉnh theo kích thước phòng cũ.
- Root transform giữ nguyên; 31 nhóm đồ/chi tiết, thêm 3 dòng sàn/tường/nhân công = 34 nhóm BOQ.
- Cost snapshot `{estimate['snapshot_id']}`: 34/34 có giá tham khảo, 0 mục thiếu đơn giá; trước VAT giả định {estimate['total_vnd']-estimate['tax_vnd']:,.0f} VND, VAT giả định {estimate['tax_vnd']:,.0f} VND, tổng tham khảo **{estimate['total_vnd']:,.0f} VND**.
- Ngân sách: lập dự toán trước, chưa giới hạn; không dùng hạn mức phòng cũ.
- [Bảng Excel hiện tại](http://127.0.0.1:8000/api/v1/exports/{SCENE}/xlsx) · [CSV](http://127.0.0.1:8000/api/v1/exports/{SCENE}/csv).
- Render thực `{render['job_id']}`: `{render['status']}`, revision {render['revision']}, {render.get('width_px')}×{render.get('height_px')}; [mở ảnh]({image_url}).

## Giới hạn đã được người dùng chấp nhận
Giá là sản phẩm/hệ vật liệu đối chiếu; không xác nhận SKU, hãng hoặc nhà cung cấp gốc của mesh. Tham chiếu giá không thay đổi vật liệu/hình học GLB. Các thành phần thiết bị bếp, ray/phụ kiện, phạm vi lắp đặt, VAT và vận chuyển vẫn phải báo lại khi mua/thi công thật.

QA ở đây kiểm tra dữ liệu, bảo toàn nguồn, mô hình tải được, nhóm vật thể, tính toán và ảnh xuất được. Không ghi kết quả lối đi tối thiểu, chịu lực hay chiều cao lan can đạt chuẩn khi chưa đo/kiểm định. Lan can nguồn có hộp bao cao khoảng 582mm; tỷ lệ/điều kiện thi công phải được kiểm tra riêng. Không chứng nhận an toàn xây dựng.

Hồ sơ gốc và lịch sử task được giữ. Đây là kết quả công cụ kiểm tra/thực thi thực tế do Codex chuẩn bị theo yêu cầu người dùng; không giả lập rằng đã có một lượt native agent mới chạy thành công.
'''
    sections={
      'ATL-8':'Chốt phạm vi: dùng GLB hiện tại; chuyển nhóm task sang dự án này; đủ 34 nhóm giá tham khảo; estimate-first và nghiệm thu mô hình/phần mềm đã được người dùng xác nhận.',
      'ATL-2':'Kiểm tra mặt bằng/tỷ lệ nhập: các bounds và mặt sàn được tính trực tiếp từ tam giác glTF trong mét; giữ đúng tỷ lệ nguồn. Đây không phải đo hiện trạng công trường.',
      'ATL-3':'Kiểm tra dựng SceneGraph: asset hash đúng, 147 node/77 mesh, root transform identity; dùng toàn cảnh nguồn. Các đồ phòng ngủ cũ không được dùng để lập danh mục BOQ này.',
      'ATL-9':'Kiểm tra bố trí: 31 nhóm từ chính GLB và các node nguồn; giữ vị trí/góc xoay/scale nguồn, không sắp xếp lại theo brief phòng cũ. Lịch sử thi công không thay đổi bố trí đã lưu.',
      'ATL-4':'Kiểm tra vật liệu: bảo toàn 22 vật liệu/23 texture và dữ liệu UV theo nguồn; giá đối chiếu không tự áp vật liệu thương mại khác lên Scene.',
      'ATL-10':'Trần/camera/ánh sáng phần mềm: có render hoàn tất ở revision hiện tại; file PNG có thể tải và SHA256 khớp receipt. GLB nguồn không có camera/đèn; ánh sáng trình xem/render là cấu hình ứng dụng, không giả định giống thiết lập Sketchfab gốc.',
      'ATL-11':'Nghiên cứu nguồn: 34 dòng đều có link và căn cứ tham khảo, phân biệt sản phẩm so sánh với SKU gốc chưa biết. Người dùng đã chấp nhận phạm vi tham khảo, không nghiệm thu mua hàng.',
      'ATL-12':'QA phạm vi đã duyệt: hash/identity/revision, counts, root transform, danh mục, phép tính, dữ liệu tải và render được kiểm tra. Các kiểm định thi công thực tế không thuộc phạm vi nghiệm thu lần này; không dùng QA phòng cũ làm bằng chứng.',
      'ATL-5':'Cost/BOM: tổng tính xác định từ 34 dòng giá tham khảo; báo riêng đơn vị, khối lượng mô hình, nguồn và công thức; tách nhân công để tránh cộng lặp phần công của các dòng vật tư tham chiếu. Không so với ngân sách cũ.',
      'ATL-13':'Final Review: đối chiếu các đầu ra cùng revision và snapshot. Người dùng đã duyệt cơ sở tham khảo 34 nhóm và giới hạn nghiệm thu mô hình/phần mềm trong cuộc trò chuyện ngày 2026-11-17.',
      'ATL-7':'Tổng hợp: mọi stage được nghiệm thu theo đúng phạm vi mới, có tài liệu và artifact. Task tổng chỉ Done sau khi đủ 10 stage Done; không tạo giả lịch sử chạy agent.'}
    inventory='\n'.join(f"|{row['name']}|{row['quantity']:.6f}|{row['unit']}|{row['unit_price_vnd']:,.3f}|{row['subtotal_reference_before_assumed_vat']:,.0f}|[Nguồn]({row['source_url']})|" for row in quote['rows'])
    quote_table='\n\n## Dự toán tham khảo 34 nhóm\n\n|Hạng mục|KL mô hình/tham khảo|Đơn vị|Đơn giá trước VAT giả định|Thành tiền|Nguồn|\n|---|---:|---|---:|---:|---|\n'+inventory
    completed=[]
    for code in ORDER:
        row=selected[code];body=common+'\n## Đầu ra của bước này\n\n'+sections[code]
        if code in ('ATL-5','ATL-11','ATL-13','ATL-7'):
            body+=quote_table+'\n\n## Căn cứ và điều kiện từng dòng\n\n'+'\n'.join(f"- **{line['name']}**: {line['source_note']} {'; '.join(line['limitations'])}" for line in quote['rows'])
        (ARTIFACTS/f'{code}-acceptance.md').write_text(body,encoding='utf-8')
        upsert_document(row['id'],body)
        products=request(f'/issues/{row["id"]}/work-products')
        if isinstance(products,dict):products=products.get('workProducts',products.get('items',[]))
        (ARTIFACTS/f'{code}-work-products-before.json').write_text(json.dumps(products,ensure_ascii=False,indent=2),encoding='utf-8')
        external_id=f'current-glb:{HASH}:r{project["revision"]}:{code}'
        existing=next((p for p in products if p.get('externalId')==external_id),None)
        for old in products:
            if old.get('externalId')==external_id:continue
            if 'proj_demo_4x5m' in (old.get('url') or '') or old.get('projectId')=='142c2363-1cec-42d6-92b5-27f77b3a2570':
                request(f'/work-products/{old["id"]}',{'status':'archived','isPrimary':False},'PATCH')
        product={'projectId':PROJECT,'type':'artifact' if code=='ATL-10' else 'document','provider':'atelier-current-scene-audit','externalId':external_id,
          'title':f'{code} — GLB Rev {project["revision"]} — nghiệm thu mô hình/phần mềm',
          'url':image_url if code=='ATL-10' else f'http://127.0.0.1:3100/api/issues/{row["id"]}/documents/current-glb-acceptance',
          'status':'approved','reviewState':'approved','isPrimary':True,'healthStatus':'healthy','summary':sections[code],
          'metadata':{'canonicalSceneId':SCENE,'sourceRevision':project['revision'],'assetHash':HASH,'costSnapshotId':estimate['snapshot_id'],
                      'scope':'software_model_and_reference_estimate','commercialQuoteComplete':False,'constructionQaCertified':False,'approvalEvidence':APPROVAL}}
        if not existing:request(f'/issues/{row["id"]}/work-products',product,'POST')
        else:request(f'/work-products/{existing["id"]}',{k:v for k,v in product.items() if k not in ('provider','externalId','type')},'PATCH')
        if args.complete_user_approved_scope:
            fresh=request(f'/v1/projects/{SCENE}/cost-workflow',port=8000)['estimate']
            if fresh['snapshot_id']!=estimate['snapshot_id']:raise RuntimeError('Estimate changed during acceptance; stop before further Done updates')
            result=request(f'/issues/{row["id"]}',{'status':'done'},'PATCH')
            if result.get('status')!='done':raise RuntimeError(f'{code} completion not persisted')
            completed.append(code)
    state=request(f'/companies/{company["id"]}/issues')
    final=[{key:row.get(key) for key in ('id','identifier','projectId','status')} for row in state if row['id'] in {item['id'] for item in selected.values()}]
    (ARTIFACTS/'native-acceptance-result.json').write_text(json.dumps({'scope':'software_model_and_reference_estimate','approval':APPROVAL,'revision':project['revision'],'snapshot_id':estimate['snapshot_id'],'tasks':final},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'published':len(ORDER),'completed':completed,'revision':project['revision'],'total_reference_vnd':estimate['total_vnd'],'scope':'software_model_and_reference_estimate','commercial_quote_complete':False},ensure_ascii=False))

if __name__=='__main__':main()
