import json

with open(r"c:\QLDAPM-final\interiorAI\data\scene-cost\the_interior_14_spacious.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total items in manifest: {len(data['items'])}")
for idx, it in enumerate(data["items"]):
    dim = it.get("dimensions_mm", [])
    print(f"{idx+1}. {it['id']} | {it['name']} | unit: {it['unit']} | qty: {it['quantity']} | dim: {dim}")
