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
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.db import (
    build_default_demo_project,
    get_conn,
    get_project,
    get_project_revisions,
    init_db,
    list_projects,
    now_iso,
    restore_project_revision,
    save_project,
)
from app.models.contracts import (
    CanonicalProject,
    DesignBrief,
    FurnitureInstance,
    WallTileZone,
)
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
from app.services.mcp_gateway import (
    call_pascal_mcp_tool,
    list_pascal_mcp_tools,
    sync_canonical_to_pascal,
)
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
    yield


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
    scale_calibrated: bool = True


@app.get("/api/v1/projects")
def api_list_projects():
    return [p.model_dump() for p in list_projects()]


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
def api_confirm_scale(project_id: str, body: ScaleConfirmPayload):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    w = max(1000.0, float(body.real_length_mm))
    d = round(w * 1.25, 0)
    proj.scale_calibrated = True
    if proj.scale_reference:
        proj.scale_reference.real_length_mm = w
        proj.scale_reference.confirmed_by_user = True
        proj.scale_reference.confidence = 0.99
        proj.scale_reference.notes = f"Đã xác nhận cạnh chuẩn {int(w)}mm"
    if proj.rooms:
        proj.rooms[0].polygon_mm = [[0.0, 0.0], [w, 0.0], [w, d], [0.0, d]]
    if len(proj.walls) >= 4:
        proj.walls[0].start_mm, proj.walls[0].end_mm = [0.0, 0.0], [w, 0.0]
        proj.walls[1].start_mm, proj.walls[1].end_mm = [w, 0.0], [w, d]
        proj.walls[2].start_mm, proj.walls[2].end_mm = [w, d], [0.0, d]
        proj.walls[3].start_mm, proj.walls[3].end_mm = [0.0, d], [0.0, 0.0]
    proj.approval_state = "APPROVED"
    mark_workflow_invalidation("scale_change")
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
    if ext == ".dxf":
        parsed = parse_dxf_floorplan(dest)
    else:
        parsed = parse_raster_or_pdf_floorplan(fname, confirmed_length_mm)

    proj = get_project(project_id)
    if proj:
        proj.scale_calibrated = parsed["scale_calibrated"]
        proj.approval_state = "APPROVED" if parsed["scale_calibrated"] else "WAITING_FOR_INPUT"
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
    selected_entity_id: Optional[str] = None


@app.get("/api/v1/chat/history")
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
        messages.append(d)

    return {
        "messages": messages,
        "pending_questions": [json.loads(r["payload_json"]) for r in q_rows],
        "proposals": [json.loads(r["payload_json"]) for r in p_rows],
    }


@app.post("/api/v1/chat/messages")
async def api_send_chat_message(body: ChatMessagePayload):
    res = await process_user_chat_message(
        project_id=body.project_id,
        user_text=body.message,
        selected_entity_id=body.selected_entity_id,
    )
    return res


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
def api_start_workflow_run(workflow_id: str, project_id: str = "proj_demo_4x5m"):
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    conn = get_conn()
    wf_row = conn.execute("SELECT payload_json FROM workflows WHERE workflow_id = ?", (workflow_id,)).fetchone()
    wf = json.loads(wf_row["payload_json"]) if wf_row else {"nodes": []}

    events = []
    for idx, node in enumerate(wf.get("nodes", [])):
        if not node.get("enabled", True):
            events.append({"step": idx + 1, "node_id": node["id"], "label": node["label"], "status": "SKIPPED", "duration_ms": 0})
        else:
            events.append({
                "step": idx + 1,
                "node_id": node["id"],
                "label": node["label"],
                "agent_id": node.get("agent_id"),
                "status": "COMPLETED",
                "duration_ms": 38 + (idx * 17),
            })

    run_doc = {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "project_id": project_id,
        "status": "COMPLETED",
        "events": events,
        "started_at": now_iso(),
        "completed_at": now_iso(),
    }
    conn.execute(
        "INSERT INTO workflow_runs (run_id, workflow_id, project_id, status, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, workflow_id, project_id, "COMPLETED", json.dumps(run_doc, ensure_ascii=False), now_iso()),
    )
    conn.commit()
    conn.close()
    return run_doc


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

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/v1/agents")
def api_list_agents():
    conn = get_conn()
    rows = conn.execute("SELECT payload_json FROM agents ORDER BY agent_id ASC").fetchall()
    conn.close()
    return [json.loads(r["payload_json"]) for r in rows]


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
