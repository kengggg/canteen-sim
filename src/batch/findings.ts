import { cloneConfig, getSetting, META, setSetting } from '../config/meta';
import { presetConfig } from '../config/presets';
import { defaultConfig, type Config } from '../config/schema';
import { validate } from '../config/validate';
import { Sim } from '../sim/engine';
import { MINUTE_MS, quantile } from '../sim/metrics';
import { pairMetrics } from '../sim/pairmetrics';
import { popcount, SEAT } from '../sim/seating';
import { MODEL_VERSION } from '../sim/version';
import type { World } from '../sim/world';
import {
  evidenceDigest, LEVEL_KEYS, RESERVE_LEVEL_KEYS,
  type ClaimLevel, type FindingStat, type Findings, type LevelKey, type PeakSplit, type ReserveLevelKey, type RobustRow, type TimeSplit, type WalkAwayAnatomy,
} from './findings-data';
import type { Evidence } from './precompute';
import { aggregate, runJob, type RunResult } from './runner';
import { batchSeeds, RESERVATION_LEVELS, type Job } from './sweep';

/**
 * `npm run findings` (spec §10.9): instrumented runs of the default reservation sweep, plus 100% vs 0% under other
 * settings, folded into the figures of src/batch/findings-data.ts. Instrumentation only reads engine state: the trace
 * callback, per-person timestamps, table masks, and the seat clock (its advance() is wrapped on the run's own clock to
 * integrate finer seat categories over exactly the intervals the engine integrates). Run hashes stay identical.
 */

/** Empty tables are sampled at every whole minute 0…EMPTY_TABLE_MINUTES. */
export const EMPTY_TABLE_MINUTES = 200;
/** Arrival bins of the claims figures, in minutes. */
export const CLAIM_BIN_MIN = 10;
/** The rush: groups whose first member arrives in minutes [60, 120), 12:00–13:00 at the default window. */
const RUSH_FROM_MIN = 60;
const RUSH_TO_MIN = 120;
/** Stall busy share: whole-minute windows of this length. */
const BUSY_WINDOW_MIN = 30;

/** Seat categories integrated per minute (seat-ms), finer than the §7.1 states. */
export const SEAT_CATS = ['claimedEmptyBeyondSize', 'claimedEmptyWaiting', 'blockedNoJoiners', 'blockedAfterJoiners', 'heldNoFood'] as const;
const CE_BEYOND = 0, CE_WAITING = 1, BL_NO_JOINERS = 2, BL_AFTER_JOINERS = 3, HELD_NO_FOOD = 4;
const NCAT = SEAT_CATS.length;

/** One walk-away group, classified at its decision ms (the 'walkaway' trace fires before any seat changes). */
export interface WalkAwayRecord {
  size: number;
  /** 0 oneTableFit, 1 scatteredOnly, 2 tooFew. */
  cls: 0 | 1 | 2;
  /** Seats in state free at the decision. */
  freeSeats: number;
  /** A completely empty table was among the fitting tables. */
  emptyFit: boolean;
  /** Route distance (mm) from the searcher's node to the nearest free seat at a fitting table; −1 if not oneTableFit or unknown. */
  nearestFitMm: number;
}

/** Everything one instrumented run yields. */
export interface CollectedRun {
  job: Job;
  /** What runJob() returns for the same job (hash, metrics, pair input). */
  result: RunResult;
  /** Completely empty tables (nobody seated, no seat held, no claim) at each whole minute 0…EMPTY_TABLE_MINUTES. */
  emptyTables: Int32Array;
  /** minute·SEAT_CATS.length + category: seat-ms per minute (same minutes as the seat clock's bins). */
  seatCatBins: Float64Array;
  groups: {
    arrivalMs: Float64Array;
    size: Uint8Array;
    reserver: Uint8Array;
    claimed: Uint8Array;
    fallback: Uint8Array;
    walked: Uint8Array;
    /** Claim or fallback ms − arrival ms (reserving groups), else −1. */
    claimSearchMs: Float64Array;
    /** Fallback reason from the trace (1 no target at the cutoff, 2/3 frozen target taken), 0 if none. */
    reason: Uint8Array;
  };
  walkAways: WalkAwayRecord[];
  people: {
    entranceMs: Float64Array;
    joinMs: Float64Array;
    serviceStartMs: Float64Array;
    serviceEndMs: Float64Array;
    /** Sit start, or the group's walk-away decision; −1 when neither. */
    outcomeMs: Float64Array;
    /** The member who did the claim search in a group that fell back. */
    fallbackClaimer: Uint8Array;
  };
  /** Highest share of stall-time spent serving in any whole-minute 30-minute window (0…1). */
  stallBusyPeak: number;
}

