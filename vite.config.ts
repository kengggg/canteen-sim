import { execSync } from 'node:child_process';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true })],
  define: { __BUILD_SHA__: JSON.stringify(sha), __SIM_INVARIANTS__: 'false' },
  worker: { format: 'iife' },
  build: { target: 'es2022', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000, reportCompressedSize: false },
});
