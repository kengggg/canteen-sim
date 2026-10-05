import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/** Conservative freshness guard: all engine/config files and the study's numerical path, excluding UI/report prose. */
export function sensitivitySourceDigest(): string {
  const root = new URL('../', import.meta.url);
  const files = ['src/sim', 'src/config'].flatMap((dir) => readdirSync(new URL(dir, root)).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`));
  files.push(...['stats', 'sweep', 'runner', 'catalog', 'sensitivity-plan', 'sensitivity-data', 'sensitivity'].map((f) => `src/batch/${f}.ts`));
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(new URL(file, root))).update('\0');
  return hash.digest('hex');
}
