import type { Config } from '../config/schema';
import * as A from './agents';
import { checkInvariants } from './invariants';
import { MINUTE_MS, STATES } from './metrics';
import type { PairInput } from './pairmetrics';
import { computeRunMetrics, type RunMetrics } from './runmetrics';
import { CLS, EV, PH } from './types';
import { World, type EngineOpts } from './world';

export type { RunMetrics } from './runmetrics';
export { pairMetrics, type PairInput, type PairMetrics } from './pairmetrics';

/** Static geometry for the renderer, in plan metres (spec §12.1). */
export interface StaticLayout {
  W: number;
  H: number;
  seatsPerSide: number;
  tables: { id: number; row: number; col: number; x0: number; y0: number; x1: number; y1: number }[];
  seats: { id: number; table: number; side: number; i: number; x: number; y: number }[];
  stalls: { id: number; band: 'top' | 'left'; start: number; frontage: number; stopX: number; stopY: number; slots: { x: number; y: number }[] }[];
  entranceX: number;
  exitX: number;
  trayX: number;
  concourseY: number;
  stallBand: number;
  queueDepth: number;
  blockX: number;
  blockY: number;
  nodes: { x: number; y: number }[];
}

export interface StaticPeople {
  count: number;
  personId: Int32Array;
  personGroup: Int32Array;
  groupSize: Uint8Array;
  isReserver: Uint8Array;
  groupId: Int32Array;
  objectType: Uint8Array;
}

export interface View {
  version: number;
  nowMs: number;
  active: Uint8Array;
  cls: Uint8Array;
  tray: Uint8Array;
  walkedAway: Uint8Array;
  since: Float64Array;
  x0: Float32Array;
  y0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  t0: Float64Array;
  t1: Float64Array;
  laneOffset: Float32Array;
  leader: Int32Array;
  waitKind: Uint8Array; // 0 none, 1 edge FIFO, 2 node spiral, 3 tray line
  waitRank: Int32Array;
  waitNode: Int32Array;
  /** For edge-FIFO waiters: the node they want to walk toward. */
  waitToward: Int32Array;
  /** Seat id while seated (sitting, eating, standing), else −1. */
  seat: Int32Array;
  isClaimer: Uint8Array;
  tableClaimed: Uint8Array;
  tableComplete: Uint8Array;
  tableObject: Uint8Array;
  tableClaimSince: Float64Array;
  tableRing: Uint8Array;
  seatState: Uint8Array;
}

export interface Live {
  nowMs: number;
  seatsByState: number[];
  queuing: number;
  searchingWithFood: number;
  claiming: number;
  standingWithFood: number;
  walkAways: number;
  arrivals: number;
  exited: number;
  sitStartsLast60: number;
  /** Provisional P1, P2, P4 (spec §7.6). */
  walkAwayPct: number | null;
  entranceToSeatMeanMin: number | null;
  peakThroughputPerHour: number;
}

export interface Series {
  minutes: number;
  /** minute·6 + state: mean seats in that state over the minute. */
  states: Float64Array;
  sits: Float64Array;
}

export interface Engine {
  advanceTo(simMs: number): void;
  step(maxEvents: number): number;
  readonly nowMs: number;
  readonly done: boolean;
  readonly truncated: boolean;
  readonly layout: StaticLayout;
  readonly static: StaticPeople;
  view(): View;
  live(): Live;
  series(): Series;
  progress(): number;
  metrics(): RunMetrics;
  pairInput(): PairInput;
  runHash(): number;
  stateHash(): number;
}

const m = (mm: number) => mm / 1000;

declare const __SIM_INVARIANTS__: boolean | undefined;
/** Compile-time flag (spec §13.3): Vitest defines it; production builds do not. */
const INVARIANTS = typeof __SIM_INVARIANTS__ !== 'undefined' && __SIM_INVARIANTS__;

export class Sim implements Engine {
  readonly world: World;
  readonly layout: StaticLayout;
  readonly static: StaticPeople;
  private finalFolded = false;
  private cachedMetrics: RunMetrics | null = null;
  private viewBuf: View | null = null;
  private readonly invEvery: number;
  private processed = 0;

