"""Run a real, no-scene-mutation native handoff demonstration.

The published workflow and project are runtime inputs. This runner never embeds
node or agent IDs, never fabricates a handoff, and never treats a skipped demo
gate as an approval. It exits with the actual run status when an agent asks for
input or fails to produce a verified handoff.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.agent_orchestrator_engine import execute_real_workflow_run, sync_native_workflow_run  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ATELIER native agent-to-agent routing demo")
    parser.add_argument("--workflow-id", required=True)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--timeout-sec", type=int, default=900)
    parser.add_argument("--poll-sec", type=float, default=5.0)
    return parser.parse_args()


def summary(run: dict) -> dict:
    return {
        "run_id": run.get("run_id"),
        "status": run.get("status"),
        "workflow_version": run.get("workflow_version"),
        "events": [
            {
                key: event.get(key)
                for key in (
                    "node_id", "agent_id", "status", "native_task_id",
                    "native_task_status", "artifact_ids", "demo_gate_status",
                    "output_summary", "error",
                )
            }
            for event in run.get("events", [])
        ],
    }


async def main() -> int:
    args = parse_args()
    run = await execute_real_workflow_run(
        args.workflow_id,
        project_id=args.project_id,
        user_text="ROUTING_DEMO: chuyển việc qua toàn bộ agent theo workflow publish; không sửa scene.",
        native_tasks=True,
        demo_mode=True,
    )
    print(json.dumps(summary(run), ensure_ascii=False, indent=2), flush=True)
    deadline = time.monotonic() + max(1, args.timeout_sec)
    while time.monotonic() < deadline:
        if run.get("status") in {"COMPLETED", "FAILED", "BLOCKED", "WAITING_FOR_INPUT", "WAITING_APPROVAL"}:
            break
        await asyncio.sleep(max(0.5, args.poll_sec))
        run = await sync_native_workflow_run(run["run_id"])
        print(json.dumps(summary(run), ensure_ascii=False, indent=2), flush=True)
        if run.get("status") in {"COMPLETED", "FAILED", "BLOCKED", "WAITING_FOR_INPUT", "WAITING_APPROVAL"}:
            break
    print(json.dumps({"final": summary(run)}, ensure_ascii=False, indent=2), flush=True)
    return 0 if run.get("status") == "COMPLETED" else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
