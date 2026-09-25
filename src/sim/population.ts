import type { Config } from '../config/schema';
import { dexp, dlog, dnormcdf, dnorminv } from './dmath';
import { STREAM, uniform } from './rng';

/** Size of the fixed candidate-group pool (spec §8.3). */
export const POOL_GROUPS = 6000;
export const MAX_GROUP = 6;

/** The arrival CDF of spec §5.1, in ms since the window start. */
export function arrivalCdf(c: Config): { T: number; F: (t: number) => number } {
  const T = (c.crowd.windowEnd - c.crowd.windowStart) * 60_000;
  const s = c.crowd.peakShare;
  const mu = (c.crowd.peakTime - c.crowd.windowStart) * 60_000;
  const sigma = c.crowd.peakSpread * 1000;
  const lo = dnormcdf(-mu / sigma);
  const span = dnormcdf((T - mu) / sigma) - lo;
  const F = (t: number) => s * ((dnormcdf((t - mu) / sigma) - lo) / span) + (1 - s) * (t / T);
  return { T, F };
}

/** Smallest integer t in [0, T] with F(t) ≥ u, by integer bisection. */
export function arrivalMsFor(F: (t: number) => number, T: number, u: number): number {
  let lo = 0;
  let hi = T;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (F(mid) >= u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Group size 1–6 by inverse CDF of the (unnormalised) mix weights. */
export function groupSizeFor(mix: readonly number[], u: number): number {
  let total = 0;
  for (const w of mix) total += w;
  const target = u * total;
  let cum = 0;
  let last = 1;
  for (let i = 0; i < mix.length; i++) {
    if (mix[i] <= 0) continue;
    cum += mix[i];
    last = i + 1;
    if (target <= cum) return i + 1;
  }
  return last;
}

/** Lognormal duration with the given mean (s) and CV, from percentile u; returns integer ms ≥ 1 (spec §8.4). */
export function lognormalMs(meanS: number, cv: number, u: number): number {
  if (cv === 0) return Math.max(1, Math.round(meanS * 1000));
  const s2 = dlog(1 + cv * cv);
  const mu = dlog(meanS) - s2 / 2;
  const x = dexp(mu + Math.sqrt(s2) * dnorminv(u));
  return Math.max(1, Math.round(x * 1000));
}

export interface Population {
  seed: number;
  groupCount: number;
  personCount: number;
  // Per group, dense, ascending groupId.
  groupId: Int32Array;
  size: Uint8Array;
  arrivalMs: Int32Array;
  firstPerson: Int32Array;
  reserveDraw: Float64Array;
  objectType: Uint8Array;
  // Per person, dense, ascending personId.
  personId: Int32Array;
  group: Int32Array;
  member: Uint8Array;
  servicePct: Float64Array;
  eatPct: Float64Array;
  serviceMs: Int32Array;
  eatMs: Int32Array;
}

/** Accepted groups (spec §8.3) with their draws; per-person draws only for accepted people. */
export function buildPopulation(c: Config, seed: number): Population {
  const order = new Array<number>(POOL_GROUPS);
  const acc = new Float64Array(POOL_GROUPS);
  for (let g = 0; g < POOL_GROUPS; g++) {
    order[g] = g;
    acc[g] = uniform(seed, STREAM.accept, g);
  }
  order.sort((a, b) => acc[a] - acc[b] || a - b);
  const accepted: number[] = [];
  const sizeOf = new Map<number, number>();
  let heads = 0;
  for (let i = 0; i < POOL_GROUPS && heads < c.crowd.totalPeople; i++) {
    const g = order[i];
    const s = groupSizeFor(c.crowd.groupMix, uniform(seed, STREAM.size, g));
    accepted.push(g);
    sizeOf.set(g, s);
    heads += s;
  }
  accepted.sort((a, b) => a - b);

  const G = accepted.length;
  const { T, F } = arrivalCdf(c);
  const pop: Population = {
    seed,
    groupCount: G,
    personCount: heads,
    groupId: new Int32Array(G),
    size: new Uint8Array(G),
    arrivalMs: new Int32Array(G),
    firstPerson: new Int32Array(G),
    reserveDraw: new Float64Array(G),
    objectType: new Uint8Array(G),
    personId: new Int32Array(heads),
    group: new Int32Array(heads),
    member: new Uint8Array(heads),
    servicePct: new Float64Array(heads),
    eatPct: new Float64Array(heads),
    serviceMs: new Int32Array(heads),
    eatMs: new Int32Array(heads),
  };
  let p = 0;
  for (let gi = 0; gi < G; gi++) {
    const g = accepted[gi];
    const n = sizeOf.get(g)!;
    pop.groupId[gi] = g;
    pop.size[gi] = n;
    pop.arrivalMs[gi] = arrivalMsFor(F, T, uniform(seed, STREAM.arrival, g));
    pop.firstPerson[gi] = p;
    pop.reserveDraw[gi] = uniform(seed, STREAM.reserve, g);
    pop.objectType[gi] = Math.floor(uniform(seed, STREAM.object, g) * 3);
    for (let m = 0; m < n; m++, p++) {
      const pid = 6 * g + m;
      pop.personId[p] = pid;
      pop.group[p] = gi;
      pop.member[p] = m;
      pop.servicePct[p] = uniform(seed, STREAM.service, pid);
      pop.eatPct[p] = uniform(seed, STREAM.eat, pid);
      pop.serviceMs[p] = lognormalMs(c.stalls.serviceMean, c.stalls.serviceCV, pop.servicePct[p]);
      pop.eatMs[p] = lognormalMs(c.eat.mean, c.eat.cv, pop.eatPct[p]);
    }
  }
  return pop;
}
