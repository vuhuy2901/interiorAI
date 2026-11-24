import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json
from app.services.scene_cost import scene_scope, calculate_external_estimate

proj = db_mod.get_project("proj_the_interior_14")
print("Before fix:")
print(f"furniture_instances: {len(proj.furniture_instances)}")
items = scene_scope(proj)
print(f"scene_scope items: {len(items)}")
furn_items = [i for i in items if i['id'].startswith('furniture:')]
print(f"furniture items in scene_scope: {len(furn_items)}")

# What happens if furniture_instances is empty?
proj_copy = proj.model_copy(deep=True)
proj_copy.furniture_instances = []
items_clean = scene_scope(proj_copy)
print("\nIf furniture_instances is empty:")
print(f"scene_scope items: {len(items_clean)}")
est = calculate_external_estimate(proj_copy)
print(f"estimate lines: {len(est.lines)}")
print(f"priced: {est.priced_line_count}, unpriced: {est.unpriced_line_count}, coverage: {est.price_coverage_percent}%")
print(f"total: {est.total_vnd:,.0f} đ")
