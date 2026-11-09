from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SkillDefinition(BaseModel):
    skill_id: str
    label: str
    assigned_agent: str
    examples: List[str]
    requires_approval: bool = False
    required_slots: List[str] = Field(default_factory=list)
    validators: List[str] = Field(default_factory=list)


class SkillRouteResult(BaseModel):
    skill_id: str = "conversation.general"
    confidence: float = 0.0
    assigned_agent: str = "agent_chief_architect"
    slots: Dict[str, Any] = Field(default_factory=dict)
    missing_slots: List[str] = Field(default_factory=list)
    requires_clarification: bool = False
    clarification_question: Optional[str] = None
    clarification_choices: List[str] = Field(default_factory=list)
    requires_approval: bool = False
    matched_terms: List[str] = Field(default_factory=list)


SKILLS: List[SkillDefinition] = [
    SkillDefinition(skill_id="decor.add_plant", label="Thêm chậu hoa hoặc cây trang trí", assigned_agent="agent_furniture", examples=["thêm chậu hoa trên bàn trà", "đặt cây cảnh lên bàn", "bổ sung chậu cây nhỏ"], requires_approval=True, required_slots=["decor_type", "placement"], validators=["support_surface_exists", "object_fits_surface", "walkway_at_least_750mm"]),
    SkillDefinition(skill_id="furniture.add_television", label="Thêm hoặc cập nhật TV", assigned_agent="agent_furniture", examples=["thêm TV 55 inch trên kệ", "đặt tivi lên kệ TV", "gắn màn hình 65 inch"], requires_approval=True, required_slots=["size_inch", "placement"], validators=["cabinet_exists", "tv_fits_cabinet", "window_not_blocked", "walkway_at_least_750mm"]),
    SkillDefinition(skill_id="furniture.replace_sofa", label="Thay sofa", assigned_agent="agent_furniture", examples=["đổi sofa nhỏ hơn 1.8m", "thay ghế sofa", "sofa hiện tại quá to"], requires_approval=True, validators=["room_fit", "walkway_at_least_750mm"]),
    SkillDefinition(skill_id="surface.change_material", label="Đổi sơn hoặc vật liệu", assigned_agent="agent_material", examples=["đổi sơn tường", "lát gạch 800x800", "đổi sàn gỗ"], requires_approval=True, validators=["material_exists", "cost_recalculated"]),
    SkillDefinition(skill_id="qa.check_clearance", label="Kiểm tra lối đi và va chạm", assigned_agent="agent_qa", examples=["kiểm tra lối đi", "cửa có bị vướng không", "kiểm tra va chạm"], validators=["walkway_at_least_750mm", "door_swing_clear"]),
    SkillDefinition(skill_id="design.generate_options", label="Tạo phương án A/B/C", assigned_agent="agent_chief_architect", examples=["tạo 3 phương án", "đề xuất bố trí A B C", "thiết kế Japandi"], requires_approval=True),
    SkillDefinition(skill_id="cost.recalculate", label="Tính lại dự toán", assigned_agent="agent_cost", examples=["tính lại giá", "kiểm tra ngân sách", "cập nhật BOQ"]),
    SkillDefinition(skill_id="inventory.generate_bom", label="Lập danh mục vật tư", assigned_agent="agent_inventory", examples=["xuất BOM", "bóc tách vật tư", "danh mục nội thất"]),
    SkillDefinition(skill_id="furniture.add_generic", label="Thêm nội thất", assigned_agent="agent_furniture", examples=["thêm một món nội thất", "đặt đồ vào phòng"], requires_approval=True, required_slots=["furniture_type", "placement"]),
]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().strip())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.replace("đ", "d")
    return re.sub(r"\s+", " ", value)


def _has(text: str, terms: List[str]) -> List[str]:
    return [term for term in terms if normalize_text(term) in text]


