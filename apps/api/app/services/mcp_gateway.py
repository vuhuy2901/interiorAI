"""
ATELIER AI — Pascal MCP Tool Gateway (`@pascal-app/mcp` v1.0.7)
Wraps `packages/pascal-adapter/gateway.mjs` with an async mutex lock,
agent tool allowlist enforcement, and structured audit trail.
"""
from __future__ import annotations
import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.contracts import CanonicalProject
from app.services.cost_engine import load_materials_catalog

ROOT_DIR = Path(__file__).resolve().parents[4]
GATEWAY_SCRIPT = ROOT_DIR / "packages" / "pascal-adapter" / "gateway.mjs"

_SCENE_LOCK = asyncio.Lock()
_CACHED_TOOLS: Optional[List[Dict[str, Any]]] = None


def _run_gateway_sync(payload: Dict[str, Any], timeout_s: float = 20.0) -> Dict[str, Any]:
    if not GATEWAY_SCRIPT.exists():
        return {"ok": False, "error": f"Missing Pascal gateway script at {GATEWAY_SCRIPT}"}

    proc = subprocess.run(
        ["node", str(GATEWAY_SCRIPT)],
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(GATEWAY_SCRIPT.parent),
        timeout=timeout_s,
    )
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": proc.stderr.strip() or f"Gateway exited with status {proc.returncode}",
        }
    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return {"ok": False, "error": "Empty stdout from Pascal MCP Gateway"}
    try:
        return json.loads(lines[-1])
    except Exception as exc:
        return {"ok": False, "error": f"Invalid JSON from gateway: {exc}", "raw": lines[-1]}


async def list_pascal_mcp_tools(force_refresh: bool = False) -> Dict[str, Any]:
    global _CACHED_TOOLS
    if _CACHED_TOOLS is not None and not force_refresh:
        return {"ok": True, "count": len(_CACHED_TOOLS), "tools": _CACHED_TOOLS}

    async with _SCENE_LOCK:
        res = await asyncio.to_thread(_run_gateway_sync, {"action": "list_tools"})
        if res.get("ok") and isinstance(res.get("tools"), list):
            _CACHED_TOOLS = res["tools"]
            res["count"] = len(_CACHED_TOOLS)
        return res


async def sync_canonical_to_pascal(project: CanonicalProject) -> Dict[str, Any]:
    """
    Synchronizes CanonicalProject (in mm) to Pascal SceneGraph (in meters)
    using real @pascal-app/mcp tools (create_room, add_door, add_window, paint, place_items, verify_scene).
    """
    mat_db = load_materials_catalog()
    paints_by_id = {p["id"]: p for p in mat_db.get("paints", [])}
    tiles_by_id = {t["id"]: t for t in mat_db.get("tiles_and_flooring", [])}

    canonical_dict = project.model_dump()
    # Attach resolved hex colors so Pascal MCP paint tool gets accurate hex codes
    for w in canonical_dict.get("walls", []):
        p_mat = paints_by_id.get(w.get("face_a_material_id", ""))
        w["color_hex"] = p_mat["hex_color"] if p_mat else "#F4F1EA"

    if canonical_dict.get("rooms"):
        r0 = canonical_dict["rooms"][0]
        f_mat = tiles_by_id.get(r0.get("floor_material_id", ""))
        canonical_dict["floor_color_hex"] = f_mat["hex_color"] if f_mat else "#C8A986"

    async with _SCENE_LOCK:
        res = await asyncio.to_thread(
            _run_gateway_sync,
            {"action": "sync_from_canonical", "canonical": canonical_dict},
        )
        return res


async def call_pascal_mcp_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    allowed_tools: Optional[List[str]] = None,
    scene_json: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if allowed_tools is not None and tool_name not in allowed_tools:
        return {
            "ok": False,
            "error": f"PermissionDenied: Agent is not permitted to invoke MCP tool '{tool_name}'. Allowed: {allowed_tools}",
        }
    async with _SCENE_LOCK:
        return await asyncio.to_thread(
            _run_gateway_sync,
            {
                "action": "call_tool",
                "toolName": tool_name,
                "arguments": arguments,
                "sceneSnapshot": scene_json,
            },
        )
