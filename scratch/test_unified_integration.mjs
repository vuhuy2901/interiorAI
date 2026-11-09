// Test Suite: ATELIER AI Unified Application Integration Verification
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:3100";

async function runTests() {
  console.log("================================================================================");
  console.log("🏛️  KIỂM TRA HỢP NHẤT TOÀN DIỆN ATELIER AI TRÊN CỔNG DUY NHẤT :3100");
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

  // 1. App Shell & Architecture check
  await check("1. Bootstrap hệ thống thống nhất Paperclip (:3100) + 13 Agents + 27 Skills", async () => {
    const res = await fetch(`${BASE_URL}/api/atelier/bootstrap`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.pythonCadSidecarHealthy, true);
    assert.strictEqual(Object.keys(data.paperclipBootstrap.agentIdsByKey).length, 13);
    assert.strictEqual(data.paperclipBootstrap.installedSkillCount, 27);
  });

  // 2. Reverse Proxy: FastAPI Projects
  await check("2. API Reverse Proxy: Truy xuất dữ liệu dự án (/api/v1/projects/:id)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const project = await res.json();
    assert.strictEqual(project.project_id, "proj_demo_4x5m");
    assert.ok(project.rooms.length >= 1, "Should have rooms");
    assert.ok(project.walls.length >= 1, "Should have walls");
  });

  // 3. Reverse Proxy: 14-Node Workflows
  await check("3. API Reverse Proxy: Workflow chuẩn 14 Nodes (/api/v1/workflows)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/workflows`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(Array.isArray(data) && data.length > 0);
    const wf = data[0];
    assert.strictEqual(wf.workflow_id, "wf_default_interior_pipeline");
    assert.strictEqual(wf.nodes.length, 14, "Must have exactly 14 nodes");
  });

  // 4. Reverse Proxy: Materials & Finishes
  await check("4. API Reverse Proxy: Thư viện vật liệu & hoàn thiện (/api/v1/materials)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/materials`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(data.paints && data.paints.length > 0, "Should have paints");
    assert.ok(data.tiles_and_flooring && data.tiles_and_flooring.length > 0, "Should have tiles_and_flooring");
  });

  // 5. Reverse Proxy: Catalog SKU Vietnam
  await check("5. API Reverse Proxy: Danh mục nội thất SKU Việt Nam (/api/v1/catalog)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/catalog`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(Array.isArray(data) && data.length > 0);
  });

  // 6. Reverse Proxy: Cost Estimation / BOQ
  await check("6. API Reverse Proxy: Bóc tách dự toán BOQ (/api/v1/estimates/:id)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/estimates/proj_demo_4x5m`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(data.lines && data.lines.length > 0, "Should have cost lines");
    assert.ok(data.total_vnd > 0, "Total VND should be > 0");
  });

  // 7. Reverse Proxy: CAD Exporters (DXF)
  await check("7. API Reverse Proxy: Xuất bản vẽ CAD DXF (/api/v1/exports/:id/dxf)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/exports/proj_demo_4x5m/dxf`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const text = await res.text();
    assert.ok(text.includes("SECTION") || text.includes("ENTITIES"), "Valid DXF response");
  });

  // 8. Telegram Bot Command Center
  await check("8. Telegram Multi-Agent Command Center & Status (/api/atelier/telegram/status)", async () => {
    const res = await fetch(`${BASE_URL}/api/atelier/telegram/status`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(data.status !== undefined, "Status must be defined");
    assert.ok(data.stats !== undefined, "Stats must be defined");
  });

  // 9. Single Origin UI Routes check
  const routes = [
    { path: "/", title: "Trang chủ Paperclip" },
    { path: "/design-studio", title: "Không gian thiết kế 2D/3D (Studio Viewport)" },
    { path: "/control-center", title: "Agent Control / Workflow (14 Nodes)" },
    { path: "/workflows", title: "Quy trình thiết kế nội thất" },
    { path: "/materials-catalog", title: "Vật liệu và hoàn thiện" },
    { path: "/inventory-bom", title: "Danh mục nội thất & BOM" },
    { path: "/cost-estimation", title: "Dự toán chi phí" },
    { path: "/render-compare", title: "Phối cảnh Render" },
    { path: "/settings/telegram", title: "Cài đặt Telegram" },
    { path: "/issues", title: "Công việc (Tasks)" },
    { path: "/conversations", title: "Hội thoại đa Agent" },
    { path: "/agents", title: "Danh sách 13 Chuyên gia AI" }
  ];

  for (const r of routes) {
    await check(`9. Điều hướng UI thống nhất [${r.path}] - ${r.title}`, async () => {
      const res = await fetch(`${BASE_URL}${r.path}`);
      assert.strictEqual(res.ok, true, `HTTP ${res.status} on ${r.path}`);
      const text = await res.text();
      assert.ok(text.includes("<div id=\"root\">") || text.includes("<!DOCTYPE html>"), `Invalid HTML on ${r.path}`);
    });
  }

  // 10. Check Sidebar Vietnamese Labels
  await check("10. Sidebar Tiếng Việt đầy đủ 14 danh mục", async () => {
    const sidebarPath = path.resolve("paperclip/ui/src/components/Sidebar.tsx");
    const content = fs.readFileSync(sidebarPath, "utf-8");
    const requiredLabels = [
      "Tổng quan",
      "Conversations",
      "Công việc",
      "AI Agents",
      "Agent Control / Workflow",
      "Skills / Skill Studio",
      "Kết nối AI / MCP",
      "Không gian thiết kế 2D/3D",
      "Vật liệu và hoàn thiện",
      "Danh mục nội thất",
      "Dự toán",
      "Phối cảnh Render",
      "Phê duyệt",
      "Cài đặt / Telegram"
    ];
    for (const label of requiredLabels) {
      assert.ok(content.includes(label), `Sidebar missing Vietnamese label: ${label}`);
    }
  });

  // 11. Check removal of "máy yếu" / "low-spec" buttons
  await check("11. Tiêu chuẩn chất lượng: Tuyệt đối không có nút/tùy chọn 'Máy yếu / Low-spec'", async () => {
    const studioViewportPath = path.resolve("paperclip/ui/src/features/atelier/StudioViewport.tsx");
    const viewportContent = fs.readFileSync(studioViewportPath, "utf-8");
    assert.strictEqual(viewportContent.includes("lowSpecMode"), false, "StudioViewport still contains lowSpecMode");
    assert.strictEqual(viewportContent.toLowerCase().includes("máy yếu"), false, "StudioViewport contains 'máy yếu'");

    const supportingPagesPath = path.resolve("paperclip/ui/src/features/atelier/SupportingPages.tsx");
    const supportingContent = fs.readFileSync(supportingPagesPath, "utf-8");
    assert.strictEqual(supportingContent.toLowerCase().includes("máy yếu"), false, "SupportingPages contains 'máy yếu'");
    assert.strictEqual(supportingContent.includes("lowSpecMode"), false, "SupportingPages contains lowSpecMode");
  });

  // 12. Check Task-to-DesignStudio Deep Link
  await check("12. Liên kết Task ↔ 3D Design Studio trong IssueProperties", async () => {
    const issuePropPath = path.resolve("paperclip/ui/src/components/issue-properties/IssueProperties.tsx");
    const content = fs.readFileSync(issuePropPath, "utf-8");
    assert.ok(content.includes("/design-studio"), "IssueProperties does not link to /design-studio");
    assert.ok(content.includes("Mô hình 3D & Bản vẽ 2D liên quan"), "IssueProperties missing link label");
  });

  console.log("\n================================================================================");
  console.log(`🎉 KẾT QUẢ KIỂM TRA HỢP NHẤT: ${passed}/${total} TIÊU CHÍ ĐẠT (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================\n");

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
