"""
FEAT-2026-131 - Moi task (issue) co dung 1 scene canonical sach, idempotent, khong fallback.
Dung DB SQLite tam (monkeypatch DB_PATH); khong cham atelier.db that.
"""
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app import db as app_db  # noqa: E402
from app import main as app_main  # noqa: E402
from app.db import build_default_demo_project, get_conn, init_db, save_project  # noqa: E402
from app.models.contracts import DesignBrief  # noqa: E402

COMPANY = "company-1"


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(app_db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_db, "DB_PATH", tmp_path / "atelier.db")
    init_db()

    async def no_sidecar(_project):
        return {"ok": False}

    monkeypatch.setattr(app_main, "sync_canonical_to_pascal", no_sidecar)
    old = build_default_demo_project()
    old.project_id = "proj_old_task"
    old.name = "Du an cu"
    old.design_brief.style = "Japandi"
    save_project(old, bump_revision=False)
    conn = get_conn()
    conn.execute(
        "INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?,?,?,?,?,?,?)",
        ("m_old", "proj_old_task", "user", "u", "chat cu", "{}", "2026-01-01T00:00:00Z"),
    )
    conn.execute(
        "INSERT INTO questions (question_id, project_id, status, payload_json, created_at) VALUES (?,?,?,?,?)",
        ("q_old", "proj_old_task", "pending", "{}", "2026-01-01T00:00:00Z"),
    )
    conn.commit()
    conn.close()
    return tmp_path / "atelier.db"


def _ensure(client, issue_id, **extra):
    return client.post(f"/api/v1/issues/{issue_id}/scene", json={"company_id": COMPANY, "title": f"Task {issue_id}", **extra})


def _count(sql, *args):
    conn = get_conn()
    try:
        return conn.execute(sql, args).fetchone()[0]
    finally:
        conn.close()


def test_two_new_tasks_get_distinct_clean_scenes(temp_db):
    with TestClient(app_main.app) as client:
        a = _ensure(client, "issue-a")
        b = _ensure(client, "issue-b")
        assert a.status_code == 200 and b.status_code == 200
        sa, sb = a.json()["scene_id"], b.json()["scene_id"]
        assert sa != sb and "proj_old_task" not in (sa, sb) and "proj_demo_4x5m" not in (sa, sb)
        assert a.json()["created"] is True and a.json()["origin"] == "new"
        for sid in (sa, sb):
            scene = client.get(f"/api/v1/projects/{sid}").json()
            assert scene["revision"] == 1
            assert scene["furniture_instances"] == []
            assert scene["surface_material_overrides"] == {}
            assert scene["scale_calibrated"] is False
            assert scene["design_brief"] == DesignBrief().model_dump()
            assert scene["design_brief"]["style"] == "Modern"
            assert _count("SELECT COUNT(*) FROM chat_messages WHERE project_id = ?", sid) == 0
            assert _count("SELECT COUNT(*) FROM questions WHERE project_id = ?", sid) == 0
            assert _count("SELECT COUNT(*) FROM workflow_runs WHERE project_id = ?", sid) == 0
            assert _count("SELECT COUNT(*) FROM workflow_decisions WHERE project_id = ?", sid) == 0
        # du an cu khong bi dong vao
        assert _count("SELECT COUNT(*) FROM chat_messages WHERE project_id = 'proj_old_task'") == 1
        old = client.get("/api/v1/projects/proj_old_task").json()
        assert old["design_brief"]["style"] == "Japandi" and len(old["furniture_instances"]) > 0


def test_ensure_is_idempotent_and_reopen_returns_same_project(temp_db):
    with TestClient(app_main.app) as client:
        first = _ensure(client, "issue-a").json()
        _ensure(client, "issue-b")
        again = _ensure(client, "issue-a").json()
        assert again["scene_id"] == first["scene_id"] and again["created"] is False
        assert client.get("/api/v1/issues/issue-a/scene").json()["scene_id"] == first["scene_id"]
        assert _count("SELECT COUNT(*) FROM issue_scene_links WHERE issue_id = 'issue-a'") == 1
        assert _count("SELECT COUNT(*) FROM projects WHERE name = 'Task issue-a'") == 1


