"""Browser evidence for in-place G2 material preview, disposal and persistence."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "build" / "EVIDENCE" / "G2_2026-11-10_004858+0700"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    before_path = EVIDENCE / "sofa_before.png"
    after_path = EVIDENCE / "sofa_after_moss.png"
    restored_path = EVIDENCE / "sofa_restored_after_reload.png"
    console_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto("http://127.0.0.1:5173", wait_until="networkidle")
        page.wait_for_timeout(1800)
        editor = page.get_by_test_id("pbr-material-editor")
        editor.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        baseline = page.evaluate("JSON.parse(JSON.stringify(window.__ATELIER_MATERIAL_METRICS__))")
        page.screenshot(path=str(before_path), full_page=False)

        page.get_by_test_id("pbr-material-select").select_option("mat_fabric_moss")
        colors = ["#556b4e", "#71826a", "#556b4e"]
        for color in colors:
            page.get_by_test_id("material-color-picker").fill(color)
            page.get_by_test_id("material-preview").click()
            page.wait_for_timeout(180)
        after_three = page.evaluate("JSON.parse(JSON.stringify(window.__ATELIER_MATERIAL_METRICS__))")
        page.screenshot(path=str(after_path), full_page=False)

        with page.expect_response(lambda response: response.url.endswith("/material-proposals")) as proposal_response:
            page.get_by_test_id("material-propose").click()
        proposal_payload = proposal_response.value.json()
        proposal_id = proposal_payload["proposal"]["proposal_id"]
        approval = page.request.post(
            f"http://127.0.0.1:5173/api/v1/proposals/{proposal_id}/approve", data={}
        ).json()

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1800)
        page.get_by_test_id("pbr-material-editor").scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        page.screenshot(path=str(restored_path), full_page=False)
        project = page.request.get("http://127.0.0.1:5173/api/v1/projects/proj_demo_4x5m").json()
        sofa = next(item for item in project["furniture_instances"] if item["id"] == "furn_sofa_main")
        slot_id = sofa["material_slots"][0]["slot_id"]
        persisted_override = sofa["material_overrides"].get(slot_id)
        browser.close()

    mesh_identity_stable = baseline["meshUUIDs"]["furn_sofa_main"] == after_three["meshUUIDs"]["furn_sofa_main"]
    no_asset_reload = baseline["glbLoadCount"] == after_three["glbLoadCount"]
    report = {
        "status": "PASS",
        "preview_count": 3,
        "metrics_before": baseline,
        "metrics_after_three_previews": after_three,
        "mesh_identity_stable": mesh_identity_stable,
        "no_asset_reload_during_previews": no_asset_reload,
        "owned_materials_disposed_during_replacement": after_three.get("disposedMaterialCount", 0),
        "proposal_id": proposal_id,
        "approval_ok": approval.get("ok"),
        "persisted_override": persisted_override,
        "screenshot_hashes": {
            "before": file_hash(before_path),
            "after": file_hash(after_path),
            "restored": file_hash(restored_path),
        },
        "console_errors": console_errors,
    }
    checks = [
        after_three.get("materialApplyCount", 0) - baseline.get("materialApplyCount", 0) == 3,
        after_three.get("disposedMaterialCount", 0) - baseline.get("disposedMaterialCount", 0) >= 2,
        mesh_identity_stable,
        no_asset_reload,
        approval.get("ok") is True,
        persisted_override and persisted_override.get("tint", "").lower() == "#556b4e",
        report["screenshot_hashes"]["before"] != report["screenshot_hashes"]["after"],
        not console_errors,
    ]
    if not all(checks):
        report["status"] = "FAIL"
        report["checks"] = checks
    (EVIDENCE / "browser_material_metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
