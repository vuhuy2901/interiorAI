"""Prepare sourced reference valuation for all imported-scene BOQ groups.

These are comparable products/material systems, not supplier-confirmed original
GLB SKUs. No geometry/material substitution or procurement is performed.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
SCENE='proj_bedroom_japandi_4x4m'
HASH='19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f'
OUTPUT=ROOT/'data'/'exports'/(SCENE+'_workflow_review')

def api(path, body=None, method=None):
    request=Request('http://127.0.0.1:8000/api/v1'+path,
        data=json.dumps(body,ensure_ascii=False).encode('utf-8') if body is not None else None,
        method=method,headers={'Content-Type':'application/json; charset=utf-8'})
    with urlopen(request,timeout=30) as response:return json.load(response)

def build_quote(audit, manifest, references):
    groups={group['id'].split(':')[1]:group for group in audit['groups']}
    bases={group['name']:group for group in audit['base']}
    ungrouped={group['name']:group for group in audit['ungrouped']}
    rows=[]
    onehome='https://noithatonehome.com/bao-gia-tu-bep'
    ceiling_url='https://hanawood.vn/bang-gia/bao-gia-thi-cong-op-tran-nhua-gia-go-tron-goi-2026'
    wall_url='https://hanawood.vn/bang-gia/bao-gia-thi-cong-op-tuong-pvc-gia-da-tron-goi-2026'
    floor_url='https://hanawood.vn/bang-gia/bao-gia-thi-cong-san-go-fortune-tron-goi-2026'
    floor_area=bases['Plane']['up_facing_area_m2']+bases['Cube']['up_facing_area_m2']
    wall_area=sum(ungrouped[name]['vertical_area_m2'] for name in ['Plane001_Material002_0','Plane002_Material003_0','Plane003_Material002_0','node_0010_Material002_0'])
    ceiling_area=groups['ceiling']['surface_area_m2']
    for item in manifest['items']:
        key=item['id'].split(':')[1]; group=groups.get(key)
        rate=None;quantity=1;unit='bộ';url='';basis='';vat='unknown'; limitations=[]
        if item['id'] in references:
            price=references[item['id']];rate=price['unit_price_vnd'];url=price['source_url'];basis=price['source_note']
        elif key.startswith('sofa-'):
            rate=20290000;url='https://moho.com.vn/collections/ghe-sofa'
            basis='Đối chiếu một combo sofa góc MOHO HOBRO 2,7m; không phải SKU hay kích thước gốc GLB.'
        elif key=='dining':
            rate=22290000;url='https://moho.com.vn/collections/bo-ban-an'
            basis='Đối chiếu bộ DALUMD 1,6m và 6 ghế; số ghế/mẫu thật trong nhóm GLB cần đối chiếu khi mua.'
        elif key=='stool-c':
            rate=2790000;url='https://moho.com.vn/collections/phong-khach';basis='Đối chiếu một ghế đôn VLINE 601, khác mẫu ghế rời GLB.'
        elif key in ('shelf-ground','shelf-upper'):
            dims=group['dimensions_m'];quantity=max(dims[0],dims[2])*dims[1];unit='m² mặt đứng';rate=1800000;url=onehome
            basis='Giá sách không cánh melamine gỗ Thái Lan 1.800.000đ/m²; khối lượng là mặt bao đứng GLB, chưa khảo sát cấu tạo/kết cấu tủ.'
        elif key=='console-upper':
            dims=group['dimensions_m'];quantity=max(dims[0],dims[2])*dims[1];unit='m² mặt đứng';rate=2500000;url=onehome
            basis='Đối chiếu tủ rượu melamine gỗ Thái Lan 2.500.000đ/m² làm mốc tủ thấp đặt riêng; khác loại và cấu tạo tủ console nguồn.'
        elif key=='kitchen':
            quantity=max(group['dimensions_m'][0],group['dimensions_m'][2]);unit='m dài';rate=3000000;url=onehome
            basis='Tham chiếu tủ bếp dưới melamine An Cường 3.000.000đ/md; chiều dài lấy mặt bao nhóm GLB.'
            limitations=['Chưa xác minh đá mặt bếp, chậu/vòi, thiết bị và phụ kiện; đơn giá này chỉ cho phần tủ. Cần báo giá riêng để thành báo giá mua hàng đầy đủ.']
        elif key in ('cabinet','curtain-upper'):
            quantity=max(group['dimensions_m'][0],group['dimensions_m'][2]);unit='m ngang';rate=475000
            url='https://remminhdang.com/rem-cua-bao-nhieu-tien-mot-met/'
            basis='Mốc dự toán giữa dải rèm phổ thông 250.000–700.000đ/m ngang: (250.000+700.000)/2. Cao GLB dưới 2,8m; chưa xác minh độ nhún, lớp vải và ray.'
        elif key.startswith('window-'):
            quantity=sum(math.prod(sorted(member['dimensions_m'])[-2:]) for member in group['members']);unit='m² ô cửa';rate=1550000
            url='https://conginox.com.vn/bao-gia-cua-nhom-xingfa.html'
            basis='Đối chiếu hệ Xingfa 1.550.000đ/m²; cộng diện tích mặt bao riêng từng mesh khung, không lấy hộp bao toàn nhóm trải qua nhiều tường.'
            limitations=['Chưa xác nhận số ô cửa, phụ kiện, loại kính và việc các mesh có thuộc cùng ô cửa; cần đối soát shopdrawing.']
        elif key=='railing-upper':
            panels=[member for member in group['members'] if member['name'].startswith(('Cube012_','Cube013_','Cube014_'))]
            quantity=sum(max(member['dimensions_m'][0],member['dimensions_m'][2]) for member in panels);unit='m dài';rate=1500000
            url='https://citybuilding.vn/lan-can-kinh-cuong-luc-520665s.html'
            basis='Mốc trên dải lan can kính trụ inox 1,2–1,5 triệu/md; cộng chiều dài 3 tấm kính GLB, không cộng lặp tay vịn trên/dưới.'
            limitations=['Lan can trong GLB chỉ cao khoảng 582mm theo tỷ lệ nguồn; chưa chứng nhận an toàn/kích thước thi công hay tính đủ các đoạn không có tấm kính.']
        elif key.startswith('art-'):
            rate=1056000;url='https://tranhnamdinh.vn/tranh-canvas/tranh-bo-2-buc-chim-va-hoa-tbav6-16.html'
            basis='Đối chiếu bộ 2 tranh canvas khung composite 60×80cm TBAV6-16, 1.056.000đ/bộ; khác hình in/kích thước/tổng số tranh gốc.'
        elif key.startswith('rug-'):
            quantity=group['surface_area_m2'];unit='m²';rate=175000;url='https://hanawood.vn/san-pham/tham-trai-san'
            basis='Mốc phổ biến thảm 175.000đ/m²; diện tích tam giác thảm GLB, không dùng hộp bao (thảm tầng 2 không phủ kín hộp bao). Chưa xác minh loại sợi/viền.'
        elif key=='ceiling':
            quantity=ceiling_area;unit='m²';rate=491000/1.08;vat='normalized_from_inclusive_8';url=ceiling_url
            basis='Hệ nano giả gỗ tham khảo: 224.000 tấm + 80.000 keo/pat + 65.000 nẹp + 22.000 hao hụt + 100.000 khung =491.000đ/m² gồm VAT giả định8%, quy về trước VAT /1,08. Công280.000đ/m² tách ở dòng nhân công. Không xác nhận đây là vật liệu thật của GLB.'
        elif key=='surface-floor':
            quantity=floor_area;unit='m²';rate=435000/1.08;vat='normalized_from_inclusive_8';url=floor_url
            basis='Mốc hệ sàn Fortune8mm: 360.000 vật tư +12.000 xốp +45.000 len/nẹp +18.000 hao hụt =435.000đ/m², tách công30.000. Quy về trước VAT giả định8% /1,08. Diện tích là các mặt hướng lên Plane và Cube, không cộng đáy sàn tầng2; khác SKU/vật liệu GLB chưa xác định.'
        elif key=='surface-wall':
            quantity=wall_area;unit='m² bề mặt';rate=277000/1.08;vat='normalized_from_inclusive_8';url=wall_url
            basis='Mốc PVC giả đá:134.000 tấm +60.000 keo +70.000 nẹp +13.000 hao hụt =277.000đ/m² đãVAT8%, /1,08 về trướcVAT; tách công100.000. Cộng diện tích mặt đứng mesh tường nguồn, có cả mặt đối diện nếu nguồn chứa; chưa xác định mặt trong/ngoài và đá tự nhiên hay lớp ốp.'
        elif key=='installation':
            unit='gói';rate=(floor_area*30000+wall_area*100000+ceiling_area*280000)/1.08;vat='normalized_from_inclusive_8';url=ceiling_url
            basis=f'Công bề mặt: {floor_area:.6f}m² sàn×30.000 + {wall_area:.6f}m² tường×100.000 + {ceiling_area:.6f}m² trần×280.000; /1,08 về trướcVAT giả định8%. Nguồn phụ: {floor_url} và {wall_url}. Không cộng lại công trong các dòng vật tư đã tách.'
            limitations=['Chỉ gồm công sàn/tường/trần theo hệ vật liệu đối chiếu. Chưa có báo giá lắp ráp/vận chuyển đồ rời, mặt bằng, độ cao hay điều kiện thực tế.']
        if rate is None or not math.isfinite(quantity) or quantity<=0 or rate<=0:
            raise ValueError(f'Missing defensible reference basis for {key}')
        rows.append({'id':item['id'],'name':item['name'],'unit_price_vnd':rate,'quantity':quantity,'unit':unit,
            'price_status':'illustrative','source_url':url,'source_note':basis,'checked_at':'2026-11-17',
            'tax_basis':vat,'limitations':limitations,'subtotal_reference_before_assumed_vat':round(quantity*rate)})
    assert len(rows)==34
    return {'schema':'atelier.reference-quote-proposal.v1','project_id':SCENE,'asset_hash':HASH,
            'commercial_quote_complete':False,'reference_line_count':34,'rows':rows,
            'subtotal_reference_before_assumed_vat':sum(row['subtotal_reference_before_assumed_vat'] for row in rows),
            'limitations':['Comparable-product valuation only, not original GLB SKU/vendor quotations.',
                'Material selections, component completeness, tax basis and source measurements require review; no material changes applied.',
                'Transport, structural works, stairs, wiring and concealed services are not included.']}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--publish-reference',action='store_true');args=parser.parse_args()
    project=api(f'/projects/{SCENE}')
    if project.get('external_scene',{}).get('sha256')!=HASH:raise RuntimeError('Wrong scene')
    raw=subprocess.check_output(['node','--import','./server/node_modules/tsx/dist/loader.mjs','scripts/audit-current-scene.mjs','../data/assets/scenes/the_interior_14_spacious/the_interior_14_is_spacious..glb'],cwd=ROOT/'paperclip',encoding='utf-8')
    audit=json.loads(raw)
    manifest=json.loads((ROOT/'data/scene-cost/the_interior_14_spacious.json').read_text(encoding='utf-8'))
    references=json.loads((ROOT/'data/scene-cost/reference-prices.json').read_text(encoding='utf-8'))
    proposal=build_quote(audit,manifest,references);proposal['revision']=project['revision']
    OUTPUT.mkdir(parents=True,exist_ok=True)
    (OUTPUT/'source-audit.json').write_text(raw,encoding='utf-8')
    (OUTPUT/'reference-quote-proposal.json').write_text(json.dumps(proposal,ensure_ascii=False,indent=2),encoding='utf-8')
    from openpyxl import Workbook
    wb=Workbook();ws=wb.active;ws.title='34 reference groups'
    ws.append(['DỰ TOÁN THAM KHẢO 34 NHÓM — CHƯA PHẢI BÁO GIÁ NHÀ CUNG CẤP'])
    ws.append(['Hạng mục','Khối lượng tham khảo','Đơn vị','Đơn giá tham khảo trước VAT giả định','Thành tiền','Căn cứ','Nguồn','Cần xác minh'])
    for row in proposal['rows']:ws.append([row['name'],row['quantity'],row['unit'],row['unit_price_vnd'],row['subtotal_reference_before_assumed_vat'],row['source_note'],row['source_url'],'; '.join(row['limitations'])])
    ws.freeze_panes='B3';ws.auto_filter.ref=f'A2:H{ws.max_row}';wb.save(OUTPUT/'reference-quote-34.xlsx')
    if args.publish_reference:
        # The currently configured user overrides are never overwritten silently.
        workflow=api(f'/projects/{SCENE}/cost-workflow')
        if workflow.get('overridden_item_ids'):raise RuntimeError('Existing user overrides found; review proposal without publishing')
        (OUTPUT/'estimate-before-reference.json').write_text(json.dumps(workflow,ensure_ascii=False,indent=2),encoding='utf-8')
        for row in proposal['rows']:
            api(f'/projects/{SCENE}/cost-items/{row["id"]}',{key:row[key] for key in ['unit_price_vnd','quantity','unit','price_status','source_note','source_url']}|{'asset_hash':HASH},'PUT')
    print(json.dumps({'rows':34,'revision':proposal['revision'],'subtotal_reference':proposal['subtotal_reference_before_assumed_vat'],'commercial_quote_complete':False,'published':args.publish_reference,'files':str(OUTPUT)},ensure_ascii=False))

if __name__=='__main__':main()
