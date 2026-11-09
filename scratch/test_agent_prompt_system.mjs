// Test Suite: ATELIER AI Multi-Agent Prompt System Verification
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:3100";

const EXPECTED_AGENT_KEYS = [
  "agent_concierge",
  "agent_floorplan",
  "agent_geometry",
  "agent_furniture",
  "agent_style",
  "agent_material",
  "agent_ceiling_lighting",
  "agent_research",
  "agent_shopping",
  "agent_inventory",
  "agent_cost",
  "agent_render",
  "agent_qa",
];

async function runTests() {
  console.log("================================================================================");
  console.log("🤖 KIỂM TRA TOÀN DIỆN BỘ PROMPT MULTI-AGENT ATELIER AI TRÊN :3100");
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

  // 1. Documentation File Check
  await check("1. Kiểm tra tài liệu chuẩn docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md", async () => {
    const docPath = path.resolve("docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md");
    assert.ok(fs.existsSync(docPath), "Tài liệu ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md không tồn tại");
    const content = fs.readFileSync(docPath, "utf-8");
    assert.ok(content.includes("Co-Layout"), "Thiếu nghiên cứu Co-Layout");
    assert.ok(content.includes("QUY TẮC CHUNG CỦA ATELIER AI"), "Thiếu Khung quy tắc chung");
    assert.ok(content.includes("BẢNG PHÂN QUYỀN CÔNG CỤ"), "Thiếu Tool Matrix");
    assert.ok(content.includes("BỘ 5 CA KIỂM THỬ"), "Thiếu 5 ca kiểm thử");
    for (const key of EXPECTED_AGENT_KEYS) {
      assert.ok(content.toLowerCase().includes(key.replace("agent_", "")), `Thiếu nội dung cho agent ${key}`);
    }
  });

  // 2. Prompt Registry Endpoint via Paperclip (:3100)
  let allPrompts = [];
  await check("2. API Registry: Truy vấn danh mục 13 Agent Prompts (/api/v1/agents/prompts)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents/prompts`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    allPrompts = await res.json();
    assert.strictEqual(allPrompts.length, 13, `Kỳ vọng 13 agents, nhận được ${allPrompts.length}`);
    const keys = allPrompts.map(a => a.key);
    for (const expectedKey of EXPECTED_AGENT_KEYS) {
      assert.ok(keys.includes(expectedKey), `Thiếu agent key: ${expectedKey}`);
    }
  });

  // 3. Shared Framework Verification for every agent
  for (const agent of allPrompts) {
    await check(`3. Kiểm tra Khung Quy Tắc Chung & Schema cho [${agent.name}]`, async () => {
      const prompt = agent.system_prompt;
      assert.ok(prompt.includes("QUY TẮC CHUNG CỦA ATELIER AI"), "Thiếu tiêu đề Quy tắc chung");
      assert.ok(prompt.includes("heartbeat"), "Thiếu quy tắc heartbeat");
      assert.ok(prompt.includes("Pascal SceneGraph là nguồn sự thật duy nhất"), "Thiếu quy tắc nguồn sự thật Pascal");
      assert.ok(prompt.includes("needs_input"), "Thiếu quy tắc needs_input");
      assert.ok(prompt.includes("ĐỀ XUẤT (proposal)"), "Thiếu quy tắc proposal không ghi đè");
      assert.ok(prompt.includes("Đơn vị: mm; diện tích m²"), "Thiếu quy tắc đơn vị mm");
      assert.ok(prompt.includes("ĐẦU RA BẮT BUỘC (JSON hợp lệ"), "Thiếu tiêu đề JSON output");
      assert.ok(prompt.includes('"status": "done | needs_input | blocked | needs_review"'), "Thiếu status enum");
      assert.ok(prompt.includes('"summary_vi"'), "Thiếu summary_vi");
      assert.ok(prompt.includes('"handoff"'), "Thiếu handoff");
    });
  }

  // 4. Tool Matrix & Boundary Enforcement
  for (const agent of allPrompts) {
    await check(`4. Phân quyền công cụ (Tool Matrix) & Hạn mức Token cho [${agent.name}]`, async () => {
      assert.ok(Array.isArray(agent.allowed_tools) && agent.allowed_tools.length > 0, "Thiếu allowed_tools");
      assert.ok(Array.isArray(agent.forbidden_tools) && agent.forbidden_tools.length > 0, "Thiếu forbidden_tools");
      assert.ok(agent.token_limit >= 4000 && agent.token_limit <= 8000, `Token limit không hợp lệ: ${agent.token_limit}`);
      assert.ok(agent.system_prompt.includes("MA TRẬN PHÂN QUYỀN CÔNG CỤ"), "Thiếu bảng phân quyền trong compiled prompt");
    });
  }

  // 5. Individual Agent Prompt Endpoint
  await check("5. API Endpoint chi tiết từng Agent (/api/v1/agents/:key/prompt)", async () => {
    for (const key of ["agent_concierge", "agent_geometry", "agent_cost", "agent_qa"]) {
      const res = await fetch(`${BASE_URL}/api/v1/agents/${key}/prompt`);
      assert.strictEqual(res.ok, true, `HTTP ${res.status} on ${key}`);
      const data = await res.json();
      assert.strictEqual(data.key, key);
      assert.ok(data.system_prompt.length > 500, "System prompt quá ngắn");
    }
  });

  // 6. Test Cases Registry Endpoint
  await check("6. API Registry: Danh mục 5 Ca Kiểm Thử (/api/v1/agents/evaluation/test-cases)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents/evaluation/test-cases`);
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const testCases = await res.json();
    assert.strictEqual(testCases.length, 5, `Kỳ vọng 5 ca kiểm thử, nhận được ${testCases.length}`);
    const ids = testCases.map(t => t.id);
    assert.ok(ids.includes("tc1_standard_flow"));
    assert.ok(ids.includes("tc2_missing_scale"));
    assert.ok(ids.includes("tc3_incremental_sofa"));
    assert.ok(ids.includes("tc4_unverified_price"));
    assert.ok(ids.includes("tc5_ambiguous_feedback"));
  });

  // 7. Live Flow Test: Ambiguous Feedback (Test Case 5 & Chief Architect Rule 3)
  await check("7. Kiểm thử trực tiếp Ca 5 (Ambiguous Feedback): 'Phòng này chưa sang' -> 1 câu hỏi + 3 hướng A/B/C", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/projects/proj_demo_4x5m/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: "proj_demo_4x5m",
        message: "Phòng này nhìn chưa sang"
      })
    });
    assert.strictEqual(res.ok, true, `HTTP ${res.status}`);
    const data = await res.json();
    assert.ok(data.reply.includes("Kiến Trúc Sư Trưởng"), "Phản hồi không từ Kiến Trúc Sư Trưởng");
    assert.ok(data.metadata && data.metadata.question_request, "Thiếu question_request làm rõ");
    const choices = data.metadata.question_request.choices;
    assert.strictEqual(choices.length, 3, "Phải có đúng 3 phương án A/B/C làm rõ");
    const ids = choices.map(c => c.id);
    assert.ok(ids.includes("opt_lighting"), "Thiếu hướng A: ánh sáng");
    assert.ok(ids.includes("opt_accent_wall"), "Thiếu hướng B: tường điểm nhấn");
    assert.ok(ids.includes("opt_declutter_luxury"), "Thiếu hướng C: tinh giản & sang trọng");
  });

  console.log("\n================================================================================");
  console.log(`🎉 KẾT QUẢ KIỂM TRA BỘ PROMPT: ${passed}/${total} TIÊU CHÍ ĐẠT (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================\n");

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
