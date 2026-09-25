import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __SIM_INVARIANTS__: 'true' },
  test: {
    include: ['tests/sanity/**/*.test.ts'],
    setupFiles: ['tests/sanity/setup.ts'],
    maxWorkers: 12,
    globals: true,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
