from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
from app.services import workflow_input_sync as sync  # noqa: E402
from app.services.paperclip_task_adapter import PaperclipTaskError  # noqa: E402


RUN_ID = "run_listener_test"
CONVERSATION_ID = "conversation-1"
NATIVE_ISSUE_ID = "native-task-1"


def _question(question_id: str, options: list[dict]) -> dict:
    return {
        "id": question_id,
        "prompt": question_id,
        "selectionMode": "single",
        "required": True,
        "options": options,
    }


def _interaction(interaction_id: str, status: str, questions: list[dict], answers: list[dict] | None = None) -> dict:
    return {
        "id": interaction_id,
        "kind": "ask_user_questions",
        "status": status,
        "createdAt": "2026-11-13T02:00:00Z",
        "updatedAt": "2026-11-13T02:10:00Z",
        "resolvedAt": "2026-11-13T02:10:00Z" if status == "answered" else None,
        "resolvedByUserId": "local-board" if status == "answered" else None,
        "payload": {"questions": questions},
        "result": {"answers": answers or []} if status == "answered" else None,
    }


def _baseline_answered() -> dict:
    return _interaction(
        "baseline",
        "answered",
        [
            _question("budget", [{"id": "budget_80_120", "label": "A — 80–120 triệu VNĐ"}]),
            _question("users", [{"id": "users_two", "label": "B — 2 trẻ"}]),
            _question("constraints", [{"id": "constraints_none", "label": "A — Không có"}]),
        ],
        [
            {"questionId": "budget", "optionIds": ["budget_80_120"]},
            {"questionId": "users", "optionIds": ["users_two"]},
            {"questionId": "constraints", "optionIds": ["constraints_none"]},
        ],
    )


def _design_questions(status: str = "pending", answer_count: int = 0) -> dict:
    questions = [
        _question("palette", [{"id": "A", "label": "A — Sage nhạt"}]),
        _question("materials", [{"id": "A", "label": "A — Laminate"}]),
        _question("ceiling_safety", [{"id": "B", "label": "B — Đề xuất 2 phương án"}]),
    ]
    selected = [
        {"questionId": "palette", "optionIds": ["A"]},
        {"questionId": "materials", "optionIds": ["A"]},
        {"questionId": "ceiling_safety", "optionIds": ["B"]},
    ][:answer_count]
    return _interaction("design", status, questions, selected)


def _native_pending() -> dict:
    free = [{"id": "paperclip_text_answer", "label": "Type an answer", "freeText": True}]
    return _interaction(
        "native-pending",
        "pending",
        [
            _question("space_geometry", free),
            _question("program_and_existing", free),
            _question("style_cost_constraints", free),
        ],
    )


def _plan_document() -> dict:
    return {
        "id": "plan-1",
        "key": "plan",
        "title": "DesignBrief & Decision Ledger",
        "latestRevisionId": "plan-rev-2",
        "latestRevisionNumber": 2,
        "createdByUserId": "local-board",
        "updatedByUserId": "local-board",
        "updatedAt": "2026-11-13T02:11:00Z",
        "body": """# Decision ledger

| Hạng mục | Trạng thái | Nội dung / bằng chứng |
|---|---|---|
| Loại không gian | confirmed | Phòng ngủ trẻ em có giường tầng. |
| Mặt bằng & kiến trúc | confirmed | Đã xác minh ảnh mặt bằng. |
| Kích thước nội thất bắt buộc | confirmed | Giường 1970×1200mm; bàn 1350×520mm. |
| Phong cách | confirmed | Hiện đại, ấm áp. |
| Màu sơn / bảng màu | unknown | Chưa chọn. |
| Vật liệu | unknown | Chưa chọn. |
| Cao độ trần / an toàn giường tầng | unknown | Chưa chốt. |
""",
    }


