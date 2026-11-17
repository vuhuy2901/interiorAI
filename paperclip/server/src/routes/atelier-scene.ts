import type { Request, Response } from "express";

type SceneLocks = Map<string, { holder: string; acquiredAt: number }>;
type Json = Record<string, any>;

export function createAtelierSceneHandler(apiUrl: string, locks: SceneLocks, ensureSidecar: () => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const projectId = body.project_id ?? body.projectId;
    const operation = String(body.operation ?? body.op ?? "").replace(/^scene\./, "");
    const expectedRevision = body.expected_revision ?? body.base_revision ?? body.baseRevision;
    const mutating = ["apply", "restore", "propose", "preview"].includes(operation);
    if (typeof projectId !== "string" || !projectId.trim()) {
      res.status(422).json({ ok: false, error: "project_id is required" }); return;
    }
    if (!["read", "cost", "validate", "apply", "restore", "propose", "preview"].includes(operation)) {
      res.status(400).json({ ok: false, error: "Unsupported scene operation" }); return;
    }
    if (mutating && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
      res.status(422).json({ ok: false, error: "A positive base_revision is required" }); return;
    }
    if (mutating && locks.has(projectId)) {
      res.status(409).json({ ok: false, conflict: true, reason: "concurrent_scene_mutation_blocked" }); return;
    }
    if (mutating) locks.set(projectId, { holder: body.agent_key ?? body.agentKey ?? "agent_geometry", acquiredAt: Date.now() });
    const projectPath = `/api/v1/projects/${encodeURIComponent(projectId)}`;
    async function request(path: string, init?: RequestInit): Promise<{ response: globalThis.Response; data: Json }> {
      const response = await fetch(`${apiUrl}${path}`, init);
      const raw = await response.text();
      let data: Json;
      try { data = JSON.parse(raw); } catch { data = { error: raw || response.statusText }; }
      return { response, data };
    }
    function forward(result: { response: globalThis.Response; data: Json }, extra: Json = {}) {
      const failed = ["CONFLICT", "FAILED", "ERROR", "REJECTED"].includes(String(result.data.status ?? "").toUpperCase());
      const ok = result.response.ok && result.data.ok !== false && !failed;
      res.status(result.response.ok && !ok ? 409 : result.response.status).json({
        ...result.data, ...extra, operation: `scene.${operation}`, scene_id: projectId, ok,
      });
    }
    try {
      if (await ensureSidecar() === false) {
        res.status(503).json({ ok: false, error: "Canonical sidecar unavailable" }); return;
      }
      const current = await request(projectPath);
      if (!current.response.ok || current.data.ok === false) { forward(current); return; }
      const project = current.data;
      if (project.project_id !== projectId || !Number.isInteger(project.revision)) {
        res.status(502).json({ ok: false, error: "Invalid canonical project identity or revision" }); return;
      }
      const identity = { operation: `scene.${operation}`, scene_id: project.project_id, revision: project.revision, unit: "mm" };
      if (operation === "read") {
        res.json({ ok: true, ...identity, scale_calibrated: project.scale_calibrated, project, scene: project }); return;
      }
      if (operation === "cost") {
        const result = await request(`${projectPath}/cost-workflow`);
        if (!result.response.ok) { forward(result); return; }
        const estimate = result.data.estimate;
        if (result.data.project_id !== projectId || result.data.revision !== project.revision
          || (result.data.asset_hash ?? null) !== (project.external_scene?.sha256 ?? null)
          || estimate?.project_id !== projectId || estimate?.revision !== project.revision
          || (estimate?.scene_asset_hash ?? null) !== (project.external_scene?.sha256 ?? null)
          || !Array.isArray(estimate?.lines) || typeof estimate?.total_vnd !== 'number') {
          res.status(409).json({ ok: false, ...identity, error: 'Cost snapshot identity changed; reread the canonical scene' }); return;
        }
        forward(result, identity); return;
      }
      if (operation === "validate") {
        const qa = project.spatial_qa;
        if (!qa || typeof qa.valid !== "boolean" || !Number.isInteger(qa.collision_count)
          || !Number.isInteger(qa.boundary_violation_count) || !Number.isInteger(qa.door_swing_warning_count)) {
          res.status(502).json({ ok: false, ...identity, valid: false, error: "Canonical spatial QA unavailable" }); return;
        }
        res.json({
          ok: true, ...identity, valid: qa.valid && qa.walkway_ok === true && project.scale_calibrated === true,
          spatial_quality: qa,
          validation: { collision_free: qa.collision_count === 0, walkway_clearance_ok: qa.walkway_ok ?? null,
            min_walkway_clearance_mm: qa.min_walkway_mm ?? null, scale_calibrated: project.scale_calibrated === true },
        }); return;
      }
      const patch = body.patch ?? {};
      const proposalId = body.proposal_id ?? body.proposalId;
      if (operation === "apply" && !proposalId) {
        const item = body.item ?? patch.item ?? (Array.isArray(patch.furniture) && patch.furniture.length === 1 ? patch.furniture[0] : undefined);
        const key = body.idempotency_key ?? patch.idempotency_key;
        if (!item || typeof key !== "string" || !key.trim()) {
          res.status(422).json({ ok: false, error: "scene.apply requires one item and idempotency_key; bulk replacement is unsupported" }); return;
        }
        // Python owns the durable CAS and replay check; a retry may carry an old
        // revision that already succeeded, so do not preempt its receipt lookup.
        forward(await request(`${projectPath}/furniture`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_revision: expectedRevision, idempotency_key: key, item }),
        })); return;
      }
      if (expectedRevision !== project.revision) {
        res.status(409).json({ ok: false, conflict: true, reason: "revision_mismatch", expected_revision: expectedRevision, current_revision: project.revision }); return;
      }
      if (operation === "propose" || operation === "preview") {
        if (typeof patch.prompt !== "string" || !patch.prompt.trim()) {
          res.status(422).json({ ok: false, error: "patch.prompt is required" }); return;
        }
        const result = await request(`${projectPath}/chat/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: patch.prompt }),
        });
        forward(result, { base_revision: project.revision, proposal: result.data.proposal ?? null }); return;
      }
      if (operation === "apply") {
        res.status(422).json({ ok: false, error: "Scoped proposal approval is unsupported by this adapter; use the governed proposal workflow" }); return;
      }
      const target = body.target_revision ?? body.targetRevision;
      if (!Number.isInteger(target) || target < 1) {
        res.status(422).json({ ok: false, error: "target_revision is required" }); return;
      }
      res.status(422).json({ ok: false, error: "Revision-safe restore is unsupported by the canonical restore endpoint" });
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (mutating) locks.delete(projectId);
    }
  };
}
