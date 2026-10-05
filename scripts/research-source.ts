import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { sensitivitySourceDigest } from './sensitivity-source';

export function researchSourceDigest(): string {
  const root = new URL('../', import.meta.url);
  const hash = createHash('sha256').update(sensitivitySourceDigest());
  for (const file of readdirSync(new URL('src/research/', root)).filter((f) => f.endsWith('.ts')).sort()) {
    hash.update(file).update('\0').update(readFileSync(new URL(`src/research/${file}`, root))).update('\0');
  }
  return hash.digest('hex');
}
