"""Browser evidence for G3 lighting presets, Smart Fit UI and panel resilience."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "build" / "EVIDENCE" / "G3_2026-11-10_010152+0700"
PROJECT_ID = "proj_g2_material_demo"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    console_errors = []
    screenshots = {name: EVIDENCE / f"viewer_{name}.png" for name in ["day", "sunset", "night", "smart_fit"]}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto("http://127.0.0.1:5173", wait_until="networkidle")
        page.get_by_label("Chọn dự án").select_option(PROJECT_ID)
        page.wait_for_timeout(1600)
        page.get_by_role("button", name="3D", exact=True).click()
        page.get_by_role("button", name="Orbit", exact=True).click()
        page.wait_for_timeout(1400)

        for preset in ["day", "sunset", "night"]:
            page.get_by_test_id(f"lighting-{preset}").click()
            page.wait_for_timeout(1200)
            page.screenshot(path=str(screenshots[preset]), full_page=False)

        editor = page.get_by_test_id("smart-fit-editor")
        editor.scroll_into_view_if_needed()
        page.get_by_test_id("smart-fit-assess").click()
        page.get_by_test_id("smart-fit-result").wait_for()
        page.get_by_test_id("smart-fit-options").click()
        page.get_by_test_id("placement-option-1").wait_for()
        fit_text = page.get_by_test_id("smart-fit-result").inner_text()
        option_texts = [page.get_by_test_id(f"placement-option-{index}").inner_text() for index in range(2)]
        revision_before = page.request.get(f"http://127.0.0.1:5173/api/v1/projects/{PROJECT_ID}").json()["revision"]
        with page.expect_response(lambda response: response.url.endswith("/placement-proposals")) as response_info:
            page.get_by_test_id("placement-option-0").click()
        proposal = response_info.value.json()
        revision_after = page.request.get(f"http://127.0.0.1:5173/api/v1/projects/{PROJECT_ID}").json()["revision"]
        page.screenshot(path=str(screenshots["smart_fit"]), full_page=False)

        canvas = page.locator("canvas").first
        initial_box = canvas.bounding_box()
        page.get_by_test_id("toggle-inspector").click()
        page.get_by_test_id("toggle-ai-panel").click()
        page.wait_for_timeout(1000)
        expanded_box = canvas.bounding_box()
        page.get_by_test_id("toggle-inspector").click()
        page.get_by_test_id("toggle-ai-panel").click()
        page.wait_for_timeout(1200)
        restored_box = canvas.bounding_box()
        dock_boxes = page.locator(".dock-column").evaluate_all(
            "els => els.map(el => ({className: el.className, width: el.getBoundingClientRect().width, position: getComputedStyle(el).position}))"
        )
        stage_box = page.locator(".viewport-stage-wrapper").bounding_box()
        panels_restored = page.locator("#inspector-dock").count() == 1 and len(dock_boxes) == 2
        browser.close()

    hashes = {name: sha(path) for name, path in screenshots.items()}
    report = {
        "status": "PASS",
        "lighting_hashes": hashes,
        "lighting_states_distinct": len({hashes["day"], hashes["sunset"], hashes["night"]}) == 3,
        "fit_text": fit_text,
        "placement_options": option_texts,
        "proposal_id": proposal.get("proposal", {}).get("proposal_id"),
        "proposal_not_persisted_before_approval": proposal.get("persisted") is False and revision_before == revision_after,
        "canvas_boxes": {"initial": initial_box, "panels_closed": expanded_box, "restored": restored_box},
        "restored_dock_boxes": dock_boxes,
        "restored_stage_box": stage_box,
        "panels_restored": panels_restored,
        "panel_resize_resilient": bool(initial_box and expanded_box and restored_box and expanded_box["width"] > initial_box["width"] and abs(restored_box["width"] - initial_box["width"]) < 8),
        "console_errors": console_errors,
    }
    checks = [
        report["lighting_states_distinct"],
        len(option_texts) == 2,
        report["proposal_not_persisted_before_approval"],
        report["panel_resize_resilient"],
        not console_errors,
    ]
    if not all(checks):
        report["status"] = "FAIL"
        report["checks"] = checks
    (EVIDENCE / "browser_g3_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
