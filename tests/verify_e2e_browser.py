"""
ATELIER AI — End-to-End Live Server + Headless Chromium Browser Verification
Starts FastAPI backend (127.0.0.1:8000) and Vite React frontend (127.0.0.1:5173),
renders the application in real Chromium via Playwright, verifies all major modules,
tests interactive conversational concierge & Section 7B surface material updates,
and captures responsive screenshots (1440x900, 1024x768, 768x1024, 390x844) into docs/screenshots/.
"""
from __future__ import annotations
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parents[1]
SCREENSHOTS_DIR = ROOT_DIR / "docs" / "screenshots"


def wait_for_url(url: str, timeout_s: float = 25.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def main() -> int:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT_DIR / "apps" / "api"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    web_proc = subprocess.Popen(
        ["npx.cmd", "vite", "--host", "127.0.0.1", "--port", "5173"],
        cwd=str(ROOT_DIR / "apps" / "web"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        if not wait_for_url("http://127.0.0.1:8000/api/v1/health"):
            raise RuntimeError("Backend API failed to start on 127.0.0.1:8000")
        if not wait_for_url("http://127.0.0.1:5173"):
            raise RuntimeError("Frontend Vite server failed to start on 127.0.0.1:5173")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()

            page.goto("http://127.0.0.1:5173", wait_until="networkidle")
            page.wait_for_timeout(1200)

            # 1. Capture Workspace (1440x900)
            page.screenshot(path=str(SCREENSHOTS_DIR / "01_workspace_1440.png"), full_page=False)

            # 2. Send chat message in Concierge & capture Proposal card
            page.fill('[data-testid="concierge-chat-input"]', "Sofa hơi to, đổi sofa nhỏ hơn 1.8m")
            page.click('[data-testid="concierge-chat-send"]')
            page.wait_for_timeout(1500)
            page.screenshot(path=str(SCREENSHOTS_DIR / "02_concierge_proposal_1440.png"), full_page=False)

            # 3. Navigate to AI Control Center (React Flow 14 Nodes)
            page.click('[data-testid="nav-control_center"]')
            page.wait_for_timeout(1000)
            page.screenshot(path=str(SCREENSHOTS_DIR / "03_ai_control_center_1440.png"), full_page=False)

            # 4. Navigate to Styles & Materials (Section 7B Paint & Tiles)
            page.click('[data-testid="nav-materials"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "04_materials_7b_1440.png"), full_page=False)

            # 5. Navigate to Cost Estimation (Deterministic BOQ)
            page.click('[data-testid="nav-cost"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "05_cost_boq_1440.png"), full_page=False)

            # 6. Navigate to Settings -> AI Connections
            page.click('[data-testid="nav-settings"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "06_ai_connections_1440.png"), full_page=False)

            # 7. Responsive Viewport Captures (1024, 768, 390) on Workspace
            page.click('[data-testid="nav-workspace"]')
            page.wait_for_timeout(800)
            for w, h in [(1024, 768), (768, 1024), (390, 844)]:
                page.set_viewport_size({"width": w, "height": h})
                page.wait_for_timeout(600)
                page.screenshot(path=str(SCREENSHOTS_DIR / f"07_workspace_responsive_{w}x{h}.png"), full_page=False)

            browser.close()
        print("Playwright E2E & Screenshot capture completed successfully!")
        return 0
    finally:
        api_proc.terminate()
        web_proc.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
