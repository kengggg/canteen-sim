/** npm run findings: figures for the Findings panel (spec §10.9) → src/generated/findings.json. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { computeFindings } from '../src/batch/findings';
import { evidenceDigest } from '../src/batch/findings-data';
import type { Evidence } from '../src/batch/precompute';
import { MODEL_VERSION } from '../src/sim/version';

const t0 = performance.now();
const secs = () => ((performance.now() - t0) / 1000).toFixed(1);
const evidence = JSON.parse(readFileSync(new URL('../src/generated/evidence.json', import.meta.url), 'utf8')) as Evidence;
if (evidence.model !== MODEL_VERSION) throw new Error(`evidence.json is for model ${evidence.model}, not ${MODEL_VERSION}: run npm run precompute first`);
// With the evidence passed in, every instrumented default run must reproduce its evidence hash.
const findings = computeFindings({ evidence, onProgress: (msg) => console.log(`[${secs()} s] ${msg}`) });
findings.model = MODEL_VERSION;
findings.evidenceDigest = evidenceDigest(evidence);
const json = JSON.stringify(findings);
mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/generated/findings.json', import.meta.url), json + '\n');
console.log(`findings: ${findings.n} lunches per level, ${findings.robustness.length} robustness rows, ${(json.length / 1024).toFixed(1)} KB in ${secs()} s`);
