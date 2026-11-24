import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessAtelierBrief,
  buildAtelierAgentInstructions,
} from "../services/atelier-clarification-policy.js";

describe("Atelier clarification policy", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("blocks an underspecified interior request with at most three prioritized questions", () => {
    const result = assessAtelierBrief("Thiết kế cho tôi một phòng khách đẹp.");
    expect(result.status).toBe("needs_input");
    expect(result.openDecisions).toEqual(expect.arrayContaining(["budget", "style", "palette"]));
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]?.decision).toBe("budget");
  });

  it("recognizes a complete explicit brief", () => {
    const result = assessAtelierBrief(
      "Thiết kế phòng khách cho gia đình 4 người, cần sofa, bàn trà và kệ TV; phong cách Japandi, tông trắng kem và gỗ, ngân sách 120 triệu VNĐ.",
    );
    expect(result.status).toBe("ready");
    expect(result.decisions.every((decision) => decision.state === "confirmed")).toBe(true);
  });

  it("keeps a request for style and color proposals open instead of treating it as confirmed", () => {
    const result = assessAtelierBrief(
      "Thiết kế phòng ngủ có giường và tủ, ngân sách 80 triệu; tôi chưa biết phong cách và hãy đề xuất màu sơn cho tôi.",
    );
    expect(result.status).toBe("needs_input");
    expect(result.decisions.find((decision) => decision.key === "style")?.state).toBe("proposal_requested");
    expect(result.decisions.find((decision) => decision.key === "palette")?.state).toBe("proposal_requested");
  });

  it("asks finishing questions (paint, floor, ceiling, lighting) with options, never more than three per turn", () => {
    const result = assessAtelierBrief("Thiết kế phòng khách đẹp.");
    expect(result.questions.length + result.finishQuestions.length).toBeLessThanOrEqual(3);
    const ready = assessAtelierBrief(
      "Thiết kế phòng khách cho gia đình 4 người, cần sofa, bàn trà và kệ TV; phong cách hiện đại, tông trắng kem, ngân sách 120 triệu VNĐ.",
    );
    expect(ready.status).toBe("ready");
    expect(ready.finishQuestions).toHaveLength(3);
    expect(ready.finishQuestions.map((q) => q.decision)).toEqual(["wall_paint", "floor_finish", "ceiling_finish"]);
    for (const q of ready.finishQuestions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options).toContain("Tự nhập");
    }
  });

  it("does not re-ask a finishing decision the user already stated", () => {
    const result = assessAtelierBrief(
      "Phòng khách hiện đại, sơn tường màu xám, sàn gạch porcelain, trần trắng, ánh sáng ấm, tông gỗ sồi, sofa, ngân sách 100 triệu.",
    );
    expect(result.finishQuestions).toHaveLength(0);
  });

  it("keeps Cost/BOM rules intact and makes Modern the Style default", () => {
    vi.stubEnv("ATELIER_SPECIALIST_WORKFLOW_ENABLED", "false");
    const cost = buildAtelierAgentInstructions({ agentKey: "agent_cost", agentName: "Cost", roleSummary: "Dự toán." });
    expect(cost).toContain("Không hỏi người dùng file báo giá/catalog, địa chỉ");
    const style = buildAtelierAgentInstructions({ agentKey: "agent_style", agentName: "Style", roleSummary: "Phong cách." });
    expect(style).toContain("Hiện đại (Modern)");
    expect(style).toContain("đề xuất, chờ bạn chọn");
  });

  it("instructs specialists to stop rather than hand off assumptions", () => {
    vi.stubEnv("ATELIER_SPECIALIST_WORKFLOW_ENABLED", "false");
    const instructions = buildAtelierAgentInstructions({
      agentKey: "agent_style",
      agentName: "Style & Materials Consultant",
      roleSummary: "Tư vấn phong cách và vật liệu.",
    });
    expect(instructions).toContain("không tự chốt thay người dùng");
    expect(instructions).toContain("status: needs_input");
    expect(instructions).toContain("Không đánh dấu task done");
    expect(instructions).toContain("đưa 2–3 phương án");
  });

  it("requires a durable recovery transition instead of a hand-back comment", () => {
    vi.stubEnv("ATELIER_SPECIALIST_WORKFLOW_ENABLED", "false");
    const instructions = buildAtelierAgentInstructions({
      agentKey: "agent_geometry",
      agentName: "Geometry & BIM Specialist",
      roleSummary: "Xác minh canonical scene.",
    });
    expect(instructions).toContain("Không được chỉ viết “hand-back”");
    expect(instructions).toContain("recoveryIntent=status_only");
    expect(instructions).toContain("/recovery-actions/resolve");
    expect(instructions).toContain("sourceIssueStatus=todo");
  });
  it("defaults to specialist autonomy and real native task handoff", () => {
    const instructions = buildAtelierAgentInstructions({ agentKey: "agent_concierge", agentName: "Chief", roleSummary: "Coordinate" });
    expect(instructions).toContain("project-intakes");
    expect(instructions).toContain("Never write geometry");
    expect(instructions).toContain("Specialists decide reversible details");
    expect(instructions).toContain("/complete");
    expect(instructions).toContain("Never start a sidecar workflow");
  });
});
