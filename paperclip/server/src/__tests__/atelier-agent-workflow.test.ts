import { describe, expect, it } from "vitest";
import {
  ATELIER_WORKFLOW_STAGES,
  assertAtelierHandoffAllowed,
  atelierHandoffTargets,
  validateAtelierWorkflowGraph,
  atelierWorkflowCompletion,
  atelierIssueWorkflowView,
} from "../services/atelier-agent-workflow.js";

describe("Atelier agent workflow", () => {
  it('reads a completed issue workflow without manufacturing a native execution', () => {
    const root={id:'real-root-id',identifier:'ATL-7',title:'Workflow',status:'done'};
    const children=ATELIER_WORKFLOW_STAGES.map(stage=>({id:stage.key,originId:`atelier-agent-workflow:v1:old-project:stage:${stage.key}`,identifier:stage.key,status:'done',assigneeAgentId:'owner'}));
    const view=atelierIssueWorkflowView(root,children,[{id:'owner',name:'Existing owner'}]);
    expect(view.run).toEqual({id:root.id,status:'done',workflowVersion:1,source:'issue_workflow'});
    expect(view.stages).toHaveLength(10);
    expect(view.stages.every(stage=>stage.status==='done')).toBe(true);
    expect(view.stages[0].agent?.name).toBe('Existing owner');
    children.find(stage=>stage.id==='cost')!.status='in_review';
    expect(atelierIssueWorkflowView(root,children,[]).run.status).toBe('needs_review');
    expect(atelierIssueWorkflowView(root,children.slice(1),[]).run.status).toBe('blocked');
  });
  it('finishes the root only after every stage including final review is done', () => {
    const stages = ATELIER_WORKFLOW_STAGES.map(stage => ({ id: stage.key, status: 'done' }));
    expect(atelierWorkflowCompletion(stages)).toEqual({status:'done', blockedByIssueIds:[]});
    stages.find(stage => stage.id === 'cost')!.status = 'in_review';
    expect(atelierWorkflowCompletion(stages)).toEqual({status:'todo', blockedByIssueIds:['cost']});
    stages.find(stage => stage.id === 'final_review')!.status = 'blocked';
    expect(atelierWorkflowCompletion(stages).blockedByIssueIds).toEqual(expect.arrayContaining(['cost','final_review']));
    expect(atelierWorkflowCompletion([]).status).toBe('todo');
  });
  it("is a unique acyclic graph with dependencies declared before consumers", () => {
    expect(validateAtelierWorkflowGraph()).toBe(true);
    const seen = new Set<string>();
    for (const stage of ATELIER_WORKFLOW_STAGES) {
      expect(seen.has(stage.key)).toBe(false);
      for (const dependency of stage.dependsOn) expect(seen.has(dependency)).toBe(true);
      seen.add(stage.key);
    }
  });

  it("covers the chief and all eight specialist agents", () => {
    expect(new Set(ATELIER_WORKFLOW_STAGES.map((stage) => stage.agentKey))).toEqual(new Set([
      "agent_concierge",
      "agent_floorplan",
      "agent_geometry",
      "agent_furniture",
      "agent_style",
      "agent_render",
      "agent_qa",
      "agent_research",
      "agent_cost",
    ]));
  });

  it("publishes only downstream handoff targets", () => {
    expect(atelierHandoffTargets("agent_concierge")).toEqual(["agent_floorplan"]);
    expect(atelierHandoffTargets("agent_geometry")).toEqual(expect.arrayContaining([
      "agent_furniture",
      "agent_style",
      "agent_qa",
    ]));
    expect(atelierHandoffTargets("agent_cost")).toEqual(["agent_concierge"]);
  });

  it("rejects peer handoffs outside the canonical graph", () => {
    expect(() => assertAtelierHandoffAllowed("agent_floorplan", "agent_geometry")).not.toThrow();
    expect(() => assertAtelierHandoffAllowed("agent_floorplan", "agent_cost")).toThrow(
      /outside the Atelier workflow/,
    );
  });
});
