import { readFileSync } from 'node:fs';
import { evidenceDiff, precomputeEvidence } from '../../src/batch/precompute';

// Spec §10.8: CI fails if the embedded evidence differs from a fresh Node run — hashes, RunMetrics and PairMetrics.
test('the shipped evidence equals a fresh precompute of the default sweep', async () => {
  const shipped = JSON.parse(readFileSync(new URL('../../src/generated/evidence.json', import.meta.url), 'utf8'));
  const fresh = JSON.parse(JSON.stringify(await precomputeEvidence()));
  expect(evidenceDiff(fresh, shipped)).toBeNull();
});
