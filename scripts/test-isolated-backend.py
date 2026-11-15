r"""Run backend checks without modifying live scenes, exports or credentials.

Usage: .venv\Scripts\python.exe scripts/test-isolated-backend.py [pytest arguments]
The real Pascal subprocess remains enabled; the live Paperclip control plane is
not a test destination. Tests needing native agents must supply their own fixture.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

import app.db as db
import app.main as main
from app.services import agent_orchestrator_engine, cad_export, paperclip_task_adapter
import pytest


def run() -> int:
    with tempfile.TemporaryDirectory(prefix="atelier-backend-tests-") as folder:
        temp = Path(folder)
        db.DATA_DIR = temp
        db.DB_PATH = temp / "atelier.db"
        main.UPLOADS_DIR = temp / "uploads"
        cad_export.EXPORTS_DIR = temp / "exports"
        agent_orchestrator_engine.DATA_DIR = temp
        paperclip_task_adapter.PAPERCLIP_BASE_URL = "http://127.0.0.1:1"
        db.init_db()
        return pytest.main(sys.argv[1:] or [
            str(ROOT / "tests" / "test_acceptance.py"),
            str(ROOT / "tests" / "test_workflow_runtime_contract.py"),
            str(ROOT / "tests" / "test_concurrent_dag_scheduler.py"),
            str(ROOT / "tests" / "test_japandi_bedroom_project.py"), "-q",
        ])


if __name__ == "__main__":
    raise SystemExit(run())
