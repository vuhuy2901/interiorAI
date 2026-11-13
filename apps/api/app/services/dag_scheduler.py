"""Generic, graph-driven concurrent DAG scheduler.

This module deliberately knows nothing about Atelier node IDs or business
domains. The caller supplies the published graph and an executor callback.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional


class GraphError(ValueError):
    pass


@dataclass
class NodeExecution:
    node_id: str
    status: str
    execution_id: str
    attempt_id: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    input_artifact_ids: List[str] = field(default_factory=list)
    output_artifact_ids: List[str] = field(default_factory=list)
    failure_reason: Optional[str] = None


@dataclass
class SchedulerResult:
    status: str
    events_by_node: Dict[str, NodeExecution]

    @property
    def events(self) -> List[NodeExecution]:
        return list(self.events_by_node.values())


Executor = Callable[[Dict[str, Any], Dict[str, Any]], Awaitable[Dict[str, Any]]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConcurrentDAGScheduler:
    def __init__(self, workflow: Dict[str, Any], executor: Executor, *, max_concurrency: int = 4):
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be positive")
        self.workflow = workflow
        self.executor = executor
        self.max_concurrency = max_concurrency

    def _graph(self) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]], Dict[str, List[str]]]:
        nodes = self.workflow.get("nodes") or []
        by_id: Dict[str, Dict[str, Any]] = {}
        for node in nodes:
            node_id = node.get("id")
            if not node_id or node_id in by_id:
                raise GraphError("node IDs must be unique and non-empty")
            by_id[node_id] = node
        predecessors = {node_id: [] for node_id in by_id}
        successors = {node_id: [] for node_id in by_id}
        for edge in self.workflow.get("edges") or []:
            source, target = edge.get("source"), edge.get("target")
            if source not in by_id or target not in by_id:
                raise GraphError(f"edge references unknown node: {source}->{target}")
            predecessors[target].append(source)
            successors[source].append(target)
        # Kahn validation only. Execution is driven by ready waves below.
        indegree = {node_id: len(deps) for node_id, deps in predecessors.items()}
        queue = [node_id for node_id, degree in indegree.items() if degree == 0]
        visited = 0
        while queue:
            current = queue.pop(0)
            visited += 1
            for successor in successors[current]:
                indegree[successor] -= 1
                if indegree[successor] == 0:
                    queue.append(successor)
        if visited != len(by_id):
            raise GraphError("workflow graph contains a cycle")
        return by_id, predecessors, successors

    async def run(self, context: Optional[Dict[str, Any]] = None) -> SchedulerResult:
        by_id, predecessors, successors = self._graph()
        shared_context = dict(context or {})
        statuses: Dict[str, str] = {}
        events: Dict[str, NodeExecution] = {}
        artifacts: Dict[str, str] = {}
        claimed: set[str] = set()
        semaphore = asyncio.Semaphore(self.max_concurrency)

        def make_event(node_id: str, status: str) -> NodeExecution:
            event = NodeExecution(node_id, status, f"exec_{uuid.uuid4().hex[:10]}", f"attempt_{uuid.uuid4().hex[:10]}")
            events[node_id] = event
            statuses[node_id] = status
            return event

        async def dispatch(node_id: str) -> None:
            node = by_id[node_id]
            event = make_event(node_id, "RUNNING")
            event.started_at = _now()
            async with semaphore:
                try:
                    result = await self.executor(node, {**shared_context, "node_id": node_id, "predecessor_artifact_ids": [artifacts[p] for p in predecessors[node_id] if p in artifacts]})
                    result = result or {}
                    result_status = result.get("status", "COMPLETED")
                    output_artifact = result.get("artifact_id")
                    if result_status == "COMPLETED" and not output_artifact and node.get("requires_artifact", True):
                        result_status = "FAILED"
                        event.failure_reason = "REQUIRED_OUTPUT_ARTIFACT_MISSING"
                    event.status = result_status
                    if output_artifact:
                        event.output_artifact_ids = [output_artifact]
                        artifacts[node_id] = output_artifact
                    if result_status in {"FAILED", "BLOCKED"}:
                        event.failure_reason = event.failure_reason or result.get("failure_reason") or result_status
                except asyncio.CancelledError:
                    event.status = "CANCELLED"
                    event.failure_reason = "scheduler_cancelled"
                except Exception as exc:  # one branch must not corrupt sibling state
                    event.status = "FAILED"
                    event.failure_reason = str(exc)
                finally:
                    event.finished_at = _now()
                    statuses[node_id] = event.status

        pending = set(by_id)
        while pending:
            ready: List[str] = []
            for node_id in pending:
                deps = predecessors[node_id]
                if any(statuses.get(dep) in {"FAILED", "BLOCKED", "CANCELLED"} for dep in deps):
                    event = make_event(node_id, "BLOCKED")
                    if any(statuses.get(dep) == "CANCELLED" for dep in deps):
                        event.status = "CANCELLED"
                        statuses[node_id] = "CANCELLED"
                        event.failure_reason = "upstream_dependency_cancelled"
                    else:
                        event.failure_reason = "upstream_dependency_failed"
                    event.finished_at = _now()
                    continue
                if any(statuses.get(dep) == "WAITING" for dep in deps):
                    continue
                if all(statuses.get(dep) == "COMPLETED" for dep in deps):
                    ready.append(node_id)
            for node_id in list(pending):
                if node_id in events and events[node_id].status in {"BLOCKED", "CANCELLED"}:
                    pending.remove(node_id)
            ready = [node_id for node_id in ready if node_id not in claimed]
            if ready:
                claimed.update(ready)
                await asyncio.gather(*(dispatch(node_id) for node_id in ready))
                for node_id in ready:
                    pending.discard(node_id)
                continue
            if not pending:
                break
            # Nodes left without a possible transition are blocked, not silently completed.
            for node_id in list(pending):
                event = make_event(node_id, "BLOCKED")
                event.failure_reason = "dependencies_not_satisfied"
                event.finished_at = _now()
                pending.remove(node_id)

        statuses_set = set(statuses.values())
        if "FAILED" in statuses_set:
            status = "FAILED"
        elif "CANCELLED" in statuses_set:
            status = "CANCELLED"
        elif "WAITING" in statuses_set:
            status = "WAITING"
        elif "BLOCKED" in statuses_set:
            status = "BLOCKED"
        else:
            status = "COMPLETED"
        return SchedulerResult(status, events)

