// Test Suite: ATELIER AI 2.0 Continuous Upgrades Verification
import assert from "node:assert";

const BASE_URL = "http://127.0.0.1:3100";

async function runTests() {
  console.log("================================================================================");
  console.log("🚀 BẮT ĐẦU KIỂM TRA TOÀN DIỆN 10 HẠNG MỤC NÂNG CẤP ATELIER AI 2.0");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  async function check(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // TEST 1: Bootstrap & Architecture
  await check("Kiểm tra Bootstrap & Local-Lite Architecture (13 Agents, 27 Skills)", async () => {
    const res = await fetch(`${BASE_URL}/api/atelier/bootstrap`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.profile, "ATELIER_LOCAL_LITE");
    assert.strictEqual(data.pythonCadSidecarHealthy, true);
    const agentKeys = Object.keys(data.paperclipBootstrap.agentIdsByKey);
    assert.strictEqual(agentKeys.length, 13, `Expected 13 agents, got ${agentKeys.length}`);
    assert.ok(agentKeys.includes("agent_ceiling_lighting"), "Missing agent_ceiling_lighting");
    assert.ok(agentKeys.includes("agent_material"), "Missing agent_material");
    assert.ok(agentKeys.includes("agent_research"), "Missing agent_research");
    assert.ok(agentKeys.includes("agent_inventory"), "Missing agent_inventory");
    assert.ok(agentKeys.includes("agent_qa"), "Missing agent_qa");
  });

  // TEST 2: Telegram Agents Endpoint
  await check("Kiểm tra 13 Agent trong Telegram Command Center (/api/atelier/telegram/agents)", async () => {
    const res = await fetch(`${BASE_URL}/api/atelier/telegram/agents`);
    assert.strictEqual(res.ok, true);
    const agents = await res.json();
    assert.strictEqual(agents.length, 13, `Expected 13 agents in database, got ${agents.length}`);
  });

  // TEST 3: Upgrade 1 & 3 - House Plan Designer Multi-Room Apartment Generation
  await check("Nâng cấp 1 & 3: House Plan Designer tự động tạo Căn hộ Đa phòng 3D BIM (51.7 m²)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m/house-plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scale_confirmed: true, reference_length_mm: 5000 }),
    });
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.ok(data.floor_spec, "Missing floor_spec");
    assert.strictEqual(data.floor_spec.rooms.length, 4, "Expected 4 rooms");
    const area = data.floor_spec.total_usable_area_sqm || data.floor_spec.total_area_m2;
    assert.ok(area >= 50, `Expected area >= 50 m2, got ${area}`);

    // Check Pascal SceneGraph nodes
    const scene = data.pascal_scene;
    assert.ok(scene && scene.root && scene.root.children, "Missing pascal_scene root");
    const children = scene.root.children;
    assert.ok(children.length >= 35, `Expected >= 35 3D objects, got ${children.length}`);

    // Verify presence of slabs, walls, ceilings, lights, and furniture
    const types = new Set(children.map((c) => c.type));
    assert.ok(types.has("mesh"), "Missing mesh objects");
    assert.ok(types.has("light_point"), "Missing lighting points");
    assert.ok(types.has("furniture_instance"), "Missing furniture instances");

    // Verify lighting fixtures
    const lights = children.filter((c) => c.type === "light_point");
    assert.ok(lights.length >= 8, `Expected >= 8 lights, got ${lights.length}`);
  });

  // TEST 4: Upgrade 5 - Research Agent for Real Vietnam Products
  await check("Nâng cấp 5: Research Agent tra cứu sản phẩm thực tế Việt Nam & không bịa giá", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/research/products?query=an%20c%C6%B0%E1%BB%9Dng`);
    assert.strictEqual(res.ok, true);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.ok(data.results.length >= 1, "Expected results for An Cường");

    // Verify unpriced item has proper status
    const allRes = await fetch(`${BASE_URL}/api/v1/research/products`);
    const allData = await allRes.json();
    const unpriced = allData.results.filter((p) => p.price_vnd === null);
    assert.ok(unpriced.length >= 1, "Expected at least 1 unpriced item with status");
    assert.ok(unpriced[0].price_status.includes("Chưa có giá"), "Status should indicate unpriced");
  });

  // TEST 5: Upgrade 6 - Design Inventory / BOM Extraction
  await check("Nâng cấp 6: Trích xuất Design Inventory / BOM tự động từ SceneGraph & Dự án", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m/inventory`);
    assert.strictEqual(res.ok, true);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    const bom = data.inventory_bom;
    assert.ok(bom, "Missing inventory_bom");
    assert.ok(bom.total_items_count >= 10, `Expected >= 10 items, got ${bom.total_items_count}`);
    assert.ok(bom.priced_items_subtotal_vnd > 0, "Expected positive subtotal");
    assert.ok(bom.all_items.length === bom.total_items_count, "Item count mismatch");

    // Check item attributes
    const first = bom.all_items[0];
    const name = first.name || first.item_name;
    const room = first.room || first.room_name;
    assert.ok(first.id && name && room && first.category, "Item missing basic fields");
  });

  // TEST 6: Upgrade 6 - BOM CSV Export
  await check("Nâng cấp 6: Xuất bảng BOM định dạng CSV chuẩn UTF-8 (Excel tương thích)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m/inventory/export/csv`);
    assert.strictEqual(res.ok, true);
    const text = await res.text();
    assert.ok(text.includes("Mã,Phòng Sử Dụng,Phân Loại,Tên Hạng Mục / Vật Tư"), "Missing CSV headers");
    assert.ok(text.includes("VN-SF-JAP-210") || text.includes("KUKA Home") || text.includes("Sofa"), "Missing sofa in CSV");
    assert.ok(text.includes("Eurotile") || text.includes("An Cường") || text.includes("KUKA"), "Missing supplier in CSV");
  });

  // TEST 7: Upgrade 7 - Blender MCP Headless & Procedural Mesh Fallback
  await check("Nâng cấp 7: Blender MCP Engine trạng thái & sinh Mesh GLB tuỳ biến theo yêu cầu", async () => {
    const statusRes = await fetch(`${BASE_URL}/api/v1/render/blender/status`);
    assert.strictEqual(statusRes.ok, true);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.ok, true);
    assert.ok("blender_available" in statusData, "Missing blender_available key");

    // Test custom mesh generation
    const meshRes = await fetch(`${BASE_URL}/api/v1/render/blender/custom-mesh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: "console_table_test_1",
        name: "Bàn console gỗ sồi 1.2m",
        category: "console_table",
        dimensions_mm: [1200, 400, 800],
      }),
    });
    assert.strictEqual(meshRes.ok, true);
    const meshData = await meshRes.json();
    assert.strictEqual(meshData.ok, true);
    assert.ok(meshData.glb_path, "Missing glb_path");
    assert.ok(meshData.engine, "Missing engine info");
  });

  // TEST 8: Upgrade 4 & 8 - Multi-Agent Collaboration Pipeline
  await check("Nâng cấp 4 & 8: Điều phối Multi-Agent Pipeline trên compound request", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Đổi sàn sang gạch màu sáng, thiết kế lại trần giật cấp và thêm cây xanh",
      }),
    });
    assert.strictEqual(res.ok, true);
    const data = await res.json();
    assert.ok(data.reply, "Missing agent reply text");
    assert.ok(data.metadata && data.metadata.proposal, "Missing generated proposal");
  });

  // TEST 9: Telegram Bridge Status & Local Poller
  await check("Nâng cấp 9: Telegram Connection Status & Health (/api/atelier/telegram/status)", async () => {
    const res = await fetch(`${BASE_URL}/api/atelier/telegram/status`);
    assert.strictEqual(res.ok, true);
    const st = await res.json();
    assert.ok(st.status === "polling" || st.status === "stopped" || st.status === "idle", `Unexpected status ${st.status}`);
    assert.ok("tokenPreview" in st, "Missing token preview");
    assert.ok("stats" in st, "Missing stats");
  });

  console.log("\n================================================================================");
  console.log(`🎉 KẾT QUẢ KIỂM TRA: ${passed}/${total} TIÊU CHÍ ĐẠT (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================\n");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
