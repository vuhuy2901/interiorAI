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


def test_default_bedroom_camera_is_clear_and_targets_bed():
    project = build_default_demo_project()
    project.furniture_instances[0].category = "bed"
    spec = blender_mcp._compute_camera_spec(project, "eye_level")
    eye_x, eye_y, eye_z = spec["eye_m"]
    bed = next(item for item in project.furniture_instances if item.category == "bed")

    assert 1.4 <= eye_z <= 1.6
    assert spec["lens_mm"] == 28.0
    assert spec["target_m"][0] == bed.x_mm / 1000.0
    assert spec["target_m"][1] == bed.y_mm / 1000.0
    for item in project.furniture_instances:
        assert not (
            abs(eye_x - item.x_mm / 1000.0) <= item.width_mm / 2000.0 + 0.2
            and abs(eye_y - item.y_mm / 1000.0) <= item.depth_mm / 2000.0 + 0.2
        )


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
                        "up_m": [0.0, 0.0, 1.0],
                        "projection": "perspective",
                        "vertical_fov_deg": 47.0,
                        "aspect_ratio": 1.7778,
                        "near_m": 0.02,
                        "far_m": 420.0,
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
            assert raw_job["camera_snapshot"]["vertical_fov_deg"] == 47.0
            assert raw_job["camera_snapshot"]["near_m"] == 0.02
    finally:
        _cleanup(project.project_id)


def test_scene_bridge_preserves_complete_camera_snapshot(tmp_path):
    project = build_default_demo_project()
    snapshot = {
        "eye_m": [2.7, -12.8, 5.27],
        "target_m": [2.3, 0.17, 2.6],
        "up_m": [0.0, 0.0, 1.0],
        "projection": "perspective",
        "vertical_fov_deg": 45.0,
        "aspect_ratio": 16 / 9,
        "near_m": 0.01,
        "far_m": 500.0,
        "lens_mm": 41.68,
        "hide_ceiling": True,
    }

    manifest = blender_mcp.build_scene_bridge_manifest(
        project,
        camera="orbit",
        time_of_day="day",
        out_dir=tmp_path,
        camera_snapshot=snapshot,
    )

    assert manifest["camera"]["camera_id"] == "current_view"
    assert manifest["camera"]["eye_m"] == snapshot["eye_m"]
    assert manifest["camera"]["target_m"] == snapshot["target_m"]
    assert manifest["camera"]["vertical_fov_deg"] == 45.0
    assert manifest["camera"]["near_m"] == 0.01
    assert manifest["camera"]["far_m"] == 500.0
    assert manifest["camera"]["hide_ceiling"] is True


def test_external_runner_has_non_destructive_cutaway_and_camera_checks():
    script = blender_mcp._generate_external_scene_runner_script()

    assert "obj.hide_render = True" in script
    assert "hidden_ceiling_objects" in script
    assert '"cutaway_matches_snapshot"' in script
    assert 'camera_data.angle_y' in script
    assert 'camera_data.clip_start' in script
    assert 'camera_data.clip_end' in script
