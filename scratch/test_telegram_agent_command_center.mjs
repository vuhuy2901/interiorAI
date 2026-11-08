import assert from "node:assert/strict";

const BASE_URL = process.env.ATELIER_URL || "http://127.0.0.1:3100";

async function runTests() {
  console.log("==================================================================");
  console.log("  ATELIER AI 2.0 — TELEGRAM AGENT COMMAND CENTER TEST SUITE");
  console.log(`  Target Server: ${BASE_URL}`);
  console.log("==================================================================\n");

  let passedSteps = 0;

  // Step 1: Health Check
  console.log("[1/12] Verifying server health...");
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.status, 200, "Server health check should return 200");
  const health = await healthRes.json();
  assert.equal(health.status, "ok", "Health status should be ok");
  console.log(`  -> Server OK (v${health.version})\n`);
  passedSteps++;

  // Step 2: Telegram Status & Token Redaction
  console.log("[2/12] Verifying Telegram Bridge status & token protection...");
  const statusRes = await fetch(`${BASE_URL}/api/atelier/telegram/status`);
  assert.equal(statusRes.status, 200, "Telegram status should return 200");
  const status = await statusRes.json();
  assert.ok("status" in status, "Status object should contain status field");
  assert.ok("tokenPreview" in status, "Status object should contain tokenPreview");
  if (status.tokenPreview) {
    assert.ok(status.tokenPreview.includes("••••"), "Token must be masked in API responses");
  }
  console.log(`  -> Status: ${status.status}, isConfigured: ${status.isConfigured}\n`);
  passedSteps++;

  // Step 3: Agents List from Paperclip DB
  console.log("[3/12] Verifying 8 Specialist Agents from Paperclip database...");
  const agentsRes = await fetch(`${BASE_URL}/api/atelier/telegram/agents`);
  assert.equal(agentsRes.status, 200, "Agents endpoint should return 200");
  const agents = await agentsRes.json();
  assert.ok(Array.isArray(agents), "Agents should be an array");
  assert.ok(agents.length >= 8, `Should have at least 8 agents (got ${agents.length})`);
  const agentNames = agents.map((a) => a.name);
  console.log(`  -> Loaded ${agents.length} agents: ${agentNames.slice(0, 4).join(", ")}...`);
  passedSteps++;

  // Step 4: Pairing Code Generation
  console.log("[4/12] Testing one-time pairing code generation...");
  const pairRes = await fetch(`${BASE_URL}/api/atelier/telegram/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "local-board" }),
  });
  assert.equal(pairRes.status, 200, "Pairing code generation should return 200");
  const pairing = await pairRes.json();
  assert.ok(pairing.ok, "Pairing code response should be ok");
  assert.match(pairing.pairingCode, /^ATL-\d{4}$/, "Pairing code format should be ATL-XXXX");
  console.log(`  -> Generated code: ${pairing.pairingCode} (Expires: ${pairing.expiresAt})\n`);
  passedSteps++;

  // Step 5: Simulate /agents Command
  console.log("[5/12] Testing simulated Telegram /agents command...");
  const simAgents = await fetch(`${BASE_URL}/api/atelier/telegram/simulate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromUserId: 998877, username: "architect_test", text: "/agents" }),
  });
  assert.equal(simAgents.status, 200, "Simulate /agents should return 200");
  const agentsSimResult = await simAgents.json();
  assert.equal(agentsSimResult.type, "agents", "Result type should be agents");
  assert.ok(agentsSimResult.agents.length >= 8, "Should return at least 8 agents");
  console.log(`  -> Returned ${agentsSimResult.agents.length} agents for Telegram keyboard\n`);
  passedSteps++;

  // Step 6: Simulate Natural Language Task Creation (Geometry Agent)
  console.log("[6/12] Testing natural language task dispatch to Geometry Agent...");
  const prompt = "Giao cho Geometry Agent dựng một căn phòng 4×5m, có một cửa ra vào và hai cửa sổ.";
  const simTask = await fetch(`${BASE_URL}/api/atelier/telegram/simulate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromUserId: 998877, username: "architect_test", text: prompt }),
  });
  assert.equal(simTask.status, 200, "Simulate task creation should return 200");
  const taskCreated = await simTask.json();
  assert.equal(taskCreated.type, "task_created", "Result type should be task_created");
  assert.ok(taskCreated.identifier.startsWith("ATL-"), "Identifier should start with ATL-");
  assert.ok(
    taskCreated.assignedAgentName.toLowerCase().includes("geometry"),
    `Assigned agent should be Geometry Specialist (got ${taskCreated.assignedAgentName})`
  );
  console.log(`  -> Created Task: ${taskCreated.identifier} assigned to: ${taskCreated.assignedAgentName}\n`);
  passedSteps++;

  // Step 7: Verify Created Task in /tasks
  console.log("[7/12] Verifying task persistence in Paperclip active tasks...");
  const simTasksList = await fetch(`${BASE_URL}/api/atelier/telegram/simulate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromUserId: 998877, username: "architect_test", text: "/tasks" }),
  });
  assert.equal(simTasksList.status, 200, "Simulate /tasks should return 200");
  const tasksData = await simTasksList.json();
  assert.equal(tasksData.type, "tasks", "Result type should be tasks");
  const foundTask = tasksData.tasks.find((t) => t.identifier === taskCreated.identifier);
  assert.ok(foundTask, `Newly created task ${taskCreated.identifier} must appear in /tasks`);
  console.log(`  -> Verified ${foundTask.identifier} in tasks list with status: ${foundTask.status}\n`);
  passedSteps++;

  // Step 8: Simulate Two-Way Comment Sync (Reply-to-Message)
  console.log("[8/12] Testing Telegram Reply-to-Comment two-way synchronization...");
  const simComment = await fetch(`${BASE_URL}/api/atelier/telegram/simulate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromUserId: 998877,
      username: "architect_test",
      text: "Cửa chính rộng 900mm x cao 2200mm, làm bằng gỗ sồi nhé.",
      replyToMessageId: 1001,
    }),
  });
  assert.equal(simComment.status, 200, "Simulate comment reply should return 200");
  const commentResult = await simComment.json();
  assert.equal(commentResult.type, "comment_added", "Result type should be comment_added");
  console.log(`  -> Appended comment successfully to Paperclip task issueId: ${commentResult.issueId}\n`);
  passedSteps++;

  // Step 9: Simulate /progress Command
  console.log("[9/12] Testing /progress command and progress computation...");
  const simProg = await fetch(`${BASE_URL}/api/atelier/telegram/simulate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromUserId: 998877, username: "architect_test", text: "/progress" }),
  });
  assert.equal(simProg.status, 200, "Simulate /progress should return 200");
  const progData = await simProg.json();
  assert.equal(progData.type, "progress");
  assert.ok("percentDone" in progData.progress, "Progress should contain percentDone");
  console.log(`  -> Progress: ${progData.progress.percentDone}% (Total: ${progData.progress.totalTasks} tasks)\n`);
  passedSteps++;

  // Step 10: Graceful Handling of Invalid Token (No crash, status 400)
  console.log("[10/12] Testing test-connection error handling with invalid token...");
  const testConnRes = await fetch(`${BASE_URL}/api/atelier/telegram/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botToken: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456" }),
  });
  assert.equal(testConnRes.status, 400, "Invalid token test connection should return 400");
  const testConnData = await testConnRes.json();
  assert.equal(testConnData.ok, false, "Response ok should be false");
  assert.ok(testConnData.error.includes("401"), "Error message should report 401 Unauthorized");
  console.log(`  -> Graceful refusal: ${testConnData.error}\n`);
  passedSteps++;

  // Step 11: Activity & Error Logging
  console.log("[11/12] Testing activity and error event log retention...");
  const logsRes = await fetch(`${BASE_URL}/api/atelier/telegram/logs?limit=5`);
  assert.equal(logsRes.status, 200, "Logs endpoint should return 200");
  const logsData = await logsRes.json();
  assert.ok(Array.isArray(logsData.logs), "Logs should be an array");
  assert.ok(logsData.logs.length > 0, "Should have retained recent event logs");
  console.log(`  -> Retained ${logsData.logs.length} recent logs (Latest: ${logsData.logs[0].message})\n`);
  passedSteps++;

  // Step 12: Config Update & Whitelist Persistence
  console.log("[12/12] Testing configuration update and whitelist persistence...");
  const updateRes = await fetch(`${BASE_URL}/api/atelier/telegram/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notificationsEnabled: true,
      notificationLevel: "all",
      allowedUserIds: [998877, 123456],
      allowedUsernames: ["architect_test", "tuan_designer"],
    }),
  });
  assert.equal(updateRes.status, 200, "Config update should return 200");
  const updateData = await updateRes.json();
  assert.equal(updateData.ok, true, "Config update response ok should be true");

  const checkPairings = await fetch(`${BASE_URL}/api/atelier/telegram/pairings`);
  const pairingsData = await checkPairings.json();
  assert.ok(pairingsData.allowedUserIds.includes(998877), "Whitelist should include 998877");
  assert.ok(pairingsData.allowedUsernames.includes("architect_test"), "Whitelist should include architect_test");
  console.log(`  -> Whitelist verified: ${pairingsData.allowedUserIds.length} user IDs, ${pairingsData.allowedUsernames.length} usernames\n`);
  passedSteps++;

  console.log("==================================================================");
  console.log(`  ALL ${passedSteps}/12 TELEGRAM COMMAND CENTER TESTS PASSED (100%)`);
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
