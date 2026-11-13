from __future__ import annotations

import asyncio

import pytest

from app.services.dag_scheduler import ConcurrentDAGScheduler, GraphError


def edge(source: str, target: str) -> dict:
    return {"id": f"{source}->{target}", "source": source, "target": target}


def node(node_id: str, node_type: str = "test", **config) -> dict:
    return {"id": node_id, "type": node_type, "agent_id": "agent_test", "config": config}


def test_f_parallel_join_uses_barrier():
    graph = {"nodes": [node("a"), node("b"), node("c"), node("d")], "edges": [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]}
    entered = 0
    entered_barrier = asyncio.Barrier(2)
    running: set[str] = set()
    overlap = False

    async def execute(n, _ctx):
        nonlocal entered, overlap
        if n["id"] in {"b", "c"}:
            running.add(n["id"])
            entered += 1
            await entered_barrier.wait()
            overlap = overlap or len(running) == 2
            running.remove(n["id"])
        return {"status": "COMPLETED", "artifact_id": f"art-{n['id']}"}

    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.status == "COMPLETED"
    assert entered == 2
    assert overlap is True
    assert result.events[-1].node_id == "d"


def test_g_dynamic_chain_uses_only_edges():
    graph = {"nodes": [node("a"), node("b"), node("c"), node("d")], "edges": [edge("a", "b"), edge("b", "c"), edge("c", "d")]}
    order = []

    async def execute(n, _ctx):
        order.append(n["id"])
        return {"status": "COMPLETED", "artifact_id": n["id"]}

    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.status == "COMPLETED"
    assert order == ["a", "b", "c", "d"]


def test_h_independent_nodes_and_same_type_have_isolated_contexts():
    graph = {"nodes": [node("left", "same"), node("right", "same")], "edges": []}
    seen = []

    async def execute(n, ctx):
        seen.append((n["id"], ctx["node_id"]))
        return {"status": "COMPLETED", "artifact_id": n["id"]}

    asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert sorted(seen) == [("left", "left"), ("right", "right")]


def test_i_failed_branch_blocks_join_but_other_branch_finishes():
    graph = {"nodes": [node("a"), node("b"), node("c"), node("d")], "edges": [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]}
    async def execute(n, _ctx):
        return {"status": "FAILED" if n["id"] == "b" else "COMPLETED", "artifact_id": n["id"]}
    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.events_by_node["c"].status == "COMPLETED"
    assert result.events_by_node["d"].status == "BLOCKED"


def test_j_missing_artifact_blocks_join():
    graph = {"nodes": [node("a"), node("b"), node("d")], "edges": [edge("a", "b"), edge("b", "d")]}
    async def execute(n, _ctx):
        return {"status": "COMPLETED", "artifact_id": None if n["id"] == "b" else n["id"]}
    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.events_by_node["b"].status == "FAILED"
    assert result.events_by_node["d"].status == "BLOCKED"


@pytest.mark.parametrize("limit", [1, 2])
def test_k_concurrency_limit(limit):
    graph = {"nodes": [node(str(i)) for i in range(4)], "edges": []}
    current = 0
    maximum = 0
    lock = asyncio.Lock()

    async def execute(n, _ctx):
        nonlocal current, maximum
        async with lock:
            current += 1
            maximum = max(maximum, current)
        await asyncio.sleep(0)
        async with lock:
            current -= 1
        return {"status": "COMPLETED", "artifact_id": n["id"]}

    asyncio.run(ConcurrentDAGScheduler(graph, execute, max_concurrency=limit).run())
    assert maximum <= limit


def test_l_node_is_not_duplicated():
    graph = {"nodes": [node("a"), node("b")], "edges": [edge("a", "b")]}
    calls = []
    async def execute(n, _ctx):
        calls.append(n["id"])
        return {"status": "COMPLETED", "artifact_id": n["id"]}
    asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert calls.count("a") == 1
    assert calls.count("b") == 1


def test_m_cancel_does_not_dispatch_new_nodes():
    graph = {"nodes": [node("a"), node("b")], "edges": [edge("a", "b")]}
    async def execute(n, _ctx):
        return {"status": "CANCELLED" if n["id"] == "a" else "COMPLETED", "artifact_id": None}
    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.status == "CANCELLED"
    assert result.events_by_node["b"].status == "CANCELLED"


def test_n_waiting_gate_does_not_block_independent_branch():
    graph = {"nodes": [node("gate"), node("independent")], "edges": []}
    async def execute(n, _ctx):
        return {"status": "WAITING" if n["id"] == "gate" else "COMPLETED", "artifact_id": None if n["id"] == "gate" else "independent"}
    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.events_by_node["gate"].status == "WAITING"
    assert result.events_by_node["independent"].status == "COMPLETED"


def test_o_graph_changes_need_no_scheduler_change():
    graph = {"nodes": [node("renamed-a"), node("renamed-b")], "edges": [edge("renamed-a", "renamed-b")]}
    async def execute(n, _ctx):
        return {"status": "COMPLETED", "artifact_id": n["id"]}
    result = asyncio.run(ConcurrentDAGScheduler(graph, execute).run())
    assert result.status == "COMPLETED"


def test_cycle_is_rejected():
    graph = {"nodes": [node("a"), node("b")], "edges": [edge("a", "b"), edge("b", "a")]}
    with pytest.raises(GraphError):
        asyncio.run(ConcurrentDAGScheduler(graph, lambda *_: None).run())

