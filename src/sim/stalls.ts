import type { Config } from '../config/schema';
import { dlog } from './dmath';
import type { Population } from './population';
import type { Precomp } from './precompute';
import { STREAM, uniform } from './rng';

/** Kind-4 queue event types. */
export const Q_WALKIN = 1;
export const Q_MOVEUP = 2;

export interface StallHost {
  scheduleQueue(ms: number, stall: number, type: number, p: number): void;
  scheduleServiceEnd(p: number, ms: number): void;
  onServiceStart(p: number): void;
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);
const legMs = (mm: number, v: number) => Math.max(1, ceilDiv(mm * 1000, v));

const IDLE = 0;
const WALKING_IN = 1;
const MOVING_UP = 2;
const SERVED = 3;

/** Stalls, queues and service (spec §5.2). */
export class Stalls {
  now = 0;
  readonly S: number;
  readonly cap: number;
  readonly rankTerm: Float64Array;
  readonly queueLength: Int32Array;
  readonly members: number[][];
  readonly chosen: Int32Array;
  readonly assigned: Int32Array;
  readonly physPos: Int32Array;
  readonly state: Uint8Array;
  readonly joinMs: Float64Array;
  readonly serviceStartMs: Float64Array;
  readonly serviceEndMs: Float64Array;
  /** Queue-area path per person: 3 points (x, y in mm) and their times. */
  readonly px: Int32Array;
  readonly py: Int32Array;
  readonly pt: Float64Array;
  // Little's-law integrals (exact integer ms sums).
  readonly accWaiting: Float64Array;
  readonly accInSlot: Float64Array;
  private readonly waitingCount: Int32Array;
  private readonly inSlotCount: Int32Array;
  private readonly lastChange: Float64Array;

  private readonly gumbelCache: Float64Array;
  private readonly aversion: number;
  private readonly walk: number;
  private readonly tray: number;
  private readonly upMs: number;
  private readonly stopX: Int32Array;
  private readonly stopY: Int32Array;

  constructor(private readonly pc: Precomp, private readonly pop: Population, c: Config, private readonly seed: number, private readonly host: StallHost) {
    const L = pc.L;
    const S = (this.S = L.stalls.length);
    this.cap = L.queueCapacity;
    const P = pop.personCount;
    const order = Array.from({ length: S }, (_, s) => s);
    const draw = order.map((s) => uniform(seed, STREAM.stallRank, s));
    order.sort((a, b) => draw[a] - draw[b] || a - b);
    this.rankTerm = new Float64Array(S);
    order.forEach((s, i) => { this.rankTerm[s] = -c.stalls.popularitySkew * dlog(i + 1); });
    this.aversion = c.stalls.queueAversion;
    this.walk = Math.round(c.move.walkSpeed * 1000);
    this.tray = Math.round(c.move.traySpeed * 1000);
    this.upMs = ceilDiv(600 * 1000, this.walk);
    this.queueLength = new Int32Array(S);
    this.members = Array.from({ length: S }, () => []);
    this.chosen = new Int32Array(P).fill(-1);
    this.assigned = new Int32Array(P);
    this.physPos = new Int32Array(P);
    this.state = new Uint8Array(P);
    this.joinMs = new Float64Array(P).fill(-1);
    this.serviceStartMs = new Float64Array(P).fill(-1);
    this.serviceEndMs = new Float64Array(P).fill(-1);
    this.px = new Int32Array(3 * P);
    this.py = new Int32Array(3 * P);
    this.pt = new Float64Array(3 * P);
    this.accWaiting = new Float64Array(S);
    this.accInSlot = new Float64Array(S);
    this.waitingCount = new Int32Array(S);
    this.inSlotCount = new Int32Array(S);
    this.lastChange = new Float64Array(S);
    this.gumbelCache = new Float64Array(P * S).fill(Number.NaN);
    this.stopX = new Int32Array(S);
    this.stopY = new Int32Array(S);
    for (let s = 0; s < S; s++) {
      const n = pc.G.nodes[pc.G.stallNode[s]];
      this.stopX[s] = n.x;
      this.stopY[s] = n.y;
    }
  }

  /** Gumbel term G_ps, fixed per person per stall. */
  gumbel(p: number, s: number): number {
    const i = p * this.S + s;
    let g = this.gumbelCache[i];
    if (g !== g) {
      g = -dlog(-dlog(uniform(this.seed, STREAM.stallNoise, this.pop.personId[p], s)));
      this.gumbelCache[i] = g;
    }
    return g;
  }

  utility(p: number, s: number): number {
    return this.rankTerm[s] - this.aversion * (this.queueLength[s] / 10) + this.gumbel(p, s);
  }

  private argmax(p: number, nonFullOnly: boolean): number {
    let best = -1;
    let bu = -Infinity;
    for (let s = 0; s < this.S; s++) {
      if (nonFullOnly && this.queueLength[s] >= this.cap) continue;
      const u = this.utility(p, s);
      if (best < 0 || u > bu) { best = s; bu = u; }
    }
    return best;
  }

  /** Choose the best non-full stall and count p toward it; −1 if every stall is full. */
  choose(p: number): number {
    const s = this.argmax(p, true);
    if (s >= 0) {
      this.queueLength[s]++;
      this.chosen[p] = s;
    }
    return s;
  }

  bestIgnoringFull(p: number): number {
    return this.argmax(p, false);
  }

