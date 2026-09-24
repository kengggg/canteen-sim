import { defineConfig, devices } from '@playwright/test';

const swiftshader = { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...swiftshader } },
    // Playwright's Firefox build fails to launch on some macOS versions ("Could not find profile folder");
    // set CANTEEN_E2E_FIREFOX=0 to skip it there.
    ...(process.env.CANTEEN_E2E_FIREFOX === '0' ? [] : [{ name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /golden\.spec\.ts/ }]),
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /golden\.spec\.ts/ },
  ],
});
