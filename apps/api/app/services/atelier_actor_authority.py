"""Authenticate direct tool callers or a short-lived managed bridge request."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import re

import asyncio
import urllib.request
import urllib.error
from fastapi import Request
from fastapi.responses import JSONResponse

_scene_write_locks: dict[str, asyncio.Lock] = {}


async def serialize_scene_write(request: Request, call_next, *, agent: bool):
    match = re.match(r"^/api/v1/projects/([^/]+)/(scene|materials|surfaces|confirm-scale|furniture|house-plan)(/|$)", request.url.path)
    if not match or request.method in {"GET", "HEAD", "OPTIONS"}:
        return await call_next(request)
    scene_id = match.group(1)
    lock = _scene_write_locks.setdefault(scene_id, asyncio.Lock())
    async with lock:
        from app.db import get_project
        scene = get_project(scene_id)
        if not scene:
            return JSONResponse(status_code=404, content={"detail": "Canonical scene not found"})
        try:
            raw = await request.body()
            payload = json.loads(raw) if raw and "application/json" in request.headers.get("content-type", "") else {}
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid JSON"})
        revision = payload.get("base_revision", payload.get("expected_revision", payload.get("revision")))
        if agent and (not isinstance(revision, int) or isinstance(revision, bool)):
            return JSONResponse(status_code=422, content={"detail": "base_revision is required for specialist writes"})
        if revision is not None and revision != scene.revision:
            # Furniture's durable replay receipt owns old-revision idempotent retries.
            if match.group(2) != "furniture":
                return JSONResponse(status_code=409, content={"detail": "Canonical revision changed; re-read and recalculate", "current_revision": scene.revision})
        if agent and payload.get("bump_revision") is False:
            return JSONResponse(status_code=422, content={"detail": "Specialist scene mutations must advance the revision"})
        return await call_next(request)


def valid_bridge_signature(timestamp: str, signature: str, method: str, path: str, secret: str) -> bool:
    try:
        if not secret or abs(time.time() * 1000 - int(timestamp)) > 30_000:
            return False
    except (TypeError, ValueError):
        return False
    expected = hmac.new(secret.encode(), f"{timestamp}\n{method}\n{path}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def require_atelier_actor(request: Request, call_next):
    if os.getenv("ATELIER_REQUIRE_ACTOR_CONTEXT") != "1":
        return await call_next(request)
    path = request.url.path
    # Public reads remain cheap; cost endpoints are computations owned by Cost.
    cost = "/cost-workflow" in path or "/estimates" in path
    if request.method in {"GET", "HEAD", "OPTIONS"} and not cost:
        return await call_next(request)
    if not path.startswith("/api/v1/"):
        return await call_next(request)
    bearer = request.headers.get("authorization", "")
    if bearer.startswith("Bearer "):
        try:
            raw = await request.body()
            body = json.loads(raw) if raw and "application/json" in request.headers.get("content-type", "") else {}
            def authorize():
                check = urllib.request.Request(
                    os.getenv("PAPERCLIP_BASE_URL", "http://127.0.0.1:3100").rstrip("/") + "/api/atelier/authorize-operation",
                    data=json.dumps({"method": request.method, "path": path, "body": body}).encode(),
                    headers={"Authorization": bearer, "Content-Type": "application/json"}, method="POST",
                )
                try:
                    with urllib.request.urlopen(check, timeout=10) as response:
                        return response.status
                except urllib.error.HTTPError as error:
                    return error.code
            if await asyncio.to_thread(authorize) != 200:
                return JSONResponse(status_code=403, content={"detail": "Atelier operation is not authorized for this run"})
        except (urllib.error.URLError, TimeoutError, ValueError):
            return JSONResponse(status_code=503, content={"detail": "Cannot verify Atelier actor authority"})
        return await serialize_scene_write(request, call_next, agent=True)
    if valid_bridge_signature(request.headers.get("x-atelier-bridge-time", ""), request.headers.get("x-atelier-bridge-signature", ""), request.method, path, os.getenv("ATELIER_BRIDGE_SECRET", "")):
        return await serialize_scene_write(request, call_next, agent=False)
    return JSONResponse(status_code=401, content={"detail": "Authenticated Atelier actor context is required"})
