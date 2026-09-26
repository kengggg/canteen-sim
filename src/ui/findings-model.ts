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
  /** P1: left without eating, %; and people per lunch. */
  leftPct: number;
  leftPeople: number;
  /** P2: time carrying a plate, minutes. */
  plateMin: number;
  utilPct: number;
  thr: number;
  /** Gaps as reservation minus free flow, in display units (pp, s, pp, people/h); null at 0%. */
  left: Gap | null;
  plateS: Gap | null;
  util: Gap | null;
  thrGap: Gap | null;
}
export interface SeatSlice { occupied: number; held: number; waiting: number; beyondSize: number; blocked: number; open: number; free: number }
export interface CohortCell { level: number; baseline: number }
/** Shares of arrivals leaving at the door (by reason) and from a queue, at one level. */
export interface LeaveSlice { doorQueues: number; doorSeating: number; doorBoth: number; door: number; queue: number; all: number }
export interface FindingsModel {
  n: number;
  head: HeadRow[];
  /** At 25%, the gap as a share of the gap at 100% (leaving, seat use, throughput, plate time). */
  shareAt25: { left: number; util: number; thr: number; plate: number };
  /** 100% minus 75%, paired per lunch. */
  topStep: { left: PairedStat; thr: PairedStat; plateS: PairedStat };
  /** Entrance to seat for people who sat (a secondary measure): free flow, and each level's gap in seconds. */
  seatedE2s: { b: number; gapS: Record<ReserveLevelKey, Gap> };
  queueWait: { b: number; a100: number };
  leave: Record<LevelKey, LeaveSlice>;
  /** Share of door leavers whose reason included the seating (seating or both), per level. */
  doorSeatingShare: Record<LevelKey, number>;
  /** Share of arrivals leaving at the door or from a queue by 10-minute arrival bin (bin i starts at minute 10i). */
  leaveByArrival: { binMid: number[]; door: Record<LevelKey, (number | null)[]>; queue: Record<LevelKey, (number | null)[]> };
  /** Reserving groups per lunch that turned round at the door before trying to claim. */
  doorLeftReservers: Record<ReserveLevelKey, number>;
  /** People holding food with no seat, every 5 minutes from 11:00 (index i = minute 5i), and the lunch peak. */
  plates: { minutes: number[]; byLevel: Record<LevelKey, number[]>; peak: Record<LevelKey, number> };
  groupsSplitPct: Record<LevelKey, number>;
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
  /** Left-without-eating % per cohort (level) and the same groups under free flow (baseline). */
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
  /** Left-without-eating % of people by group size (1–6) per level. */
  bySize: { size: number; pct: Record<LevelKey, number> }[];
  /** Leaving at 100% as a multiple of free flow's. */
  leftRatio: number;
  time: Findings['time'];
  fallbacks75: number;
  fallbacks100: number;
  stallCapacityPerHour: number;
  visibilityM: number;
  robust: RobustRow[];
  comparisons: number;
  chartIntervals: number;
  allFourAt100: boolean;
  lunch1: { leftB: number; rank: number; gap50: number; meanGap50: number };
  lunches100BelowAt75: number;
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
    const l = f === 0 ? null : stat(b, 'leftPct', f);
    const pl = f === 0 ? null : stat(b, 'plateMeanMin', f);
    const u = f === 0 ? null : stat(b, 'peakUtilization', f);
    const t = f === 0 ? null : stat(b, 'peakThroughputPerHour', f);
    return {
      f,
      leftPct: f === 0 ? stat(b, 'leftPct', 1).meanB! : l!.meanA!,
      leftPeople: runMean(f, (r) => r.metrics.leftPeople),
      plateMin: f === 0 ? stat(b, 'plateMeanMin', 1).meanB! : pl!.meanA!,
      utilPct: f === 0 ? mean(RESERVE_LEVELS.map((x) => stat(b, 'peakUtilization', x).meanB! * 100)) : u!.meanA! * 100,
      thr: f === 0 ? stat(b, 'peakThroughputPerHour', 1).meanB! : t!.meanA!,
      left: l && gap(l, 1, 1),
      plateS: pl && gap(pl, 60, 1),
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

  const seatedGap = {} as Record<ReserveLevelKey, Gap>;
  for (const f of RESERVE_LEVELS) seatedGap[rkey(f)] = gap(stat(b, 'entranceToSeatMeanMin', f), 60, 1);

  const leave = {} as Record<LevelKey, LeaveSlice>;
  const doorSeatingShare = {} as Record<LevelKey, number>;
  const leaveDoor = {} as Record<LevelKey, (number | null)[]>;
  const leaveQueue = {} as Record<LevelKey, (number | null)[]>;
  for (const f of LEVELS) {
    const l = fd.leavers[levelKey(f)];
    const door = l.doorQueues + l.doorSeating + l.doorBoth;
    leave[levelKey(f)] = { doorQueues: l.doorQueues / l.arrivals, doorSeating: l.doorSeating / l.arrivals, doorBoth: l.doorBoth / l.arrivals, door: door / l.arrivals, queue: l.queue / l.arrivals, all: (door + l.queue) / l.arrivals };
    doorSeatingShare[levelKey(f)] = door > 0 ? (l.doorSeating + l.doorBoth) / door : 0;
    leaveDoor[levelKey(f)] = l.bins.map((x) => (x.arrivals > 0 ? x.door / x.arrivals : null));
    leaveQueue[levelKey(f)] = l.bins.map((x) => (x.arrivals > 0 ? x.queue / x.arrivals : null));
  }
  const leaveBin = fd.claims.binMin;

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

  const minutes: number[] = [];
  for (let m = 0; m <= 180; m += 5) minutes.push(m);
  const emptyBy = {} as Record<LevelKey, number[]>;
  const platesBy = {} as Record<LevelKey, number[]>;
  const platesPeak = {} as Record<LevelKey, number>;
  const splitPct = {} as Record<LevelKey, number>;
  const emptyAt1210 = {} as Record<LevelKey, number>;
  for (const f of LEVELS) {
    const series = fd.emptyTables.byLevel[levelKey(f)];
    emptyBy[levelKey(f)] = minutes.map((m) => series[m]);
    emptyAt1210[levelKey(f)] = series[70];
    platesBy[levelKey(f)] = minutes.map((m) => fd.platesWithoutSeat.byLevel[levelKey(f)][m]);
    platesPeak[levelKey(f)] = runMean(f, (r) => r.metrics.peakPlatesWithoutSeat);
    splitPct[levelKey(f)] = runMean(f, (r) => r.metrics.groupsSplitPct ?? 0);
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
  const doorLeftReservers = {} as Record<ReserveLevelKey, number>;
  for (const f of RESERVE_LEVELS) {
    const k = rkey(f);
    claimsPerLunch[k] = runMean(f, (r) => r.metrics.claimedGroups);
    reservingPerLunch[k] = runMean(f, (r) => r.metrics.reservingGroups);
    fallbacksPerLunch[k] = runMean(f, (r) => r.metrics.fallbackReservers);
    claimShare[k] = claimsPerLunch[k] / reservingPerLunch[k];
    rushClaims[k] = fd.claims.byLevel[k].rush.claimsRush;
    rushFallbacks[k] = fd.claims.byLevel[k].rush.fallbacksRush;
    claimByArrival[k] = fd.claims.byLevel[k].bins.map((x) => (x.reserving > 0 ? x.claimed / x.reserving : NaN));
    doorLeftReservers[k] = fd.claims.byLevel[k].doorLeftPerLunch;
  }
  const binMin = fd.claims.binMin;
  const raw50 = fd.claims.byLevel['0.5'].bins;
  const firstShort = raw50.findIndex((x) => x.claimed < x.reserving);
  const mid = claimByArrival['0.5'].filter((_, i) => i * binMin >= 70 && (i + 1) * binMin <= 110);

  const cohortCell = (c: 'Rclaimed' | 'Rfallback' | 'N' | 'R', f: number): CohortCell | undefined => {
    const s = b.cohortStats.find((x) => x.cohort === c && x.metric === 'leftPct' && x.fraction === f);
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

  const bySize = [1, 2, 3, 4, 5, 6].map((size) => ({
    size,
    pct: Object.fromEntries(LEVELS.map((f) => [levelKey(f), runMean(f, (r) => r.metrics.bySize[size - 1].leftPct ?? 0)])) as Record<LevelKey, number>,
  }));
  const sameTime = RESERVE_LEVELS.filter((f) => fd.claims.byLevel[rkey(f)].fallbackLeftPctAtNonReserverRates !== null).map((f) => ({
    f, actual: fd.claims.byLevel[rkey(f)].fallbackLeftPct, atNonReserverRates: fd.claims.byLevel[rkey(f)].fallbackLeftPctAtNonReserverRates!,
  }));

  const shownPerLevel = CATALOG.filter((m) => m.better).length;
  const withInterval = [...b.stats, ...b.cohortStats, ...b.sizeStats].filter((s) => s.adv.halfWidth !== null).length;

  const b0 = runsAt(b, 0).map((r) => r.metrics.leftPct ?? 0);
  const b50 = runsAt(b, 0.5).map((r) => r.metrics.leftPct ?? 0);
  const gaps50 = b50.map((x, i) => x - b0[i]);
  const sortedB = [...b0].sort((x, y) => y - x);
  const l75 = perSeed(0.75, (r) => r.metrics.leftPct ?? 0), l100 = perSeed(1, (r) => r.metrics.leftPct ?? 0);

  return {
    n,
    head,
    shareAt25: { left: ratio((r) => r.left), util: ratio((r) => r.util), thr: ratio((r) => r.thrGap), plate: ratio((r) => r.plateS) },
    topStep: { left: step((r) => r.metrics.leftPct ?? 0), thr: step((r) => r.metrics.peakThroughputPerHour), plateS: step((r) => r.metrics.plateMeanMin ?? 0, 60) },
    seatedE2s: { b: stat(b, 'entranceToSeatMeanMin', 1).meanB!, gapS: seatedGap },
    queueWait: { b: stat(b, 'queueWaitMeanMin', 1).meanB!, a100: stat(b, 'queueWaitMeanMin', 1).meanA! },
    leave,
    doorSeatingShare,
    leaveByArrival: { binMid: fd.leavers['0'].bins.map((_, i) => i * leaveBin + leaveBin / 2), door: leaveDoor, queue: leaveQueue },
    doorLeftReservers,
    plates: { minutes, byLevel: platesBy, peak: platesPeak },
    groupsSplitPct: splitPct,
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
    leftRatio: h(1).leftPct / h(0).leftPct,
    time: fd.time,
    fallbacks75: fallbacksPerLunch['0.75'],
    fallbacks100: fallbacksPerLunch['1'],
    stallCapacityPerHour: (cfg.layout.stallCount * 3600) / cfg.stalls.serviceMean,
    visibilityM: cfg.search.visibility,
    robust: fd.robustness,
    comparisons: withInterval,
    chartIntervals: shownPerLevel * RESERVE_LEVELS.length,
    allFourAt100: ['leftPct', 'plateMeanMin', 'peakUtilization', 'peakThroughputPerHour'].every((id) => stat(b, id, 1).wins!.W === n),
    lunch1: { leftB: b0[0], rank: sortedB.indexOf(b0[0]) + 1, gap50: gaps50[0], meanGap50: mean(gaps50) },
    lunches100BelowAt75: l100.filter((x, i) => x < l75[i]).length,
  };
}
