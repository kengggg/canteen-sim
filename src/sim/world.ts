import type { Config } from '../config/schema';
import { toLayoutParams } from '../config/validate';
import { EventQueue } from './events';
import { Fnv } from './hash';
import { SeatClock } from './metrics';
import { Movement } from './movement';
import { buildPopulation, type Population } from './population';
import { getPrecomp, type Precomp } from './precompute';
import { STREAM, uniform } from './rng';
import { popcount, seatStateOf } from './seating';
import type { Memory } from './search';
import { Stalls } from './stalls';
import { EV, EXTRA_MS, GM, K, PH } from './types';

export interface GroupState {
  g: number;
  first: number;
  size: number;
  arrivalMs: number;
  reserver: boolean;
  mode: number;
  fallback: boolean;
  claimed: boolean;
  // Claim search (reserving groups).
  claimer: number;
  claimTable: number;
  claimTargetTable: number;
  claimTargetNode: number;
  frozen: boolean;
  cutoffPassed: boolean;
  claimEndMs: number;
  firstSide: number;
  fill: number[];
  fillIdx: number;
  history: number[];
  sumCache: Int32Array | null;
  // Free-flow search.
  searcher: number;
  searchers: number[];
  mem: Memory | null;
  targetOf: Map<number, number>;
  committedTable: number;
  joinedTable: number;
  commitMs: number;
  searcherFoodMs: number;
  patienceStamp: number;
  walkPending: boolean;
  pendingAsks: number;
  walkedAway: boolean;
  walkAwayMs: number;
  splitFeasible: boolean;
  // Eating and leaving.
  sitStarted: number;
  eatDone: number;
  standLeft: number;
}

export interface EngineOpts {
  seed?: number;
  reserveFraction?: number;
  trace?: (event: string, a: number, b: number, c: number) => void;
  /** With __SIM_INVARIANTS__, check invariants after every n-th event (default 1000) and at the end. */
  invariantEvery?: number;
}

/** All mutable state of one run, plus low-level helpers shared by the behaviour code. */
export class World {
  readonly cfg: Config;
  readonly seed: number;
  readonly fraction: number;
  readonly pc: Precomp;
  readonly pop: Population;
  readonly q = new EventQueue(4096);
  readonly mv: Movement;
  readonly st: Stalls;
  readonly clock: SeatClock;
  readonly hash = new Fnv();
  readonly trace?: EngineOpts['trace'];

  // Constants in integer units.
  readonly T: number;
  readonly simEnd: number;
  readonly walk: number;
  readonly tray: number;
  readonly patienceMs: number;
  readonly claimLimitMs: number;
  readonly lingerMs: number;
  readonly dropMs: number;
  readonly detourMm: number;
  readonly k: number;
  readonly k2: number;
  readonly fullMask: number;
  readonly N: number;
  readonly together: boolean;
  readonly parallel: boolean;

  now = 0;
  done = false;
  truncated = false;
  private admitPending = false;

  // Per person.
  readonly phase: Uint8Array;
  readonly phaseSince: Float64Array;
  readonly purpose: Uint8Array;
  readonly target: Int32Array;
  readonly hopValid: Uint8Array;
  readonly hopLink: Int32Array;
  readonly hopToward: Int32Array;
  readonly hopNext: Int32Array;
  readonly hasFood: Uint8Array;
  readonly usedTray: Uint8Array;
  readonly searching: Uint8Array;
  readonly stuck: Uint8Array;
  readonly standingFood: Uint8Array;
  readonly queuing: Uint8Array;
  readonly seat: Int32Array;
  readonly askTable: Int32Array;
  readonly askAtClaimed: Uint8Array;
  readonly provisional: Int32Array;
  readonly fullStall: Int32Array;
  readonly histIdx: Int32Array;
  readonly waitingLeader: Uint8Array;
  readonly rechooseStamp: Int32Array;
  readonly sitStartMs: Float64Array;
  readonly standMs: Float64Array;
  readonly dropEndMs: Float64Array;
  readonly exitMs: Float64Array;
  readonly entranceMs: Float64Array;
  readonly nodeWaitSince: Float64Array;

  // Per group.
  readonly groups: GroupState[];

  // Per table and seat.
  readonly occMask: Int32Array;
  readonly heldMask: Int32Array;
  readonly claimedBy: Int32Array;
  readonly claimedFlag: Uint8Array;
  readonly complete: Uint8Array;
  readonly claimSince: Float64Array;
  readonly seatState: Uint8Array;
  readonly seatGroup: Int32Array;
  readonly seatPerson: Int32Array;

