import { runStudyScenario, studyJobs } from '../../src/batch/sensitivity';
import { leavingConclusion, summarizePairs, type StudyPair } from '../../src/batch/sensitivity-data';
import { scenarioConfig, STUDY_PLAN, studySettingsKey } from '../../src/batch/sensitivity-plan';
import { defaultConfig } from '../../src/config/schema';
import { validate } from '../../src/config/validate';

test('study cases are valid, unique, and retain complete interaction grids with paired seeds', () => {
  const configs = STUDY_PLAN.scenarios.map(scenarioConfig);
  expect(new Set(configs.map(studySettingsKey)).size).toBe(configs.length);
  for (const cfg of configs) expect(validate(cfg).blocking).toEqual([]);
  for (const [id, count] of [['doorCrowd', 12], ['doorPatience', 6], ['doorService', 6], ['splitParallel', 6]] as const) {
    expect(STUDY_PLAN.families.find((f) => f.id === id)!.scenarios).toHaveLength(count);
  }
  const jobs = studyJobs(STUDY_PLAN.scenarios[0], 3);
  for (let i = 0; i < 3; i++) {
    expect(jobs.slice(i * 3, i * 3 + 3).map((j) => j.fraction)).toEqual([0, 0.5, 1]);
    expect(new Set(jobs.slice(i * 3, i * 3 + 3).map((j) => j.seed)).size).toBe(1);
  }
  expect(scenarioConfig(STUDY_PLAN.scenarios[0])).toEqual(defaultConfig());
});

test('summary pairs before averaging, handles truncated pairs, and never implies equivalence', () => {
  const pairs: StudyPair[] = Array.from({ length: 10 }, (_, i) => {
    const a = { leftPct: i * 10 + i % 2, plateSeconds: 20, seatUsePct: 50, throughput: 100, doorLeftPct: 1, queueLeftPct: 1 };
    return { seedIndex: i, seed: i, fraction: 1, hashA: i, hashB: i, truncated: false, a, b: { ...a, leftPct: i * 10 } };
  });
  const row = summarizePairs('test', pairs, 1);
  expect(row.metrics.leftPct.delta).toBe(0.5);
  expect(row.metrics.leftPct.lo).toBeGreaterThan(0);
  expect(leavingConclusion(row.metrics.leftPct)).toBe('More leave with reservation');
  expect(leavingConclusion(row.metrics.plateSeconds)).toBe('No difference in these lunches');
  expect(row.metrics.plateSeconds.lo).toBeNull();
  pairs[0].truncated = true;
  expect(summarizePairs('test', pairs, 1).metrics.leftPct).toMatchObject({ n: 9, missing: 1, lo: null, hi: null });
  expect(leavingConclusion(summarizePairs('test', pairs, 1).metrics.leftPct)).toBe('Incomplete comparison');
  expect(leavingConclusion({ ...row.metrics.leftPct, lo: -0.1, hi: 0.7 })).toBe('No clear difference in leaving');
  expect(leavingConclusion({ ...row.metrics.leftPct, delta: -0.5, lo: -0.7, hi: -0.1 })).toBe('Fewer leave with reservation');
});

test('small real runs preserve paired identity and leaving decomposes into door plus queue', async () => {
  const pairs = await runStudyScenario({ id: 'small', label: 'test only', changes: [['crowd.totalPeople', 100]] }, 2);
  expect(pairs).toHaveLength(4);
  for (const p of pairs) {
    expect(p.truncated).toBe(false);
    expect(p.a.leftPct).toBeCloseTo(p.a.doorLeftPct! + p.a.queueLeftPct!, 8);
    expect(p.b.leftPct).toBeCloseTo(p.b.doorLeftPct! + p.b.queueLeftPct!, 8);
  }
  expect(pairs[0].hashB).toBe(pairs[1].hashB);
  expect(pairs[0].seed).toBe(pairs[1].seed);
});
