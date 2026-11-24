"""FEAT-2026-129: render brief + job Codex. Mock subprocess; DB tạm; không gọi codex thật."""
import sys
import base64
import threading
import time
from pathlib import Path

import pytest
from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app import db as app_db  # noqa: E402
from app.models.contracts import DesignBrief  # noqa: E402
from app.services import codex_render as cr  # noqa: E402
from app.services.render_brief import build_render_brief  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(app_db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_db, "DB_PATH", tmp_path / "atelier.db")
    app_db.init_db()
    proj = app_db.build_default_demo_project()
    proj.project_id = "proj_ai_test"
    proj.name = "Phòng thử nghiệm"
    proj.design_brief = DesignBrief(style="Hiện đại")
    app_db.save_project(proj, bump_revision=False)
    monkeypatch.setattr(cr, "RENDERS_DIR", tmp_path / "renders")
    monkeypatch.setattr(cr, "AI_JOBS_DIR", tmp_path / "ai_renders")
    monkeypatch.setattr(cr, "GENERATED_IMAGES_DIR", tmp_path / "gen")
    base = tmp_path / "base_src.png"
    Image.new("RGB", (320, 180), (200, 200, 200)).save(base)
    import app.services.blender_mcp as bm
    monkeypatch.setattr(bm, "enqueue_render_job", lambda pid, **kw: {
        "status": "COMPLETED", "job_id": "rjob_fake", "out_path": str(base), "render_url": "/api/v1/renders/base_src.png",
    })
    monkeypatch.setattr(cr.shutil, "which", lambda name: "C:/fake/codex.cmd")
    return tmp_path


def _fake_popen(record, write_output=True, returncode=0, text=""):
    class FakePopen:
        def __init__(self, args, **kw):
            record["args"], record["kw"] = args, kw
            self.pid, self.returncode = 1234, returncode
            self.cwd = Path(kw["cwd"])

        def communicate(self, data=None, timeout=None):
            record["stdin"] = data
            if timeout is not None and record.get("raise_timeout") and not record.get("raised"):
                record["raised"] = True
                raise cr.subprocess.TimeoutExpired(record["args"], timeout)
            if write_output and not record.get("raise_timeout"):
                Image.new("RGB", (640, 360), (120, 90, 60)).save(self.cwd / cr.OUTPUT_NAME)
            return (text.encode(), None)

        def kill(self):
            pass
    return FakePopen


def _create(env, **kw):
    if "base_image_data_url" not in kw:
        kw["base_image_data_url"] = "data:image/png;base64," + base64.b64encode((env / "base_src.png").read_bytes()).decode("ascii")
    return cr.create_job("proj_ai_test", start_thread=False, **kw)


def test_brief_sections_hash_and_no_japandi(env):
    proj = app_db.get_project("proj_ai_test")
    b1, b2 = build_render_brief(proj), build_render_brief(proj)
    assert b1["brief_hash"] == b2["brief_hash"] and b1["markdown"] == b2["markdown"]
    md = b1["markdown"]
    for part in ("## 1. Không gian", "## 2. Phong cách", "## 3. Màu và vật liệu", "## 5. Đồ nội thất", "## 6. Cửa",
                 "## 7. Ánh sáng", "Checklist đối chiếu", "## 9. Cấm", "Cấm thêm, bớt hoặc di chuyển"):
        assert part in md
    assert "Phong cách: Hiện đại" in md and "HEX #" in md
    assert "japandi" not in md.split("## 3.")[1].split("## 5.")[0].lower()  # tên sơn Japandi không được rò vào brief Modern
    assert "lighting" in b1["missing_decisions"] and "CHƯA CHỐT" in md
    assert b1["revision"] == proj.revision


def test_brief_finish_decisions_take_priority(env):
    proj = app_db.get_project("proj_ai_test")
    proj.design_brief.finish_decisions = {
        "wall_paint": {"key": "wall_paint", "label": "Màu sơn tường chính", "value": "Xanh sage nhạt", "hex": "#B7C4B0", "status": "VALIDATED"},
        "lighting": {"key": "lighting", "label": "Ánh sáng", "value": "Ấm 3000K", "status": "VALIDATED"},
        "floor": {"key": "floor", "label": "Sàn", "value": "Sồi mật ong", "status": "PROVISIONAL"},
    }
    out = build_render_brief(proj)
    assert "Tường chính: Xanh sage nhạt, HEX #B7C4B0 (người dùng đã chốt)" in out["markdown"]
    assert "lighting" not in out["missing_decisions"]
    assert "Sồi mật ong" not in out["markdown"]  # PROVISIONAL không đè giá trị mô hình


def test_brief_missing_when_values_absent(env):
    proj = app_db.get_project("proj_ai_test")
    proj.rooms[0].wall_base_material_id = "khong_ton_tai"
    out = build_render_brief(proj)
    assert "wall_paint" in out["missing_decisions"]
    assert "Tường chính: CHƯA CHỐT" in out["markdown"]


