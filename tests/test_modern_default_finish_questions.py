"""FEAT-2026-128: phong cách mặc định Hiện đại + agent HỎI lựa chọn hoàn thiện."""
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
from app.models.contracts import DesignBrief  # noqa: E402
from app.services import finish_decisions as fin  # noqa: E402
from app.services import orchestrator as orch  # noqa: E402


@pytest.fixture
def project_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "atelier.db")
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    db.init_db()
    proj = db.build_default_demo_project()
    proj.project_id = "proj_modern_test"
    proj.design_brief = DesignBrief()  # mặc định mới
    proj.scale_calibrated = True
    db.save_project(proj, author="test", reason="seed", bump_revision=False)
    return proj.project_id


def chat(project_id: str, text: str) -> dict:
    return asyncio.run(orch.process_user_chat_message(project_id, text))


def pending_finish_keys(project_id: str) -> list[str]:
    conn = db.get_conn()
    rows = conn.execute("SELECT payload_json FROM questions WHERE project_id = ? AND status = 'PENDING'", (project_id,)).fetchall()
    conn.close()
    return [json.loads(r["payload_json"]).get("decision_key") for r in rows if json.loads(r["payload_json"]).get("decision_key")]


# ---- AC-01 / AC-02 -------------------------------------------------------------
def test_default_style_is_modern():
    assert DesignBrief().style == "Modern"
    from app.main import CreateProjectPayload

    assert CreateProjectPayload(name="x").style == "Modern"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Thiết kế căn hộ phong cách tân cổ điển", "Classic"),
        ("Thiết kế căn hộ 80m2 cho gia đình", "Modern"),
        ("Tôi thích phong cách hiện đại", "Modern"),
        ("Muốn kiểu tối giản", "Minimalist"),
        ("phong cách Indochine / đông dương", "Indochine"),
        ("Phòng khách sang trọng luxury", "Luxury"),
        ("Phong cách Bắc Âu", "Scandinavian"),
        ("Phong cách industrial", "Industrial"),
        ("Phong cách Japandi", "Japandi"),
        ("Dùng gỗ công nghiệp cho tủ", "Modern"),
    ],
)
def test_style_detection(text: str, expected: str):
    assert fin.detect_style(text) == expected


def test_asset_pack_for_style():
    assert fin.asset_pack_for_style("Modern") == "sh3d-classic"
    assert fin.asset_pack_for_style("Japandi") == "sh3d-japandi"


def test_new_design_without_style_is_modern_and_not_japandi(project_id: str):
    res = chat(project_id, "Thiết kế căn hộ cho gia đình 3 người")
    project = db.get_project(project_id)
    assert project.design_brief.style == "Modern"
    # Bỏ proposed_canonical: nó chứa tên dự án mẫu cũ (seed, không thuộc phạm vi đổi).
    meta = {k: v for k, v in res["metadata"].items() if k != "proposal"}
    proposal = {k: v for k, v in res["metadata"]["proposal"].items() if k != "proposed_canonical"}
    blob = json.dumps([meta, proposal], ensure_ascii=False) + res["reply"]
    assert "japandi" not in blob.lower()
    furn = res["metadata"]["proposal"]["proposed_canonical"]["furniture_instances"]
    assert "japandi" not in json.dumps(furn, ensure_ascii=False).lower()


def test_new_design_explicit_japandi_and_classic(project_id: str):
    chat(project_id, "Thiết kế căn hộ phong cách Japandi")
    assert db.get_project(project_id).design_brief.style == "Japandi"
    chat(project_id, "Thiết kế căn hộ phong cách tân cổ điển")
    assert db.get_project(project_id).design_brief.style == "Classic"


def test_three_options_are_really_different_and_follow_style(project_id: str):
    project = db.get_project(project_id)
    options = orch.generate_design_options(project)
    # Furniture của dự án mẫu (seed) giữ nguyên tên cũ; chỉ kiểm tra phần agent sinh ra.
    text = json.dumps([o.model_dump(exclude={"furniture_list"}) for o in options], ensure_ascii=False)
    assert "japandi" not in text.lower()
    assert len({(o.floor_material_id, o.wall_paint_id) for o in options}) == 3
    assert "đề xuất, chờ bạn chọn" in options[0].title


# ---- AC-03 ---------------------------------------------------------------------
def test_new_project_without_colors_asks_paint_floor_ceiling_then_lighting(project_id: str):
    res = chat(project_id, "Thiết kế căn hộ cho gia đình 3 người")
    qs = res["metadata"]["questions"]
    assert [q["decision_key"] for q in qs] == ["wall_paint", "floor", "ceiling_color"]
    for q in qs:
        real = [c for c in q["choices"] if not c["id"].endswith(":custom")]
        assert 2 <= len(real) <= 4
        assert any(c["id"].endswith(":custom") for c in q["choices"])
    wall_labels = " ".join(c["label"] for c in qs[0]["choices"])
    assert "#FAFAF8" in wall_labels and "MOD-WHT-01" in wall_labels  # tên màu + hex + mã catalog
    assert len(pending_finish_keys(project_id)) == 3

    # Trả lời hết 3 câu -> lượt sau hỏi ánh sáng, tường nhấn, tông gỗ
    # Mỗi câu trả lời mở một chỗ trống: tổng số câu đang chờ không bao giờ quá 3.
    for q in qs:
        orch.answer_question_and_resume(q["question_id"], q["choices"][1]["label"])
        assert len(pending_finish_keys(project_id)) <= 3
    assert sorted(pending_finish_keys(project_id)) == ["accent_wall", "lighting", "wood_tone"]


