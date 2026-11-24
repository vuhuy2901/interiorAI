import hashlib
import hmac
import time
import asyncio
import json
import sys
import types

from starlette.requests import Request
from starlette.responses import JSONResponse

from app.services.atelier_actor_authority import valid_bridge_signature, require_atelier_actor, serialize_scene_write


def test_signed_context_is_short_lived_and_bound_to_operation():
    timestamp = str(int(time.time() * 1000))
    secret = "test-secret"
    path = "/api/v1/projects/scene/furniture"
    signature = hmac.new(secret.encode(), f"{timestamp}\nPOST\n{path}".encode(), hashlib.sha256).hexdigest()
    assert valid_bridge_signature(timestamp, signature, "POST", path, secret)
    assert not valid_bridge_signature(timestamp, signature, "PATCH", path, secret)
    assert not valid_bridge_signature(timestamp, signature, "POST", path + "/other", secret)
    assert not valid_bridge_signature(timestamp, signature, "POST", path, "other")
    assert not valid_bridge_signature("0", signature, "POST", path, secret)
    assert not valid_bridge_signature(timestamp, signature, "POST", path, "")


def make_request(body, path="/api/v1/projects/scene/materials", headers=()):
    raw = json.dumps(body).encode()
    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}
    return Request({"type": "http", "http_version": "1.1", "method": "POST", "scheme": "http", "path": path,
                    "raw_path": path.encode(), "query_string": b"", "headers": [(b"content-type", b"application/json"), *headers]}, receive)


def test_direct_unsigned_mutation_cannot_impersonate_an_agent(monkeypatch):
    monkeypatch.setenv("ATELIER_REQUIRE_ACTOR_CONTEXT", "1")
    called = []
    async def next_call(request):
        called.append(True)
        return JSONResponse({"ok": True})
    response = asyncio.run(require_atelier_actor(make_request({"agent_id": "agent_geometry"}), next_call))
    assert response.status_code == 401
    assert not called


def test_parallel_material_writes_reject_stale_revision_instead_of_overwriting(monkeypatch):
    state = types.SimpleNamespace(revision=1)
    monkeypatch.setitem(sys.modules, "app.db", types.SimpleNamespace(get_project=lambda _: state))
    async def run():
        written = []
        async def write(request):
            await asyncio.sleep(0)
            written.append(json.loads(await request.body())["finish"])
            state.revision += 1
            return JSONResponse({"revision": state.revision})
        results = await asyncio.gather(
            serialize_scene_write(make_request({"base_revision": 1, "finish": "oak"}), write, agent=True),
            serialize_scene_write(make_request({"base_revision": 1, "finish": "white"}), write, agent=True),
        )
        assert sorted(result.status_code for result in results) == [200, 409]
        assert written == ["oak"]
    asyncio.run(run())
