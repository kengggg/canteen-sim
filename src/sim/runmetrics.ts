import { HOUR_MS, MINUTE_MS, meanOrNull, peakThroughput, quantile, STATES } from './metrics';
import { SEAT } from './seating';
import type { World } from './world';

export interface SizeBreakdown {
  size: number;
  groups: number;
  people: number;
  leftPct: number | null;
  /** Seated diners only. */
  entranceToSeatMeanMin: number | null;
  plateMeanMin: number | null;
}

/** Metrics that depend on one run only (spec §7.7, design §4). Folded into the run hash and written one CSV row per run. */
export interface RunMetrics {
  seed: number;
  reserveFraction: number;
  truncated: boolean;
  endMs: number;
  arrivals: number;
  groups: number;
  seated: number;
  leftPeople: number;
  /** P1: left without eating, % of arrivals. */
  leftPct: number | null;
  /** P2: time carrying a plate (service end → sit start), mean over everyone served. */
  plateMeanMin: number | null;
  /** P4. */
  peakThroughputPerHour: number;
  plateMedianMin: number | null;
  plateP90Min: number | null;
  /** Entrance → sit start, seated diners only. */
  entranceToSeatMeanMin: number | null;
  entranceToSeatMedianMin: number | null;
  entranceToSeatP90Min: number | null;
  /** Most people holding food with no seat committed or assigned, at once. */
  peakPlatesWithoutSeat: number;
  /** Groups with at least one split commit, and their % of groups with a member served. */
  groupsSplit: number;
  groupsSplitPct: number | null;
  blockedWhileNeeded: number;
  demandMinutes: number;
  openToSmallDuringDemand: number;
  seatSearchMeanMin: number | null;
  seatSearchP90Min: number | null;
  queueWaitMeanMin: number | null;
  queueWaitP90Min: number | null;
  utilizationWhole: number;
  shareFree: number;
  shareOpenToSmall: number;
  shareBlockedLeftover: number;
  shareClaimedEmpty: number;
  shareHeld: number;
  shareOccupied: number;
  seatEfficiencyOpenAvailable: number | null;
  seatEfficiencyOpenWaste: number | null;
  turnedAwayClaimed: number;
  turnedAwayHeld: number;
  reservingGroups: number;
  claimedGroups: number;
  fallbackReservers: number;
  claimSearchMeanMin: number | null;
  standingWithFoodPersonMin: number;
  visitMeanMin: number | null;
  visitMedianMin: number | null;
  visitP90Min: number | null;
  stuckMinutes: number;
  events: number;
  eventsPerKind: number[];
  bySize: SizeBreakdown[];
  stallServed: number[];
}

const min = (ms: number | null) => (ms === null ? null : ms / MINUTE_MS);

