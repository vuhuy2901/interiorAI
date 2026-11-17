from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import app.db as db  # noqa: E402
import app.main as main  # noqa: E402


def test_catalog_replacement_rejects_missing_asset_instead_of_default_sofa(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "runtime.db")
    db.init_db()
    monkeypatch.setattr(main, "load_products_catalog", lambda: [{
        "sku": "NO-ASSET", "name": "No asset", "category": "chair",
        "width_mm": 500, "depth_mm": 500, "height_mm": 800, "price_vnd": 1,
    }])
    with pytest.raises(HTTPException) as raised:
        asyncio.run(main.api_catalog_replace_in_scene(main.FitCheckPayload(sku="NO-ASSET")))
    assert raised.value.status_code == 422
    assert "asset sofa" in str(raised.value.detail)
