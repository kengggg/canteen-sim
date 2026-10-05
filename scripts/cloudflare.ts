/** Preserve the offline build and package an independent Worker under its public /canteen/ path. */
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const output = new URL('../dist-cloudflare/', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL('canteen/', output), { recursive: true });
cpSync(new URL('../dist/index.html', import.meta.url), new URL('canteen/index.html', output));
cpSync(new URL('../dist/og/', import.meta.url), new URL('canteen/og/', output), { recursive: true });
console.log('dist-cloudflare/canteen/ is ready for the patipat-canteen Worker.');