  constructor(cfg: Config, opts: EngineOpts = {}) {
    const w = (this.world = new World(cfg, opts));
    this.invEvery = opts.invariantEvery ?? 1000;
    A.install(w);
    const L = w.pc.L;
    this.layout = {
      W: m(L.W), H: m(L.H), seatsPerSide: L.params.seatsPerSide,
      tables: L.tables.map((t) => ({ id: t.id, row: t.row, col: t.col, x0: m(t.x0), y0: m(t.y0), x1: m(t.x1), y1: m(t.y1) })),
      seats: L.seats.map((s) => ({ id: s.id, table: s.table, side: s.side, i: s.i, x: m(s.x), y: m(s.y) })),
      stalls: L.stalls.map((s) => ({
        id: s.id, band: s.band, start: m(s.start), frontage: m(s.frontage),
        stopX: m(w.pc.G.nodes[w.pc.G.stallNode[s.id]].x), stopY: m(w.pc.G.nodes[w.pc.G.stallNode[s.id]].y),
        slots: s.slots.map((q) => ({ x: m(q.x), y: m(q.y) })),
      })),
      entranceX: m(L.entranceX), exitX: m(L.exitX), trayX: m(L.trayX), concourseY: m(L.H - 1500),
      stallBand: 3, queueDepth: m(L.params.queueDepthMm), blockX: m(L.blockX), blockY: m(L.blockY),
      nodes: w.pc.G.nodes.map((n) => ({ x: m(n.x), y: m(n.y) })),
    };
    const P = w.pop.personCount;
    const isRes = new Uint8Array(P);
    const gs = new Uint8Array(P);
    for (let p = 0; p < P; p++) {
      const G = w.groupOf(p);
      gs[p] = G.size;
      isRes[p] = G.reserver ? 1 : 0;
    }
    this.static = { count: P, personId: w.pop.personId, personGroup: w.pop.group, groupSize: gs, isReserver: isRes, groupId: w.pop.groupId, objectType: w.pop.objectType };
  }

  get nowMs(): number { return this.world.now; }
  get done(): boolean { return this.world.done; }
  get truncated(): boolean { return this.world.truncated; }

  private processOne(): void {
    const w = this.world;
    const q = w.q;
    q.pop();
    const ms = q.ms;
    if (ms > w.now) {
      w.clock.advance(ms);
      w.now = ms;
    }
    w.mv.now = w.now;
    w.hash.int(ms);
    w.hash.int(q.kind);
    w.hash.int(q.entity);
    w.eventsPerKind[q.kind]++;
    const p = q.arg;
    switch (q.type) {
      case EV.SIT_END: A.sitEnd(w, p); break;
      case EV.STAND_END: A.standEnd(w, p); break;
      case EV.PLACE_END: A.placeEnd(w, p); break;
      case EV.ASK_END: A.askEnd(w, p); break;
      case EV.DROP_END: A.dropEnd(w, p); break;
      case EV.SERVICE_END: A.serviceEnd(w, p); break;
      case EV.EDGE_ARRIVE: A.edgeArrive(w, p); break;
      case EV.WALKOUT_ARRIVE: A.walkOutArrive(w, p); break;
      case EV.QUEUE: w.st.now = w.now; w.st.onQueueEvent(q.stamp, p); break;
      case EV.GROUP_ARRIVE: A.groupArrive(w, p); break;
      case EV.ADMIT: w.admitPopped(); w.mv.admitStep(); break;
      case EV.PATIENCE: A.onPatience(w, p, q.stamp); break;
      case EV.CUTOFF: A.onCutoff(w, p); break;
      case EV.RECHOOSE: A.onRechooseTimer(w, p, q.stamp); break;
      case EV.EAT_END: A.eatEnd(w, p); break;
      case EV.STAND_START: A.standStart(w, p); break;
      default: throw new Error(`unknown event type ${q.type}`);
    }
    w.version++;
    if (INVARIANTS && ++this.processed % this.invEvery === 0) checkInvariants(w);
  }