# ---- AC-04 ---------------------------------------------------------------------
def test_answer_is_saved_and_used_and_not_asked_again(project_id: str):
    res = chat(project_id, "Thiết kế căn hộ cho gia đình 3 người")
    by_key = {q["decision_key"]: q for q in res["metadata"]["questions"]}
    wall_choice = next(c for c in by_key["wall_paint"]["choices"] if c["id"] == "wall_paint:greige")
    floor_choice = next(c for c in by_key["floor"]["choices"] if c["id"] == "floor:oak_straight")
    orch.answer_question_and_resume(by_key["wall_paint"]["question_id"], wall_choice["label"])
    orch.answer_question_and_resume(by_key["floor"]["question_id"], floor_choice["label"])

    project = db.get_project(project_id)
    decisions = project.design_brief.finish_decisions
    assert decisions["wall_paint"]["status"] == "VALIDATED" and decisions["wall_paint"]["material_id"] == "paint_modern_greige"
    assert decisions["floor"]["material_id"] == "floor_wood_oak_straight"

    # Style (phương án A) dùng đúng giá trị đã chọn
    option_a = orch.generate_design_options(project)[0]
    assert option_a.wall_paint_id == "paint_modern_greige"
    assert option_a.floor_material_id == "floor_wood_oak_straight"

    # Đề xuất đang chờ được cập nhật theo lựa chọn
    conn = db.get_conn()
    row = conn.execute("SELECT payload_json FROM proposals WHERE project_id = ? AND status = 'PENDING'", (project_id,)).fetchone()
    conn.close()
    proposed = json.loads(row["payload_json"])["proposed_canonical"]
    assert proposed["rooms"][0]["wall_base_material_id"] == "paint_modern_greige"
    assert proposed["rooms"][0]["floor_material_id"] == "floor_wood_oak_straight"

    # Không hỏi lại câu đã có decision / câu đang chờ
    again = fin.plan_finish_questions(project_id, "Modern", decisions, already_pending=pending_finish_keys(project_id))
    assert all(q.decision_key not in {"wall_paint", "floor"} for q in again)
    res2 = chat(project_id, "Thiết kế căn hộ cho gia đình 3 người")
    asked = [q["decision_key"] for q in res2["metadata"].get("questions", [])]
    assert "wall_paint" not in asked and "floor" not in asked


def test_custom_answer_and_custom_button(project_id: str):
    res = chat(project_id, "Thiết kế căn hộ")
    q = res["metadata"]["questions"][0]
    pending = orch.answer_question_and_resume(q["question_id"], fin.CUSTOM_LABEL)
    assert pending.get("needs_text") is True and q["decision_key"] in pending_finish_keys(project_id)
    done = orch.answer_question_and_resume(q["question_id"], "Xanh bạc hà nhạt #CDEBDD")
    assert done["decision"]["custom"] is True and done["decision"]["value"].startswith("Xanh bạc hà")
    assert db.get_project(project_id).design_brief.finish_decisions[q["decision_key"]]["status"] == "VALIDATED"


def test_stated_color_in_message_is_not_asked(project_id: str):
    res = chat(project_id, "Thiết kế căn hộ, sơn tường màu xám, sàn gỗ, ánh sáng ấm")
    asked = [q["decision_key"] for q in res["metadata"]["questions"]]
    assert "wall_paint" not in asked and "floor" not in asked and "lighting" not in asked
    assert asked[0] == "ceiling_color"


# ---- AC-05 ---------------------------------------------------------------------
def test_cost_and_bom_never_ask_finish_questions(project_id: str):
    for agent in ("agent_cost", "agent_inventory", "agent_qa", "agent_research", "agent_geometry"):
        assert fin.plan_finish_questions(project_id, "Modern", {}, origin_agent=agent) == []
    res = chat(project_id, "Cho tôi xem bảng kê vật tư BOM")
    assert "questions" not in res["metadata"] and "question" not in res["metadata"]
    assert pending_finish_keys(project_id) == []


def test_policy_limits(project_id: str):
    qs = fin.plan_finish_questions(project_id, "Modern", {}, limit=10)
    assert len(qs) == 3
    assert fin.plan_finish_questions(project_id, "Modern", {}, limit=1)[0].decision_key == "wall_paint"
