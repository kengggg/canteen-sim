import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
const translations = JSON.parse(readFileSync(new URL('../../src/i18n/th.json', import.meta.url), 'utf8')) as Record<string, string>;

const th = (key: string) => translations[key];
const picker = (page: Page) => page.getByRole('combobox', { name: 'Language / ภาษา', exact: true }).last();
const button = (page: Page, english: string) => page.getByRole('button', { name: th(english), exact: true });
type Hook = {
  config(): unknown;
  renderer(): { yaw: number; targets: number[]; info: { textures: number; geometries: number } };
  batch(n: number): Promise<{ hashes: [string, number][]; csvFirstRow: string }>;
};
const state = (page: Page) => page.evaluate(() => {
  const hook = (window as unknown as { __canteen: Hook }).__canteen;
  const renderer = hook.renderer();
  return { config: hook.config(), yaw: renderer.yaw, targets: renderer.targets, resources: renderer.info,
    clock: document.querySelector('.clock')!.textContent,
    numbers: [...document.querySelectorAll('.live .num')].map((el) => el.textContent!.match(/[\d.,]+/g)) };
});

const expectThaiFont = async (page: Page) => {
  await expect(page.locator('body')).toHaveCSS('font-family', /^"?Noto Sans Thai Looped/);
  await expect.poll(() => page.evaluate(() => [...document.fonts]
    .some((face) => face.family.includes('Noto Sans Thai Looped') && face.status === 'loaded'))).toBe(true);
};

test('Thai is the default even in an English browser; saved choices and explicit links override it', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-GB' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('#story-title')).toHaveText('จองโต๊ะก่อนซื้ออาหาร ส่งผลต่อคนทั้งโรงอาหารอย่างไร?');
  await expectThaiFont(page);
  await picker(page).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\?lang=en/);
  await page.goto('/');
  await expect(picker(page)).toHaveValue('en');
  await page.goto('/?lang=th#findings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('.drawer-findings')).toBeVisible();
  await picker(page).selectOption('en');
  await expect(page).toHaveURL(/\?lang=en#findings$/);
  await context.close();
});

test('switching language preserves the paused lunch, camera, pending edits and selected research comparison', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lang=en');
  await page.locator('#skip-to').fill('12:10');
  await page.getByRole('button', { name: 'Skip to', exact: true }).click();
  await expect(page.locator('.clock')).toHaveText('12:10');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#set-crowd-totalPeople').fill('900');
  await page.locator('#set-crowd-totalPeople').press('Tab');
  const before = await state(page);
  await picker(page).selectOption('th');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('#set-crowd-totalPeople')).toHaveValue('900');
  await expect(page.locator('.banner.warn')).toContainText(th('Settings changed — Restart to apply'));
  await expect(button(page, 'Play')).toBeVisible();
  expect(await state(page)).toEqual(before);
  await button(page, 'Findings').click();
  const research = page.locator('.research');
  await research.getByRole('button', { name: th('Only claimers see 20 m'), exact: true }).click();
  await research.getByRole('combobox').first().selectOption('0');
  await research.getByRole('combobox').last().selectOption('0.5');
  const cells = await research.locator('.research-detail td').allTextContents();
  await picker(page).selectOption('en');
  await expect(research.getByRole('combobox').first()).toHaveValue('0');
  await expect(research.getByRole('combobox').last()).toHaveValue('0.5');
  await expect(research.getByRole('button', { name: 'Only claimers see 20 m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const numbers = (s: string) => s.match(/[+−]?\d+(?:\.\d+)?/g);
  expect((await research.locator('.research-detail td').allTextContents()).map(numbers)).toEqual(cells.map(numbers));
  expect(await state(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('Thai and English produce identical run hashes, CSV numbers and settings JSON', async ({ page }) => {
  await page.goto('/?lang=en#v=1&m=2&seed=7&crowd.totalPeople=900');
  const batch = () => page.evaluate(() => (window as unknown as { __canteen: Hook }).__canteen.batch(2));
  const english = await batch();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const json = async (label: string) => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const file = await event;
    expect(file.suggestedFilename()).toBe('canteen-sim-settings.json');
    return readFileSync((await file.path())!, 'utf8');
  };
  const enJson = await json('Download JSON');
  await picker(page).selectOption('th');
  await expect(page).toHaveURL(/\?lang=th#v=1&m=2&seed=7&crowd.totalPeople=900$/);
  expect(await json(th('Download JSON'))).toBe(enJson);
  expect(await batch()).toEqual(english);
  expect(english.hashes).toHaveLength(10);
});

test('Thai reader downloads contain the complete protocol and results, and switch back to English', async ({ page }) => {
  await page.goto('/?lang=th#findings');
  const research = page.locator('.research');
  await research.getByText(th('Research protocol and complete results'), { exact: true }).click();
  for (const lang of ['th', 'en'] as const) {
    await picker(page).selectOption(lang);
    for (const [label, base, file] of [
      ['Download research protocol', 'canteen-research-protocol', 'research-protocol'],
      ['Download complete results', 'canteen-visibility-roles-v1', 'studies/visibility-roles-v1'],
    ]) {
      const extension = lang === 'th' ? '.th.md' : '.md';
      const event = page.waitForEvent('download');
      await research.getByRole('button', { name: lang === 'th' ? th(label) : label, exact: true }).click();
      const download = await event;
      expect(download.suggestedFilename()).toBe(base + extension);
      expect(readFileSync((await download.path())!, 'utf8')).toBe(readFileSync(new URL('../../docs/' + file + extension, import.meta.url), 'utf8'));
    }
  }
});

test('a running batch and its completed check follow language changes without losing results', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Batch runs', exact: true }).click();
  await page.getByRole('button', { name: 'Re-run on this device to check', exact: true }).click();
  await picker(page).selectOption('th');
  await expect(page.locator('.batch > [role="status"]')).toHaveText('ผลทั้ง 150 รอบตรงกัน', { timeout: 120_000 });
  await expect(page.locator('.batch')).toContainText('จุดเปอร์เซ็นต์');
  await picker(page).selectOption('en');
  await expect(page.locator('.batch > [role="status"]')).toHaveText('All 150 runs match');
  await expect(page.locator('.batch')).toContainText('Primary endpoints at 100% vs 0% reservation');
});

test('blocked storage and clipboard still allow language switching and a complete copy fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Blocked')) } });
  });
  await page.goto('/?lang=th#findings');
  const research = page.locator('.research');
  await research.getByText(th('Research protocol and complete results'), { exact: true }).click();
  await research.getByRole('button', { name: th('Copy research protocol'), exact: true }).click();
  await expect(research.locator('textarea')).toHaveValue(readFileSync(new URL('../../docs/research-protocol.th.md', import.meta.url), 'utf8'));
  await picker(page).selectOption('en');
  await expect(research.locator('textarea')).toHaveValue(readFileSync(new URL('../../docs/research-protocol.md', import.meta.url), 'utf8'));
  await expect(page.locator('.clock')).toHaveText('11:00');
});