def test_unlinked_task_does_not_fall_back(temp_db):
    with TestClient(app_main.app) as client:
        r = client.get("/api/v1/issues/never-linked/scene")
        assert r.status_code == 404
        assert "proj_demo_4x5m" not in r.text and "proj_old_task" not in r.text


def test_explicit_continue_scene_and_unknown_scene(temp_db):
    with TestClient(app_main.app) as client:
        r = _ensure(client, "issue-c", continue_scene_id="proj_old_task")
        assert r.status_code == 200
        assert r.json()["scene_id"] == "proj_old_task" and r.json()["origin"] == "continued"
        assert _ensure(client, "issue-d", continue_scene_id="proj_missing").status_code == 404
        assert client.get("/api/v1/issues/issue-d/scene").status_code == 404


def test_company_mismatch_is_rejected(temp_db):
    with TestClient(app_main.app) as client:
        _ensure(client, "issue-a")
        r = client.post("/api/v1/issues/issue-a/scene", json={"company_id": "other"})
        assert r.status_code == 409


def test_new_scene_links_to_ready_native_project_only(temp_db):
    with TestClient(app_main.app) as client:
        client.post("/api/v1/native-projects/initialize", json={
            "native_project_id": "np1", "company_id": COMPANY, "project_name": "NP"})
        a = _ensure(client, "issue-a", native_project_id="np1").json()
        assert a["native_project_id"] == "np1"
        ws = client.get("/api/v1/native-projects/np1/workspace").json()
        assert [s["scene_id"] for s in ws["scenes"]] == [a["scene_id"]]
        # native project cua cong ty khac khong duoc gan
        b = client.post("/api/v1/issues/issue-b/scene", json={"company_id": "zzz", "native_project_id": "np1"}).json()
        assert b["native_project_id"] is None


def test_hidden_project_flag_untouched(temp_db):
    with TestClient(app_main.app) as client:
        client.put("/api/v1/projects/proj_old_task/visibility", json={"hidden": True})
        _ensure(client, "issue-a")
        ids = {p["project_id"] for p in client.get("/api/v1/projects").json()}
        assert "proj_old_task" not in ids
        hidden = {p["project_id"] for p in client.get("/api/v1/projects?include_hidden=true").json()}
        assert "proj_old_task" in hidden


# ---- CR-1 (FEAT-2026-131 v1.1) ----

def test_scene_exists_right_after_issue_creation_without_prior_get(temp_db):
    with TestClient(app_main.app) as client:
        assert _ensure(client, "issue-fresh").status_code == 200
        got = client.get("/api/v1/issues/issue-fresh/scene")
        assert got.status_code == 200 and got.json()["origin"] == "new"
        # goi lai (sidecar thu lai) khong tao trung
        assert _ensure(client, "issue-fresh").json()["created"] is False
        assert _count("SELECT COUNT(*) FROM issue_scene_links WHERE issue_id = 'issue-fresh'") == 1


def test_continue_scene_id_uses_exact_old_scene_and_leaves_it_untouched(temp_db):
    with TestClient(app_main.app) as client:
        before = client.get("/api/v1/projects/proj_old_task").json()
        r = _ensure(client, "issue-cont", continue_scene_id="proj_old_task").json()
        assert r["scene_id"] == "proj_old_task" and r["origin"] == "continued"
        after = client.get("/api/v1/projects/proj_old_task").json()
        assert after["revision"] == before["revision"]
        assert after["design_brief"] == before["design_brief"]
        # tao lai khong doi sang scene khac du truyen khong co continue_scene_id
        assert _ensure(client, "issue-cont").json()["scene_id"] == "proj_old_task"


def test_legacy_unlinked_task_get_is_404_and_never_auto_creates(temp_db):
    with TestClient(app_main.app) as client:
        projects_before = _count("SELECT COUNT(*) FROM projects")
        for _ in range(3):
            assert client.get("/api/v1/issues/legacy-task/scene").status_code == 404
        assert _count("SELECT COUNT(*) FROM issue_scene_links WHERE issue_id = 'legacy-task'") == 0
        assert _count("SELECT COUNT(*) FROM projects") == projects_before
        # nguoi dung chon "gan du an co san" -> link dung scene da chon
        r = _ensure(client, "legacy-task", continue_scene_id="proj_old_task")
        assert r.json()["scene_id"] == "proj_old_task"
        assert _count("SELECT COUNT(*) FROM projects") == projects_before