/** The node a person stands at, or the node it is walking toward on an edge; −1 inside the queue area. */
function nodeOf(w: World, p: number): number {
  const n = w.mv.node[p];
  if (n >= 0) return n;
  const e = w.mv.edge[p];
  if (e < 0) return -1;
  const ed = w.pc.G.edges[e];
  return w.mv.dir[p] > 0 ? ed.b : ed.a;
}

function classifyWalkAway(w: World, g: number): WalkAwayRecord {
  const G = w.groups[g];
  const n = G.size;
  const k2 = w.k2;
  const node = G.searcher >= 0 ? nodeOf(w, G.searcher) : -1;
  let fit = false, emptyFit = false, near = -1;
  for (let t = 0; t < w.pc.tableCount; t++) {
    if (w.claimedBy[t] >= 0) continue;
    const free = w.freeMaskOf(t);
    if (popcount(free) < n) continue;
    fit = true;
    if (w.occMask[t] === 0 && w.heldMask[t] === 0) emptyFit = true;
    if (node < 0) continue;
    for (let j = 0; j < k2; j++) {
      if (((free >>> j) & 1) === 0) continue;
      const d = w.pc.R.dist(node, w.pc.G.seatNode[t * k2 + j]);
      if (near < 0 || d < near) near = d;
    }
  }
  const freeSeats = w.clock.totals[SEAT.FREE];
  return { size: n, cls: fit ? 0 : freeSeats >= n ? 1 : 2, freeSeats, emptyFit, nearestFitMm: fit ? near : -1 };
}

/** Current seat counts per SEAT_CATS category. */
function seatCategories(w: World, out: Float64Array): void {
  out.fill(0);
  const k2 = w.k2;
  for (let t = 0; t < w.pc.tableCount; t++) {
    const held = w.heldMask[t];
    if (held !== 0) {
      for (let j = 0; j < k2; j++) {
        if (((held >>> j) & 1) === 0) continue;
        const p = w.seatPerson[t * k2 + j];
        if (p < 0 || w.hasFood[p] === 0) out[HELD_NO_FOOD]++;
      }
    }
    const g = w.claimedBy[t];
    if (g < 0) continue;
    const size = w.groups[g].size;
    if (w.complete[t] === 0) {
      // Before the group is complete no stranger can join, and every member with a seat keeps it: the claimed-empty
      // seats are the 6 − n the group will never use plus the seats of members not yet assigned one.
      let ce = 0;
      for (let j = 0; j < k2; j++) if (w.seatState[t * k2 + j] === SEAT.CLAIMED_EMPTY) ce++;
      const beyond = Math.min(ce, k2 - size);
      out[CE_BEYOND] += beyond;
      out[CE_WAITING] += ce - beyond;
      continue;
    }
    let blocked = 0, strangers = 0;
    const used = w.occMask[t] | held;
    for (let j = 0; j < k2; j++) {
      const s = t * k2 + j;
      if (w.seatState[s] === SEAT.BLOCKED) blocked++;
      if (((used >>> j) & 1) === 1 && w.seatGroup[s] !== g) strangers++;
    }
    if (blocked > 0) out[size >= 3 && size <= 5 && strangers === 0 ? BL_NO_JOINERS : BL_AFTER_JOINERS] += blocked;
  }
}

function stallBusyPeak(w: World): number {
  const endMin = Math.ceil(w.now / MINUTE_MS);
  const busy = new Float64Array(endMin + 1);
  const P = w.pop.personCount;
  for (let p = 0; p < P; p++) {
    const a = w.st.serviceStartMs[p], b = w.st.serviceEndMs[p];
    if (a < 0 || b <= a) continue;
    for (let m = Math.floor(a / MINUTE_MS); m * MINUTE_MS < b; m++) busy[m] += Math.min(b, (m + 1) * MINUTE_MS) - Math.max(a, m * MINUTE_MS);
  }
  let sum = 0;
  for (let m = 0; m < BUSY_WINDOW_MIN && m < busy.length; m++) sum += busy[m];
  let best = sum;
  for (let s = 1; s + BUSY_WINDOW_MIN <= busy.length; s++) {
    sum += busy[s + BUSY_WINDOW_MIN - 1] - busy[s - 1];
    if (sum > best) best = sum;
  }
  return best / (w.st.S * BUSY_WINDOW_MIN * MINUTE_MS);
}

