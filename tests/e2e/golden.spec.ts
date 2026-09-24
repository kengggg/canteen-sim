import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const golden = JSON.parse(readFileSync(new URL('../golden/hashes.json', import.meta.url), 'utf8')) as Record<string, { hash: number; checkpoints: number[] }>;

// Spec §13.6: identical inputs give identical hashes in Node, Chromium, WebKit and Firefox, on the main thread and in
// a worker.
test('self-test hashes equal the Node golden file (main thread and worker)', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?selftest=1');
  await page.waitForFunction(() => (window as unknown as { __selftestDone?: boolean }).__selftestDone === true, null, { timeout: 580_000 });
  const got = await page.evaluate(() => (window as unknown as { __selftest: Record<string, { hash: number; checkpoints: number[]; consistent: boolean; worker: boolean }> }).__selftest);
  for (const [id, g] of Object.entries(golden)) {
    const r = got[id];
    expect(r, id).toBeTruthy();
    expect(r.consistent, `${id}: main-thread and worker runs agree`).toBe(true);
    expect(r.worker, `${id}: worker ran`).toBe(true);
    const first = g.checkpoints.findIndex((h, i) => r.checkpoints[i] !== h);
    expect(first, `${id}: first differing checkpoint (10-min steps)`).toBe(-1);
    expect(r.hash, id).toBe(g.hash);
  }
});
