import { SEAT } from './seating';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const STATES = 6;

/** Nearest-rank quantile (spec §7.7): sorted[ceil(q·n) − 1], with q given in percent to stay in integers. */
export function quantile(sorted: ArrayLike<number>, pct: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const rank = Math.floor((pct * n + 99) / 100);
  return sorted[Math.min(n, Math.max(1, rank)) - 1];
}

export function meanOrNull(xs: ArrayLike<number>): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

/** Most sit starts in any window [t, t + 60 min) (spec §7.2 P4). `times` ascending. */
export function peakThroughput(times: ArrayLike<number>): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (times[i] - times[j] >= HOUR_MS) j++;
    if (i - j + 1 > best) best = i - j + 1;
  }
  return best;
}

/**
 * Exact seat-state time integration (spec §7.1, §12.2 rule 1). All accumulators hold integer seat-ms (or person-ms),
 * so results do not depend on how time was stepped.
 */
export class SeatClock {
  now = 0;
  readonly totals = new Int32Array(STATES);
  readonly accum = new Float64Array(STATES);
  readonly minutes: number;
  readonly bins: Float64Array; // minute·6 + state, seat-ms
  readonly sitBins: Float64Array; // sit starts per minute
  stuck = 0;
  standing = 0;
  stuckMs = 0;
  standingMs = 0;
  demandMs = 0;
  readonly demandAccum = new Float64Array(STATES);

  constructor(readonly seats: number, simEndMs: number) {
    this.totals[SEAT.FREE] = seats;
    this.minutes = Math.ceil(simEndMs / MINUTE_MS) + 1;
    this.bins = new Float64Array(this.minutes * STATES);
    this.sitBins = new Float64Array(this.minutes);
  }

  advance(to: number): void {
    let t = this.now;
    while (t < to) {
      const minute = Math.floor(t / MINUTE_MS);
      const next = Math.min(to, (minute + 1) * MINUTE_MS);
      const dt = next - t;
      const base = minute * STATES;
      for (let s = 0; s < STATES; s++) {
        const v = this.totals[s] * dt;
        this.accum[s] += v;
        if (minute < this.minutes) this.bins[base + s] += v;
      }
      if (this.stuck > 0) {
        this.demandMs += dt;
        for (let s = 0; s < STATES; s++) this.demandAccum[s] += this.totals[s] * dt;
      }
      this.stuckMs += this.stuck * dt;
      this.standingMs += this.standing * dt;
      t = next;
    }
    if (to > this.now) this.now = to;
  }

  move(from: number, to: number): void {
    this.totals[from]--;
    this.totals[to]++;
  }

  setStuck(n: number): void {
    this.stuck = n;
  }

  setStanding(n: number): void {
    this.standing = n;
  }

  sitStart(): void {
    const m = Math.floor(this.now / MINUTE_MS);
    if (m < this.minutes) this.sitBins[m]++;
  }
}

export interface Window { startMin: number; lengthMin: number }

/** Per-pair peak window (spec §7.7): the whole-minute 60-min window maximising both runs' non-free seat-time. */
export function peakWindow(binsA: Float64Array, endA: number, binsB: Float64Array, endB: number): Window {
  const endMin = Math.ceil(Math.max(endA, endB) / MINUTE_MS);
  if (endMin <= 60) return { startMin: 0, lengthMin: Math.max(1, endMin) };
  const busy = (b: Float64Array, m: number) => {
    if (m * STATES >= b.length) return 0;
    let s = 0;
    for (let st = 1; st < STATES; st++) s += b[m * STATES + st];
    return s;
  };
  let sum = 0;
  for (let m = 0; m < 60; m++) sum += busy(binsA, m) + busy(binsB, m);
  let best = sum, bestStart = 0;
  for (let w = 1; w + 60 <= endMin; w++) {
    sum += busy(binsA, w + 59) + busy(binsB, w + 59) - busy(binsA, w - 1) - busy(binsB, w - 1);
    if (sum > best) { best = sum; bestStart = w; }
  }
  return { startMin: bestStart, lengthMin: 60 };
}

/** Seat-time share of `state` inside a window. */
export function stateShareInWindow(bins: Float64Array, seats: number, w: Window, state: number): number {
  let s = 0;
  for (let m = w.startMin; m < w.startMin + w.lengthMin; m++) if (m * STATES < bins.length) s += bins[m * STATES + state];
  return s / (seats * w.lengthMin * MINUTE_MS);
}

export function occupiedShareInWindow(bins: Float64Array, seats: number, w: Window): number {
  return stateShareInWindow(bins, seats, w, SEAT.OCCUPIED);
}
