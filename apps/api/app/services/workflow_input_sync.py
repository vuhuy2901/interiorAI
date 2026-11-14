"""Durable human-input reconciliation for native workflow runs.

Paperclip remains the source of user-authored messages and interaction answers.
This module mirrors only evidenced decisions into the local workflow database,
tracks exactly-once source events and exposes the precise keys that still block
the current node.  It does not call an LLM and it never invents an answer.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from app.db import get_conn, now_iso
from app.services.paperclip_task_adapter import (
    PaperclipTaskError,
    get_agent_conversation,
    get_issue_comments,
    get_issue_document,
    get_issue_interactions,
    put_issue_document,
    respond_to_interaction,
)


FINAL_DECISION_STATUSES = {"VALIDATED"}
QUESTION_ANSWERED_STATUSES = {"VALIDATED", "PROVISIONAL"}

# Decision admission is scoped to the node being evaluated.  Snapshot config
# may override these defaults with ``required_decisions`` and
# ``allow_provisional_decisions``.  Node IDs and agent names are deliberately
# absent: published node type/config is the contract.
NODE_DECISION_CONTRACTS: Dict[str, Dict[str, tuple[str, ...]]] = {
    "input_intake": {
        "required": ("space_type", "program"),
        "allow_provisional": (),
    },
    "floorplan_cv": {
        "required": (),
        "allow_provisional": (),
    },
    "style_surface": {
        "required": ("palette", "materials"),
        "allow_provisional": (),
    },
    "pascal_geometry": {
        "required": (),
        "allow_provisional": ("bunk_bed_safety",),
    },
    "human_gate": {
        "required": (),
        "allow_provisional": (),
    },
    "cad_export": {
        "required": (),
        "allow_provisional": (),
    },
}
FINAL_SAFETY_NODE_TYPES = {"human_gate", "cad_export"}

QUESTION_REQUIREMENTS: Dict[str, tuple[str, ...]] = {
    "budget": ("budget",),
    "users": ("occupants",),
    "constraints": ("retained_items", "special_constraints"),
    "palette": ("palette",),
    "materials": ("materials",),
    "ceiling_safety": ("bunk_bed_safety",),
    "room_geometry": ("floorplan_geometry",),
    "material_option": ("materials",),
    "space_geometry": ("space_type", "floorplan_geometry"),
    "program_and_existing": ("program", "retained_items"),
    "style_cost_constraints": (
        "style",
        "palette",
        "materials",
        "budget",
        "special_constraints",
    ),
}

PLAN_ROW_KEYS = {
    "loai khong gian": "space_type",
    "mat bang & kien truc": "floorplan_geometry",
    "kich thuoc noi that bat buoc": "program",
    "cong nang / so nguoi su dung": "occupants",
    "phong cach": "style",
    "mau son / bang mau": "palette",
    "vat lieu": "materials",
    "ngan sach": "budget",
    "do giu lai": "retained_items",
    "rang buoc dac biet": "special_constraints",
    "cua so": "window_geometry",
    "cao do tran / an toan giuong tang": "bunk_bed_safety",
}


@dataclass(frozen=True)
class DecisionCandidate:
    decision_key: str
    answer_value: Any
    status: str
    question_id: Optional[str] = None
    interaction_id: Optional[str] = None
    answer_source: str = "paperclip"
    user_id: Optional[str] = None
    answered_at: Optional[str] = None
    source_message_id: Optional[str] = None


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    folded = "".join(ch for ch in text if not unicodedata.combining(ch)).lower().replace("đ", "d")
    return " ".join(folded.split())


def _labeled_value(text: str, *labels: str) -> Optional[str]:
    """Extract one Markdown/plain-text decision line without copying siblings."""
    folded_labels = tuple(_fold(label) for label in labels)
    for raw_line in (text or "").splitlines():
        cleaned = re.sub(r"^[\s#>*-]+", "", raw_line).replace("**", "").strip()
        if ":" not in cleaned:
            continue
        raw_label, raw_value = cleaned.split(":", 1)
        if _fold(raw_label) in folded_labels and raw_value.strip():
            return raw_value.strip()
    return None


def _parse_time(value: Optional[str]) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _event_id(run_id: str, source_type: str, source_record_id: str, source_timestamp: str) -> str:
    raw = f"{run_id}|{source_type}|{source_record_id}|{source_timestamp}".encode("utf-8")
    return "input_" + hashlib.sha256(raw).hexdigest()[:24]


def _answer_text(question: Dict[str, Any], answer: Dict[str, Any]) -> tuple[str, list[str]]:
    selected = [str(value) for value in answer.get("optionIds") or []]
    option_by_id = {str(item.get("id")): item for item in question.get("options") or []}
    labels = [
        str(option_by_id[item].get("label") or item)
        for item in selected
        if item in option_by_id and not option_by_id[item].get("freeText")
    ]
    other = str(answer.get("otherText") or "").strip()
    parts = labels + ([other] if other else [])
    return "; ".join(parts), selected


def _explicit_question_decisions(
    question: Dict[str, Any],
    answer: Dict[str, Any],
    *,
    interaction: Dict[str, Any],
) -> list[DecisionCandidate]:
    question_id = str(question.get("id") or answer.get("questionId") or "")
    text, selected = _answer_text(question, answer)
    timestamp = interaction.get("resolvedAt") or interaction.get("updatedAt") or now_iso()
    common = {
        "question_id": question_id,
        "interaction_id": interaction.get("id"),
        "answer_source": "paperclip_interaction",
        "user_id": interaction.get("resolvedByUserId") or "local-board",
        "answered_at": timestamp,
    }
    first = selected[0] if selected else ""
    if question_id == "budget":
        canonical = {
            "budget_80_120": {"label": "80–120 triệu VNĐ", "min_vnd": 80_000_000, "max_vnd": 120_000_000},
            "budget_120_180": {"label": "120–180 triệu VNĐ", "min_vnd": 120_000_000, "max_vnd": 180_000_000},
        }.get(first)
        return [DecisionCandidate("budget", canonical or text, "VALIDATED" if canonical or answer.get("otherText") else "ANSWERED", **common)]
    if question_id == "users":
        count = {"users_one": 1, "users_two": 2}.get(first)
        value: Any = {"count": count, "label": f"{count} trẻ"} if count else text
        return [DecisionCandidate("occupants", value, "VALIDATED" if count or answer.get("otherText") else "ANSWERED", **common)]
    if question_id == "constraints":
        if first == "constraints_none":
            return [
                DecisionCandidate("retained_items", {"items": [], "label": "Không có đồ nội thất giữ lại"}, "VALIDATED", **common),
                DecisionCandidate("special_constraints", {"items": [], "label": "Không có ràng buộc cửa đặc biệt"}, "VALIDATED", **common),
            ]
        return [
            DecisionCandidate("special_constraints", text, "VALIDATED" if answer.get("otherText") else "ANSWERED", **common),
        ]
    if question_id == "palette":
        value = {
            "A": "Gỗ sáng + trắng kem + xanh sage nhạt",
            "B": "Gỗ sáng + trắng ấm + xanh dương nhạt",
        }.get(first, str(answer.get("otherText") or text))
        return [DecisionCandidate("palette", value, "VALIDATED" if first in {"A", "B"} or answer.get("otherText") else "ANSWERED", **common)]
    if question_id == "materials":
        value = {
            "A": "Plywood/MDF chống ẩm phủ laminate, cạnh bo an toàn",
            "B": "Gỗ tự nhiên kết hợp MDF phủ sơn",
            "C": "Yêu cầu xem 2 phương án vật liệu trước",
        }.get(first, str(answer.get("otherText") or text))
        return [DecisionCandidate("materials", value, "VALIDATED" if first in {"A", "B", "C"} or answer.get("otherText") else "ANSWERED", **common)]
    if question_id == "ceiling_safety":
        value = {
            "A": "Người dùng sẽ cung cấp cao độ trần và kích thước giường/lan can",
            "B": "Cho phép đề xuất 2 phương án cấu tạo an toàn để người dùng duyệt",
            "C": "Điều chỉnh công năng, không dùng giường tầng hai tầng",
        }.get(first, str(answer.get("otherText") or text))
        folded_value = _fold(value)
        provisional = first == "B" or (
            "de xuat" in folded_value
            and ("duyet" in folded_value or "chua phe duyet" in folded_value)
        )
        status = "PROVISIONAL" if provisional else ("VALIDATED" if first in {"A", "C"} or answer.get("otherText") else "ANSWERED")
        return [DecisionCandidate("bunk_bed_safety", value, status, **common)]

    # Native free-text questions are decomposed deterministically.  The raw
    # answer is retained only for the directly corresponding aggregate keys.
    candidates = extract_text_decisions(text, answered_at=timestamp, user_id=common["user_id"], source_message_id=None)
    if question_id == "space_geometry" and text:
        candidates.extend([
            DecisionCandidate("space_type", text, "VALIDATED", **common),
            DecisionCandidate("floorplan_geometry", text, "VALIDATED", **common),
        ])
    elif question_id == "program_and_existing" and text:
        candidates.append(DecisionCandidate("program", text, "VALIDATED", **common))
    return candidates


def extract_interaction_decisions(interaction: Dict[str, Any]) -> list[DecisionCandidate]:
    if interaction.get("status") != "answered" or interaction.get("kind") != "ask_user_questions":
        return []
    questions = {
        str(item.get("id")): item
        for item in (interaction.get("payload") or {}).get("questions") or []
        if item.get("id")
    }
    result: list[DecisionCandidate] = []
    for answer in (interaction.get("result") or {}).get("answers") or []:
        question = questions.get(str(answer.get("questionId")))
        if question:
            result.extend(_explicit_question_decisions(question, answer, interaction=interaction))
    return result


def extract_text_decisions(
    text: str,
    *,
    answered_at: Optional[str],
    user_id: Optional[str],
    source_message_id: Optional[str],
) -> list[DecisionCandidate]:
    folded = _fold(text)
    common = {
        "answer_source": "paperclip_comment",
        "user_id": user_id,
        "answered_at": answered_at,
        "source_message_id": source_message_id,
    }
    result: list[DecisionCandidate] = []
    if re.search(r"80\s*[-–—]\s*120\s*(trieu|million)", folded):
        result.append(DecisionCandidate("budget", {"label": "80–120 triệu VNĐ", "min_vnd": 80_000_000, "max_vnd": 120_000_000}, "VALIDATED", **common))
    if re.search(r"\b(2|hai)\s*tre\b", folded):
        result.append(DecisionCandidate("occupants", {"count": 2, "label": "2 trẻ"}, "VALIDATED", **common))
    if "khong co do" in folded and ("giu lai" in folded or "noi that" in folded):
        result.append(DecisionCandidate("retained_items", {"items": [], "label": "Không có đồ nội thất giữ lại"}, "VALIDATED", **common))
    if "khong co rang buoc" in folded or "khong co rang buoc cua" in folded:
        result.append(DecisionCandidate("special_constraints", {"items": [], "label": "Không có ràng buộc cửa đặc biệt"}, "VALIDATED", **common))
    if "go sang" in folded and "trang kem" in folded and "sage" in folded:
        result.append(DecisionCandidate("palette", "Gỗ sáng + trắng kem + xanh sage nhạt", "VALIDATED", **common))
    elif "go sang" in folded and "trang am" in folded and "xanh duong nhat" in folded:
        result.append(DecisionCandidate("palette", "Gỗ sáng + trắng ấm + xanh dương nhạt", "VALIDATED", **common))
    elif all(token in folded for token in ("trang kem", "be am", "go soi sang", "xanh pastel")):
        result.append(DecisionCandidate(
            "palette",
            "Trắng kem, be ấm, gỗ sồi sáng, điểm nhấn xanh pastel nhẹ",
            "VALIDATED",
            **common,
        ))
    if ("plywood" in folded or "mdf chong am" in folded) and "laminate" in folded:
        result.append(DecisionCandidate("materials", "Plywood/MDF chống ẩm phủ laminate, cạnh bo an toàn", "VALIDATED", **common))
    elif "go tu nhien" in folded and "mdf" in folded and "son" in folded:
        result.append(DecisionCandidate("materials", "Gỗ tự nhiên kết hợp MDF phủ sơn", "VALIDATED", **common))
    elif (
        "go cong nghiep" in folded
        and "phat thai" in folded
        and ("de ve sinh" in folded or "de lau" in folded)
        and "voc" in folded
    ):
        result.append(DecisionCandidate(
            "materials",
            _labeled_value(text, "Vật liệu") or text.strip(),
            "VALIDATED",
            **common,
        ))
    if (
        ("de xuat 2 phuong an" in folded or "agent phai de xuat" in folded)
        and ("an toan" in folded or "lan can" in folded)
    ):
        result.append(DecisionCandidate(
            "bunk_bed_safety",
            _labeled_value(text, "An toàn giường tầng", "An toàn giường tầng — PROVISIONAL") or text.strip(),
            "PROVISIONAL",
            **common,
        ))
    elif "chua phe duyet" in folded and "giuong tang" in folded and "trinh" in folded and "duyet" in folded:
        result.append(DecisionCandidate(
            "bunk_bed_safety",
            _labeled_value(text, "An toàn giường tầng", "An toàn giường tầng — PROVISIONAL") or text.strip(),
            "PROVISIONAL",
            **common,
        ))
    elif "khong dung giuong tang" in folded:
        result.append(DecisionCandidate("bunk_bed_safety", "Điều chỉnh công năng, không dùng giường tầng hai tầng", "VALIDATED", **common))
    elif "cao do tran" in folded and ("lan can" in folded or "chieu cao giuong" in folded):
        result.append(DecisionCandidate("bunk_bed_safety", text.strip(), "VALIDATED", **common))
    return result


def extract_plan_decisions(document: Dict[str, Any]) -> list[DecisionCandidate]:
    body = str(document.get("body") or "")
    timestamp = document.get("updatedAt") or now_iso()
    result: list[DecisionCandidate] = []
    for raw_line in body.splitlines():
        if not raw_line.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in raw_line.strip().strip("|").split("|")]
        if len(cells) != 3:
            continue
        label, status, value = cells
        key = PLAN_ROW_KEYS.get(_fold(label))
        if not key or not _fold(status).startswith("confirmed"):
            continue
        decision_status = "ANSWERED" if "mot phan" in _fold(status) else "VALIDATED"
        result.append(DecisionCandidate(
            key,
            value,
            decision_status,
            answer_source="paperclip_plan_document",
            user_id=document.get("updatedByUserId") or document.get("createdByUserId"),
            answered_at=timestamp,
            source_message_id=document.get("id"),
        ))
    return result


def _insert_source_event(
    conn: Any,
    *,
    run_id: str,
    project_id: str,
    source_type: str,
    source_record_id: str,
    source_timestamp: str,
    payload: Dict[str, Any],
) -> tuple[str, bool]:
    event_id = _event_id(run_id, source_type, source_record_id, source_timestamp)
    before = conn.total_changes
    conn.execute(
        "INSERT OR IGNORE INTO workflow_input_events (event_id, run_id, project_id, source_type, source_record_id, source_timestamp, payload_json, processing_status, error, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSED', NULL, ?)",
        (event_id, run_id, project_id, source_type, source_record_id, source_timestamp, json.dumps(payload, ensure_ascii=False, default=str), now_iso()),
    )
    return event_id, conn.total_changes > before


def _record_decision(conn: Any, run_id: str, project_id: str, event_id: str, candidate: DecisionCandidate) -> bool:
    duplicate = conn.execute(
        "SELECT decision_id FROM workflow_decisions WHERE run_id = ? AND source_event_id = ? AND decision_key = ?",
        (run_id, event_id, candidate.decision_key),
    ).fetchone()
    if duplicate:
        return False
    previous = conn.execute(
        "SELECT * FROM workflow_decisions WHERE run_id = ? AND decision_key = ? ORDER BY revision DESC LIMIT 1",
        (run_id, candidate.decision_key),
    ).fetchone()
    revision = (int(previous["revision"]) if previous else 0) + 1
    status = candidate.status
    answered_at = candidate.answered_at or now_iso()
    if previous and previous["status"] == "VALIDATED" and status == "VALIDATED":
        if _parse_time(answered_at) < _parse_time(previous["answered_at"]):
            status = "SUPERSEDED"
        elif _parse_time(answered_at) == _parse_time(previous["answered_at"]) and candidate.answer_value != json.loads(previous["answer_value_json"]):
            status = "CONFLICTED"
        else:
            conn.execute("UPDATE workflow_decisions SET status = 'SUPERSEDED' WHERE decision_id = ?", (previous["decision_id"],))
    validated_at = now_iso() if status == "VALIDATED" else None
    conn.execute(
        "INSERT INTO workflow_decisions (decision_id, run_id, project_id, decision_key, interaction_id, question_id, answer_value_json, answer_source, user_id, answered_at, validated_at, status, source_message_id, source_event_id, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            f"dec_{uuid.uuid4().hex[:20]}", run_id, project_id, candidate.decision_key,
            candidate.interaction_id, candidate.question_id,
            json.dumps(candidate.answer_value, ensure_ascii=False, default=str), candidate.answer_source,
            candidate.user_id, answered_at, validated_at, status, candidate.source_message_id,
            event_id, revision, now_iso(),
        ),
    )
    return True


def _latest_decisions(conn: Any, run_id: str) -> Dict[str, Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT * FROM (
            SELECT d.*,
                   ROW_NUMBER() OVER (
                       PARTITION BY decision_key
                       ORDER BY answered_at DESC, revision DESC
                   ) AS decision_rank
            FROM workflow_decisions d
            WHERE run_id = ? AND status != 'SUPERSEDED'
        ) ranked
        WHERE decision_rank = 1
        ORDER BY decision_key
        """,
        (run_id,),
    ).fetchall()
    return {
        row["decision_key"]: {
            **dict(row),
            "answer_value": json.loads(row["answer_value_json"]),
        }
        for row in rows
    }


