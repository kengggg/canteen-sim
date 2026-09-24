import { defaultConfig } from '../../src/config/schema';
import { runJob, aggregate } from '../../src/batch/runner';
import { reservationJobs } from '../../src/batch/sweep';
import { sentence, fmt } from '../../src/batch/wording';
import { toCsv } from '../../src/batch/csv';
import { METRIC_BY_ID } from '../../src/batch/catalog';
import { pairedStat } from '../../src/batch/stats';

test('clear-difference, no-difference and too-few sentences', () => {
  const m = METRIC_BY_ID.get('walkAwayPct')!;
  const clear = pairedStat([2, 3, 2.5, 3.5, 2, 3, 2.5, 3, 2, 3]);
  expect(sentence(m, 1, clear, { W: 10, T: 0, L: 0, n: 10 })).toBe(
    `At 100% reservation, walk-aways was ${fmt(clear.mean!, m)} percentage points better under free flow (95% CI ${fmt(clear.lo!, m)} to ${fmt(clear.hi!, m)}) across 10 paired lunches. Free flow better in 10, tied in 0, reservation better in 0.`,
  );
  const worse = pairedStat([-2, -3, -2.5, -3.5, -2, -3, -2.5, -3, -2, -3]);
  expect(sentence(m, 0.5, worse, { W: 0, T: 0, L: 10, n: 10 })).toContain('better under free flow'.replace('better', 'worse'));
  const unclear = pairedStat([1, -1, 2, -2, 0.5, -0.5, 1, -1, 0.1, -0.2]);
  expect(sentence(m, 0.25, unclear, { W: 5, T: 0, L: 5, n: 10 })).toBe('At 25% reservation, these 10 lunches show no clear difference in walk-aways.');
  const few = pairedStat([1, 2, 3]);
  expect(sentence(m, 1, few, { W: 3, T: 0, L: 0, n: 3 })).toBe(`At 100% reservation, 3 usable lunches are too few for an interval; mean difference ${fmt(2, m)} percentage points.`);
  expect(sentence(m, 1, pairedStat(new Array(10).fill(0)), { W: 0, T: 10, L: 0, n: 10 })).toBe('At 100% reservation, walk-aways was identical in all 10 lunches.');
  expect(sentence(m, 1, pairedStat(new Array(10).fill(1)), { W: 10, T: 0, L: 0, n: 10 })).toBe(`At 100% reservation, walk-aways was ${fmt(1, m)} percentage points better under free flow, the same in every lunch.`);
  const ties = pairedStat([0, 0, 0, 0, 0, 0, 1, 2, 3, 1, 2]);
  expect(sentence(m, 1, ties, { W: 5, T: 6, L: 0, n: 11 })).toMatch(/mostly ties — interval approximate/);
});

test('CSV: header comment, one row per run with every RunMetric, and pair_ rows', () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 200;
  const jobs = reservationJobs(c, 2);
  const results = jobs.map(runJob);
  const b = aggregate('reservation', jobs, results);
  const csv = toCsv(b, c, { model: 1, sha: 'abc1234', exportedAt: '2026-09-24T12:00:00.000Z' });
  const lines = csv.trimEnd().split('\n');
  expect(lines[0]).toBe('# Canteen Sim batch export');
  expect(lines).toContain('# model 1, build abc1234, exported 2026-09-24T12:00:00.000Z');
  expect(lines.find((l) => l.startsWith('# settings '))).toBe(`# settings ${JSON.stringify(c)}`);
  const header = lines.find((l) => !l.startsWith('#'))!.split(',');
  const rows = lines.filter((l) => !l.startsWith('#')).slice(1).map((l) => l.split(','));
  expect(rows.filter((r) => r[0] === 'run')).toHaveLength(10);
  expect(rows.filter((r) => r[0] === 'pair')).toHaveLength(8);
  for (const col of ['walkAwayPct', 'entranceToSeatMeanMin', 'peakThroughputPerHour', 'runHash', 'bySize_s3_people', 'splitFeasibleGroups_s2', 'pair_peakWindowStart', 'pair_p3Level', 'pair_cohortR_level_walkAwayPct', 'pair_cohortRfallback_baseline_foodToSeatMeanMin']) {
    expect(header).toContain(col);
  }
  const r0 = rows.find((r) => r[0] === 'run')!;
  const run0 = results[0];
  expect(r0[header.indexOf('walkAwayPct')]).toBe(String(run0.metrics.walkAwayPct));
  expect(r0[header.indexOf('runHash')]).toBe(String(run0.hash));
  expect(r0[header.indexOf('isLiveSeed')]).toBe('true');
  const p0 = rows.find((r) => r[0] === 'pair')!;
  expect(p0[header.indexOf('walkAwayPct')]).toBe('');
});
