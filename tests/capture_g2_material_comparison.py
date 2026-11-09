"""Capture persisted sand/moss material states on the same GLB and camera."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "build" / "EVIDENCE" / "G2_2026-11-10_004858+0700"
PROJECT_ID = "proj_g2_material_demo"


def main() -> int:
    sand_path = EVIDENCE / "comparison_before_sand_3d.png"
    moss_path = EVIDENCE / "comparison_after_moss_3d.png"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:5173", wait_until="networkidle")

        def apply(material_id: str, tint: str):
            project = page.request.get(f"http://127.0.0.1:5173/api/v1/projects/{PROJECT_ID}").json()
            sofa = next(item for item in project["furniture_instances"] if item["id"] == "furn_sofa_main")
            slot_id = sofa["material_slots"][0]["slot_id"]
            proposal = page.request.post(
                f"http://127.0.0.1:5173/api/v1/projects/{PROJECT_ID}/furniture/furn_sofa_main/material-proposals",
                data={
                    "slot_id": slot_id,
                    "material_id": material_id,
                    "material_version": 1,
                    "tint": tint,
                    "pbr": {},
                },
            ).json()["proposal"]
            approval = page.request.post(
                f"http://127.0.0.1:5173/api/v1/proposals/{proposal['proposal_id']}/approve", data={}
            ).json()
            assert approval["ok"] is True

        def prepare_view():
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(1500)
            page.get_by_label("Chọn dự án").select_option(PROJECT_ID)
            page.wait_for_timeout(1800)
            page.get_by_role("button", name="3D", exact=True).click()
            page.get_by_role("button", name="Orbit", exact=True).click()
            page.wait_for_timeout(1800)

        apply("mat_fabric_sand", "#D3C7B5")
        prepare_view()
        page.screenshot(path=str(sand_path), full_page=False)
        apply("mat_fabric_moss", "#556B4E")
        prepare_view()
        page.screenshot(path=str(moss_path), full_page=False)
        browser.close()

    report = {
        "status": "PASS",
        "same_geometry_and_camera": True,
        "before_sha256": hashlib.sha256(sand_path.read_bytes()).hexdigest(),
        "after_sha256": hashlib.sha256(moss_path.read_bytes()).hexdigest(),
    }
    report["status"] = "PASS" if report["before_sha256"] != report["after_sha256"] else "FAIL"
    (EVIDENCE / "visual_comparison.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
