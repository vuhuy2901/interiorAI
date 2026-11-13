"""Small runtime contracts shared by workflow runs.

The published workflow is the only source of routing truth.  This module keeps
the runtime deliberately small: graph validation, edge-based readiness and the
per-run handoff files used as the admission barrier between nodes.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app import db


TERMINAL_SUCCESS = {"COMPLETED", "SKIPPED"}
TERMINAL_FAILURE = {"FAILED", "BLOCKED", "CANCELLED"}
_SAFE_NODE_ID = re.compile(r"^[A-Za-z0-9._-]+$")


def workflow_snapshot(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Copy only run-relevant workflow data so later edits cannot change a run."""
    snapshot = {
        "workflow_id": workflow.get("workflow_id"),
        "workflow_version": workflow.get("version", 1),
        "name": workflow.get("name"),
        "nodes": [],
        "edges": deepcopy(workflow.get("edges") or []),
    }
    for node in workflow.get("nodes") or []:
        snapshot["nodes"].append({
            "id": node.get("id"),
            "type": node.get("type"),
            "label": node.get("label"),
            "agent_id": node.get("agent_id"),
            "enabled": node.get("enabled", True),
            "config": deepcopy(node.get("config") or {}),
            "inputs": deepcopy(node.get("inputs") or node.get("input_types") or []),
            "outputs": deepcopy(node.get("outputs") or node.get("output_types") or []),
        })
    return snapshot


