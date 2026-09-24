import { defaultConfig } from '../../src/config/schema';
import { METRIC_BY_ID } from '../../src/batch/catalog';
import { toCsv } from '../../src/batch/csv';
import { SlicedExecutor, runBatch } from '../../src/batch/executors';
import { decodeEvidence, encodeEvidence, evidenceDiff, type Evidence } from '../../src/batch/precompute';
import { aggregate, runJob } from '../../src/batch/runner';
import { pairedStat } from '../../src/batch/stats';
import { reservationJobs, sensitivityJobs } from '../../src/batch/sweep';
import { fmt, sentence } from '../../src/batch/wording';

const small = () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  return c;
};
const jobs = reservationJobs(small(), 3);
const results = jobs.map(runJob);
const b = aggregate('reservation', jobs, results);

test('F1: a "worse" sentence prints the interval with the same sign as its magnitude', () => {
  const m = METRIC_BY_ID.get('queueWaitMeanMin')!;
  const worse = pairedStat([-2, -3, -2.5, -3.5, -2, -3, -2.5, -3, -2, -3]);
  expect(sentence(m, 1, worse, null)).toContain(`worse under free flow (95% CI ${fmt(-worse.hi!, m)} to ${fmt(-worse.lo!, m)})`);
});

test('F6: the P1 headline reads as a rate, and throughput reads per hour', () => {
  const clear = pairedStat([2, 3, 2.5, 3.5, 2, 3, 2.5, 3, 2, 3]);
  expect(sentence(METRIC_BY_ID.get('walkAwayPct')!, 1, clear, null)).toMatch(/^At 100% reservation, the walk-away rate was /);
  expect(sentence(METRIC_BY_ID.get('peakThroughputPerHour')!, 1, pairedStat([10, 12, 11, 9, 10, 12, 11, 9, 10, 11]), null)).toMatch(/people per hour better/);
});

test('F7: a non-zero interval bound never prints as 0', () => {
  const m = METRIC_BY_ID.get('peakThroughputPerHour')!;
  const s = pairedStat([0.2, 0.4, 0.3, 0.5, 0.3, 0.2, 0.4, 0.3, 0.4, 0.3]);
  const text = sentence(m, 1, s, null);
  expect(text).not.toMatch(/CI 0 to|CI 0\.0+ to| to 0\)| to 0\.0+\)/);
});

test('F3: evidence keeps every RunMetric (except per-stall counts) and decodes them', () => {
  const ev = JSON.parse(JSON.stringify(encodeEvidence(b, small()))) as Evidence;
  const d = decodeEvidence(ev);
  const r0 = results[4].metrics, d0 = d.runs[4].metrics;
  expect(d0.seated).toBe(r0.seated);
  expect(d0.arrivals).toBe(r0.arrivals);
  expect(d0.bySize).toEqual(r0.bySize.map((x) => ({ ...x, walkAwayPct: x.walkAwayPct === null ? null : Number(x.walkAwayPct.toPrecision(7)), entranceToSeatMeanMin: x.entranceToSeatMeanMin === null ? null : Number(x.entranceToSeatMeanMin.toPrecision(7)), foodToSeatMeanMin: x.foodToSeatMeanMin === null ? null : Number(x.foodToSeatMeanMin.toPrecision(7)) })));
  expect(d0.openToSmallDuringDemand).toBeCloseTo(r0.openToSmallDuringDemand, 6);
  expect(d0.eventsPerKind).toEqual(r0.eventsPerKind);
});

test('F2: evidenceDiff finds a stale PairMetric that the run hashes would miss', () => {
  const ev = encodeEvidence(b, small());
  const stale = JSON.parse(JSON.stringify(ev)) as Evidence;
  expect(evidenceDiff(ev, stale)).toBeNull();
  stale.pairs[2].p3[0] += 0.001;
  expect(evidenceDiff(ev, stale)).toMatch(/pairs\.2\.p3/);
});

