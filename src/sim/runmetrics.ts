import { HOUR_MS, MINUTE_MS, meanOrNull, peakThroughput, quantile, STATES } from './metrics';
import { SEAT } from './seating';
import type { World } from './world';

export interface SizeBreakdown {
  size: number;
  groups: number;
  people: number;
  walkAwayPct: number | null;
  entranceToSeatMeanMin: number | null;
  foodToSeatMeanMin: number | null;
}

/** Metrics that depend on one run only (spec §7.7). Folded into the run hash and written one CSV row per run. */
export interface RunMetrics {
  seed: number;
  reserveFraction: number;
  truncated: boolean;
  endMs: number;
  arrivals: number;
  groups: number;
  seated: number;
  walkAways: number;
  walkAwayGroups: number;
  /** P1. */
  walkAwayPct: number | null;
  /** P2. */
  entranceToSeatMeanMin: number | null;
  /** P4. */
  peakThroughputPerHour: number;
  entranceToSeatMedianMin: number | null;
  entranceToSeatP90Min: number | null;
  foodToSeatMeanMin: number | null;
  foodToSeatMedianMin: number | null;
  foodToSeatP90Min: number | null;
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
  splitFeasibleGroups: number;
  splitFeasiblePeople: number;
  splitFeasibleGroupsPct: number | null;
  splitFeasiblePeoplePct: number | null;
  splitFeasibleGroupsBySize: number[];
  splitFeasiblePeopleBySize: number[];
  standingWithFoodPersonMin: number;
  walkAwayServedAfterDecision: number;
  walkAwayServedAfterDecisionPct: number | null;
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
  const f2s: number[] = [];
  const visits: number[] = [];
  const waits: number[] = [];
  let seated = 0;
  let servedAfter = 0;
  const sizeE2s: number[][] = [[], [], [], [], [], []];
  const sizeF2s: number[][] = [[], [], [], [], [], []];
  const stallServed = new Array(w.st.S).fill(0);
  for (let p = 0; p < P; p++) {
    const G = w.groupOf(p);
    const sit = w.sitStartMs[p];
    if (sit >= 0) seated++;
    const outcome = sit >= 0 ? sit : G.walkedAway ? G.walkAwayMs : -1;
    const se = w.st.serviceEndMs[p];
    if (outcome >= 0) {
      e2s.push(outcome - w.entranceMs[p]);
      sizeE2s[G.size - 1].push(outcome - w.entranceMs[p]);
      if (se >= 0 && se <= outcome) {
        f2s.push(outcome - se);
        sizeF2s[G.size - 1].push(outcome - se);
      }
    }
    if (G.walkedAway && se > G.walkAwayMs) servedAfter++;
    if (sit >= 0 && w.exitMs[p] >= 0) visits.push(w.exitMs[p] - w.entranceMs[p]);
    if (w.st.serviceStartMs[p] >= 0) {
      waits.push(w.st.serviceStartMs[p] - w.st.joinMs[p]);
      stallServed[w.st.chosen[p]]++;
    }
  }
  const asc = (a: number, b: number) => a - b;
  e2s.sort(asc);
  f2s.sort(asc);
  visits.sort(asc);
  waits.sort(asc);

  const c = w.clock;
  const dem = c.demandMs;
  const blocked = dem > 0 ? (c.demandAccum[SEAT.HELD] + c.demandAccum[SEAT.CLAIMED_EMPTY] + c.demandAccum[SEAT.BLOCKED]) / (seats * dem) : 0;
  const openDem = dem > 0 ? c.demandAccum[SEAT.OPEN] / (seats * dem) : 0;

  const search: number[] = [];
  const claimTimes: number[] = [];
  let reserving = 0, claimedGroups = 0, walkGroups = 0, sfGroups = 0, sfPeople = 0;
  const sfG = [0, 0, 0, 0, 0, 0], sfP = [0, 0, 0, 0, 0, 0];
  const sizeGroups = [0, 0, 0, 0, 0, 0], sizePeople = [0, 0, 0, 0, 0, 0], sizeWalk = [0, 0, 0, 0, 0, 0];
  for (const G of w.groups) {
    sizeGroups[G.size - 1]++;
    sizePeople[G.size - 1] += G.size;
    if (G.reserver) {
      reserving++;
      if (G.claimEndMs >= 0) claimTimes.push(G.claimEndMs - G.arrivalMs);
    }
    if (G.claimed) {
      claimedGroups++;
      search.push(0);
    } else if (G.searcherFoodMs >= 0) {
      const end = G.commitMs >= 0 ? G.commitMs : G.walkAwayMs;
      if (end >= 0) search.push(end - G.searcherFoodMs);
    }
    if (G.walkedAway) {
      walkGroups++;
      sizeWalk[G.size - 1] += G.size;
      if (G.splitFeasible) {
        sfGroups++;
        sfPeople += G.size;
        sfG[G.size - 1]++;
        sfP[G.size - 1] += G.size;
      }
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
    walkAways: w.walkAwayPeople,
    walkAwayGroups: walkGroups,
    walkAwayPct: arrivals > 0 ? (100 * w.walkAwayPeople) / arrivals : null,
    entranceToSeatMeanMin: min(meanOrNull(e2s)),
    peakThroughputPerHour: peakThroughput(w.sitTimes),
    entranceToSeatMedianMin: min(quantile(e2s, 50)),
    entranceToSeatP90Min: min(quantile(e2s, 90)),
    foodToSeatMeanMin: min(meanOrNull(f2s)),
    foodToSeatMedianMin: min(quantile(f2s, 50)),
    foodToSeatP90Min: min(quantile(f2s, 90)),
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
    splitFeasibleGroups: sfGroups,
    splitFeasiblePeople: sfPeople,
    splitFeasibleGroupsPct: walkGroups > 0 ? (100 * sfGroups) / walkGroups : null,
    splitFeasiblePeoplePct: w.walkAwayPeople > 0 ? (100 * sfPeople) / w.walkAwayPeople : null,
    splitFeasibleGroupsBySize: sfG,
    splitFeasiblePeopleBySize: sfP,
    standingWithFoodPersonMin: c.standingMs / MINUTE_MS,
    walkAwayServedAfterDecision: servedAfter,
    walkAwayServedAfterDecisionPct: w.walkAwayPeople > 0 ? (100 * servedAfter) / w.walkAwayPeople : null,
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
      walkAwayPct: sizePeople[i] > 0 ? (100 * sizeWalk[i]) / sizePeople[i] : null,
      entranceToSeatMeanMin: min(meanOrNull(sizeE2s[i])),
      foodToSeatMeanMin: min(meanOrNull(sizeF2s[i])),
    })),
    stallServed,
  };
}
