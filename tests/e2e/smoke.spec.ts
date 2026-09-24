import { expect, test, type Page } from '@playwright/test';

type Hook = { config(): { crowd: { totalPeople: number }; seed: number }; batch(n: number, mode?: 'auto' | 'fallback'): Promise<{ hashes: [string, number][]; usedFallback: boolean; csvFirstRow: string }> };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** A fresh context always shows the first-visit panel after mount; wait for it, then close it. */
async function dismissHowTo(page: Page) {
  const close = page.getByRole('dialog', { name: 'How this works' }).getByRole('button', { name: 'Close' });
  await close.click({ timeout: 15_000 });
}

test('the How this works panel shows on the first visit only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'How this works' })).toBeVisible();
  await dismissHowTo(page);
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: 'How this works' })).toHaveCount(0);
});

test('loads without console errors; skip to 12:30 then play 120 frames at 120×', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await dismissHowTo(page);
  await expect(page.getByRole('heading', { name: 'Canteen Sim' })).toBeVisible();
  await page.fill('#skip-to', '12:30');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('12:30', { timeout: 60_000 });
  await page.selectOption('#speed', '120');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.evaluate(() => new Promise<void>((resolve) => { let n = 0; const f = () => (++n >= 120 ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  await page.getByRole('button', { name: 'Pause' }).click();
  expect(await page.locator('.clock').textContent()).not.toBe('12:30');
  expect(errors).toEqual([]);
});

test('a 2-seed batch completes', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(r.hashes).toHaveLength(10);
});

test('settings round-trip through the URL and through the settings code', async ({ page, context }) => {
  await page.goto('/#v=1&m=1&seed=7&crowd.totalPeople=900');
  await dismissHowTo(page);
  const cfg = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect(cfg.crowd.totalPeople).toBe(900);
  expect(cfg.seed).toBe(7);
  const p2 = await context.newPage();
  await p2.goto('/'); // same context: the first-visit panel was already dismissed
  await p2.getByRole('button', { name: 'Settings' }).click();
  await p2.fill('#load-code', 'http://x.test/#v=1&m=1&seed=9&crowd.totalPeople=1200');
  await p2.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(p2.getByText('Settings changed — Restart to apply')).toBeVisible();
  await p2.getByRole('button', { name: 'Restart to apply' }).click();
  const c2 = await p2.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect([c2.crowd.totalPeople, c2.seed]).toEqual([1200, 9]);
  await p2.fill('#load-code', 'not a code');
  await p2.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(p2.getByRole('alert').filter({ hasText: 'isn’t valid' })).toBeVisible();
});

test('narrow layout (375 px): no horizontal scroll, A stacked above B', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await page.goto('/');
  await dismissHowTo(page);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBe(0);
  const [a, b] = await page.locator('.viewport').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(a).toBeLessThan(b);
  await expect(page.locator('.live-merged')).toBeVisible();
});

test('locales th-TH and de-DE render the clock, counters and first CSV row byte-identically to en-GB', async ({ browser }) => {
  const read = async (locale: string) => {
    const ctx = await browser.newContext({ locale });
    const page = await ctx.newPage();
    await page.goto('/');
    await dismissHowTo(page);
    await page.fill('#skip-to', '12:10');
    await page.getByRole('button', { name: 'Skip to' }).click();
    await expect(page.locator('.clock')).toHaveText('12:10', { timeout: 60_000 });
    const text = await page.locator('.live').innerText();
    const clock = await page.locator('.clock').innerText();
    const csv = (await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2))).csvFirstRow;
    await ctx.close();
    return { text, clock, csv };
  };
  const en = await read('en-GB');
  for (const l of ['th-TH', 'de-DE']) expect(await read(l)).toEqual(en);
});