test('Thai chart labels stay inside their plots and do not overlap at phone and desktop widths', async ({ page }) => {
  await page.goto('/?lang=th#findings');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.locator('.fsvg').evaluateAll((plots) => plots.flatMap((plot) => {
      const bounds = plot.getBoundingClientRect();
      const issues: string[] = [];
      for (const text of plot.querySelectorAll('text')) {
        const box = text.getBoundingClientRect();
        if (box.left < bounds.left - 1 || box.right > bounds.right + 1) issues.push(`clipped: ${text.textContent}`);
      }
      const axis = [...plot.querySelectorAll('.flabel')];
      for (let i = 1; i < axis.length; i++) {
        if (axis[i - 1].getBoundingClientRect().right > axis[i].getBoundingClientRect().left - 2) issues.push(`overlap: ${axis[i].textContent}`);
      }
      const labels = [...plot.querySelectorAll('.fdirect text')];
      for (let i = 1; i < labels.length; i++) {
        if (labels[i - 1].getBoundingClientRect().bottom > labels[i].getBoundingClientRect().top - 1) issues.push(`overlapping marks: ${labels[i].textContent}`);
      }
      return issues;
    })), { message: `${width}px chart text fits` }).toEqual([]);
  }
  await expect(page.locator('.fchart').first()).toContainText('แท่ง 0% คือไม่มีการจอง');
});

test('Thai walkthrough explains uncertainty, preserves keyboard focus and fits 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?lang=th');
  await page.getByRole('radio', { name: th('{v0} Queues only').replace('{v0}', '').trim(), exact: true }).check();
  await expect(page.locator('.story-takeaway')).toHaveText('ยังไม่พบความแตกต่างที่ชัดเจนของจำนวนคนที่ออกไป');
  await page.getByText(th('How certain is this estimate?'), { exact: true }).click();
  await expect(page.locator('.story-uncertainty')).toContainText('−');
  const opener = button(page, 'Read the full findings');
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: th('Findings'), exact: true })).toBeFocused();
  const research = page.locator('.research');
  await research.getByRole('button', { name: th('Only food-searchers see 20 m'), exact: true }).click();
  await research.getByText(th('How to interpret this experiment'), { exact: true }).click();
  expect(await page.locator('.drawer-body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const control of await research.locator('button, select').all()) {
    if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await research.getByRole('button', { name: th('Both see 20 m'), exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await button(page, 'Settings').click();
  await page.locator('#load-code').fill('not a code');
  await page.locator('#load-code').press('Enter');
  await expect(page.getByRole('alert')).toContainText(th('This settings code isn’t valid or is from a newer version'));
});

test('single-file Thai app works offline without fetching external fonts or translations', async ({ browser, browserName }) => {
  const context = await browser.newContext({ offline: browserName !== 'webkit', locale: 'en-GB' });
  const page = await context.newPage();
  const requests: string[] = [], errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  // Playwright WebKit on macOS cannot navigate to file: URLs or start a navigation in offline mode.
  // Load the same HTML through a route, then disconnect before interacting. Chromium opens the file offline.
  const entry = browserName === 'webkit' ? 'http://offline.test/' : new URL('../../dist/index.html', import.meta.url).href;
  if (browserName === 'webkit') {
    await context.route(entry, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: readFileSync(new URL('../../dist/index.html', import.meta.url)) }));
  }
  await page.goto(entry);
  await context.setOffline(true);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expectThaiFont(page);
  await page.locator('#skip-to').fill('11:20');
  await button(page, 'Skip to').click();
  await expect(page.locator('.clock')).toHaveText('11:20');
  await picker(page).selectOption('en');
  await expect(page.locator('.clock')).toHaveText('11:20');
  expect(requests.filter((url) => /^https?:/.test(url) && url !== entry)).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