/** Run one job to done with read-only instrumentation. */
export function collectRun(job: Job): CollectedRun {
  const walkAways: WalkAwayRecord[] = [];
  const reasons = new Map<number, number>();
  let w: World | null = null;
  const sim = new Sim(job.cfg, {
    seed: job.seed,
    reserveFraction: job.fraction,
    trace: (ev, a, b) => {
      if (ev === 'fallback') reasons.set(a, b);
      else if (ev === 'walkaway') walkAways.push(classifyWalkAway(w!, a));
    },
  });
  w = sim.world;
  const world = w;

  // Integrate the categories over exactly the intervals the seat clock integrates (state is constant inside each).
  const clock = world.clock;
  const seatCatBins = new Float64Array(clock.minutes * NCAT);
  const cur = new Float64Array(NCAT);
  const advance = clock.advance.bind(clock);
  clock.advance = (to: number) => {
    if (to > clock.now) {
      seatCategories(world, cur);
      for (let t = clock.now; t < to;) {
        const m = Math.floor(t / MINUTE_MS);
        const next = Math.min(to, (m + 1) * MINUTE_MS);
        if (m < clock.minutes) for (let c = 0; c < NCAT; c++) seatCatBins[m * NCAT + c] += cur[c] * (next - t);
        t = next;
      }
    }
    advance(to);
  };

  const emptyTables = new Int32Array(EMPTY_TABLE_MINUTES + 1);
  for (let m = 0; m <= EMPTY_TABLE_MINUTES; m++) {
    sim.advanceTo(m * MINUTE_MS);
    let empty = 0;
    for (let t = 0; t < world.pc.tableCount; t++) if (world.occMask[t] === 0 && world.heldMask[t] === 0 && world.claimedBy[t] < 0) empty++;
    emptyTables[m] = empty;
  }
  sim.advanceTo(Infinity);

  const G = world.groups.length;
  const groups: CollectedRun['groups'] = {
    arrivalMs: new Float64Array(G), size: new Uint8Array(G), reserver: new Uint8Array(G), claimed: new Uint8Array(G), fallback: new Uint8Array(G),
    walked: new Uint8Array(G), claimSearchMs: new Float64Array(G).fill(-1), reason: new Uint8Array(G),
  };
  for (let g = 0; g < G; g++) {
    const gs = world.groups[g];
    groups.arrivalMs[g] = world.entranceMs[gs.first];
    groups.size[g] = gs.size;
    groups.reserver[g] = gs.reserver ? 1 : 0;
    groups.claimed[g] = gs.claimed ? 1 : 0;
    groups.fallback[g] = gs.fallback ? 1 : 0;
    groups.walked[g] = gs.walkedAway ? 1 : 0;
    if (gs.reserver && gs.claimEndMs >= 0) groups.claimSearchMs[g] = gs.claimEndMs - gs.arrivalMs;
    groups.reason[g] = reasons.get(g) ?? 0;
  }
  const P = world.pop.personCount;
  const outcomeMs = new Float64Array(P).fill(-1);
  const fallbackClaimer = new Uint8Array(P);
  for (let p = 0; p < P; p++) {
    const gs = world.groupOf(p);
    const sit = world.sitStartMs[p];
    outcomeMs[p] = sit >= 0 ? sit : gs.walkedAway ? gs.walkAwayMs : -1;
    fallbackClaimer[p] = gs.reserver && gs.fallback && gs.claimer === p ? 1 : 0;
  }
  const result: RunResult = {
    key: job.key, seedIndex: job.seedIndex, seed: job.seed, fraction: job.fraction, value: job.value,
    metrics: sim.metrics(), hash: sim.runHash(), pair: sim.pairInput(), shareMinEmpty: job.cfg.reserve.shareMinEmpty,
  };
  return {
    job, result, emptyTables, seatCatBins, groups, walkAways,
    people: {
      entranceMs: world.entranceMs.slice(), joinMs: world.st.joinMs.slice(), serviceStartMs: world.st.serviceStartMs.slice(),
      serviceEndMs: world.st.serviceEndMs.slice(), outcomeMs, fallbackClaimer,
    },
    stallBusyPeak: stallBusyPeak(world),
  };
}

