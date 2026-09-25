import { expect, test, type Page } from '@playwright/test';

const DISMISSED = () => { try { localStorage.setItem('canteen-sim:howto-dismissed', '1'); } catch { /* sandboxed */ } };
test.beforeEach(async ({ context }) => {
  await context.addInitScript(DISMISSED);
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const SECTIONS = ['In short', 'How the comparison works', '1. Reservation loses on every headline measure', '2. Why: idle seats in the rush', '3. Who pays', '4. Where the time goes', 'What it means', 'How far it generalises', 'Limitations'];

test('Findings opens from the top bar with every section, its tables and four charts', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Findings' });
  await expect(panel).toBeVisible();
  for (const h of SECTIONS) await expect(panel.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await expect(panel.locator('.flead')).toContainText('7.7% of diners walk away instead of 2.7%');
  await expect(panel.locator('.fchart svg')).toHaveCount(4);
  await expect(panel.locator('table.fhead tbody tr')).toHaveCount(5);
  await expect(panel.getByText('Your current settings differ')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a chart switches to its table and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  const fig = page.locator('.fchart').first();
  await fig.getByRole('button', { name: 'Show table' }).click();
  await expect(fig.getByRole('columnheader', { name: 'Seat state' })).toBeVisible();
  await expect(fig.locator('svg')).toHaveCount(0);
  await fig.getByRole('button', { name: 'Show chart' }).click();
  await expect(fig.locator('svg')).toHaveCount(1);
});

test('#findings opens the panel on load, and the evidence panel links to it', async ({ page }) => {
  await page.goto('/#findings');
  await expect(page.getByRole('complementary', { name: 'Findings' })).toBeVisible();
  await page.getByRole('button', { name: 'Batch runs' }).click();
  await page.getByRole('button', { name: 'Read the findings' }).click();
  await expect(page.getByRole('complementary', { name: 'Findings' })).toBeVisible();
});

test('with other settings applied the panel says it describes the defaults', async ({ page }) => {
  await page.goto('/#v=1&m=1&seed=7&crowd.totalPeople=900');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Findings' });
  await expect(panel.getByText('Your current settings differ from the defaults')).toBeVisible();
  await panel.getByRole('button', { name: 'Test your settings in Batch runs' }).click();
  await expect(page.getByRole('complementary', { name: 'Batch runs' })).toBeVisible();
});

test('at phone width the panel fits without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#findings');
  const body = page.locator('.drawer-findings .drawer-body');
  await expect(body).toBeVisible();
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const svgWidths = await page.locator('.fchart svg').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  for (const w of svgWidths) expect(w).toBeLessThanOrEqual(390);
});
