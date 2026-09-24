import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

type Hook = { batch(n: number): Promise<{ hashes: [string, number][] }> };
const evidence = JSON.parse(readFileSync(new URL('../../src/generated/evidence.json', import.meta.url), 'utf8')) as { runs: { k: string; h: number }[] };

test('the embedded evidence hashes equal a fresh 150-run sweep in the browser', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  const r = await page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(30));
  const fresh = new Map(r.hashes);
  expect(fresh.size).toBe(150);
  for (const run of evidence.runs) expect(fresh.get(run.k), run.k).toBe(run.h);
});