  advanceTo(simMs: number): void {
    const w = this.world;
    if (w.done) return;
    // Integer ms only (spec §3.0): a fractional target must not leave the clock between two ms.
    const limit = Math.min(Math.floor(simMs), w.simEnd);
    while (!w.done && w.q.size > 0 && w.q.peekMs() <= limit) this.processOne();
    if (w.done) {
      this.finish();
      return;
    }
    if (limit > w.now) {
      w.clock.advance(limit);
      w.now = limit;
    }
    if (limit >= w.simEnd || (w.q.size === 0 && limit >= w.simEnd)) {
      w.truncated = true;
      w.done = true;
      this.finish();
    }
  }

  step(maxEvents: number): number {
    const w = this.world;
    let n = 0;
    while (!w.done && n < maxEvents) {
      if (w.q.size === 0 || w.q.peekMs() > w.simEnd) {
        this.advanceTo(w.simEnd);
        break;
      }
      this.processOne();
      n++;
    }
    if (w.done) this.finish();
    return n;
  }

  private finish(): void {
    if (this.finalFolded) return;
    this.finalFolded = true;
    const w = this.world;
    if (INVARIANTS) checkInvariants(w);
    w.st.flush(w.now);
    const r = (this.cachedMetrics = computeRunMetrics(w));
    for (const v of Object.values(r)) foldValue(w.hash, v);
  }

  metrics(): RunMetrics {
    if (!this.world.done || !this.cachedMetrics) throw new Error('metrics() is only available when the run is done');
    return this.cachedMetrics;
  }

  pairInput(): PairInput {
    const w = this.world;
    if (!w.done) throw new Error('pairInput() is only available when the run is done');
    const P = w.pop.personCount;
    const G = w.groups.length;
    const e2s = new Float64Array(P).fill(-1);
    const f2s = new Float64Array(P).fill(-1);
    const walked = new Uint8Array(P);
    for (let p = 0; p < P; p++) {
      const g = w.groupOf(p);
      const sit = w.sitStartMs[p];
      const outcome = sit >= 0 ? sit : g.walkedAway ? g.walkAwayMs : -1;
      if (outcome >= 0) e2s[p] = outcome - w.entranceMs[p];
      const se = w.st.serviceEndMs[p];
      if (outcome >= 0 && se >= 0 && se <= outcome) f2s[p] = outcome - se;
      walked[p] = g.walkedAway ? 1 : 0;
    }
    const claimed = new Uint8Array(G), fb = new Uint8Array(G);
    for (let g = 0; g < G; g++) {
      claimed[g] = w.groups[g].claimed ? 1 : 0;
      fb[g] = w.groups[g].fallback ? 1 : 0;
    }
    return {
      seats: w.pc.L.seats.length, endMs: w.now, bins: w.clock.bins.slice(),
      groupReserveDraw: w.pop.reserveDraw, groupClaimed: claimed, groupFallback: fb, groupSize: w.pop.size,
      personGroup: w.pop.group, e2sMs: e2s, f2sMs: f2s, walkedAway: walked,
    };
  }

  runHash(): number {
    return this.world.hash.h;
  }

  stateHash(): number {
    return this.world.stateHash();
  }

  progress(): number {
    const w = this.world;
    return w.pop.personCount === 0 ? 1 : w.exited / w.pop.personCount;
  }

  live(): Live {
    const w = this.world;
    const c = w.clock;
    const cur = Math.floor(w.now / MINUTE_MS);
    let last60 = 0;
    for (let mm = Math.max(0, cur - 59); mm <= cur && mm < c.minutes; mm++) last60 += c.sitBins[mm];
    const noOutcome = w.arrived - w.outcomeCount;
    const p2 = w.arrived > 0 ? (w.outcomeSumMs + w.now * noOutcome - (w.arrivedEntranceSum - w.outcomeEntranceSum)) / w.arrived / MINUTE_MS : null;
    return {
      nowMs: w.now,
      seatsByState: Array.from(c.totals),
      queuing: w.queuingNow,
      searchingWithFood: w.searchingNow,
      claiming: w.claimingNow,
      standingWithFood: c.standing,
      walkAways: w.walkAwayPeople,
      arrivals: w.arrived,
      exited: w.exited,
      sitStartsLast60: last60,
      walkAwayPct: w.arrived > 0 ? (100 * w.walkAwayPeople) / w.arrived : null,
      entranceToSeatMeanMin: p2,
      peakThroughputPerHour: w.sitWinMax,
    };
  }

