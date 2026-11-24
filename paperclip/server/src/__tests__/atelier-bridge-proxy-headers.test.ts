import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { atelierBridgeRoutes } from "../routes/atelier-bridge.js";

// FEAT-2026-133 CR-003: PowerShell's Invoke-WebRequest auto-adds `Expect:
// 100-continue` on POST/PUT bodies. Node's fetch rejects any request carrying
// an `expect` header outright (TypeError: fetch failed), which the proxy's
// generic catch turned into an opaque 502 that blocked live geometry retries.
// The proxy must strip hop-by-hop/unsupported headers before forwarding, and
// surface a thrown error's `cause` in the 502 response for diagnosability.

function app() {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => { (req as any).actor = { type: "board", userId: "u", source: "session", companyIds: [], isInstanceAdmin: true }; next(); });
  result.use("/api", atelierBridgeRoutes({} as Db));
  result.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message }));
  return result;
}

describe("atelier bridge proxy header handling", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("strips the expect header before forwarding to the sidecar", async () => {
    let forwardedHeaders: Record<string, string> | undefined;
    fetchSpy.mockImplementation(async (url: any, init?: any) => {
      if (String(url).endsWith("/api/v1/health")) {
        return new Response(null, { status: 200 });
      }
      forwardedHeaders = init?.headers;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const response = await request(app())
      .post("/api/v1/mcp/call")
      .set("Expect", "100-continue")
      .send({ project_id: "proj_test", expected_revision: 1, tool_name: "verify_scene", arguments: {}, agent_id: "agent-1" });

    expect(response.status).toBe(200);
    expect(forwardedHeaders).toBeDefined();
    const keys = Object.keys(forwardedHeaders!).map(k => k.toLowerCase());
    expect(keys).not.toContain("expect");
  });

  it("surfaces the underlying fetch error cause in the 502 response", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      if (String(url).endsWith("/api/v1/health")) {
        return new Response(null, { status: 200 });
      }
      throw new TypeError("fetch failed", { cause: new Error("expect header not supported") });
    });

    const response = await request(app())
      .post("/api/v1/mcp/call")
      .send({ project_id: "proj_test", expected_revision: 1, tool_name: "verify_scene", arguments: {}, agent_id: "agent-1" });

    expect(response.status).toBe(502);
    expect(response.body.detail).toBe("fetch failed");
    expect(response.body.cause).toBe("expect header not supported");
  });
});