// ---------------------------------------------------------------- folding runs into figures

const mean = (xs: number[]) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const median = (xs: number[]) => {
  const s = Float64Array.from(xs).sort();
  return s.length === 0 ? Number.NaN : quantile(s, 50)!;
};

class ClaimAcc {
  readonly bins: { reserving: number; claimed: number }[];
  private claimedArr: number[] = [];
  private fallbackArr: number[] = [];
  private claimedSearch: number[] = [];
  private fallbackSearch: number[] = [];
  private claimsBefore = 0; private claimsRush = 0; private claimsAfter = 0; private fallbacksRush = 0;
  private reason1 = 0; private fallbacks = 0;
  private fbPeople = 0; private fbWalked = 0;
  private readonly fbPeopleBin: number[];
  private readonly nonPeopleBin: number[];
  private readonly nonWalkedBin: number[];

  constructor(private readonly n: number, nBins: number) {
    this.bins = Array.from({ length: nBins }, () => ({ reserving: 0, claimed: 0 }));
    this.fbPeopleBin = new Array(nBins).fill(0);
    this.nonPeopleBin = new Array(nBins).fill(0);
    this.nonWalkedBin = new Array(nBins).fill(0);
  }

  add(r: CollectedRun): void {
    const g = r.groups;
    for (let i = 0; i < g.size.length; i++) {
      const arr = g.arrivalMs[i];
      const b = Math.min(this.bins.length - 1, Math.floor(arr / (CLAIM_BIN_MIN * MINUTE_MS)));
      const min = arr / MINUTE_MS;
      const rush = min >= RUSH_FROM_MIN && min < RUSH_TO_MIN;
      if (!g.reserver[i]) {
        this.nonPeopleBin[b] += g.size[i];
        if (g.walked[i]) this.nonWalkedBin[b] += g.size[i];
        continue;
      }
      this.bins[b].reserving++;
      if (g.claimed[i]) {
        this.bins[b].claimed++;
        this.claimedArr.push(arr);
        this.claimedSearch.push(g.claimSearchMs[i]);
        if (min < RUSH_FROM_MIN) this.claimsBefore++;
        else if (rush) this.claimsRush++;
        else this.claimsAfter++;
      } else if (g.fallback[i]) {
        this.fallbacks++;
        this.fallbackArr.push(arr);
        this.fallbackSearch.push(g.claimSearchMs[i]);
        if (rush) this.fallbacksRush++;
        if (g.reason[i] === 1) this.reason1++;
        this.fbPeople += g.size[i];
        this.fbPeopleBin[b] += g.size[i];
        if (g.walked[i]) this.fbWalked += g.size[i];
      }
    }
  }

  figures(): ClaimLevel {
    let exp = 0, tot = 0;
    for (let b = 0; b < this.bins.length; b++) {
      if (this.fbPeopleBin[b] === 0 || this.nonPeopleBin[b] === 0) continue;
      exp += (this.fbPeopleBin[b] * this.nonWalkedBin[b]) / this.nonPeopleBin[b];
      tot += this.fbPeopleBin[b];
    }
    const n = this.n;
    return {
      bins: this.bins,
      rush: { claimsBefore: this.claimsBefore / n, claimsRush: this.claimsRush / n, claimsAfter: this.claimsAfter / n, fallbacksRush: this.fallbacksRush / n },
      claimSearchMedianS: { claimed: median(this.claimedSearch) / 1000, fallback: median(this.fallbackSearch) / 1000 },
      medianArrivalMin: { claimed: median(this.claimedArr) / MINUTE_MS, fallback: median(this.fallbackArr) / MINUTE_MS },
      fallbackNoTargetShare: this.reason1 / this.fallbacks,
      fallbackWalkAwayPct: (100 * this.fbWalked) / this.fbPeople,
      fallbackWalkAwayPctAtNonReserverRates: tot > 0 ? (100 * exp) / tot : null,
    };
  }
}

