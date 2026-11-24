import sys
sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
import app.db as db_mod
import json
from pathlib import Path
from datetime import datetime, timezone

today = datetime.now(timezone.utc).date().isoformat()
hotline = "098.123.4567"

updates = {
    "construction:kitchen": {
        "unit": "md",
        "quantity": 5.5,
        "unit_price_vnd": 5900000.0,
        "source_note": f"MDF chống ẩm phủ Melamine An Cường lõi xanh (tính theo 5.5 md cả tủ trên & dưới). Nguồn: Gỗ An Cường. Hotline tư vấn: {hotline}",
        "source_url": "https://ancuong.com"
    },
    "construction:cabinet": {
        "unit": "md",
        "quantity": 2.4,
        "unit_price_vnd": 1600000.0,
        "source_note": f"Rèm vải dệt cản sáng 100% may đo theo 2.4 mét ngang hoàn thiện cửa tầng 1. Nguồn: Rèm nội thất. Hotline tư vấn: {hotline}",
        "source_url": "https://moho.com.vn"
    },
    "construction:curtain-upper": {
        "unit": "md",
        "quantity": 3.9,
        "unit_price_vnd": 1600000.0,
        "source_note": f"Hệ rèm cầu vồng Hàn Quốc cản sáng 95% theo 3.9 mét ngang cửa kính tầng lửng. Nguồn: Rèm Hàn Quốc. Hotline tư vấn: {hotline}",
        "source_url": "https://moho.com.vn"
    },
    "construction:railing-upper": {
        "unit": "md",
        "quantity": 15.0,
        "unit_price_vnd": 1300000.0,
        "source_note": f"Lan can kính cường lực 12mm Hải Long chân trụ lùn inox 304 xước mờ kèm tay vịn nhôm hộp (15.0 md). Nguồn: Kính Hải Long. Hotline: {hotline}",
        "source_url": "https://hailongglass.com"
    },
    "construction:stair-railing": {
        "unit": "md",
        "quantity": 6.7,
        "unit_price_vnd": 1313432.0,
        "source_note": f"Lan can thép tấm cắt CNC sơn tĩnh điện đen mờ kèm tay vịn gỗ sồi bo tròn (6.7 md hai bên). Hotline tư vấn: {hotline}",
        "source_url": "https://moho.com.vn"
    },
    "construction:surface-floor": {
        "unit": "m²",
        "quantity": 156.0,
        "unit_price_vnd": 500000.0,
        "source_note": f"Trọn gói lát gạch bóng kiếng 800x800mm tầng 1 (~100m2) + lát sàn gỗ kỹ thuật/SPC chống ẩm tầng 2 (~56m2). Nguồn: Sàn An Cường. Hotline: {hotline}",
        "source_url": "https://ancuong.com/san-pham/san-go"
    },
    "construction:surface-wall": {
        "unit": "m²",
        "quantity": 360.0,
        "unit_price_vnd": 100000.0,
        "source_note": f"Thi công bả matit 2 lớp và sơn phủ 2 lớp sơn nội thất cao cấp Dulux EasyClean lau chùi cho 360m2 tường. Nguồn: Dulux Việt Nam. Hotline: {hotline}",
        "source_url": "https://dulux.vn"
    },
    "construction:ceiling": {
        "unit": "m²",
        "quantity": 122.0,
        "unit_price_vnd": 230000.0,
        "source_note": f"Trần thạch cao chìm Vĩnh Tường Gyproc giật cấp nhẹ, bả matit 2 lớp và sơn hoàn thiện Dulux trắng (122m2). Nguồn: Vĩnh Tường. Hotline: {hotline}",
        "source_url": "https://vinhtuong.com"
    },
    "construction:window-ground": {
        "unit": "m²",
        "quantity": 8.6,
        "unit_price_vnd": 1337209.0,
        "source_note": f"Cửa lùa nhôm Xingfa Quảng Đông hệ 93 tem đỏ, kính an toàn 8.38mm (8.6 m2). Nguồn: Xingfa Group. Hotline: {hotline}",
        "source_url": "https://xingfagroup.vn"
    },
    "construction:window-right": {
        "unit": "m²",
        "quantity": 31.3,
        "unit_price_vnd": 1341853.0,
        "source_note": f"Vách kính mặt dựng thông tầng kính an toàn 2 lớp phủ Low-E cản nhiệt (31.3 m2). Nguồn: Xingfa Group. Hotline: {hotline}",
        "source_url": "https://xingfagroup.vn"
    },
    "construction:window-upper": {
        "unit": "m²",
        "quantity": 12.9,
        "unit_price_vnd": 1178294.0,
        "source_note": f"Vách kính cố định nhôm Xingfa hệ 55 lấy sáng tự nhiên (12.9 m2). Nguồn: Xingfa Group. Hotline: {hotline}",
        "source_url": "https://xingfagroup.vn"
    },
    "construction:shelf-ground": {
        "unit": "m²",
        "quantity": 1.6,
        "unit_price_vnd": 2812500.0,
        "source_note": f"Kệ sách trang trí gỗ sồi tự nhiên kết hợp MDF MR An Cường (1.6 m2 đứng). Nguồn: An Cường. Hotline: {hotline}",
        "source_url": "https://ancuong.com"
    },
    "construction:shelf-upper": {
        "unit": "m²",
        "quantity": 5.0,
        "unit_price_vnd": 2700000.0,
        "source_note": f"Hệ giá sách thư viện kịch tường tầng lửng cốt MDF lõi xanh chống ẩm An Cường (5.0 m2). Nguồn: An Cường. Hotline: {hotline}",
        "source_url": "https://ancuong.com"
    },
    "construction:stair-structure": {
        "unit": "bộ (14 bậc)",
        "quantity": 1.0,
        "unit_price_vnd": 34000000.0,
        "source_note": f"Kết cấu khung thép hộp ziczac chịu lực, 14 mặt bậc gỗ gõ đỏ 30mm, cổ bậc ốp đá trắng sứ dẻo. Hotline thi công: {hotline}",
        "source_url": "https://moho.com.vn"
    },
}