@pytest.fixture()
def isolated_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "atelier.db")
    db.init_db()
    run_doc = {
        "run_id": RUN_ID,
        "workflow_id": "wf",
        "project_id": "proj",
        "status": "WAITING_FOR_INPUT",
        "started_at": "2026-11-12T19:00:00Z",
        "workflow_snapshot": {
            "nodes": [
                {"id": "intake", "type": "input_intake", "agent_id": "agent_chief"},
                {"id": "floorplan", "type": "floorplan_cv", "agent_id": "agent_floorplan"},
            ],
            "edges": [{"source": "intake", "target": "floorplan"}],
        },
        "events": [{
            "node_id": "intake",
            "status": "WAITING_FOR_INPUT",
            "native_task_id": NATIVE_ISSUE_ID,
            "output": {"decision_ledger": {
                "loai_khong_gian": {"status": "unknown"},
                "cong_nang_noi_that_bat_buoc": {"status": "unknown"},
                "phong_cach": {"status": "unknown"},
                "mau_son_bang_mau": {"status": "unknown"},
                "vat_lieu": {"status": "unknown"},
                "ngan_sach": {"status": "unknown"},
                "do_giu_lai": {"status": "unknown"},
                "rang_buoc_dac_biet": {"status": "unknown"},
            }},
        }],
    }
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO workflow_runs (run_id, workflow_id, project_id, status, payload_json, updated_at) VALUES (?, 'wf', 'proj', 'WAITING_FOR_INPUT', ?, ?)",
        (RUN_ID, json.dumps(run_doc), db.now_iso()),
    )
    conn.execute(
        "INSERT INTO workflow_native_tasks (task_id, run_id, node_id, local_agent_id, native_agent_id, status, idempotency_key, payload_json, created_at, updated_at) VALUES (?, ?, 'intake', 'agent_chief', 'native-chief', 'in_review', ?, ?, ?, ?)",
        (
            NATIVE_ISSUE_ID,
            RUN_ID,
            f"{RUN_ID}:intake:native",
            json.dumps({"company_id": "company-1", "project_id": "paperclip-project-1"}),
            db.now_iso(),
            db.now_iso(),
        ),
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(sync, "get_agent_conversation", lambda *_: {"id": CONVERSATION_ID})
    monkeypatch.setattr(sync, "get_issue_comments", lambda _issue: [])
    monkeypatch.setattr(sync, "get_issue_document", lambda issue, _key="plan": _plan_document() if issue == CONVERSATION_ID else (_ for _ in ()).throw(PaperclipTaskError("missing")))
    return monkeypatch


def _wire_interactions(monkeypatch: pytest.MonkeyPatch, conversation: list[dict], native: list[dict]) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(sync, "get_issue_interactions", lambda issue: conversation if issue == CONVERSATION_ID else native)
    monkeypatch.setattr(sync, "respond_to_interaction", lambda issue, interaction, answers, **kwargs: calls.append({"issue": issue, "interaction": interaction, "answers": answers}) or {"status": "answered"})
    return calls


def test_01_existing_response_recovery(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions()], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert result["decisions"]["budget"]["answer_value"]["max_vnd"] == 120_000_000
    assert result["decisions"]["occupants"]["answer_value"]["count"] == 2
    assert result["decisions"]["retained_items"]["status"] == "VALIDATED"
    assert result["decisions"]["special_constraints"]["status"] == "VALIDATED"


def test_02_chat_answer_is_mapped_without_resume_command(isolated_runtime):
    isolated_runtime.setattr(sync, "get_issue_comments", lambda issue: [{
        "id": "comment-1", "authorType": "user", "authorUserId": "local-board",
        "createdAt": "2026-11-13T02:12:00Z",
        "body": "Tôi chọn gỗ sáng, trắng kem và xanh sage nhạt; plywood MDF chống ẩm phủ laminate. Cho phép đề xuất 2 phương án an toàn.",
    }] if issue == CONVERSATION_ID else [])
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions()], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert {"palette", "materials", "bunk_bed_safety"}.issubset(result["decisions"])
    assert result["missing_keys"] == []


def test_03_questions_answer_updates_all_three_decisions(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 3)], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert result["missing_keys"] == []
    assert result["decisions"]["palette"]["status"] == "VALIDATED"
    assert result["decisions"]["materials"]["status"] == "VALIDATED"
    assert result["decisions"]["bunk_bed_safety"]["status"] == "PROVISIONAL"