def _graph(snapshot: Dict[str, Any]) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]], Dict[str, List[str]]]:
    nodes = snapshot.get("nodes") or []
    by_id: Dict[str, Dict[str, Any]] = {}
    for node in nodes:
        node_id = node.get("id")
        if not node_id or not _SAFE_NODE_ID.fullmatch(str(node_id)) or node_id in by_id:
            raise ValueError("node IDs must be unique, non-empty and path-safe")
        by_id[node_id] = node
    predecessors = {node_id: [] for node_id in by_id}
    successors = {node_id: [] for node_id in by_id}
    for edge in snapshot.get("edges") or []:
        source, target = edge.get("source"), edge.get("target")
        if source not in by_id or target not in by_id:
            raise ValueError(f"edge references unknown node: {source}->{target}")
        if source == target:
            raise ValueError(f"workflow graph contains a self-cycle: {source}")
        if source not in predecessors[target]:
            predecessors[target].append(source)
            successors[source].append(target)
    indegree = {node_id: len(deps) for node_id, deps in predecessors.items()}
    queue = [node_id for node_id, degree in indegree.items() if degree == 0]
    visited = 0
    while queue:
        current = queue.pop(0)
        visited += 1
        for target in successors[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if visited != len(by_id):
        raise ValueError("workflow graph contains a cycle")
    return by_id, predecessors, successors


def validate_workflow_snapshot(snapshot: Dict[str, Any], agent_ids: Optional[Iterable[str]] = None) -> List[str]:
    """Return save-time validation errors without changing the published graph."""
    errors: List[str] = []
    by_id: Dict[str, Dict[str, Any]] = {
        str(node.get("id")): node
        for node in (snapshot.get("nodes") or [])
        if node.get("id")
    }
    try:
        by_id, predecessors, successors = _graph(snapshot)
    except ValueError as exc:
        errors.append(str(exc))
        predecessors = {node_id: [] for node_id in by_id}
        successors = {node_id: [] for node_id in by_id}
    known_agents = set(agent_ids or [])
    if known_agents:
        for node in by_id.values():
            if not node.get("agent_id"):
                errors.append(f"node {node['id']} is missing agent_id")
            elif node["agent_id"] not in known_agents:
                errors.append(f"node {node['id']} is missing agent capability: unknown agent {node['agent_id']}")
    if len(by_id) > 1:
        for node_id in by_id:
            if not predecessors[node_id] and not successors[node_id]:
                errors.append(f"node {node_id} is orphaned")
    for node_id, node in by_id.items():
        required_inputs = set(node.get("inputs") or [])
        if not required_inputs:
            continue
        produced = set()
        for predecessor_id in predecessors[node_id]:
            produced.update(by_id[predecessor_id].get("outputs") or [])
        missing = sorted(required_inputs - produced)
        if missing:
            errors.append(f"node {node_id} input/output mismatch: missing {', '.join(missing)}")
    return errors


def get_ready_nodes(snapshot: Dict[str, Any], node_status: Dict[str, str]) -> List[str]:
    """Return nodes whose ALL edge predecessors are satisfied.

    ``SKIPPED`` satisfies a join.  If every predecessor is skipped, the join is
    marked ``SKIPPED`` in the supplied state and is not dispatched.  A failed
    predecessor blocks only its dependent branch; unrelated branches remain
    eligible on the next call.
    """
    by_id, predecessors, _ = _graph(snapshot)
    for node_id, node in by_id.items():
        if node_id not in node_status and node.get("enabled", True) is False:
            node_status[node_id] = "SKIPPED"

    ready: List[str] = []
    for node_id, deps in predecessors.items():
        if node_id in node_status:
            continue
        if any(node_status.get(dep) in TERMINAL_FAILURE for dep in deps):
            node_status[node_id] = "BLOCKED"
            continue
        if not deps:
            ready.append(node_id)
            continue
        dependency_states = [node_status.get(dep) for dep in deps]
        if all(state in TERMINAL_SUCCESS for state in dependency_states):
            if all(state == "SKIPPED" for state in dependency_states):
                node_status[node_id] = "SKIPPED"
            else:
                ready.append(node_id)
    return ready


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(content, encoding="utf-8")
    os.replace(temporary, path)


def write_handoff(
    run_id: str,
    node: Dict[str, Any],
    agent_id: Optional[str],
    task_description: str,
    predecessor_ids: List[str],
    output: Dict[str, Any],
    *,
    status: str = "COMPLETED",
) -> Dict[str, Any]:
    """Write and immediately validate one node's markdown + JSON handoff."""
    node_id = str(node.get("id"))
    if not _SAFE_NODE_ID.fullmatch(node_id):
        raise ValueError(f"unsafe node_id for handoff: {node_id}")
    handoff_dir = db.DATA_DIR / "runs" / run_id / "handoffs"
    artifact_path = handoff_dir / f"{node_id}.artifact.json"
    manifest_path = handoff_dir / f"{node_id}.json"
    markdown_path = handoff_dir / f"{node_id}.md"
    raw_output = json.dumps(output or {}, ensure_ascii=False, sort_keys=True, indent=2, default=str)
    _atomic_write(artifact_path, raw_output + "\n")
    artifact = {
        "artifact_id": f"art_{uuid.uuid4().hex[:12]}",
        "path": str(artifact_path),
        "sha256": _sha256(artifact_path),
        "type": "node_output_json",
    }
    manifest = {
        "status": status,
        "run_id": run_id,
        "node_id": node_id,
        "agent_id": agent_id,
        "task_description": task_description,
        "predecessor_handoffs": [str(handoff_dir / f"{predecessor_id}.md") for predecessor_id in predecessor_ids],
        "artifacts": [artifact],
        "writer_node_id": node_id,
    }
    _atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    markdown = "\n".join([
        f"# Handoff: {node_id}",
        f"- Workflow Run ID: {run_id}",
        f"- Node ID: {node_id}",
        f"- Agent: {agent_id or 'UNASSIGNED'}",
        f"- Task: {task_description}",
        f"- Input handoffs: {', '.join(manifest['predecessor_handoffs']) or 'none'}",
        f"- Result status: {status}",
        f"- Output artifact: {artifact['path']}",
        f"- Artifact SHA-256: {artifact['sha256']}",
    ]) + "\n"
    _atomic_write(markdown_path, markdown)
    validate_handoff(manifest_path, expected_node_id=node_id)
    manifest["manifest_path"] = str(manifest_path)
    manifest["markdown_path"] = str(markdown_path)
    return manifest


def validate_handoff(manifest_path: Path | str, *, expected_node_id: Optional[str] = None) -> Dict[str, Any]:
    path = Path(manifest_path)
    if not path.is_file():
        raise ValueError(f"handoff manifest missing: {path}")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"handoff manifest is not valid JSON: {path}") from exc
    if manifest.get("status") != "COMPLETED":
        raise ValueError(f"handoff status is not COMPLETED: {manifest.get('status')}")
    if expected_node_id and manifest.get("node_id") != expected_node_id:
        raise ValueError("handoff node_id does not match requested node")
    if manifest.get("writer_node_id") != manifest.get("node_id"):
        raise ValueError("handoff writer is not the node owner")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError("handoff has no artifacts")
    for artifact in artifacts:
        artifact_path = Path(artifact.get("path", ""))
        if not artifact_path.is_file():
            raise ValueError(f"artifact missing: {artifact_path}")
        actual_hash = _sha256(artifact_path)
        if actual_hash != artifact.get("sha256"):
            raise ValueError(f"artifact hash mismatch: {artifact_path}")
    return manifest


