import { expect, test } from '@playwright/test';

type Hook = { batch(n: number, mode?: 'auto' | 'fallback'): Promise<{ hashes: [string, number][]; usedFallback: boolean }> };

test('with CSP worker-src none, a 2-seed batch completes through the fallback with the worker hashes', async ({ page, browser }) => {
  await page.goto('/');
  const withWorkers = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(withWorkers.usedFallback).toBe(false);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "worker-src 'none'" } });
  });
  await p2.goto('/');
  const r = await p2.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(r.usedFallback).toBe(true);
  expect(r.hashes).toEqual(withWorkers.hashes);
  await ctx.close();
});

test('inside a sandboxed iframe (allow-scripts only), the page runs and a 2-seed batch matches', async ({ page }) => {
  await page.goto('/');
  const ref = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  await page.route('**/sandbox.html', (route) => route.fulfill({ contentType: 'text/html', body: '<iframe id="f" sandbox="allow-scripts" src="/index.html" style="width:1200px;height:900px"></iframe>' }));
  await page.goto('/sandbox.html');
  const frame = page.frameLocator('#f');
  await expect(frame.getByRole('heading', { name: 'Canteen Sim' })).toBeVisible();
  const f = page.frames().find((x) => x.url().endsWith('/index.html'))!;
  const r = await f.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  expect(r.hashes).toEqual(ref.hashes);
});
