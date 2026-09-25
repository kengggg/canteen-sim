import { readFileSync } from 'node:fs';
import { runScenario, scenarios } from '../../src/batch/selftest';

// The golden file is the Node reference the browsers are compared against; it must match the current engine.
test('self-test scenarios in Node match tests/golden/hashes.json', () => {
  const golden = JSON.parse(readFileSync(new URL('../golden/hashes.json', import.meta.url), 'utf8'));
  for (const s of scenarios()) {
    if (s.id === 'big') continue; // checked in the sanity suite and in the browsers
    expect(runScenario(s)).toEqual(golden[s.id]);
  }
}, 120_000);
