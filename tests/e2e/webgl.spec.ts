import { chromium, expect, test } from '@playwright/test';

test('without WebGL the viewports explain it, numbers keep running, and nothing is logged as an error', async () => {
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4173/');
  await expect(page.getByText('The 3D view needs WebGL').first()).toBeVisible();
  const close = page.getByRole('dialog').getByRole('button', { name: 'Close' });
  if (await close.count()) await close.click();
  await page.fill('#skip-to', '11:30');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('11:30', { timeout: 60_000 });
  expect(errors).toEqual([]);
  await browser.close();
});
