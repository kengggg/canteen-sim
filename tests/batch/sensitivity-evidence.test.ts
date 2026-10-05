import { readFileSync } from 'node:fs';
import { sensitivitySourceDigest } from '../../scripts/sensitivity-source';
import { evidenceDigest } from '../../src/batch/findings-data';
import type { Evidence } from '../../src/batch/precompute';
import { summarizePairs, type SensitivityAudit, type SensitivityStudy } from '../../src/batch/sensitivity-data';
import { STUDY_FRACTIONS, STUDY_N, STUDY_PLAN, studyPlanKey } from '../../src/batch/sensitivity-plan';
import { batchSeeds } from '../../src/batch/sweep';
import { defaultConfig } from '../../src/config/schema';
import { MODEL_VERSION } from '../../src/sim/version';

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')) as T;
const study = read<SensitivityStudy>('src/generated/sensitivity.json');
const audit = read<SensitivityAudit>('docs/studies/model-2-sensitivity-audit.json');
const evidence = read<Evidence>('src/generated/evidence.json');
const tidy = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(8)) : v));

test('embedded sensitivity results match the complete frozen plan and current numerical source', () => {
  expect(study.model).toBe(MODEL_VERSION);
  expect(study.version).toBe(1);
  expect(study.sourceDigest, 'Run npm run sensitivity after changing engine/config/study code').toBe(sensitivitySourceDigest());
  expect(audit.sourceDigest).toBe(study.sourceDigest);
  expect(study.planKey).toBe(studyPlanKey());
  expect(audit.planKey).toBe(study.planKey);
  expect(study.evidenceDigest).toBe(evidenceDigest(evidence));
  expect(study.n).toBe(STUDY_N);
  expect(study.seeds).toEqual(batchSeeds(defaultConfig().seed, STUDY_N));
  expect(study.scenarios).toBe(STUDY_PLAN.scenarios.length);
  expect(study.runs).toBe(study.scenarios * STUDY_N * 3);
  expect(audit.scenarios.map((s) => s.id)).toEqual(STUDY_PLAN.scenarios.map((s) => s.id));
  expect(study.rows.map((r) => [r.id, r.fraction])).toEqual(STUDY_PLAN.scenarios.flatMap((s) => STUDY_FRACTIONS.map((f) => [s.id, f])));
});

test('every published number is reproducible from its exact paired audit values with complete coverage', () => {
  for (const scenario of audit.scenarios) {
    expect(scenario.pairs).toHaveLength(STUDY_N * 2);
    for (const f of STUDY_FRACTIONS) {
      const pairs = scenario.pairs.filter((p) => p.fraction === f);
      expect(pairs.map((p) => p.seedIndex)).toEqual(Array.from({ length: STUDY_N }, (_, i) => i));
      expect(pairs.map((p) => p.seed)).toEqual(study.seeds);
      expect(pairs.every((p) => !p.truncated)).toBe(true);
      for (const p of pairs) for (const side of ['a', 'b'] as const) {
        expect(Object.values(p[side]).every((v) => v !== null && Number.isFinite(v))).toBe(true);
        expect(p[side].leftPct).toBeCloseTo(p[side].doorLeftPct! + p[side].queueLeftPct!, 8);
      }
      const summary = summarizePairs(scenario.id, scenario.pairs, f);
      expect(study.rows.find((r) => r.id === scenario.id && r.fraction === f)).toEqual(tidy(summary));
      expect(Object.values(summary.metrics).every((m) => m.n === STUDY_N && m.missing === 0)).toBe(true);
    }
  }
});

test('new default runs reproduce old evidence hashes and each baseline is shared only within a seed/setting', () => {
  const hashes = new Map(evidence.runs.map((r) => [r.k, r.h]));
  for (const scenario of audit.scenarios) for (let i = 0; i < STUDY_N; i++) {
    const pairs = scenario.pairs.filter((p) => p.seedIndex === i);
    expect(pairs[0].hashB).toBe(pairs[1].hashB);
    if (scenario.id === 'default') for (const p of pairs) {
      expect(p.hashA).toBe(hashes.get(`-|${p.fraction}|${i}`));
      expect(p.hashB).toBe(hashes.get(`-|0|${i}`));
    }
  }
});
