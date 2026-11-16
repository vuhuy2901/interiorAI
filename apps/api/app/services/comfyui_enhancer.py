"""Optional ComfyUI boundary for geometry-controlled render enhancement.

No GPL ArchForge code or model weights are bundled here.  The adapter talks to
an operator-managed ComfyUI instance through its public HTTP queue API.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _base_url() -> str:
    return os.getenv("COMFYUI_URL", "").strip().rstrip("/")


def _workflow_path() -> Path | None:
    raw = os.getenv("COMFYUI_WORKFLOW_PATH", "").strip()
    return Path(raw).expanduser().resolve() if raw else None


def _request_json(path: str, *, method: str = "GET", body: Any = None, timeout: float = 5.0) -> Dict[str, Any]:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"{_base_url()}{path}", data=payload, method=method,
        headers={"Content-Type": "application/json"} if payload else {},
    )
    with urlopen(request, timeout=timeout) as response:  # noqa: S310 - operator-configured local service
        return json.loads(response.read().decode("utf-8"))


def probe_comfyui() -> Dict[str, Any]:
    url = _base_url()
    workflow = _workflow_path()
    if not url:
        return {"available": False, "status": "NOT_CONFIGURED", "message": "COMFYUI_URL chưa được cấu hình"}
    if not workflow or not workflow.is_file():
        return {
            "available": False, "status": "WORKFLOW_MISSING", "url": url,
            "message": "COMFYUI_WORKFLOW_PATH chưa trỏ tới workflow API JSON hợp lệ",
        }
    try:
        stats = _request_json("/system_stats")
        return {
            "available": True, "status": "AVAILABLE", "url": url,
            "workflow_path": str(workflow), "workflow_version": workflow.stat().st_mtime_ns,
            "system": stats.get("system", {}), "devices": stats.get("devices", []),
        }
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        return {"available": False, "status": "UNREACHABLE", "url": url, "message": str(exc)}


def _upload_image(path: Path, image_type: str) -> str:
    boundary = f"atelier-{uuid.uuid4().hex}"
    data = path.read_bytes()
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\n{image_type}\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\nContent-Type: image/png\r\n\r\n".encode(),
        data, f"\r\n--{boundary}--\r\n".encode(),
    ]
    request = Request(
        f"{_base_url()}/upload/image", data=b"".join(parts), method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310
        result = json.loads(response.read().decode("utf-8"))
    return str(result.get("name") or path.name)


def _replace_tokens(value: Any, tokens: Dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _replace_tokens(item, tokens) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_tokens(item, tokens) for item in value]
    if isinstance(value, str) and value in tokens:
        return tokens[value]
    return value


def enhance_render(
    *, color_path: Path, depth_path: Path, canny_path: Path, output_dir: Path,
    seed: int, denoise: float = 0.28, control_strength: float = 0.85,
    timeout_seconds: int = 300,
) -> Dict[str, Any]:
    capability = probe_comfyui()
    if not capability.get("available"):
        raise RuntimeError(capability.get("message") or "ComfyUI chưa sẵn sàng")
    for path in (color_path, depth_path, canny_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    uploaded = {
        "ATELIER_COLOR_IMAGE": _upload_image(color_path, "input"),
        "ATELIER_DEPTH_IMAGE": _upload_image(depth_path, "input"),
        "ATELIER_CANNY_IMAGE": _upload_image(canny_path, "input"),
        "ATELIER_SEED": int(seed),
        "ATELIER_DENOISE": max(0.0, min(0.55, float(denoise))),
        "ATELIER_CONTROL_STRENGTH": max(0.5, min(1.0, float(control_strength))),
    }
    workflow_path = _workflow_path()
    workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
    prompt = _replace_tokens(workflow, uploaded)
    queued = _request_json("/prompt", method="POST", body={"prompt": prompt, "client_id": f"atelier-{uuid.uuid4().hex}"}, timeout=30)
    prompt_id = str(queued["prompt_id"])

    deadline = time.monotonic() + timeout_seconds
    history: Dict[str, Any] = {}
    while time.monotonic() < deadline:
        history = _request_json(f"/history/{prompt_id}", timeout=15)
        if history.get(prompt_id):
            break
        time.sleep(1.5)
    else:
        raise TimeoutError(f"ComfyUI timeout for prompt {prompt_id}")

    outputs = history[prompt_id].get("outputs", {})
    images = [image for node in outputs.values() for image in node.get("images", [])]
    if not images:
        raise RuntimeError(f"ComfyUI prompt {prompt_id} không trả ảnh")
    image = images[0]
    query = urlencode({"filename": image["filename"], "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")})
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"enhanced_{prompt_id}.png"
    with urlopen(f"{_base_url()}/view?{query}", timeout=60) as response:  # noqa: S310
        destination.write_bytes(response.read())
    return {"prompt_id": prompt_id, "output_path": str(destination), "parameters": uploaded, "history": history[prompt_id]}