function walkAwayFigures(recs: WalkAwayRecord[]): WalkAwayAnatomy {
  const fit = recs.filter((r) => r.cls === 0);
  const dists = fit.filter((r) => r.nearestFitMm >= 0).map((r) => r.nearestFitMm);
  return {
    groups: recs.length,
    oneTableFit: fit.length,
    scatteredOnly: recs.filter((r) => r.cls === 1).length,
    tooFew: recs.filter((r) => r.cls === 2).length,
    meanFreeSeats: mean(recs.map((r) => r.freeSeats)),
    emptyTableAmongFit: fit.filter((r) => r.emptyFit).length,
    nearestFitMedianM: dists.length > 0 ? median(dists) / 1000 : null,
  };
}

/** Peak-window shares of one pair (level run against its 0% run): fractions of all seat-time in the pair's window. */
export function peakSplitOfPair(level: CollectedRun, base: CollectedRun): PeakSplit {
  const pm = pairMetrics(level.result.pair, base.result.pair, level.job.fraction);
  const denom = level.result.pair.seats * pm.peakWindowLengthMin * MINUTE_MS;
  const sum = (bins: Float64Array, c: number) => {
    let s = 0;
    for (let m = pm.peakWindowStartMin; m < pm.peakWindowStartMin + pm.peakWindowLengthMin; m++) if ((m + 1) * NCAT <= bins.length) s += bins[m * NCAT + c];
    return s / denom;
  };
  return {
    claimedEmptyBeyondSize: sum(level.seatCatBins, CE_BEYOND),
    claimedEmptyWaiting: sum(level.seatCatBins, CE_WAITING),
    blockedNoJoiners: sum(level.seatCatBins, BL_NO_JOINERS),
    blockedAfterJoiners: sum(level.seatCatBins, BL_AFTER_JOINERS),
    baselineHeldNoFood: sum(base.seatCatBins, HELD_NO_FOOD),
  };
}

/** Per-person parts of the trip (ms), or null when a timestamp is missing. */
function tripParts(r: CollectedRun, p: number): [toQueue: number, queueAndService: number, afterService: number, queueWait: number, withoutCutoff: number] | null {
  const q = r.people;
  const ent = q.entranceMs[p], join = q.joinMs[p], ss = q.serviceStartMs[p], se = q.serviceEndMs[p], out = q.outcomeMs[p];
  if (ent < 0 || join < 0 || ss < 0 || se < 0 || out < 0) return null;
  return [join - ent, se - join, out - se, ss - join, Math.max(out, se) - ent];
}

class TimeAcc {
  private perLunch: number[][] = [[], [], [], [], []];
  private sumAll = 0; private nAll = 0; private sumFc = 0; private nFc = 0;

  add(level: CollectedRun, base: CollectedRun): void {
    const s = [0, 0, 0, 0, 0];
    let n = 0;
    const P = level.people.entranceMs.length;
    for (let p = 0; p < P; p++) {
      const a = tripParts(level, p), b = tripParts(base, p);
      if (!a || !b) continue;
      const d = [a[0] - b[0], a[1] - b[1], a[2] - b[2], 0, a[4] - b[4]];
      d[3] = d[0] + d[1] + d[2];
      for (let k = 0; k < 5; k++) s[k] += d[k];
      n++;
      this.sumAll += d[3];
      this.nAll++;
      if (level.people.fallbackClaimer[p]) {
        this.sumFc += d[3];
        this.nFc++;
      }
    }
    for (let k = 0; k < 5; k++) this.perLunch[k].push(s[k] / n);
  }

  figures(): TimeSplit {
    const sec = (k: number) => mean(this.perLunch[k]) / 1000;
    return {
      toQueueS: sec(0),
      queueAndServiceS: sec(1),
      afterServiceS: sec(2),
      totalS: sec(3),
      totalWithoutCutoffS: sec(4),
      fallbackClaimerShare: this.sumFc / this.sumAll,
      fallbackClaimerPersonS: this.sumFc / this.nFc / 1000,
      fallbackClaimerPeopleShare: this.nFc / this.nAll,
    };
  }
}

export interface LevelFigures {
  emptyTables: number[];
  walkAways: WalkAwayAnatomy;
  /** Null at 0%. */
  claims: ClaimLevel | null;
  peakSeats: PeakSplit | null;
  time: TimeSplit | null;
}