def test_job_success_saves_labeled_file(env, monkeypatch):
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen({}))
    job = _create(env)
    assert job["status"] == "QUEUED"
    done = cr.process_job(job["job_id"])
    assert done["status"] == "COMPLETED", done
    out = Path(done["output_file"])
    assert out.is_file() and out.name.startswith("proj_ai_test_rev") and "_ai_" in out.name
    assert Image.open(out).size == (640, 360)
    pub = cr.public_job(cr.get_job(job["job_id"]))
    assert pub["status"] == "COMPLETED" and pub["image_url"].startswith("/api/v1/renders/")
    assert pub["base_image_url"].startswith("/api/v1/renders/proj_ai_test_rev1_ai_") and pub["brief_hash"]
    src = Image.open(env / "ai_renders" / job["job_id"] / cr.OUTPUT_NAME).convert("RGB")
    stamped = Image.open(out).convert("RGB")
    # nhãn nằm ở góc trái dưới: vùng đó khác ảnh gốc, vùng trên cùng giữ nguyên
    assert stamped.getpixel((10, 345)) != src.getpixel((10, 345))
    assert stamped.getpixel((320, 10)) == src.getpixel((320, 10))


def test_job_cache_returns_existing(env, monkeypatch):
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen({}))
    j = _create(env)
    cr.process_job(j["job_id"])
    again = _create(env)
    assert again["job_id"] == j["job_id"] and again["cache_hit"]
    forced = _create(env, force=True)
    assert forced["job_id"] != j["job_id"]


def test_job_args_list_no_shell_no_bypass(env, monkeypatch):
    rec = {}
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen(rec))
    cr.process_job(_create(env)["job_id"])
    args = rec["args"]
    assert isinstance(args, list) and all(isinstance(a, str) for a in args)
    assert rec["kw"].get("shell") is False
    assert "--dangerously-bypass-approvals-and-sandbox" not in args
    assert args[args.index("-s") + 1] == "workspace-write"
    assert "ai_renders" in args[args.index("-C") + 1]
    assert "BRIEF" in rec["stdin"].decode("utf-8") and "Cấm" in rec["stdin"].decode("utf-8")


def test_job_timeout_fails(env, monkeypatch):
    rec = {"raise_timeout": True}
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen(rec))
    monkeypatch.setattr(cr, "_kill_tree", lambda p: None)
    done = cr.process_job(_create(env)["job_id"])
    assert done["status"] == "FAILED" and "quá" in done["error"]
    assert not done.get("image_url")


def test_job_no_output_file_fails(env, monkeypatch):
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen({}, write_output=False))
    done = cr.process_job(_create(env)["job_id"])
    assert done["status"] == "FAILED" and "không tạo ra file" in done["error"]


def test_job_codex_missing_and_not_logged_in(env, monkeypatch):
    monkeypatch.setattr(cr.shutil, "which", lambda name: None)
    assert "chưa được cài" in cr.process_job(_create(env)["job_id"])["error"]
    monkeypatch.setattr(cr.shutil, "which", lambda name: "C:/fake/codex.cmd")
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen({}, write_output=False, returncode=1, text="Not logged in"))
    done = cr.process_job(_create(env, force=True)["job_id"])
    assert done["status"] == "FAILED" and "đăng nhập" in done["error"]


def test_only_one_codex_at_a_time(env, monkeypatch):
    state = {"running": 0, "max": 0}
    guard = threading.Lock()

    def fake_run(args, prompt, cwd, timeout_s):
        with guard:
            state["running"] += 1
            state["max"] = max(state["max"], state["running"])
        time.sleep(0.25)
        Image.new("RGB", (64, 36), (1, 2, 3)).save(Path(cwd) / cr.OUTPUT_NAME)
        with guard:
            state["running"] -= 1
        return {"returncode": 0, "output": "", "timed_out": False}

    monkeypatch.setattr(cr, "run_codex_process", fake_run)
    ids = [_create(env, force=True)["job_id"] for _ in range(3)]
    threads = [threading.Thread(target=cr.process_job, args=(i,)) for i in ids]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert state["max"] == 1
    assert all(cr.get_job(i)["status"] == "COMPLETED" for i in ids)


def test_stale_running_job_marked_failed(env):
    job = _create(env)
    cr._ACTIVE.discard(job["job_id"])
    assert cr.get_job(job["job_id"])["status"] == "FAILED"


def test_endpoints(env, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    monkeypatch.setattr(cr, "process_job", lambda job_id: None)  # thread nền không làm gì
    with TestClient(app) as client:
        r = client.get("/api/v1/projects/proj_ai_test/render-brief")
        assert r.status_code == 200 and set(r.json()) >= {"markdown", "brief_hash", "revision", "missing_decisions"}
        p = client.post("/api/v1/projects/proj_ai_test/render/ai", json={"camera": "eye_level"})
        assert p.status_code == 200 and p.json()["status"] == "QUEUED"
        g = client.get(f"/api/v1/render/ai/{p.json()['job_id']}")
        assert g.status_code == 200 and g.json()["status"] == "QUEUED"
        assert client.post("/api/v1/projects/nope/render/ai", json={}).status_code == 404
        assert client.post("/api/v1/projects/proj_ai_test/render/ai", json={"camera": "x"}).status_code == 422


def test_blank_base_adds_warning_and_prompt_note(env, monkeypatch):
    import app.services.blender_mcp as bm
    blank = env / "blank.png"
    Image.new("RGB", (320, 180), (238, 235, 230)).save(blank)
    monkeypatch.setattr(bm, "enqueue_render_job", lambda pid, **kw: {
        "status": "COMPLETED", "job_id": "rjob_blank", "out_path": str(blank), "render_url": "/api/v1/renders/blank.png"})
    rec = {}
    monkeypatch.setattr(cr.subprocess, "Popen", _fake_popen(rec))
    done = cr.process_job(_create(env)["job_id"])
    assert done["status"] == "COMPLETED" and "gần như trống" in done["warning"]
    assert "KHÔNG đủ thông tin bố cục" in rec["stdin"].decode("utf-8")
