"""
FEAT-2026-127 — Ẩn/hiện dự án trong danh sách (cờ lưu ở bảng project_visibility).
Dùng DB SQLite tạm (monkeypatch DB_PATH) để không đụng atelier.db thật.
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app import db as app_db  # noqa: E402
from app.db import build_default_demo_project, init_db, save_project  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(app_db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_db, "DB_PATH", tmp_path / "atelier.db")
    init_db()
    for pid in ("proj_vis_a", "proj_vis_b"):
        project = build_default_demo_project()
        project.project_id = pid
        project.name = f"Test {pid}"
        save_project(project, bump_revision=False)
    return tmp_path / "atelier.db"


def _ids(rows):
    return {row["project_id"] for row in rows}


def test_hide_and_restore_project(temp_db):
    with TestClient(app) as client:
        before = client.get("/api/v1/projects").json()
        assert {"proj_vis_a", "proj_vis_b"} <= _ids(before)

        r = client.put("/api/v1/projects/proj_vis_a/visibility", json={"hidden": True, "reason": "test"})
        assert r.status_code == 200
        assert r.json() == {"project_id": "proj_vis_a", "hidden": True}

        listed = client.get("/api/v1/projects").json()
        assert "proj_vis_a" not in _ids(listed)
        assert "proj_vis_b" in _ids(listed)

        with_hidden = client.get("/api/v1/projects?include_hidden=true").json()
        by_id = {row["project_id"]: row for row in with_hidden}
        assert by_id["proj_vis_a"]["hidden"] is True
        assert by_id["proj_vis_b"]["hidden"] is False

        # Lấy theo ID vẫn chạy cho dự án ẩn
        assert client.get("/api/v1/projects/proj_vis_a").status_code == 200

        r = client.put("/api/v1/projects/proj_vis_a/visibility", json={"hidden": False})
        assert r.status_code == 200
        assert "proj_vis_a" in _ids(client.get("/api/v1/projects").json())


def test_visibility_unknown_project_returns_404(temp_db):
    with TestClient(app) as client:
        r = client.put("/api/v1/projects/proj_does_not_exist/visibility", json={"hidden": True})
        assert r.status_code == 404


def test_init_db_keeps_hidden_flag(temp_db):
    with TestClient(app) as client:
        client.put("/api/v1/projects/proj_vis_b/visibility", json={"hidden": True, "reason": "keep"})
    init_db()
    init_db()
    with TestClient(app) as client:
        assert "proj_vis_b" not in _ids(client.get("/api/v1/projects").json())
        assert "proj_vis_b" in _ids(client.get("/api/v1/projects?include_hidden=true").json())
