import type { Precomp } from './precompute';
import { popcount } from './seating';

/** True table state as the engine holds it. */
export interface TableTruth {
  occMask: Int32Array;
  heldMask: Int32Array;
  claimed: Uint8Array;
}

export interface TargetOpts {
  shareMaxParty: number;
  shareMinEmpty: number;
  detourMm: number;
}

export const REVISIT_MS = 60_000;

/**
 * A searcher's (or claimer's) table memory (spec §5.5). Held seats look empty from a distance; seats learned to be
 * held at an arrival check stay taken until the searcher sees them occupied (ruling 4).
 */
export class Memory {
  readonly seen: Uint8Array;
  readonly list: number[] = [];
  readonly occMask: Int32Array;
  readonly heldMask: Int32Array;
  readonly claimed: Uint8Array;
  readonly seated: Uint8Array;
  readonly observedMs: Float64Array;
  readonly refusedUntil: Float64Array;
  readonly lastVisit: Float64Array;
  /** Bitmask of all seats at a table. */
  readonly full: number;

  constructor(pc: Precomp) {
    const T = pc.tableCount;
    this.full = (1 << (2 * pc.L.params.seatsPerSide)) - 1;
    this.seen = new Uint8Array(T);
    this.occMask = new Int32Array(T);
    this.heldMask = new Int32Array(T);
    this.claimed = new Uint8Array(T);
    this.seated = new Uint8Array(T);
    this.observedMs = new Float64Array(T);
    this.refusedUntil = new Float64Array(T).fill(-Infinity);
    this.lastVisit = new Float64Array(pc.nodeCount).fill(-Infinity);
  }

  private add(t: number): void {
    if (this.seen[t]) return;
    this.seen[t] = 1;
    let i = this.list.length;
    this.list.push(t);
    while (i > 0 && this.list[i - 1] > t) {
      this.list[i] = this.list[i - 1];
      i--;
    }
    this.list[i] = t;
  }

  /** A distant observation. */
  record(t: number, occ: number, claimed: boolean, now: number): void {
    this.add(t);
    this.occMask[t] = occ;
    this.heldMask[t] &= ~occ;
    this.claimed[t] = claimed ? 1 : 0;
    this.seated[t] = popcount(occ);
    this.observedMs[t] = now;
  }

  /** The true state learned at an arrival check. */
  learn(t: number, occ: number, held: number, claimed: boolean, now: number): void {
    this.add(t);
    this.occMask[t] = occ;
    this.heldMask[t] = held & ~occ;
    this.claimed[t] = claimed ? 1 : 0;
    this.seated[t] = popcount(occ);
    this.observedMs[t] = now;
  }

  visit(node: number, now: number): void {
    this.lastVisit[node] = now;
  }
}

/** Observe every table visible from `node` (spec §5.5). */
export function observe(m: Memory, pc: Precomp, node: number, now: number, w: TableTruth): void {
  for (const t of pc.visibleTables[node]) m.record(t, w.occMask[t], w.claimed[t] === 1, now);
}

function emptyMask(m: Memory, t: number): number {
  return ~(m.occMask[t] | m.heldMask[t]) & m.full;
}

/** §5.5 suitability for a free-flow party of n, as remembered and not refused. */
export function suitable(m: Memory, t: number, n: number, o: TargetOpts, now: number): boolean {
  if (m.refusedUntil[t] > now) return false;
  const empty = popcount(emptyMask(m, t));
  if (!m.claimed[t]) return empty >= n;
  return n <= o.shareMaxParty && m.seated[t] >= 1 && empty >= Math.max(n, o.shareMinEmpty);
}

export interface Target { table: number; node: number; dist: number }

/** Distance to a table = min over seats recorded empty of dist(cur, seat node); ties to the lower node id. */
function tableDist(m: Memory, pc: Precomp, cur: number, t: number): { node: number; dist: number } {
  const k2 = 2 * pc.L.params.seatsPerSide;
  let em = emptyMask(m, t);
  let best = 0x7fffffff, node = -1;
  for (let j = 0; em; j++, em >>>= 1) {
    if (!(em & 1)) continue;
    const a = pc.G.seatNode[t * k2 + j];
    const d = pc.R.dist(cur, a);
    if (d < best || (d === best && a < node)) { best = d; node = a; }
  }
  return { node, dist: best };
}

/** Free-flow target (§5.5, §5.10 emptyTableDetour). */
export function freeFlowTarget(m: Memory, pc: Precomp, cur: number, n: number, o: TargetOpts, now: number, exclude?: (t: number) => boolean): Target | null {
  let best: Target | null = null;
  let bestEmpty: Target | null = null;
  for (const t of m.list) {
    if (!suitable(m, t, n, o, now)) continue;
    if (exclude && exclude(t)) continue;
    const { node, dist } = tableDist(m, pc, cur, t);
    if (node < 0) continue;
    if (!best || dist < best.dist || (dist === best.dist && t < best.table)) best = { table: t, node, dist };
    if (o.detourMm > 0 && !m.claimed[t] && m.occMask[t] === 0 && m.heldMask[t] === 0) {
      if (!bestEmpty || dist < bestEmpty.dist || (dist === bestEmpty.dist && t < bestEmpty.table)) bestEmpty = { table: t, node, dist };
    }
  }
  if (best && bestEmpty && bestEmpty.dist <= best.dist + o.detourMm) return bestEmpty;
  return best;
}

/** Claim target (§5.4 point 3): argmin n·dist(cur, a(τ)) + Σ member dist(a(τ), stall), ties to the lower table id. */
export function claimTarget(m: Memory, pc: Precomp, cur: number, n: number, sumDist: (accessNode: number) => number): (Target & { score: number }) | null {
  const T = pc.tableCount;
  let best: (Target & { score: number }) | null = null;
  for (const t of m.list) {
    if (m.claimed[t] || m.occMask[t] !== 0 || m.heldMask[t] !== 0) continue;
    const a = pc.nodeTableAccess[cur * T + t];
    const d = pc.nodeTableDist[cur * T + t];
    const score = n * d + sumDist(a);
    if (!best || score < best.score) best = { table: t, node: a, dist: d, score };
  }
  return best;
}

/** Explore target (§5.5): nearest intersection not visited in the last 60 s, else the one visited longest ago. */
export function exploreTarget(m: Memory, pc: Precomp, cur: number, now: number): number {
  let best = -1, bd = 0x7fffffff;
  let oldest = -1, ov = Infinity;
  for (const x of pc.intersections) {
    const v = m.lastVisit[x];
    if (now - v >= REVISIT_MS) {
      const d = pc.R.dist(cur, x);
      if (d < bd) { bd = d; best = x; }
    }
    if (v < ov) { ov = v; oldest = x; }
  }
  return best >= 0 ? best : oldest;
}
