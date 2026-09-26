import { readFileSync } from 'node:fs';
import { collectRun, EMPTY_TABLE_MINUTES, SEAT_CATS, settingChanges, sweepFigures, VARIANTS } from '../../src/batch/findings';
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
  const stale = 'src/generated/findings.json is stale: run npm run findings';
  expect(findings.model, stale).toBe(MODEL_VERSION);
  expect(findings.evidenceDigest, `${stale} (it was computed against other evidence)`).toBe(evidenceDigest(evidence));
  expect(findings.n, stale).toBe(evidence.n);
  expect(Object.keys(findings.emptyTables.byLevel).sort()).toEqual([...LEVEL_KEYS].sort());
  for (const k of LEVEL_KEYS) expect(findings.emptyTables.byLevel[k]).toHaveLength(EMPTY_TABLE_MINUTES + 1);
  for (const k of LEVEL_KEYS) expect(findings.platesWithoutSeat.byLevel[k]).toHaveLength(EMPTY_TABLE_MINUTES + 1);
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

  test('people who left without eating, by where and why, match the evidence counts', () => {
    for (const k of LEVEL_KEYS) {
      const l = findings.leavers[k], m = metricsAt(Number(k));
      expect(l.arrivals).toBe(sum(m.map((x) => x.arrivals)));
      expect(l.doorQueues).toBe(sum(m.map((x) => x.leftDoorQueues)));
      expect(l.doorSeating).toBe(sum(m.map((x) => x.leftDoorSeating)));
      expect(l.doorBoth).toBe(sum(m.map((x) => x.leftDoorBoth)));
      expect(l.queue).toBe(sum(m.map((x) => x.leftQueue)));
      expect(sum(l.bins.map((b) => b.arrivals))).toBe(l.arrivals);
      expect(sum(l.bins.map((b) => b.door))).toBe(l.doorQueues + l.doorSeating + l.doorBoth);
      expect(sum(l.bins.map((b) => b.queue))).toBe(l.queue);
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

  test('time: the parts add up, and the baseline trip matches the evidence', () => {
    // The level parts pair each person who ate in both runs, so they have no evidence counterpart (people who leave
    // differ between the runs); the baseline trip is over everyone who ate, like the evidence means.
    for (const k of RESERVE_LEVEL_KEYS) {
      const t = findings.time.byLevel[k];
      near(t.toQueueS + t.queueAndServiceS + t.afterServiceS, t.totalS, 1e-4);
    }
    const b = findings.time.baseline;
    near(b.queueWaitS, mean(metricsAt(0).map((x) => x.queueWaitMeanMin!)) * 60, 1e-4);
    near(b.toQueueS + b.queueAndServiceS + b.afterServiceS, mean(metricsAt(0).map((x) => x.entranceToSeatMeanMin!)) * 60, 1e-4);
  });

  test('fallback left % is the pooled left % of the evidence cohort of reservers who found no table', () => {
    for (const k of RESERVE_LEVEL_KEYS) {
      const cs = pairsAt(Number(k)).map((p) => p.cohorts.Rfallback.level);
      const pooled = sum(cs.map((c) => c.people * (c.leftPct ?? 0))) / sum(cs.map((c) => c.people));
      near(findings.claims.byLevel[k].fallbackLeftPct, pooled, 1e-5);
    }
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
    check(row.left, 'leftPct', 1);
    check(row.plate, 'plateMeanMin', 1);
    check(row.peakUtilPct, 'peakUtilization', 100);
    check(row.peakThroughput, 'peakThroughputPerHour', 1);
  });
});

test('the robustness rows are the VARIANTS settings, in order, with their labels and setting changes', () => {
  expect(findings.robustness.map((r) => r.id)).toEqual(VARIANTS.map((v) => v.id));
  VARIANTS.forEach((v, i) => {
    const stale = `findings.json robustness row ${v.id} no longer matches VARIANTS or the presets: run npm run findings`;
    expect(findings.robustness[i].label, stale).toBe(v.label);
    expect(findings.robustness[i].changes, stale).toEqual(settingChanges(v.make()));
  });
});

test('instrumented runs reproduce plain runs, and their figures add up', () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  c.layout.rows = 2; // 20 tables: claims, fallbacks, splits, and leaving at the door and from queues
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

  // Leavers: every arrival counted once, and the kinds agree with the engine's counters.
  for (const f of [0, 0.5]) {
    const l = s.levels[String(f)].leavers;
    expect(l.arrivals).toBe(sum(at(f).map((r) => r.metrics.arrivals)));
    expect(l.doorQueues + l.doorSeating + l.doorBoth + l.queue).toBe(sum(at(f).map((r) => r.metrics.leftPeople)));
  }
  expect(s.levels['0.5'].leavers.doorQueues + s.levels['0.5'].leavers.doorSeating + s.levels['0.5'].leavers.doorBoth).toBeGreaterThan(0);

  // Time: the three parts add up to the total, the mean paired change in entrance-to-seat of people who ate in both runs.
  const t = lv.time!;
  near(t.toQueueS + t.queueAndServiceS + t.afterServiceS, t.totalS, 1e-9);
  const paired = at(0.5).map((r, i) => {
    const a = r.pair.e2sMs, z = at(0)[i].pair.e2sMs;
    let d = 0, k = 0;
    for (let p = 0; p < a.length; p++) if (a[p] >= 0 && z[p] >= 0) { d += a[p] - z[p]; k++; }
    return d / k / 1000;
  });
  near(t.totalS, mean(paired), 1e-9);

  // Plates without a seat: per-minute counts never exceed the run's peak.
  for (const f of [0, 0.5]) {
    const peak = Math.max(...at(f).map((r) => r.metrics.peakPlatesWithoutSeat));
    for (const x of s.levels[String(f)].platesWithoutSeat) expect(x >= 0 && x <= peak).toBe(true);
  }

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