def route_user_request(user_text: str, project: Any = None) -> SkillRouteResult:
    text = normalize_text(user_text)
    size_match = re.search(r"\b(\d{2,3})\s*(?:inch|in|\")", text)
    placement = "wall" if _has(text, ["treo tường", "gắn tường", "ốp tường"]) else "tv_cabinet" if _has(text, ["trên kệ", "kệ tv", "kệ tivi"]) else None

    plant_terms = _has(text, ["chậu hoa", "chậu cây", "cây cảnh", "cây xanh", "bình hoa", "lọ hoa"])
    if plant_terms:
        decor_placement = "coffee_table" if _has(text, ["bàn trà", "bàn cafe", "bàn cà phê"]) else "floor_corner"
        return SkillRouteResult(
            skill_id="decor.add_plant", confidence=0.97 if decor_placement == "coffee_table" else 0.86,
            assigned_agent="agent_furniture", slots={"decor_type": "flower_pot", "placement": decor_placement},
            requires_approval=True, matched_terms=plant_terms,
        )

    tv_terms = _has(text, ["tv", "tivi", "ti vi", "television", "màn hình"])
    if tv_terms:
        slots: Dict[str, Any] = {"size_inch": int(size_match.group(1)) if size_match else 55, "placement": placement or "tv_cabinet"}
        return SkillRouteResult(skill_id="furniture.add_television", confidence=0.98 if placement or size_match else 0.86, assigned_agent="agent_furniture", slots=slots, requires_approval=True, matched_terms=tv_terms)

    sofa_terms = _has(text, ["sofa", "ghế sofa", "ghế văng"])
    if sofa_terms and _has(text, ["đổi", "thay", "nhỏ hơn", "quá to", "hơi to"]):
        width = re.search(r"(\d(?:[\.,]\d)?)\s*m", text)
        return SkillRouteResult(skill_id="furniture.replace_sofa", confidence=0.96, assigned_agent="agent_furniture", slots={"max_width_mm": int(float(width.group(1).replace(",", ".")) * 1000) if width else 1800}, requires_approval=True, matched_terms=sofa_terms)

    material_terms = _has(text, ["sơn", "màu tường", "gạch", "sàn gỗ", "lát sàn", "vật liệu", "teal", "sage"])
    if material_terms:
        return SkillRouteResult(skill_id="surface.change_material", confidence=0.9, assigned_agent="agent_material", slots={}, requires_approval=True, matched_terms=material_terms)

    bom_terms = _has(text, ["bom", "bóc tách", "danh mục", "danh sách vật tư", "bảng kê"])
    if bom_terms:
        return SkillRouteResult(skill_id="inventory.generate_bom", confidence=0.95, assigned_agent="agent_inventory", matched_terms=bom_terms)

    cost_terms = _has(text, ["dự toán", "tính lại giá", "ngân sách", "chi phí", "boq"])
    if cost_terms and not _has(text, ["thêm", "đổi", "thay"]):
        return SkillRouteResult(skill_id="cost.recalculate", confidence=0.88, assigned_agent="agent_cost", matched_terms=cost_terms)

    qa_terms = _has(text, ["lối đi", "va chạm", "vướng cửa", "cửa mở", "thông thủy"])
    if qa_terms:
        return SkillRouteResult(skill_id="qa.check_clearance", confidence=0.92, assigned_agent="agent_qa", matched_terms=qa_terms)

    option_terms = _has(text, ["phương án", "a/b/c", "3 phương án", "bố trí", "thiết kế"])
    if option_terms:
        return SkillRouteResult(skill_id="design.generate_options", confidence=0.82, assigned_agent="agent_chief_architect", requires_approval=True, matched_terms=option_terms)

    add_terms = _has(text, ["thêm", "bổ sung", "đặt một", "mua một"])
    if add_terms:
        return SkillRouteResult(
            skill_id="furniture.add_generic", confidence=0.58, assigned_agent="agent_furniture",
            missing_slots=["furniture_type", "placement"], requires_clarification=True,
            clarification_question="Bạn muốn thêm loại nội thất nào và đặt ở vị trí nào trong phòng?",
            clarification_choices=["Sofa / ghế", "TV / thiết bị", "Bàn / tủ", "Đèn / trang trí"],
            requires_approval=True, matched_terms=add_terms,
        )

    return SkillRouteResult(
        skill_id="conversation.general", confidence=0.35, assigned_agent="agent_chief_architect",
        requires_clarification=True,
        clarification_question="Bạn muốn hệ thống tư vấn, kiểm tra hiện trạng hay thay đổi đối tượng nào trong dự án?",
        clarification_choices=["Tạo phương án bố trí", "Thay đổi nội thất", "Đổi vật liệu", "Kiểm tra dự toán"],
    )


def list_skills() -> List[Dict[str, Any]]:
    return [skill.model_dump() for skill in SKILLS]
