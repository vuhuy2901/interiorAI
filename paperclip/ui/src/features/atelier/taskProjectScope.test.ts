import { describe, expect, it } from "vitest";
import {
  UNSCOPED_TASK_SCOPE,
  isStaleProjectResponse,
  issueSceneQueryKey,
  mayAutoPickFirstProject,
  nextTaskScope,
  visibleProjectFor,
} from "./taskProjectScope";

describe("FEAT-2026-131 task project scope", () => {
  it("does not auto-pick the first project while bound to a task", () => {
    expect(mayAutoPickFirstProject(UNSCOPED_TASK_SCOPE)).toBe(true);
    const { scope } = nextTaskScope("issue-new", null, null);
    expect(scope.scoped).toBe(true);
    expect(mayAutoPickFirstProject(scope)).toBe(false);
  });

  it("resets activeProjectId to empty when switching to a task that has no scene yet", () => {
    const a = nextTaskScope("issue-a", "proj_a", null);
    expect(a.activeProjectId).toBe("proj_a");
    expect(a.scope.status).toBe("ready");
    const b = nextTaskScope("issue-b", null, null);
    expect(b.activeProjectId).toBe("");
    expect(b.scope.status).toBe("resolving");
  });

  it("task without a conversation issue yet never borrows a project", () => {
    const r = nextTaskScope(null, null, null);
    expect(r.activeProjectId).toBe("");
    expect(r.scope.scoped).toBe(true);
  });

  it("failure keeps activeProjectId empty and exposes the error", () => {
    const r = nextTaskScope("issue-a", "proj_a", "boom");
    expect(r.activeProjectId).toBe("");
    expect(r.scope.status).toBe("error");
    expect(r.scope.error).toBe("boom");
  });

  it("reopening an old task maps back to its own scene", () => {
    expect(nextTaskScope("issue-a", "proj_a", null).activeProjectId).toBe("proj_a");
    expect(nextTaskScope("issue-b", "proj_b", null).activeProjectId).toBe("proj_b");
    expect(nextTaskScope("issue-a", "proj_a", null).activeProjectId).toBe("proj_a");
  });

  it("drops responses that belong to a previous project", () => {
    expect(isStaleProjectResponse("proj_a", "proj_b")).toBe(true);
    expect(isStaleProjectResponse("proj_b", "proj_b")).toBe(false);
  });

  it("only exposes a project that matches the active id", () => {
    expect(visibleProjectFor({ project_id: "proj_a" }, "proj_b")).toBeNull();
    expect(visibleProjectFor({ project_id: "proj_a" }, "")).toBeNull();
    expect(visibleProjectFor({ project_id: "proj_a" }, "proj_a")).toEqual({ project_id: "proj_a" });
  });

  it("query keys differ per issue", () => {
    expect(issueSceneQueryKey("a")).not.toEqual(issueSceneQueryKey("b"));
    expect(issueSceneQueryKey("a")).toEqual(["atelier", "issue-scene", "a"]);
  });
});
