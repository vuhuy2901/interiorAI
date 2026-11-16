from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.services.comfyui_enhancer import _replace_tokens, probe_comfyui  # noqa: E402


def test_unconfigured_comfyui_is_reported_not_faked(monkeypatch):
    monkeypatch.delenv("COMFYUI_URL", raising=False)
    monkeypatch.delenv("COMFYUI_WORKFLOW_PATH", raising=False)
    result = probe_comfyui()
    assert result["available"] is False
    assert result["status"] == "NOT_CONFIGURED"


def test_workflow_tokens_are_replaced_without_mutating_other_strings():
    workflow = {"1": {"inputs": {"image": "ATELIER_COLOR_IMAGE", "seed": "ATELIER_SEED", "prompt": "keep ATELIER_COLOR_IMAGE literal"}}}
    result = _replace_tokens(workflow, {"ATELIER_COLOR_IMAGE": "scene.png", "ATELIER_SEED": 42})
    assert result["1"]["inputs"]["image"] == "scene.png"
    assert result["1"]["inputs"]["seed"] == 42
    assert result["1"]["inputs"]["prompt"] == "keep ATELIER_COLOR_IMAGE literal"
