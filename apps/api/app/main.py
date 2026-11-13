"""
ATELIER AI — FastAPI Production Backend (`/api/v1`)
Exposes REST & SSE endpoints for:
- Projects, Scene Revisions, Undo/Restore, Surface Material 7B updates
- 2D Floor Plan Intake (DXF, PDF, PNG/JPG) & Scale Confirmation Gate
- Conversational Design Concierge (`/chat/messages`, `/questions/{id}/answer`, `/proposals/{id}/approve|reject`)
- Deterministic Cost Engine (`/estimates`, `/estimates/recalculate`, BOQ CSV/XLSX export)
- Product Catalog & Room/Doorway Fit-Check (`/catalog`, `/catalog/fit-check`, `/catalog/replace`)
- AI Control Center Workflows, Node Inspector, Runs & SSE Event Stream
- Multi-Agent Registry & AI Provider Connections (with strict API key redaction)
- Pascal 3D BIM MCP Gateway (`/mcp/tools`, `/mcp/call`, `/mcp/sync`)
- CAD Export (DXF R2007, GLB, IFC4, SketchUp COLLADA .dae)
"""
from __future__ import annotations
import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.db import (
    audit_legacy_scenes,
    build_default_demo_project,
    create_atelier_room,
    get_conn,
    get_native_project_workspace,
    get_project_workflow_id,
    get_project,
    get_project_revisions,
    init_db,
    initialize_native_project_link,
    link_scene_to_native_project,
    list_projects,
    now_iso,
    restore_project_revision,
    save_project,
)
from app.models.contracts import (
    AtelierProjectWorkspace,
    CanonicalProject,
    DesignBrief,
    FurnitureInstance,
    WallTileZone,
    WallSegment,
    RoomZone,
    DoorOpening,
    WindowOpening,
    ScaleCalibration,
    MaterialDefinition,
    MaterialOverride,
    PhysicalTextureScale,
    SceneDiffItem,
    SceneProposal,
    QuestionChoice,
    QuestionRequest,
)
from app.services.render_engine import render_scene_visual
from app.services.cad_export import (
    ensure_sample_dxf_seed,
    export_boq_csv,
    export_boq_xlsx,
    export_project_to_collada_dae,
    export_project_to_dxf,
    export_project_to_glb,
    export_project_to_ifc,
    parse_dxf_floorplan,
    parse_raster_or_pdf_floorplan,
)
from app.services.cost_engine import (
    calculate_project_estimate,
    load_materials_catalog,
    load_products_catalog,
)
from app.services.geometry import (
    analyze_scene_spatial_quality,
    check_catalog_product_fit,
)
from app.services.measurement_validation import validate_project_for_persistence
from app.services.mcp_gateway import (
    call_pascal_mcp_tool,
    list_pascal_mcp_tools,
    sync_canonical_to_pascal,
)
from app.services.house_plan_designer import (
    build_default_multiroom_floorspec,
    convert_floorspec_to_canonical_project,
    convert_floorspec_to_pascal_scenegraph,
)
from app.services.research_agent import search_real_products, VERIFIED_VIETNAM_PRODUCTS
from app.services.inventory_bom import generate_project_inventory_bom, export_inventory_bom_csv
from app.services import ide_bridge_service
from app.services.blender_mcp import (
    build_and_verify_blender_scene,
    cancel_render_job,
    enqueue_render_job,
    generate_custom_furniture_glb,
    get_render_job,
    is_blender_available,
    list_project_render_jobs,
    probe_blender_capabilities,
    retry_render_job,
)
from app.services.asset_pipeline import (
    ASSET_LIBRARY_DIR,
    ASSET_ROOT,
    AssetPipelineError,
    asset_license_report,
    get_asset_metadata,
    import_poly_haven_hdri,
    import_poly_haven_model,
    list_registered_assets,
    register_user_glb,
    search_assets,
)
from app.services.material_system import (
    MATERIAL_ROOT,
    MaterialSystemError,
    get_material,
    inspect_glb_material_structure,
    list_materials,
    resolve_material,
    save_material,
)
from app.services.smart_fit import assess_fit, generate_placement_options, plan_resize
from app.services.agent_orchestrator_engine import execute_real_workflow_run, sync_native_workflow_run
from app.services.workflow_input_sync import list_run_decisions, reconcile_workflow_inputs
from app.services.workflow_runtime import validate_workflow_snapshot
from app.services.orchestrator import (
    answer_question_and_resume,
    approve_scene_proposal,
    generate_design_options,
    mark_workflow_invalidation,
    process_user_chat_message,
    reject_scene_proposal,
    test_ai_connection,
)

ROOT_DIR = Path(__file__).resolve().parents[4]
UPLOADS_DIR = ROOT_DIR / "data" / "uploads"


async def _workflow_input_reconciler(stop_event: asyncio.Event) -> None:
    """Bounded, no-LLM reconciliation for runs waiting on humans/agents."""
    interval_seconds = max(2.0, float(os.getenv("ATELIER_INPUT_RECONCILE_SECONDS", "10")))
    while not stop_event.is_set():
        conn = get_conn()
        rows = conn.execute(
            "SELECT run_id FROM workflow_runs WHERE status IN ('WAITING_FOR_INPUT', 'WAITING_FOR_AGENT') ORDER BY updated_at ASC LIMIT 20"
        ).fetchall()
        conn.close()
        for row in rows:
            if stop_event.is_set():
                break
            try:
                await asyncio.to_thread(lambda run_id=row["run_id"]: asyncio.run(sync_native_workflow_run(run_id)))
            except (OSError, RuntimeError, ValueError):
                # Durable event/task state remains in SQLite/Paperclip and will
                # be retried on the next bounded pass.
                continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass


