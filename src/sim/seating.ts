/**
 * Seat helpers (spec §5.4, §5.5, §5.6, §7.1). Seats are local indices j = side·k + i within a table
 * (side 0 = north), and sets are bitmasks over those indices.
 */
export const SEAT = { FREE: 0, OPEN: 1, BLOCKED: 2, CLAIMED_EMPTY: 3, HELD: 4, OCCUPIED: 5 } as const;

export function popcount(x: number): number {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

function bitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let j = 0; mask; j++, mask >>>= 1) if (mask & 1) out.push(j);
  return out;
}

function runs(mask: number, k: number): number {
  let r = 0;
  for (let side = 0; side < 2; side++) {
    let prev = false;
    for (let i = 0; i < k; i++) {
      const on = (mask >>> (side * k + i)) & 1;
      if (on && !prev) r++;
      prev = on === 1;
    }
  }
  return r;
}

/** Lexicographic comparison of the sorted seat lists of two masks. */
function lexLess(a: number, b: number): boolean {
  const x = bitsOf(a), y = bitsOf(b);
  for (let i = 0; i < x.length && i < y.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return x.length < y.length;
}

function lessKey(ka: number[], kb: number[], a: number, b: number): boolean {
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return lexLess(a, b);
}

function bestSubset(k: number, freeMask: number, n: number, key: (m: number) => number[]): number[] {
  let best = -1;
  let bk: number[] = [];
  const full = (1 << (2 * k)) - 1;
  for (let m = 1; m <= full; m++) {
    if ((m & freeMask) !== m || popcount(m) !== n) continue;
    const km = key(m);
    if (best < 0 || lessKey(km, bk, m, best)) { best = m; bk = km; }
  }
  return best < 0 ? [] : bitsOf(best);
}

/** Seat choice at an unclaimed table: min (sidesUsed, contiguousRuns, −facingPairs, −here, sorted ids). */
export function chooseUnclaimed(k: number, freeMask: number, n: number, hereMask: number): number[] {
  const north = (1 << k) - 1;
  return bestSubset(k, freeMask, n, (m) => {
    const sides = (m & north ? 1 : 0) + ((m >>> k) & north ? 1 : 0);
    const facing = popcount(m & (m >>> k) & north);
    return [sides, runs(m, k), -facing, m & hereMask ? -1 : 0];
  });
}

function d2(k: number, a: number, b: number): number {
  const ia = a % k, ib = b % k;
  const dx = 600 * (ia - ib);
  const dy = (a < k) !== (b < k) ? 1300 : 0;
  return dx * dx + dy * dy;
}

/** Joiners at a claimed table: min (−min d², contiguousRuns, −Σ nearest d², −here, sorted ids). */
export function chooseJoin(k: number, freeMask: number, takenMask: number, n: number, hereMask: number): number[] {
  const taken = bitsOf(takenMask);
  return bestSubset(k, freeMask, n, (m) => {
    let minD = Infinity;
    let sum = 0;
    for (const j of bitsOf(m)) {
      let near = Infinity;
      for (const t of taken) near = Math.min(near, d2(k, j, t));
      if (near === Infinity) near = 0;
      sum += near;
      minD = Math.min(minD, near);
    }
    return [-minD, runs(m, k), -sum, m & hereMask ? -1 : 0];
  });
}

/** Reserver seat fill order: the claimer's side i = 0…k−1, then the opposite side. */
export function fillOrder(k: number, firstSide: number): number[] {
  const out: number[] = [];
  for (const side of [firstSide, 1 - firstSide]) for (let i = 0; i < k; i++) out.push(side * k + i);
  return out;
}

/** The owner's sharing rule (§5.6), judged on the true state at the end of the ask. */
export function joinAllowed(a: { complete: boolean; n: number; shareMaxParty: number; freeCount: number; shareMinEmpty: number }): boolean {
  return a.complete && a.n <= a.shareMaxParty && a.freeCount >= Math.max(a.n, a.shareMinEmpty);
}

/** §7.1 seat state with precedence occupied > held > claimedEmpty > openToSmall | blockedLeftover > free. */
export function seatStateOf(a: { occupied: boolean; held: boolean; claimed: boolean; complete: boolean; freeCount: number; shareMinEmpty: number }): number {
  if (a.occupied) return SEAT.OCCUPIED;
  if (a.held) return SEAT.HELD;
  if (a.claimed) {
    if (!a.complete) return SEAT.CLAIMED_EMPTY;
    return a.freeCount >= a.shareMinEmpty ? SEAT.OPEN : SEAT.BLOCKED;
  }
  return SEAT.FREE;
}

/** The searcher's own seat: the lowest seat of the set at its current node, else the lowest seat. */
export function ownSeat(set: number[], hereMask: number): number {
  for (const j of set) if ((hereMask >>> j) & 1) return j;
  return set[0];
}