def _interaction_required_keys(interaction: Dict[str, Any]) -> set[str]:
    if interaction.get("kind") != "ask_user_questions":
        return set()
    keys: set[str] = set()
    for question in (interaction.get("payload") or {}).get("questions") or []:
        if question.get("required", True):
            keys.update(QUESTION_REQUIREMENTS.get(str(question.get("id")), ()))
    return keys


def _active_node(run_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    events = run_doc.get("events") or []
    active_event = next(
        (
            event for event in reversed(events)
            if event.get("status") in {"WAITING_FOR_INPUT", "WAITING_FOR_AGENT", "READY", "RUNNING"}
        ),
        None,
    )
    if not active_event:
        return None
    node_id = str(active_event.get("node_id") or "")
    return next(
        (node for node in (run_doc.get("workflow_snapshot") or {}).get("nodes") or [] if str(node.get("id")) == node_id),
        None,
    )


def _project_has_bunk_bed(decisions: Dict[str, Dict[str, Any]]) -> bool:
    for key in ("space_type", "program"):
        decision = decisions.get(key)
        if decision and "giuong tang" in _fold(_decision_value_text(decision)):
            return True
    return False


def node_decision_contract(
    run_doc: Dict[str, Any],
    decisions: Dict[str, Dict[str, Any]],
    *,
    node: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    current = node or _active_node(run_doc)
    if not current:
        return {"node_id": "__run__", "node_type": None, "required_keys": [], "allow_provisional_keys": []}
    node_type = str(current.get("type") or "")
    defaults = NODE_DECISION_CONTRACTS.get(node_type, {"required": (), "allow_provisional": ()})
    config = current.get("config") or {}
    required = set(config.get("required_decisions", defaults["required"]))
    allow_provisional = set(config.get("allow_provisional_decisions", defaults["allow_provisional"]))
    if _project_has_bunk_bed(decisions):
        if node_type == "pascal_geometry":
            required.add("bunk_bed_safety")
            allow_provisional.add("bunk_bed_safety")
        elif node_type in FINAL_SAFETY_NODE_TYPES:
            required.add("bunk_bed_safety")
            allow_provisional.discard("bunk_bed_safety")
    return {
        "node_id": str(current.get("id") or "__run__"),
        "node_type": node_type,
        "required_keys": sorted(str(key) for key in required),
        "allow_provisional_keys": sorted(str(key) for key in allow_provisional),
    }


def decision_contract_missing(contract: Dict[str, Any], decisions: Dict[str, Dict[str, Any]]) -> list[str]:
    allow_provisional = set(contract.get("allow_provisional_keys") or [])
    missing: list[str] = []
    for key in contract.get("required_keys") or []:
        status = str((decisions.get(key) or {}).get("status") or "UNKNOWN")
        if status in FINAL_DECISION_STATUSES:
            continue
        if key in allow_provisional and status == "PROVISIONAL":
            continue
        missing.append(str(key))
    return sorted(missing)


def _paperclip_context(conn: Any, run_id: str) -> Dict[str, Any]:
    rows = conn.execute(
        "SELECT task_id, native_agent_id, payload_json FROM workflow_native_tasks WHERE run_id = ? ORDER BY created_at",
        (run_id,),
    ).fetchall()
    company_id = None
    paperclip_project_id = None
    issue_ids: set[str] = set()
    agent_ids: set[str] = set()
    for row in rows:
        payload = json.loads(row["payload_json"])
        company_id = company_id or payload.get("company_id")
        paperclip_project_id = paperclip_project_id or payload.get("project_id")
        issue_ids.add(row["task_id"])
        if row["native_agent_id"]:
            agent_ids.add(row["native_agent_id"])
    if company_id:
        for agent_id in agent_ids:
            conversation = get_agent_conversation(str(company_id), str(agent_id))
            if conversation and conversation.get("id"):
                issue_ids.add(str(conversation["id"]))
    return {
        "company_id": company_id,
        "paperclip_project_id": paperclip_project_id,
        "native_issue_ids": {row["task_id"] for row in rows},
        "issue_ids": issue_ids,
    }


def _decision_value_text(decision: Dict[str, Any]) -> str:
    value = decision.get("answer_value")
    if isinstance(value, dict):
        return str(value.get("label") or json.dumps(value, ensure_ascii=False, sort_keys=True))
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return str(value)


def _answers_for_native_interaction(interaction: Dict[str, Any], decisions: Dict[str, Dict[str, Any]]) -> list[Dict[str, Any]]:
    answers: list[Dict[str, Any]] = []
    for question in (interaction.get("payload") or {}).get("questions") or []:
        question_id = str(question.get("id") or "")
        keys = QUESTION_REQUIREMENTS.get(question_id, ())
        if not keys or any(key not in decisions or decisions[key]["status"] not in QUESTION_ANSWERED_STATUSES for key in keys):
            continue
        summary = "; ".join(f"{key}: {_decision_value_text(decisions[key])}" for key in keys)
        free_text = next((item for item in question.get("options") or [] if item.get("freeText")), None)
        option_ids = [str(free_text["id"])] if free_text else []
        answers.append({"questionId": question_id, "optionIds": option_ids, "otherText": summary})
    return answers


def _claim_native_response(conn: Any, run_id: str, project_id: str, interaction: Dict[str, Any]) -> bool:
    source_record_id = str(interaction.get("id"))
    existing = conn.execute(
        "SELECT processing_status FROM workflow_input_events WHERE run_id = ? AND source_type = 'native_interaction_response' AND source_record_id = ? ORDER BY source_timestamp DESC LIMIT 1",
        (run_id, source_record_id),
    ).fetchone()
    if existing and existing["processing_status"] in {"CLAIMED", "PROCESSED"}:
        return False
    timestamp = now_iso()
    event_id = _event_id(run_id, "native_interaction_response", source_record_id, timestamp)
    if existing:
        conn.execute(
            "UPDATE workflow_input_events SET event_id = ?, source_timestamp = ?, processing_status = 'CLAIMED', error = NULL, processed_at = ? WHERE run_id = ? AND source_type = 'native_interaction_response' AND source_record_id = ?",
            (event_id, timestamp, timestamp, run_id, source_record_id),
        )
    else:
        conn.execute(
            "INSERT INTO workflow_input_events (event_id, run_id, project_id, source_type, source_record_id, source_timestamp, payload_json, processing_status, error, processed_at) VALUES (?, ?, ?, 'native_interaction_response', ?, ?, ?, 'CLAIMED', NULL, ?)",
            (event_id, run_id, project_id, source_record_id, timestamp, json.dumps(interaction, ensure_ascii=False, default=str), timestamp),
        )
    conn.commit()
    return True


def _finish_native_response(conn: Any, run_id: str, interaction_id: str, *, error: Optional[str]) -> None:
    conn.execute(
        "UPDATE workflow_input_events SET processing_status = ?, error = ?, processed_at = ? WHERE run_id = ? AND source_type = 'native_interaction_response' AND source_record_id = ?",
        ("FAILED" if error else "PROCESSED", error, now_iso(), run_id, interaction_id),
    )
    conn.commit()


def _sync_plan_document(
    issue_id: str,
    document: Dict[str, Any],
    run_id: str,
    decisions: Dict[str, Dict[str, Any]],
    missing_keys: list[str],
) -> Optional[Dict[str, Any]]:
    start = f"<!-- ATELIER_WORKFLOW_DECISIONS:{run_id} -->"
    end = f"<!-- /ATELIER_WORKFLOW_DECISIONS:{run_id} -->"
    lines = [
        start,
        f"## Workflow decision sync — `{run_id}`",
        "",
        "| Decision key | Status | Value | Revision | Source |",
        "|---|---|---|---:|---|",
    ]
    for key, decision in sorted(decisions.items()):
        value = _decision_value_text(decision).replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {key} | {decision['status']} | {value} | {decision['revision']} | {decision['answer_source']} |")
    lines.extend(["", f"Missing required decisions: `{', '.join(missing_keys) if missing_keys else 'none'}`", end])
    section = "\n".join(lines)
    body = str(document.get("body") or "")
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    updated_body = pattern.sub(section, body) if pattern.search(body) else body.rstrip() + "\n\n" + section + "\n"
    if updated_body == body:
        return None
    return put_issue_document(
        issue_id,
        str(document.get("key") or "plan"),
        title=str(document.get("title") or "DesignBrief & Decision Ledger"),
        body=updated_body,
        base_revision_id=document.get("latestRevisionId"),
    )


def list_run_decisions(run_id: str) -> Dict[str, Any]:
    conn = get_conn()
    try:
        decisions = _latest_decisions(conn, run_id)
        waits = [dict(row) for row in conn.execute(
            "SELECT * FROM workflow_wait_conditions WHERE run_id = ? ORDER BY node_id",
            (run_id,),
        ).fetchall()]
        for row in waits:
            row["required_keys"] = json.loads(row.pop("required_keys_json"))
            row["missing_keys"] = json.loads(row.pop("missing_keys_json"))
            row["source"] = json.loads(row.pop("source_json"))
        return {"run_id": run_id, "decisions": decisions, "wait_conditions": waits}
    finally:
        conn.close()


def reconcile_workflow_inputs(run_id: str, *, auto_respond_native: bool = True, sync_plan: bool = True) -> Dict[str, Any]:
    conn = get_conn()
    run_row = conn.execute("SELECT payload_json FROM workflow_runs WHERE run_id = ?", (run_id,)).fetchone()
    if not run_row:
        conn.close()
        raise ValueError(f"Không tìm thấy workflow run: {run_id}")
    run_doc = json.loads(run_row["payload_json"])
    project_id = str(run_doc.get("project_id") or "")
    if not project_id:
        conn.close()
        return {"run_id": run_id, "status": "SKIPPED_NO_PROJECT", "missing_keys": []}
    run_started_at = _parse_time(run_doc.get("started_at"))
    try:
        context = _paperclip_context(conn, run_id)
    except PaperclipTaskError as exc:
        conn.close()
        return {"run_id": run_id, "status": "SYNC_ERROR", "error": str(exc), "missing_keys": []}
    issue_ids = sorted(context["issue_ids"])
    native_issue_ids = set(context["native_issue_ids"])
    question_keys: set[str] = set()
    pending_native: list[tuple[str, Dict[str, Any]]] = []
    plan_documents: list[tuple[str, Dict[str, Any]]] = []
    processed_events = 0
    inserted_decisions = 0

    for issue_id in issue_ids:
        try:
            interactions = get_issue_interactions(issue_id)
            comments = get_issue_comments(issue_id)
        except PaperclipTaskError:
            continue
        for interaction in interactions:
            timestamp = interaction.get("resolvedAt") or interaction.get("updatedAt") or interaction.get("createdAt") or now_iso()
            if _parse_time(timestamp) < run_started_at:
                continue
            question_keys.update(_interaction_required_keys(interaction))
            if issue_id in native_issue_ids and interaction.get("status") == "pending":
                pending_native.append((issue_id, interaction))
            candidates = extract_interaction_decisions(interaction)
            if not candidates:
                continue
            source_record_id = f"{interaction.get('id')}:{interaction.get('updatedAt') or timestamp}"
            event_id, inserted = _insert_source_event(
                conn, run_id=run_id, project_id=project_id, source_type="paperclip_interaction",
                source_record_id=source_record_id, source_timestamp=timestamp, payload=interaction,
            )
            if not inserted:
                continue
            processed_events += 1
            for candidate in candidates:
                inserted_decisions += int(_record_decision(conn, run_id, project_id, event_id, candidate))
        for comment in comments:
            timestamp = comment.get("createdAt") or now_iso()
            if _parse_time(timestamp) < run_started_at or comment.get("authorType") != "user":
                continue
            candidates = extract_text_decisions(
                str(comment.get("body") or ""), answered_at=timestamp,
                user_id=comment.get("authorUserId"), source_message_id=comment.get("id"),
            )
            if not candidates:
                continue
            event_id, inserted = _insert_source_event(
                conn, run_id=run_id, project_id=project_id, source_type="paperclip_comment",
                source_record_id=str(comment.get("id")), source_timestamp=timestamp, payload=comment,
            )
            if not inserted:
                continue
            processed_events += 1
            for candidate in candidates:
                inserted_decisions += int(_record_decision(conn, run_id, project_id, event_id, candidate))
        try:
            document = get_issue_document(issue_id, "plan")
        except PaperclipTaskError:
            document = None
        if document and _parse_time(document.get("updatedAt")) >= run_started_at:
            plan_documents.append((issue_id, document))
            timestamp = document.get("updatedAt") or now_iso()
            candidates = extract_plan_decisions(document)
            if candidates:
                evidence_fingerprint = hashlib.sha256(json.dumps(
                    [(item.decision_key, item.status, item.answer_value) for item in candidates],
                    ensure_ascii=False,
                    sort_keys=True,
                    default=str,
                ).encode("utf-8")).hexdigest()[:20]
                document_id = str(document.get("id") or "")
                first_evidence = conn.execute(
                    "SELECT MIN(source_timestamp) AS first_seen FROM workflow_input_events WHERE run_id = ? AND source_type = 'paperclip_plan_document' AND source_record_id LIKE ?",
                    (run_id, f"{document_id}:%"),
                ).fetchone()
                evidence_timestamp = (first_evidence["first_seen"] if first_evidence and first_evidence["first_seen"] else timestamp)
                candidates = [replace(item, answered_at=evidence_timestamp) for item in candidates]
                # Updating the display section creates a newer Paperclip
                # revision, but it must not rewrite the time of the original
                # human evidence rows.
                conn.execute(
                    "UPDATE workflow_decisions SET answered_at = ? WHERE run_id = ? AND answer_source = 'paperclip_plan_document' AND source_message_id = ? AND answered_at > ?",
                    (evidence_timestamp, run_id, document_id, evidence_timestamp),
                )
                # A machine-generated ledger section may create a new Paperclip
                # document revision without changing the user's evidence rows.
                # Key the source by that evidence so reconciliation cannot feed
                # its own display update back into new decision revisions.
                source_record_id = f"{document_id}:{evidence_fingerprint}"
                event_id, inserted = _insert_source_event(
                    conn, run_id=run_id, project_id=project_id, source_type="paperclip_plan_document",
                    source_record_id=source_record_id, source_timestamp=timestamp, payload=document,
                )
                if inserted:
                    processed_events += 1
                    for candidate in candidates:
                        inserted_decisions += int(_record_decision(conn, run_id, project_id, event_id, candidate))

    conn.commit()
    decisions = _latest_decisions(conn, run_id)
    contract = node_decision_contract(run_doc, decisions)
    required_keys = set(contract["required_keys"])
    missing_keys = decision_contract_missing(contract, decisions)
    pending_question_keys = sorted(
        key for key in question_keys
        if key not in decisions or decisions[key]["status"] not in QUESTION_ANSWERED_STATUSES
    )
    provisional_keys = sorted(key for key, item in decisions.items() if item["status"] == "PROVISIONAL")
    node_id = str(contract["node_id"])
    wait_status = "READY" if not missing_keys else "WAITING_FOR_INPUT"
    source = {
        "paperclip_issue_ids": issue_ids,
        "native_issue_ids": sorted(native_issue_ids),
        "paperclip_project_id": context.get("paperclip_project_id"),
        "node_type": contract["node_type"],
        "allow_provisional_keys": contract["allow_provisional_keys"],
        "pending_question_keys": pending_question_keys,
    }
    conn.execute(
        "INSERT INTO workflow_wait_conditions (run_id, node_id, required_keys_json, missing_keys_json, source_json, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id, node_id) DO UPDATE SET required_keys_json=excluded.required_keys_json, missing_keys_json=excluded.missing_keys_json, source_json=excluded.source_json, status=excluded.status, updated_at=excluded.updated_at",
        (run_id, node_id, json.dumps(sorted(required_keys), ensure_ascii=False), json.dumps(missing_keys, ensure_ascii=False), json.dumps(source, ensure_ascii=False), wait_status, now_iso()),
    )
    run_doc["decision_revision"] = max((int(item["revision"]) for item in decisions.values()), default=0)
    run_doc["decision_ledger"] = {
        key: {"status": item["status"], "value": item["answer_value"], "revision": item["revision"], "source": item["answer_source"]}
        for key, item in decisions.items()
    }
    run_doc["waiting_for"] = {
        "node_id": node_id,
        "node_type": contract["node_type"],
        "required_decisions": sorted(required_keys),
        "allow_provisional_decisions": contract["allow_provisional_keys"],
        "missing_decisions": missing_keys,
        "pending_question_decisions": pending_question_keys,
        "provisional_decisions": provisional_keys,
    }
    run_doc["input_reconciled_at"] = now_iso()
    conn.execute(
        "UPDATE workflow_runs SET payload_json = ?, updated_at = ? WHERE run_id = ?",
        (json.dumps(run_doc, ensure_ascii=False), run_doc["input_reconciled_at"], run_id),
    )
    conn.commit()

    resolved_native: list[str] = []
    response_errors: list[Dict[str, str]] = []
    if auto_respond_native:
        for issue_id, interaction in pending_native:
            answers = _answers_for_native_interaction(interaction, decisions)
            required_question_count = sum(
                1 for question in (interaction.get("payload") or {}).get("questions") or []
                if question.get("required", True)
            )
            if len(answers) != required_question_count or not _claim_native_response(conn, run_id, project_id, interaction):
                continue
            try:
                respond_to_interaction(
                    issue_id,
                    str(interaction["id"]),
                    answers,
                    summary_markdown=f"Đồng bộ từ {len(decisions)} quyết định người dùng đã xác minh cho workflow run `{run_id}`.",
                )
                _finish_native_response(conn, run_id, str(interaction["id"]), error=None)
                resolved_native.append(str(interaction["id"]))
            except PaperclipTaskError as exc:
                _finish_native_response(conn, run_id, str(interaction["id"]), error=str(exc))
                response_errors.append({"interaction_id": str(interaction.get("id")), "error": str(exc)})

    plan_updates: list[str] = []
    if sync_plan and (inserted_decisions or missing_keys):
        for issue_id, document in plan_documents:
            try:
                updated = _sync_plan_document(issue_id, document, run_id, decisions, missing_keys)
                if updated:
                    plan_updates.append(issue_id)
            except PaperclipTaskError:
                continue

    conn.close()
    return {
        "run_id": run_id,
        "status": wait_status,
        "processed_events": processed_events,
        "inserted_decisions": inserted_decisions,
        "decision_revision": run_doc["decision_revision"],
        "decisions": decisions,
        "required_keys": sorted(required_keys),
        "missing_keys": missing_keys,
        "pending_question_keys": pending_question_keys,
        "provisional_keys": provisional_keys,
        "node_contract": contract,
        "resolved_native_interactions": resolved_native,
        "native_response_errors": response_errors,
        "plan_updates": plan_updates,
        "source": source,
    }