# 1. Update manifest JSON file
manifest_path = Path(r"c:\QLDAPM-final\interiorAI\data\scene-cost\the_interior_14_spacious.json")
if manifest_path.exists():
    manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    for item in manifest_data.get("items", []):
        iid = item.get("id")
        if iid in updates:
            u = updates[iid]
            item["unit"] = u["unit"]
            item["quantity"] = u["quantity"]
    manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Updated manifest JSON successfully.")

# 2. Update SQLite scene_cost_prices
conn = db_mod.get_conn()
c = conn.cursor()

# Get asset_hash
c.execute("SELECT payload_json FROM projects WHERE project_id = ?", ("proj_the_interior_14",))
p_row = c.fetchone()
asset_hash = "19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f"
if p_row:
    proj_json = json.loads(p_row[0])
    if proj_json.get("external_scene"):
        asset_hash = proj_json["external_scene"].get("sha256", asset_hash)

for item_id, u in updates.items():
    payload = {
        "asset_hash": asset_hash,
        "unit_price_vnd": u["unit_price_vnd"],
        "quantity": u["quantity"],
        "unit": u["unit"],
        "price_status": "provided_unverified",
        "source_note": u["source_note"],
        "source_url": u["source_url"],
        "checked_at": today
    }
    c.execute(
        """INSERT INTO scene_cost_prices (project_id, asset_hash, item_id, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, asset_hash, item_id) DO UPDATE SET payload_json = excluded.payload_json""",
        ("proj_the_interior_14", asset_hash, item_id, json.dumps(payload, ensure_ascii=False))
    )

conn.commit()
print("Updated SQLite scene_cost_prices with proper architectural units and quantities.")

# 3. Check updated scope and estimate
from app.services.scene_cost import scene_scope, calculate_external_estimate
proj = db_mod.get_project("proj_the_interior_14")
est = calculate_external_estimate(proj)
print(f"Verified estimate: total lines = {len(est.lines)}, priced = {est.priced_line_count}, coverage = {est.price_coverage_percent}%")
print(f"Total: {est.total_vnd:,.0f} đ")
for line in est.lines:
    if line.id in updates:
        print(f"  {line.id}: {line.gross_quantity} {line.unit} × {line.unit_price_vnd:,.0f} đ = {line.subtotal_vnd:,.0f} đ | {line.source_note[:60]}...")
