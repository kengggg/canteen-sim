import { defaultConfig } from '../../src/config/schema';
import { runJob, aggregate } from '../../src/batch/runner';
import { reservationJobs } from '../../src/batch/sweep';
import { createEngine, pairMetrics } from '../../src/sim/engine';

const small = () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 400;
  return c;
};

const jobs = reservationJobs(small(), 3);
const results = jobs.map(runJob);

test('runJob equals a direct engine run', () => {
  const j = jobs[7];
  const e = createEngine(j.cfg, { seed: j.seed, reserveFraction: j.fraction });
  e.advanceTo(Infinity);
  expect(results[7].hash).toBe(e.runHash());
  expect(results[7].metrics).toEqual(e.metrics());
});

test('aggregation pairs each level with its baseline seed and computes stats for non-baseline levels only', () => {
  const b = aggregate('reservation', jobs, results);
  expect(b.pairs).toHaveLength(4 * 3);
  expect(b.stats.some((s) => s.fraction === 0)).toBe(false);
  const p1 = b.stats.find((s) => s.fraction === 1 && s.metricId === 'walkAwayPct')!;
  expect(p1.adv.n).toBe(3);
  const at = (f: number, i: number) => results.find((r) => r.fraction === f && r.seedIndex === i)!;
  const expected = at(1, 0).metrics.walkAwayPct! - at(0, 0).metrics.walkAwayPct!;
  expect(p1.a[0]! - p1.b[0]!).toBeCloseTo(expected, 12);
  // P3 uses the pair's own window.
  const pm = pairMetrics(at(0.5, 1).pair, at(0, 1).pair, 0.5);
  const p3 = b.stats.find((s) => s.fraction === 0.5 && s.metricId === 'peakUtilization')!;
  expect(p3.a[1]).toBe(pm.p3Level);
  expect(p3.b[1]).toBe(pm.p3Baseline);
});

test('a truncated run drops its seed from that level’s statistics', () => {
  const copy = results.map((r) => ({ ...r, metrics: { ...r.metrics } }));
  copy.find((r) => r.fraction === 0.25 && r.seedIndex === 2)!.metrics.truncated = true;
  const b = aggregate('reservation', jobs, copy);
  const s = b.stats.find((x) => x.fraction === 0.25 && x.metricId === 'walkAwayPct')!;
  expect(s.adv.nUsed).toBe(2);
  expect(b.truncated.find((t) => t.fraction === 0.25)!.count).toBe(1);
  expect(b.stats.find((x) => x.fraction === 0.5 && x.metricId === 'walkAwayPct')!.adv.nUsed).toBe(3);
});
