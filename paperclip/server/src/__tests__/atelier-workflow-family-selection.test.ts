import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companies, createDb, startEmbeddedPostgresTestDatabase, type Db,
} from "@paperclipai/db";
import {
  createAtelierWorkflowDraft,
  createAtelierWorkflowFamily,
  listAtelierWorkflowFamilies,
  publishAtelierWorkflowDraft,
  resolveActiveAtelierWorkflowName,
  selectAtelierWorkflowFamily,
  type AtelierEditableDefinition,
} from "../services/atelier-workflow-builder.js";
import { ensureAtelierCompanyWorkflowDefinition, ATELIER_COMPANY_WORKFLOW_NAME } from "../services/atelier-workflow-orchestration.js";

// FEAT-2026-134: multiple independent workflow families per company, with
// exactly one selected as active; companies that never opt in keep the
// historical default behavior unchanged.
describe("Atelier workflow family selection", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;
  let db: Db;
  beforeAll(async () => {
    if (process.env.PAPERCLIP_TEST_POSTGRES_ADMIN_URL) throw new Error("An isolated embedded cluster is required");
    database = await startEmbeddedPostgresTestDatabase("paperclip-atelier-workflow-family-");
    db = createDb(database.connectionString);
  }, 90_000);
  afterAll(async () => { await database?.cleanup(); });

  async function makeCompany() {
    const id = randomUUID();
    await db.insert(companies).values({ id, name: `Family test ${id}`, issuePrefix: `T${id.replaceAll("-", "").toUpperCase()}` });
    return id;
  }

  function lightDefinition(name: string): AtelierEditableDefinition {
    return {
      schemaVersion: 2, key: `${name}:v1`, name, version: 1,
      nodes: [
        { id: "start", type: "START", name: "Start" },
        {
          id: "brief", type: "AGENT_TASK", name: "Brief", taskType: "CHIEF_INTAKE", requiredRole: "chief_architect",
          agentSelector: { strategy: "CAPABILITY_MATCH", capability: "project.intake" },
          requiredOutputs: ["brief_output"], completionCriteria: ["Brief captured"], retryPolicy: { maxAttempts: 2 },
        },
        { id: "end", type: "END", name: "Done" },
      ],
      edges: [
        { id: "a", source: "start", target: "brief" },
        { id: "b", source: "brief", target: "end" },
      ],
    };
  }

  it("creates an independent family without touching the default one (AC-01)", async () => {
    const companyId = await makeCompany();
    const defaultBefore = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    const family = await createAtelierWorkflowFamily(db, companyId, {
      name: "Light Flow", prompt: "A lighter flow", definition: lightDefinition("Light Flow"),
    });
    expect(family.name).toBe("Light Flow");
    expect(family.status).toBe("draft");
    const defaultAfter = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    expect(defaultAfter.id).toBe(defaultBefore.id);
  });

  it("rejects creating a family with a name already used by this company", async () => {
    const companyId = await makeCompany();
    await createAtelierWorkflowFamily(db, companyId, { name: "Dup", prompt: "p", definition: lightDefinition("Dup") });
    await expect(createAtelierWorkflowFamily(db, companyId, { name: "Dup", prompt: "p", definition: lightDefinition("Dup") }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("generates a readable summary on publish (AC-02)", async () => {
    const companyId = await makeCompany();
    const family = await createAtelierWorkflowFamily(db, companyId, { name: "Summary Flow", prompt: "p", definition: lightDefinition("Summary Flow") });
    const published = await publishAtelierWorkflowDraft(db, companyId, family.id);
    expect(published.status).toBe("published");
    expect(published.publishedSummary).toContain("Brief");
    expect(published.publishedSummary).toContain("chief_architect");
    expect(published.publishedSummary).toContain("Ket thuc");
  });

  it("selecting a family for one company does not affect another (AC-03)", async () => {
    const companyA = await makeCompany();
    const companyB = await makeCompany();
    const familyA = await createAtelierWorkflowFamily(db, companyA, { name: "A Flow", prompt: "p", definition: lightDefinition("A Flow") });
    await publishAtelierWorkflowDraft(db, companyA, familyA.id);
    await selectAtelierWorkflowFamily(db, companyA, "A Flow");

    expect(await resolveActiveAtelierWorkflowName(db, companyA)).toBe("A Flow");
    expect(await resolveActiveAtelierWorkflowName(db, companyB)).toBe(ATELIER_COMPANY_WORKFLOW_NAME);

    const activeA = await ensureAtelierCompanyWorkflowDefinition(db, companyA);
    expect(activeA.name).toBe("A Flow");
  });

  it("falls back to the historical default when a company never opts in (AC-03)", async () => {
    const companyId = await makeCompany();
    expect(await resolveActiveAtelierWorkflowName(db, companyId)).toBe(ATELIER_COMPANY_WORKFLOW_NAME);
    const definition = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    expect(definition.name).toBe(ATELIER_COMPANY_WORKFLOW_NAME);
  });

  it("rejects selecting a family with no published version and leaves the existing selection untouched (AC-04)", async () => {
    const companyId = await makeCompany();
    const draftOnly = await createAtelierWorkflowFamily(db, companyId, { name: "Draft Only", prompt: "p", definition: lightDefinition("Draft Only") });
    void draftOnly;
    await expect(selectAtelierWorkflowFamily(db, companyId, "Draft Only"))
      .rejects.toMatchObject({ status: 422, details: { code: "workflow_family_not_publishable" } });
    expect(await resolveActiveAtelierWorkflowName(db, companyId)).toBe(ATELIER_COMPANY_WORKFLOW_NAME);
  });

  it("lists families with latest version, status and active flag", async () => {
    const companyId = await makeCompany();
    await ensureAtelierCompanyWorkflowDefinition(db, companyId); // materializes the default family row
    const family = await createAtelierWorkflowFamily(db, companyId, { name: "Listed Flow", prompt: "p", definition: lightDefinition("Listed Flow") });
    await publishAtelierWorkflowDraft(db, companyId, family.id);
    await selectAtelierWorkflowFamily(db, companyId, "Listed Flow");
    const families = await listAtelierWorkflowFamilies(db, companyId);
    const listedFlow = families.find((item) => item.name === "Listed Flow");
    expect(listedFlow?.status).toBe("published");
    expect(listedFlow?.isActive).toBe(true);
    expect(listedFlow?.publishedSummary).toContain("Brief");
    const defaultFamily = families.find((item) => item.name === ATELIER_COMPANY_WORKFLOW_NAME);
    expect(defaultFamily?.isActive).toBe(false);
  });

  it("still reports a family as selectable when its newest row is an unpublished draft on top of an older published version", async () => {
    const companyId = await makeCompany();
    const family = await createAtelierWorkflowFamily(db, companyId, { name: "Edited Flow", prompt: "p", definition: lightDefinition("Edited Flow") });
    await publishAtelierWorkflowDraft(db, companyId, family.id); // v1 published
    await createAtelierWorkflowDraft(db, companyId, family.id); // v2 draft, in progress, never published

    const families = await listAtelierWorkflowFamilies(db, companyId);
    const editedFlow = families.find((item) => item.name === "Edited Flow");
    expect(editedFlow?.latestVersion).toBe(2);
    expect(editedFlow?.status).toBe("draft");
    expect(editedFlow?.hasPublishedVersion).toBe(true);
    expect(editedFlow?.publishedVersion).toBe(1);

    // Selecting must succeed: it only needs SOME published version to exist,
    // not for the newest row specifically to be published.
    await expect(selectAtelierWorkflowFamily(db, companyId, "Edited Flow")).resolves.toMatchObject({ workflowName: "Edited Flow" });
  });

  it("switching the active family only changes definitions resolved for new work, never already-pinned identifiers (AC-05/AC-06)", async () => {
    const companyId = await makeCompany();
    const beforeSwitch = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    const family = await createAtelierWorkflowFamily(db, companyId, { name: "Switched Flow", prompt: "p", definition: lightDefinition("Switched Flow") });
    await publishAtelierWorkflowDraft(db, companyId, family.id);
    await selectAtelierWorkflowFamily(db, companyId, "Switched Flow");
    const afterSwitch = await ensureAtelierCompanyWorkflowDefinition(db, companyId);
    // A reference captured before the switch (as a workflow run would pin
    // workflowDefinitionId/workflowVersion at creation time) still points at
    // the pre-switch row; it is never retroactively resolved again.
    expect(beforeSwitch.id).not.toBe(afterSwitch.id);
    expect(beforeSwitch.name).toBe(ATELIER_COMPANY_WORKFLOW_NAME);
    expect(afterSwitch.name).toBe("Switched Flow");
  });
});
