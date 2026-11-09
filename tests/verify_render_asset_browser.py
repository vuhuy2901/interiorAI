"""Read-only browser verification for the G1 licensed GLB viewer path."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "build" / "EVIDENCE" / "G0_2026-11-10"


def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    glb_responses = []
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.on(
            "response",
            lambda response: glb_responses.append(
                {"url": response.url, "status": response.status, "content_type": response.headers.get("content-type")}
            )
            if "/api/v1/assets/" in response.url and response.url.endswith("/file")
            else None,
        )
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto("http://127.0.0.1:5173", wait_until="networkidle")
        page.wait_for_timeout(2500)
        canvas_count = page.locator("canvas").count()
        screenshot = EVIDENCE / "g1_real_sofa_viewer_1440x900.png"
        page.screenshot(path=str(screenshot), full_page=False)
        browser.close()

    report = {
        "canvas_count": canvas_count,
        "glb_responses": glb_responses,
        "console_errors": console_errors,
        "screenshot": str(screenshot.relative_to(ROOT)).replace("\\", "/"),
        "status": "PASS"
        if canvas_count > 0 and any(item["status"] == 200 for item in glb_responses) and not console_errors
        else "FAIL",
    }
    (EVIDENCE / "browser_verification.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
