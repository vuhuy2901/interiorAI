import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  assertAtelierNodeAssignment,
  upgradeLegacyAtelierDefinition,
  validateAtelierWorkflowDefinition,
  type AtelierEditableDefinition,
} from "../services/atelier-workflow-builder.js";
import { atelierCanonicalWorkflowDefinition } from "../services/atelier-workflow-orchestration.js";

function fakeDb(rows: unknown[] = []) {
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as unknown as Db;
}

describe("Atelier workflow builder", () => {
  it("upgrades published v1 into an editable graph without mutating the legacy value", () => {
    const legacy = atelierCanonicalWorkflowDefinition();
    const before = JSON.stringify(legacy);
    const draft = upgradeLegacyAtelierDefinition(legacy, 2);
    expect(draft.schemaVersion).toBe(2);
    expect(draft.version).toBe(2);
    expect(draft.nodes.filter((node) => node.type === "START")).toHaveLength(1);
    expect(draft.nodes.filter((node) => node.type === "END")).toHaveLength(1);
    expect(draft.nodes.find((node) => node.id === "floorplan")?.taskType).toBe("FLOOR_PLAN_RECOGNITION");
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it("rejects a cycle and unreachable graph before publish", async () => {
    const definition: AtelierEditableDefinition = {
      schemaVersion: 2, key: "test:v2", name: "test", version: 2,
      nodes: [
        { id: "start", type: "START", name: "Start" },
        { id: "work", type: "AGENT_TASK", name: "Work", taskType: "BIM_GEOMETRY", requiredRole: "geometry_agent", agentSelector: { strategy: "CAPABILITY_MATCH", capability: "bim.scenegraph" }, requiredOutputs: ["scenegraph"], completionCriteria: ["valid scenegraph"], retryPolicy: { maxAttempts: 2 } },
        { id: "end", type: "END", name: "End" },
      ],
      edges: [
        { id: "a", source: "start", target: "work" },
        { id: "b", source: "work", target: "start" },
      ],
    };
    const result = await validateAtelierWorkflowDefinition(fakeDb(), "company", definition);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("cycle");
    expect(result.issues.map((issue) => issue.code)).toContain("unreachable_node");
  });

  it("rejects a floor-plan task assigned to the render agent", async () => {
    const renderAgent = {
      id: "render-agent", name: "Render Agent", status: "idle", lifecycleState: "ready",
      role: "engineer", metadata: { atelierAgentKey: "agent_ceiling_lighting" }, permissions: {},
    };
    await expect(assertAtelierNodeAssignment(fakeDb([renderAgent]), {
      companyId: "company",
      agentId: renderAgent.id,
      node: { id: "floorplan", type: "AGENT_TASK", name: "Floor Plan", taskType: "FLOOR_PLAN_RECOGNITION", requiredRole: "floor_plan_agent", agentSelector: { strategy: "CAPABILITY_MATCH", capability: "floorplan.parse" } },
    })).rejects.toMatchObject({ status: 403 });
  });

  it("accepts a matching floor-plan agent", async () => {
    const floorAgent = {
      id: "floor-agent", name: "Floor Plan Agent", status: "idle", lifecycleState: "ready",
      role: "engineer", metadata: { atelierAgentKey: "agent_floorplan" }, permissions: {},
    };
    const result = await assertAtelierNodeAssignment(fakeDb([floorAgent]), {
      companyId: "company",
      agentId: floorAgent.id,
      node: { id: "floorplan", type: "AGENT_TASK", name: "Floor Plan", taskType: "FLOOR_PLAN_RECOGNITION", requiredRole: "floor_plan_agent", agentSelector: { strategy: "CAPABILITY_MATCH", capability: "floorplan.parse" } },
    });
    expect(result.agentId).toBe(floorAgent.id);
  });

  it("permits a guarded retry loop with an exit guard and reaches End", async () => {
    const guardedDefinition: AtelierEditableDefinition = {
      schemaVersion: 2,
      key: "test:guarded_loop",
      name: "Guarded Loop Workflow",
      version: 2,
      nodes: [
        { id: "start", type: "START", name: "Start" },
        {
          id: "geometry",
          type: "AGENT_TASK",
          name: "Geometry",
          taskType: "BIM_GEOMETRY",
          requiredRole: "geometry_agent",
          agentSelector: { strategy: "CAPABILITY_MATCH", capability: "bim.scenegraph" },
          requiredOutputs: ["scenegraph"],
          completionCriteria: ["valid scenegraph"],
          retryPolicy: { maxAttempts: 3, backoffSeconds: 15 },
        },
        {
          id: "qa",
          type: "AGENT_TASK",
          name: "QA",
          taskType: "SPATIAL_QA",
          requiredRole: "qa_agent",
          agentSelector: { strategy: "CAPABILITY_MATCH", capability: "spatial.qa" },
          requiredOutputs: ["qa_report"],
          completionCriteria: ["QA passed"],
        },
        { id: "end", type: "END", name: "End" },
      ],
      edges: [
        { id: "e1", source: "start", target: "geometry" },
        { id: "e2", source: "geometry", target: "qa" },
        // Guarded retry edge: returns to geometry if QA failed
        { id: "e_retry", source: "qa", target: "geometry", outcome: "Retry", condition: "qa_failed == true" },
        // Forward exit edge: proceeds to end if QA passed
        { id: "e_end", source: "qa", target: "end", outcome: "Passed" },
      ],
    };

    const result = await validateAtelierWorkflowDefinition(fakeDb(), "company", guardedDefinition);
    expect(result.issues.filter((i) => i.code === "cycle")).toHaveLength(0);
    expect(result.issues.filter((i) => i.code === "end_unreachable")).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("detects duplicate transitions between the same nodes", async () => {
    const dupDefinition: AtelierEditableDefinition = {
      schemaVersion: 2,
      key: "test:dup",
      name: "Duplicate Edge Test",
      version: 2,
      nodes: [
        { id: "start", type: "START", name: "Start" },
        {
          id: "work",
          type: "AGENT_TASK",
          name: "Work",
          taskType: "BIM_GEOMETRY",
          requiredRole: "geometry_agent",
          agentSelector: { strategy: "CAPABILITY_MATCH", capability: "bim.scenegraph" },
          requiredOutputs: ["scenegraph"],
          completionCriteria: ["ok"],
        },
        { id: "end", type: "END", name: "End" },
      ],
      edges: [
        { id: "e1", source: "start", target: "work" },
        { id: "e2", source: "work", target: "end", outcome: "Proceed" },
        // Duplicate identical transition
        { id: "e3", source: "work", target: "end", outcome: "Proceed" },
      ],
    };

    const result = await validateAtelierWorkflowDefinition(fakeDb(), "company", dupDefinition);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("duplicate_edge");
  });
});
