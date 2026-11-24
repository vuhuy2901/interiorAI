import sys
from pathlib import Path

from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app import db as app_db  # noqa: E402
from app.services import render_agent as ra  # noqa: E402


def _setup(tmp_path, monkeypatch):
    monkeypatch.setattr(app_db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_db, "DB_PATH", tmp_path / "atelier.db")
    app_db.init_db()
    project = app_db.build_default_demo_project()
    project.project_id = "proj_render_agent"
    app_db.save_project(project, bump_revision=False)
    return project


def test_scene_inspector_and_plan_are_revision_bound(tmp_path, monkeypatch):
    project = _setup(tmp_path, monkeypatch)
    analysis = ra.inspect_scene(project)
    assert analysis["scene_id"] == "proj_render_agent"
    assert analysis["revision"] == project.revision
    assert analysis["source"] == "CanonicalProject"
    assert analysis["geometry_valid"] is True
    assert analysis["integrity_policy"]["mutates_scene"] is False

    plan = ra.build_render_plan(project, ra.RenderAgentRequest(camera_preset="corner", lighting_preset="evening", quality_preset="high"))
    assert plan["status"] == "READY"
    assert plan["plan"]["camera"]["camera_id"] == "corner"
    assert plan["plan"]["quality"]["width_px"] == 2560
    assert plan["plan"]["lighting"]["time_of_day"] == "sunset"
    assert plan["scene_analysis"]["revision"] == project.revision


def test_quality_inspector_rejects_blank_and_accepts_non_blank(tmp_path):
    blank = tmp_path / "blank.png"
    Image.new("RGB", (960, 540), (128, 128, 128)).save(blank)
    rejected = ra.inspect_render_output(str(blank), {"width_px": 960, "height_px": 540})
    assert rejected["passed"] is False
    assert "QA fail: not_blank" in rejected["issues"]

    valid = tmp_path / "valid.png"
    image = Image.new("RGB", (960, 540), (220, 220, 220))
    for x in range(100, 860):
        for y in range(120, 420):
            image.putpixel((x, y), (20, 80, 140) if (x // 80 + y // 60) % 2 else (220, 220, 220))
    image.save(valid)
    accepted = ra.inspect_render_output(str(valid), {"width_px": 960, "height_px": 540})
    assert accepted["passed"] is True
    assert accepted["checks"]["resolution"] is True


def test_render_agent_plan_endpoint_does_not_require_ai_or_blender(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/projects/proj_render_agent/render/agent/plan",
            json={"camera_preset": "hero", "lighting_preset": "daylight", "quality_preset": "standard"},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["agent"] == "architectural_visualization_rendering_agent"
    assert payload["plan"]["revision"] == 1
    assert payload["scene_analysis"]["source"] == "CanonicalProject"


def test_cycles_worker_blocks_stale_scene_snapshot(tmp_path, monkeypatch):
    project = _setup(tmp_path, monkeypatch)
    from app.services import blender_mcp as bm

    job = {
        "job_id": "rjob_stale",
        "project_id": project.project_id,
        "revision": project.revision - 1,
        "material_hash": "old-material-hash",
        "status": "QUEUED",
    }
    saved = {}
    monkeypatch.setattr(bm, "get_render_job", lambda job_id: job)
    monkeypatch.setattr(bm, "get_project", lambda project_id: project)
    monkeypatch.setattr(bm, "is_blender_available", lambda: (True, "blender"))
    monkeypatch.setattr(bm, "_save_render_job", lambda value: saved.setdefault("job", value))
    result = bm._run_render_job_worker("rjob_stale")
    assert result["status"] == "BLOCKED"
    assert result["error_code"] == "STALE_REVISION"
