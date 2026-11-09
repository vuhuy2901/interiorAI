"""
ATELIER AI — Shared Pydantic v2 Contracts
Synchronized across FastAPI Backend, LangGraph Orchestrator, Pascal MCP Gateway, and React Frontend.
"""
from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ScaleCalibration(BaseModel):
    p1_px: List[float] = Field(default_factory=lambda: [0.0, 0.0])
    p2_px: List[float] = Field(default_factory=lambda: [400.0, 0.0])
    real_length_mm: float = 4000.0
    mm_per_px: float = 10.0
    confirmed_by_user: bool = True
    confidence: float = 1.0
    notes: str = "Tỷ lệ đã xác nhận (1 cạnh chuẩn)"


class WallTileZone(BaseModel):
    enabled: bool = False
    tile_material_id: str = "wall_tile_300x600_terrazzo"
    tile_height_mm: float = 1200.0
    wall_ids: List[str] = Field(default_factory=list)


class WallSegment(BaseModel):
    id: str
    start_mm: List[float]  # [x, y] in mm
    end_mm: List[float]    # [x, y] in mm
    thickness_mm: float = 200.0
    height_mm: float = 2800.0
    is_bearing: bool = True
    # Section 7B Mandatory: Surface-level two-sided material assignment & Accent Wall
    face_a_material_id: str = "paint_dulux_japandi_ivory"
    face_b_material_id: str = "paint_dulux_japandi_ivory"
    is_accent_wall: bool = False
    accent_face: Literal["a", "b"] = "a"
    pascal_node_id: Optional[str] = None
    confidence: float = 0.98


class DoorOpening(BaseModel):
    id: str
    wall_id: str
    wall_index: int = 0
    t: float = 0.5  # 0..1 parametric position along wall
    width_mm: float = 900.0
    height_mm: float = 2100.0
    sill_height_mm: float = 0.0
    door_type: Literal["hinged", "sliding", "double", "folding", "opening"] = "hinged"
    swing_direction: Literal["inward", "outward"] = "inward"
    hinges_side: Literal["left", "right"] = "left"
    room_id: Optional[str] = None
    pascal_node_id: Optional[str] = None


class WindowOpening(BaseModel):
    id: str
    wall_id: str
    wall_index: int = 1
    t: float = 0.5
    width_mm: float = 1500.0
    height_mm: float = 1400.0
    sill_height_mm: float = 900.0
    window_type: Literal["fixed", "casement", "sliding", "floor_window"] = "sliding"
    room_id: Optional[str] = None
    pascal_node_id: Optional[str] = None


class RoomZone(BaseModel):
    id: str
    name: str = "Phòng khách"
    room_type: Literal["living", "bedroom", "kitchen", "bathroom", "dining", "office", "balcony"] = "living"
    polygon_mm: List[List[float]] = Field(
        default_factory=lambda: [[0.0, 0.0], [4000.0, 0.0], [4000.0, 5000.0], [0.0, 5000.0]]
    )
    ceiling_height_mm: float = 2800.0
    # Section 7B Mandatory: Per-room surface material attributes
    floor_material_id: str = "floor_wood_oak_straight"
    ceiling_material_id: str = "paint_ceiling_gypsum_white"
    wall_base_material_id: str = "paint_dulux_japandi_ivory"
    wall_tile_zone: Optional[WallTileZone] = None
    skirting_material_id: str = "skirting_wood_oak_90"
    pascal_node_id: Optional[str] = None


class FurnitureInstance(BaseModel):
    id: str
    sku: str
    name: str
    category: str = "sofa"
    room_id: str = "room_main"
    x_mm: float = 2000.0
    y_mm: float = 2500.0
    z_mm: float = 0.0
    width_mm: float = 2100.0
    depth_mm: float = 880.0
    height_mm: float = 780.0
    rotation_deg: float = 0.0
    color_hex: str = "#E4DDD3"
    price_vnd: float = 14500000.0
    pascal_asset_id: str = "sofa"
    pascal_node_id: Optional[str] = None
    source_url: Optional[str] = None
    vendor: Optional[str] = None


class DesignBrief(BaseModel):
    style: str = "Japandi"
    room_function: str = "Phòng khách sinh hoạt chung & tiếp khách"
    color_palette: List[str] = Field(default_factory=lambda: ["#F5F2EB", "#C8A986", "#B8C2B4", "#276E70"])
    liked_elements: List[str] = Field(default_factory=lambda: ["Gỗ sồi sáng", "Không gian thoáng", "Vải Linen màu be"])
    disliked_elements: List[str] = Field(default_factory=lambda: ["Màu tối nặng nề", "Sofa da cồng kềnh"])
    budget_limit_vnd: float = 120000000.0
    occupants: str = "Gia đình trẻ 2-3 người"
    must_have_constraints: List[str] = Field(default_factory=lambda: ["Lối đi tối thiểu 750mm", "Giữ tổng dự toán dưới ngân sách"])
    approved_decisions: List[str] = Field(default_factory=list)


class EstimateLineItem(BaseModel):
    id: str
    category: Literal["paint", "floor_tile_wood", "wall_tile", "skirting", "adhesive_grout", "furniture", "labor"]
    title: str
    specification: str
    net_quantity: float
    waste_rate: float = 0.0
    gross_quantity: float
    unit: str
    package_count: Optional[int] = None
    package_unit: Optional[str] = None
    unit_price_vnd: float
    subtotal_vnd: float
    formula_explanation: str
    source_label: str = "GIÁ MINH HỌA"
    source_url: Optional[str] = None
    checked_at: str = "2026-11-01"


