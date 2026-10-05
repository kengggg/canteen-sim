import { validate } from '../config/validate';
import { Sim } from '../sim/engine';
import { pairMetrics } from '../sim/pairmetrics';
import { SEAT } from '../sim/seating';
import { STATES } from '../sim/metrics';
import type { Values } from '../batch/sensitivity-data';
import type { ResearchDiagnostics, ResearchPair, ResearchRun } from './visibility-data';
import { RESEARCH_FRACTIONS, RESEARCH_VERSION, RESEARCH_N, researchSeeds, visibilityConfig, VISIBILITY_CASES, type VisibilityCase } from './visibility-plan';

/** The only caller of the research engine option. The application remains on createEngine/Model 2. */
export function runVisibility(c: VisibilityCase, fraction: number, seedIndex: number, seed: number) {
  const cfg = visibilityConfig(c);
  cfg.seed = seed;
  const errors = validate(cfg).blocking;
  if (errors.length) throw new Error(errors.map((e) => e.message).join(' '));
  const sim = new Sim(cfg, { seed, reserveFraction: fraction, researchVisibility: { version: RESEARCH_VERSION, claimer: c.claimer, foodSearcher: c.foodSearcher } });
  sim.advanceTo(Infinity);
  if (sim.truncated) throw new Error(`Truncated research run: ${c.id}/${fraction}/${seed}`);
  const w = sim.world;
  const m = sim.metrics();
  const admitted = w.groups.filter((g) => g.reserver && g.claimer >= 0).length;
  let unavailableMs = 0;
  for (let minute = 0; minute < w.T / 60_000; minute++) {
    for (const state of [SEAT.CLAIMED_EMPTY, SEAT.HELD, SEAT.BLOCKED]) unavailableMs += w.clock.bins[minute * STATES + state];
  }
  const diagnostics: ResearchDiagnostics = {
    admittedReservingGroups: admitted, claimedGroups: m.claimedGroups, fallbackGroups: m.fallbackReservers,
    claimSuccessPct: admitted > 0 ? 100 * m.claimedGroups / admitted : null,
    claimAttemptSeconds: m.claimSearchMeanMin === null ? null : 60 * m.claimSearchMeanMin,
    unavailableEmptySeatHours: unavailableMs / 3_600_000,
  };
  const id = fraction === 0 ? `door${c.door}-food${c.foodSearcher}|0|${seedIndex}` : `${c.id}|${fraction}|${seedIndex}`;
  const run: ResearchRun = { id, caseId: c.id, seedIndex, seed, fraction, hash: sim.runHash(), metrics: m, diagnostics };
  return { run, pair: sim.pairInput() };
}
function values(run: ResearchRun, seatUse: number | null): Values {
  const m = run.metrics;
  return { leftPct: m.leftPct, plateSeconds: m.plateMeanMin === null ? null : m.plateMeanMin * 60, seatUsePct: seatUse === null ? null : seatUse * 100, throughput: m.peakThroughputPerHour, doorLeftPct: m.leftDoorPct, queueLeftPct: m.leftQueuePct };
}
export async function runVisibilityBlock(door: 0 | 3, food: 10 | 20, n = RESEARCH_N) {
  const runs: ResearchRun[] = [], pairs: ResearchPair[] = [];
  const cases = VISIBILITY_CASES.filter((c) => c.door === door && c.foodSearcher === food);
  for (const [seedIndex, seed] of researchSeeds(n).entries()) {
    const b = runVisibility(cases[0], 0, seedIndex, seed);
    runs.push(b.run);
    for (const c of cases) for (const fraction of RESEARCH_FRACTIONS) {
      const a = runVisibility(c, fraction, seedIndex, seed);
      runs.push(a.run);
      const pm = pairMetrics(a.pair, b.pair, fraction);
      pairs.push({ id: c.id, seedIndex, seed, fraction, runA: a.run.id, runB: b.run.id, hashA: a.run.hash, hashB: b.run.hash, truncated: false, a: values(a.run, pm.p3Level), b: values(b.run, pm.p3Baseline) });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { runs, pairs };
}
