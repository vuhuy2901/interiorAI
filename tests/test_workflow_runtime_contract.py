from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
from app.services.agent_orchestrator_engine import execute_real_workflow_run  # noqa: E402
from app.services.workflow_runtime import (  # noqa: E402
    get_ready_nodes,
    materialize_native_handoff,
    validate_handoff,
    validate_workflow_snapshot,
    workflow_snapshot,
    write_handoff,
)


def e(source: str, target: str) -> dict:
    return {"source": source, "target": target}


def n(node_id: str, agent_id: str = "agent_a", **extra) -> dict:
    return {"id": node_id, "type": "test", "agent_id": agent_id, **extra}


def test_snapshot_is_immutable_for_later_workflow_edits():
    workflow = {"workflow_id": "wf", "version": 4, "nodes": [n("old", "agent_a")], "edges": []}
    snapshot = workflow_snapshot(workflow)
    workflow["nodes"][0]["id"] = "renamed"
    workflow["nodes"][0]["agent_id"] = "agent_b"
    assert snapshot["workflow_version"] == 4
    assert snapshot["nodes"][0]["id"] == "old"
    assert snapshot["nodes"][0]["agent_id"] == "agent_a"


def test_ready_nodes_requires_all_predecessors():
    snapshot = {"nodes": [n("a"), n("b"), n("join")], "edges": [e("a", "join"), e("b", "join")]}
    state = {"a": "COMPLETED", "b": "RUNNING"}
    assert get_ready_nodes(snapshot, state) == []
    state["b"] = "COMPLETED"
    assert get_ready_nodes(snapshot, state) == ["join"]


def test_skipped_predecessors_satisfy_join_and_all_skipped_skips_join():
    snapshot = {"nodes": [n("a"), n("b"), n("join")], "edges": [e("a", "join"), e("b", "join")]}
    state = {"a": "SKIPPED", "b": "COMPLETED"}
    assert get_ready_nodes(snapshot, state) == ["join"]
    state = {"a": "SKIPPED", "b": "SKIPPED"}
    assert get_ready_nodes(snapshot, state) == []
    assert state["join"] == "SKIPPED"


def test_failed_branch_blocks_join_without_blocking_sibling():
    snapshot = {
        "nodes": [n("root"), n("failed"), n("sibling"), n("join")],
        "edges": [e("root", "failed"), e("root", "sibling"), e("failed", "join"), e("sibling", "join")],
    }
    state = {"root": "COMPLETED", "failed": "FAILED"}
    assert get_ready_nodes(snapshot, state) == ["sibling"]
    state["sibling"] = "COMPLETED"
    assert get_ready_nodes(snapshot, state) == []
    assert state["join"] == "BLOCKED"


def test_handoff_requires_existing_artifact_and_matching_hash(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    manifest = write_handoff("run_1", n("lighting"), "agent_a", "Pick lighting", ["geometry"], {"ok": True})
    checked = validate_handoff(manifest["manifest_path"], expected_node_id="lighting")
    assert checked["status"] == "COMPLETED"
    artifact_path = Path(checked["artifacts"][0]["path"])
    artifact_path.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="hash mismatch"):
        validate_handoff(manifest["manifest_path"], expected_node_id="lighting")


def test_native_handoff_artifact_identity_is_stable_for_same_verified_content(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    document = """# Handoff\n\n```json\n{\"status\": \"completed\", \"artifacts\": [\"scene.json\"]}\n```\n"""
    first = materialize_native_handoff("run_stable", "floorplan", "agent_floorplan", document)
    second = materialize_native_handoff("run_stable", "floorplan", "agent_floorplan", document)
    assert first["artifacts"][0]["artifact_id"] == second["artifacts"][0]["artifact_id"]
    assert first["artifacts"][0]["sha256"] == second["artifacts"][0]["sha256"]


def test_save_validation_rejects_cycle_orphan_agent_and_io_mismatch():
    snapshot = {
        "nodes": [
            n("a", "missing", outputs=["geometry"]),
            n("b", "agent_a", inputs=["lighting"]),
            n("orphan", "agent_a"),
        ],
        "edges": [e("a", "b"), e("b", "a")],
    }
    errors = validate_workflow_snapshot(snapshot, agent_ids={"agent_a"})
    assert any("cycle" in error for error in errors)
    assert any("missing agent" in error for error in errors)


def test_real_run_persists_snapshot_and_handoffs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "runtime.db")
    db.init_db()
    conn = db.get_conn()
    workflow = {
        "workflow_id": "wf_runtime_contract",
        "name": "runtime contract",
        "version": 11,
        "nodes": [n("intake", "agent_chief_architect", type="input_intake")],
        "edges": [],
    }
    conn.execute(
        "INSERT INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)",
        (workflow["workflow_id"], workflow["name"], workflow["version"], json.dumps(workflow), db.now_iso()),
    )
    conn.commit()
    conn.close()
    run = asyncio.run(execute_real_workflow_run(workflow["workflow_id"], "proj_demo_4x5m"))
    assert run["workflow_snapshot"]["workflow_version"] == 11
    assert run["workflow_snapshot"]["edges"] == []
    event = run["events"][0]
    assert event["status"] == "COMPLETED"
    assert Path(event["handoff"]["manifest_path"]).is_file()
    assert Path(event["handoff"]["markdown_path"]).is_file()
