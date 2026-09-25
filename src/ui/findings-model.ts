import { CATALOG } from '../batch/catalog';
import type { Findings, LevelKey, ReserveLevelKey, RobustRow } from '../batch/findings-data';
import type { BatchResult, MetricStat, RunResult } from '../batch/runner';
import { pairedStat, type PairedStat } from '../batch/stats';
import type { Config } from '../config/schema';
import type { CohortStats } from '../sim/pairmetrics';
import { runBelow } from './findings-text';

/**
 * Everything the Findings panel (spec §11.13) prints, as numbers: evidence-backed figures computed from the decoded
 * evidence, the rest read from findings.json. The panel only formats this object.
 */

export const LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;
export const RESERVE_LEVELS = [0.25, 0.5, 0.75, 1] as const;
export type Level = (typeof LEVELS)[number];
export const levelKey = (f: number) => String(f) as LevelKey;
const rkey = (f: number) => String(f) as ReserveLevelKey;

/** Seat-state indices in PairMetrics shares (spec §7.1). */
const FREE = 0, OPEN = 1, BLOCKED = 2, CLAIMED = 3, HELD = 4, OCC = 5;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const nonNull = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const minMax = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];

export interface Gap { mean: number; lo: number | null; hi: number | null; W: number; T: number; L: number; n: number }
export interface HeadRow {
  f: number;
  walkPct: number;
  walkPeople: number;
  e2sMin: number;
  utilPct: number;
  thr: number;
  /** Gaps as reservation minus free flow, in display units (pp, s, pp, people/h); null at 0%. */
  walk: Gap | null;
  e2sS: Gap | null;
  util: Gap | null;
  thrGap: Gap | null;
}
export interface SeatSlice { occupied: number; held: number; waiting: number; beyondSize: number; blocked: number; open: number; free: number }
export interface CohortCell { level: number; baseline: number }
export interface FindingsModel {
  n: number;
  head: HeadRow[];
  /** At 25%, the gap as a share of the gap at 100% (walk-aways, seat use, throughput, time). */
  shareAt25: { walk: number; util: number; thr: number; e2s: number };
  /** 100% minus 75%, paired per lunch. */
  topStep: { walk: PairedStat; thr: PairedStat; e2sS: PairedStat };
  /** Busiest-hour seat shares per level (0% = the baseline of the 100% pairs). */
  seats: Record<LevelKey, SeatSlice>;
  reservedEmpty: Record<ReserveLevelKey, number>;
  blockedAfterJoiners100: number;
  blockedNoJoiners100: number;
  baselineHeld: number;
  baselineHeldNoFood: number;
  blockedWhileNeeded: { b: number; a100: number };
  claimMedianS100: number;
  /** Mean completely empty tables every 5 minutes from 11:00 (index i = minute 5i). */
  empty: { minutes: number[]; byLevel: Record<LevelKey, number[]> };
  /** Mean busiest-hour window, minutes after 11:00 (start, end). */
  peakWindow: [number, number];
  /** The rush peak and the canteen size, from the default settings. */
  rushPeakMin: number;
  tables: number;
  seatsPerTable: number;
  emptyAt1210: Record<LevelKey, number>;
  /** The unbroken stretch of minutes around the low point where 100% reserving has fewer than 1.5 empty tables on average. */
  scarce100: [number, number] | null;
  fallbackNoTarget100: number;
  claimsPerLunch: Record<ReserveLevelKey, number>;
  reservingPerLunch: Record<ReserveLevelKey, number>;
  fallbacksPerLunch: Record<ReserveLevelKey, number>;
  claimShare: Record<ReserveLevelKey, number>;
  rushClaims: Record<ReserveLevelKey, number>;
  rushFallbacks: Record<ReserveLevelKey, number>;
  cohorts: Record<'Rclaimed' | 'Rfallback' | 'N' | 'R', Partial<Record<ReserveLevelKey, CohortCell>>>;
  /** Extra seconds from entrance to seat for groups that claimed a table, vs the same groups in free flow. */
  claimedDelayS: [number, number];
  meanSize: { claimed: number; fallback: number };
  /** Share of reserving groups that got a table, by 10-minute arrival bin (bin i starts at minute 10i). */
  claimByArrival: Record<ReserveLevelKey, number[]>;
  /** Middle minute of each arrival bin. */
  claimBinMid: number[];
  /** At 50%: the start of the first bin in which not every reserver got a table (null if bin 0 already misses). */
  claimAllBeforeMin50: number | null;
  claimShare1210to1250at50: [number, number];
  fallbackMedianArrival: [number, number];
  fallbackVsSameTime: { f: number; actual: number; atNonReserverRates: number }[];
  /** Largest gap (pp) between reservers who found no table and non-reservers arriving at the same times. */
  fallbackSameTimeMaxGap: number;
  /** Walk-away % of people by group size (3–6) per level. */
  bySize: { size: number; pct: Record<LevelKey, number> }[];
  bigGroupsWalkShare0: number;
  bigGroupsGroupShare: number;
  bigGroupsPeopleShare: number;
  midGroupsWalkShare: { b: number; a100: number };
  pairWalkAways: { groups: number; level: number | null };
  soloWalkAways: number;
  /** Walk-aways at 100% as a multiple of free flow's. */
  walkRatio: number;
  anatomy: { totalGroups: number; tooFew: number; oneTable0: number; oneTableReserve: [number, number]; emptyAmongFit0: number; nearestFitM0: number | null; freeSeats0: number; freeSeatsReserve: [number, number] };
  time: Findings['time'];
  fallbacks75: number;
  fallbacks100: number;
  stallCapacityPerHour: number;
  visibilityM: number;
  robust: RobustRow[];
  comparisons: number;
  chartIntervals: number;
  allFourAt100: boolean;
  lunch1: { walkB: number; rank: number; gap50: number; meanGap50: number };
  lunches100BelowAt75: number;
  servedAfterShare: number;
}

