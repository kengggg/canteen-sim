import { readFileSync } from 'node:fs';
import { collectRun, EMPTY_TABLE_MINUTES, SEAT_CATS, sweepFigures } from '../../src/batch/findings';
import { evidenceDigest, LEVEL_KEYS, RESERVE_LEVEL_KEYS, type Findings, type FindingStat } from '../../src/batch/findings-data';
import { decodeEvidence, type Evidence } from '../../src/batch/precompute';
import { runJob } from '../../src/batch/runner';
import { defaultConfig } from '../../src/config/schema';
import { STATES } from '../../src/sim/metrics';
import { pairMetrics } from '../../src/sim/pairmetrics';
import type { RunMetrics } from '../../src/sim/runmetrics';
import { SEAT } from '../../src/sim/seating';
import { MODEL_VERSION } from '../../src/sim/version';

const read = <T>(name: string) => JSON.parse(readFileSync(new URL(`../../src/generated/${name}`, import.meta.url), 'utf8')) as T;
const evidence = read<Evidence>('evidence.json');
const findings = read<Findings>('findings.json');

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;
/** |x − y| within `tol` (absolute below 1, relative above). */
const near = (x: number, y: number, tol: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(y)));

test('the shipped findings are current: model version and evidence digest', () => {
  expect(findings.model).toBe(MODEL_VERSION);
  expect(findings.evidenceDigest).toBe(evidenceDigest(evidence));
  expect(findings.n).toBe(evidence.n);
  expect(Object.keys(findings.emptyTables.byLevel).sort()).toEqual([...LEVEL_KEYS].sort());
  for (const k of LEVEL_KEYS) expect(findings.emptyTables.byLevel[k]).toHaveLength(EMPTY_TABLE_MINUTES + 1);
});

describe('the shipped findings agree with the shipped evidence', () => {
  const d = decodeEvidence(evidence);
  const metricsAt = (f: number): RunMetrics[] => d.runs.filter((r) => r.fraction === f).map((r) => r.metrics);
  const pairsAt = (f: number) => d.pairs.filter((p) => p.fraction === f).map((p) => p.pm);
  const stat = (id: string, f: number) => d.stats.find((s) => s.metricId === id && s.fraction === f)!;

  test('claimed and reserving groups per lunch', () => {
    for (const k of RESERVE_LEVEL_KEYS) {
      const c = findings.claims.byLevel[k], m = metricsAt(Number(k)), n = findings.n;
      near(sum(c.bins.map((b) => b.claimed)) / n, mean(m.map((x) => x.claimedGroups)), 1e-9);
      near(sum(c.bins.map((b) => b.reserving)) / n, mean(m.map((x) => x.reservingGroups)), 1e-9);
      near(c.rush.claimsBefore + c.rush.claimsRush + c.rush.claimsAfter, mean(m.map((x) => x.claimedGroups)), 1e-5);
    }
  });

  test('walk-away groups and split-feasible walk-aways', () => {
    for (const k of LEVEL_KEYS) {
      const w = findings.walkAways[k], m = metricsAt(Number(k));
      expect(w.groups).toBe(sum(m.map((x) => x.walkAwayGroups)));
      expect(w.oneTableFit + w.scatteredOnly).toBe(sum(m.map((x) => x.splitFeasibleGroups)));
      expect(w.oneTableFit + w.scatteredOnly + w.tooFew).toBe(w.groups);
    }
  });

  test('busiest-hour reserved seats split into parts that add up to the evidence shares', () => {
    for (const k of RESERVE_LEVEL_KEYS) {
      const s = findings.peakSeats[k], pms = pairsAt(Number(k));
      near(s.claimedEmptyBeyondSize + s.claimedEmptyWaiting, mean(pms.map((p) => p.sharesLevel[SEAT.CLAIMED_EMPTY])), 2e-6);
      near(s.blockedNoJoiners + s.blockedAfterJoiners, mean(pms.map((p) => p.sharesLevel[SEAT.BLOCKED])), 2e-6);
      expect(s.baselineHeldNoFood).toBeLessThanOrEqual(mean(pms.map((p) => p.sharesBaseline[SEAT.HELD])) + 1e-6);
    }
  });

  test('time totals: entrance-to-seat advantage and baseline queue wait', () => {
    for (const k of RESERVE_LEVEL_KEYS) {
      const t = findings.time.byLevel[k];
      near(t.totalS, stat('entranceToSeatMeanMin', Number(k)).adv.mean! * 60, 5e-4);
      near(t.toQueueS + t.queueAndServiceS + t.afterServiceS, t.totalS, 1e-4);
    }
    near(findings.time.baseline.queueWaitS, mean(metricsAt(0).map((x) => x.queueWaitMeanMin!)) * 60, 1e-4);
  });

  test('the default robustness row is the evidence at 100% vs 0%', () => {
    const row = findings.robustness[0];
    expect(row.id).toBe('default');
    expect(row.changes).toEqual([]);
    const check = (got: FindingStat, id: string, scale: number) => {
      const s = stat(id, 1);
      for (const [x, y] of [[got.a, s.meanA!], [got.b, s.meanB!], [got.adv, s.adv.mean!], [got.lo, s.adv.lo!], [got.hi, s.adv.hi!]]) near(x, y * scale, 2e-5);
      expect([got.W, got.T, got.L]).toEqual([s.wins!.W, s.wins!.T, s.wins!.L]);
    };
    check(row.walkAway, 'walkAwayPct', 1);
    check(row.e2sMin, 'entranceToSeatMeanMin', 1);
    check(row.peakUtilPct, 'peakUtilization', 100);
    check(row.peakThroughput, 'peakThroughputPerHour', 1);
  });
});

