import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json

conn = db_mod.get_conn()
c = conn.cursor()
c.execute("SELECT item_id, payload_json FROM scene_cost_prices WHERE project_id = ?", ("proj_the_interior_14",))
rows = c.fetchall()
print(f"Total prices stored: {len(rows)}")
for item_id, pj in rows:
    data = json.loads(pj)
    print(f"  {item_id}: unit={data.get('unit')}, qty={data.get('quantity')}, price={data.get('unit_price_vnd'):,}, note={data.get('source_note')}")
