import { describe, expect, it } from "vitest";
import {
  assessAtelierBrief,
  buildAtelierAgentInstructions,
} from "../services/atelier-clarification-policy.js";

describe("Atelier clarification policy", () => {
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

  it("instructs specialists to stop rather than hand off assumptions", () => {
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
});