test('instrumented runs reproduce plain runs, and their figures add up', () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  c.layout.rows = 2; // 20 tables: claims, fallbacks and all three kinds of walk-away
  const n = 2;
  const s = sweepFigures(c, n, [0, 0.5]);
  const byKey = new Map(s.results.map((r) => [r.key, r]));
  for (const job of s.jobs) {
    const plain = runJob(job);
    expect(byKey.get(job.key)!.hash).toBe(plain.hash);
    expect(byKey.get(job.key)!.metrics).toEqual(plain.metrics);
  }
  const at = (f: number) => s.results.filter((r) => r.fraction === f).sort((a, b) => a.seedIndex - b.seedIndex);

  // Claims: the bins hold every reserving group once.
  const lv = s.levels['0.5'];
  const claims = lv.claims!;
  expect(sum(claims.bins.map((b) => b.reserving))).toBe(sum(at(0.5).map((r) => r.metrics.reservingGroups)));
  expect(sum(claims.bins.map((b) => b.claimed))).toBe(sum(at(0.5).map((r) => r.metrics.claimedGroups)));
  expect((claims.rush.claimsBefore + claims.rush.claimsRush + claims.rush.claimsAfter) * n).toBeCloseTo(sum(claims.bins.map((b) => b.claimed)), 9);

  // Walk-aways: every walk-away group is classified once, and the classes agree with the engine's split-feasible flag.
  for (const f of [0, 0.5]) {
    const w = s.levels[String(f)].walkAways;
    expect(w.oneTableFit + w.scatteredOnly + w.tooFew).toBe(w.groups);
    expect(w.groups).toBe(sum(at(f).map((r) => r.metrics.walkAwayGroups)));
    expect(w.oneTableFit + w.scatteredOnly).toBe(sum(at(f).map((r) => r.metrics.splitFeasibleGroups)));
  }
  expect(s.levels['0'].walkAways.groups + lv.walkAways.groups).toBeGreaterThan(0);

  // Time: the three parts add up to the total, which is the change in mean entrance-to-seat.
  const t = lv.time!;
  near(t.toQueueS + t.queueAndServiceS + t.afterServiceS, t.totalS, 1e-9);
  const e2s = at(0.5).map((r, i) => (r.metrics.entranceToSeatMeanMin! - at(0)[i].metrics.entranceToSeatMeanMin!) * 60);
  near(t.totalS, mean(e2s), 1e-9);
  expect(t.totalWithoutCutoffS).toBeGreaterThanOrEqual(t.totalS - 1e-9);

  // Peak split: the parts add up to the pair's own shares.
  const pms = at(0.5).map((r, i) => pairMetrics(r.pair, at(0)[i].pair, 0.5));
  const p = lv.peakSeats!;
  near(p.claimedEmptyBeyondSize + p.claimedEmptyWaiting, mean(pms.map((x) => x.sharesLevel[SEAT.CLAIMED_EMPTY])), 1e-12);
  near(p.blockedNoJoiners + p.blockedAfterJoiners, mean(pms.map((x) => x.sharesLevel[SEAT.BLOCKED])), 1e-12);

  // Seat categories add up to the seat clock's own per-minute bins, minute by minute.
  const r = collectRun(s.jobs.find((j) => j.key === '-|0.5|0')!);
  const bins = r.result.pair.bins, K = SEAT_CATS.length;
  for (let m = 0; m * STATES < bins.length; m++) {
    expect(r.seatCatBins[m * K] + r.seatCatBins[m * K + 1]).toBe(bins[m * STATES + SEAT.CLAIMED_EMPTY]);
    expect(r.seatCatBins[m * K + 2] + r.seatCatBins[m * K + 3]).toBe(bins[m * STATES + SEAT.BLOCKED]);
    expect(r.seatCatBins[m * K + 4]).toBeLessThanOrEqual(bins[m * STATES + SEAT.HELD]);
  }
  for (const f of [0, 0.5]) for (const x of s.levels[String(f)].emptyTables) expect(x >= 0 && x <= 20).toBe(true);
});
