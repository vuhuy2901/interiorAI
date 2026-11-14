"""
ATELIER AI — Shared Pydantic v2 Contracts
Synchronized across FastAPI Backend, LangGraph Orchestrator, Pascal MCP Gateway, and React Frontend.
"""
from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


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


class MaterialSlotDefinition(BaseModel):
    slot_id: str
    source_material_name: str
    editable: bool = True
    semantic_part: Optional[str] = None
    material_ref: Optional[str] = None


class TextureReference(BaseModel):
    uri: str
    channel: Literal["base_color", "normal", "roughness", "metalness", "occlusion", "emissive", "alpha"]
    color_space: Literal["srgb", "linear", "non_color"] = "non_color"
    source_url: Optional[str] = None
    license: Optional[str] = None


class PhysicalTextureScale(BaseModel):
    width_mm: float = 1000.0
    height_mm: float = 1000.0
    rotation_deg: float = 0.0
    origin_mm: List[float] = Field(default_factory=lambda: [0.0, 0.0])
    layout: Literal["straight", "brick", "herringbone"] = "straight"
    grout_width_mm: float = 0.0
    grout_color: str = "#D8D4CC"


class PBRParameters(BaseModel):
    base_color: str = "#FFFFFF"
    roughness: float = Field(0.5, ge=0.0, le=1.0)
    metalness: float = Field(0.0, ge=0.0, le=1.0)
    opacity: float = Field(1.0, ge=0.0, le=1.0)
    transmission: float = Field(0.0, ge=0.0, le=1.0)
    ior: float = Field(1.5, ge=1.0, le=2.5)
    clearcoat: float = Field(0.0, ge=0.0, le=1.0)
    clearcoat_roughness: float = Field(0.0, ge=0.0, le=1.0)
    sheen: float = Field(0.0, ge=0.0, le=1.0)
    sheen_color: str = "#FFFFFF"
    emissive: str = "#000000"
    emissive_intensity: float = Field(0.0, ge=0.0, le=50.0)
    normal_scale: float = Field(1.0, ge=0.0, le=4.0)


class MaterialDefinition(BaseModel):
    material_id: str
    schema_version: Literal["atelier.material.v1"] = "atelier.material.v1"
    version: int = Field(1, ge=1)
    name: str
    kind: Literal["fabric", "wood", "stone", "tile", "paint", "metal", "glass", "plastic", "generic"]
    pbr: PBRParameters = Field(default_factory=PBRParameters)
    textures: List[TextureReference] = Field(default_factory=list)
    physical_scale: PhysicalTextureScale = Field(default_factory=PhysicalTextureScale)
    tint: str = "#FFFFFF"
    preserve_source_textures: bool = True
    source_url: Optional[str] = None
    author: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    product_ref: Optional[str] = None
    price_status: Literal["VERIFIED", "UNVERIFIED", "NOT_AVAILABLE"] = "NOT_AVAILABLE"
    created_at: str = ""


class MaterialOverride(BaseModel):
    material_id: str
    material_version: int = 1
    tint: Optional[str] = None
    pbr: Dict[str, float | str] = Field(default_factory=dict)
    texture_scale: Optional[PhysicalTextureScale] = None


class AssetMetadata(BaseModel):
    asset_id: str
    scene_object_id: Optional[str] = None
    category: str
    name: str
    source_type: Literal["poly_haven", "ambientcg", "sketchfab", "user", "project_library"]
    source_url: Optional[str] = None
    author: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    attribution_required: bool = False
    source_format: str
    normalized_glb: Optional[str] = None
    dimensions_mm: List[float] = Field(default_factory=list)
    origin: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    pivot: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    material_slots: List[MaterialSlotDefinition] = Field(default_factory=list)
    material_refs: Dict[str, str] = Field(default_factory=dict)
    texture_refs: List[str] = Field(default_factory=list)
    asset_version: int = 1
    geometry_hash: str
    product_ref: Optional[str] = None
    validation_status: Literal["VALID", "NEEDS_REVIEW", "INVALID", "BLOCKED"] = "NEEDS_REVIEW"
    validation_issues: List[str] = Field(default_factory=list)
    sizing_policy: Literal["FIXED_SIZE", "UNIFORM_SCALABLE", "PARAMETRIC"] = "FIXED_SIZE"
    uniform_scale_range: List[float] = Field(default_factory=lambda: [1.0, 1.0])
    parametric_axes: List[Literal["width", "depth", "height"]] = Field(default_factory=list)
    created_at: str = ""


class MeasurementEvidence(BaseModel):
    value: Optional[float] = None
    unit: Literal["mm", "deg"] = "mm"
    status: Literal["CONFIRMED", "INFERRED", "UNKNOWN"]
    source: str
    source_ref: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_known_value(self) -> "MeasurementEvidence":
        if not self.source.strip():
            raise ValueError("measurement source must not be empty")
        if self.status == "UNKNOWN" and self.value is not None:
            raise ValueError("UNKNOWN measurement must not carry a numeric value")
        if self.status != "UNKNOWN" and self.value is None:
            raise ValueError(f"{self.status} measurement requires a numeric value")
        return self


