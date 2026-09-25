import { defaultConfig } from '../../src/config/schema';
import { hash4 } from '../../src/sim/rng';
import { batchSeeds, reservationJobs, sensitivityJobs, RESERVATION_LEVELS, SWEEPABLE, getSetting } from '../../src/batch/sweep';
import { CATALOG, PRIMARY } from '../../src/batch/catalog';

test('batch seeds: seed_1 = seed, seed_i = h(seed, 11, i, 0)', () => {
  const s = batchSeeds(7, 5);
  expect(s[0]).toBe(7);
  for (let i = 2; i <= 5; i++) expect(s[i - 1]).toBe(hash4(7, 11, i, 0));
});

test('reservation sweep: 5 levels × n seeds, baseline 0 first', () => {
  expect(RESERVATION_LEVELS).toEqual([0, 0.25, 0.5, 0.75, 1]);
  const jobs = reservationJobs(defaultConfig(), 3);
  expect(jobs).toHaveLength(15);
  expect(new Set(jobs.map((j) => j.key)).size).toBe(15);
  expect(jobs.filter((j) => j.fraction === 0)).toHaveLength(3);
});

test('sensitivity sweep: values × 2 × n, using percentA (or 1.0 when it is 0)', () => {
  const c = defaultConfig();
  const r = sensitivityJobs(c, 4, 'stalls.serviceMean', [45, 60, 90, 120]);
  if ('error' in r) throw new Error(r.error);
  expect(r.jobs).toHaveLength(4 * 2 * 4);
  expect(new Set(r.jobs.map((j) => j.fraction))).toEqual(new Set([0, 0.5]));
  for (const j of r.jobs) expect(getSetting(j.cfg, 'stalls.serviceMean')).toBe(j.value);
  c.reserve.percentA = 0;
  const r0 = sensitivityJobs(c, 2, 'stalls.serviceMean', [45, 60, 90]);
  if ('error' in r0) throw new Error(r0.error);
  expect(new Set(r0.jobs.map((j) => j.fraction))).toEqual(new Set([0, 1]));
});

test('a blocked value stops the sweep with a message naming it; excluded settings are refused', () => {
  const r = sensitivityJobs(defaultConfig(), 2, 'layout.stallCount', [10, 20, 40]);
  expect('error' in r && r.error).toMatch(/value 40/);
  expect('error' in sensitivityJobs(defaultConfig(), 2, 'seed', [1, 2, 3])).toBe(true);
  expect('error' in sensitivityJobs(defaultConfig(), 2, 'reserve.percentA', [0.1, 0.2, 0.3])).toBe(true);
  expect('error' in sensitivityJobs(defaultConfig(), 2, 'stalls.serviceMean', [45, 60])).toBe(true); // < 3 values
  expect(SWEEPABLE.some((s) => s.id === 'crowd.groupMix')).toBe(false);
});

test('a seatsPerSide sweep clamps shareMinEmpty per value and warns when sharing is disabled', () => {
  const c = defaultConfig();
  c.reserve.shareMinEmpty = 6;
  c.crowd.groupMix = [25, 30, 20, 15, 0, 0];
  const r = sensitivityJobs(c, 2, 'layout.seatsPerSide', [2, 3, 4]);
  if ('error' in r) throw new Error(r.error);
  const at2 = r.jobs.find((j) => j.value === 2)!;
  expect(at2.cfg.reserve.shareMinEmpty).toBe(4);
  expect(r.warnings.join(' ')).toMatch(/sharing/i);
});

test('catalogue: P1–P4 are primary with the right direction', () => {
  expect(PRIMARY.map((m) => [m.id, m.better])).toEqual([['walkAwayPct', 'lower'], ['entranceToSeatMeanMin', 'lower'], ['peakUtilization', 'higher'], ['peakThroughputPerHour', 'higher']]);
  expect(CATALOG.filter((m) => m.cls === 'diagnostic').every((m) => m.better === null)).toBe(true);
  expect(new Set(CATALOG.map((m) => m.id)).size).toBe(CATALOG.length);
});
