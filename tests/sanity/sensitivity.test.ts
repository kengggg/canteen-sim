import { readFileSync } from 'node:fs';
import { runStudyScenario } from '../../src/batch/sensitivity';
import type { SensitivityAudit } from '../../src/batch/sensitivity-data';
import { STUDY_PLAN } from '../../src/batch/sensitivity-plan';

const audit = JSON.parse(readFileSync(new URL('../../docs/studies/model-2-sensitivity-audit.json', import.meta.url), 'utf8')) as SensitivityAudit;

test('every sensitivity setting reproduces its first lunch, metrics and hashes, with invariants enabled', async () => {
  for (const scenario of STUDY_PLAN.scenarios) {
    const fresh = await runStudyScenario(scenario, 1);
    const stored = audit.scenarios.find((s) => s.id === scenario.id)!.pairs.filter((p) => p.seedIndex === 0);
    expect(fresh, scenario.id).toEqual(stored);
  }
});
