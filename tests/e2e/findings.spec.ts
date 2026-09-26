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

const SECTIONS = ['In short', 'How the comparison works', '1. Reservation loses on every headline measure', '2. Why: idle seats in the rush, and a hall that looks full', '3. Who pays', '4. Where the time goes', 'What it means', 'How far it generalises', 'Limitations'];

test('Findings opens from the top bar with every section, its tables and six charts', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Findings' });
  await expect(panel).toBeVisible();
  for (const h of SECTIONS) await expect(panel.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await expect(panel.locator('.flead')).toContainText('21.4% of the people who come to lunch leave without eating instead of 16.6%');
  await expect(panel.locator('.fchart .fsvg svg')).toHaveCount(6);
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
  await expect(fig.locator('.fsvg svg')).toHaveCount(0);
  await fig.getByRole('button', { name: 'Show chart' }).click();
  await expect(fig.locator('.fsvg svg')).toHaveCount(1);
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
  const svgWidths = await page.locator('.fchart .fsvg svg').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  for (const w of svgWidths) expect(w).toBeLessThanOrEqual(390);
});

test('the rendered prose and tables carry the evidence and findings figures', async ({ page }) => {
  await page.goto('/#findings');
  const panel = page.getByRole('complementary', { name: 'Findings' });
  const text = await panel.innerText();
  for (const s of [
    'More people leave without eating.',
    '299 to 385 people per lunch',
    'about two-thirds of the leaving, seat-use and throughput losses (62–66%)',
    'most of them (86%) for groupmates still getting food',
    'had not seen an empty table to head for',
    'It depends on how full the hall looks.',
    'no clear difference to leaving (−0.1 pp [−0.2, 0.0])',
    'they are a selected set: they all got past the door',
    'Time in the queue falls by 20–32 seconds',
    'about 219 such comparisons',
    'The lunch the app plays on screen has free-flow leaving of 18.2%',
  ]) expect(text, s).toContain(s);
  for (const old of ['walk away', 'walk-away', 'takeaway']) expect(text.toLowerCase(), old).not.toContain(old);
  const row100 = panel.locator('table.fhead tbody tr').nth(4);
  await expect(row100.locator('td').nth(0)).toHaveText('21.4%: +4.8 pp [4.4, 5.1]');
  await expect(row100.locator('td').nth(2)).toHaveText('55.8%: −4.7 pp [−5.1, −4.3]');
  await expect(panel.getByRole('row', { name: /Reservers who found no table/ }).getByRole('cell').first()).toHaveText('20.2% vs 27.2%');
  await expect(panel.getByRole('row', { name: /Quiet day/ }).getByRole('cell').nth(1)).toHaveText('+0.6 [−0.1, 1.2]');
});

test('the slider or a new seed alone do not flag the findings as not applying', async ({ page }) => {
  await page.goto('/#v=1&m=1&reserve.percentA=1');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Findings' });
  await expect(panel.locator('.flead')).toBeVisible();
  await expect(panel.getByText('Your current settings differ')).toHaveCount(0);
  await expect(panel.getByText('The lunch the app plays on screen')).toBeVisible();
  // A hash-only change does not reload the page, and settings codes apply on load.
  await page.goto('about:blank');
  await page.goto('/#v=1&m=1&seed=7');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  await expect(panel.getByText('Your current settings differ')).toHaveCount(0);
  await expect(panel.getByText('Lunch 1 of the evidence')).toBeVisible();
  await expect(panel.getByText('The lunch the app plays on screen')).toHaveCount(0);
});

test('a first visit to #findings shows the panel without the how-to dialog, and closing it clears the hash', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/#findings');
  await expect(page.getByRole('complementary', { name: 'Findings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'How this works' })).toHaveCount(0);
  await page.getByRole('complementary', { name: 'Findings' }).getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await ctx.close();
});

test('jumping from Findings to Assumptions opens it at the top with focus on its heading', async ({ page }) => {
  await page.goto('/#findings');
  const body = page.locator('.drawer-findings .drawer-body');
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: 'See all assumptions' }).click();
  await expect(page.getByRole('complementary', { name: 'Assumptions' })).toBeVisible();
  expect(await page.locator('.drawer-assumptions .drawer-body').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Assumptions', level: 2 })).toBeFocused();
});

test('at 320 px the group-size labels do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/#findings');
  const boxes = await page.locator('.fchart').nth(4).locator('.flabel').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]));
  expect(boxes).toHaveLength(6);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i][0]).toBeGreaterThanOrEqual(boxes[i - 1][1]);
});
