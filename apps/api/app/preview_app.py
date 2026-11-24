"""FEAT-2026-165 — limited LAN preview server (separate from the admin API).

Mounts only token-gated routes plus a whitelist of static viewer files. It must
never import or include the main FastAPI app or its routers.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from app.services.lan_preview import ASSET_NAME_RE, SERVICE_NAME, package_path, verify_token

VIEWER_DIR = (Path(__file__).resolve().parents[1] / "preview_viewer").resolve()
STATIC_EXT = {".js": "text/javascript", ".css": "text/css", ".html": "text/html"}

app = FastAPI(title="Atelier LAN Preview", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


def _gone() -> JSONResponse:
    return JSONResponse({"error": "preview_unavailable",
                         "message": "Link không hợp lệ, đã bị thu hồi hoặc hết hạn."}, status_code=404)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/__health")
def health():
    return {"service": SERVICE_NAME, "bind": "0.0.0.0"}


@app.get("/preview/{token}")
def viewer_page(token: str):
    if not verify_token(token):
        return HTMLResponse(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            "<body style='font-family:sans-serif;padding:32px;background:#F5F2EB;color:#333'>"
            "<h2>Link không khả dụng</h2><p>Link xem 3D không hợp lệ, đã bị thu hồi hoặc hết hạn. "
            "Hãy xin link mới từ người gửi.</p></body>", status_code=404)
    return FileResponse(VIEWER_DIR / "index.html", media_type="text/html")


@app.get("/viewer/{path:path}")
def viewer_static(path: str):
    target = (VIEWER_DIR / path).resolve()
    if VIEWER_DIR not in target.parents or target.suffix not in STATIC_EXT or not target.is_file():
        return JSONResponse({"error": "not_found"}, status_code=404)
    return FileResponse(target, media_type=STATIC_EXT[target.suffix])


@app.get("/p/{token}/manifest.json")
def manifest(token: str):
    row = verify_token(token)
    if not row:
        return _gone()
    path = package_path(row) / "manifest.json"
    if not path.is_file():
        return JSONResponse({"error": "package_corrupted", "message": "Package preview bị hỏng; hãy publish lại."}, status_code=410)
    return FileResponse(path, media_type="application/json")


@app.get("/p/{token}/assets/{name}")
def asset(token: str, name: str):
    row = verify_token(token)
    if not row:
        return _gone()
    if not ASSET_NAME_RE.match(name):
        return JSONResponse({"error": "not_found"}, status_code=404)
    root = package_path(row)
    path = (root / "assets" / name).resolve()
    if root not in path.parents or not path.is_file():
        return JSONResponse({"error": "not_found"}, status_code=404)
    return FileResponse(path, media_type="model/gltf-binary")