  // Tray return.
  trayBusy = 0;
  readonly trayFifo: number[] = [];
  readonly traySlots: number;

  // Counters.
  arrived = 0;
  exited = 0;
  walkAwayPeople = 0;
  turnedAwayClaimed = 0;
  turnedAwayHeld = 0;
  fallbackGroups = 0;
  searchingNow = 0;
  claimingNow = 0;
  queuingNow = 0;
  readonly eventsPerKind = new Float64Array(8);
  readonly sitTimes: number[] = [];
  outcomeSumMs = 0;
  outcomeCount = 0;
  outcomeEntranceSum = 0;
  sitWinLeft = 0;
  sitWinMax = 0;
  arrivedEntranceSum = 0;
  lastEventMs = 0;
  version = 0;

  constructor(cfg: Config, opts: EngineOpts = {}) {
    this.cfg = cfg;
    this.seed = (opts.seed ?? cfg.seed) >>> 0;
    this.fraction = opts.reserveFraction ?? cfg.reserve.percentA;
    this.trace = opts.trace;
    const lp = toLayoutParams(cfg);
    this.pc = getPrecomp(lp, Math.round(cfg.search.visibility * 1000));
    this.pop = buildPopulation(cfg, this.seed);
    this.T = (cfg.crowd.windowEnd - cfg.crowd.windowStart) * 60_000;
    this.simEnd = this.T + EXTRA_MS;
    this.walk = Math.round(cfg.move.walkSpeed * 1000);
    this.tray = Math.round(cfg.move.traySpeed * 1000);
    this.patienceMs = Math.round(cfg.search.patience * 1000);
    this.claimLimitMs = Math.round(cfg.reserve.claimSearchLimit * 1000);
    this.lingerMs = Math.round(cfg.eat.linger * 1000);
    this.dropMs = Math.round(cfg.tray.dropTime * 1000);
    this.detourMm = Math.round(cfg.search.emptyTableDetour * 1000);
    this.k = lp.seatsPerSide;
    this.k2 = 2 * this.k;
    this.fullMask = (1 << this.k2) - 1;
    this.N = this.pc.nodeCount;
    this.together = cfg.reserve.claimMode === 'together';
    this.parallel = cfg.search.parallel;
    this.traySlots = cfg.tray.slots;

    const P = this.pop.personCount;
    this.mv = new Movement(this.pc.G, P, {
      scheduleArrival: (p, ms) => this.q.push(ms, K.MOVE, this.pop.personId[p], EV.EDGE_ARRIVE, p, 0),
      requestAdmit: () => this.requestAdmit(),
    });
    this.st = new Stalls(this.pc, this.pop, cfg, this.seed, {
      scheduleQueue: (ms, stall, type, p) => this.q.push(ms, K.QUEUE, stall, EV.QUEUE, p, type),
      scheduleServiceEnd: (p, ms) => this.q.push(ms, K.SERVICE, this.pop.personId[p], EV.SERVICE_END, p, 0),
      onServiceStart: (p) => this.setPhase(p, PH.SERVING),
    });
    const seats = this.pc.L.seats.length;
    this.clock = new SeatClock(seats, this.simEnd);

    this.phase = new Uint8Array(P);
    this.phaseSince = new Float64Array(P);
    this.purpose = new Uint8Array(P);
    this.target = new Int32Array(P).fill(-1);
    this.hopValid = new Uint8Array(P);
    this.hopLink = new Int32Array(P);
    this.hopToward = new Int32Array(P);
    this.hopNext = new Int32Array(P);
    this.hasFood = new Uint8Array(P);
    this.usedTray = new Uint8Array(P);
    this.searching = new Uint8Array(P);
    this.stuck = new Uint8Array(P);
    this.standingFood = new Uint8Array(P);
    this.queuing = new Uint8Array(P);
    this.seat = new Int32Array(P).fill(-1);
    this.askTable = new Int32Array(P).fill(-1);
    this.askAtClaimed = new Uint8Array(P);
    this.provisional = new Int32Array(P).fill(-1);
    this.fullStall = new Int32Array(P).fill(-1);
    this.histIdx = new Int32Array(P);
    this.waitingLeader = new Uint8Array(P);
    this.rechooseStamp = new Int32Array(P);
    this.sitStartMs = new Float64Array(P).fill(-1);
    this.standMs = new Float64Array(P).fill(-1);
    this.dropEndMs = new Float64Array(P).fill(-1);
    this.exitMs = new Float64Array(P).fill(-1);
    this.entranceMs = new Float64Array(P).fill(-1);
    this.nodeWaitSince = new Float64Array(P).fill(-1);

    const G = this.pop.groupCount;
    this.groups = new Array(G);
    for (let g = 0; g < G; g++) {
      this.groups[g] = {
        g, first: this.pop.firstPerson[g], size: this.pop.size[g], arrivalMs: this.pop.arrivalMs[g],
        reserver: this.pop.reserveDraw[g] < this.fraction, mode: GM.FREE, fallback: false, claimed: false,
        claimer: -1, claimTable: -1, claimTargetTable: -1, claimTargetNode: -1, frozen: false, cutoffPassed: false,
        claimEndMs: -1, firstSide: 0, fill: [], fillIdx: 0, history: [], sumCache: null,
        searcher: -1, searchers: [], mem: null, targetOf: new Map(), committedTable: -1, joinedTable: -1, commitMs: -1,
        searcherFoodMs: -1, patienceStamp: 0, walkPending: false, pendingAsks: 0, walkedAway: false, walkAwayMs: -1,
        splitFeasible: false, sitStarted: 0, eatDone: 0, standLeft: 0,
      };
      this.q.push(this.pop.arrivalMs[g], K.ARRIVAL, this.pop.personId[this.pop.firstPerson[g]], EV.GROUP_ARRIVE, g, 0);
    }

    const T = this.pc.tableCount;
    this.occMask = new Int32Array(T);
    this.heldMask = new Int32Array(T);
    this.claimedBy = new Int32Array(T).fill(-1);
    this.claimedFlag = new Uint8Array(T);
    this.complete = new Uint8Array(T);
    this.claimSince = new Float64Array(T).fill(-1);
    this.seatState = new Uint8Array(seats);
    this.seatGroup = new Int32Array(seats).fill(-1);
    this.seatPerson = new Int32Array(seats).fill(-1);
  }

