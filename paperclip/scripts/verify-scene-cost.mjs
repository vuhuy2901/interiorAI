// Browser acceptance test. --edit-reference exercises an unchanged sourced price
// and resets the newly-created override in finally; use only on a fresh scope.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:5173';
const scene = 'proj_bedroom_japandi_4x4m';
const base = `${origin}/api/v1/projects/${scene}`;
const before = await (await fetch(`${base}/cost-workflow`)).json();
if (!before.estimate) throw new Error(JSON.stringify(before));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let edited = false;
try {
  await page.goto(`${origin}/ATL/cost-estimation`);
  await expect(page.getByTestId('scene-cost-panel')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('cost-line')).toHaveCount(34);
  await expect(page.getByTestId('scene-cost-panel')).not.toContainText('Giường Ngủ Japandi');
  await page.getByLabel('Chỉ mục chưa có giá').check();
  await expect(page.getByTestId('cost-line')).toHaveCount(before.estimate.unpriced_line_count);
  await page.getByLabel('Chỉ mục chưa có giá').uncheck();
  if (process.argv.includes('--edit-reference')) {
    if (!Array.isArray(before.overridden_item_ids) || before.overridden_item_ids.includes('construction:table-front')) {
      throw new Error('Refusing to overwrite an existing user price. Run without --edit-reference.');
    }
    const line = before.estimate.lines.find(line => line.id === 'construction:table-front');
    await page.getByRole('button', { name: `Chỉnh giá ${line.title}`, exact: true }).click();
    const form = page.getByRole('form', { name: 'Chỉnh đơn giá' });
    await expect(form).toBeVisible();
    // Simulate a service failure and ensure the draft remains recoverable.
    await page.route('**/cost-items/**', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Kiểm tra thử lại đơn giá' }) }) : route.continue());
    await form.getByRole('button', { name: 'Lưu đơn giá', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Kiểm tra thử lại');
    await expect(form.locator('[name=price]')).toHaveValue(String(line.unit_price_vnd));
    await page.unroute('**/cost-items/**');
    const saved = page.waitForResponse(response => response.url().includes('/cost-items/') && response.request().method() === 'PUT');
    edited = true;
    await form.getByRole('button', { name: 'Lưu đơn giá', exact: true }).click();
    if ((await saved).status() !== 200) throw new Error('Live price save failed');
    await expect(form).not.toBeVisible();
    await page.reload();
    await expect(page.getByTestId('cost-line')).toHaveCount(34);
    const reloaded = await (await fetch(`${base}/cost-workflow`)).json();
    if (reloaded.estimate.total_vnd !== before.estimate.total_vnd) throw new Error('Unchanged price changed total');
    await page.getByRole('button', { name: `Chỉnh giá ${line.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Bỏ giá đã nhập' }).click();
    await expect(page.getByRole('form', { name: 'Chỉnh đơn giá' })).not.toBeVisible();
    edited = false;
  }
  await expect(page.getByRole('button', { name: 'Tính lại dự toán' })).toBeEnabled();
  await page.getByTestId('scene-cost-panel').evaluate(element => element.scrollIntoView({ block: 'start' }));
  fs.mkdirSync('../docs/qa/scene-cost', { recursive: true });
  await page.screenshot({ path: '../docs/qa/scene-cost/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('scene-cost-panel').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await expect(page.getByRole('button', { name: 'Tính lại dự toán' })).toBeVisible();
  await page.screenshot({ path: '../docs/qa/scene-cost/mobile.png', fullPage: true });
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  if (width[0] > width[1] + 2) throw new Error(`Page overflows on mobile: ${width}`);
  if (errors.length) throw new Error(errors.join('\n'));
  const csv = await fetch(`${origin}/api/v1/exports/${scene}/csv`);
  if (!csv.ok || !(await csv.text()).includes('Hệ tủ bếp')) throw new Error('Live CSV export missing GLB inventory');
  const xlsx = await fetch(`${origin}/api/v1/exports/${scene}/xlsx`);
  if (!xlsx.ok || new Uint8Array(await xlsx.arrayBuffer())[0] !== 80) throw new Error('Live XLSX export failed');
  console.log(JSON.stringify({ ok: true, lines: 34, priced: before.estimate.priced_line_count, total_vnd: before.estimate.total_vnd, desktop: true, mobile: true, edit_reload_reset: process.argv.includes('--edit-reference'), live_exports: true, browser_errors: errors }));
} finally {
  if (edited) {
    const response = await fetch(`${base}/cost-items/construction%3Atable-front?asset_hash=${before.asset_hash}`, { method: 'DELETE' });
    if (!response.ok) console.error('IMPORTANT: price override cleanup failed', response.status);
  }
  await browser.close();
}
