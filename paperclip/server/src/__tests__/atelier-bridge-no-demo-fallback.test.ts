import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { atelierBridgeRoutes } from "../routes/atelier-bridge.js";

// FEAT-2026-131 CR-1: bridge cũ không còn fallback sang dự án/conversation demo.
function app() {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => { (req as any).actor = { type: "board", userId: "u", source: "session", companyIds: [] }; next(); });
  result.use("/api", atelierBridgeRoutes({} as Db));
  result.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message }));
  return result;
}

describe("atelier bridge without demo fallback", () => {
  it("ide-bridge/reply requires an explicit issue_id and never picks a default conversation", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const response = await request(app()).post("/api/atelier/ide-bridge/reply").send({ message: "xin chào" });
      expect(response.status).toBe(422);
      expect(response.body.error).toContain("issue_id");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pins list for a project without pins is empty, not the demo pin", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const response = await request(app()).get("/api/atelier/pins/proj_new_empty");
      expect(response.status).toBe(200);
      expect(response.body.pins).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scene access without native_project_id is rejected", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const response = await request(app()).post("/api/atelier/scene").send({ project_id: "proj_demo_4x5m" });
      expect(response.status).toBe(422);
    } finally {
      vi.useRealTimers();
    }
  });
});