  // ---------------------------------------------------------------- scheduling

  requestAdmit(): void {
    if (this.admitPending) return;
    this.admitPending = true;
    this.q.push(this.now, K.ADMIT, 0, EV.ADMIT, 0, 0);
  }

  admitPopped(): void {
    this.admitPending = false;
  }

  admitIsPending(): boolean {
    return this.admitPending;
  }

  schedule(ms: number, kind: number, entity: number, type: number, arg: number, stamp = 0): void {
    this.q.push(ms, kind, entity, type, arg, stamp);
  }

  pidOf(p: number): number {
    return this.pop.personId[p];
  }

  groupOf(p: number): GroupState {
    return this.groups[this.pop.group[p]];
  }

  // ---------------------------------------------------------------- person state

  setPhase(p: number, ph: number): void {
    if (this.phase[p] !== ph) {
      this.phase[p] = ph;
      this.phaseSince[p] = this.now;
    }
  }

  speedOf(p: number): number {
    return this.hasFood[p] || this.usedTray[p] ? this.tray : this.walk;
  }

  setStuck(p: number, on: boolean): void {
    if ((this.stuck[p] === 1) === on) return;
    this.stuck[p] = on ? 1 : 0;
    this.clock.setStuck(this.clock.stuck + (on ? 1 : -1));
  }

  setStandingFood(p: number, on: boolean): void {
    if ((this.standingFood[p] === 1) === on) return;
    this.standingFood[p] = on ? 1 : 0;
    this.clock.setStanding(this.clock.standing + (on ? 1 : -1));
  }

  setQueuing(p: number, on: boolean): void {
    if ((this.queuing[p] === 1) === on) return;
    this.queuing[p] = on ? 1 : 0;
    this.queuingNow += on ? 1 : -1;
  }

  setSearching(p: number, on: boolean): void {
    if ((this.searching[p] === 1) === on) return;
    this.searching[p] = on ? 1 : 0;
    if (this.hasFood[p]) this.searchingNow += on ? 1 : -1;
  }

  // ---------------------------------------------------------------- tables and seats

  tableOfSeat(s: number): number {
    return Math.floor(s / this.k2);
  }

