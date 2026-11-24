"""FEAT-2026-165 tests: publish, token gating, revocation, revision isolation, surface isolation."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from fastapi.testclient import TestClient

import app.db as db
from app.services import lan_preview as lp

FAKE_NET = [{"ip": "192.168.1.50", "adapter": "Wi-Fi", "virtual": False, "has_gateway": True, "private": True, "recommended": True},
            {"ip": "172.20.0.1", "adapter": "vEthernet (WSL)", "virtual": True, "has_gateway": False, "private": True, "recommended": False}]


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "atelier.db")
    monkeypatch.setattr(lp, "DATA_DIR", tmp_path)
    monkeypatch.setattr(lp, "PREVIEW_ROOT", tmp_path / "preview")
    monkeypatch.setattr(lp, "detect_lan_candidates", lambda: FAKE_NET)
    monkeypatch.setattr(lp, "ensure_preview_server", lambda port=3200: {"running": True, "port": port, "bind": "0.0.0.0", "error": None})
    db.init_db()
    project = db.build_default_demo_project()
    db.save_project(project, reason="test")
    from app.preview_app import app as preview_app
    return {"project": project, "client": TestClient(preview_app)}


def _share(env):
    return lp.create_share(env["project"].project_id)


def test_publish_uses_lan_ip_and_real_scene(env):
    share = _share(env)
    assert share["url"].startswith("http://192.168.1.50:3200/preview/")
    assert "127.0.0.1" not in share["url"] and "localhost" not in share["url"]
    token = share["url"].rsplit("/", 1)[1]
    m = env["client"].get(f"/p/{token}/manifest.json").json()
    assert m["project"]["id"] == env["project"].project_id
    assert m["revision"] == share["revision"]
    assert len(m["furniture"]) == len(env["project"].furniture_instances)
    for f in m["furniture"]:
        if f["glb"]:
            assert env["client"].get(f"/p/{token}/{f['glb']}").status_code == 200


def test_dimensions_unchanged_in_export(env):
    share = _share(env)
    m = env["client"].get(f"/p/{share['url'].rsplit('/', 1)[1]}/manifest.json").json()
    src = {f.id: f for f in env["project"].furniture_instances}
    for f in m["furniture"]:
        assert (f["width_mm"], f["depth_mm"], f["height_mm"]) == (src[f["id"]].width_mm, src[f["id"]].depth_mm, src[f["id"]].height_mm)


def test_token_hash_stored_and_bad_tokens_denied(env):
    share = _share(env)
    token = share["url"].rsplit("/", 1)[1]
    conn = db.get_conn()
    row = conn.execute("SELECT token_hash FROM preview_shares").fetchone()
    conn.close()
    assert row["token_hash"] == lp.hash_token(token) and row["token_hash"] != token
    c = env["client"]
    assert c.get("/p/wrong_token_value_123456789/manifest.json").status_code == 404
    assert c.get(f"/p/{share['publication_id']}/manifest.json").status_code == 404  # publication id is not a credential
    assert c.get("/preview/wrong_token_value_123456789").status_code == 404


def test_revoke_blocks_page_manifest_and_assets(env):
    share = _share(env)
    token = share["url"].rsplit("/", 1)[1]
    m = env["client"].get(f"/p/{token}/manifest.json").json()
    glb = next(f["glb"] for f in m["furniture"] if f["glb"])
    assert lp.revoke_share(share["publication_id"])
    c = env["client"]
    assert c.get(f"/preview/{token}").status_code == 404
    assert c.get(f"/p/{token}/manifest.json").status_code == 404
    assert c.get(f"/p/{token}/{glb}").status_code == 404


def test_revision_isolation_until_refresh(env):
    share = _share(env)
    token = share["url"].rsplit("/", 1)[1]
    project = db.get_project(env["project"].project_id)
    project.furniture_instances[0].x_mm += 500
    db.save_project(project, reason="edit after publish")
    m = env["client"].get(f"/p/{token}/manifest.json").json()
    assert m["revision"] == share["revision"]
    assert m["furniture"][0]["x_mm"] == env["project"].furniture_instances[0].x_mm
    refreshed = lp.refresh_share(share["publication_id"])
    assert refreshed["revision"] == project.revision
    m2 = env["client"].get(f"/p/{token}/manifest.json").json()
    assert m2["furniture"][0]["x_mm"] == env["project"].furniture_instances[0].x_mm + 500
    assert refreshed["url"] == share["url"]


def test_preview_surface_has_no_admin_or_listing(env):
    c = env["client"]
    for path in ("/api/v1/projects", "/api/v1/materials", "/docs", "/openapi.json", "/preview/", "/p/", "/viewer/", "/viewer/../app/main.py",
                 "/viewer/..%2fapp%2fmain.py", "/data/atelier.db"):
        assert c.get(path).status_code == 404, path
    assert c.get("/__health").json()["service"] == lp.SERVICE_NAME


def test_asset_path_traversal_blocked(env):
    share = _share(env)
    token = share["url"].rsplit("/", 1)[1]
    c = env["client"]
    for name in ("..%2fmanifest.json", "%2e%2e%2fmanifest.json", "..%5cmanifest.json", "x.glb", "0123456789abcdef.txt"):
        assert c.get(f"/p/{token}/assets/{name}").status_code == 404, name


def test_missing_local_glb_blocks_publish_without_placeholder(env, monkeypatch):
    project = db.get_project(env["project"].project_id)
    target = next(f for f in project.furniture_instances if f.asset_id)
    target.asset_id = "asset_does_not_exist"
    db.save_project(project, reason="break asset")
    with pytest.raises(lp.PublishBlocked) as exc:
        lp.create_share(project.project_id)
    assert exc.value.code == "missing_assets"
    assert exc.value.missing_assets[0]["furniture_id"] == target.id
    assert not list((lp.PREVIEW_ROOT).glob("pub_*")) or all(not (p / "manifest.json").exists() for p in lp.PREVIEW_ROOT.glob("pub_*"))


def test_ip_validation_rejects_loopback_and_foreign(env):
    for bad in ("127.0.0.1", "localhost", "8.8.8.8"):
        with pytest.raises(lp.PublishBlocked):
            lp.create_share(env["project"].project_id, lan_ip=bad)


def test_unsaved_project_rejected(env):
    with pytest.raises(lp.PublishBlocked) as exc:
        lp.create_share("proj_nope")
    assert exc.value.code == "project_not_found"


def test_qr_svg_and_diagnostics_do_not_overclaim(env):
    share = _share(env)
    assert b"<svg" in lp.qr_svg(share["url"])
    d = lp.diagnostics(share["publication_id"])
    assert d["lan_reachable"] == "not_verified"
    assert next(c for c in d["checks"] if c["id"] == "network")["ok"] is None


def test_admin_routes_require_loopback(env):
    from app.main import app as main_app
    remote = TestClient(main_app, client=("192.168.1.77", 5000))
    assert remote.get("/api/v1/preview/network").status_code == 403
    assert remote.post(f"/api/v1/projects/{env['project'].project_id}/preview-shares", json={}).status_code == 403