  /** Provisional best stall at the group's entry ms (not counted). */
  provisional(p: number): number {
    const s = this.argmax(p, true);
    return s >= 0 ? s : this.argmax(p, false);
  }

  /** p reaches its chosen stall's walkway stop: assign a position and walk in. */
  atWalkway(p: number, s: number): void {
    const m = this.members[s];
    const pos = m.length + 1;
    m.push(p);
    this.assigned[p] = pos;
    this.physPos[p] = pos;
    this.state[p] = WALKING_IN;
    const slot = this.pc.L.stalls[s].slots[pos - 1];
    const top = this.pc.L.stalls[s].band === 'top';
    const cx = top ? this.stopX[s] : slot.x;
    const cy = top ? slot.y : this.stopY[s];
    const t1 = this.now + legMs(Math.abs(cx - this.stopX[s]) + Math.abs(cy - this.stopY[s]), this.walk);
    const t2 = t1 + legMs(Math.abs(slot.x - cx) + Math.abs(slot.y - cy), this.walk);
    this.setPath(p, this.stopX[s], this.stopY[s], cx, cy, slot.x, slot.y, this.now, t1, t2);
    this.host.scheduleQueue(t2, s, Q_WALKIN, p);
  }

  walkInEndMs(p: number): number {
    return this.pt[3 * p + 2];
  }

  onQueueEvent(type: number, p: number): void {
    const s = this.chosen[p];
    if (type === Q_WALKIN) {
      this.integrate(s);
      this.waitingCount[s]++;
      this.inSlotCount[s]++;
      this.joinMs[p] = this.now;
    } else {
      this.physPos[p]--;
    }
    this.state[p] = IDLE;
    this.settle(p, s);
  }

  /** After a walk-in or move-up ends: start service, or the next move-up. */
  private settle(p: number, s: number): void {
    const logical = this.members[s].indexOf(p) + 1;
    const slot = this.pc.L.stalls[s].slots[this.physPos[p] - 1];
    if (this.physPos[p] === 1 && logical === 1) {
      this.integrate(s);
      this.waitingCount[s]--;
      this.state[p] = SERVED;
      this.serviceStartMs[p] = this.now;
      this.setPath(p, slot.x, slot.y, slot.x, slot.y, slot.x, slot.y, this.now, this.now, this.now);
      this.host.onServiceStart(p);
      this.host.scheduleServiceEnd(p, this.now + this.pop.serviceMs[p]);
    } else if (this.physPos[p] > logical) {
      this.startMoveUp(p, s);
    } else {
      this.setPath(p, slot.x, slot.y, slot.x, slot.y, slot.x, slot.y, this.now, this.now, this.now);
    }
  }

  private startMoveUp(p: number, s: number): void {
    const slots = this.pc.L.stalls[s].slots;
    const a = slots[this.physPos[p] - 1], b = slots[this.physPos[p] - 2];
    this.state[p] = MOVING_UP;
    const t = this.now + this.upMs;
    this.setPath(p, a.x, a.y, b.x, b.y, b.x, b.y, this.now, t, t);
    this.host.scheduleQueue(t, s, Q_MOVEUP, p);
  }

  /** Kind 2: service ends; position 1 empties and idle members move up. */
  serviceEnded(p: number): void {
    const s = this.chosen[p];
    this.integrate(s);
    this.inSlotCount[s]--;
    this.serviceEndMs[p] = this.now;
    this.members[s].shift();
    this.queueLength[s]--;
    const m = this.members[s];
    for (let i = 0; i < m.length; i++) {
      const q = m[i];
      if (this.state[q] === IDLE && this.physPos[q] > i + 1) this.startMoveUp(q, s);
    }
  }

  /** Walk from the service position out through the exit gap to the walkway stop at tray speed; returns arrival ms. */
  walkOut(p: number): number {
    const s = this.chosen[p];
    const slot = this.pc.L.stalls[s].slots[0];
    const top = this.pc.L.stalls[s].band === 'top';
    const cx = top ? this.stopX[s] : slot.x;
    const cy = top ? slot.y : this.stopY[s];
    const t1 = this.now + legMs(Math.abs(slot.x - cx) + Math.abs(slot.y - cy), this.tray);
    const t2 = t1 + legMs(Math.abs(this.stopX[s] - cx) + Math.abs(this.stopY[s] - cy), this.tray);
    this.setPath(p, slot.x, slot.y, cx, cy, this.stopX[s], this.stopY[s], this.now, t1, t2);
    return t2;
  }

  private setPath(p: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t0: number, t1: number, t2: number): void {
    const i = 3 * p;
    this.px[i] = x0; this.px[i + 1] = x1; this.px[i + 2] = x2;
    this.py[i] = y0; this.py[i + 1] = y1; this.py[i + 2] = y2;
    this.pt[i] = t0; this.pt[i + 1] = t1; this.pt[i + 2] = t2;
  }

  private integrate(s: number): void {
    const dt = this.now - this.lastChange[s];
    if (dt > 0) {
      this.accWaiting[s] += this.waitingCount[s] * dt;
      this.accInSlot[s] += this.inSlotCount[s] * dt;
    }
    this.lastChange[s] = this.now;
  }

  flush(now: number): void {
    const keep = this.now;
    this.now = now;
    for (let s = 0; s < this.S; s++) this.integrate(s);
    this.now = keep;
  }
}
