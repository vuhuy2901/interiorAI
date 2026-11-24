import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json

conn = db_mod.get_conn()
c = conn.cursor()
c.execute("SELECT asset_hash, state_json FROM construction_history WHERE project_id = ?", ("proj_the_interior_14",))
asset_hash, sj = c.fetchone()
data = json.loads(sj)
hist = data.get("history", [])
print(f"Current history items: {len(hist)}")

clean_hist = [item for item in hist if not item.get("id", "").startswith("furniture:")]
print(f"Clean history items: {len(clean_hist)}")
for idx, item in enumerate(clean_hist):
    print(f"  {idx+1}. {item.get('id')}: {item.get('name')}")
