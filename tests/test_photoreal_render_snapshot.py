from __future__ import annotations

import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.db import build_default_demo_project, get_conn, save_project  # noqa: E402
from app.main import app  # noqa: E402
from app.services import blender_mcp  # noqa: E402


def _cleanup(project_id: str) -> None:
    conn = get_conn()
    conn.execute("DELETE FROM render_jobs WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM scene_revisions WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()


def test_render_job_locks_scene_and_current_camera(monkeypatch):
    project = build_default_demo_project()
    project.project_id = f"proj_render_snapshot_{uuid.uuid4().hex[:8]}"
    project.revision = 7
    save_project(project, author="Render test", reason="Snapshot", bump_revision=False)
    monkeypatch.setattr(blender_mcp, "is_blender_available", lambda: (False, "Blender unavailable in test"))

    try:
        with TestClient(app) as client:
            conflict = client.post(
                f"/api/v1/projects/{project.project_id}/render-jobs",
                json={"expected_revision": 6, "async_exec": True},
            )
            assert conflict.status_code == 409

            response = client.post(
                f"/api/v1/projects/{project.project_id}/render-jobs",
                json={
                    "camera": "orbit",
                    "expected_revision": 7,
                    "async_exec": False,
                    "camera_snapshot": {
                        "eye_m": [4.0, 5.0, 1.6],
                        "target_m": [2.0, 2.5, 0.8],
                        "lens_mm": 31.0,
                        "hide_ceiling": False,
                    },
                },
            )
            assert response.status_code == 200
            public_job = response.json()
            assert public_job["status"] == "BLOCKED"
            assert "scene_snapshot" not in public_job

            raw_job = blender_mcp.get_render_job(public_job["job_id"])
            assert raw_job is not None
            assert raw_job["scene_snapshot"]["revision"] == 7
            assert raw_job["camera_snapshot"]["eye_m"] == [4.0, 5.0, 1.6]
    finally:
        _cleanup(project.project_id)