class CostEstimateSnapshot(BaseModel):
    snapshot_id: str
    project_id: str
    revision: int
    created_at: str
    scale_verified: bool
    confidence_level: Literal["HIGH_VERIFIED_SCALE", "LOW_UNVERIFIED_SCALE"] = "HIGH_VERIFIED_SCALE"
    lines: List[EstimateLineItem] = Field(default_factory=list)
    materials_subtotal_vnd: float = 0.0
    furniture_subtotal_vnd: float = 0.0
    labor_subtotal_vnd: float = 0.0
    shipping_fee_vnd: float = 1500000.0
    tax_rate: float = 0.08
    tax_vnd: float = 0.0
    total_vnd: float = 0.0
    budget_limit_vnd: float = 120000000.0
    within_budget: bool = True
    disclaimer: str = "GIÁ MINH HỌA THAM KHẢO — Tính toán bằng công thức hình học xác định (Deterministic Cost Engine), không dùng LLM tự đoán giá."


class CanonicalProject(BaseModel):
    project_id: str
    name: str
    description: str = ""
    revision: int = 1
    units: Literal["mm"] = "mm"
    display_unit: Literal["mm", "cm", "m"] = "m"
    scale_calibrated: bool = True
    scale_reference: Optional[ScaleCalibration] = None
    rooms: List[RoomZone] = Field(default_factory=list)
    walls: List[WallSegment] = Field(default_factory=list)
    openings: List[DoorOpening] = Field(default_factory=list)
    windows: List[WindowOpening] = Field(default_factory=list)
    furniture_instances: List[FurnitureInstance] = Field(default_factory=list)
    design_brief: DesignBrief = Field(default_factory=DesignBrief)
    estimate_snapshot: Optional[CostEstimateSnapshot] = None
    pascal_scene_json: Dict[str, Any] = Field(default_factory=dict)
    approval_state: Literal["DRAFT", "WAITING_FOR_INPUT", "WAITING_FOR_APPROVAL", "APPROVED"] = "APPROVED"
    underlay_image_url: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class QuestionChoice(BaseModel):
    id: str
    label: str
    description: Optional[str] = None


class QuestionRequest(BaseModel):
    question_id: str
    project_id: str
    run_id: Optional[str] = None
    origin_agent: str
    context: str
    question_text: str
    why_needed: str
    choices: List[QuestionChoice] = Field(default_factory=list)
    allow_free_text: bool = True
    blocking: bool = True
    resume_token: str
    status: Literal["PENDING", "ANSWERED", "SKIPPED"] = "PENDING"
    answer_value: Optional[str] = None
    created_at: str = ""


class DesignOptionCard(BaseModel):
    option_id: str  # "A", "B", "C"
    title: str
    style_name: str
    summary: str
    pros: List[str]
    cons: List[str]
    estimated_total_vnd: float
    within_budget: bool = True
    floor_material_id: str
    wall_paint_id: str
    accent_paint_id: Optional[str] = None
    furniture_list: List[FurnitureInstance] = Field(default_factory=list)
    clearance_ok: bool = True
    min_walkway_mm: float = 850.0


class SceneDiffItem(BaseModel):
    entity_type: Literal["wall", "door", "window", "furniture", "surface_material"]
    entity_id: str
    action: Literal["ADD", "UPDATE", "REMOVE"]
    before_summary: Optional[str] = None
    after_summary: str
    cost_delta_vnd: float = 0.0


class SceneProposal(BaseModel):
    proposal_id: str
    project_id: str
    base_revision: int
    origin_agent: str
    title: str
    reason: str
    diffs: List[SceneDiffItem] = Field(default_factory=list)
    options: List[DesignOptionCard] = Field(default_factory=list)
    selected_option_id: Optional[str] = None
    cost_delta_vnd: float = 0.0
    projected_total_vnd: float = 0.0
    budget_limit_vnd: float = 120000000.0
    budget_warning: Optional[str] = None
    collision_warnings: List[str] = Field(default_factory=list)
    proposed_canonical: Dict[str, Any] = Field(default_factory=dict)
    status: Literal["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"] = "PENDING"
    created_at: str = ""


class TelegramProgressStep(BaseModel):
    step_id: str
    label: str
    agent_id: str
    status: Literal["PENDING", "RUNNING", "COMPLETED", "SKIPPED", "FAILED"] = "PENDING"
    detail: str = ""
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class TaskProgressRecord(BaseModel):
    task_id: str
    project_id: str
    run_id: Optional[str] = None
    title: str
    prompt: str
    assigned_agent: str
    status: Literal["QUEUED", "RUNNING", "WAITING_FOR_INPUT", "WAITING_FOR_APPROVAL", "COMPLETED", "FAILED"] = "QUEUED"
    progress_pct: int = Field(default=0, ge=0, le=100)
    current_step_label: str = ""
    steps: List[TelegramProgressStep] = Field(default_factory=list)
    telegram_chat_id: Optional[str] = None
    telegram_message_id: Optional[str] = None
    proposal_id: Optional[str] = None
    question_id: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class TelegramConfigPayload(BaseModel):
    bot_token: str = ""
    chat_id: str = ""
    enabled: bool = False
    update_mode: Literal["edit_single_message", "milestone_messages"] = "edit_single_message"
    notify_on_assign: bool = True
    notify_on_step: bool = True
    notify_on_approval: bool = True
