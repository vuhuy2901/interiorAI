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
import app.services.blender_mcp as blender_mcp  # noqa: E402
import app.services.codex_render as codex_render  # noqa: E402
from app.db import EIGHT_AGENT_PROFILES, build_default_demo_project, now_iso, save_project  # noqa: E402
from app.services.agent_orchestrator_engine import execute_real_workflow_run  # noqa: E402
from app.services.agent_prompts import EIGHT_AGENT_SKILL_CONTRACTS  # noqa: E402
from app.services.render_brief import build_render_brief  # noqa: E402


CATALOG_SKILLS = [
    "atelier-project-delivery-workflow", "atelier-workflow-evidence-lifecycle", "blender-mcp-rendering",
    "cinematic-rendering-and-composition", "photoreal-render-evidence-gate", "rendering-review",
    "architectural-lighting-mastery", "ceiling-and-lighting-design", "materials-and-finishes",
    "luxury-materials-and-tactile-textures", "aesthetic-moodboard-and-styling", "canonical-scene-integrity-audit",
]


@pytest.fixture()
def runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "render-workflow.db")
    db.init_db()
    project = build_default_demo_project()
    project.project_id = "proj_render_workflow"
    save_project(project, bump_revision=False)
    monkeypatch.setattr(codex_render, "RENDERS_DIR", tmp_path / "renders")
    monkeypatch.setattr(codex_render, "AI_JOBS_DIR", tmp_path / "ai-renders")
    base = tmp_path / "base.png"
    base.write_bytes(b"x" * 12001)
    monkeypatch.setattr(blender_mcp, "is_blender_available", lambda: (True, "fake-blender"))
    monkeypatch.setattr(blender_mcp, "enqueue_render_job", lambda project_id, **kwargs: {
        "status": "COMPLETED", "job_id": "blender_job", "revision": project.revision,
        "renderer": "BLENDER_CYCLES", "out_path": str(base), "render_url": "/api/v1/renders/base.png",
        "file_size_bytes": base.stat().st_size, "material_hash": "mat", "camera_id": "eye_level",
        "watermark": True, "scene_verification": {"all_checks_passed": True},
    })
    return project


def store_workflow(workflow_id: str, nodes: list[dict], edges: list[dict] | None = None) -> None:
    payload = {"workflow_id": workflow_id, "name": workflow_id, "version": 1, "nodes": nodes, "edges": edges or []}
    conn = db.get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO workflows (workflow_id, name, version, payload_json, updated_at) VALUES (?, ?, 1, ?, ?)",
        (workflow_id, workflow_id, json.dumps(payload), now_iso()),
    )
    conn.commit()
    conn.close()


def run_render(runtime, monkeypatch, *, ai_mode="auto", codex_ok=True, ai_status="COMPLETED", mismatch=False, with_qa=False):
    from app.services import agent_orchestrator_engine as engine

    brief_hash = build_render_brief(runtime)["brief_hash"]
    monkeypatch.setattr(codex_render, "codex_available", lambda: (codex_ok, "fake codex" if codex_ok else "Codex CLI unavailable"))
    created = []

    def fake_create(project_id, **kwargs):
        job_id = f"ai_{len(created)}"
        created.append((job_id, kwargs.get("view")))
        return {"job_id": job_id, "status": "QUEUED"}

    def fake_wait(job_id, timeout_s, poll_s=3.0):
        return {
            "job_id": job_id, "status": ai_status, "view": next(view for jid, view in created if jid == job_id),
            "camera": "eye_level", "image_url": "/api/v1/renders/ai.png" if ai_status == "COMPLETED" else None,
            "base_image_url": "/api/v1/renders/base.png", "revision": runtime.revision,
            "brief_hash": "wrong" if mismatch else brief_hash, "error": "timeout" if ai_status != "COMPLETED" else None,
        }

    monkeypatch.setattr(codex_render, "create_job", fake_create)
    monkeypatch.setattr(codex_render, "wait_for_job", fake_wait)
    nodes = [{"id": "render", "type": "render_gen", "label": "Render", "agent_id": "agent_render", "config": {
        "ai_render": ai_mode, "required_views": ["isometric", "entrance", "hero"], "ai_timeout_s": 1,
    }}]
    if with_qa:
        nodes.append({"id": "qa", "type": "render_qa", "label": "QA", "agent_id": "agent_qa"})
    store_workflow(f"wf_{ai_mode}_{ai_status}_{mismatch}_{with_qa}", nodes, [{"source": "render", "target": "qa"}] if with_qa else [])
    return asyncio.run(execute_real_workflow_run(nodes and f"wf_{ai_mode}_{ai_status}_{mismatch}_{with_qa}", runtime.project_id))


