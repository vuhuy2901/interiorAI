import asyncio
import os
from playwright.async_api import async_playwright

async def run_verification():
    os.makedirs("scratch", exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        console_logs = []
        page_errors = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: page_errors.append(f"[PAGEERROR] {exc}"))

        print("1. Navigating to http://localhost:3100/bedroom-studio...")
        response = await page.goto("http://localhost:3100/bedroom-studio", wait_until="networkidle", timeout=30000)
        assert response is not None, "Failed to get response"
        print(f"Response status: {response.status}")

        await page.wait_for_timeout(2500)
        title = await page.title()
        print(f"Page title: {title}")

        # Verify key elements
        body_text = await page.inner_text("body")
        assert "Thiết Kế Phòng Ngủ" in body_text, "Title not found in body text"
        assert "4.190" in body_text, "Bedroom width not found"
        assert "4.040" in body_text, "Bedroom depth not found"
        assert "Decision Ledger" in body_text or "Sổ Quyết Định" in body_text, "Decision ledger title not found"
        assert "Tất cả kích thước trên cần được xác nhận" in body_text, "Engineering warning banner not found"
        print("All key textual and engineering assertions passed!")

        # Take initial desktop screenshot
        await page.screenshot(path="scratch/bedroom_studio_desktop.png", full_page=False)
        print("Desktop screenshot saved to scratch/bedroom_studio_desktop.png")

        # Test Interaction: Click Confirm button on a proposed item
        confirm_buttons = page.locator("button:has-text('Xác nhận')")
        count = await confirm_buttons.count()
        print(f"Found {count} 'Xác nhận' buttons")
        if count > 0:
            await confirm_buttons.first.click()
            await page.wait_for_timeout(1000)
            print("Clicked first 'Xác nhận' button successfully!")

        # Take interactive state screenshot
        await page.screenshot(path="scratch/bedroom_studio_interactive.png", full_page=False)
        print("Interactive screenshot saved to scratch/bedroom_studio_interactive.png")

        # Test Mobile Viewport (390 x 844)
        print("2. Testing mobile responsive layout (390 x 844)...")
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(1500)
        await page.screenshot(path="scratch/bedroom_studio_mobile.png", full_page=False)
        print("Mobile screenshot saved to scratch/bedroom_studio_mobile.png")

        # Test Main Design Studio font verification
        print("3. Navigating to http://localhost:3100/design-studio to verify font rendering...")
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto("http://localhost:3100/design-studio", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await page.screenshot(path="scratch/design_studio_verified.png", full_page=False)
        print("Design studio screenshot saved to scratch/design_studio_verified.png")

        print("Console errors count:", len(page_errors))
        if page_errors:
            for err in page_errors:
                print("Page error:", err)

        await browser.close()
        print("Verification complete!")

if __name__ == "__main__":
    asyncio.run(run_verification())
