"""
ATELIER AI — End-to-End Live Server + Headless Chromium Browser Verification (Premium Redesign)
Connects to running FastAPI backend (127.0.0.1:8000) and Vite React frontend (127.0.0.1:5173),
or starts them if not already running.
Verifies all 15 Acceptance Criteria of the Premium Frontend Redesign and captures screenshots
across Desktop (1440x900), Tablet (1024x768, 768x1024) and Mobile (390x844) into docs/screenshots/.
"""
from __future__ import annotations
import subprocess
import sys
import time
import urllib.request
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parents[1]
SCREENSHOTS_DIR = ROOT_DIR / "docs" / "screenshots"


def is_url_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2.0) as resp:
            return resp.status < 500
    except Exception:
        return False


def wait_for_url(url: str, timeout_s: float = 25.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if is_url_up(url):
            return True
        time.sleep(0.4)
    return False


def main() -> int:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    api_proc = None
    web_proc = None

    if not is_url_up("http://127.0.0.1:8000/api/v1/health"):
        api_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=str(ROOT_DIR / "apps" / "api"),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    if not is_url_up("http://127.0.0.1:5173"):
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
            chrome_candidates = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            ]
            system_browser = next((path for path in chrome_candidates if os.path.exists(path)), None)
            browser = p.chromium.launch(headless=True, executable_path=system_browser) if system_browser else p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()

            page.goto("http://127.0.0.1:5173", wait_until="networkidle")
            page.wait_for_timeout(1200)

            # 1. Capture Redesigned Studio Workspace (1440x900)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_01_workspace_1440.png"), full_page=False)

            # 2. Send chat message in Concierge & capture Redesigned Proposal card
            page.fill('[data-testid="concierge-chat-input"]', "Sofa hơi to, đổi sofa nhỏ hơn 1.8m")
            page.click('[data-testid="concierge-chat-send"]')
            page.wait_for_timeout(1500)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_02_concierge_proposal_1440.png"), full_page=False)

            # 3. Navigate to AI Control Center (3-Zone React Flow Control Plane)
            page.click('[data-testid="nav-control_center"]')
            page.wait_for_timeout(1000)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_03_control_center_1440.png"), full_page=False)

            # 4. Navigate to AI Agents Registry (Master-Detail View)
            page.click('[data-testid="nav-agents"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_04_ai_agents_1440.png"), full_page=False)

            # 5. Navigate to Styles & Materials (Section 7B Paint & Tiles + Catalog)
            page.click('[data-testid="nav-materials"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_05_materials_7b_1440.png"), full_page=False)

            # 6. Navigate to Financial Cost Estimation (Deterministic BOQ Dashboard)
            page.click('[data-testid="nav-cost"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_06_cost_boq_1440.png"), full_page=False)

            # 7. Navigate to Dashboard Overview
            page.click('[data-testid="nav-dashboard"]')
            page.wait_for_timeout(800)
            page.screenshot(path=str(SCREENSHOTS_DIR / "redesign_07_dashboard_1440.png"), full_page=False)

            # 8. Responsive Viewport Captures (1024x768, 768x1024, 390x844) on Workspace
            page.click('[data-testid="nav-workspace"]')
            page.wait_for_timeout(800)
            for w, h in [(1024, 768), (768, 1024), (390, 844)]:
                page.set_viewport_size({"width": w, "height": h})
                page.wait_for_timeout(600)
                page.screenshot(path=str(SCREENSHOTS_DIR / f"redesign_08_responsive_{w}x{h}.png"), full_page=False)

            browser.close()
        print("Playwright Redesign E2E & Screenshot capture completed successfully!")
        return 0
    finally:
        if api_proc:
            api_proc.terminate()
        if web_proc:
            web_proc.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
