import express from "express";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAtelierSceneHandler } from "../routes/atelier-scene.js";

const project = {
  project_id: "bedroom", revision: 1, scale_calibrated: true, furniture_instances: [],
  spatial_qa: { valid: true, collision_count: 0, boundary_violation_count: 0, door_swing_warning_count: 0,
    walkway_ok: true, min_walkway_mm: 790, warnings: [] },
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const requestBody = { project_id: "bedroom", operation: "scene.apply", base_revision: 1,
  idempotency_key: "bench-request", item: { id: "bench", width_mm: 1200 } };

function setup(ready = true) {
  const locks = new Map<string, {holder: string; acquiredAt: number}>();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const app = express();
  app.use(express.json());
  app.post("/scene", createAtelierSceneHandler("http://canonical", locks, async () => ready));
  return { fetch, locks, post: (body: unknown) => supertest(app).post("/scene").send(body) };
}
afterEach(() => vi.unstubAllGlobals());

describe("canonical scene adapter", () => {
  it("returns actual Cost/BOM output while keeping missing-price and approval state", async () => {
    const { fetch, post, locks } = setup();
    const result = { project_id: 'bedroom', revision: 1, asset_hash: 'hash', status: 'needs_input', approval_required: true,
      estimate: { project_id: 'bedroom', revision: 1, scene_asset_hash: 'hash', lines: [{ id: 'glb:sofa' }], total_vnd: 100, total_is_complete: false } };
    fetch.mockResolvedValueOnce(json({ ...project, external_scene: { sha256: 'hash' } })).mockResolvedValueOnce(json(result));
    const response = await post({ project_id: 'bedroom', operation: 'scene.cost' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, operation: 'scene.cost', status: 'needs_input', approval_required: true, estimate: result.estimate });
    expect(fetch.mock.calls[1][0]).toBe('http://canonical/api/v1/projects/bedroom/cost-workflow');
    expect(locks.size).toBe(0);
  });

  it.each(['project_id', 'revision', 'asset_hash'])("rejects mismatched cost snapshot %s", async (field) => {
    const { fetch, post } = setup();
    const result = { project_id: 'bedroom', revision: 1, asset_hash: 'hash', estimate: { project_id: 'bedroom', revision: 1, scene_asset_hash: 'hash', lines: [], total_vnd: 100 }, [field]: 'stale' };
    fetch.mockResolvedValueOnce(json({ ...project, external_scene: { sha256: 'hash' } })).mockResolvedValueOnce(json(result));
    const response = await post({ project_id: 'bedroom', operation: 'cost' });
    expect(response.status).toBe(409);
    expect(response.body.ok).toBe(false);
  });

  it("reads the canonical project_id and furniture_instances", async () => {
    const { fetch, post } = setup();
    fetch.mockResolvedValue(json(project));
    const result = await post({ project_id: "bedroom", op: "read" });
    expect(result.body.scene_id).toBe("bedroom");
    expect(result.body.scene.furniture_instances).toEqual([]);
    expect(result.body.scene_id).not.toContain("undefined");
  });

  it("uses actual canonical QA, preserving warnings and measured clearance", async () => {
    const { fetch, post } = setup();
    const qa = { ...project.spatial_qa, valid: false, collision_count: 2, walkway_ok: false, min_walkway_mm: 455, warnings: ["collision"] };
    fetch.mockResolvedValue(json({ ...project, spatial_qa: qa }));
    const result = await post({ project_id: "bedroom", operation: "scene.validate" });
    expect(result.body.valid).toBe(false);
    expect(result.body.spatial_quality).toEqual(qa);
    expect(result.body.validation).toMatchObject({ collision_free: false, walkway_clearance_ok: false, min_walkway_clearance_mm: 455 });
    expect(fetch).toHaveBeenCalledTimes(1); // no fake estimates endpoint
  });

  it("reports an actual valid QA result", async () => {
    const { fetch, post } = setup();
    fetch.mockResolvedValue(json(project));
    expect((await post({ project_id: "bedroom", op: "validate" })).body.valid).toBe(true);
  });

  it("fails closed when QA is missing", async () => {
    const { fetch, post } = setup();
    fetch.mockResolvedValue(json({ ...project, spatial_qa: undefined }));
    const result = await post({ project_id: "bedroom", op: "validate" });
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ ok: false, valid: false });
  });

  it("keeps unmeasured walkway and uncalibrated scale invalid", async () => {
    const { fetch, post } = setup();
    fetch.mockResolvedValue(json({ ...project, scale_calibrated: false, spatial_qa: { ...project.spatial_qa, min_walkway_mm: null, walkway_ok: null } }));
    const result = await post({ project_id: "bedroom", op: "validate" });
    expect(result.body.valid).toBe(false);
    expect(result.body.validation.min_walkway_clearance_mm).toBeNull();
  });

  it("submits the add-only schema and lets Python recognize stale successful retries", async () => {
    const { fetch, post, locks } = setup();
    fetch.mockResolvedValueOnce(json({ ...project, revision: 2 }))
      .mockResolvedValueOnce(json({ ok: true, revision: 2, replayed: true }));
    const result = await post(requestBody);
    expect(result.body).toMatchObject({ ok: true, revision: 2, replayed: true, scene_id: "bedroom" });
    expect(fetch.mock.calls[1][0]).toBe("http://canonical/api/v1/projects/bedroom/furniture");
    expect(fetch.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ base_revision: 1, idempotency_key: "bench-request", item: requestBody.item });
    expect(locks.size).toBe(0);
  });

  it.each([404, 409, 422, 502, 503])("preserves upstream HTTP %s failures", async (status) => {
    const { fetch, post, locks } = setup();
    fetch.mockResolvedValueOnce(json(project)).mockResolvedValueOnce(json({ ok: true, detail: "failed" }, status));
    const result = await post(requestBody);
    expect(result.status).toBe(status);
    expect(result.body.ok).toBe(false); // upstream body cannot override HTTP failure
    expect(locks.size).toBe(0);
  });

  it("does not call a failed preview a success", async () => {
    const { fetch, post } = setup();
    fetch.mockResolvedValueOnce(json(project)).mockResolvedValueOnce(json({ status: "FAILED", ok: false }));
    const result = await post({ ...requestBody, op: undefined, operation: "preview", patch: { prompt: "Suggest a bench" } });
    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
  });

  it("retains a slow writer lock past the old 15-second expiry", async () => {
    const { fetch, post, locks } = setup();
    locks.set("bedroom", { holder: "other", acquiredAt: Date.now() - 60_000 });
    const result = await post(requestBody);
    expect(result.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
    expect(locks.has("bedroom")).toBe(true);
  });

  it("releases its lock after transport failure", async () => {
    const { fetch, post, locks } = setup();
    fetch.mockRejectedValue(new Error("sidecar disconnected"));
    expect((await post(requestBody)).status).toBe(502);
    expect(locks.size).toBe(0);
  });

  it("requires revisions and refuses bulk replacement and unsafe legacy mutations", async () => {
    const { fetch, post } = setup();
    fetch.mockImplementation(async () => json(project));
    expect((await post({ ...requestBody, base_revision: undefined })).status).toBe(422);
    expect((await post({ ...requestBody, item: undefined, patch: { furniture: [{}, {}] } })).status).toBe(422);
    expect((await post({ ...requestBody, proposal_id: "proposal" })).status).toBe(422);
    expect((await post({ ...requestBody, operation: "restore", target_revision: 1 })).status).toBe(422);
    expect(fetch.mock.calls.every(([url]) => url === "http://canonical/api/v1/projects/bedroom")).toBe(true);
  });

  it("reports unavailable sidecar without attempting a request", async () => {
    const { fetch, post, locks } = setup(false);
    expect((await post(requestBody)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(locks.size).toBe(0);
  });
});
