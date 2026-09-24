import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __SIM_INVARIANTS__: 'true' },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/sanity/**', 'tests/e2e/**'],
    globals: true,
    testTimeout: 60_000,
  },
});
