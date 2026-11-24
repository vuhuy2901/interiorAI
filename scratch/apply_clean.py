import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json
from app.services.scene_cost import scene_scope, calculate_external_estimate

# 1. Update project in database
proj = db_mod.get_project("proj_the_interior_14")
if not proj:
    print("Project not found!")
    sys.exit(1)

print(f"Original furniture instances: {len(proj.furniture_instances)}")
proj.furniture_instances = []
db_mod.save_project(proj, bump_revision=False)
print("Saved project with empty furniture_instances.")

# 2. Clean construction_history table
conn = db_mod.get_conn()
c = conn.cursor()

c.execute("SELECT asset_hash, state_json FROM construction_history WHERE project_id = ?", ("proj_the_interior_14",))
rows = c.fetchall()
for asset_hash, sj in rows:
    data = json.loads(sj)
    hist = data.get("history", [])
    clean_hist = [item for item in hist if not item.get("id", "").startswith("furniture:")]
    data["history"] = clean_hist
    c.execute(
        "UPDATE construction_history SET state_json = ? WHERE project_id = ? AND asset_hash = ?",
        (json.dumps(data, ensure_ascii=False), "proj_the_interior_14", asset_hash)
    )
    print(f"Updated construction_history: reduced from {len(hist)} to {len(clean_hist)} items.")

# 3. Clean scene_cost_prices table
c.execute("DELETE FROM scene_cost_prices WHERE project_id = ? AND item_id LIKE 'furniture:%'", ("proj_the_interior_14",))
print(f"Deleted {c.rowcount} furniture items from scene_cost_prices.")

conn.commit()
conn.close()

# 4. Verify clean project
proj_check = db_mod.get_project("proj_the_interior_14")
print(f"Verification: furniture_instances = {len(proj_check.furniture_instances)}")
scope = scene_scope(proj_check)
print(f"Verification: scene_scope items = {len(scope)}")
est = calculate_external_estimate(proj_check)
print(f"Verification: estimate items = {len(est.lines)}, priced = {est.priced_line_count}, coverage = {est.price_coverage_percent}%, total = {est.total_vnd:,.0f} đ")
print("ALL CLEANUP COMPLETED SUCCESSFULLY.")