class DimensionSegment(BaseModel):
    id: str
    label: str
    measurement: MeasurementEvidence


class DimensionChain(BaseModel):
    id: str
    room_id: str
    axis: Literal["width", "depth"]
    segments: List[DimensionSegment]
    expected_total: MeasurementEvidence
    tolerance_mm: float = 0.0


class FurnitureInstance(BaseModel):
    id: str
    sku: str
    name: str
    category: str
    room_id: str = "room_main"
    x_mm: float = 2000.0
    y_mm: float = 2500.0
    z_mm: float = 0.0
    width_mm: float = 2100.0
    depth_mm: float = 880.0
    height_mm: float = 780.0
    rotation_deg: float = 0.0
    wall: Optional[Literal["top", "right", "bottom", "left"]] = None
    align: Optional[Literal["start", "center", "end", "left", "right", "top", "bottom"]] = None
    offset_mm: float = 0.0
    wall_distance_mm: float = 0.0
    color_hex: str = "#E4DDD3"
    price_vnd: float = 14500000.0
    pascal_asset_id: str
    pascal_node_id: Optional[str] = None
    source_url: Optional[str] = None
    vendor: Optional[str] = None
    asset_id: Optional[str] = None
    asset_version: Optional[int] = None
    geometry_hash: Optional[str] = None
    normalized_glb: Optional[str] = None
    material_slots: List[MaterialSlotDefinition] = Field(default_factory=list)
    material_overrides: Dict[str, MaterialOverride] = Field(default_factory=dict)
    sizing_policy: Literal["FIXED_SIZE", "UNIFORM_SCALABLE", "PARAMETRIC"] = "FIXED_SIZE"
    uniform_scale_range: List[float] = Field(default_factory=lambda: [1.0, 1.0])
    original_dimensions_mm: List[float] = Field(default_factory=list)
    parametric_module_mm: Optional[float] = None
    parametric_axes: List[Literal["width", "depth", "height"]] = Field(default_factory=list)
    measurement_evidence: Dict[str, MeasurementEvidence] = Field(default_factory=dict)
    legacy_flags: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def mark_legacy_defaults(self) -> "FurnitureInstance":
        flags = list(self.legacy_flags)
        if self.category != "sofa" and self.pascal_asset_id == "sofa":
            flags.append("LEGACY_DEFAULT_PASCAL_ASSET_SOFA")
        if not self.measurement_evidence:
            flags.append("LEGACY_MISSING_MEASUREMENT_EVIDENCE")
        self.legacy_flags = list(dict.fromkeys(flags))
        return self


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


# ============================================================================
# UNIFIED PROJECT BOQ & AI FINANCIAL MANAGEMENT CONTRACTS (FEAT-2026-033)
# ============================================================================
class MaterialSpecDetail(BaseModel):
    board_core: str = "MDF chống ẩm lõi xanh"
    surface_finish: str = "Melamine"
    color_code: str = "Óc chó Walnut 612 EV"
    thickness_desc: str = "Thân & cánh 17mm, hậu 9mm"
    thickness_mm: float = 17.0
    brand_product_code: str = "An Cường AC-MDF-MR-17-WALNUT-612"
    warranty_desc: str = "Bảo hành 24 tháng theo tiêu chuẩn nhà sản xuất"


class MaterialProposalOption(BaseModel):
    option_id: str
    title: str
    board_core: str
    surface_finish: str
    color_code: str
    thickness_desc: str
    brand: str
    product_code: str
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    durability_score: float = 9.0
    price_tier: Literal["economy", "standard", "premium"] = "standard"
    proposed_by_agent: str = "Materials AI"
    is_recommended: bool = False


class SupplierQuoteOption(BaseModel):
    quote_id: str
    supplier_name: str
    sku: str
    unit_price_vnd: float
    unit: str
    source_type: Literal["GIÁ MINH HỌA", "GIÁ THAM KHẢO CÓ NGUỒN", "BÁO GIÁ CHÍNH THỨC", "NGƯỜI DÙNG CUNG CẤP"]
    source_url: Optional[str] = None
    queried_at: str = "2026-11-13"
    notes: Optional[str] = None
    is_verified: bool = True


class BOMSubItem(BaseModel):
    part_id: str
    part_name: str
    specification: str
    quantity: float
    unit: str
    unit_price_vnd: Optional[float] = None
    subtotal_vnd: Optional[float] = None
    waste_rate: float = 0.0
    notes: Optional[str] = None


