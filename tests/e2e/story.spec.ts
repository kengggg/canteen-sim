import { expect, test } from '@playwright/test';

test('the assumption comparison updates its evidence and loads the matching live lunch', async ({ page }) => {
  await page.goto('/');
  const story = page.getByRole('region', { name: 'Does saving a table help everyone get lunch?' });
  await expect(story).toContainText('21.4');
  await page.getByRole('radio', { name: 'Queues only', exact: true }).check();
  await expect(story).toContainText('No clear difference');
  await expect(story).toContainText('16.3');
  await page.getByRole('button', { name: 'Watch this comparison' }).click();
  await expect(page.getByRole('slider', { name: 'Groups that reserve in A: 100%' })).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('.evidence-line')).toContainText('16.3% left without eating in A, 16.4% in B');
  await expect(page.locator('#simulation')).toBeFocused();
});

test('the live estimate follows computed levels and declines to interpolate other levels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.evidence-line')).toContainText('50% reserving: 20.2%');
  const slider = page.getByRole('slider');
  await slider.press('Home');
  for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
  await expect(page.locator('.evidence-line')).toContainText('25% reserving: 19.6%');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await expect(page.locator('.evidence-line')).toContainText('No built-in estimate');
});

test('paused charts fit after desktop-to-phone resize and after resizing back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('.series .uplot')).toHaveCount(2);
  for (const width of [390, 320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator('.series .chart').evaluateAll((els) => Math.max(...els.map((el) => Math.abs(el.clientWidth - el.querySelector('.uplot')!.getBoundingClientRect().width))))).toBeLessThanOrEqual(1);
  }
});

test('shared settings open the requested live lunch instead of the default story example', async ({ page }) => {
  await page.goto('/#v=1&m=2&seed=7&crowd.totalPeople=900&reserve.percentA=0.25');
  await expect(page.locator('#simulation')).toBeFocused();
  await expect(page.getByRole('slider')).toHaveValue('25');
  await expect(page.locator('.evidence-line')).toContainText('No built-in estimate for these settings');
});