test('F4: the CSV writes the effective shareMinEmpty of each run in a shareMinEmpty sweep', () => {
  const r = sensitivityJobs(small(), 2, 'reserve.shareMinEmpty', [2, 3, 6]);
  if ('error' in r) throw new Error(r.error);
  const bb = aggregate('sensitivity', r.jobs, r.jobs.map(runJob), 'reserve.shareMinEmpty');
  const lines = toCsv(bb, small(), { model: 1, sha: 'x', exportedAt: 't' }).split('\n').filter((l) => l.startsWith('run,'));
  const header = toCsv(bb, small(), { model: 1, sha: 'x', exportedAt: 't' }).split('\n').find((l) => l.startsWith('row,'))!.split(',');
  const col = header.indexOf('effectiveShareMinEmpty'), val = header.indexOf('sweepValue');
  for (const l of lines) {
    const cells = l.split(',');
    expect(cells[col]).toBe(cells[val]);
  }
});

test('F5: cohort and group-size breakdowns get paired statistics with the same seed dropping', () => {
  const s = b.cohortStats.find((x) => x.fraction === 1 && x.cohort === 'R' && x.metric === 'walkAwayPct')!;
  const pm = b.pairs.find((p) => p.fraction === 1 && p.seedIndex === 0)!.pm;
  expect(s.a[0]).toBe(pm.cohorts.R.level.walkAwayPct);
  expect(s.b[0]).toBe(pm.cohorts.R.baseline.walkAwayPct);
  expect(s.adv.n).toBe(3);
  const z = b.sizeStats.find((x) => x.fraction === 0.5 && x.size === 2 && x.metric === 'entranceToSeatMeanMin')!;
  const A = results.find((r) => r.fraction === 0.5 && r.seedIndex === 1)!, B0 = results.find((r) => r.fraction === 0 && r.seedIndex === 1)!;
  expect(z.a[1]).toBe(A.metrics.bySize[1].entranceToSeatMeanMin);
  expect(z.b[1]).toBe(B0.metrics.bySize[1].entranceToSeatMeanMin);
  const copy = results.map((r) => ({ ...r, metrics: { ...r.metrics } }));
  copy.find((r) => r.fraction === 0 && r.seedIndex === 2)!.metrics.truncated = true;
  const t = aggregate('reservation', jobs, copy);
  expect(t.cohortStats.find((x) => x.fraction === 1 && x.cohort === 'N' && x.metric === 'walkAwayPct')!.a[2]).toBeNull();
  expect(t.sizeStats.find((x) => x.fraction === 1 && x.size === 1 && x.metric === 'walkAwayPct')!.a[2]).toBeNull();
});

test('F8: a hidden page waits on the slow timer, not the message loop', async () => {
  let waits = 0, checks = 0;
  const ex = new SlicedExecutor({ yieldFn: async () => {}, waitHidden: async () => { waits++; } });
  await runBatch(jobs.slice(0, 1), ex, { cancelled: false, hidden: () => ++checks <= 7 });
  expect(waits).toBeGreaterThanOrEqual(6);
  const plain = new SlicedExecutor({ yieldFn: async () => {}, waitHidden: async () => { waits++; } });
  const before = waits;
  await runBatch(jobs.slice(0, 1), plain, { cancelled: false });
  expect(waits).toBe(before);
});

test('F9: out-of-range, dependent-range and duplicate sweep values are refused by name', () => {
  const c = small();
  const bad = (setting: string, values: number[]) => sensitivityJobs(c, 2, setting, values);
  expect('error' in bad('crowd.peakTime', [600, 700, 720]) && (bad('crowd.peakTime', [600, 700, 720]) as { error: string }).error).toMatch(/600/);
  expect('error' in bad('crowd.windowEnd', [665, 700, 720])).toBe(true);
  expect('error' in bad('layout.queueDepth', [2, 5, 6])).toBe(true);
  expect('error' in bad('layout.seatsPerSide', [2, 3, 5])).toBe(true);
  expect('error' in bad('stalls.serviceMean', [60, 60, 90])).toBe(true);
  expect('error' in bad('stalls.serviceMean', [45, 60, 90])).toBe(false);
});