  freeMaskOf(t: number): number {
    return ~(this.occMask[t] | this.heldMask[t]) & this.fullMask;
  }

  /** Recompute the §7.1 states of one table's seats and update the seat clock. */
  recomputeTable(t: number): void {
    const occ = this.occMask[t], held = this.heldMask[t];
    const claimed = this.claimedBy[t] >= 0;
    const freeCount = popcount(this.freeMaskOf(t));
    const shareMin = this.cfg.reserve.shareMinEmpty;
    for (let j = 0; j < this.k2; j++) {
      const s = t * this.k2 + j;
      const ns = seatStateOf({ occupied: ((occ >>> j) & 1) === 1, held: ((held >>> j) & 1) === 1, claimed, complete: this.complete[t] === 1, freeCount, shareMinEmpty: shareMin });
      const os = this.seatState[s];
      if (ns !== os) {
        this.clock.move(os, ns);
        this.seatState[s] = ns;
      }
    }
    this.version++;
  }

  holdSeat(s: number, p: number): void {
    const t = this.tableOfSeat(s);
    this.heldMask[t] |= 1 << (s - t * this.k2);
    this.seatGroup[s] = this.pop.group[p];
    this.seatPerson[s] = p;
    this.seat[p] = s;
    this.recomputeTable(t);
  }

  // ---------------------------------------------------------------- trips on the graph

  /** Start (or redirect) a trip. At a node it moves now; on an edge it re-plans at the far node (§4.2 rule 8). */
  setTrip(p: number, target: number, purpose: number): void {
    this.target[p] = target;
    this.purpose[p] = purpose;
    this.hopValid[p] = 0;
    if (this.mv.edge[p] >= 0) return;
    if (this.mv.node[p] >= 0) this.onTrip(p);
  }

  /** Behaviour hook set by the agents module: called when p reaches its trip target. */
  onReach: (w: World, p: number) => void = () => {};

  /** p stands at a node on a trip: reach the target, or request the next edge. */
  onTrip(p: number): void {
    const n = this.mv.node[p];
    if (n === this.target[p]) {
      this.onReach(this, p);
      return;
    }
    this.requestNextEdge(p, n);
  }

  requestNextEdge(p: number, n: number): void {
    const G = this.pc.G;
    const target = this.target[p];
    if (!this.hopValid[p] || G.nodes[n].routing || n === this.hopNext[p]) {
      const opts = this.pc.R.options(n, target);
      if (opts.length === 0) throw new Error(`no route from ${n} to ${target}`);
      let i = 0;
      if (opts.length > 1) i = Math.floor(uniform(this.seed, STREAM.route, this.pidOf(p), n * this.N + target) * opts.length);
      const o = opts[i];
      this.hopValid[p] = 1;
      this.hopLink[p] = o.link;
      this.hopToward[p] = o.toward;
      this.hopNext[p] = o.next;
    }
    const L = G.links[this.hopLink[p]];
    const seq = this.pc.linkNodes[L.id];
    const idx = n === L.a ? 0 : n === L.b ? seq.length - 1 : this.pc.nodeLinkIdx[n];
    const next = this.hopToward[p] === L.b ? seq[idx + 1] : seq[idx - 1];
    const e = this.pc.edgeBetween(n, next);
    const dir = G.edges[e].a === n ? 1 : -1;
    this.mv.candidate(p, e, dir, this.speedOf(p));
  }

  /** Busy-node bookkeeping for actions at 1-lane stop nodes. */
  actionBusy(node: number, delta: number): void {
    if (node >= 0 && this.pc.oneLaneStop[node]) this.mv.busy(node, delta);
  }

  // ---------------------------------------------------------------- hashes

  stateHash(): number {
    const f = new Fnv();
    f.int(this.now);
    const P = this.pop.personCount;
    for (let p = 0; p < P; p++) {
      f.int(this.phase[p]);
      f.int(this.mv.node[p]);
      f.int(this.mv.edge[p]);
      f.float(this.mv.exitMs[p]);
      f.int(this.seat[p]);
      f.int(this.hasFood[p]);
    }
    for (let t = 0; t < this.pc.tableCount; t++) {
      f.int(this.occMask[t]);
      f.int(this.heldMask[t]);
      f.int(this.claimedBy[t]);
      f.int(this.complete[t]);
    }
    for (let s = 0; s < 6; s++) f.int(this.clock.totals[s]);
    return f.h;
  }
}