class UnifiedBOQItem(BaseModel):
    id: str
    group_id: Literal[
        "group_1_furniture_millwork",
        "group_2_wood_boards",
        "group_3_tile_stone_floor",
        "group_4_paint_wall_ceiling",
        "group_5_doors_windows_glazing",
        "group_6_electrical_lighting",
        "group_7_hardware_fittings",
        "group_8_appliances_decor",
        "group_9_labor_logistics_other",
    ]
    group_label: str
    item_type: Literal["custom_millwork", "ready_made", "raw_material", "surface", "fixture", "service"]
    name: str
    room_id: Optional[str] = None
    room_name: Optional[str] = None
    dimensions_desc: str = ""
    dimensions_mm: Optional[List[float]] = None
    quantity: float = 1.0
    unit: str = "Bộ"
    waste_rate: float = 0.0
    selected_material_spec: Optional[MaterialSpecDetail] = None
    material_proposals: List[MaterialProposalOption] = Field(default_factory=list)
    supplier_quotes: List[SupplierQuoteOption] = Field(default_factory=list)
    selected_quote_id: Optional[str] = None
    unit_price_vnd: Optional[float] = None
    subtotal_vnd: Optional[float] = None
    price_status: Literal["CHƯA CÓ BÁO GIÁ", "GIÁ THAM KHẢO CÓ NGUỒN", "GIÁ BÁO CHÍNH THỨC", "ĐÃ PHÊ DUYỆT"] = "CHƯA CÓ BÁO GIÁ"
    approval_state: Literal["DRAFT", "PROPOSED", "USER_APPROVED"] = "PROPOSED"
    proposed_by_agent: str = "Materials AI"
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    decision_version: str = "1.0"
    calculation_formula: str = ""
    bom_breakdown: List[BOMSubItem] = Field(default_factory=list)
    parent_item_id: Optional[str] = None
    is_included_in_total: bool = True
    needs_recalculation: bool = False
    source_entity_id: Optional[str] = None


class BOQGroupSummary(BaseModel):
    group_id: str
    group_label: str
    item_count: int
    subtotal_vnd: float
    priced_count: int
    unpriced_count: int


class UnifiedProjectBOQ(BaseModel):
    project_id: str
    project_name: str
    revision: int
    budget_limit_vnd: float = 120000000.0
    items: List[UnifiedBOQItem] = Field(default_factory=list)
    groups: List[BOQGroupSummary] = Field(default_factory=list)
    total_calculated_vnd: float = 0.0
    total_approved_vnd: float = 0.0
    unpriced_items_count: int = 0
    tax_rate: float = 0.08
    tax_vnd: float = 0.0
    total_with_tax_vnd: float = 0.0
    budget_variance_vnd: float = 0.0
    is_within_budget: bool = True
    generated_at: str = ""


class BOQDecisionPayload(BaseModel):
    selected_option_id: Optional[str] = None
    custom_material_spec: Optional[Dict[str, Any]] = None
    selected_quote_id: Optional[str] = None
    custom_quote: Optional[Dict[str, Any]] = None
    approved: bool = True
    approved_by: str = "Chủ Project"
    notes: Optional[str] = None


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
    dimension_chains: List[DimensionChain] = Field(default_factory=list)
    surface_material_overrides: Dict[str, MaterialOverride] = Field(default_factory=dict)
    design_brief: DesignBrief = Field(default_factory=DesignBrief)
    estimate_snapshot: Optional[CostEstimateSnapshot] = None
    pascal_scene_json: Dict[str, Any] = Field(default_factory=dict)
    approval_state: Literal["DRAFT", "WAITING_FOR_INPUT", "WAITING_FOR_APPROVAL", "APPROVED"] = "APPROVED"
    underlay_image_url: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class AtelierRoomRecord(BaseModel):
    room_id: str
    native_project_id: str
    name: str
    room_type: str = "other"
    position: int = 0
    created_at: str
    updated_at: str


class AtelierSceneRecord(BaseModel):
    scene_id: str
    native_project_id: str
    room_id: Optional[str] = None
    name: str
    provenance: Literal["native", "legacy", "fixture", "unknown"] = "unknown"
    is_fixture: bool = False
    archived: bool = False
    latest_revision: int = 0
    revision_count: int = 0
    updated_at: str


class AtelierProjectWorkspace(BaseModel):
    native_project_id: str
    company_id: str
    project_name: str
    brief: str = ""
    conversation_issue_id: Optional[str] = None
    initialization_status: Literal["pending", "ready", "failed"] = "pending"
    initialization_error: Optional[str] = None
    rooms: List[AtelierRoomRecord] = Field(default_factory=list)
    scenes: List[AtelierSceneRecord] = Field(default_factory=list)


class LegacySceneAudit(BaseModel):
    generated_at: str
    total_scenes: int
    linked_scenes: int
    unassigned_scenes: int
    fixture_scenes: int
    duplicate_name_groups: List[List[str]] = Field(default_factory=list)
    unknown_provenance_scene_ids: List[str] = Field(default_factory=list)
    scenes: List[Dict[str, Any]] = Field(default_factory=list)


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
    entity_type: Literal["wall", "door", "window", "furniture", "surface_material", "material_slot"]
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
