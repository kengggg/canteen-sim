import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('separate role results explain the mechanism and keep Model 2 live settings intact', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lang=en#findings');
  const research = page.getByRole('region', { name: 'Why does seeing farther change the result?', exact: true });
  await page.getByRole('button', { name: 'Investigate visibility', exact: true }).click();
  await expect(research.getByRole('heading', { name: 'Why does seeing farther change the result?', exact: true })).toBeFocused();
  await expect(research).toContainText('Separate experiment · Visibility roles v1');
  await expect(research).toContainText('+16.23 pp');
  await expect(research.locator('.research-cases tbody tr')).toHaveCount(4);
  await research.getByRole('button', { name: 'Only claimers see 20 m', exact: true }).click();
  await expect(research.locator('.research-detail')).toContainText('37.2 leave with reservation and 16.1 under free flow');
  await expect(research.locator('.research-detail')).toContainText('−1.45 s');
  await research.getByRole('combobox', { name: 'Door rule in this experiment', exact: true }).selectOption('0');
  await expect(research.locator('.research-detail')).toContainText('No clear difference in leaving');
  await expect(research.locator('.research-detail')).toContainText('+15.34 s');
  await research.getByRole('combobox', { name: 'Reservation in this experiment', exact: true }).selectOption('0.5');
  await expect(research.locator('.research-detail h4')).toContainText('50% reserve · queues only');
  await expect(page.getByRole('slider')).toHaveValue('50');
  await expect(page.locator('.evidence-line')).toContainText('50% reserving: 20.2%');
  await expect(page.locator('.clock')).toHaveText('11:00');
  expect(errors).toEqual([]);
});

test('research downloads contain the complete protocol and report', async ({ page }) => {
  await page.goto('/?lang=en#findings');
  const research = page.locator('.research');
  await research.getByText('Research protocol and complete results', { exact: true }).click();
  for (const [button, filename, path] of [
    ['Download research protocol', 'canteen-research-protocol.md', '../../docs/research-protocol.md'],
    ['Download complete results', 'canteen-visibility-roles-v1.md', '../../docs/studies/visibility-roles-v1.md'],
  ]) {
    const downloaded = page.waitForEvent('download');
    await research.getByRole('button', { name: button, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(filename);
    expect(readFileSync((await download.path())!, 'utf8')).toBe(readFileSync(new URL(path, import.meta.url), 'utf8'));
  }
  await expect(research).toContainText('There is no real pilot or participant study');
  await expect(page.getByText('What to observe in a real canteen', { exact: true })).toHaveCount(0);
});

test('keyboard navigation returns to its opener and Escape in a select preserves the panel', async ({ page }) => {
  await page.goto('/?lang=en');
  const opener = page.getByRole('button', { name: 'Read the full findings', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Findings', exact: true })).toBeFocused();
  const control = page.getByRole('combobox', { name: 'Door rule in this experiment', exact: true });
  await control.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer-findings')).toBeVisible();
  await page.getByRole('button', { name: 'Both see 20 m', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('research controls and table scroll regions work at 320 px with no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?lang=en#findings');
  const research = page.locator('.research');
  await research.getByRole('button', { name: 'Only food-searchers see 20 m', exact: true }).click();
  await expect(research.locator('.research-detail h4')).toContainText('Only food-searchers see 20 m');
  await research.getByText('How to interpret this experiment', { exact: true }).click();
  await expect(research).toContainText('not uncertainty about real behaviour');
  expect(await page.locator('.drawer-body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const control of await research.locator('button, select').all()) {
    if (await control.isVisible()) expect((await control.boundingBox())!.height, await control.evaluate((el) => el.outerHTML.slice(0, 180))).toBeGreaterThanOrEqual(44);
  }
});
