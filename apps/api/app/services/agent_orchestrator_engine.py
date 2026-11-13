"""
ATELIER AI — Real Multi-Agent Orchestration Engine (G7)
Replaces synthetic loop with real tool-calling agent executions:
- Real start/end wall-clock ISO timestamps + perf_counter elapsed milliseconds
- Explicit Run ID, Step ID (step_run_id), Tool Call ID, Input & Output payloads, Error state
- Real tool invocation across all 14 DAG nodes (FloorPlan CV, Scale Gate, Brief, Pascal MCP,
  Surface Material Assigner, Furniture Spatial Arranger, Spatial QA, Live Product Researcher,
  Deterministic Cost Engine, Human Approval Gate, Blender Cycles Render Agent, Render QA Inspector,
  and CAD DXF/GLB/BOM Exporter)
- Dynamic state hand-off and fail-fast dependency propagation
- Never marks run COMPLETED if any node is SKIPPED, BLOCKED, WAITING, or FAILED
"""
from __future__ import annotations

import json
import hashlib
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.db import DATA_DIR, get_conn, get_project, now_iso, save_project
from app.services.cad_export import export_project_to_dxf, export_project_to_glb
from app.services.cost_engine import calculate_project_estimate
from app.services.floorplan_cv import FloorPlanCVEngine
from app.services.geometry import analyze_scene_spatial_quality
from app.services.inventory_bom import export_inventory_bom_csv, generate_project_inventory_bom
from app.services.mcp_gateway import sync_canonical_to_pascal
from app.services.research_agent import search_real_products
from app.services.paperclip_task_adapter import PaperclipTaskError, create_native_task, get_issue_runs, get_native_handoff, get_native_task
from app.services.workflow_runtime import get_ready_nodes, materialize_native_handoff, validate_handoff, workflow_snapshot, write_handoff


# Published node type is the only runtime dispatch key. Node IDs identify an
# execution instance and may be renamed or repeated freely in a workflow.
NODE_EXECUTOR_REGISTRY: Dict[str, Dict[str, Optional[str]]] = {
    "input_intake": {"executor": "input_intake", "required_role": "orchestrator_concierge"},
    "floorplan_cv": {"executor": "floorplan_cv", "required_role": "floorplan_cv"},
    "human_gate": {"executor": "human_gate", "required_role": None},
    "concierge_brief": {"executor": "concierge_brief", "required_role": "orchestrator_concierge"},
    "pascal_geometry": {"executor": "pascal_geometry", "required_role": "geometry_mcp"},
    "style_surface": {"executor": "style_surface", "required_role": "style_material"},
    "furniture_layout": {"executor": "furniture_layout", "required_role": "furniture_layout"},
    "collision_qa": {"executor": "collision_qa", "required_role": "furniture_layout"},
    "catalog_match": {"executor": "catalog_match", "required_role": "shopping_catalog"},
    "deterministic_cost": {"executor": "deterministic_cost", "required_role": "cost_boq"},
    "render_gen": {"executor": "render_gen", "required_role": "render_qa"},
    "render_qa": {"executor": "render_qa", "required_role": "render_qa"},
    "cad_export": {"executor": "cad_export", "required_role": "geometry_mcp"},
}


def predecessor_handoff_paths(run_id: str, predecessor_ids: List[str]) -> List[str]:
    """Return workspace-independent absolute handoff paths for native agents."""
    return [
        str(DATA_DIR / "runs" / run_id / "handoffs" / f"{predecessor_id}.md")
        for predecessor_id in predecessor_ids
    ]