def mask_secret_key(raw: str) -> str:
    if not raw or len(raw.strip()) < 6:
        return ""
    s = raw.strip()
    return f"{s[:3]}...{s[-3:]} (REDACTED)"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    demo = get_project("proj_demo_4x5m") or build_default_demo_project()
    ensure_sample_dxf_seed(demo)
    # Initial non-blocking sync with Pascal MCP if demo has empty pascal_scene_json
    if not demo.pascal_scene_json:
        res = await sync_canonical_to_pascal(demo)
        if res.get("ok") and res.get("sceneJson"):
            demo.pascal_scene_json = res["sceneJson"]
            save_project(demo, author="Pascal MCP Bootstrap", reason="Đồng bộ khởi tạo Pascal SceneGraph", bump_revision=False)
    stop_event = asyncio.Event()
    reconciler_task: Optional[asyncio.Task[Any]] = None
    if os.getenv("ATELIER_INPUT_RECONCILER_ENABLED", "1").strip().lower() not in {"0", "false", "no"}:
        reconciler_task = asyncio.create_task(_workflow_input_reconciler(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        if reconciler_task:
            await reconciler_task


app = FastAPI(
    title="ATELIER AI — Intelligent Interior Design Studio API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_utf8_charset_middleware(request: Request, call_next):
    response = await call_next(request)
    ct = response.headers.get("content-type", "")
    if "application/json" in ct and "charset" not in ct:
        response.headers["content-type"] = "application/json; charset=utf-8"
    return response


# ==============================================================================
# HEALTH & OVERVIEW
# ==============================================================================
@app.get("/api/v1/health")
async def health_check():
    mcp_info = await list_pascal_mcp_tools()
    return {
        "status": "ok",
        "service": "ATELIER AI Backend",
        "pascal_mcp_connected": mcp_info.get("ok", False),
        "pascal_mcp_tool_count": mcp_info.get("count", 0),
        "timestamp": now_iso(),
    }


# ==============================================================================
# PROJECTS & SCENE REVISIONS
# ==============================================================================
class CreateProjectPayload(BaseModel):
    name: str
    description: str = ""
    width_mm: float = 4000.0
    depth_mm: float = 5000.0
    style: str = "Japandi"
    budget_limit_vnd: float = 120000000.0
    scale_calibrated: bool = False


class InitializeNativeProjectPayload(BaseModel):
    native_project_id: str
    company_id: str
    project_name: str
    brief: str = ""
    conversation_issue_id: Optional[str] = None


class CreateAtelierRoomPayload(BaseModel):
    name: str
    room_type: str = "other"


class LinkLegacyScenePayload(BaseModel):
    room_id: Optional[str] = None
    provenance: str = "legacy"
    is_fixture: bool = False


@app.post("/api/v1/native-projects/initialize", response_model=AtelierProjectWorkspace)
def api_initialize_native_project(body: InitializeNativeProjectPayload):
    try:
        return initialize_native_project_link(
            native_project_id=body.native_project_id,
            company_id=body.company_id,
            project_name=body.project_name,
            brief=body.brief,
            conversation_issue_id=body.conversation_issue_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/v1/native-projects/{native_project_id}/workspace", response_model=AtelierProjectWorkspace)
def api_get_native_project_workspace(native_project_id: str):
    workspace = get_native_project_workspace(native_project_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="ATELIER workspace chưa được khởi tạo")
    return workspace


@app.post("/api/v1/native-projects/{native_project_id}/rooms")
def api_create_atelier_room(native_project_id: str, body: CreateAtelierRoomPayload):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Tên phòng không được để trống")
    try:
        return create_atelier_room(native_project_id, body.name, body.room_type)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/v1/native-projects/{native_project_id}/scenes/{scene_id}/link")
def api_link_legacy_scene(native_project_id: str, scene_id: str, body: LinkLegacyScenePayload):
    try:
        return link_scene_to_native_project(
            native_project_id=native_project_id,
            scene_id=scene_id,
            room_id=body.room_id,
            provenance=body.provenance,
            is_fixture=body.is_fixture,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/v1/legacy-scenes/audit")
def api_audit_legacy_scenes():
    return audit_legacy_scenes()


@app.get("/api/v1/projects")
def api_list_projects(include_fixtures: bool = True):
    return [p.model_dump() for p in list_projects(include_fixtures=include_fixtures)]


@app.post("/api/v1/projects")
async def api_create_project(body: CreateProjectPayload):
    pid = f"proj_{uuid.uuid4().hex[:8]}"
    base = build_default_demo_project()
    base.project_id = pid
    base.name = body.name
    base.description = body.description or f"Phòng {body.width_mm/1000:.1f}×{body.depth_mm/1000:.1f}m phong cách {body.style}"
    base.revision = 1
    base.scale_calibrated = body.scale_calibrated
    base.design_brief.style = body.style
    base.design_brief.budget_limit_vnd = body.budget_limit_vnd

    w = body.width_mm
    d = body.depth_mm
    if base.rooms:
        base.rooms[0].polygon_mm = [[0.0, 0.0], [w, 0.0], [w, d], [0.0, d]]
    base.walls[0].start_mm, base.walls[0].end_mm = [0.0, 0.0], [w, 0.0]
    base.walls[1].start_mm, base.walls[1].end_mm = [w, 0.0], [w, d]
    base.walls[2].start_mm, base.walls[2].end_mm = [w, d], [0.0, d]
    base.walls[3].start_mm, base.walls[3].end_mm = [0.0, d], [0.0, 0.0]

    sync_res = await sync_canonical_to_pascal(base)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        base.pascal_scene_json = sync_res["sceneJson"]

    saved = save_project(base, author="User", reason="Khởi tạo dự án mới", bump_revision=False)
    return saved.model_dump()


@app.get("/api/v1/projects/{project_id}")
def api_get_project(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    qa = analyze_scene_spatial_quality(proj)
    return {
        **proj.model_dump(),
        "spatial_qa": qa,
        "revisions": get_project_revisions(project_id),
    }


@app.put("/api/v1/projects/{project_id}/scene")
async def api_update_scene(project_id: str, updated: CanonicalProject):
    existing = get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    updated.project_id = project_id
    updated.revision = existing.revision
    strict_report = validate_project_for_persistence(updated)
    if not strict_report["valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "SCENE_MEASUREMENT_VALIDATION_FAILED",
                "message": "Scene was not saved because identity or measurement evidence is invalid.",
                "issues": strict_report["issues"],
            },
        )
    sync_res = await sync_canonical_to_pascal(updated)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        updated.pascal_scene_json = sync_res["sceneJson"]
    saved = save_project(updated, author="Studio Workspace", reason="Cập nhật trực tiếp trên Canvas 2D/3D", bump_revision=True)
    return saved.model_dump()


class SurfaceUpdatePayload(BaseModel):
    floor_material_id: Optional[str] = None
    wall_base_material_id: Optional[str] = None
    accent_wall_id: Optional[str] = None
    accent_paint_id: Optional[str] = None
    skirting_material_id: Optional[str] = None
    wall_tile_enabled: Optional[bool] = None
    wall_tile_material_id: Optional[str] = None
    wall_tile_height_mm: Optional[float] = None


@app.post("/api/v1/projects/{project_id}/surfaces")
async def api_update_surfaces(project_id: str, body: SurfaceUpdatePayload):
    """
    Section 7B endpoint: Updates room floor material, base wall paint, accent wall face paint,
    or wall tile zone height, immediately recalculating deterministic BOQ & syncing Pascal 3D colors
    WITHOUT rebuilding wall geometry.
    """
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    if proj.rooms:
        r0 = proj.rooms[0]
        if body.floor_material_id:
            r0.floor_material_id = body.floor_material_id
        if body.wall_base_material_id:
            r0.wall_base_material_id = body.wall_base_material_id
        if body.skirting_material_id:
            r0.skirting_material_id = body.skirting_material_id
        if body.wall_tile_enabled is not None:
            if not r0.wall_tile_zone:
                r0.wall_tile_zone = WallTileZone()
            r0.wall_tile_zone.enabled = body.wall_tile_enabled
            if body.wall_tile_material_id:
                r0.wall_tile_zone.tile_material_id = body.wall_tile_material_id
            if body.wall_tile_height_mm:
                r0.wall_tile_zone.tile_height_mm = body.wall_tile_height_mm

    for w in proj.walls:
        if body.accent_wall_id:
            w.is_accent_wall = (w.id == body.accent_wall_id)
        if w.is_accent_wall and body.accent_paint_id:
            w.face_a_material_id = body.accent_paint_id
        elif not w.is_accent_wall and body.wall_base_material_id:
            w.face_a_material_id = body.wall_base_material_id

    invalidated_nodes = mark_workflow_invalidation("surface_material_change")
    sync_res = await sync_canonical_to_pascal(proj)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        proj.pascal_scene_json = sync_res["sceneJson"]

    saved = save_project(proj, author="Style & Surface Engine (7B)", reason="Cập nhật vật liệu Sơn/Gạch bề mặt", bump_revision=True)
    return {
        "ok": True,
        "invalidated_nodes": invalidated_nodes,
        "geometry_rebuilt": False,
        "project": saved.model_dump(),
    }


@app.post("/api/v1/projects/{project_id}/revisions/{target_revision}/restore")
def api_restore_revision(project_id: str, target_revision: int):
    restored = restore_project_revision(project_id, target_revision)
    if not restored:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên bản cần khôi phục")
    return restored.model_dump()


class ScaleConfirmPayload(BaseModel):
    real_length_mm: float
    wall_id: str = "wall_north"


@app.post("/api/v1/projects/{project_id}/confirm-scale")
async def api_confirm_scale(project_id: str, body: ScaleConfirmPayload):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    w = max(1000.0, float(body.real_length_mm))
    if len(proj.walls) > 4 or len(proj.rooms) > 1:
        ref_wall = next((wl for wl in proj.walls if wl.id == body.wall_id), proj.walls[0] if proj.walls else None)
        current_len = 0.0
        if ref_wall:
            dx = float(ref_wall.end_mm[0]) - float(ref_wall.start_mm[0])
            dy = float(ref_wall.end_mm[1]) - float(ref_wall.start_mm[1])
            current_len = (dx * dx + dy * dy) ** 0.5
        if current_len < 100.0 and proj.walls:
            xs = [p[0] for wl in proj.walls for p in (wl.start_mm, wl.end_mm)]
            current_len = max(xs) - min(xs) if xs else w
        scale_factor = (w / current_len) if current_len > 100.0 else 1.0
        if abs(scale_factor - 1.0) > 1e-4:
            for wl in proj.walls:
                wl.start_mm = [round(wl.start_mm[0] * scale_factor, 1), round(wl.start_mm[1] * scale_factor, 1)]
                wl.end_mm = [round(wl.end_mm[0] * scale_factor, 1), round(wl.end_mm[1] * scale_factor, 1)]
            for rm in proj.rooms:
                rm.polygon_mm = [[round(pt[0] * scale_factor, 1), round(pt[1] * scale_factor, 1)] for pt in rm.polygon_mm]
    else:
        d = round(w * 1.25, 0)
        if proj.rooms:
            proj.rooms[0].polygon_mm = [[0.0, 0.0], [w, 0.0], [w, d], [0.0, d]]
        if len(proj.walls) >= 4:
            proj.walls[0].start_mm, proj.walls[0].end_mm = [0.0, 0.0], [w, 0.0]
            proj.walls[1].start_mm, proj.walls[1].end_mm = [w, 0.0], [w, d]
            proj.walls[2].start_mm, proj.walls[2].end_mm = [w, d], [0.0, d]
            proj.walls[3].start_mm, proj.walls[3].end_mm = [0.0, d], [0.0, 0.0]
    proj.scale_calibrated = True
    if proj.scale_reference:
        proj.scale_reference.real_length_mm = w
        proj.scale_reference.confirmed_by_user = True
        proj.scale_reference.confidence = 0.99
        proj.scale_reference.notes = f"Đã xác nhận cạnh chuẩn {int(w)}mm"
    proj.approval_state = "APPROVED"
    mark_workflow_invalidation("scale_change")
    sync_res = await sync_canonical_to_pascal(proj)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        proj.pascal_scene_json = sync_res["sceneJson"]
    saved = save_project(proj, author="User (Scale Calibration)", reason=f"Xác nhận tỷ lệ cạnh {int(w)}mm", bump_revision=True)
    return saved.model_dump()


# ==============================================================================
# 2D FLOOR PLAN INTAKE (DXF / PDF / PNG / JPG)
# ==============================================================================
@app.post("/api/v1/imports")
async def api_import_floorplan(
    file: UploadFile = File(...),
    project_id: str = Form("proj_demo_4x5m"),
    confirmed_length_mm: Optional[float] = Form(None),
):
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    fname = file.filename or "floorplan.dxf"
    dest = UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}_{fname}"
    content = await file.read()
    dest.write_bytes(content)

    ext = dest.suffix.lower()
    try:
        if ext == ".dxf":
            parsed = parse_dxf_floorplan(dest)
        else:
            parsed = parse_raster_or_pdf_floorplan(dest, confirmed_length_mm)
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Không thể đọc mặt bằng: file không phải ảnh/PDF/DXF hợp lệ. {exc}",
        ) from exc

    proj = get_project(project_id)
    if proj:
        proj.scale_calibrated = parsed["scale_calibrated"]
        proj.approval_state = "APPROVED" if parsed["scale_calibrated"] else "WAITING_FOR_INPUT"
        if parsed.get("walls"):
            proj.walls = [WallSegment(**w) for w in parsed["walls"]]
        if parsed.get("rooms"):
            proj.rooms = [RoomZone(**r) for r in parsed["rooms"]]
        if parsed.get("openings"):
            proj.openings = [DoorOpening(**d) for d in parsed["openings"]]
        if parsed.get("windows"):
            proj.windows = [WindowOpening(**w) for w in parsed["windows"]]
        if parsed.get("scale_reference"):
            proj.scale_reference = ScaleCalibration(**parsed["scale_reference"])
        sync_res = await sync_canonical_to_pascal(proj)
        if sync_res.get("ok") and sync_res.get("sceneJson"):
            proj.pascal_scene_json = sync_res["sceneJson"]
        save_project(proj, author="FloorPlan Intake", reason=f"Nhập mặt bằng {fname}", bump_revision=True)

    return {
        "ok": True,
        "filename": fname,
        "parsed": parsed,
        "project_id": project_id,
    }


# ==============================================================================
# CONVERSATIONAL DESIGN CONCIERGE, QUESTIONS & PROPOSALS
# ==============================================================================
class ChatMessagePayload(BaseModel):
    project_id: str = "proj_demo_4x5m"
    message: str
    workflow_id: Optional[str] = None
    native_tasks: bool = False
    selected_entity_id: Optional[str] = None
    to_ide: Optional[bool] = False


class ResolveBridgeTaskPayload(BaseModel):
    assistant_message: str
    glb_path: Optional[str] = None
    render_urls: Optional[List[str]] = None
    proposal_diff: Optional[Dict[str, Any]] = None


@app.get("/api/v1/chat/history")
@app.get("/api/v1/projects/{project_id}/chat/history")
def api_get_chat_history(project_id: str = "proj_demo_4x5m"):
    conn = get_conn()
    rows = conn.execute(
        "SELECT message_id, project_id, role, sender_name, content, metadata_json, created_at FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC",
        (project_id,),
    ).fetchall()
    q_rows = conn.execute(
        "SELECT payload_json FROM questions WHERE project_id = ? AND status = 'PENDING' ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    p_rows = conn.execute(
        "SELECT payload_json FROM proposals WHERE project_id = ? ORDER BY created_at DESC LIMIT 10",
        (project_id,),
    ).fetchall()
    conn.close()

    messages = []
    for r in rows:
        d = dict(r)
        try:
            d["metadata"] = json.loads(d.pop("metadata_json", "{}"))
        except Exception:
            d["metadata"] = {}
        # Hide pre-contract lifecycle projections that had no durable event
        # receipt. They remain in storage for audit/rollback, but must not be
        # rendered as real agent acknowledgements or completion evidence.
        if (
            d["metadata"].get("workflow_run_id")
            and d["metadata"].get("event_type")
            and not d["metadata"].get("event_id")
        ):
            continue
        messages.append(d)

    return {
        "messages": messages,
        "pending_questions": [json.loads(r["payload_json"]) for r in q_rows],
        "proposals": [json.loads(r["payload_json"]) for r in p_rows],
    }


@app.get("/api/v1/projects/{project_id}/workflow-events")
def api_get_project_workflow_events(
    project_id: str,
    after_sequence: int = 0,
    run_id: Optional[str] = None,
    limit: int = 200,
):
    from app.services.multi_agent_chat_sync import list_project_events

    return list_project_events(
        project_id,
        after_sequence=after_sequence,
        run_id=run_id,
        limit=limit,
    )


@app.post("/api/v1/chat/messages")
@app.post("/api/v1/projects/{project_id}/chat/messages")
async def api_send_chat_message(body: ChatMessagePayload, project_id: Optional[str] = None):
    pid = project_id or body.project_id
    
    # Check if request routes to Antigravity IDE Reverse Bridge (Zero API Cost)
    if ide_bridge_service.is_ide_bridge_enabled():
        lower_txt = body.message.lower()
        # A Studio design request must enter the workflow DAG. IDE bridge work is
        # allowed only when the caller explicitly requests it; environment defaults
        # and keywords must never silently bypass the run/audit trail.
        is_bridge_request = bool(body.to_ide)
        if is_bridge_request:
            task = ide_bridge_service.enqueue_task(
                project_id=pid,
                user_text=body.message,
                selected_entity_id=body.selected_entity_id,
            )
            return {
                "bridge_task_id": task["task_id"],
                "status": "PENDING_IDE",
                "message": "🏛️ Yêu cầu đã được chuyển tới Antigravity IDE (Zero API Cost). Đang chờ phản hồi...",
                "task": task,
            }

    project = get_project(pid)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án Studio cho tin nhắn này")
    user_message_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn = get_conn()
    conn.execute(
        "INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_message_id, pid, "user", "Gia chủ / Người thiết kế", body.message,
         json.dumps({"selected_entity_id": body.selected_entity_id, "workflow_required": True}, ensure_ascii=False), now_iso()),
    )
    conn.commit()
    conn.close()
    try:
        selected_workflow_id = body.workflow_id or get_project_workflow_id(pid)
        if not selected_workflow_id:
            raise HTTPException(status_code=409, detail="Project chưa được gắn workflow đã publish")
        run = await execute_real_workflow_run(
            selected_workflow_id, pid, user_message_id=user_message_id, user_text=body.message,
            native_tasks=body.native_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    legacy_metadata: Dict[str, Any] = {}
    if not body.native_tasks:
        # Preserve the existing Questions/Approval response contract for the
        # legacy UI. Native mode deliberately skips this local handler so a
        # Chief-side compatibility response cannot masquerade as agent work.
        try:
            legacy_result = await process_user_chat_message(
                pid,
                body.message,
                selected_entity_id=body.selected_entity_id,
            )
            legacy_metadata = legacy_result.get("metadata") or {}
        except ValueError:
            legacy_metadata = {}
    reply = f"Đã tạo Workflow Run `{run['run_id']}` cho Revision #{run['scene_revision']}. Trạng thái: **{run['status']}**."
    assistant_message_id = f"msg_{uuid.uuid4().hex[:10]}"
    conn = get_conn()
    metadata = {
        "agent_id": "agent_chief_architect",
        "workflow_run_id": run["run_id"],
        "events": len(run["events"]),
        "native_task_ids": [event["native_task_id"] for event in run["events"] if event.get("native_task_id")],
    }
    for key in ("question", "question_request", "proposal", "proposal_id", "spatial_qa", "invalidated_nodes"):
        if key in legacy_metadata:
            metadata[key] = legacy_metadata[key]
    if run["status"] == "WAITING_FOR_INPUT":
        question_row = conn.execute(
            "SELECT payload_json FROM questions WHERE project_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1",
            (pid,),
        ).fetchone()
        if question_row:
            metadata["question"] = json.loads(question_row["payload_json"])
        else:
            question = QuestionRequest(
                question_id=f"q_{uuid.uuid4().hex[:10]}",
                project_id=pid,
                run_id=run["run_id"],
                origin_agent="agent_floorplan",
                context="Bản vẽ mặt bằng hiện tại chưa có thông số tỷ lệ chuẩn (mm/px).",
                question_text="Chiều dài thực tế của một cạnh tường chuẩn là bao nhiêu milimet?",
                why_needed="Cần ít nhất một cạnh chuẩn để giữ đúng kích thước khi dựng 3D.",
                choices=[QuestionChoice(id="scale_4000", label="4,000 mm (4.0 mét)")],
                blocking=True,
                resume_token=f"resume_{uuid.uuid4().hex[:8]}",
                status="PENDING",
                created_at=now_iso(),
            )
            conn.execute(
                "INSERT INTO questions (question_id, project_id, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (question.question_id, pid, "PENDING", question.model_dump_json(), question.created_at),
            )
            metadata["question"] = question.model_dump()
    conn.execute(
        "INSERT INTO chat_messages (message_id, project_id, role, sender_name, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (assistant_message_id, pid, "assistant", "Kiến Trúc Sư Trưởng (Chief Architect)", reply,
         json.dumps(metadata, ensure_ascii=False), now_iso()),
    )
    conn.commit()
    conn.close()
    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run["run_id"], project_id=pid)
    except Exception:
        pass
    return {
        "user_message_id": user_message_id,
        "assistant_message_id": assistant_message_id,
        "reply": reply,
        "workflow_run": run,
        "metadata": {**metadata, "workflow_state": run["status"]},
    }


@app.get("/api/v1/bridge/tasks")
def api_list_bridge_tasks(status: Optional[str] = "PENDING", limit: int = 50):
    return ide_bridge_service.list_tasks(status=status, limit=limit)


@app.get("/api/v1/bridge/tasks/{task_id}")
def api_get_bridge_task(task_id: str):
    task = ide_bridge_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy bridge task")
    return task


@app.post("/api/v1/bridge/tasks/{task_id}/resolve")
def api_resolve_bridge_task(task_id: str, body: ResolveBridgeTaskPayload):
    try:
        return ide_bridge_service.resolve_task(
            task_id=task_id,
            assistant_message=body.assistant_message,
            glb_path=body.glb_path,
            render_urls=body.render_urls,
            proposal_diff=body.proposal_diff,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/bridge/status")
def api_get_bridge_status():
    return ide_bridge_service.get_bridge_status()


@app.post("/api/v1/bridge/paperclip-enqueue")
async def api_paperclip_enqueue_bridge_task(payload: Dict[str, Any]):
    return await ide_bridge_service.enqueue_paperclip_turn_async(payload)


class AnswerQuestionPayload(BaseModel):
    answer: str


@app.post("/api/v1/questions/{question_id}/answer")
def api_answer_question(question_id: str, body: AnswerQuestionPayload):
    return answer_question_and_resume(question_id, body.answer)


class ApproveProposalPayload(BaseModel):
    option_id: Optional[str] = None


@app.post("/api/v1/proposals/{proposal_id}/approve")
async def api_approve_proposal(proposal_id: str, body: ApproveProposalPayload = ApproveProposalPayload()):
    return await approve_scene_proposal(proposal_id, body.option_id)


class RejectProposalPayload(BaseModel):
    reason: str = "Chưa phù hợp với nhu cầu"


@app.post("/api/v1/proposals/{proposal_id}/reject")
def api_reject_proposal(proposal_id: str, body: RejectProposalPayload = RejectProposalPayload()):
    return reject_scene_proposal(proposal_id, body.reason)


@app.get("/api/v1/projects/{project_id}/design-brief")
def api_get_design_brief(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return proj.design_brief.model_dump()


@app.put("/api/v1/projects/{project_id}/design-brief")
def api_update_design_brief(project_id: str, brief: DesignBrief):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    proj.design_brief = brief
    mark_workflow_invalidation("brief_budget_change")
    saved = save_project(proj, author="User (Design Brief)", reason="Cập nhật hồ sơ sở thích & ngân sách", bump_revision=True)
    return saved.design_brief.model_dump()


@app.get("/api/v1/projects/{project_id}/options")
def api_get_design_options(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return [o.model_dump() for o in generate_design_options(proj)]


# ==============================================================================
# DETERMINISTIC COST ENGINE & MATERIALS / PRODUCT CATALOG
# ==============================================================================
@app.get("/api/v1/materials")
def api_list_materials():
    return load_materials_catalog()


@app.get("/api/v1/pbr-materials")
def api_list_pbr_materials():
    try:
        return {"ok": True, "schema_version": "atelier.material.v1", "materials": [m.model_dump() for m in list_materials()]}
    except MaterialSystemError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/v1/pbr-materials/schema")
def api_get_pbr_material_schema():
    path = MATERIAL_ROOT / "material-definition.schema.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Chưa có Material JSON Schema")
    return FileResponse(path=str(path), filename=path.name, media_type="application/schema+json")


@app.get("/api/v1/pbr-materials/{material_id}")
def api_get_pbr_material(material_id: str):
    try:
        material = get_material(material_id)
    except MaterialSystemError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not material:
        raise HTTPException(status_code=404, detail="Không tìm thấy Material Definition")
    return material.model_dump()


@app.post("/api/v1/pbr-materials")
def api_save_pbr_material(material: MaterialDefinition):
    try:
        saved = save_material(material)
        return {"ok": True, "material": saved.model_dump()}
    except MaterialSystemError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/catalog")
def api_list_catalog(category: Optional[str] = None, tier: Optional[str] = None):
    items = load_products_catalog()
    if category and category != "all":
        items = [i for i in items if i.get("category") == category]
    if tier and tier != "all":
        items = [i for i in items if i.get("tier") == tier]
    return items


class FitCheckPayload(BaseModel):
    project_id: str = "proj_demo_4x5m"
    sku: str
    replace_furniture_id: Optional[str] = None


@app.post("/api/v1/catalog/fit-check")
def api_catalog_fit_check(body: FitCheckPayload):
    proj = get_project(body.project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    catalog = load_products_catalog()
    product = next((p for p in catalog if p["sku"] == body.sku), None)
    if not product:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy sản phẩm {body.sku}")
    return check_catalog_product_fit(proj, product, body.replace_furniture_id)


@app.post("/api/v1/catalog/replace")
async def api_catalog_replace_in_scene(body: FitCheckPayload):
    proj = get_project(body.project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    catalog = load_products_catalog()
    product = next((p for p in catalog if p["sku"] == body.sku), None)
    if not product:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy sản phẩm {body.sku}")

    fit = check_catalog_product_fit(proj, product, body.replace_furniture_id)
    target_id = fit.get("target_furniture_id")

    new_inst = FurnitureInstance(
        id=target_id or f"furn_{uuid.uuid4().hex[:6]}",
        sku=product["sku"],
        name=product["name"],
        category=product["category"],
        room_id="room_main",
        x_mm=2000.0,
        y_mm=2300.0,
        z_mm=0.0,
        width_mm=float(product["width_mm"]),
        depth_mm=float(product["depth_mm"]),
        height_mm=float(product["height_mm"]),
        rotation_deg=90.0 if product["category"] == "sofa" else 0.0,
        color_hex=product.get("color_hex", "#D9D2C5"),
        price_vnd=float(product["price_vnd"]),
        pascal_asset_id=product.get("pascal_asset_id", "sofa"),
        source_url=product.get("source_url"),
        vendor=product.get("vendor"),
    )

    replaced = False
    for idx, f in enumerate(proj.furniture_instances):
        if f.id == target_id or f.category == product["category"]:
            new_inst.id = f.id
            new_inst.x_mm = f.x_mm
            new_inst.y_mm = f.y_mm
            new_inst.rotation_deg = f.rotation_deg
            proj.furniture_instances[idx] = new_inst
            replaced = True
            break
    if not replaced:
        proj.furniture_instances.append(new_inst)

    mark_workflow_invalidation("furniture_change")
    sync_res = await sync_canonical_to_pascal(proj)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        proj.pascal_scene_json = sync_res["sceneJson"]

    saved = save_project(proj, author="Product Catalog Swap", reason=f"Thay thế {product['name']} ({product['sku']})", bump_revision=True)
    return {
        "ok": True,
        "fit_check": fit,
        "project": saved.model_dump(),
    }


@app.get("/api/v1/estimates/{project_id}")
def api_get_estimate(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    est = calculate_project_estimate(proj)
    proj.estimate_snapshot = est
    save_project(proj, author="Cost Engine", reason="Tính toán lại dự toán", bump_revision=False)
    return est.model_dump()


# ==============================================================================
# AI CONTROL CENTER: WORKFLOWS, RUNS, AGENTS & CONNECTIONS
# ==============================================================================
@app.get("/api/v1/workflows")
def api_list_workflows():
    conn = get_conn()
    rows = conn.execute("SELECT payload_json FROM workflows ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [json.loads(r["payload_json"]) for r in rows]


@app.put("/api/v1/workflows/{workflow_id}")
def api_update_workflow(workflow_id: str, wf_payload: Dict[str, Any]):
    conn = get_conn()
    agent_ids = [row["agent_id"] for row in conn.execute("SELECT agent_id FROM agents").fetchall()]
    validation_errors = validate_workflow_snapshot(wf_payload, agent_ids=agent_ids)
    if validation_errors:
        conn.close()
        raise HTTPException(status_code=422, detail={"workflow_invalid": validation_errors})
    ver = int(wf_payload.get("version", 1)) + 1
    wf_payload["workflow_id"] = workflow_id
    wf_payload["version"] = ver
    conn.execute(
        "UPDATE workflows SET version = ?, payload_json = ?, updated_at = ? WHERE workflow_id = ?",
        (ver, json.dumps(wf_payload, ensure_ascii=False), now_iso(), workflow_id),
    )
    conn.commit()
    conn.close()
    return wf_payload


@app.post("/api/v1/workflows/{workflow_id}/runs")
async def api_start_workflow_run(workflow_id: str, project_id: str = "proj_demo_4x5m", native_tasks: bool = False):
    try:
        return await execute_real_workflow_run(workflow_id, project_id, native_tasks=native_tasks)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/runs")
def api_list_runs():
    conn = get_conn()
    rows = conn.execute("SELECT payload_json FROM workflow_runs ORDER BY updated_at DESC LIMIT 20").fetchall()
    conn.close()
    return [json.loads(r["payload_json"]) for r in rows]


@app.get("/api/v1/runs/{run_id}/events")
async def api_stream_run_events(run_id: str):
    conn = get_conn()
    row = conn.execute("SELECT payload_json FROM workflow_runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt chạy")
    run_doc = json.loads(row["payload_json"])

    async def event_generator():
        for ev in run_doc.get("events", []):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.05)
        yield f"data: {json.dumps({'status': 'DONE', 'run_id': run_id})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream; charset=utf-8")


@app.get("/api/v1/runs/{run_id}/artifacts")
def api_list_run_artifacts(run_id: str):
    conn = get_conn()
    rows = conn.execute(
        "SELECT artifact_id, run_id, project_id, node_id, agent_id, artifact_type, schema_version, source_revision, validation_status, storage_ref, checksum_sha256, payload_json, created_at FROM workflow_artifacts WHERE run_id = ? ORDER BY created_at ASC",
        (run_id,),
    ).fetchall()
    conn.close()
    return {
        "run_id": run_id,
        "artifacts": [
            {**dict(row), "payload": json.loads(row["payload_json"])}
            for row in rows
        ],
    }


@app.get("/api/v1/runs/{run_id}/native-tasks")
async def api_list_run_native_tasks(run_id: str):
    try:
        await sync_native_workflow_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    conn = get_conn()
    rows = conn.execute(
        "SELECT task_id, run_id, node_id, local_agent_id, native_agent_id, status, idempotency_key, payload_json, created_at, updated_at FROM workflow_native_tasks WHERE run_id = ? ORDER BY created_at ASC",
        (run_id,),
    ).fetchall()
    conn.close()
    return {
        "run_id": run_id,
        "tasks": [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows],
    }


@app.post("/api/v1/runs/{run_id}/sync")
async def api_sync_native_workflow_run(run_id: str):
    try:
        return await sync_native_workflow_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/runs/{run_id}/decisions")
def api_get_run_decisions(run_id: str):
    conn = get_conn()
    exists = conn.execute("SELECT 1 FROM workflow_runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy workflow run: {run_id}")
    return list_run_decisions(run_id)


@app.post("/api/v1/runs/{run_id}/inputs/reconcile")
async def api_reconcile_run_inputs(run_id: str):
    try:
        result = await asyncio.to_thread(reconcile_workflow_inputs, run_id)
        run = await sync_native_workflow_run(run_id)
        return {"input_sync": result, "run": run}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/agents")
def api_list_agents():
    conn = get_conn()
    rows = conn.execute("SELECT payload_json FROM agents ORDER BY agent_id ASC").fetchall()
    conn.close()
    return [json.loads(r["payload_json"]) for r in rows]


@app.get("/api/v1/agents/prompts")
def api_get_all_agent_prompts():
    from app.services.agent_prompts import AGENT_SPECIFIC_PROMPTS, build_agent_system_prompt
    result = []
    for key, spec in AGENT_SPECIFIC_PROMPTS.items():
        result.append({
            "key": key,
            "name": spec["name"],
            "role_title": spec["role_title"],
            "allowed_tools": spec["allowed_tools"],
            "forbidden_tools": spec["forbidden_tools"],
            "token_limit": spec["token_limit"],
            "system_prompt": build_agent_system_prompt(key),
        })
    return result


@app.get("/api/v1/agents/evaluation/test-cases")
def api_get_prompt_test_cases():
    from app.services.agent_prompts import TEST_CASES_SPEC
    return TEST_CASES_SPEC


@app.get("/api/v1/agents/{agent_key}/prompt")
def api_get_agent_prompt(agent_key: str):
    from app.services.agent_prompts import AGENT_SPECIFIC_PROMPTS, build_agent_system_prompt
    if agent_key not in AGENT_SPECIFIC_PROMPTS:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_key}' not found in prompt registry")
    spec = AGENT_SPECIFIC_PROMPTS[agent_key]
    return {
        "key": agent_key,
        "name": spec["name"],
        "role_title": spec["role_title"],
        "allowed_tools": spec["allowed_tools"],
        "forbidden_tools": spec["forbidden_tools"],
        "token_limit": spec["token_limit"],
        "system_prompt": build_agent_system_prompt(agent_key),
    }


@app.put("/api/v1/agents/{agent_id}")
def api_update_agent(agent_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    payload["agent_id"] = agent_id
    conn.execute(
        """
        INSERT INTO agents (agent_id, name, role, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
            name = excluded.name,
            role = excluded.role,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        """,
        (agent_id, payload.get("name", agent_id), payload.get("role", "custom"), json.dumps(payload, ensure_ascii=False), now_iso()),
    )
    conn.commit()
    conn.close()
    return payload



@app.get("/api/v1/connections")
def api_list_connections():
    """Returns all AI Connections with strict secret masking (never returns raw API keys)."""
    conn = get_conn()
    rows = conn.execute("SELECT payload_json, secret_value FROM connections ORDER BY connection_id ASC").fetchall()
    conn.close()
    out = []
    for r in rows:
        d = json.loads(r["payload_json"])
        sec = r["secret_value"] or ""
        if sec:
            d["has_secret"] = True
            d["masked_secret"] = mask_secret_key(sec)
        # Never expose raw api_key or secret_value
        d.pop("api_key", None)
        d.pop("secret_value", None)
        out.append(d)
    return out


class UpdateConnectionPayload(BaseModel):
    name: Optional[str] = None
    endpoint_or_cmd: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None


@app.put("/api/v1/connections/{connection_id}")
def api_update_connection(connection_id: str, body: UpdateConnectionPayload):
    conn = get_conn()
    row = conn.execute("SELECT payload_json, secret_value FROM connections WHERE connection_id = ?", (connection_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy kết nối")

    cfg = json.loads(row["payload_json"])
    sec = row["secret_value"] or ""
    if body.name:
        cfg["name"] = body.name
    if body.endpoint_or_cmd:
        cfg["endpoint_or_cmd"] = body.endpoint_or_cmd
    if body.model_name:
        cfg["model_name"] = body.model_name
    if body.api_key is not None and body.api_key.strip():
        sec = body.api_key.strip()
        cfg["has_secret"] = True
        cfg["masked_secret"] = mask_secret_key(sec)
        cfg["status"] = "CONFIGURED"

    conn.execute(
        "UPDATE connections SET name = ?, payload_json = ?, secret_value = ?, updated_at = ? WHERE connection_id = ?",
        (cfg["name"], json.dumps(cfg, ensure_ascii=False), sec, now_iso(), connection_id),
    )
    conn.commit()
    conn.close()
    cfg.pop("api_key", None)
    return cfg


@app.post("/api/v1/connections/{connection_id}/test")
async def api_test_connection(connection_id: str):
    return await test_ai_connection(connection_id)


# ==============================================================================
# PASCAL MCP GATEWAY ENDPOINTS
# ==============================================================================
@app.get("/api/v1/mcp/tools")
async def api_mcp_list_tools():
    return await list_pascal_mcp_tools()


class McpCallPayload(BaseModel):
    tool_name: str
    arguments: Dict[str, Any] = {}
    agent_id: Optional[str] = None


@app.post("/api/v1/mcp/call")
async def api_mcp_call_tool(body: McpCallPayload):
    allowed: Optional[List[str]] = None
    if body.agent_id:
        conn = get_conn()
        row = conn.execute("SELECT payload_json FROM agents WHERE agent_id = ?", (body.agent_id,)).fetchone()
        conn.close()
        if row:
            ag = json.loads(row["payload_json"])
            allowed = ag.get("allowed_mcp_tools")
    res = await call_pascal_mcp_tool(body.tool_name, body.arguments, allowed_tools=allowed)
    return res


# ==============================================================================
# CAD & BOQ EXPORTS (DXF / GLB / IFC / DAE / CSV / XLSX)
# ==============================================================================
@app.get("/api/v1/exports/{project_id}/{fmt}")
def api_export_project_file(project_id: str, fmt: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    fmt_lower = fmt.lower()
    if fmt_lower == "dxf":
        path = export_project_to_dxf(proj)
        media = "application/dxf"
    elif fmt_lower == "glb":
        path = export_project_to_glb(proj)
        media = "model/gltf-binary"
    elif fmt_lower == "dae":
        path = export_project_to_collada_dae(proj)
        media = "model/vnd.collada+xml"
    elif fmt_lower == "ifc":
        path = export_project_to_ifc(proj)
        media = "application/x-step"
    elif fmt_lower == "csv":
        path = export_boq_csv(proj)
        media = "text/csv"
    elif fmt_lower == "xlsx":
        path = export_boq_xlsx(proj)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise HTTPException(status_code=400, detail=f"Định dạng xuất '{fmt}' không được hỗ trợ")

    return FileResponse(path=str(path), filename=path.name, media_type=media)


# ==============================================================================
# UPGRADE 1 & 3: HOUSE PLAN DESIGNER (MULTI-ROOM APARTMENT GENERATOR)
# ==============================================================================
class HousePlanGeneratePayload(BaseModel):
    reference_length_mm: float = 4000.0
    scale_confirmed: bool = True
    project_name: str = "Căn Hộ Đa Phòng Mẫu ATELIER"


@app.post("/api/v1/projects/{project_id}/house-plan/generate")
async def api_generate_multiroom_house_plan(project_id: str, body: HousePlanGeneratePayload):
    proj = get_project(project_id)
    if not proj:
        proj = build_default_demo_project()
        proj.project_id = project_id

    # Build multiroom FloorSpec
    floorspec = build_default_multiroom_floorspec(
        scale_confirmed=body.scale_confirmed,
        reference_length_mm=body.reference_length_mm,
    )

    # Convert to CanonicalProject
    canonical = convert_floorspec_to_canonical_project(floorspec, project_id=project_id, project_name=body.project_name)
    scenegraph = convert_floorspec_to_pascal_scenegraph(floorspec)
    canonical.pascal_scene_json = scenegraph

    # Recalculate deterministic BOQ
    canonical.estimate_snapshot = calculate_project_estimate(canonical)

    saved = save_project(canonical, author="Floor Plan Specialist (House Plan Designer)", reason="Tạo mặt bằng căn hộ đa phòng tự động", bump_revision=True)

    return {
        "ok": True,
        "floor_spec": floorspec.model_dump(),
        "pascal_scene": scenegraph,
        "project": saved.model_dump(),
    }


# ==============================================================================
# UPGRADE 5: RESEARCH AGENT & VERIFIED VIETNAM PRODUCTS
# ==============================================================================
@app.get("/api/v1/research/products")
def api_research_products(q: str = "", category: Optional[str] = None, max_budget_vnd: Optional[float] = None):
    items = search_real_products(query=q, category=category, max_budget_vnd=max_budget_vnd)
    return {
        "ok": True,
        "total_results": len(items),
        "results": [i.model_dump() for i in items],
    }


# ==============================================================================
# UPGRADE 6: DESIGN INVENTORY / BILL OF MATERIALS (BOM)
# ==============================================================================
@app.get("/api/v1/projects/{project_id}/inventory")
def api_get_project_inventory_bom(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    bom = generate_project_inventory_bom(proj)
    return {
        "ok": True,
        "inventory_bom": bom.model_dump(),
    }


@app.get("/api/v1/projects/{project_id}/inventory/export/csv")
def api_export_inventory_bom_csv(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    bom = generate_project_inventory_bom(proj)
    out_dir = ROOT_DIR / "data" / "exports"
    out_path = out_dir / f"{project_id}_inventory_bom_rev{proj.revision}.csv"
    export_inventory_bom_csv(bom, out_path)

    return FileResponse(
        path=str(out_path),
        filename=out_path.name,
        media_type="text/csv",
    )


# ==============================================================================
# UPGRADE 7: BLENDER MCP ON-DEMAND ENGINE
# ==============================================================================
class BlenderMeshPayload(BaseModel):
    item_id: str
    name: str
    category: str = "custom_furniture"
    dimensions_mm: List[float] = [1200.0, 600.0, 750.0]


@app.get("/api/v1/render/blender/status")
def api_blender_status():
    available, msg = is_blender_available()
    caps = probe_blender_capabilities() if available else {}
    return {
        "ok": available,
        "blender_available": available,
        "status": "AVAILABLE" if available else "BLOCKED",
        "status_message": msg,
        "capabilities": caps,
        "execution_policy": {
            "on_demand_execution": True,
            "timeout_seconds": 180,
            "fake_glb_fallback": False,
            "pillow_fallback": False,
            "cycles_render_available": bool(caps.get("cycles_available", available)),
        },
    }


@app.post("/api/v1/render/blender/custom-mesh")
def api_generate_blender_mesh(body: BlenderMeshPayload):
    out_dir = ROOT_DIR / "data" / "exports" / "meshes"
    out_path = out_dir / f"{body.item_id}.glb"
    res = generate_custom_furniture_glb(
        item_id=body.item_id,
        name=body.name,
        category=body.category,
        dimensions_mm=body.dimensions_mm,
        output_glb_path=out_path,
    )
    return res


# ==============================================================================
# G1: LICENSED ASSET DISCOVERY, IMPORT, VALIDATION & SCENE ASSIGNMENT
# ==============================================================================
class AssetSearchPayload(BaseModel):
    query: str
    source: str = "poly_haven"
    limit: int = 3
    asset_type: str = "3d-model"


class PolyHavenImportPayload(BaseModel):
    slug: str
    resolution: str = "1k"
    category: str = "furniture"
    scene_object_id: Optional[str] = None


class AssignAssetPayload(BaseModel):
    asset_id: str


class MaterialProposalPayload(BaseModel):
    slot_id: str
    material_id: str
    material_version: int = 1
    tint: Optional[str] = None
    pbr: Dict[str, float | str] = {}


class SmartResizePayload(BaseModel):
    target_dimensions_mm: List[float]


class PlacementProposalPayload(BaseModel):
    x_mm: float
    y_mm: float
    rotation_deg: float = 0.0


def _asset_error(exc: AssetPipelineError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@app.post("/api/v1/assets/search")
def api_search_assets(body: AssetSearchPayload):
    try:
        if body.source not in {"poly_haven", "ambientcg", "sketchfab"}:
            raise AssetPipelineError("Nguồn asset không được hỗ trợ")
        results = search_assets(body.query, body.source, body.limit, body.asset_type)
        return {"ok": True, "source": body.source, "results": [item.model_dump() for item in results]}
    except AssetPipelineError as exc:
        raise _asset_error(exc) from exc


@app.post("/api/v1/assets/import/poly-haven")
def api_import_poly_haven_asset(body: PolyHavenImportPayload):
    try:
        if body.resolution not in {"1k", "2k", "4k"}:
            raise AssetPipelineError("Resolution phải là 1k, 2k hoặc 4k")
        metadata = import_poly_haven_model(
            body.slug, body.resolution, body.category, body.scene_object_id
        )
        return {"ok": metadata.validation_status == "VALID", "asset": metadata.model_dump()}
    except AssetPipelineError as exc:
        raise _asset_error(exc) from exc


@app.post("/api/v1/assets/import/user")
async def api_import_user_asset(
    file: UploadFile = File(...),
    name: str = Form(...),
    category: str = Form("furniture"),
    author: str = Form(...),
    license_name: str = Form(...),
    source_url: Optional[str] = Form(None),
    scene_object_id: Optional[str] = Form(None),
):
    original_name = Path(file.filename or "asset.glb").name
    if Path(original_name).suffix.lower() != ".glb":
        raise HTTPException(status_code=400, detail="User Asset Library hiện chỉ nhận file .glb")
    upload_dir = UPLOADS_DIR / "assets"
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / f"{uuid.uuid4().hex}_{original_name}"
    upload_path.write_bytes(await file.read())
    try:
        metadata = register_user_glb(
            upload_path,
            name=name,
            category=category,
            author=author,
            license_name=license_name,
            source_url=source_url,
            scene_object_id=scene_object_id,
        )
        return {"ok": True, "asset": metadata.model_dump()}
    except AssetPipelineError as exc:
        raise _asset_error(exc) from exc


@app.get("/api/v1/assets")
def api_list_assets():
    return {"ok": True, "assets": [asset.model_dump() for asset in list_registered_assets()]}


@app.get("/api/v1/assets/library")
def api_list_assets_library():
    return {"ok": True, "assets": [asset.model_dump() for asset in list_registered_assets()]}


@app.get("/api/v1/assets/license-report")
def api_asset_license_report():
    return asset_license_report()


@app.get("/api/v1/assets/{asset_id}")
def api_get_asset(asset_id: str):
    metadata = get_asset_metadata(asset_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Không tìm thấy asset")
    return metadata.model_dump()


@app.get("/api/v1/assets/{asset_id}/file")
def api_get_asset_file(asset_id: str):
    metadata = get_asset_metadata(asset_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Không tìm thấy asset")
    path = (ASSET_LIBRARY_DIR / asset_id / "normalized.glb").resolve()
    root = ASSET_LIBRARY_DIR.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy GLB đã chuẩn hóa")
    return FileResponse(path=str(path), filename=f"{asset_id}.glb", media_type="model/gltf-binary")


@app.get("/api/v1/assets/{asset_id}/material-structure")
def api_get_asset_material_structure(asset_id: str):
    metadata = get_asset_metadata(asset_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Không tìm thấy asset")
    path = ASSET_LIBRARY_DIR / asset_id / "normalized.glb"
    try:
        return {"ok": True, "asset_id": asset_id, **inspect_glb_material_structure(path)}
    except MaterialSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/projects/{project_id}/furniture/{object_id}/asset")
@app.post("/api/v1/projects/{project_id}/furniture/{object_id}/assign-asset")
async def api_assign_asset_to_furniture(project_id: str, object_id: str, body: AssignAssetPayload):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    metadata = get_asset_metadata(body.asset_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Không tìm thấy asset")
    if metadata.validation_status != "VALID":
        raise HTTPException(status_code=409, detail="Asset chưa vượt qua kiểm tra GLB")
    furniture = next((item for item in project.furniture_instances if item.id == object_id), None)
    if not furniture:
        raise HTTPException(status_code=404, detail="Không tìm thấy furniture instance")
    furniture.asset_id = metadata.asset_id
    furniture.asset_version = metadata.asset_version
    furniture.geometry_hash = metadata.geometry_hash
    furniture.normalized_glb = metadata.normalized_glb
    furniture.material_slots = metadata.material_slots
    furniture.source_url = metadata.source_url
    sync_res = await sync_canonical_to_pascal(project)
    if sync_res.get("ok") and sync_res.get("sceneJson"):
        project.pascal_scene_json = sync_res["sceneJson"]
    saved = save_project(
        project,
        author="Licensed Asset Pipeline",
        reason=f"Gắn asset {metadata.asset_id} vào {object_id}",
        bump_revision=True,
    )
    return {"ok": True, "asset": metadata.model_dump(), "project": saved.model_dump()}


@app.post("/api/v1/projects/{project_id}/furniture/{object_id}/material-proposals")
def api_create_furniture_material_proposal(
    project_id: str, object_id: str, body: MaterialProposalPayload
):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    furniture = next((item for item in project.furniture_instances if item.id == object_id), None)
    if not furniture:
        raise HTTPException(status_code=404, detail="Không tìm thấy furniture instance")
    slot = next((item for item in furniture.material_slots if item.slot_id == body.slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="Material slot không tồn tại trên object")

    override = MaterialOverride(
        material_id=body.material_id,
        material_version=body.material_version,
        tint=body.tint,
        pbr=body.pbr,
    )
    try:
        resolved = resolve_material(override)
    except MaterialSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    proposed = project.model_copy(deep=True)
    proposed_furniture = next(item for item in proposed.furniture_instances if item.id == object_id)
    old_override = proposed_furniture.material_overrides.get(body.slot_id)
    proposed_furniture.material_overrides[body.slot_id] = override
    proposed.approval_state = "WAITING_FOR_APPROVAL"

    proposal_id = f"prop_mat_{uuid.uuid4().hex[:10]}"
    proposal = SceneProposal(
        proposal_id=proposal_id,
        project_id=project_id,
        base_revision=project.revision,
        origin_agent="Material Editor G2",
        title=f"Đổi vật liệu {furniture.name} / {body.slot_id}",
        reason="Material override theo slot; không thay geometry, vị trí, kích thước hoặc số lượng BOM.",
        diffs=[
            SceneDiffItem(
                entity_type="material_slot",
                entity_id=f"{object_id}:{body.slot_id}",
                action="UPDATE",
                before_summary=old_override.model_dump_json() if old_override else "Vật liệu gốc từ GLB",
                after_summary=f"{body.material_id} v{body.material_version}, tint={resolved['tint']}",
                cost_delta_vnd=0.0,
            )
        ],
        cost_delta_vnd=0.0,
        projected_total_vnd=project.estimate_snapshot.total_vnd if project.estimate_snapshot else 0.0,
        budget_limit_vnd=project.design_brief.budget_limit_vnd,
        proposed_canonical=proposed.model_dump(),
        status="PENDING",
        created_at=now_iso(),
    )
    conn = get_conn()
    conn.execute(
        "INSERT INTO proposals (proposal_id, project_id, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (proposal_id, project_id, "PENDING", proposal.model_dump_json(), proposal.created_at),
    )
    conn.commit()
    conn.close()
    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run["run_id"], project_id=pid)
    except Exception:
        pass
    return {
        "ok": True,
        "persisted": False,
        "proposal": proposal.model_dump(),
        "preview_project": proposed.model_dump(),
        "resolved_material": resolved,
    }


@app.get("/api/v1/projects/{project_id}/furniture/{object_id}/smart-fit")
def api_assess_furniture_smart_fit(project_id: str, object_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    furniture = next((item for item in project.furniture_instances if item.id == object_id), None)
    if not furniture:
        raise HTTPException(status_code=404, detail="Không tìm thấy furniture instance")
    return {
        "ok": True,
        "sizing_policy": furniture.sizing_policy,
        "measured_dimensions_mm": [furniture.width_mm, furniture.depth_mm, furniture.height_mm],
        "assessment": assess_fit(project, furniture),
    }


@app.get("/api/v1/projects/{project_id}/furniture/{object_id}/placement-options")
def api_generate_furniture_placement_options(project_id: str, object_id: str, limit: int = 2):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return generate_placement_options(project, object_id, limit)


@app.post("/api/v1/projects/{project_id}/furniture/{object_id}/resize-plan")
def api_plan_furniture_resize(project_id: str, object_id: str, body: SmartResizePayload):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    furniture = next((item for item in project.furniture_instances if item.id == object_id), None)
    if not furniture:
        raise HTTPException(status_code=404, detail="Không tìm thấy furniture instance")
    return plan_resize(furniture, body.target_dimensions_mm)


@app.post("/api/v1/projects/{project_id}/furniture/{object_id}/placement-proposals")
def api_create_placement_proposal(project_id: str, object_id: str, body: PlacementProposalPayload):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    furniture = next((item for item in project.furniture_instances if item.id == object_id), None)
    if not furniture:
        raise HTTPException(status_code=404, detail="Không tìm thấy furniture instance")
    fit = assess_fit(project, furniture, x_mm=body.x_mm, y_mm=body.y_mm, rotation_deg=body.rotation_deg)
    if not fit["fits"]:
        raise HTTPException(status_code=409, detail={"message": "Vị trí đề xuất không đạt Smart Fit", "fit": fit})
    proposed = project.model_copy(deep=True)
    proposed_furniture = next(item for item in proposed.furniture_instances if item.id == object_id)
    before = [proposed_furniture.x_mm, proposed_furniture.y_mm, proposed_furniture.rotation_deg]
    proposed_furniture.x_mm = body.x_mm
    proposed_furniture.y_mm = body.y_mm
    proposed_furniture.rotation_deg = body.rotation_deg
    proposed.approval_state = "WAITING_FOR_APPROVAL"
    proposal_id = f"prop_fit_{uuid.uuid4().hex[:10]}"
    proposal = SceneProposal(
        proposal_id=proposal_id,
        project_id=project_id,
        base_revision=project.revision,
        origin_agent="Smart Furniture Fit G3",
        title=f"Bố trí lại {furniture.name}",
        reason="Phương án vượt qua room polygon, SAT collision, doorway và ceiling constraints.",
        diffs=[SceneDiffItem(
            entity_type="furniture",
            entity_id=object_id,
            action="UPDATE",
            before_summary=f"x/y/rotation={before}",
            after_summary=f"x/y/rotation={[body.x_mm, body.y_mm, body.rotation_deg]}",
        )],
        proposed_canonical=proposed.model_dump(),
        projected_total_vnd=project.estimate_snapshot.total_vnd if project.estimate_snapshot else 0.0,
        budget_limit_vnd=project.design_brief.budget_limit_vnd,
        created_at=now_iso(),
    )
    conn = get_conn()
    conn.execute(
        "INSERT INTO proposals (proposal_id, project_id, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (proposal_id, project_id, "PENDING", proposal.model_dump_json(), proposal.created_at),
    )
    conn.commit()
    conn.close()
    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run["run_id"], project_id=pid)
    except Exception:
        pass
    return {"ok": True, "persisted": False, "proposal": proposal.model_dump(), "fit": fit, "preview_project": proposed.model_dump()}



# ==============================================================================
# G3 HDRI SERVING, G4 SURFACE MATERIAL PROPOSALS, G5 SCENE BRIDGE & G6 CYCLES QUEUE
# ==============================================================================
class SurfaceMaterialProposalPayload(BaseModel):
    slot_id: Optional[str] = "FLOOR_MAIN"
    material_id: str
    material_version: int = 1
    tint: Optional[str] = None
    pbr: Dict[str, float | str] = {}
    texture_scale: Optional[PhysicalTextureScale] = None
    uv_transform: Optional[Dict[str, Any]] = None


class SceneBridgePayload(BaseModel):
    camera: str = "eye_level"
    camera_id: Optional[str] = None
    time_of_day: str = "day"
    lighting_preset: Optional[str] = None


class RenderScenePayload(BaseModel):
    camera: str = "eye_level"
    camera_id: Optional[str] = None
    time_of_day: str = "day"
    lighting_preset: Optional[str] = None
    mode: str = "preview"
    seed: int = 1234
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    samples: Optional[int] = None
    use_cache: bool = True
    async_exec: bool = False
    wait_for_completion: Optional[bool] = None
    simulate_delay_ms: int = 0
    force_invalid_arg: bool = False


class RetryRenderJobPayload(BaseModel):
    async_exec: bool = False
    wait_for_completion: Optional[bool] = None


VALID_RENDER_CAMERAS = {"eye_level", "corner", "detail_sofa", "wide", "top", "cutaway", "walk", "orbit"}


@app.get("/api/v1/render/capabilities")
@app.get("/api/v1/blender/capabilities")
def api_get_render_capabilities():
    probe = probe_blender_capabilities()
    return {
        **probe,
        "available": bool(probe.get("blender_available") or probe.get("ok")),
    }


@app.get("/api/v1/assets/hdri")
def api_list_hdris():
    hdri_root = ASSET_ROOT / "hdri"
    items = []
    if hdri_root.exists():
        for mp in sorted(hdri_root.glob("*/metadata.json")):
            try:
                items.append(json.loads(mp.read_text(encoding="utf-8")))
            except Exception:
                continue
    return {"ok": True, "hdris": items}


@app.get("/api/v1/assets/hdri/{filename}")
def api_get_hdri_file(filename: str):
    safe = "".join(c for c in filename if c.isalnum() or c in {"_", "-", "."})
    if not safe or safe != filename:
        raise HTTPException(status_code=400, detail="Tên file HDRI không hợp lệ")
    stem = Path(safe).stem
    candidate = ASSET_ROOT / "hdri" / stem / safe
    if not candidate.is_file() and stem == "photo_studio_loft_hall_1k":
        import_poly_haven_hdri("photo_studio_loft_hall", "1k")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file HDRI")
    return FileResponse(path=str(candidate), filename=safe, media_type="application/octet-stream")


@app.post("/api/v1/projects/{project_id}/surfaces/{surface_key}/material-proposals")
def api_create_surface_material_proposal(
    project_id: str, surface_key: str, body: SurfaceMaterialProposalPayload
):
    if surface_key not in {"floor", "wall", "ceiling"}:
        raise HTTPException(status_code=400, detail="Surface key phải là floor, wall hoặc ceiling")
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    tex_scale = body.texture_scale
    if not tex_scale and body.uv_transform:
        uv = body.uv_transform
        tile_sz = uv.get("tile_size_mm") or [800.0, 800.0]
        off_mm = uv.get("offset_mm") or [0.0, 0.0]
        tex_scale = PhysicalTextureScale(
            width_mm=float(tile_sz[0]),
            height_mm=float(tile_sz[1]),
            grout_width_mm=float(uv.get("grout_thickness_mm", 3.0)),
            grout_color_hex=str(uv.get("grout_color", "#B8B1A6")),
            rotation_deg=float(uv.get("rotation_deg", 0.0)),
            offset_x_mm=float(off_mm[0]),
            offset_y_mm=float(off_mm[1]),
        )

    override = MaterialOverride(
        material_id=body.material_id,
        material_version=body.material_version,
        tint=body.tint,
        pbr=body.pbr,
        texture_scale=tex_scale,
    )
    try:
        resolved = resolve_material(override)
    except MaterialSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    proposed = project.model_copy(deep=True)
    old_override = proposed.surface_material_overrides.get(surface_key)
    proposed.surface_material_overrides[surface_key] = override
    if proposed.rooms:
        for rm in proposed.rooms:
            if surface_key == "floor":
                rm.floor_material_id = body.material_id
            elif surface_key == "wall":
                rm.wall_base_material_id = body.material_id
            elif surface_key == "ceiling":
                rm.ceiling_material_id = body.material_id
    proposed.approval_state = "WAITING_FOR_APPROVAL"

    scale_info = resolved.get("physical_scale") or {}
    proposal_id = f"prop_surf_{uuid.uuid4().hex[:10]}"
    proposal = SceneProposal(
        proposal_id=proposal_id,
        project_id=project_id,
        base_revision=project.revision,
        origin_agent="Surface Material Editor G4",
        title=f"Đổi vật liệu bề mặt {surface_key}: {body.material_id}",
        reason=(
            f"Cập nhật vật liệu {surface_key} sang {body.material_id} "
            f"({scale_info.get('width_mm', 800)}×{scale_info.get('height_mm', 800)}mm, "
            f"ron {scale_info.get('grout_width_mm', 0)}mm)."
        ),
        diffs=[
            SceneDiffItem(
                entity_type="surface_material",
                entity_id=surface_key,
                action="UPDATE",
                before_summary=old_override.model_dump_json() if old_override else (project.rooms[0].floor_material_id if project.rooms else "default"),
                after_summary=f"{body.material_id} v{body.material_version}, tint={resolved['tint']}, scale={scale_info}",
                cost_delta_vnd=0.0,
            )
        ],
        cost_delta_vnd=0.0,
        projected_total_vnd=project.estimate_snapshot.total_vnd if project.estimate_snapshot else 0.0,
        budget_limit_vnd=project.design_brief.budget_limit_vnd,
        proposed_canonical=proposed.model_dump(),
        status="PENDING",
        created_at=now_iso(),
    )
    conn = get_conn()
    conn.execute(
        "INSERT INTO proposals (proposal_id, project_id, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (proposal_id, project_id, "PENDING", proposal.model_dump_json(), proposal.created_at),
    )
    conn.commit()
    conn.close()
    try:
        from app.services.multi_agent_chat_sync import sync_workflow_run_to_chat
        sync_workflow_run_to_chat(run["run_id"], project_id=pid)
    except Exception:
        pass
    return {
        "ok": True,
        "persisted": False,
        "proposal": proposal.model_dump(),
        "preview_project": proposed.model_dump(),
        "resolved_material": resolved,
    }


@app.post("/api/v1/projects/{project_id}/scene-bridge")
@app.post("/api/v1/projects/{project_id}/scene-bridge/verify")
def api_build_project_scene_bridge(project_id: str, body: SceneBridgePayload = SceneBridgePayload()):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    cam = body.camera_id or body.camera or "eye_level"
    tod = body.lighting_preset or body.time_of_day or "day"
    if cam not in VALID_RENDER_CAMERAS:
        raise HTTPException(status_code=422, detail=f"Camera '{cam}' không hợp lệ")
    return build_and_verify_blender_scene(proj, camera=cam, time_of_day=tod)


@app.post("/api/v1/projects/{project_id}/render")
@app.post("/api/v1/projects/{project_id}/render-jobs")
def api_enqueue_project_render_job(project_id: str, body: RenderScenePayload = RenderScenePayload()):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    cam = body.camera_id or body.camera or "eye_level"
    tod = body.lighting_preset or body.time_of_day or "day"
    if cam not in VALID_RENDER_CAMERAS:
        raise HTTPException(status_code=422, detail=f"Camera '{cam}' không hợp lệ")
    if body.mode not in {"preview", "final"}:
        raise HTTPException(status_code=422, detail=f"Render mode '{body.mode}' không hợp lệ")
    render_mode = "final" if body.mode == "final" else "preview"
    is_async = (not body.wait_for_completion) if body.wait_for_completion is not None else body.async_exec
    return enqueue_render_job(
        project_id,
        mode=render_mode,
        camera=cam,
        time_of_day=tod,
        seed=body.seed,
        width_px=body.width_px,
        height_px=body.height_px,
        samples=body.samples,
        use_cache=body.use_cache,
        async_exec=is_async,
        simulate_delay_ms=body.simulate_delay_ms,
        force_invalid_arg=body.force_invalid_arg,
    )


@app.get("/api/v1/projects/{project_id}/render-jobs")
def api_list_project_render_jobs(project_id: str, limit: int = 30):
    return {"ok": True, "project_id": project_id, "jobs": list_project_render_jobs(project_id, limit=limit)}


@app.get("/api/v1/projects/{project_id}/render-gallery")
def api_get_project_render_gallery(project_id: str):
    jobs = list_project_render_jobs(project_id, limit=50)
    completed = [j for j in jobs if j.get("status") == "COMPLETED" and j.get("renderer") == "BLENDER_CYCLES"]
    return {
        "ok": True,
        "project_id": project_id,
        "count": len(completed),
        "gallery": completed,
    }


@app.get("/api/v1/render-jobs/{job_id}")
def api_get_render_job_detail(job_id: str):
    job = get_render_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy render job")
    return job


@app.post("/api/v1/render-jobs/{job_id}/cancel")
def api_cancel_render_job(job_id: str):
    try:
        return cancel_render_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/v1/render-jobs/{job_id}/retry")
def api_retry_render_job(job_id: str, body: Optional[RetryRenderJobPayload] = None):
    try:
        is_async = False
        if body is not None:
            is_async = (not body.wait_for_completion) if body.wait_for_completion is not None else body.async_exec
        return retry_render_job(job_id, async_exec=is_async)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/render-jobs/{job_id}/download")
def api_download_render_job_image(job_id: str):
    job = get_render_job(job_id)
    if not job or not job.get("out_path"):
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh kết xuất của job")
    file_path = Path(job["out_path"])
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Tệp ảnh không tồn tại trên đĩa")
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{file_path.name}"'},
    )


@app.get("/api/v1/renders/{filename}")
def api_get_rendered_image(filename: str):
    file_path = ROOT_DIR / "data" / "exports" / "renders" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh kết xuất")
    return FileResponse(path=str(file_path), filename=filename, media_type="image/png")
    create_atelier_room,
    get_native_project_workspace,
    initialize_native_project_link,
    link_scene_to_native_project,
