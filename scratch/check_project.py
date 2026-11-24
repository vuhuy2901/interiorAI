import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json

conn = db_mod.get_conn()
c = conn.cursor()

c.execute("SELECT state_json FROM construction_history WHERE project_id = ?", ("proj_the_interior_14",))
row = c.fetchone()
if row:
    data = json.loads(row[0])
    hist = data.get("history", [])
    print(f"Total history items: {len(hist)}")
    const_items = [item for item in hist if item.get("id", "").startswith("construction:")]
    furn_items = [item for item in hist if item.get("id", "").startswith("furniture:")]
    print(f"Construction items ({len(const_items)}):")
    for ci in const_items:
        print(" ", ci.get("id"), "->", ci.get("name"), f"(Tầng {ci.get('floor')})")
    print(f"\nFurniture items ({len(furn_items)}):")
    for fi in furn_items:
        print(" ", fi.get("id"), "->", fi.get("name"))

c.execute("SELECT snapshot_json FROM scene_cost_snapshots WHERE project_id = ?", ("proj_the_interior_14",))
snap_row = c.fetchone()
if snap_row:
    snap = json.loads(snap_row[0])
    line_items = snap.get("line_items", [])
    print(f"\nScene cost snapshot line items: {len(line_items)}")
    for li in line_items:
        print("  cost line:", li.get("item_id"), "->", li.get("name"), "qty:", li.get("quantity"), "unit_price:", li.get("unit_price_vnd"))