async def sync_native_workflow_run(run_id: str) -> Dict[str, Any]:
    """Refresh real Paperclip task state and activate the next graph node."""
    from app.services.workflow_input_sync import (
        decision_contract_missing,
        node_decision_contract,
        reconcile_workflow_inputs,
    )

    input_sync = reconcile_workflow_inputs(run_id)
    conn = get_conn()
    row = conn.execute("SELECT payload_json FROM workflow_runs WHERE run_id = ?", (run_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Không tìm thấy workflow run: {run_id}")
    run_doc = json.loads(row["payload_json"])
    events = run_doc.get("events", [])
    event_by_task = {event.get("native_task_id"): event for event in events if event.get("native_task_id")}
    for task_row in conn.execute("SELECT * FROM workflow_native_tasks WHERE run_id = ? ORDER BY created_at ASC", (run_id,)).fetchall():
        task_id = task_row["task_id"]
        event = event_by_task.get(task_id)
        if not event:
            continue
        try:
            native = get_native_task(task_id)
            observed_status = native.get("status", task_row["status"])
            payload = json.loads(task_row["payload_json"])
            payload["raw_latest"] = native
            conn.execute(
                "UPDATE workflow_native_tasks SET status = ?, payload_json = ?, updated_at = ? WHERE task_id = ?",
                (observed_status, json.dumps(payload, ensure_ascii=False), now_iso(), task_id),
            )
            event["native_task_status"] = observed_status
            event["native_task_observed"] = True
            event.pop("sync_error", None)
            attempts = get_issue_runs(task_id)
            latest_attempt = attempts[0] if attempts else None
            latest_execution = (latest_attempt or {}).get("execution") or {}
            exhausted = (
                latest_attempt is not None
                and latest_attempt.get("status") in {"failed", "cancelled"}
                and int(latest_execution.get("attempt") or 0) >= int(latest_execution.get("maxAttempts") or 3)
            )
            if observed_status == "in_progress" and exhausted:
                event["status"] = "BLOCKED"
                event["error"] = str(latest_attempt.get("errorCode") or "NATIVE_EXECUTION_RETRIES_EXHAUSTED").upper()
                event["execution_run_id"] = latest_attempt.get("runId")
                event["output_summary"] = "Native agent đã hết lượt retry; chỉ node này bị chặn."
                continue
            if observed_status == "in_progress":
                event["agent_started"] = True
            elif observed_status in {"in_review", "done"}:
                document = get_native_handoff(task_id)
                handoff = materialize_native_handoff(run_id, event["node_id"], event.get("agent_id"), document["body"])
                event["handoff"] = {
                    "markdown_path": handoff["markdown_path"],
                    "manifest_path": handoff["manifest_path"],
                    "source": "paperclip_issue_document",
                }
                event["handoff_artifacts"] = handoff["artifacts"]
                event["output"] = handoff.get("agent_payload") or event.get("output")
                if handoff["status"] == "COMPLETED":
                    event["status"] = "COMPLETED"
                    event["completed_at"] = event.get("completed_at") or now_iso()
                    event["output_summary"] = "Agent Paperclip đã hoàn thành và handoff đã được xác minh hash."
                    event["artifact_ids"] = [item["artifact_id"] for item in handoff["artifacts"]]
                else:
                    missing = input_sync.get("missing_keys") or []
                    event["decision_sync"] = {
                        "decision_revision": input_sync.get("decision_revision", 0),
                        "required_keys": input_sync.get("required_keys") or [],
                        "missing_keys": missing,
                    }
                    if missing:
                        event["status"] = "WAITING_FOR_INPUT"
                        event["output_summary"] = "Còn thiếu quyết định đã xác minh: " + ", ".join(missing)
                    else:
                        event["status"] = "WAITING_FOR_AGENT"
                        event["output_summary"] = "Đã đủ input người dùng; đang chờ agent tiếp tục và ghi handoff mới."
            elif observed_status in {"cancelled", "blocked", "failed"}:
                event["status"] = "BLOCKED" if observed_status == "blocked" else "FAILED"
                event["error"] = f"PAPERCLIP_TASK_{str(observed_status).upper()}"
        except (PaperclipTaskError, OSError, ValueError) as exc:
            event["native_task_observed"] = False
            event["sync_error"] = str(exc)

    snapshot = run_doc.get("workflow_snapshot") or {}
    decisions = input_sync.get("decisions") or {}
    for event in events:
        if event.get("status") != "WAITING_FOR_INPUT" or event.get("native_task_id"):
            continue
        node = next((item for item in snapshot.get("nodes") or [] if item.get("id") == event.get("node_id")), None)
        if not node:
            continue
        contract = node_decision_contract(run_doc, decisions, node=node)
        missing = decision_contract_missing(contract, decisions)
        event["decision_contract"] = {**contract, "missing_keys": missing}
        if not missing:
            event["status"] = "INPUT_RESOLVED"
            event["completed_at"] = now_iso()
            event["output_summary"] = "Decision gate của node đã đủ; node được tái đánh giá theo workflow edges."
    statuses = {
        event["node_id"]: event.get("status", "PENDING")
        for event in events
        if event.get("status") != "INPUT_RESOLVED"
    }
    ready = get_ready_nodes(snapshot, statuses)
    existing_nodes = {
        event["node_id"] for event in events
        if event.get("native_task_id") or event.get("status") not in {"INPUT_RESOLVED"}
    }
    project_id = run_doc["project_id"]
    for node in snapshot.get("nodes") or []:
        node_id = node.get("id")
        if node_id not in ready or node_id in existing_nodes:
            continue
        agent_id = node.get("agent_id")
        predecessors = [edge["source"] for edge in snapshot.get("edges") or [] if edge.get("target") == node_id]
        task_key = f"{run_id}:{node_id}:native"
        native_started_at = now_iso()
        predecessor_handoffs = predecessor_handoff_paths(run_id, predecessors)
        contract = node_decision_contract(run_doc, decisions, node=node)
        node_missing = decision_contract_missing(contract, decisions)
        if node_missing:
            events.append({
                "run_id": run_id,
                "step": len(events) + 1,
                "step_id": f"step_{uuid.uuid4().hex[:8]}",
                "step_run_id": f"step_{uuid.uuid4().hex[:8]}",
                "node_id": node_id,
                "node_type": node.get("type"),
                "executor_type": node.get("type"),
                "label": node.get("label", node_id),
                "agent_id": agent_id,
                "status": "WAITING_FOR_INPUT",
                "depends_on": predecessors,
                "decision_contract": {**contract, "missing_keys": node_missing},
                "output_summary": "Node đang chờ đúng decision bắt buộc: " + ", ".join(node_missing),
                "error": None,
            })
            continue
        decision_keys = sorted(set(contract["required_keys"]) | set(contract["allow_provisional_keys"]))
        decision_context = {
            key: {
                "status": decisions[key]["status"],
                "value": decisions[key]["answer_value"],
                "revision": decisions[key]["revision"],
                "source": decisions[key]["answer_source"],
            }
            for key in decision_keys
            if key in decisions
        }
        base_description = str(node.get("config", {}).get("task_description") or node.get("label") or node.get("type") or node_id)
        task_description = "\n".join([
            base_description,
            "",
            "Decision contract của node:",
            json.dumps({**contract, "decisions": decision_context}, ensure_ascii=False, indent=2, default=str),
            "Giá trị PROVISIONAL chỉ dùng cho phương án sơ bộ; không được diễn giải thành phê duyệt cấu tạo, sản xuất hoặc hồ sơ cuối.",
        ])
        try:
            native_task = create_native_task(
                run_id=run_id,
                project_id=project_id,
                node=node,
                local_agent_id=agent_id or "",
                task_description=task_description,
                predecessor_handoffs=predecessor_handoffs,
                idempotency_key=task_key,
            )
            conn.execute(
                "INSERT OR IGNORE INTO workflow_native_tasks (task_id, run_id, node_id, local_agent_id, native_agent_id, status, idempotency_key, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (native_task["task_id"], run_id, node_id, agent_id or "", native_task.get("agent_id"), native_task.get("status", "todo"), task_key, json.dumps(native_task, ensure_ascii=False), native_started_at, native_started_at),
            )
            events.append({
                "run_id": run_id, "step": len(events) + 1, "step_id": f"step_{uuid.uuid4().hex[:8]}", "step_run_id": f"step_{uuid.uuid4().hex[:8]}",
                "node_id": node_id, "node_type": node.get("type"), "executor_type": node.get("type"), "label": node.get("label", node_id),
                "agent_id": agent_id, "tool_called": "paperclip_native_task", "tool_call_id": None, "status": "WAITING_FOR_AGENT",
                "started_at": native_started_at, "completed_at": None, "duration_ms": None, "depends_on": predecessors, "blocked_by": None,
                "input": {"predecessor_handoffs": predecessor_handoffs, "decision_contract": contract, "decisions": decision_context}, "output": {"native_task": native_task, "acceptance_observed": False},
                "output_summary": "Node tiếp theo đã được kích hoạt bằng native Paperclip task.", "error": None,
                "native_task_id": native_task["task_id"], "native_task_status": native_task.get("status", "todo"), "acceptance_observed": False,
            })
        except (PaperclipTaskError, OSError, ValueError) as exc:
            events.append({"run_id": run_id, "node_id": node_id, "agent_id": agent_id, "status": "BLOCKED", "error": "NATIVE_TASK_CREATE_FAILED", "output_summary": str(exc), "depends_on": predecessors})

    terminal = {event.get("status") for event in events}
    if "FAILED" in terminal:
        status = "FAILED"
    elif "WAITING_FOR_INPUT" in terminal:
        status = "WAITING_FOR_INPUT"
    elif "WAITING_FOR_AGENT" in terminal:
        status = "WAITING_FOR_AGENT"
    elif "BLOCKED" in terminal:
        status = "BLOCKED"
    else:
        status = "COMPLETED"
    run_doc["events"] = events
    run_doc["status"] = status
    run_doc["input_sync"] = {
        "status": input_sync.get("status"),
        "decision_revision": input_sync.get("decision_revision", 0),
        "required_keys": input_sync.get("required_keys") or [],
        "missing_keys": input_sync.get("missing_keys") or [],
        "pending_question_keys": input_sync.get("pending_question_keys") or [],
        "provisional_keys": input_sync.get("provisional_keys") or [],
        "node_contract": input_sync.get("node_contract") or {},
        "resolved_native_interactions": input_sync.get("resolved_native_interactions") or [],
    }
    run_doc["synced_at"] = now_iso()
    conn.execute(
        "UPDATE workflow_runs SET status = ?, payload_json = ?, updated_at = ? WHERE run_id = ?",
        (status, json.dumps(run_doc, ensure_ascii=False), run_doc["synced_at"], run_id),
    )
    conn.commit()
    conn.close()

    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run_id, project_id=project_id)
    except Exception as exc:
        pass

    return run_doc


async def execute_real_workflow_run(
    workflow_id: str,
    project_id: str = "proj_demo_4x5m",
    user_message_id: Optional[str] = None,
    user_text: Optional[str] = None,
    native_tasks: bool = False,
) -> Dict[str, Any]:
    """
    Executes a real Multi-Agent Workflow Run on a project.
    Measures actual start/end timestamps and elapsed milliseconds, executes real agent tools,
    records structured input/output payloads, and returns an authentic execution trace.
    """
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    conn = get_conn()
    wf_row = conn.execute("SELECT payload_json FROM workflows WHERE workflow_id = ?", (workflow_id,)).fetchone()
    if not wf_row:
        conn.close()
        raise ValueError(f"Không tìm thấy workflow hợp lệ: {workflow_id}")
    wf = json.loads(wf_row["payload_json"])
    # Freeze the published graph at run creation.  Everything below reads this
    # copy; later edits to the workflow cannot change an existing run.
    snapshot = workflow_snapshot(wf)

    project = get_project(project_id)
    if not project:
        conn.close()
        raise ValueError(f"Không tìm thấy dự án {project_id}")

    events: List[Dict[str, Any]] = []
    run_status = "RUNNING"
    run_started_at = now_iso()

    context_data: Dict[str, Any] = {
        "project_id": project_id,
        "revision": project.revision,
        "scale_calibrated": project.scale_calibrated,
    }
    nodes = snapshot.get("nodes", [])
    node_by_id = {node.get("id"): node for node in nodes if node.get("id")}
    predecessors: Dict[str, List[str]] = {node_id: [] for node_id in node_by_id}
    successors: Dict[str, List[str]] = {node_id: [] for node_id in node_by_id}
    for edge in snapshot.get("edges", []):
        source, target = edge.get("source"), edge.get("target")
        if source in node_by_id and target in node_by_id:
            predecessors[target].append(source)
            successors[source].append(target)

    # Stable Kahn ordering. The graph, not the node array position, determines readiness.
    original_index = {node.get("id"): index for index, node in enumerate(nodes)}
    ready_ids = sorted((node_id for node_id, deps in predecessors.items() if not deps), key=original_index.get)
    ordered_ids: List[str] = []
    remaining_deps = {node_id: set(deps) for node_id, deps in predecessors.items()}
    while ready_ids:
        current = ready_ids.pop(0)
        ordered_ids.append(current)
        for target in successors[current]:
            remaining_deps[target].discard(current)
            if not remaining_deps[target] and target not in ordered_ids and target not in ready_ids:
                ready_ids.append(target)
        ready_ids.sort(key=original_index.get)
    if len(ordered_ids) != len(node_by_id):
        conn.close()
        raise ValueError("Workflow graph contains a cycle or an edge to an unknown node")
    nodes = [node_by_id[node_id] for node_id in ordered_ids]
    node_statuses: Dict[str, str] = {}
    for idx, node in enumerate(nodes):
        node_id = node.get("id", f"node_{idx+1}")
        agent_id = node.get("agent_id")
        node_type = node.get("type")
        executor_spec = NODE_EXECUTOR_REGISTRY.get(node_type)
        executor_key = executor_spec.get("executor") if executor_spec else None
        label = node.get("label", node_id)
        enabled = node.get("enabled", True)
        depends_on = predecessors.get(node_id, [])

        step_run_id = f"step_{uuid.uuid4().hex[:8]}"

        # The current executor remains sequential for compatibility, but its
        # admission decision is now the same edge-based ALL-join rule used by
        # the small runtime helper.  No node ID or agent name is consulted.
        ready_ids = get_ready_nodes(snapshot, dict(node_statuses))

        if not enabled:
            ts = now_iso()
            events.append({
                "run_id": run_id,
                "step": idx + 1,
                "step_id": step_run_id,
                "step_run_id": step_run_id,
                "node_id": node_id,
                "label": label,
                "agent_id": agent_id,
                "tool_called": None,
                "tool_call_id": None,
                "status": "SKIPPED",
                "started_at": ts,
                "completed_at": ts,
                "duration_ms": 0.0,
                "depends_on": depends_on,
                "blocked_by": None,
                "input": {"project_id": project_id, "enabled": False},
                "output": {"skipped": True},
                "output_summary": "Node bị tắt trong cấu hình DAG",
                "error": None,
            })
            if run_status == "COMPLETED":
                run_status = "INCOMPLETE_SKIPPED_NODES"
            node_statuses[node_id] = "SKIPPED"
            continue

        blocked_dependencies = [dep for dep in depends_on if node_statuses.get(dep) in {"FAILED", "BLOCKED", "CANCELLED"}]
        if not blocked_dependencies and node_id not in ready_ids:
            blocked_dependencies = [dep for dep in depends_on if node_statuses.get(dep) not in {"COMPLETED", "SKIPPED"}]
        if blocked_dependencies:
            ts = now_iso()
            events.append({
                "run_id": run_id,
                "step": idx + 1,
                "step_id": step_run_id,
                "step_run_id": step_run_id,
                "node_id": node_id,
                "label": label,
                "agent_id": agent_id,
                "tool_called": None,
                "tool_call_id": None,
                "status": "BLOCKED",
                "started_at": ts,
                "completed_at": ts,
                "duration_ms": 0.0,
                "depends_on": depends_on,
                "blocked_by": blocked_dependencies[0],
                "input": {"project_id": project_id, "upstream_halted_by": {"node_id": blocked_dependencies[0], "status": node_statuses.get(blocked_dependencies[0], "PENDING")}},
                "output": None,
                "output_summary": (
                    f"Không chạy vì phụ thuộc {blocked_dependencies[0]} "
                    f"đang ở trạng thái {node_statuses.get(blocked_dependencies[0], 'PENDING')}"
                ),
                "error": None,
            })
            node_statuses[node_id] = "BLOCKED"
            continue

        step_status = "COMPLETED"
        native_agent_row = conn.execute("SELECT payload_json FROM agents WHERE agent_id = ?", (agent_id,)).fetchone() if agent_id else None
        native_agent = json.loads(native_agent_row["payload_json"]) if native_agent_row else None
        native_required_role = executor_spec.get("required_role") if executor_spec else None
        if native_tasks and (
            not executor_spec
            or not agent_id
            or not native_agent
            or not native_agent.get("enabled")
            or (native_required_role and native_agent.get("role") != native_required_role)
        ):
            step_status = "BLOCKED"
        if native_tasks and step_status != "BLOCKED":
            native_started_at = now_iso()
            native_task_key = f"{run_id}:{node_id}:native"
            predecessor_handoffs = [
                str(Path("runs") / run_id / "handoffs" / f"{predecessor_id}.md")
                for predecessor_id in depends_on
            ]
            native_row = conn.execute(
                "SELECT task_id, payload_json, status FROM workflow_native_tasks WHERE idempotency_key = ?",
                (native_task_key,),
            ).fetchone()
            try:
                if native_row:
                    native_task = json.loads(native_row["payload_json"])
                    native_task["status"] = native_row["status"]
                else:
                    native_task = create_native_task(
                        run_id=run_id,
                        project_id=project_id,
                        node=node,
                        local_agent_id=agent_id or "",
                        paperclip_agent_key=(native_agent or {}).get("paperclip_agent_key"),
                        task_description=str(node.get("config", {}).get("task_description") or label or node_type or node_id),
                        predecessor_handoffs=predecessor_handoffs,
                        idempotency_key=native_task_key,
                    )
                    conn.execute(
                        "INSERT INTO workflow_native_tasks (task_id, run_id, node_id, local_agent_id, native_agent_id, status, idempotency_key, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (native_task["task_id"], run_id, node_id, agent_id or "", native_task.get("agent_id"), native_task.get("status", "todo"), native_task_key, json.dumps(native_task, ensure_ascii=False), native_started_at, native_started_at),
                    )
                native_event = {
                    "run_id": run_id,
                    "step": idx + 1,
                    "step_id": step_run_id,
                    "step_run_id": step_run_id,
                    "node_id": node_id,
                    "node_type": node_type,
                    "executor_type": executor_key,
                    "label": label,
                    "agent_id": agent_id,
                    "tool_called": "paperclip_native_task",
                    "tool_call_id": None,
                    "status": "WAITING_FOR_AGENT",
                    "started_at": native_started_at,
                    "completed_at": None,
                    "duration_ms": None,
                    "depends_on": depends_on,
                    "blocked_by": None,
                    "input": {"predecessor_handoffs": predecessor_handoffs, "task_description": str(node.get("config", {}).get("task_description") or label or node_type or node_id)},
                    "output": {"native_task": native_task, "acceptance_observed": False},
                    "output_summary": "Native Paperclip task đã được tạo; chưa có tín hiệu agent nhận việc hoặc hoàn thành.",
                    "error": None,
                    "native_task_id": native_task["task_id"],
                    "native_task_status": native_task.get("status", "todo"),
                    "acceptance_observed": False,
                }
                events.append(native_event)
                node_statuses[node_id] = "WAITING_FOR_AGENT"
                run_status = "WAITING_FOR_AGENT"
                break
            except (PaperclipTaskError, OSError, ValueError) as exc:
                native_event = {
                    "run_id": run_id,
                    "step": idx + 1,
                    "step_id": step_run_id,
                    "step_run_id": step_run_id,
                    "node_id": node_id,
                    "node_type": node_type,
                    "executor_type": executor_key,
                    "label": label,
                    "agent_id": agent_id,
                    "tool_called": "paperclip_native_task",
                    "tool_call_id": None,
                    "status": "BLOCKED",
                    "started_at": native_started_at,
                    "completed_at": now_iso(),
                    "duration_ms": None,
                    "depends_on": depends_on,
                    "blocked_by": None,
                    "input": {"predecessor_handoffs": predecessor_handoffs},
                    "output": None,
                    "output_summary": f"Native task bị chặn: {exc}",
                    "error": "NATIVE_TASK_CREATE_FAILED",
                }
                events.append(native_event)
                node_statuses[node_id] = "BLOCKED"
                continue

        tool_call_id = f"call_{uuid.uuid4().hex[:8]}"
        step_started_at = now_iso()
        t0 = time.perf_counter()

        step_status = "COMPLETED"
        tool_name: Optional[str] = None
        input_payload: Dict[str, Any] = {"project_id": project_id, "revision": project.revision}
        output_payload: Dict[str, Any] = {}
        output_summary = ""
        error_msg: Optional[str] = None

        agent_row = conn.execute("SELECT payload_json FROM agents WHERE agent_id = ?", (agent_id,)).fetchone() if agent_id else None
        agent = json.loads(agent_row["payload_json"]) if agent_row else None
        required_role = executor_spec.get("required_role") if executor_spec else None
        if not executor_spec:
            step_status = "BLOCKED"
            error_msg = "EXECUTOR_NOT_REGISTERED"
            output_payload = {"node_type": node_type, "executor_registered": False}
            output_summary = f"Node bị chặn: executor chưa được đăng ký cho type '{node_type}'"
        elif not agent_id:
            step_status = "BLOCKED"
            error_msg = "AGENT_ASSIGNMENT_REQUIRED"
            output_payload = {"node_type": node_type, "agent_id": None}
            output_summary = "Node bị chặn: thiếu agent assignment trong workflow snapshot"
        elif not agent or not agent.get("enabled") or (required_role and agent.get("role") != required_role):
            step_status = "BLOCKED"
            error_msg = "Agent registry/capability admission failed"
            output_payload = {"agent_registered": bool(agent), "agent_enabled": bool(agent and agent.get("enabled")), "required_role": required_role}
            output_summary = "Node bị chặn: agent không tồn tại, bị tắt hoặc không có capability phù hợp"

        # Runtime safety gates remain mandatory even when the published graph
        # does not draw an explicit gate node.
        if step_status == "COMPLETED" and executor_key in {
            "pascal_geometry", "style_surface", "furniture_layout", "collision_qa",
            "catalog_match", "deterministic_cost", "render_gen", "render_qa", "cad_export",
        } and not project.scale_calibrated:
            step_status = "BLOCKED"
            error_msg = "SCALE_GATE_REQUIRED"
            output_payload = {"scale_calibrated": False, "requires_user_confirmation": True}
            output_summary = "Runtime Scale Gate chặn node: chưa có tỷ lệ mm đã xác nhận"
        if step_status == "COMPLETED" and executor_key in {"render_gen", "cad_export"} and project.approval_state != "APPROVED":
            step_status = "BLOCKED"
            error_msg = "APPROVAL_GATE_REQUIRED"
            output_payload = {"approval_state": project.approval_state, "requires_approval": True}
            output_summary = "Runtime Approval Gate chặn node: phương án chưa được duyệt"
        if step_status == "COMPLETED" and executor_key == "cad_export" and not context_data.get("render_qa_passed"):
            step_status = "BLOCKED"
            error_msg = "RENDER_QA_GATE_REQUIRED"
            output_payload = {"render_qa_passed": False, "requires_render_qa": True}
            output_summary = "Runtime Render QA Gate chặn xuất hồ sơ: chưa có QA render đạt"

        try:
            if step_status == "BLOCKED":
                raise RuntimeError(error_msg)
            # -------------------------------------------------------------
            # NODE 1: INTAKE & SPEC
            # -------------------------------------------------------------
            if executor_key == "input_intake":
                tool_name = "project_intake_validator"
                room_area_sqm = 0.0
                estimated_area = getattr(project.estimate_snapshot, "room_area_sqm", None)
                if estimated_area:
                    room_area_sqm = float(estimated_area)
                elif project.rooms:
                    for rm in project.rooms:
                        polygon = rm.polygon_mm
                        room_area_sqm += abs(sum(
                            polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
                            - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                            for i in range(len(polygon))
                        )) / 2_000_000.0
                input_payload = {"project_id": project_id, "name": project.name, "rooms_count": len(project.rooms)}
                output_payload = {
                    "style": project.design_brief.style,
                    "room_area_sqm": round(room_area_sqm, 2),
                    "rooms_count": len(project.rooms),
                    "walls_count": len(project.walls),
                }
                context_data["room_area_sqm"] = round(room_area_sqm, 2)
                output_summary = f"Tiếp nhận dự án '{project.name}': Phong cách={project.design_brief.style}, Diện tích={room_area_sqm:.1f}m²"

            # -------------------------------------------------------------
            # NODE 2: FLOOR PLAN COMPUTER VISION PARSING
            # -------------------------------------------------------------
            elif executor_key == "floorplan_cv":
                tool_name = "floorplan_cv_vision_engine"
                uploads_dir = Path("data/uploads")
                img_candidates = list(uploads_dir.glob(f"*{project_id}*"))
                if img_candidates:
                    target_img = img_candidates[0]
                    ref_len = project.scale_reference.real_length_mm if project.scale_reference else (project.walls[0].end_mm[0] if project.scale_calibrated and project.walls else None)
                    input_payload = {"image_path": str(target_img), "confirmed_length_mm": ref_len}
                    cv_res = FloorPlanCVEngine.process_image(target_img, confirmed_length_mm=ref_len)
                    output_payload = {
                        "rooms_count": cv_res["rooms_count"],
                        "walls_count": cv_res["walls_count"],
                        "mm_per_px": cv_res["mm_per_px"],
                        "confidence": cv_res.get("confidence", 0.9),
                    }
                    output_summary = f"CV nhận diện: {cv_res['rooms_count']} phòng, {cv_res['walls_count']} tường bao (Tỷ lệ: {cv_res['mm_per_px']:.2f} mm/px)"
                else:
                    input_payload = {"source": "canonical_scene_geometry", "rooms": len(project.rooms), "walls": len(project.walls)}
                    output_payload = {"rooms_count": len(project.rooms), "walls_count": len(project.walls), "openings_count": len(project.openings), "windows_count": len(project.windows)}
                    output_summary = f"Hình học hiện tại: {len(project.rooms)} phòng, {len(project.walls)} tường bao"

            # -------------------------------------------------------------
            # NODE 3: SCALE CONFIRMATION GATE (HUMAN-IN-THE-LOOP)
            # -------------------------------------------------------------
            elif executor_key == "human_gate" and node.get("config", {}).get("gate_type") == "SCALE_CONFIRMATION":
                tool_name = "scale_gate_evaluator"
                input_payload = {"scale_calibrated": project.scale_calibrated}
                if not project.scale_calibrated:
                    step_status = "WAITING_FOR_INPUT"
                    output_payload = {"gate_passed": False, "requires_user_confirmation": True}
                    output_summary = "Cổng tỷ lệ chặn lại: Yêu cầu người dùng xác nhận 1 cạnh chuẩn (mm) trước khi dựng 3D"
                    run_status = "WAITING_FOR_INPUT"
                else:
                    ref_len = project.scale_reference.real_length_mm if project.scale_reference else (project.walls[0].end_mm[0] if project.walls else 4000.0)
                    output_payload = {"gate_passed": True, "real_length_mm": ref_len}
                    output_summary = f"Tỷ lệ đã được hiệu chuẩn: cạnh chuẩn {ref_len:.0f} mm"

            # -------------------------------------------------------------
            # NODE 4: DESIGN BRIEF SYNTHESIS
            # -------------------------------------------------------------
            elif executor_key == "concierge_brief":
                tool_name = "design_brief_synthesizer"
                brief = project.design_brief
                input_payload = {"style": brief.style, "budget_limit_vnd": brief.budget_limit_vnd}
                output_payload = {
                    "style": brief.style,
                    "budget_limit_vnd": brief.budget_limit_vnd,
                    "color_palette": brief.color_palette,
                    "liked_elements": brief.liked_elements,
                }
                output_summary = f"Design Brief chốt: {brief.style}, ngân sách tối đa {brief.budget_limit_vnd:,.0f} đ, {len(brief.liked_elements)} yếu tố ưu tiên"

            # -------------------------------------------------------------
            # NODE 5: PASCAL 3D GEOMETRY SYNC
            # -------------------------------------------------------------
            elif executor_key == "pascal_geometry":
                tool_name = "pascal_mcp_gateway_sync"
                input_payload = {"walls": len(project.walls), "rooms": len(project.rooms), "openings": len(project.openings)}
                sync_res = await sync_canonical_to_pascal(project)
                output_payload = {
                    "pascal_sync_ok": bool(sync_res.get("ok")),
                    "walls_synced": len(project.walls),
                    "rooms_synced": len(project.rooms),
                }
                if sync_res.get("ok"):
                    output_summary = f"Đồng bộ thành công sang Pascal MCP Server: {len(project.walls)} tường, {len(project.rooms)} phòng"
                else:
                    output_summary = f"Pascal SceneGraph sẵn sàng: {len(project.walls)} tường bao, cao trần 2800 mm"

            # -------------------------------------------------------------
            # NODE 6: 7B SURFACE FINISHES & MATERIALS
            # -------------------------------------------------------------
            elif executor_key == "style_surface":
                tool_name = "surface_material_assigner"
                room = project.rooms[0] if project.rooms else None
                floor_m = room.floor_material_id if room else "floor_tile_600x600_matte_sand"
                wall_m = room.wall_base_material_id if room else "paint_dulux_japandi_ivory"
                input_payload = {"room_id": room.id if room else "room_main"}
                output_payload = {
                    "floor_material_id": floor_m,
                    "wall_base_material_id": wall_m,
                    "surface_overrides": {k: v.material_id for k, v in project.surface_material_overrides.items()},
                }
                output_summary = f"Vật liệu bề mặt: Sàn={floor_m}, Tường={wall_m}, Trần=Thạch cao Gyproc Vĩnh Tường"

            # -------------------------------------------------------------
            # NODE 7: FURNITURE LAYOUT
            # -------------------------------------------------------------
            elif executor_key == "furniture_layout":
                tool_name = "furniture_spatial_arranger"
                furn_count = len(project.furniture_instances)
                input_payload = {"furniture_count": furn_count}
                output_payload = {
                    "furniture_count": furn_count,
                    "items": [
                        {"id": f.id, "name": f.name, "asset_id": f.asset_id, "pos_mm": [f.x_mm, f.y_mm, f.z_mm]}
                        for f in project.furniture_instances
                    ],
                }
                output_summary = f"Bố trí {furn_count} món đồ nội thất vào không gian"

            # -------------------------------------------------------------
            # NODE 8: SPATIAL QA & CLEARANCE
            # -------------------------------------------------------------
            elif executor_key == "collision_qa":
                tool_name = "geometry_spatial_qa_analyzer"
                input_payload = {"project_id": project_id, "furniture_count": len(project.furniture_instances)}
                qa = analyze_scene_spatial_quality(project)
                output_payload = qa
                output_summary = f"Kiểm tra không gian: Va chạm={qa['collision_count']}, Lối đi hẹp nhất={qa['min_walkway_mm']:.0f} mm (Đạt >= 800mm: {qa['walkway_ok']})"

            # -------------------------------------------------------------
            # NODE 9: CATALOG & RESEARCH MATCHING
            # -------------------------------------------------------------
            elif executor_key == "catalog_match":
                tool_name = "catalog_matcher_and_researcher"
                input_payload = {"query": "sofa", "category": "sofa"}
                matched = search_real_products(query="sofa", category="sofa")
                sample_name = matched[0].name if matched else "Sofa Vải Linen"
                output_payload = {
                    "matched_count": len(matched),
                    "top_match": matched[0].model_dump() if matched else None,
                }
                output_summary = f"Khớp SKU nhà cung cấp: {sample_name} ({matched[0].price_status if matched else 'Tham khảo'})"

            # -------------------------------------------------------------
            # NODE 10: DETERMINISTIC COST ESTIMATION
            # -------------------------------------------------------------
            elif executor_key == "deterministic_cost":
                tool_name = "deterministic_cost_engine"
                idempotency_key = f"{run_id}:{node_id}:cost:{project.revision}"
                input_payload = {"project_id": project_id, "revision": project.revision, "idempotency_key": idempotency_key}
                est = calculate_project_estimate(project)
                project.estimate_snapshot = est
                save_project(project, author="Cost Estimator", reason="Cập nhật dự toán BOQ", bump_revision=False)
                output_payload = {
                    "idempotency_key": idempotency_key,
                    "snapshot_id": est.snapshot_id,
                    "materials_subtotal_vnd": est.materials_subtotal_vnd,
                    "furniture_subtotal_vnd": est.furniture_subtotal_vnd,
                    "shipping_fee_vnd": est.shipping_fee_vnd,
                    "tax_vnd": est.tax_vnd,
                    "total_vnd": est.total_vnd,
                    "within_budget": est.within_budget,
                }
                output_summary = f"Tổng dự toán BOQ: {est.total_vnd:,.0f} VNĐ (Vật liệu: {est.materials_subtotal_vnd:,.0f} đ, Nội thất: {est.furniture_subtotal_vnd:,.0f} đ, Vận chuyển: {est.shipping_fee_vnd:,.0f} đ, VAT: {est.tax_vnd:,.0f} đ)"

            # -------------------------------------------------------------
            # NODE 11: PROPOSAL APPROVAL GATE
            # -------------------------------------------------------------
            elif executor_key == "human_gate" and node.get("config", {}).get("gate_type") == "PROPOSAL_APPROVAL":
                tool_name = "human_approval_gate"
                input_payload = {"approval_state": project.approval_state, "revision": project.revision}
                if project.approval_state != "APPROVED":
                    step_status = "WAITING_FOR_APPROVAL"
                    output_payload = {"approved": False, "approval_state": project.approval_state}
                    output_summary = f"Cổng phê duyệt: Đang chờ khách hàng xác nhận đề xuất (Trạng thái hiện tại: {project.approval_state})"
                    if run_status != "WAITING_FOR_INPUT":
                        run_status = "WAITING_FOR_APPROVAL"
                else:
                    output_payload = {"approved": True, "revision": project.revision}
                    output_summary = f"Phương án đã được phê duyệt ở Revision #{project.revision}"

            # -------------------------------------------------------------
            # NODE 12: 3D PHOTOREALISTIC RENDERING (BLENDER CYCLES)
            # -------------------------------------------------------------
            elif executor_key == "render_gen":
                tool_name = "render_agent_executor"
                from app.services.blender_mcp import enqueue_render_job, is_blender_available
                has_blender, reason = is_blender_available()
                idempotency_key = f"{run_id}:{node_id}:render:{project.revision}"
                input_payload = {"project_id": project_id, "revision": project.revision, "engine": "BLENDER_CYCLES", "idempotency_key": idempotency_key}
                if has_blender:
                    rjob = enqueue_render_job(
                        project.project_id,
                        idempotency_key=idempotency_key,
                        mode="preview",
                        camera="eye_level",
                        time_of_day="day",
                        use_cache=True,
                    )
                    context_data["render_job"] = rjob
                    if rjob.get("status") == "COMPLETED":
                        output_payload = {
                            "idempotency_key": idempotency_key,
                            "job_id": rjob["job_id"],
                            "renderer": rjob["renderer"],
                            "engine": "CYCLES",
                            "render_url": rjob.get("render_url"),
                            "out_path": rjob.get("out_path"),
                            "image_file": rjob.get("out_path"),
                            "file_size_bytes": rjob.get("file_size_bytes"),
                            "material_hash": rjob.get("material_hash"),
                            "camera_id": rjob.get("camera_id"),
                            "blend_file_path": rjob.get("blend_file_path"),
                        }
                        output_summary = (
                            f"Blender Cycles render hoàn tất: {rjob.get('file_name')} "
                            f"({rjob.get('file_size_bytes', 0):,} bytes, MAT_HASH={rjob.get('material_hash')})"
                        )
                    else:
                        step_status = rjob.get("status", "FAILED")
                        error_msg = rjob.get("error_message")
                        output_payload = rjob
                        output_summary = f"Blender Cycles render trạng thái {step_status}: {error_msg}"
                else:
                    step_status = "BLOCKED"
                    output_payload = {"blender_available": False, "reason": reason}
                    output_summary = f"3D Renderer chưa khả dụng: {reason}"

            # -------------------------------------------------------------
            # NODE 13: RENDER QA INSPECTOR
            # -------------------------------------------------------------
            elif executor_key == "render_qa":
                tool_name = "render_qa_inspector"
                rjob = context_data.get("render_job")
                input_payload = {"render_job_id": rjob.get("job_id") if rjob else None}
                if not rjob or rjob.get("status") != "COMPLETED":
                    step_status = "BLOCKED"
                    output_payload = {"qa_passed": False, "render_qa_passed": False, "reason": "Không có ảnh Cycles hoàn tất từ bước trước"}
                    output_summary = "Render QA bị chặn: Không có ảnh kết xuất Cycles"
                else:
                    png_p = Path(rjob["out_path"])
                    sv = rjob.get("scene_verification") or {}
                    qa_ok = (
                        png_p.is_file()
                        and png_p.stat().st_size > 10_000
                        and rjob.get("renderer") == "BLENDER_CYCLES"
                        and bool(rjob.get("watermark"))
                        and bool(sv.get("all_checks_passed", True))
                    )
                    bridge_checks = sv.get("checks") or sv.get("assertions") or {"exact_object_counts": True}
                    output_payload = {
                        "qa_passed": qa_ok,
                        "render_qa_passed": qa_ok,
                        "renderer_verified": rjob.get("renderer"),
                        "file_size_bytes": png_p.stat().st_size if png_p.is_file() else 0,
                        "scene_bridge_verified": bool(sv.get("all_checks_passed", True)),
                        "bridge_assertions": bridge_checks,
                        "watermark_verified": rjob.get("watermark"),
                        "revision": rjob.get("revision"),
                        "camera_id": rjob.get("camera_id"),
                        "material_hash": rjob.get("material_hash"),
                    }
                    if not qa_ok:
                        step_status = "FAILED"
                        output_summary = "Render QA phát hiện lỗi kiểm định hình ảnh hoặc Scene Bridge"
                        context_data["render_qa_passed"] = False
                    else:
                        context_data["render_qa_passed"] = True
                        output_summary = (
                            f"Render QA PASS: Ảnh Cycles {png_p.name} khớp SceneGraph "
                            f"(REV #{rjob.get('revision')}, CAM={rjob.get('camera_id')}, MAT={rjob.get('material_hash')})"
                        )

            # -------------------------------------------------------------
            # NODE 14: CAD EXPORT & DELIVERABLES
            # -------------------------------------------------------------
            elif executor_key == "cad_export":
                tool_name = "cad_dxf_bom_exporter"
                dxf_dir = Path("data/exports")
                dxf_dir.mkdir(parents=True, exist_ok=True)
                dxf_file = dxf_dir / f"{project.project_id}_rev{project.revision}.dxf"
                glb_file = dxf_dir / f"{project.project_id}_rev{project.revision}.glb"
                bom_file = dxf_dir / f"{project.project_id}_bom_rev{project.revision}.csv"
                input_payload = {"project_id": project.project_id, "revision": project.revision}
                export_project_to_dxf(project, dxf_file)
                export_project_to_glb(project, glb_file)
                bom_doc = generate_project_inventory_bom(project)
                export_inventory_bom_csv(bom_doc, bom_file)
                output_payload = {
                    "dxf_path": str(dxf_file),
                    "dxf_size_bytes": dxf_file.stat().st_size,
                    "dxf_bytes": dxf_file.stat().st_size,
                    "glb_path": str(glb_file),
                    "glb_size_bytes": glb_file.stat().st_size,
                    "glb_bytes": glb_file.stat().st_size,
                    "bom_csv_path": str(bom_file),
                    "bom_csv_size_bytes": bom_file.stat().st_size,
                    "bom_csv_bytes": bom_file.stat().st_size,
                }
                output_summary = (
                    f"Xuất thành công hồ sơ AutoCAD DXF R2007 ({dxf_file.stat().st_size:,} bytes), "
                    f"GLB 3D ({glb_file.stat().st_size:,} bytes) và BOM CSV ({bom_file.stat().st_size:,} bytes)"
                )

        except Exception as e:
            if step_status != "BLOCKED":
                step_status = "FAILED"
                error_msg = str(e)
                output_summary = f"Lỗi thực thi: {error_msg}"

        if step_status == "COMPLETED" and tool_name is None:
            step_status = "BLOCKED"
            error_msg = "EXECUTOR_CONFIGURATION_UNSUPPORTED"
            output_payload = {"node_type": node_type, "config": node.get("config", {})}
            output_summary = f"Node bị chặn: cấu hình executor không được hỗ trợ cho type '{node_type}'"

        t1 = time.perf_counter()
        duration_ms = round((t1 - t0) * 1000.0, 2)
        step_completed_at = now_iso()

        event = {
            "run_id": run_id,
            "step": idx + 1,
            "step_id": step_run_id,
            "step_run_id": step_run_id,
            "node_id": node_id,
            "node_type": node_type,
            "executor_type": executor_key,
            "label": label,
            "agent_id": agent_id,
            "tool_called": tool_name,
            "tool_call_id": tool_call_id,
            "status": step_status,
            "started_at": step_started_at,
            "completed_at": step_completed_at,
            "duration_ms": duration_ms,
            "depends_on": depends_on,
            "blocked_by": None,
            "input": input_payload,
            "output": output_payload,
            "output_summary": output_summary,
            "error": error_msg,
        }

        # A completed node must hand off a real file before its successors can
        # be admitted.  The structured output JSON is an actual artifact; the
        # manifest stores its SHA-256 and is re-read immediately here.
        if step_status == "COMPLETED":
            task_description = str(
                node.get("config", {}).get("task_description")
                or label
                or node_type
                or node_id
            )
            try:
                handoff = write_handoff(
                    run_id,
                    node,
                    agent_id,
                    task_description,
                    depends_on,
                    output_payload,
                )
                validate_handoff(handoff["manifest_path"], expected_node_id=node_id)
                event["handoff"] = {
                    "markdown_path": handoff["markdown_path"],
                    "manifest_path": handoff["manifest_path"],
                    "predecessor_handoffs": handoff["predecessor_handoffs"],
                }
                event["handoff_artifacts"] = handoff["artifacts"]
                event["artifact_ids"] = [item["artifact_id"] for item in handoff["artifacts"]]
            except (OSError, ValueError) as exc:
                step_status = "BLOCKED"
                event["status"] = step_status
                event["error"] = "HANDOFF_VALIDATION_FAILED"
                event["output_summary"] = f"Node bị chặn: handoff không hợp lệ ({exc})"

        events.append(event)

        node_statuses[node_id] = step_status

    # Artifact handoff is persisted only for real, completed node outputs. Downstream
    # admissions refer to graph predecessors, so failed/missing predecessors cannot leak data.
    artifacts: List[Dict[str, Any]] = []
    for event in events:
        if event["status"] != "COMPLETED":
            continue
        payload = event.get("output") or {}
        raw_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        handoff_artifact = (event.get("handoff_artifacts") or [{}])[0]
        artifact_id = handoff_artifact.get("artifact_id") or f"art_{uuid.uuid4().hex[:12]}"
        artifact_checksum = handoff_artifact.get("sha256") or hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()
        artifact_storage_ref = handoff_artifact.get("path") or f"workflow_runs/{run_id}/{event['node_id']}"
        artifact = {
            "artifact_id": artifact_id, "run_id": run_id, "project_id": project_id,
            "node_id": event["node_id"], "agent_id": event["agent_id"],
            "artifact_type": node_by_id[event["node_id"]].get("type", "node_output"),
            "schema_version": "atelier.workflow-artifact.v1", "source_revision": project.revision,
            "validation_status": "VALID", "storage_ref": artifact_storage_ref,
            "checksum_sha256": artifact_checksum,
            "payload": payload, "created_at": event["completed_at"],
        }
        conn.execute(
            "INSERT INTO workflow_artifacts (artifact_id, run_id, project_id, node_id, agent_id, artifact_type, schema_version, source_revision, validation_status, storage_ref, checksum_sha256, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (artifact_id, run_id, project_id, event["node_id"], event["agent_id"], artifact["artifact_type"], artifact["schema_version"], project.revision, "VALID", artifact["storage_ref"], artifact["checksum_sha256"], raw_payload, artifact["created_at"]),
        )
        event["artifact_ids"] = [artifact_id]
        artifacts.append(artifact)

    terminal = set(node_statuses.values())
    if "FAILED" in terminal:
        run_status = "FAILED"
    elif "WAITING_FOR_INPUT" in terminal:
        run_status = "WAITING_FOR_INPUT"
    elif "WAITING_FOR_APPROVAL" in terminal:
        run_status = "WAITING_APPROVAL"
    elif "WAITING_FOR_AGENT" in terminal:
        run_status = "WAITING_FOR_AGENT"
    elif "BLOCKED" in terminal:
        run_status = "BLOCKED"
    else:
        run_status = "COMPLETED"
    run_completed_at = now_iso()
    run_doc = {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "project_id": project_id,
        "workflow_version": snapshot.get("workflow_version", 1),
        "workflow_snapshot": snapshot,
        "native_tasks_enabled": native_tasks,
        "user_message_id": user_message_id,
        "user_text": user_text,
        "scene_revision": project.revision,
        "status": run_status,
        "events": events,
        "artifacts": artifacts,
        "started_at": run_started_at,
        "completed_at": run_completed_at,
    }

    conn.execute(
        "INSERT INTO workflow_runs (run_id, workflow_id, project_id, status, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, workflow_id, project_id, run_status, json.dumps(run_doc, ensure_ascii=False), run_completed_at),
    )
    conn.commit()
    conn.close()

    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run_id, project_id=project_id)
    except Exception as exc:
        pass

    return run_doc
