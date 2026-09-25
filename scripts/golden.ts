/** npm run golden:update — Node reference hashes for the self-test scenarios (spec §13.6). */
import { writeFileSync } from 'node:fs';
import { runScenario, scenarios } from '../src/batch/selftest';

const out: Record<string, { hash: number; checkpoints: number[] }> = {};
for (const s of scenarios()) out[s.id] = runScenario(s);
writeFileSync(new URL('../tests/golden/hashes.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`golden: ${Object.keys(out).length} scenarios`);