  series(): Series {
    const w = this.world;
    const c = w.clock;
    const minutes = Math.min(c.minutes, Math.floor(w.now / MINUTE_MS) + (w.now % MINUTE_MS > 0 ? 1 : 0));
    const states = new Float64Array(minutes * STATES);
    for (let mm = 0; mm < minutes; mm++) {
      const len = Math.min(MINUTE_MS, w.now - mm * MINUTE_MS);
      for (let s = 0; s < STATES; s++) states[mm * STATES + s] = c.bins[mm * STATES + s] / len;
    }
    return { minutes, states, sits: c.sitBins.slice(0, minutes) };
  }

  view(): View {
    const w = this.world;
    const P = w.pop.personCount;
    const T = w.pc.tableCount;
    const S = w.pc.L.seats.length;
    const v = (this.viewBuf ??= {
      version: 0, nowMs: 0,
      active: new Uint8Array(P), cls: new Uint8Array(P), tray: new Uint8Array(P), walkedAway: new Uint8Array(P), since: new Float64Array(P),
      x0: new Float32Array(P), y0: new Float32Array(P), x1: new Float32Array(P), y1: new Float32Array(P),
      t0: new Float64Array(P), t1: new Float64Array(P), laneOffset: new Float32Array(P), leader: new Int32Array(P),
      waitKind: new Uint8Array(P), waitRank: new Int32Array(P), waitNode: new Int32Array(P), waitToward: new Int32Array(P), seat: new Int32Array(P), isClaimer: new Uint8Array(P),
      tableClaimed: new Uint8Array(T), tableComplete: new Uint8Array(T), tableObject: new Uint8Array(T), tableClaimSince: new Float64Array(T),
      tableRing: new Uint8Array(T), seatState: new Uint8Array(S),
    });
    v.version = w.version;
    v.nowMs = w.now;
    const G = w.pc.G;
    const nodeWaiters: number[] = [];
    for (let p = 0; p < P; p++) {
      const ph = w.phase[p];
      const active = ph !== PH.OUT && ph !== PH.EXITED;
      v.active[p] = active ? 1 : 0;
      v.waitKind[p] = 0;
      v.waitRank[p] = -1;
      v.waitNode[p] = -1;
      v.waitToward[p] = -1;
      v.seat[p] = -1;
      v.leader[p] = -1;
      v.laneOffset[p] = 0;
      if (!active) continue;
      const grp = w.groupOf(p);
      v.cls[p] = classOf(w, p);
      v.tray[p] = w.hasFood[p] || w.usedTray[p] ? 1 : 0;
      v.walkedAway[p] = grp.walkedAway && (w.hasFood[p] || w.st.serviceEndMs[p] >= 0) ? 1 : 0;
      v.since[p] = w.phaseSince[p];
      v.isClaimer[p] = grp.claimer === p ? 1 : 0;
      if (ph === PH.SITTING || ph === PH.EATING || ph === PH.STANDING) v.seat[p] = w.seat[p];
      const e = w.mv.edge[p];
      if (e >= 0) {
        const edge = G.edges[e];
        const d = w.mv.dir[p];
        const a = G.nodes[d > 0 ? edge.a : edge.b], b = G.nodes[d > 0 ? edge.b : edge.a];
        v.x0[p] = m(a.x); v.y0[p] = m(a.y); v.x1[p] = m(b.x); v.y1[p] = m(b.y);
        v.t0[p] = w.mv.entryMs[p]; v.t1[p] = w.mv.exitMs[p];
        v.leader[p] = w.mv.leader[p];
        if (edge.lanes >= 2 && edge.lanes <= 3) v.laneOffset[p] = 0.3;
        continue;
      }
      const n = w.mv.node[p];
      if (n >= 0) {
        const nd = G.nodes[n];
        v.x0[p] = v.x1[p] = m(nd.x); v.y0[p] = v.y1[p] = m(nd.y);
        v.t0[p] = v.t1[p] = w.now;
        v.waitNode[p] = n;
        if (w.mv.wantEd[p] >= 0) {
          v.waitKind[p] = 1;
          v.waitRank[p] = w.mv.waitRank(p);
          const ed = w.mv.wantEd[p];
          const we = G.edges[ed >> 1];
          v.waitToward[p] = ed & 1 ? we.a : we.b;
        } else if (ph === PH.TRAY_WAIT) {
          v.waitKind[p] = 3;
          v.waitRank[p] = w.trayFifo.indexOf(p);
        } else if (ph === PH.WAIT_FOOD || ph === PH.FULL_WAIT || (ph === PH.CONVOY && w.waitingLeader[p])) {
          v.waitKind[p] = 2;
          nodeWaiters.push(p);
        }
        continue;
      }
      // Queue area: pick the leg of the 3-point path that contains now.
      const i = 3 * p;
      const pt = w.st.pt, px = w.st.px, py = w.st.py;
      const leg = w.now < pt[i + 1] ? 0 : 1;
      v.x0[p] = m(px[i + leg]); v.y0[p] = m(py[i + leg]); v.x1[p] = m(px[i + leg + 1]); v.y1[p] = m(py[i + leg + 1]);
      v.t0[p] = pt[i + leg]; v.t1[p] = pt[i + leg + 1];
    }
    nodeWaiters.sort((a, b) => v.waitNode[a] - v.waitNode[b] || w.nodeWaitSince[a] - w.nodeWaitSince[b] || a - b);
    for (let i = 0, rank = 0; i < nodeWaiters.length; i++) {
      if (i > 0 && v.waitNode[nodeWaiters[i]] !== v.waitNode[nodeWaiters[i - 1]]) rank = 0;
      v.waitRank[nodeWaiters[i]] = rank++;
    }
    for (let t = 0; t < T; t++) {
      const g = w.claimedBy[t];
      v.tableClaimed[t] = g >= 0 ? 1 : 0;
      v.tableComplete[t] = w.complete[t];
      v.tableObject[t] = g >= 0 ? w.pop.objectType[g] : 0;
      v.tableClaimSince[t] = w.claimSince[t];
      let ring = 0;
      for (let j = 0; j < w.k2; j++) {
        const s = w.seatState[t * w.k2 + j];
        if (s === 4 || s === 3) ring = 1;
      }
      v.tableRing[t] = ring;
    }
    v.seatState.set(w.seatState);
    return v;
  }
}