export interface SweepFigures {
  n: number;
  /** By String(fraction). */
  levels: Record<string, LevelFigures>;
  baseline: Findings['time']['baseline'];
  stallBusyPeakPct: number;
  /** Every run's result, as runJob() would return it. */
  results: RunResult[];
  jobs: Job[];
}

/** Jobs like reservationJobs(), for the given fractions. */
export function sweepJobs(cfg: Config, n: number, fractions: number[]): Job[] {
  const seeds = batchSeeds(cfg.seed, n);
  const jobs: Job[] = [];
  for (const f of fractions) {
    seeds.forEach((seed, i) => {
      const c = cloneConfig(cfg);
      c.seed = seed;
      jobs.push({ key: `-|${f}|${i}`, seedIndex: i, seed, fraction: f, value: null, cfg: c });
    });
  }
  return jobs;
}

/** Instrumented sweep over `fractions` (the first must be 0), lunch by lunch, folded into per-level figures. */
export function sweepFigures(cfg: Config, n: number, fractions: number[], onProgress: (msg: string) => void = () => {}): SweepFigures {
  if (fractions[0] !== 0) throw new Error('the first fraction must be 0 (the baseline)');
  const jobs = sweepJobs(cfg, n, fractions);
  const nBins = Math.ceil((cfg.crowd.windowEnd - cfg.crowd.windowStart) / CLAIM_BIN_MIN);
  const acc = fractions.map((f) => ({
    f,
    empty: new Float64Array(EMPTY_TABLE_MINUTES + 1),
    walk: [] as WalkAwayRecord[],
    claims: f > 0 ? new ClaimAcc(n, nBins) : null,
    peak: [] as PeakSplit[],
    time: f > 0 ? new TimeAcc() : null,
  }));
  const baseParts: number[][] = [[], [], [], []];
  const busy: number[] = [];
  const results: RunResult[] = [];
  for (let i = 0; i < n; i++) {
    // The baseline comes first: every level run of this lunch is compared with it.
    const base = collectRun(jobs[i]);
    busy.push(base.stallBusyPeak);
    const s = [0, 0, 0, 0];
    let cnt = 0;
    for (let p = 0; p < base.people.entranceMs.length; p++) {
      const t = tripParts(base, p);
      if (!t) continue;
      for (let k = 0; k < 4; k++) s[k] += t[k];
      cnt++;
    }
    for (let k = 0; k < 4; k++) baseParts[k].push(s[k] / cnt);
    for (let li = 0; li < fractions.length; li++) {
      const r = li === 0 ? base : collectRun(jobs[li * n + i]);
      results.push(r.result);
      const a = acc[li];
      for (let m = 0; m <= EMPTY_TABLE_MINUTES; m++) a.empty[m] += r.emptyTables[m];
      a.walk.push(...r.walkAways);
      if (li === 0) continue;
      a.claims!.add(r);
      a.peak.push(peakSplitOfPair(r, base));
      a.time!.add(r, base);
    }
    onProgress(`lunch ${i + 1}/${n} done (${fractions.length} runs each)`);
  }
  const levels: Record<string, LevelFigures> = {};
  for (const a of acc) {
    const peak = a.peak.length === 0 ? null : (Object.fromEntries(
      (Object.keys(a.peak[0]) as (keyof PeakSplit)[]).map((k) => [k, mean(a.peak.map((x) => x[k]))]),
    ) as unknown as PeakSplit);
    levels[String(a.f)] = {
      emptyTables: Array.from(a.empty, (x) => x / n),
      walkAways: walkAwayFigures(a.walk),
      claims: a.claims ? a.claims.figures() : null,
      peakSeats: a.f > 0 ? peak : null,
      time: a.time ? a.time.figures() : null,
    };
  }
  const sec = (k: number) => mean(baseParts[k]) / 1000;
  return {
    n, levels, results, jobs,
    baseline: { toQueueS: sec(0), queueAndServiceS: sec(1), afterServiceS: sec(2), queueWaitS: sec(3) },
    stallBusyPeakPct: 100 * mean(busy),
  };
}

// ---------------------------------------------------------------- robustness

export interface Variant { id: string; label: string; make: () => Config }

const withSetting = (id: string, v: number | boolean) => () => {
  const c = defaultConfig();
  setSetting(c, id, v);
  return c;
};