def test_render_brief_exposes_uncommitted_warning(runtime):
    brief = build_render_brief(runtime)
    assert brief["missing_decisions"]
    assert brief["warnings"] == ["ảnh dựa trên đề xuất chưa chốt"]
    assert "ảnh dựa trên đề xuất chưa chốt" in brief["markdown"]


@pytest.mark.parametrize("mode", ["off"])
def test_render_gen_off_does_not_call_codex(runtime, monkeypatch, mode):
    monkeypatch.setattr(codex_render, "codex_available", lambda: (_ for _ in ()).throw(AssertionError("Codex must stay off")))
    run = run_render(runtime, monkeypatch, ai_mode=mode)
    event = run["events"][0]
    assert run["status"] == "COMPLETED"
    assert event["output"]["ai_render"]["status"] == "OFF"


def test_render_gen_auto_success_and_unavailable_keep_blender_completed(runtime, monkeypatch):
    success = run_render(runtime, monkeypatch, ai_mode="auto", codex_ok=True)
    assert success["status"] == "COMPLETED"
    assert success["events"][0]["output"]["ai_render"]["status"] == "COMPLETED"
    unavailable = run_render(runtime, monkeypatch, ai_mode="auto", codex_ok=False)
    assert unavailable["status"] == "COMPLETED"
    assert unavailable["events"][0]["output"]["ai_render"]["status"] == "UNAVAILABLE"


def test_render_gen_timeout_is_real_failure_but_not_blender_failure(runtime, monkeypatch):
    run = run_render(runtime, monkeypatch, ai_mode="auto", codex_ok=True, ai_status="FAILED")
    assert run["status"] == "COMPLETED"
    assert run["events"][0]["output"]["ai_render"]["status"] == "FAILED"
    assert run["events"][0]["output"]["render_url"].endswith("base.png")


def test_final_qa_fails_on_ai_brief_hash_mismatch(runtime, monkeypatch):
    run = run_render(runtime, monkeypatch, ai_mode="auto", codex_ok=True, mismatch=True, with_qa=True)
    assert run["status"] == "FAILED"
    assert run["events"][-1]["status"] == "FAILED"
    assert run["events"][-1]["output"]["ai_render_mismatches"]


def test_gallery_merges_filters_and_persists_cover(runtime, monkeypatch, tmp_path):
    ai_file = tmp_path / "ai.png"
    ai_file.write_bytes(b"ai")
    codex_render._save({
        "job_id": "ai_gallery", "project_id": runtime.project_id, "revision": runtime.revision,
        "brief_hash": build_render_brief(runtime)["brief_hash"], "camera": "eye_level", "view": "hero",
        "status": "COMPLETED", "payload_json": "", "created_at": now_iso(), "output_file": str(ai_file),
        "image_url": "/api/v1/renders/ai.png", "base_image_url": "/api/v1/renders/base.png",
    })
    monkeypatch.setattr(blender_mcp, "list_project_render_jobs", lambda project_id, limit=100: [{
        "job_id": "blender_gallery", "project_id": project_id, "revision": runtime.revision,
        "status": "COMPLETED", "camera_id": "wide", "render_url": "/api/v1/renders/blender.png", "updated_at": now_iso(),
    }])
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        response = client.get(f"/api/v1/projects/{runtime.project_id}/renders?kind=ai")
        assert response.status_code == 200 and response.json()["count"] == 1
        assert response.json()["renders"][0]["kind"] == "ai"
        cover = client.put(f"/api/v1/projects/{runtime.project_id}/renders/ai_gallery/cover")
        assert cover.status_code == 200 and cover.json()["cover"]["is_cover"] is True


def test_render_agent_profile_has_exact_catalog_contract():
    assert EIGHT_AGENT_PROFILES["agent_render"]["name"] == "Architectural Visualization & Rendering Agent"
    assert EIGHT_AGENT_PROFILES["agent_render"]["catalog_skills"] == CATALOG_SKILLS
    assert set(EIGHT_AGENT_SKILL_CONTRACTS["agent_render"]["skills"]) >= set(CATALOG_SKILLS)