function classOf(w: World, p: number): number {
  const ph = w.phase[p];
  const G = w.groupOf(p);
  if (ph === PH.CLAIMING || ph === PH.PLACING || ph === PH.CONVOY) return CLS.CLAIMING;
  if (w.queuing[p]) return CLS.QUEUING;
  if (w.searching[p]) return CLS.SEARCHING;
  if (ph === PH.SITTING || ph === PH.EATING || ph === PH.STANDING) {
    return G.sitStarted < G.size ? CLS.HOLDING : CLS.EATING;
  }
  if (G.walkedAway && (w.hasFood[p] || w.st.serviceEndMs[p] >= 0)) return CLS.WALKED_AWAY;
  return CLS.WALKING;
}

function foldValue(h: World['hash'], v: unknown): void {
  if (v === null || v === undefined) h.float(null);
  else if (typeof v === 'boolean') h.int(v ? 1 : 0);
  else if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 2147483648) h.int(v);
    else h.float(v);
  } else if (Array.isArray(v)) for (const x of v) foldValue(h, x);
  else if (typeof v === 'object') for (const x of Object.values(v as object)) foldValue(h, x);
}

export function createEngine(config: Config, opts?: { seed?: number; reserveFraction?: number }): Engine {
  return new Sim(config, opts);
}
