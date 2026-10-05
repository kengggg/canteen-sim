import { readFileSync } from 'node:fs';
import type { ResearchAudit } from '../../src/research/visibility-data';
import { runVisibilityBlock } from '../../src/research/visibility';

const audit = JSON.parse(readFileSync(new URL('../../docs/studies/visibility-roles-v1-audit.json', import.meta.url), 'utf8')) as ResearchAudit;

test('all research cells reproduce their first seed with invariant checks and exact diagnostics', async () => {
  for (const door of [3, 0] as const) for (const food of [10, 20] as const) {
    const fresh = await runVisibilityBlock(door, food, 1);
    for (const run of fresh.runs) expect(run, run.id).toEqual(audit.runs.find((r) => r.id === run.id));
    for (const pair of fresh.pairs) expect(pair, pair.runA).toEqual(audit.pairs.find((p) => p.runA === pair.runA));
  }
});
