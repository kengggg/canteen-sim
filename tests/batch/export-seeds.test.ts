import { readFileSync } from 'node:fs';
import { toCsv } from '../../src/batch/csv';
import { decodeEvidence, encodeEvidence, type Evidence } from '../../src/batch/precompute';
import { aggregate, runJob } from '../../src/batch/runner';
import { batchSeeds, reservationJobs } from '../../src/batch/sweep';
import { defaultConfig } from '../../src/config/schema';

/** Column values of every row of one kind in a CSV export. */
function column(csv: string, row: 'run' | 'pair', name: string): string[] {
  const lines = csv.trimEnd().split('\n').filter((l) => !l.startsWith('#'));
  const header = lines[0].split(',');
  return lines.slice(1).map((l) => l.split(',')).filter((r) => r[0] === row).map((r) => r[header.indexOf(name)]);
}

test('decoded evidence keeps each run’s exact seed, not a 7-significant-digit rounding', () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  const jobs = reservationJobs(c, 3);
  const ev = JSON.parse(JSON.stringify(encodeEvidence(aggregate('reservation', jobs, jobs.map(runJob)), c))) as Evidence;
  const d = decodeEvidence(ev);
  expect(d.runs.map((r) => r.metrics.seed)).toEqual(jobs.map((j) => j.seed));
  expect(d.runs.some((r) => r.seed > 9_999_999)).toBe(true);
});

test('the CSV of the shipped evidence names every run’s true seed (a seed typed from a run row replays that lunch)', () => {
  const ev = JSON.parse(readFileSync(new URL('../../src/generated/evidence.json', import.meta.url), 'utf8')) as Evidence;
  const csv = toCsv(decodeEvidence(ev), defaultConfig(), { model: 1, sha: 'abc1234', exportedAt: '2026-09-25T00:00:00.000Z' });
  const seeds = batchSeeds(1, 30).map(String);
  const runSeeds = column(csv, 'run', 'seed');
  const runIndex = column(csv, 'run', 'seedIndex').map(Number);
  expect(runSeeds).toHaveLength(150);
  expect(runSeeds).toEqual(runIndex.map((i) => seeds[i - 1]));
  expect(column(csv, 'pair', 'seed')).toEqual(column(csv, 'pair', 'seedIndex').map((i) => seeds[Number(i) - 1]));
});