def test_04_native_interaction_is_resolved_from_validated_ledger(isolated_runtime):
    calls = _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 3)], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=True, sync_plan=False)
    assert result["resolved_native_interactions"] == ["native-pending"]
    assert len(calls) == 1
    assert len(calls[0]["answers"]) == 3


def test_05_partial_answers_keep_only_unanswered_key_pending(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 2)], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert result["missing_keys"] == []
    assert result["pending_question_keys"] == ["bunk_bed_safety"]
    assert result["decisions"]["palette"]["status"] == "VALIDATED"
    assert result["decisions"]["materials"]["status"] == "VALIDATED"


def test_06_answered_decisions_are_not_asked_again(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 3)], [_native_pending()])
    sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    state = sync.list_run_decisions(RUN_ID)
    assert state["wait_conditions"][0]["missing_keys"] == []
    assert state["wait_conditions"][0]["status"] == "READY"


def test_07_restart_reconciliation_reads_persisted_decisions(isolated_runtime):
    document = _plan_document()
    isolated_runtime.setattr(sync, "get_issue_document", lambda issue, _key="plan": document if issue == CONVERSATION_ID else (_ for _ in ()).throw(PaperclipTaskError("missing")))
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 3)], [_native_pending()])
    first = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    document["updatedAt"] = "2026-11-13T02:30:00Z"
    document["latestRevisionId"] = "plan-rev-machine-sync"
    second = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert first["decision_revision"] == second["decision_revision"]
    assert second["processed_events"] == 0
    assert second["missing_keys"] == []


def test_08_duplicate_input_event_is_exactly_once(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions()], [_native_pending()])
    sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    conn = db.get_conn()
    count = conn.execute("SELECT COUNT(*) AS c FROM workflow_decisions WHERE run_id = ?", (RUN_ID,)).fetchone()["c"]
    unique_count = conn.execute("SELECT COUNT(DISTINCT source_event_id || ':' || decision_key) AS c FROM workflow_decisions WHERE run_id = ?", (RUN_ID,)).fetchone()["c"]
    conn.close()
    assert count == unique_count


def test_09_native_response_claim_prevents_duplicate_wake(isolated_runtime):
    calls = _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions("answered", 3)], [_native_pending()])
    sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=True, sync_plan=False)
    sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=True, sync_plan=False)
    assert len(calls) == 1


def test_10_ambiguous_text_does_not_validate_missing_decisions(isolated_runtime):
    isolated_runtime.setattr(sync, "get_issue_comments", lambda issue: [{
        "id": "comment-vague", "authorType": "user", "authorUserId": "local-board",
        "createdAt": "2026-11-13T02:12:00Z", "body": "Làm đẹp và an toàn giúp tôi.",
    }] if issue == CONVERSATION_ID else [])
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions()], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert result["missing_keys"] == []
    assert result["pending_question_keys"] == ["bunk_bed_safety", "materials", "palette"]


def test_11_user_material_palette_and_safety_policy_preserve_provisional_status():
    text = """
    Bảng màu: trắng kem, be ấm, gỗ sồi sáng, điểm nhấn xanh pastel nhẹ.
    Vật liệu: ưu tiên gỗ công nghiệp đạt tiêu chuẩn phát thải phù hợp cho nội thất trẻ em,
    bề mặt dễ vệ sinh; sơn ít phát thải VOC, phụ kiện chắc chắn và bo tròn các cạnh tiếp xúc.
    An toàn giường tầng: chưa phê duyệt kích thước cấu tạo cuối. Agent phải đề xuất cao độ
    giường, chiều cao lan can, cầu thang và khoảng hở an toàn; trình tôi duyệt trước khi chốt.
    """
    decisions = {item.decision_key: item for item in sync.extract_text_decisions(
        text,
        answered_at="2026-11-13T03:00:00Z",
        user_id="local-board",
        source_message_id="user-decision-1",
    )}
    assert decisions["palette"].status == "VALIDATED"
    assert decisions["materials"].status == "VALIDATED"
    assert decisions["bunk_bed_safety"].status == "PROVISIONAL"
    assert decisions["materials"].answer_value.startswith("ưu tiên gỗ công nghiệp")
    assert "Bảng màu" not in decisions["materials"].answer_value
    assert decisions["bunk_bed_safety"].answer_value.startswith("chưa phê duyệt")


