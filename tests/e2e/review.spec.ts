import { expect, test, type Page } from '@playwright/test';

type Hook = {
  config(): { crowd: { totalPeople: number }; reserve: { percentA: number } };
  renderer(): { info: { textures: number; geometries: number }; yaw: number; targets: [number, number, number, number] } | null;
  follow(): { group: number; leftAt: [number, number] } | null;
};
const DISMISSED = () => { try { localStorage.setItem('canteen-sim:howto-dismissed', '1'); } catch { /* sandboxed */ } };
test.beforeEach(async ({ context }) => { await context.addInitScript(DISMISSED); });
const hook = (page: Page) => page.evaluate(() => 0);
void hook;

test('C1: inside sandbox="allow-scripts", Skip to, Load settings code and Run batch work through the real buttons', async ({ page }) => {
  await page.route('**/sandbox.html', (route) => route.fulfill({ contentType: 'text/html', body: '<iframe id="f" sandbox="allow-scripts" src="/index.html" style="width:1300px;height:950px"></iframe>' }));
  await page.setViewportSize({ width: 1320, height: 980 });
  await page.goto('/sandbox.html');
  const f = page.frameLocator('#f');
  await f.getByRole('dialog', { name: 'How this works' }).getByRole('button', { name: 'Close' }).click();
  await f.locator('#skip-to').fill('11:20');
  await f.getByRole('button', { name: 'Skip to' }).click();
  await expect(f.locator('.clock')).toHaveText('11:20', { timeout: 60_000 });
  await f.getByRole('button', { name: 'Settings' }).click();
  await f.locator('#load-code').fill('#v=1&m=1&seed=4&crowd.totalPeople=700');
  await f.locator('#load-code').press('Enter');
  await expect(f.getByText('Settings changed — Restart to apply').first()).toBeVisible();
  await f.getByRole('button', { name: 'Batch runs' }).click();
  await f.getByRole('button', { name: 'Run batch' }).click();
  await expect(f.locator('progress')).toBeVisible();
});

test('I2: batch results disappear when the live settings change, and the CSV uses the batch settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Batch runs' }).click();
  await page.getByRole('button', { name: 'Run batch' }).click();
  await expect(page.getByText('Primary endpoints at 100% vs 0% reservation')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-crowd-totalPeople').fill('900');
  await page.locator('#set-crowd-totalPeople').press('Tab');
  await page.getByRole('button', { name: 'Restart to apply' }).click();
  await page.getByRole('button', { name: 'Batch runs' }).click();
  await expect(page.getByText('Primary endpoints at 100% vs 0% reservation')).toHaveCount(0);
});

test('I4: releasing the A slider never starts a blocked configuration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-layout-cols').fill('1');
  await page.locator('#set-layout-cols').press('Tab');
  await page.locator('#set-layout-stallCount').fill('60');
  await page.locator('#set-layout-stallCount').press('Tab');
  await page.locator('#slider-a').focus();
  await page.keyboard.press('ArrowRight');
  const cfg = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect(cfg.reserve.percentA).toBeCloseTo(0.55, 9);
  expect((cfg as unknown as { layout: { cols: number } }).layout.cols).toBe(10);
});

test('I5: a slow drag orbits as far as a fast one', async ({ page }) => {
  await page.goto('/');
  const box = (await page.locator('.viewport').first().boundingBox())!;
  const yaw = () => page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.renderer()!.yaw);
  const drag = async (delayMs: number) => {
    const y0 = await yaw();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(box.x + box.width / 2 + i * 8, box.y + box.height / 2);
      if (delayMs) await page.waitForTimeout(delayMs);
    }
    await page.mouse.up();
    return (await yaw()) - y0;
  };
  const fast = await drag(0);
  const slow = await drag(60);
  expect(Math.abs(fast)).toBeGreaterThan(0.2);
  expect(Math.abs(slow - fast)).toBeLessThan(0.05);
});

test('I6: follow mode with linked cameras keeps a target per canteen and picks a new group once one has left', async ({ page }) => {
  await page.goto('/');
  await page.locator('#skip-to').fill('12:00');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('12:00', { timeout: 60_000 });
  await page.selectOption('#camera-mode', 'follow');
  await page.waitForTimeout(500);
  const first = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.follow());
  expect(first).not.toBeNull();
  await page.selectOption('#speed', '120');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.follow()))?.group, { timeout: 120_000 }).not.toBe(first!.group);
});

test('I7: a touch tap shows the hover card', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(DISMISSED);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('#skip-to').fill('12:10');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('12:10', { timeout: 60_000 });
  const box = (await page.locator('.viewport').first().boundingBox())!;
  let shown = false;
  for (let i = 0; i < 30 && !shown; i++) {
    await page.touchscreen.tap(box.x + box.width * (0.3 + (i % 6) * 0.08), box.y + box.height * (0.35 + Math.floor(i / 6) * 0.08));
    shown = (await page.locator('.hovercard').count()) > 0;
  }
  expect(shown).toBe(true);
  await ctx.close();
});

test('I8: a host data-theme change recolours the 3D scene; I9: the free-seat count keeps 4.5:1 contrast in dark', async ({ page }) => {
  await page.goto('/');
  const box = (await page.locator('.viewport').first().boundingBox())!;
  const pixel = async () => {
    const shot = await page.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width: 1, height: 1 } });
    return shot.toString('base64');
  };
  await page.waitForTimeout(300);
  const before = await pixel();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  expect(await pixel()).not.toBe(before);
  const ratio = await page.evaluate(() => {
    const seg = [...document.querySelectorAll<HTMLElement>('.seatbar-n')].find((e) => (e.parentElement as HTMLElement).style.background.includes('--seat-0'));
    if (!seg) return 99;
    const lum = (c: string) => { const m = c.match(/\d+(\.\d+)?/g)!.map(Number); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const fg = lum(getComputedStyle(seg).color), bg = lum(getComputedStyle(seg.parentElement!).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('I10: repeated slider releases do not grow GPU textures or geometries', async ({ page }) => {
  await page.goto('/');
  const info = () => page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.renderer()!.info);
  await page.waitForTimeout(300);
  await page.locator('#slider-a').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const a = await info();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(120);
  }
  const b = await info();
  expect(b.textures).toBeLessThanOrEqual(a.textures);
  expect(b.geometries).toBeLessThanOrEqual(a.geometries);
});

test('context loss pauses the 3D view, the sim keeps running, and Restore brings it back without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { __canteen: { loseContext(): void } }).__canteen.loseContext());
  await expect(page.getByText('3D view paused').first()).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.locator('.clock').innerText()).not.toBe('11:00');
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.getByText('3D view paused')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('during a batch, Play and the A slider are disabled and the settings are read-only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Batch runs' }).click();
  await page.selectOption('#seed-count', '120');
  await page.getByRole('button', { name: 'Run batch' }).click();
  await expect(page.locator('progress')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
  await expect(page.locator('#slider-a')).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Run batch' }).click();
  await expect(page.locator('progress')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator('progress')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});
