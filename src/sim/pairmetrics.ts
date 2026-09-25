import { meanOrNull, MINUTE_MS, occupiedShareInWindow, peakWindow, quantile, stateShareInWindow, STATES, type Window } from './metrics';

/** What pairMetrics needs from one run (spec §7.7): minute bins and per-group / per-person outcomes. */
export interface PairInput {
  seats: number;
  endMs: number;
  bins: Float64Array;
  groupReserveDraw: Float64Array;
  groupClaimed: Uint8Array;
  groupFallback: Uint8Array;
  groupSize: Uint8Array;
  personGroup: Int32Array;
  /** entrance → sit start or walk-away decision, ms; −1 when none. */
  e2sMs: Float64Array;
  /** service end → outcome, ms; −1 when not applicable. */
  f2sMs: Float64Array;
  walkedAway: Uint8Array;
}

export interface CohortStats {
  groups: number;
  people: number;
  walkAwayPct: number | null;
  entranceToSeatMeanMin: number | null;
  entranceToSeatMedianMin: number | null;
  entranceToSeatP90Min: number | null;
  foodToSeatMeanMin: number | null;
}

export interface CohortPair { level: CohortStats; baseline: CohortStats }

export interface PairMetrics {
  peakWindowStartMin: number;
  peakWindowLengthMin: number;
  /** P3 for the level run and for its baseline, over the pair's window. */
  p3Level: number;
  p3Baseline: number;
  sharesLevel: number[];
  sharesBaseline: number[];
  cohorts: { R: CohortPair; N: CohortPair; Rclaimed: CohortPair; Rfallback: CohortPair };
}

const toMin = (v: number | null) => (v === null ? null : v / MINUTE_MS);

function cohortStats(run: PairInput, inCohort: (g: number) => boolean): CohortStats {
  let groups = 0, people = 0, walked = 0;
  for (let g = 0; g < run.groupSize.length; g++) {
    if (!inCohort(g)) continue;
    groups++;
    people += run.groupSize[g];
  }
  const e2s: number[] = [];
  const f2s: number[] = [];
  for (let p = 0; p < run.personGroup.length; p++) {
    if (!inCohort(run.personGroup[p])) continue;
    if (run.walkedAway[p]) walked++;
    if (run.e2sMs[p] >= 0) e2s.push(run.e2sMs[p]);
    if (run.f2sMs[p] >= 0) f2s.push(run.f2sMs[p]);
  }
  e2s.sort((a, b) => a - b);
  return {
    groups, people,
    walkAwayPct: people > 0 ? (100 * walked) / people : null,
    entranceToSeatMeanMin: toMin(meanOrNull(e2s)),
    entranceToSeatMedianMin: toMin(quantile(e2s, 50)),
    entranceToSeatP90Min: toMin(quantile(e2s, 90)),
    foodToSeatMeanMin: toMin(meanOrNull(f2s)),
  };
}

/** PairMetrics of a level run against its 0% baseline for the same seed (spec §7.7). */
export function pairMetrics(level: PairInput, baseline: PairInput, fraction: number): PairMetrics {
  const w: Window = peakWindow(level.bins, level.endMs, baseline.bins, baseline.endMs);
  const shares = (r: PairInput) => Array.from({ length: STATES }, (_, s) => stateShareInWindow(r.bins, r.seats, w, s));
  const R = (g: number) => level.groupReserveDraw[g] < fraction;
  const cohort = (f: (g: number) => boolean): CohortPair => ({ level: cohortStats(level, f), baseline: cohortStats(baseline, f) });
  return {
    peakWindowStartMin: w.startMin,
    peakWindowLengthMin: w.lengthMin,
    p3Level: occupiedShareInWindow(level.bins, level.seats, w),
    p3Baseline: occupiedShareInWindow(baseline.bins, baseline.seats, w),
    sharesLevel: shares(level),
    sharesBaseline: shares(baseline),
    cohorts: {
      R: cohort(R),
      N: cohort((g) => !R(g)),
      Rclaimed: cohort((g) => R(g) && level.groupClaimed[g] === 1),
      Rfallback: cohort((g) => R(g) && level.groupFallback[g] === 1),
    },
  };
}
