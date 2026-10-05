import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { waitForRenderedScene } from './helpers';

/**
 * Static hosting: the built dist/index.html served at the production /canteen/ path and at a generic static root,
 * with no build server, no claude.ai viewer and no sandbox.
 * Everything the page needs is inside the one file.
 */
const SITE = 'https://labs.patipat.org/canteen/';
const html = readFileSync(new URL('../../dist/index.html', import.meta.url));

async function pages(context: BrowserContext, dismissed = true) {
  await context.route('https://labs.patipat.org/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/canteen/' || u.pathname === '/canteen/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  if (dismissed) await context.addInitScript(() => localStorage.setItem('canteen-sim:howto-dismissed', '1'));
}

type Hook = { config(): { seed: number; crowd: { totalPeople: number } }; batch(n: number): Promise<{ hashes: [string, number][]; usedFallback: boolean }> };

test('served at the labs /canteen/ path, the page runs with no other requests and no console errors', async ({ page, context }) => {
  await pages(context);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${SITE}?lang=en`);
  await expect(page.getByRole('heading', { name: 'Canteen Sim' })).toBeVisible();
  await page.locator('#skip-to').fill('12:00');
  await page.getByRole('button', { name: 'Skip to' }).click();
  await expect(page.locator('.clock')).toHaveText('12:00', { timeout: 60_000 });
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([`${SITE}?lang=en`]);
  expect(errors).toEqual([]);
});

test('hosted batches use real workers, and a shared #v= link loads its settings', async ({ page, context }) => {
  await pages(context);
  await page.goto(`${SITE}?lang=en#v=1&m=1&seed=7&crowd.totalPeople=900`);
  const cfg = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect([cfg.seed, cfg.crowd.totalPeople]).toEqual([7, 900]);
  await waitForRenderedScene(page);
  const r = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(r.hashes).toHaveLength(10);
  expect(r.usedFallback).toBe(false);
});

test('hosted Download CSV and Download JSON save real files', async ({ page, context }) => {
  await pages(context);
  await page.goto(`${SITE}?lang=en`);
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

test('the hosted self-test runs at ?selftest=1', async ({ page, context }) => {
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

test('served from a generic static root, the page runs alone and #findings opens the panel', async ({ page, context }) => {
  const ROOT = 'https://static.example/';
  await context.route('https://static.example/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ROOT}?lang=en#findings`);
  await expect(page.getByRole('complementary', { name: 'Findings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'How this works' })).toHaveCount(0);
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([`${ROOT}?lang=en`]);
  expect(errors).toEqual([]);
});

test('language changes preserve the labs path, shared settings and production sharing metadata', async ({ page, context }) => {
  await pages(context);
  await page.goto(`${SITE}?lang=en#v=1&m=1&seed=7&crowd.totalPeople=900`);
  await page.getByRole('combobox', { name: 'Language / ภาษา', exact: true }).last().selectOption('th');
  await expect(page).toHaveURL(/\/canteen\/\?lang=th#v=1&m=1&seed=7&crowd\.totalPeople=900$/);
  await page.getByRole('combobox', { name: 'Language / ภาษา', exact: true }).last().selectOption('en');
  await expect(page).toHaveURL(/\/canteen\/\?lang=en#v=1&m=1&seed=7&crowd\.totalPeople=900$/);
  const cfg = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.config());
  expect([cfg.seed, cfg.crowd.totalPeople]).toEqual([7, 900]);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SITE);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${SITE}og/canteen-sim-manga-v1.jpg`);
});
