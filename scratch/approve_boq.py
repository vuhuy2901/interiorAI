import sys, io, json, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = 'http://localhost:8000'
items = [
    ('boq_furn_furn_sofa_main', 'opt_gen_mdf_mr', 'quote_sofa_default'),
    ('boq_furn_furn_table_main', 'opt_desk_mdf_mr_twotone', 'quote_joinery_desk'),
    ('boq_furn_furn_tv_main', 'opt_mdf_mr_walnut', 'quote_tv_cabinet_default'),
    ('boq_furn_furn_chair_accent', 'opt_chair_ergo_fabric', 'quote_hoaphat_chair'),
    ('boq_floor_room_main', 'opt_floor_oak_12mm', 'quote_ancuong_floor'),
    ('boq_skirting_room_main', None, None),
    ('boq_paint_wall_proj_c22bdd94', 'opt_paint_dulux_easyclean', 'quote_dulux_official'),
    ('boq_ceiling_proj_c22bdd94', None, None),
    ('boq_door_door_main', None, None),
    ('boq_win_win_north', None, None),
    ('boq_elec_led_proj_c22bdd94', None, None),
    ('boq_decor_curtain_proj_c22bdd94', None, None),
    ('boq_labor_assembly_proj_c22bdd94', None, None),
    ('boq_logistics_ship_proj_c22bdd94', None, None)
]

for iid, oid, qid in items:
    p = {'approval_state': 'USER_APPROVED', 'approved_by': 'user'}
    if oid:
        p['selected_option_id'] = oid
    if qid:
        p['selected_quote_id'] = qid
    url = f'{BASE}/api/v1/projects/proj_c22bdd94/boq-items/{iid}/decision'
    r = urllib.request.Request(
        url,
        data=json.dumps(p).encode('utf-8'),
        method='POST'
    )
    r.add_header('Content-Type', 'application/json; charset=utf-8')
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            print('OK:', iid)
    except Exception as ex:
        print('ERR:', iid, ex)
