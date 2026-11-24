"""Phong cách mặc định + câu hỏi lựa chọn hoàn thiện (sơn, sàn, trần, ánh sáng...).

Quy tắc sản phẩm:
- Phong cách mặc định là Hiện đại (Modern). Japandi (hay style khác) chỉ khi người dùng nói rõ.
- Agent HỎI người dùng thay vì tự chọn màu sơn/sàn/trần/ánh sáng/tông gỗ; tối đa 3 câu mỗi lượt.
- Trả lời được lưu thành decision trong ``design_brief.finish_decisions`` (VALIDATED).
  Chưa trả lời thì phương án dựng với giá trị ĐỀ XUẤT (PROVISIONAL), không coi là đã duyệt.
- Chỉ agent tiếp nhận/Style/Trần-Đèn được hỏi. Cost/BOM/Inventory/QA không bao giờ sinh câu hỏi này.

Câu hỏi lưu vào bảng ``questions`` sẵn có (QuestionRequest); không có cơ chế mới.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from typing import Any, Dict, Iterable, List, Optional

from app.db import now_iso
from app.models.contracts import QuestionChoice, QuestionRequest
from app.services.cost_engine import load_materials_catalog

DEFAULT_STYLE = "Modern"
CUSTOM_LABEL = "Tự nhập (gõ màu/vật liệu bạn muốn)"
MAX_QUESTIONS_PER_TURN = 3

# Thứ tự ưu tiên hỏi. Mỗi lượt tối đa 3 câu nên lượt 1 = sơn, sàn, trần.
FINISH_ORDER = ["wall_paint", "floor", "ceiling_color", "lighting", "accent_wall", "wood_tone"]

FINISH_LABELS = {
    "wall_paint": "Màu sơn tường chính",
    "accent_wall": "Tường nhấn",
    "ceiling_color": "Màu/kiểu trần",
    "floor": "Vật liệu và màu sàn",
    "wood_tone": "Tông gỗ/màu nội thất chính",
    "lighting": "Ánh sáng",
}

# Agent được phép hỏi nhóm câu hỏi này. Cost/BOM/Inventory/QA không có trong danh sách.
ASKING_AGENTS = {"agent_concierge", "agent_style", "agent_render"}
QUESTION_ORIGIN = {
    "wall_paint": "agent_style",
    "accent_wall": "agent_style",
    "floor": "agent_style",
    "wood_tone": "agent_style",
    "ceiling_color": "agent_render",
    "lighting": "agent_render",
}

# --------------------------------------------------------------------------------------
# Nhận diện phong cách
# --------------------------------------------------------------------------------------
STYLE_VI = {
    "Modern": "Hiện đại",
    "Minimalist": "Tối giản",
    "Classic": "Tân cổ điển",
    "Indochine": "Indochine (Đông Dương)",
    "Luxury": "Sang trọng (Luxury)",
    "Scandinavian": "Bắc Âu",
    "Industrial": "Công nghiệp",
    "Japandi": "Japandi",
}

# Thứ tự quan trọng: mẫu cụ thể trước, "modern/hiện đại" sau cùng.
_STYLE_PATTERNS: List[tuple[str, str]] = [
    ("Japandi", r"japandi"),
    ("Classic", r"tan co dien|neo.?classic|co dien|classic"),
    ("Indochine", r"indochine|dong duong"),
    ("Scandinavian", r"scandinavian|scandi\b|bac au"),
    ("Industrial", r"industrial|phong cach cong nghiep|loft"),
    ("Luxury", r"luxury|sang trong"),
    ("Minimalist", r"minimal|toi gian"),
    ("Modern", r"modern|hien dai"),
]


def fold_text(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or "").lower().replace("đ", "d"))
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def detect_style(text: str, default: str = DEFAULT_STYLE) -> str:
    """Trả về tên style chuẩn từ câu người dùng; không nêu rõ thì dùng ``default`` (Modern)."""
    folded = fold_text(text)
    for style, pattern in _STYLE_PATTERNS:
        if re.search(pattern, folded):
            return style
    return default


def style_label(style: str) -> str:
    return STYLE_VI.get(style, style or STYLE_VI[DEFAULT_STYLE])


def asset_pack_for_style(style: Optional[str]) -> str:
    """Japandi dùng sh3d-japandi; mọi style còn lại (gồm Modern) dùng sh3d-classic."""
    return "sh3d-japandi" if "japandi" in fold_text(style or "") else "sh3d-classic"


# --------------------------------------------------------------------------------------
# Bảng lựa chọn theo style: (option_id, tên màu/vật liệu, material_id trong catalog hoặc None, hex)
# --------------------------------------------------------------------------------------
Opt = tuple  # (id, label, material_id | None, hex | None)

_CEILING = [
    ("white_matte", "Trắng thạch cao mờ", "paint_ceiling_gypsum_white", "#FFFFFF"),
    ("white_cove_led", "Trắng mờ + hắt sáng LED viền trần", "paint_ceiling_gypsum_white", "#FFFFFF"),
    ("light_gray", "Xám ghi nhạt", "paint_modern_light_gray", "#CFCFCC"),
]
_LIGHTING = [
    ("warm_3000k", "Ánh sáng ấm 2700–3000K (ấm cúng, thư giãn)", None, None),
    ("neutral_4000k", "Ánh sáng trung tính 3500–4000K (sáng rõ, dễ làm việc)", None, None),
    ("cool_5000k", "Ánh sáng lạnh 5000–6500K (hiện đại, tương phản cao)", None, None),
]

_MODERN = {
    "wall_paint": [
        ("pure_white", "Trắng tinh", "paint_modern_pure_white", "#FAFAF8"),
        ("greige", "Ghi be", "paint_modern_greige", "#D8D2C8"),
        ("light_gray", "Xám ghi sáng", "paint_modern_light_gray", "#CFCFCC"),
        ("nordic_white", "Trắng sứ Bắc Âu", "paint_jotun_nordic_white", "#FAF9F6"),
    ],
    "accent_wall": [
        ("none", "Không làm tường nhấn", None, None),
        ("charcoal", "Xám than", "paint_modern_charcoal_accent", "#4A4D50"),
        ("navy", "Xanh navy", "paint_modern_navy_accent", "#2F3E57"),
        ("taupe", "Nâu xám ấm", "paint_dulux_warm_taupe", "#D4CBC0"),
    ],
    "floor": [
        ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
        ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
        ("walnut_herringbone", "Sàn gỗ óc chó lát xương cá", "floor_wood_walnut_herringbone", "#8B6547"),
        ("marble_white", "Gạch bóng vân đá marble trắng 600×600", "tile_dongtam_600x600_glossy", "#ECEAE4"),
    ],
    "wood_tone": [
        ("oak_light", "Gỗ sồi sáng", None, "#C8A986"),
        ("walnut_dark", "Gỗ óc chó đậm", None, "#8B6547"),
        ("ash_gray", "Gỗ xám tro", None, "#8E8C88"),
        ("black_charcoal", "Đen than / sơn đen mờ", None, "#2B2B2B"),
    ],
    "ceiling_color": _CEILING,
    "lighting": _LIGHTING,
}

_STYLE_OVERRIDES: Dict[str, Dict[str, List[Opt]]] = {
    "Japandi": {
        "wall_paint": [
            ("ivory", "Trắng ngà ấm", "paint_dulux_japandi_ivory", "#F5F2EB"),
            ("nordic_white", "Trắng sứ Bắc Âu", "paint_jotun_nordic_white", "#FAF9F6"),
            ("greige", "Ghi be", "paint_modern_greige", "#D8D2C8"),
        ],
        "accent_wall": [
            ("none", "Không làm tường nhấn", None, None),
            ("sage", "Xanh xô thơm nhạt", "paint_jotun_sage_accent", "#B8C2B4"),
            ("taupe", "Nâu xám ấm", "paint_dulux_warm_taupe", "#D4CBC0"),
        ],
        "floor": [
            ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
            ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
        ],
        "wood_tone": [
            ("oak_light", "Gỗ sồi sáng", None, "#C8A986"),
            ("ash_gray", "Gỗ xám tro", None, "#8E8C88"),
        ],
    },
    "Classic": {
        "wall_paint": [
            ("ivory", "Kem ngà ấm", "paint_dulux_japandi_ivory", "#F5F2EB"),
            ("nordic_white", "Trắng sứ", "paint_jotun_nordic_white", "#FAF9F6"),
            ("taupe", "Nâu xám ấm", "paint_dulux_warm_taupe", "#D4CBC0"),
        ],
        "accent_wall": [
            ("none", "Không làm tường nhấn", None, None),
            ("slate_teal", "Xanh slate kiến trúc", "paint_dulux_slate_teal", "#4A6B6D"),
            ("sage", "Xanh xô thơm", "paint_jotun_sage_accent", "#B8C2B4"),
        ],
        "floor": [
            ("walnut_herringbone", "Sàn gỗ óc chó lát xương cá", "floor_wood_walnut_herringbone", "#8B6547"),
            ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
            ("marble_white", "Gạch bóng vân đá marble trắng 600×600", "tile_dongtam_600x600_glossy", "#ECEAE4"),
        ],
        "wood_tone": [
            ("walnut_dark", "Gỗ óc chó đậm", None, "#8B6547"),
            ("mahogany", "Gỗ gụ nâu đỏ", None, "#5B3A29"),
            ("oak_light", "Gỗ sồi mật ong", None, "#C8A986"),
        ],
    },
    "Indochine": {
        "wall_paint": [
            ("ivory", "Kem ngà ấm", "paint_dulux_japandi_ivory", "#F5F2EB"),
            ("taupe", "Nâu xám ấm", "paint_dulux_warm_taupe", "#D4CBC0"),
            ("nordic_white", "Trắng sứ", "paint_jotun_nordic_white", "#FAF9F6"),
        ],
        "accent_wall": [
            ("slate_teal", "Xanh cổ vịt (slate teal)", "paint_dulux_slate_teal", "#4A6B6D"),
            ("none", "Không làm tường nhấn", None, None),
            ("navy", "Xanh navy", "paint_modern_navy_accent", "#2F3E57"),
        ],
        "floor": [
            ("walnut_herringbone", "Sàn gỗ óc chó lát xương cá", "floor_wood_walnut_herringbone", "#8B6547"),
            ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
            ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
        ],
        "wood_tone": [
            ("walnut_dark", "Gỗ óc chó đậm", None, "#8B6547"),
            ("black_charcoal", "Đen than / gỗ nhuộm đen", None, "#2B2B2B"),
        ],
    },
    "Luxury": {
        "wall_paint": [
            ("greige", "Ghi be", "paint_modern_greige", "#D8D2C8"),
            ("ivory", "Kem ngà ấm", "paint_dulux_japandi_ivory", "#F5F2EB"),
            ("nordic_white", "Trắng sứ", "paint_jotun_nordic_white", "#FAF9F6"),
        ],
        "accent_wall": [
            ("charcoal", "Xám than", "paint_modern_charcoal_accent", "#4A4D50"),
            ("navy", "Xanh navy", "paint_modern_navy_accent", "#2F3E57"),
            ("slate_teal", "Xanh slate", "paint_dulux_slate_teal", "#4A6B6D"),
            ("none", "Không làm tường nhấn", None, None),
        ],
        "floor": [
            ("marble_white", "Gạch bóng vân đá marble trắng 600×600", "tile_dongtam_600x600_glossy", "#ECEAE4"),
            ("walnut_herringbone", "Sàn gỗ óc chó lát xương cá", "floor_wood_walnut_herringbone", "#8B6547"),
            ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
        ],
        "wood_tone": [
            ("walnut_dark", "Gỗ óc chó đậm", None, "#8B6547"),
            ("black_charcoal", "Đen than", None, "#2B2B2B"),
        ],
    },
    "Scandinavian": {
        "wall_paint": [
            ("nordic_white", "Trắng sứ Bắc Âu", "paint_jotun_nordic_white", "#FAF9F6"),
            ("light_gray", "Xám ghi sáng", "paint_modern_light_gray", "#CFCFCC"),
            ("ivory", "Kem ngà ấm", "paint_dulux_japandi_ivory", "#F5F2EB"),
        ],
        "accent_wall": [
            ("none", "Không làm tường nhấn", None, None),
            ("sage", "Xanh xô thơm", "paint_jotun_sage_accent", "#B8C2B4"),
            ("navy", "Xanh navy", "paint_modern_navy_accent", "#2F3E57"),
        ],
        "floor": [
            ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
            ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
        ],
        "wood_tone": [
            ("oak_light", "Gỗ sồi sáng", None, "#C8A986"),
            ("ash_gray", "Gỗ xám tro", None, "#8E8C88"),
        ],
    },
    "Industrial": {
        "wall_paint": [
            ("light_gray", "Xám ghi sáng", "paint_modern_light_gray", "#CFCFCC"),
            ("charcoal", "Xám than", "paint_modern_charcoal_accent", "#4A4D50"),
            ("greige", "Ghi be", "paint_modern_greige", "#D8D2C8"),
        ],
        "accent_wall": [
            ("charcoal", "Xám than", "paint_modern_charcoal_accent", "#4A4D50"),
            ("navy", "Xanh navy", "paint_modern_navy_accent", "#2F3E57"),
            ("none", "Không làm tường nhấn", None, None),
        ],
        "floor": [
            ("tile_gray_cream", "Gạch porcelain xám kem mờ 800×800", "tile_viglacera_800x800_matte", "#DEDAD2"),
            ("oak_straight", "Sàn gỗ sồi tự nhiên lát thẳng", "floor_wood_oak_straight", "#C8A986"),
        ],
        "wood_tone": [
            ("walnut_dark", "Gỗ óc chó đậm", None, "#8B6547"),
            ("black_charcoal", "Đen than / kim loại đen", None, "#2B2B2B"),
        ],
    },
}


def _enrich(opt: Opt, catalog_index: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    oid, name, material_id, hex_color = opt
    entry = catalog_index.get(material_id or "")
    code = (entry or {}).get("color_code")
    hex_final = (entry or {}).get("hex_color") or hex_color
    detail = ", ".join(x for x in (hex_final, f"mã {code}" if code else None) if x)
    label = f"{name} ({detail})" if detail else name
    return {"id": oid, "name": name, "label": label, "material_id": material_id, "hex": hex_final, "code": code}


def _catalog_index() -> Dict[str, Dict[str, Any]]:
    cat = load_materials_catalog()
    index: Dict[str, Dict[str, Any]] = {}
    for group in ("paints", "tiles_and_flooring"):
        for item in cat.get(group, []):
            index[str(item.get("id"))] = item
    return index


def options_for(key: str, style: str = DEFAULT_STYLE) -> List[Dict[str, Any]]:
    """2-4 lựa chọn hợp style cho một khóa hoàn thiện, kèm tên màu, hex và mã (nếu catalog có)."""
    table = _STYLE_OVERRIDES.get(style, {}).get(key) or _MODERN[key]
    index = _catalog_index()
    return [_enrich(o, index) for o in table[:4]]


def suggested_option(key: str, style: str = DEFAULT_STYLE) -> Dict[str, Any]:
    return options_for(key, style)[0]


# --------------------------------------------------------------------------------------
# Nhận diện lựa chọn người dùng đã nêu sẵn trong câu chat
# --------------------------------------------------------------------------------------
def _by_id(key: str, style: str, option_id: str) -> Optional[Dict[str, Any]]:
    return next((o for o in options_for(key, style) if o["id"] == option_id), None)


def _decision(key: str, opt: Optional[Dict[str, Any]], raw: str, source: str) -> Dict[str, Any]:
    value = opt["label"] if opt else raw.strip()
    return {
        "key": key,
        "label": FINISH_LABELS[key],
        "value": value,
        "option_id": opt["id"] if opt else "custom",
        "material_id": opt["material_id"] if opt else None,
        "hex": opt["hex"] if opt else None,
        "status": "VALIDATED",
        "source": source,
        "custom": opt is None,
        "answered_at": now_iso(),
    }


def finish_decisions_from_text(text: str, style: str = DEFAULT_STYLE) -> Dict[str, Dict[str, Any]]:
    """Chỉ nhận những gì người dùng nói rõ; câu mơ hồ ('có trần và đèn đẹp') không tính."""
    folded = fold_text(text)
    out: Dict[str, Dict[str, Any]] = {}

    m = re.search(r"(?:son|mau tuong|tuong mau|tuong)\s+(?:mau\s+)?(?:chinh\s+)?(trang|kem|be(?!\s+tong)|ghi|xam)\b", folded)
    if m and "tuong nhan" not in folded[max(0, m.start() - 8):m.end()]:
        word = m.group(1)
        oid = {"trang": "pure_white", "kem": "ivory", "be": "greige", "ghi": "light_gray", "xam": "light_gray"}[word]
        opt = _by_id("wall_paint", style, oid) or _by_id("wall_paint", style, "pure_white")
        out["wall_paint"] = _decision("wall_paint", opt, m.group(0), "user_text")

    if re.search(r"(?:khong|ko)\s+(?:co\s+|lam\s+)?tuong nhan", folded):
        out["accent_wall"] = _decision("accent_wall", _by_id("accent_wall", style, "none"), "Không làm tường nhấn", "user_text")

    m = re.search(r"\btran\b[^.,;]{0,12}?\b(trang|xam|ghi)\b|\btran thach cao trang\b", folded)
    if m:
        opt = _by_id("ceiling_color", style, "light_gray" if m.group(1) in ("xam", "ghi") else "white_matte") if m.group(1) else _by_id("ceiling_color", style, "white_matte")
        out["ceiling_color"] = _decision("ceiling_color", opt, m.group(0), "user_text")

    if re.search(r"san go oc cho", folded):
        out["floor"] = _decision("floor", _by_id("floor", style, "walnut_herringbone"), "Sàn gỗ óc chó", "user_text")
    elif re.search(r"san go|lat go", folded):
        out["floor"] = _decision("floor", _by_id("floor", style, "oak_straight"), "Sàn gỗ", "user_text")
    elif re.search(r"san gach|lat gach|gach porcelain", folded):
        out["floor"] = _decision("floor", _by_id("floor", style, "tile_gray_cream") or _by_id("floor", style, "marble_white"), "Sàn gạch", "user_text")

    if re.search(r"anh sang lanh|den trang lanh|5000k|6500k", folded):
        out["lighting"] = _decision("lighting", _by_id("lighting", style, "cool_5000k"), "Ánh sáng lạnh", "user_text")
    elif re.search(r"anh sang trung tinh|4000k|3500k", folded):
        out["lighting"] = _decision("lighting", _by_id("lighting", style, "neutral_4000k"), "Ánh sáng trung tính", "user_text")
    elif re.search(r"anh sang am|den vang|3000k|2700k", folded):
        out["lighting"] = _decision("lighting", _by_id("lighting", style, "warm_3000k"), "Ánh sáng ấm", "user_text")

    if re.search(r"go oc cho", folded):
        out["wood_tone"] = _decision("wood_tone", _by_id("wood_tone", style, "walnut_dark"), "Gỗ óc chó", "user_text")
    elif re.search(r"go soi", folded):
        out["wood_tone"] = _decision("wood_tone", _by_id("wood_tone", style, "oak_light"), "Gỗ sồi", "user_text")
    return out


# --------------------------------------------------------------------------------------
# Câu hỏi
# --------------------------------------------------------------------------------------
_QUESTION_TEXT = {
    "wall_paint": ("Bạn muốn sơn tường chính màu nào?", "Màu tường chiếm ~60% bảng màu và quyết định cảm giác sáng/ấm của cả phòng."),
    "accent_wall": ("Bạn có muốn làm tường nhấn không, và màu gì?", "Tường nhấn tạo điểm nhìn nhưng làm phòng tối hơn; đây là sở thích của bạn."),
    "ceiling_color": ("Bạn muốn trần màu/kiểu nào?", "Trần ảnh hưởng độ cao cảm nhận, ánh sáng phản xạ và chi phí trần thạch cao."),
    "floor": ("Bạn muốn sàn vật liệu và màu nào?", "Sàn là hạng mục chi phí lớn, khó đổi sau thi công và quyết định tông gỗ/nội thất đi kèm."),
    "wood_tone": ("Bạn muốn tông gỗ/màu nội thất chính nào?", "Tông gỗ cần hợp với sàn và màu tường để phòng không bị rối."),
    "lighting": ("Bạn muốn ánh sáng ấm, trung tính hay lạnh?", "Nhiệt độ màu quyết định chọn đèn và cách màu sơn hiển thị về đêm."),
}


def decided_keys(brief_decisions: Dict[str, Dict[str, Any]]) -> set[str]:
    return {k for k, v in (brief_decisions or {}).items() if v and v.get("status") == "VALIDATED"}


def build_question(
    project_id: str,
    key: str,
    style: str,
    *,
    origin_agent: Optional[str] = None,
) -> QuestionRequest:
    text, why = _QUESTION_TEXT[key]
    choices = [
        QuestionChoice(id=f"{key}:{o['id']}", label=o["label"], description="Đề xuất" if i == 0 else None)
        for i, o in enumerate(options_for(key, style))
    ]
    choices.append(QuestionChoice(id=f"{key}:custom", label=CUSTOM_LABEL, description="Nhập mô tả/mã màu của riêng bạn"))
    return QuestionRequest(
        question_id=f"q_{uuid.uuid4().hex[:10]}",
        project_id=project_id,
        origin_agent=origin_agent or QUESTION_ORIGIN[key],
        context=f"Hoàn thiện phong cách {style_label(style)}: {FINISH_LABELS[key]}",
        question_text=f"{text} (phong cách {style_label(style)})",
        why_needed=why,
        decision_key=key,
        choices=choices,
        allow_free_text=True,
        blocking=False,
        resume_token=f"resume_{uuid.uuid4().hex[:8]}",
        status="PENDING",
        created_at=now_iso(),
    )


def plan_finish_questions(
    project_id: str,
    style: str,
    brief_decisions: Dict[str, Dict[str, Any]],
    *,
    origin_agent: str = "agent_concierge",
    already_pending: Iterable[str] = (),
    limit: int = MAX_QUESTIONS_PER_TURN,
) -> List[QuestionRequest]:
    """Tối đa ``limit`` câu cho các khóa chưa có decision và chưa có câu hỏi đang chờ.

    Agent không thuộc ASKING_AGENTS (Cost/BOM/Inventory/QA...) luôn nhận danh sách rỗng.
    """
    if origin_agent not in ASKING_AGENTS:
        return []
    skip = decided_keys(brief_decisions) | set(already_pending)
    keys = [k for k in FINISH_ORDER if k not in skip][: max(0, min(limit, MAX_QUESTIONS_PER_TURN))]
    return [build_question(project_id, k, style) for k in keys]


def record_answer(key: str, style: str, question_choices: List[QuestionChoice], answer_text: str) -> Optional[Dict[str, Any]]:
    """Chuyển câu trả lời (nhãn nút hoặc văn bản tự nhập) thành decision.

    Trả None nếu người dùng bấm 'Tự nhập' mà chưa gõ nội dung (câu hỏi vẫn mở)."""
    answer = (answer_text or "").strip()
    if not answer or answer == CUSTOM_LABEL:
        return None
    for ch in question_choices:
        if ch.label == answer and not ch.id.endswith(":custom"):
            opt = _by_id(key, style, ch.id.split(":", 1)[1])
            if opt:
                return _decision(key, opt, answer, "user_answer")
    return _decision(key, None, answer, "user_answer")


def resolve_finishes(brief_decisions: Dict[str, Dict[str, Any]], style: str) -> Dict[str, Dict[str, Any]]:
    """Giá trị dùng để dựng phương án: decision người dùng nếu có, ngược lại ĐỀ XUẤT (PROVISIONAL)."""
    resolved: Dict[str, Dict[str, Any]] = {}
    for key in FINISH_ORDER:
        decision = (brief_decisions or {}).get(key)
        if decision and decision.get("status") == "VALIDATED":
            resolved[key] = dict(decision)
            continue
        opt = suggested_option(key, style)
        resolved[key] = {
            "key": key,
            "label": FINISH_LABELS[key],
            "value": opt["label"],
            "option_id": opt["id"],
            "material_id": opt["material_id"],
            "hex": opt["hex"],
            "status": "PROVISIONAL",
            "source": "proposal",
            "custom": False,
        }
    return resolved


def is_fully_decided(brief_decisions: Dict[str, Dict[str, Any]]) -> bool:
    return set(FINISH_ORDER) <= decided_keys(brief_decisions)


WOOD_CATEGORIES = {"coffee_table", "tv_cabinet", "cabinet", "dining_table", "table", "bookshelf", "sideboard", "bed", "wardrobe", "desk"}


def apply_finishes(project: Any, resolved: Dict[str, Dict[str, Any]], style: str) -> None:
    """Ghi giá trị đã resolve vào project (sơn tường/trần/sàn/tường nhấn, màu gỗ nội thất).

    Giá trị người dùng tự nhập không có mã catalog dùng vật liệu đề xuất để tính tạm,
    còn mô tả gốc được giữ trong design_brief.finish_decisions."""
    def material(key: str) -> Optional[str]:
        item = resolved.get(key) or {}
        mid = item.get("material_id")
        if mid:
            return mid
        if item.get("custom") or item.get("option_id") == "none":
            fallback = suggested_option(key, style)["material_id"] if item.get("custom") else None
            return fallback
        return None

    wall = material("wall_paint")
    accent = material("accent_wall")
    ceiling = material("ceiling_color")
    floor = material("floor")
    if project.rooms:
        room = project.rooms[0]
        if wall:
            room.wall_base_material_id = wall
        if floor:
            room.floor_material_id = floor
        if ceiling:
            room.ceiling_material_id = ceiling
    for w in project.walls:
        if getattr(w, "is_accent_wall", False) and accent:
            w.face_a_material_id = accent
        elif wall:
            w.face_a_material_id = wall
    wood_hex = (resolved.get("wood_tone") or {}).get("hex")
    if wood_hex:
        for f in project.furniture_instances:
            if f.category in WOOD_CATEGORIES:
                f.color_hex = wood_hex
