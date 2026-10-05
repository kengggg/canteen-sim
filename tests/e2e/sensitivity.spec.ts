import { expect, test } from '@playwright/test';

test('the explorer loads a tested visibility setting and the live estimate follows it', async ({ page }) => {
  await page.goto('/#findings');
  const explorer = page.getByRole('region', { name: 'What changes the result?', exact: true });
  await explorer.getByRole('button', { name: 'See tables within 20 metres', exact: true }).click();
  await expect(explorer.locator('.sensitivity-detail')).toContainText('16.9 out of 100 leave under free flow; 37.9 with reservation');
  await explorer.getByRole('button', { name: 'Watch this setting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('.evidence-line')).toContainText('100% reserving: 37.9% left without eating in A, 16.9% in B');
  await expect(page.locator('#simulation')).toBeFocused();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const slider = page.getByRole('slider', { name: /Groups that reserve in A/ });
  await slider.press('Home');
  for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
  await expect(page.locator('.evidence-line')).toContainText('No built-in estimate for these settings');
});

test('combined assumptions retain both axes and distinguish an unclear difference at 50%', async ({ page }) => {
  await page.goto('/#findings');
  const explorer = page.getByRole('region', { name: 'What changes the result?', exact: true });
  await explorer.getByRole('combobox', { name: 'Assumption to explore', exact: true }).selectOption('doorCrowd');
  await explorer.getByRole('combobox', { name: 'Groups reserving in A', exact: true }).selectOption('0.5');
  await expect(explorer.locator('.sensitivity-cases tbody tr')).toHaveCount(12);
  await explorer.getByRole('button', { name: '1200 diners; ignore seating', exact: true }).click();
  await expect(explorer.locator('.sensitivity-detail')).toContainText('No clear difference in leaving');
  await expect(explorer.locator('.sensitivity-detail')).toContainText('7.2 out of 100 leave under free flow; 7.2 with reservation');
});

test('near-zero intervals keep their sign', async ({ page }) => {
  await page.goto('/#findings');
  const explorer = page.getByRole('region', { name: 'What changes the result?', exact: true });
  await explorer.getByRole('combobox', { name: 'Assumption to explore', exact: true }).selectOption('doorService');
  await explorer.getByRole('button', { name: '60 seconds per serving; ignore seating', exact: true }).click();
  await expect(explorer.locator('.sensitivity-detail')).toContainText('−0.158 to −0.001');
});

test('the phone explorer keeps page controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#findings');
  const body = page.locator('.drawer-findings .drawer-body');
  await expect(body).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.locator('.topbar').evaluate((el) => Math.abs(el.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
    expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator('.drawer').evaluate((el) => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
  }
  await page.getByRole('combobox', { name: 'Assumption to explore', exact: true }).selectOption('doorCrowd');
  expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});