/** Robustness rows (spec §10.9): the defaults, then eight other settings, in display order. */
export const VARIANTS: Variant[] = [
  { id: 'default', label: 'Default (1,800 people)', make: defaultConfig },
  { id: 'quiet', label: 'Quiet day (800 people)', make: () => presetConfig('quiet') },
  { id: 'people1200', label: '1,200 people', make: withSetting('crowd.totalPeople', 1200) },
  { id: 'crush', label: 'Crush (2,600 people, 75% in the rush)', make: () => presetConfig('crush') },
  { id: 'reservationFriendly', label: 'Reservation-friendly settings', make: () => presetConfig('reservationFriendly') },
  { id: 'patience600', label: 'Searcher gives up after 10 minutes (default 5)', make: withSetting('search.patience', 600) },
  { id: 'noSharing', label: 'Reserved tables never shared', make: withSetting('reserve.shareMinEmpty', 6) },
  { id: 'service60', label: 'Faster stalls (60 s per person, default 90)', make: withSetting('stalls.serviceMean', 60) },
  { id: 'parallel', label: 'All groupmates with food search at once', make: withSetting('search.parallel', true) },
];

/** '<id> <old> → <new>' for every setting that differs from the defaults, in settings-table order. */
export function settingChanges(cfg: Config, base: Config = defaultConfig()): string[] {
  const fmt = (v: unknown) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));
  const out: string[] = [];
  for (const m of META) {
    const a = getSetting(base, m.id), b = getSetting(cfg, m.id);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${m.id} ${fmt(a)} → ${fmt(b)}`);
  }
  return out;
}

function findingStat(stats: ReturnType<typeof aggregate>['stats'], metricId: string, scale = 1): FindingStat {
  const s = stats.find((x) => x.fraction === 1 && x.metricId === metricId);
  if (!s || s.meanA === null || s.meanB === null || s.adv.mean === null || s.adv.lo === null || s.adv.hi === null || !s.wins) {
    throw new Error(`no 100% vs 0% statistic with an interval for ${metricId}`);
  }
  return { a: s.meanA * scale, b: s.meanB * scale, adv: s.adv.mean * scale, lo: s.adv.lo * scale, hi: s.adv.hi * scale, W: s.wins.W, T: s.wins.T, L: s.wins.L };
}

/** One robustness row from finished runs at fractions 0 and 1 (keys '-|0|i' and '-|1|i'). */
export function robustRow(v: Variant, results: RunResult[]): RobustRow {
  const cfg = v.make();
  const n = Math.max(...results.map((r) => r.seedIndex)) + 1;
  const jobs = sweepJobs(cfg, n, [0, 1]);
  const b = aggregate('reservation', jobs, results);
  const byKey = new Map(results.map((r) => [r.key, r]));
  let seatedSum = 0, seatedN = 0, walkedSum = 0, walkedN = 0;
  for (let i = 0; i < n; i++) {
    const A = byKey.get(`-|1|${i}`), B = byKey.get(`-|0|${i}`);
    if (!A || !B || A.metrics.truncated || B.metrics.truncated) continue;
    const a = A.pair, z = B.pair;
    for (let p = 0; p < a.e2sMs.length; p++) {
      if (a.e2sMs[p] < 0 || z.e2sMs[p] < 0) continue;
      if (!a.walkedAway[p] && !z.walkedAway[p]) {
        seatedSum += a.e2sMs[p] - z.e2sMs[p];
        seatedN++;
      } else if (a.walkedAway[p] && z.walkedAway[p]) {
        walkedSum += a.e2sMs[p] - z.e2sMs[p];
        walkedN++;
      }
    }
  }
  return {
    id: v.id,
    label: v.label,
    changes: settingChanges(cfg),
    walkAway: findingStat(b.stats, 'walkAwayPct'),
    e2sMin: findingStat(b.stats, 'entranceToSeatMeanMin'),
    peakUtilPct: findingStat(b.stats, 'peakUtilization', 100),
    peakThroughput: findingStat(b.stats, 'peakThroughputPerHour'),
    seatedE2sDeltaMin: seatedSum / seatedN / MINUTE_MS,
    walkAwayE2sDeltaMin: walkedN > 0 ? walkedSum / walkedN / MINUTE_MS : null,
  };
}

// ---------------------------------------------------------------- assembly

/** Round every non-integer to 6 significant digits; a non-finite number is a bug (the types have no room for it). */
function tidy<T>(x: T, path = ''): T {
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new Error(`findings: ${path} is ${x}`);
    return (Number.isInteger(x) ? x : Number(x.toPrecision(6))) as T;
  }
  if (Array.isArray(x)) return x.map((v, i) => tidy(v, `${path}[${i}]`)) as T;
  if (x !== null && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, tidy(v, path ? `${path}.${k}` : k)])) as T;
  }
  return x;
}

/**
 * All Findings figures: the default sweep (fractions 0…1, n lunches each) with instrumentation, then 100% vs 0% on
 * the same n lunches under each other VARIANTS setting. Deterministic. With `evidence`, every default run's hash must
 * equal the evidence's (proof the instrumentation changed nothing), and the digest is recorded.
 */
export function computeFindings(opts: { n?: number; onProgress?: (msg: string) => void; evidence?: Pick<Evidence, 'runs'> } = {}): Findings {
  const n = opts.n ?? 30;
  const log = opts.onProgress ?? (() => {});
  const stale = 'if the engine changed, run npm run precompute first; otherwise the instrumentation altered a run';
  if (opts.evidence) {
    // Fail in seconds, not after the sweep, when the evidence is stale.
    const first = sweepJobs(defaultConfig(), 1, [0])[0];
    const want = opts.evidence.runs.find((r) => r.k === first.key)?.h;
    if (runJob(first).hash !== want) throw new Error(`run ${first.key} differs from evidence.json: run npm run precompute first`);
  }
  log(`default sweep: ${RESERVATION_LEVELS.length} levels × ${n} lunches`);
  const sweep = sweepFigures(defaultConfig(), n, RESERVATION_LEVELS, (m) => log(`default sweep: ${m}`));
  if (opts.evidence) {
    const expected = new Map(opts.evidence.runs.map((r) => [r.k, r.h]));
    const bad = sweep.results.filter((r) => expected.get(r.key) !== r.hash).map((r) => r.key);
    if (bad.length > 0) throw new Error(`${bad.length} of ${sweep.results.length} runs differ from evidence.json (first: ${bad[0]}): ${stale}`);
  }
  const robustness: RobustRow[] = [];
  for (const v of VARIANTS) {
    let results: RunResult[];
    if (v.id === 'default') {
      results = sweep.results.filter((r) => r.fraction === 0 || r.fraction === 1);
    } else {
      const cfg = v.make();
      const blocking = validate(cfg).blocking;
      if (blocking.length > 0) throw new Error(`${v.id} cannot run: ${blocking.map((x) => x.message).join(' ')}`);
      results = sweepJobs(cfg, n, [0, 1]).map(runJob);
    }
    robustness.push(robustRow(v, results));
    log(`robustness: ${v.id} done`);
  }
  const level = (k: LevelKey) => sweep.levels[k];
  const perLevel = <T>(keys: LevelKey[], get: (l: LevelFigures) => T) => Object.fromEntries(keys.map((k) => [k, get(level(k))]));
  return tidy({
    v: 1,
    model: MODEL_VERSION,
    evidenceDigest: opts.evidence ? evidenceDigest(opts.evidence) : 0,
    n,
    emptyTables: { stepMin: 1, byLevel: perLevel(LEVEL_KEYS, (l) => l.emptyTables) as Record<LevelKey, number[]> },
    claims: { binMin: CLAIM_BIN_MIN as 10, byLevel: perLevel(RESERVE_LEVEL_KEYS, (l) => l.claims!) as Record<ReserveLevelKey, ClaimLevel> },
    peakSeats: perLevel(RESERVE_LEVEL_KEYS, (l) => l.peakSeats!) as Record<ReserveLevelKey, PeakSplit>,
    walkAways: perLevel(LEVEL_KEYS, (l) => l.walkAways) as Record<LevelKey, WalkAwayAnatomy>,
    time: {
      baseline: sweep.baseline,
      byLevel: perLevel(RESERVE_LEVEL_KEYS, (l) => l.time!) as Record<ReserveLevelKey, TimeSplit>,
      stallBusyPeakPct: sweep.stallBusyPeakPct,
    },
    robustness,
  });
}
