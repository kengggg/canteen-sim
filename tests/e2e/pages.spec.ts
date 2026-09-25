import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';

/**
 * Static hosting: the built dist/index.html served as a GitHub Pages project site (https://<user>.github.io/<repo>/) and
 * from the root of a custom domain (Cloudflare Pages), with no build server, no claude.ai viewer and no sandbox.
 * Everything the page needs is inside the one file.
 */
const SITE = 'https://kengggg.github.io/canteen-sim/';
const html = readFileSync(new URL('../../dist/index.html', import.meta.url));

async function pages(context: BrowserContext, dismissed = true) {
  await context.route('https://kengggg.github.io/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/canteen-sim/' || u.pathname === '/canteen-sim/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  if (dismissed) await context.addInitScript(() => localStorage.setItem('canteen-sim:howto-dismissed', '1'));
}

type Hook = { config(): { seed: number; crowd: { totalPeople: number } }; batch(n: number): Promise<{ hashes: [string, number][]; usedFallback: boolean }> };

test('served as a GitHub Pages project site, the page runs with no other requests and no console errors', async ({ page, context }) => {
  await pages(context);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(SITE);
  await expect(page.getByRole('heading', { name: 'Canteen Sim' })).toBeVisible();
  await page.locator('#skip-to').fill('12:00');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('12:00', { timeout: 60_000 });
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([SITE]);
  expect(errors).toEqual([]);
});

test('batches use real workers on Pages, and a shared #v= link loads its settings', async ({ page, context }) => {
  await pages(context);
  await page.goto(`${SITE}#v=1&m=1&seed=7&crowd.totalPeople=900`);
  const cfg = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect([cfg.seed, cfg.crowd.totalPeople]).toEqual([7, 900]);
  const r = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(r.hashes).toHaveLength(10);
  expect(r.usedFallback).toBe(false);
});

test('Download CSV and Download JSON save real files on Pages', async ({ page, context }) => {
  await pages(context);
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Settings' }).click();
  const json = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  expect((await json).suggestedFilename()).toBe('canteen-sim-settings.json');
  await page.getByRole('button', { name: 'Batch runs' }).click();
  await expect(page.getByText('Primary endpoints at 100% vs 0% reservation')).toBeVisible();
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await csv).suggestedFilename()).toBe('canteen-sim-batch.csv');
});

test('the self-test runs at ?selftest=1 on Pages', async ({ page, context }) => {
  test.setTimeout(600_000);
  await pages(context);
  await page.goto(`${SITE}?selftest=1`);
  await page.waitForFunction(() => (window as unknown as { __selftestDone?: boolean }).__selftestDone === true, null, { timeout: 580_000 });
  const golden = JSON.parse(readFileSync(new URL('../golden/hashes.json', import.meta.url), 'utf8')) as Record<string, { hash: number }>;
  const got = await page.evaluate(() => (window as unknown as { __selftest: Record<string, { hash: number; consistent: boolean; worker: boolean }> }).__selftest);
  for (const [id, g] of Object.entries(golden)) {
    expect(got[id].hash, id).toBe(g.hash);
    expect(got[id].consistent && got[id].worker, id).toBe(true);
  }
});

test('served from the root of a custom domain (Cloudflare Pages), the page runs alone and #findings opens the panel', async ({ page, context }) => {
  const ROOT = 'https://canteen.lab.patipat.org/';
  await context.route('https://canteen.lab.patipat.org/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ROOT}#findings`);
  await expect(page.getByRole('complementary', { name: 'Findings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'How this works' })).toHaveCount(0);
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([ROOT]);
  expect(errors).toEqual([]);
});