export function computeRunMetrics(w: World): RunMetrics {
  const P = w.pop.personCount;
  const seats = w.pc.L.seats.length;
  const e2s: number[] = [];
  const plate: number[] = [];
  const visits: number[] = [];
  const waits: number[] = [];
  let seated = 0;
  const sizeE2s: number[][] = [[], [], [], [], [], []];
  const sizePlate: number[][] = [[], [], [], [], [], []];
  const sizeLeft = [0, 0, 0, 0, 0, 0];
  const stallServed = new Array(w.st.S).fill(0);
  const fed = new Uint8Array(w.groups.length);
  for (let p = 0; p < P; p++) {
    const g = w.pop.group[p];
    const n = w.pop.size[g];
    const sit = w.sitStartMs[p];
    const se = w.st.serviceEndMs[p];
    if (se >= 0) fed[g] = 1;
    if (sit >= 0) {
      seated++;
      e2s.push(sit - w.entranceMs[p]);
      sizeE2s[n - 1].push(sit - w.entranceMs[p]);
      plate.push(sit - se);
      sizePlate[n - 1].push(sit - se);
      if (w.exitMs[p] >= 0) visits.push(w.exitMs[p] - w.entranceMs[p]);
    }
    if (w.leftKind[p] !== 0) sizeLeft[n - 1]++;
    if (w.st.serviceStartMs[p] >= 0) {
      waits.push(w.st.serviceStartMs[p] - w.st.joinMs[p]);
      stallServed[w.st.chosen[p]]++;
    }
  }
  const asc = (a: number, b: number) => a - b;
  e2s.sort(asc);
  plate.sort(asc);
  visits.sort(asc);
  waits.sort(asc);

  const c = w.clock;
  const dem = c.demandMs;
  const blocked = dem > 0 ? (c.demandAccum[SEAT.HELD] + c.demandAccum[SEAT.CLAIMED_EMPTY] + c.demandAccum[SEAT.BLOCKED]) / (seats * dem) : 0;
  const openDem = dem > 0 ? c.demandAccum[SEAT.OPEN] / (seats * dem) : 0;

  const search: number[] = [];
  const claimTimes: number[] = [];
  let reserving = 0, claimedGroups = 0, splitGroups = 0, fedGroups = 0;
  const sizeGroups = [0, 0, 0, 0, 0, 0], sizePeople = [0, 0, 0, 0, 0, 0];
  for (const G of w.groups) {
    const n = w.pop.size[G.g];
    sizeGroups[n - 1]++;
    sizePeople[n - 1] += n;
    if (fed[G.g]) fedGroups++;
    if (G.splits > 0) splitGroups++;
    if (G.reserver) {
      reserving++;
      if (G.claimEndMs >= 0) claimTimes.push(G.claimEndMs - G.arrivalMs);
    }
    if (G.claimed) {
      claimedGroups++;
      search.push(0);
    } else if (G.searcherFoodMs >= 0 && G.lastCommitMs >= 0) {
      search.push(G.lastCommitMs - G.searcherFoodMs);
    }
  }
  search.sort(asc);

  const endMin = Math.min(c.minutes, Math.ceil((w.T + HOUR_MS) / MINUTE_MS));
  let occWhole = 0;
  for (let m = 0; m < endMin; m++) occWhole += c.bins[m * STATES + SEAT.OCCUPIED];
  const util = occWhole / (seats * (w.T + HOUR_MS));
  let total = 0;
  for (let s = 0; s < STATES; s++) total += c.accum[s];
  const share = (s: number) => (total > 0 ? c.accum[s] / total : 0);
  const occ = c.accum[SEAT.OCCUPIED];
  const waste = c.accum[SEAT.HELD] + c.accum[SEAT.CLAIMED_EMPTY] + c.accum[SEAT.BLOCKED];
  const eff1 = occ + waste > 0 ? occ / (occ + waste) : null;
  const eff2 = occ + waste + c.accum[SEAT.OPEN] > 0 ? occ / (occ + waste + c.accum[SEAT.OPEN]) : null;

  const arrivals = w.arrived;
  const eventsPerKind = [1, 2, 3, 4, 5, 6, 7].map((k) => w.eventsPerKind[k]);
  return {
    seed: w.seed,
    reserveFraction: w.fraction,
    truncated: w.truncated,
    endMs: w.now,
    arrivals,
    groups: w.groups.length,
    seated,
    leftPeople: w.leftPeople,
    leftPct: arrivals > 0 ? (100 * w.leftPeople) / arrivals : null,
    plateMeanMin: min(meanOrNull(plate)),
    peakThroughputPerHour: peakThroughput(w.sitTimes),
    plateMedianMin: min(quantile(plate, 50)),
    plateP90Min: min(quantile(plate, 90)),
    entranceToSeatMeanMin: min(meanOrNull(e2s)),
    entranceToSeatMedianMin: min(quantile(e2s, 50)),
    entranceToSeatP90Min: min(quantile(e2s, 90)),
    peakPlatesWithoutSeat: w.platesNoSeatMax,
    groupsSplit: splitGroups,
    groupsSplitPct: fedGroups > 0 ? (100 * splitGroups) / fedGroups : null,
    blockedWhileNeeded: blocked,
    demandMinutes: dem / MINUTE_MS,
    openToSmallDuringDemand: openDem,
    seatSearchMeanMin: min(meanOrNull(search)),
    seatSearchP90Min: min(quantile(search, 90)),
    queueWaitMeanMin: min(meanOrNull(waits)),
    queueWaitP90Min: min(quantile(waits, 90)),
    utilizationWhole: util,
    shareFree: share(SEAT.FREE),
    shareOpenToSmall: share(SEAT.OPEN),
    shareBlockedLeftover: share(SEAT.BLOCKED),
    shareClaimedEmpty: share(SEAT.CLAIMED_EMPTY),
    shareHeld: share(SEAT.HELD),
    shareOccupied: share(SEAT.OCCUPIED),
    seatEfficiencyOpenAvailable: eff1,
    seatEfficiencyOpenWaste: eff2,
    turnedAwayClaimed: w.turnedAwayClaimed,
    turnedAwayHeld: w.turnedAwayHeld,
    reservingGroups: reserving,
    claimedGroups,
    fallbackReservers: w.fallbackGroups,
    claimSearchMeanMin: min(meanOrNull(claimTimes)),
    standingWithFoodPersonMin: c.standingMs / MINUTE_MS,
    visitMeanMin: min(meanOrNull(visits)),
    visitMedianMin: min(quantile(visits, 50)),
    visitP90Min: min(quantile(visits, 90)),
    stuckMinutes: c.stuckMs / MINUTE_MS,
    events: eventsPerKind.reduce((a, b) => a + b, 0),
    eventsPerKind,
    bySize: sizeGroups.map((g, i) => ({
      size: i + 1,
      groups: g,
      people: sizePeople[i],
      leftPct: sizePeople[i] > 0 ? (100 * sizeLeft[i]) / sizePeople[i] : null,
      entranceToSeatMeanMin: min(meanOrNull(sizeE2s[i])),
      plateMeanMin: min(meanOrNull(sizePlate[i])),
    })),
    stallServed,
  };
}
