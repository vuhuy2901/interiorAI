import type { AtelierEditableDefinition, AtelierWorkflowNode } from "./atelier-workflow-builder.js";

export const SPECIALIST_WORKFLOW_KEY = "atelier-specialist-delivery:v1";
export const specialistWorkflowEnabled = () => process.env.ATELIER_SPECIALIST_WORKFLOW_ENABLED !== "false";

const stages = [
  ["brief", "Chief — Design Brief", "CHIEF_INTAKE", "chief_architect", "project.intake", []],
  ["floorplan", "Floor Plan", "FLOOR_PLAN_RECOGNITION", "floor_plan_agent", "floorplan.parse", ["brief"]],
  ["floorplan_qa", "QA mặt bằng", "SPATIAL_QA", "qa_agent", "spatial.qa", ["floorplan"]],
  ["geometry", "Geometry / BIM", "BIM_GEOMETRY", "geometry_agent", "bim.scenegraph", ["floorplan_qa"]],
  ["style", "Style / Materials", "STYLE_RESEARCH", "style_agent", "materials.specify", ["geometry"]],
  ["furniture", "Furniture", "FURNITURE_PLANNING", "furniture_agent", "furniture.plan", ["geometry"]],
  ["cost", "Cost / Specification", "COST_CALCULATION", "cost_agent", "cost.calculate", ["style", "furniture"]],
  ["render", "Render / Visualization", "RENDER", "render_agent", "render.execute", ["style", "furniture"]],
  ["final_qa", "QA cuối", "ACCEPTANCE_VALIDATION", "qa_agent", "acceptance.validate", ["cost", "render"]],
  ["delivery", "Chief — Bàn giao", "FINAL_REVIEW", "chief_architect", "design.final_review", ["final_qa"]],
] as const;

export function specialistDeliveryDefinition(version: number): AtelierEditableDefinition {
  const nodes: AtelierWorkflowNode[] = stages.map(([id, name, taskType, requiredRole, capability], index) => ({
    id, name, type: "AGENT_TASK", taskType, requiredRole,
    agentSelector: { strategy: "CAPABILITY_MATCH", capability },
    position: { x: id === "furniture" || id === "render" ? 540 : 240, y: 140 + index * 140 },
    requiredInputs: id === "brief" ? ["project_brief"] : ["verified_predecessor_outputs"],
    requiredOutputs: [`${id}_output`], requiredArtifacts: [`${id}_evidence`],
    completionCriteria: ["Persisted output, scene identity, revision and independent validation"],
    retryPolicy: { maxAttempts: 2, backoffSeconds: 30 },
    // Final approval is an exit gate; it must not prevent Chief from preparing delivery.
    approval: { required: false },
  }));
  return {
    schemaVersion: 2, key: SPECIALIST_WORKFLOW_KEY, name: "Atelier Company Workflow", version,
    nodes: [
      { id: "start", name: "Start", type: "START" }, ...nodes,
      { id: "end", name: "Delivery accepted", type: "END" },
    ],
    edges: [
      { id: "start_brief", source: "start", target: "brief" },
      ...stages.flatMap(([id, , , , , deps]) => deps.map(source => ({ id: `${source}_${id}`, source, target: id }))),
      { id: "delivery_end", source: "delivery", target: "end" },
    ],
    gatePolicy: { decisionPolicy: "specialist_autonomy", finalHumanApproval: true, artifactRequiredForHandoff: true },
  };
}

export function deliveryNodes(definition: AtelierEditableDefinition) {
  return definition.nodes.filter(node => ["AGENT_TASK", "VALIDATION", "RESEARCH"].includes(node.type));
}

export function deliveryDependencies(definition: AtelierEditableDefinition, nodeId: string): string[] {
  const executable = new Set(deliveryNodes(definition).map(node => node.id));
  const result = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Workflow dependency cycle");
    visiting.add(id);
    for (const edge of definition.edges.filter(edge => edge.target === id)) {
      if (executable.has(edge.source)) result.add(edge.source);
      else visit(edge.source);
    }
    visiting.delete(id);
  }
  visit(nodeId);
  return [...result];
}

export function affectedDeliveryNodes(definition: AtelierEditableDefinition, nodeId: string): string[] {
  const found = new Set<string>();
  const walk = (id: string) => {
    for (const edge of definition.edges.filter(edge => edge.source === id)) {
      if (!found.has(edge.target)) { found.add(edge.target); walk(edge.target); }
    }
  };
  walk(nodeId);
  return deliveryNodes(definition).filter(node => found.has(node.id)).map(node => node.id);
}

export function validateDeliveryOutput(output: unknown, sceneId: string, revision: number) {
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("Structured output is required");
  const value = output as Record<string, unknown>;
  if (value.sceneId !== sceneId || value.revision !== revision) throw new Error("Output must match the current canonical scene and revision");
  if (typeof value.summary !== "string" || !value.summary.trim()) throw new Error("Output summary is required");
  if (!value.decisions || typeof value.decisions !== "object") throw new Error("Decision ledger is required");
  if (!Array.isArray(value.references) || !value.references.length || value.references.some(ref => !ref || typeof ref !== "object" || typeof ref.uri !== "string" || !ref.uri.trim())) throw new Error("Persisted output references are required");
  return Array.isArray(value.decisions) ? { ...value, decisions: { entries: value.decisions } } : value;
}