def materialize_native_handoff(
    run_id: str,
    node_id: str,
    agent_id: Optional[str],
    document_body: str,
) -> Dict[str, Any]:
    """Mirror a real Paperclip handoff document into the local run contract."""
    if not _SAFE_NODE_ID.fullmatch(node_id):
        raise ValueError(f"unsafe node_id for handoff: {node_id}")
    blocks = re.findall(r"```json\s*(.*?)\s*```", document_body or "", flags=re.DOTALL | re.IGNORECASE)
    if not blocks:
        raise ValueError("Paperclip handoff has no JSON block")
    try:
        agent_payload = json.loads(blocks[-1])
    except json.JSONDecodeError as exc:
        raise ValueError("Paperclip handoff JSON block is invalid") from exc
    declared = str(agent_payload.get("status") or "").lower()
    status = "COMPLETED" if declared in {"completed", "complete", "done", "pass"} else "WAITING_FOR_INPUT" if declared in {"needs_input", "waiting_for_input", "blocked"} else "WAITING_FOR_AGENT"
    handoff_dir = db.DATA_DIR / "runs" / run_id / "handoffs"
    markdown_path = handoff_dir / f"{node_id}.md"
    agent_json_path = handoff_dir / f"{node_id}.agent.json"
    manifest_path = handoff_dir / f"{node_id}.json"
    _atomic_write(markdown_path, document_body)
    agent_json_text = json.dumps(agent_payload, ensure_ascii=False, indent=2) + "\n"
    _atomic_write(agent_json_path, agent_json_text)
    artifact_sha256 = _sha256(agent_json_path)
    artifact_identity = hashlib.sha256(
        f"{run_id}\0{node_id}\0{artifact_sha256}".encode("utf-8")
    ).hexdigest()[:12]
    artifact = {
        # A native document may be observed by every reconciliation pass. Its
        # artifact identity must remain stable while the verified content is
        # unchanged so a restart cannot manufacture duplicate artifacts.
        "artifact_id": f"art_{artifact_identity}",
        "path": str(agent_json_path),
        "sha256": artifact_sha256,
        "type": "paperclip_handoff_json",
    }
    manifest = {
        "status": status,
        "run_id": run_id,
        "node_id": node_id,
        "agent_id": agent_id,
        "source": "paperclip_issue_document",
        "artifacts": [artifact],
        "writer_node_id": node_id,
        "paperclip_document": True,
    }
    _atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    # Validate file existence and hash for every state. Completion admission is
    # intentionally stricter and is performed only for COMPLETED manifests.
    loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
    if _sha256(agent_json_path) != loaded["artifacts"][0]["sha256"]:
        raise ValueError("materialized Paperclip artifact hash mismatch")
    if status == "COMPLETED":
        validate_handoff(manifest_path, expected_node_id=node_id)
    manifest["manifest_path"] = str(manifest_path)
    manifest["markdown_path"] = str(markdown_path)
    manifest["agent_payload"] = agent_payload
    return manifest