function stat(b: BatchResult, id: string, f: number): MetricStat {
  const s = b.stats.find((x) => x.metricId === id && x.fraction === f);
  if (!s) throw new Error(`findings: no ${id} at ${f}`);
  return s;
}
const gap = (s: MetricStat, k: number, sign: 1 | -1): Gap => {
  // aggregate() reports the free-flow advantage; the panel shows reservation minus free flow.
  const a = s.adv;
  const lo = a.lo === null ? null : a.lo * k * sign, hi = a.hi === null ? null : a.hi * k * sign;
  return {
    mean: a.mean! * k * sign,
    lo: lo === null || hi === null ? null : Math.min(lo, hi),
    hi: lo === null || hi === null ? null : Math.max(lo, hi),
    W: s.wins!.W, T: s.wins!.T, L: s.wins!.L, n: s.wins!.n,
  };
};
const runsAt = (b: BatchResult, f: number): RunResult[] => b.runs.filter((r) => r.fraction === f).sort((x, y) => x.seedIndex - y.seedIndex);

export function findingsModel(b: BatchResult, fd: Findings, cfg: Config): FindingsModel {
  const n = b.n;
  const runMean = (f: number, get: (r: RunResult) => number) => mean(runsAt(b, f).map(get));
  const pairs = (f: number) => b.pairs.filter((p) => p.fraction === f);
  const shareMean = (f: number, i: number, side: 'sharesLevel' | 'sharesBaseline') => mean(pairs(f).map((p) => p.pm[side][i]));

  const head: HeadRow[] = LEVELS.map((f) => {
    const w = f === 0 ? null : stat(b, 'walkAwayPct', f);
    const e = f === 0 ? null : stat(b, 'entranceToSeatMeanMin', f);
    const u = f === 0 ? null : stat(b, 'peakUtilization', f);
    const t = f === 0 ? null : stat(b, 'peakThroughputPerHour', f);
    const base = stat(b, 'walkAwayPct', 1);
    return {
      f,
      walkPct: f === 0 ? base.meanB! : w!.meanA!,
      walkPeople: runMean(f, (r) => r.metrics.walkAways),
      e2sMin: f === 0 ? stat(b, 'entranceToSeatMeanMin', 1).meanB! : e!.meanA!,
      utilPct: f === 0 ? mean(RESERVE_LEVELS.map((x) => stat(b, 'peakUtilization', x).meanB! * 100)) : u!.meanA! * 100,
      thr: f === 0 ? stat(b, 'peakThroughputPerHour', 1).meanB! : t!.meanA!,
      walk: w && gap(w, 1, 1),
      e2sS: e && gap(e, 60, 1),
      util: u && gap(u, 100, -1),
      thrGap: t && gap(t, 1, -1),
    };
  });
  const h = (f: number) => head.find((r) => r.f === f)!;
  const ratio = (g: (r: HeadRow) => Gap | null) => g(h(0.25))!.mean / g(h(1))!.mean;

  const perSeed = (f: number, get: (r: RunResult) => number) => runsAt(b, f).map(get);
  const step = (get: (r: RunResult) => number, k = 1) => {
    const a = perSeed(1, get), c = perSeed(0.75, get);
    return pairedStat(a.map((x, i) => (x - c[i]) * k));
  };

  const seats = {} as Record<LevelKey, SeatSlice>;
  const reservedEmpty = {} as Record<ReserveLevelKey, number>;
  seats['0'] = { occupied: shareMean(1, OCC, 'sharesBaseline'), held: shareMean(1, HELD, 'sharesBaseline'), waiting: 0, beyondSize: 0, blocked: 0, open: 0, free: shareMean(1, FREE, 'sharesBaseline') };
  for (const f of RESERVE_LEVELS) {
    const ps = fd.peakSeats[rkey(f)];
    seats[levelKey(f)] = {
      occupied: shareMean(f, OCC, 'sharesLevel'), held: shareMean(f, HELD, 'sharesLevel'),
      waiting: ps.claimedEmptyWaiting, beyondSize: ps.claimedEmptyBeyondSize,
      blocked: shareMean(f, BLOCKED, 'sharesLevel'), open: shareMean(f, OPEN, 'sharesLevel'), free: shareMean(f, FREE, 'sharesLevel'),
    };
    reservedEmpty[rkey(f)] = shareMean(f, CLAIMED, 'sharesLevel') + shareMean(f, BLOCKED, 'sharesLevel') + shareMean(f, OPEN, 'sharesLevel');
  }

  const emptyBy = {} as Record<LevelKey, number[]>;
  const minutes: number[] = [];
  for (let m = 0; m <= 180; m += 5) minutes.push(m);
  const emptyAt1210 = {} as Record<LevelKey, number>;
  for (const f of LEVELS) {
    const series = fd.emptyTables.byLevel[levelKey(f)];
    emptyBy[levelKey(f)] = minutes.map((m) => series[m]);
    emptyAt1210[levelKey(f)] = series[70];
  }
  const scarce100 = runBelow(fd.emptyTables.byLevel['1'], 1.5);
  const windows = b.pairs.map((p) => p.pm.peakWindowStartMin);
  const winLen = b.pairs[0]?.pm.peakWindowLengthMin ?? 60;

  const claimsPerLunch = {} as Record<ReserveLevelKey, number>;
  const reservingPerLunch = {} as Record<ReserveLevelKey, number>;
  const fallbacksPerLunch = {} as Record<ReserveLevelKey, number>;
  const claimShare = {} as Record<ReserveLevelKey, number>;
  const rushClaims = {} as Record<ReserveLevelKey, number>;
  const rushFallbacks = {} as Record<ReserveLevelKey, number>;
  const claimByArrival = {} as Record<ReserveLevelKey, number[]>;
  for (const f of RESERVE_LEVELS) {
    const k = rkey(f);
    claimsPerLunch[k] = runMean(f, (r) => r.metrics.claimedGroups);
    reservingPerLunch[k] = runMean(f, (r) => r.metrics.reservingGroups);
    fallbacksPerLunch[k] = runMean(f, (r) => r.metrics.fallbackReservers);
    claimShare[k] = claimsPerLunch[k] / reservingPerLunch[k];
    rushClaims[k] = fd.claims.byLevel[k].rush.claimsRush;
    rushFallbacks[k] = fd.claims.byLevel[k].rush.fallbacksRush;
    claimByArrival[k] = fd.claims.byLevel[k].bins.map((x) => (x.reserving > 0 ? x.claimed / x.reserving : NaN));
  }
  const binMin = fd.claims.binMin;
  const raw50 = fd.claims.byLevel['0.5'].bins;
  const firstShort = raw50.findIndex((x) => x.claimed < x.reserving);
  const mid = claimByArrival['0.5'].filter((_, i) => i * binMin >= 70 && (i + 1) * binMin <= 110);

  const cohortCell = (c: 'Rclaimed' | 'Rfallback' | 'N' | 'R', f: number): CohortCell | undefined => {
    const s = b.cohortStats.find((x) => x.cohort === c && x.metric === 'walkAwayPct' && x.fraction === f);
    if (!s) return undefined;
    const lv = nonNull(s.a), bl = nonNull(s.b);
    return lv.length ? { level: mean(lv), baseline: mean(bl) } : undefined;
  };
  const cohorts = { Rclaimed: {}, Rfallback: {}, N: {}, R: {} } as FindingsModel['cohorts'];
  for (const c of ['Rclaimed', 'Rfallback', 'N', 'R'] as const) for (const f of RESERVE_LEVELS) {
    const cell = cohortCell(c, f);
    if (cell) cohorts[c][rkey(f)] = cell;
  }
  const claimedDelay = RESERVE_LEVELS.map((f) => b.cohortStats.find((x) => x.cohort === 'Rclaimed' && x.metric === 'entranceToSeatMeanMin' && x.fraction === f)!.adv.mean! * 60);
  const sizeOf = (c: 'Rclaimed' | 'Rfallback') => {
    const cs = b.pairs.map((p) => p.pm.cohorts[c].level as CohortStats);
    return sum(cs.map((x) => x.people)) / sum(cs.map((x) => x.groups));
  };

  const bySize = [3, 4, 5, 6].map((size) => ({
    size,
    pct: Object.fromEntries(LEVELS.map((f) => [levelKey(f), runMean(f, (r) => r.metrics.bySize[size - 1].walkAwayPct ?? 0)])) as Record<LevelKey, number>,
  }));
  const walkPeopleBySize = (f: number) => [1, 2, 3, 4, 5, 6].map((s) => sum(runsAt(b, f).map((r) => Math.round((r.metrics.bySize[s - 1].people * (r.metrics.bySize[s - 1].walkAwayPct ?? 0)) / 100))));
  const w0 = walkPeopleBySize(0), w1 = walkPeopleBySize(1);
  const peopleBySize = [1, 2, 3, 4, 5, 6].map((s) => sum(runsAt(b, 0).map((r) => r.metrics.bySize[s - 1].people)));
  const mix = cfg.crowd.groupMix, mixSum = sum(mix);
  const pairWalk = LEVELS.map((f) => sum(runsAt(b, f).map((r) => Math.round((r.metrics.bySize[1].people * (r.metrics.bySize[1].walkAwayPct ?? 0)) / 200))));
  const pairWalkTotal = sum(pairWalk);
  const soloWalk = sum(LEVELS.map((f) => sum(runsAt(b, f).map((r) => Math.round((r.metrics.bySize[0].people * (r.metrics.bySize[0].walkAwayPct ?? 0)) / 100)))));
  const sameTime = RESERVE_LEVELS.filter((f) => fd.claims.byLevel[rkey(f)].fallbackWalkAwayPctAtNonReserverRates !== null).map((f) => ({
    f, actual: fd.claims.byLevel[rkey(f)].fallbackWalkAwayPct, atNonReserverRates: fd.claims.byLevel[rkey(f)].fallbackWalkAwayPctAtNonReserverRates!,
  }));

  const wa = fd.walkAways;
  const reserveOneTable = RESERVE_LEVELS.map((f) => wa[levelKey(f)].oneTableFit / wa[levelKey(f)].groups);

  const shownPerLevel = CATALOG.filter((m) => m.better).length;
  const withInterval = [...b.stats, ...b.cohortStats, ...b.sizeStats].filter((s) => s.adv.halfWidth !== null).length;

  const b0 = runsAt(b, 0).map((r) => r.metrics.walkAwayPct ?? 0);
  const b50 = runsAt(b, 0.5).map((r) => r.metrics.walkAwayPct ?? 0);
  const gaps50 = b50.map((x, i) => x - b0[i]);
  const sortedB = [...b0].sort((x, y) => y - x);
  const w75 = perSeed(0.75, (r) => r.metrics.walkAwayPct ?? 0), w100 = perSeed(1, (r) => r.metrics.walkAwayPct ?? 0);

  return {
    n,
    head,
    shareAt25: { walk: ratio((r) => r.walk), util: ratio((r) => r.util), thr: ratio((r) => r.thrGap), e2s: ratio((r) => r.e2sS) },
    topStep: { walk: step((r) => r.metrics.walkAwayPct ?? 0), thr: step((r) => r.metrics.peakThroughputPerHour), e2sS: step((r) => r.metrics.entranceToSeatMeanMin ?? 0, 60) },
    seats,
    reservedEmpty,
    blockedAfterJoiners100: fd.peakSeats['1'].blockedAfterJoiners,
    blockedNoJoiners100: fd.peakSeats['1'].blockedNoJoiners,
    baselineHeld: seats['0'].held,
    baselineHeldNoFood: fd.peakSeats['1'].baselineHeldNoFood,
    blockedWhileNeeded: { b: stat(b, 'blockedWhileNeeded', 1).meanB!, a100: stat(b, 'blockedWhileNeeded', 1).meanA! },
    claimMedianS100: fd.claims.byLevel['1'].claimSearchMedianS.claimed,
    empty: { minutes, byLevel: emptyBy },
    peakWindow: [Math.round(mean(windows)), Math.round(mean(windows)) + winLen],
    rushPeakMin: cfg.crowd.peakTime - cfg.crowd.windowStart,
    tables: cfg.layout.cols * cfg.layout.rows,
    seatsPerTable: 2 * cfg.layout.seatsPerSide,
    emptyAt1210,
    scarce100,
    fallbackNoTarget100: fd.claims.byLevel['1'].fallbackNoTargetShare,
    claimsPerLunch, reservingPerLunch, fallbacksPerLunch, claimShare, rushClaims, rushFallbacks,
    cohorts,
    claimedDelayS: minMax(claimedDelay),
    meanSize: { claimed: sizeOf('Rclaimed'), fallback: sizeOf('Rfallback') },
    claimByArrival,
    claimBinMid: claimByArrival['0.5'].map((_, i) => i * binMin + binMin / 2),
    claimAllBeforeMin50: firstShort > 0 ? firstShort * binMin : null,
    claimShare1210to1250at50: minMax(mid),
    fallbackMedianArrival: minMax(RESERVE_LEVELS.map((f) => fd.claims.byLevel[rkey(f)].medianArrivalMin.fallback)),
    fallbackVsSameTime: sameTime,
    fallbackSameTimeMaxGap: Math.max(0, ...sameTime.map((x) => Math.abs(x.actual - x.atNonReserverRates))),
    bySize,
    bigGroupsWalkShare0: (w0[4] + w0[5]) / sum(w0),
    bigGroupsGroupShare: (mix[4] + mix[5]) / mixSum,
    bigGroupsPeopleShare: (peopleBySize[4] + peopleBySize[5]) / sum(peopleBySize),
    midGroupsWalkShare: { b: (w0[2] + w0[3]) / sum(w0), a100: (w1[2] + w1[3]) / sum(w1) },
    pairWalkAways: { groups: pairWalkTotal, level: pairWalkTotal === 1 ? LEVELS[pairWalk.findIndex((x) => x === 1)] : null },
    soloWalkAways: soloWalk,
    walkRatio: h(1).walkPct / h(0).walkPct,
    anatomy: {
      totalGroups: sum(LEVELS.map((f) => wa[levelKey(f)].groups)),
      tooFew: sum(LEVELS.map((f) => wa[levelKey(f)].tooFew)),
      oneTable0: wa['0'].oneTableFit / wa['0'].groups,
      oneTableReserve: minMax(reserveOneTable),
      emptyAmongFit0: wa['0'].emptyTableAmongFit / wa['0'].oneTableFit,
      nearestFitM0: wa['0'].nearestFitMedianM,
      freeSeats0: wa['0'].meanFreeSeats,
      freeSeatsReserve: minMax(RESERVE_LEVELS.map((f) => wa[levelKey(f)].meanFreeSeats)),
    },
    time: fd.time,
    fallbacks75: fallbacksPerLunch['0.75'],
    fallbacks100: fallbacksPerLunch['1'],
    stallCapacityPerHour: (cfg.layout.stallCount * 3600) / cfg.stalls.serviceMean,
    visibilityM: cfg.search.visibility,
    robust: fd.robustness,
    comparisons: withInterval,
    chartIntervals: shownPerLevel * RESERVE_LEVELS.length,
    allFourAt100: ['walkAwayPct', 'entranceToSeatMeanMin', 'peakUtilization', 'peakThroughputPerHour'].every((id) => stat(b, id, 1).wins!.W === n),
    lunch1: { walkB: b0[0], rank: sortedB.indexOf(b0[0]) + 1, gap50: gaps50[0], meanGap50: mean(gaps50) },
    lunches100BelowAt75: w100.filter((x, i) => x < w75[i]).length,
    servedAfterShare: sum(b.runs.map((r) => r.metrics.walkAwayServedAfterDecision)) / sum(b.runs.map((r) => r.metrics.walkAways)),
  };
}