def test_12_node_scoped_contract_allows_geometry_but_blocks_final_export():
    run_doc = {"workflow_snapshot": {"nodes": []}, "events": []}
    decisions = {
        "space_type": {"status": "VALIDATED", "answer_value": "Phòng ngủ trẻ em có giường tầng"},
        "program": {"status": "VALIDATED", "answer_value": "Giường tầng 1970×1200mm"},
        "palette": {"status": "VALIDATED", "answer_value": "Trắng kem và xanh pastel"},
        "materials": {"status": "VALIDATED", "answer_value": "Gỗ công nghiệp ít phát thải"},
        "bunk_bed_safety": {"status": "PROVISIONAL", "answer_value": "Đề xuất rồi trình duyệt"},
    }
    floorplan = {"id": "renamed-floor", "type": "floorplan_cv", "config": {}}
    geometry = {"id": "renamed-geometry", "type": "pascal_geometry", "config": {}}
    style = {"id": "renamed-style", "type": "style_surface", "config": {}}
    final_export = {"id": "renamed-export", "type": "cad_export", "config": {}}
    assert sync.decision_contract_missing(sync.node_decision_contract(run_doc, decisions, node=floorplan), decisions) == []
    assert sync.decision_contract_missing(sync.node_decision_contract(run_doc, decisions, node=geometry), decisions) == []
    assert sync.decision_contract_missing(sync.node_decision_contract(run_doc, decisions, node=style), decisions) == []
    assert sync.decision_contract_missing(sync.node_decision_contract(run_doc, decisions, node=final_export), decisions) == ["bunk_bed_safety"]


def test_13_pending_questions_do_not_become_run_wide_gate(isolated_runtime):
    _wire_interactions(isolated_runtime, [_baseline_answered(), _design_questions()], [_native_pending()])
    result = sync.reconcile_workflow_inputs(RUN_ID, auto_respond_native=False, sync_plan=False)
    assert result["node_contract"]["node_type"] == "input_intake"
    assert result["required_keys"] == ["program", "space_type"]
    assert result["missing_keys"] == []
    assert result["pending_question_keys"] == ["bunk_bed_safety", "materials", "palette"]


def test_14_repeated_geometry_and_material_questions_resolve_from_existing_ledger():
    interaction = _interaction(
        "repeat",
        "pending",
        [
            _question("room_geometry", [{"id": "paperclip_text_answer", "label": "Type an answer", "freeText": True}]),
            _question("material_option", [{"id": "paperclip_text_answer", "label": "Type an answer", "freeText": True}]),
        ],
    )
    decisions = {
        "floorplan_geometry": {"status": "VALIDATED", "answer_value": "Floorplan Agent phân tích bản vẽ đính kèm"},
        "materials": {"status": "VALIDATED", "answer_value": "Gỗ công nghiệp ít phát thải, dễ vệ sinh"},
    }
    answers = sync._answers_for_native_interaction(interaction, decisions)
    assert [answer["questionId"] for answer in answers] == ["room_geometry", "material_option"]
    assert "floorplan_geometry" in answers[0]["otherText"]
    assert "materials" in answers[1]["otherText"]


def test_15_free_text_option_label_is_not_copied_into_decision_value():
    interaction = _interaction(
        "free-text",
        "answered",
        [_question("space_geometry", [{"id": "paperclip_text_answer", "label": "Type an answer", "freeText": True}])],
        [{"questionId": "space_geometry", "optionIds": ["paperclip_text_answer"], "otherText": "Phòng ngủ trẻ em có giường tầng"}],
    )
    decisions = sync.extract_interaction_decisions(interaction)
    assert decisions
    assert all("Type an answer" not in str(item.answer_value) for item in decisions)
