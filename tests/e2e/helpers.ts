import { expect, type Page } from '@playwright/test';

/** Hooks exist before Preact effects and the first WebGL frame have finished. */
export async function waitForRenderedScene(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const hook = (window as unknown as {
      __canteen?: { renderer(): { info: { geometries: number } } | null };
    }).__canteen;
    return hook?.renderer()?.info.geometries ?? 0;
  }), { message: 'the 3D scene has completed its first render' }).toBeGreaterThan(0);
}
