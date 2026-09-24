/** npm run precompute: the default reservation sweep (150 runs) → src/generated/evidence.json (spec §10.8). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { precomputeEvidence } from '../src/batch/precompute';

const t0 = performance.now();
const ev = await precomputeEvidence();
const json = JSON.stringify(ev);
mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/generated/evidence.json', import.meta.url), json + '\n');
console.log(`evidence: ${ev.runs.length} runs, ${ev.pairs.length} pairs, ${(json.length / 1024).toFixed(1)} KB in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
