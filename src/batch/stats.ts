/** Paired statistics (spec §10.3). Under the determinism allowlist: only + − × ÷ and Math.sqrt. */

/** Two-sided 95% t critical values for df = 1…29. */
export const T_TABLE = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
  2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045,
];
const Z = 1.959964;

export function tCrit(df: number): number {
  if (df <= 29) return T_TABLE[df - 1];
  const z2 = Z * Z, z3 = z2 * Z, z5 = z3 * z2, z7 = z5 * z2;
  return Z + (z3 + Z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * Z) / (96 * df * df) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * Z) / (384 * df * df * df);
}

export interface PairedStat {
  n: number;
  nUsed: number;
  mean: number | null;
  sd: number | null;
  halfWidth: number | null;
  lo: number | null;
  hi: number | null;
  allZero: boolean;
  allEqual: boolean;
  mostlyTies: boolean;
  tooFew: boolean;
}

export const MIN_FOR_INTERVAL = 10;

/** Mean paired difference with its 95% t-interval; nulls are dropped. */
export function pairedStat(diffs: readonly (number | null)[]): PairedStat {
  const d: number[] = [];
  for (const x of diffs) if (x !== null && x === x) d.push(x);
  const n = d.length;
  const base = { n: diffs.length, nUsed: n, allZero: false, allEqual: false, mostlyTies: false, tooFew: n < MIN_FOR_INTERVAL };
  if (n === 0) return { ...base, mean: null, sd: null, halfWidth: null, lo: null, hi: null };
  let sum = 0, zeros = 0;
  let allEqual = true;
  for (const x of d) {
    sum += x;
    if (x === 0) zeros++;
    if (x !== d[0]) allEqual = false;
  }
  const mean = sum / n;
  let ss = 0;
  for (const x of d) ss += (x - mean) * (x - mean);
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const allZero = allEqual && d[0] === 0;
  const mostlyTies = zeros * 2 > n;
  const noInterval = base.tooFew || allEqual;
  const hw = noInterval ? null : (tCrit(n - 1) * sd) / Math.sqrt(n);
  return {
    ...base, mean, sd, allZero, allEqual, mostlyTies,
    halfWidth: hw, lo: hw === null ? null : mean - hw, hi: hw === null ? null : mean + hw,
  };
}

export type Better = 'lower' | 'higher';

/** Free-flow advantage: A − B for lower-is-better metrics, B − A for higher-is-better (B = the 0% run). */
export function advantage(a: number | null, b: number | null, better: Better): number | null {
  if (a === null || b === null) return null;
  return better === 'lower' ? a - b : b - a;
}

/** "Free flow better in W · tied in T · reservation better in L (of n)". A tie is exact equality. */
export function winCounts(pairs: readonly [number | null, number | null][], better: Better): { W: number; T: number; L: number; n: number } {
  let W = 0, T = 0, L = 0;
  for (const [a, b] of pairs) {
    const adv = advantage(a, b, better);
    if (adv === null) continue;
    if (adv > 0) W++;
    else if (adv < 0) L++;
    else T++;
  }
  return { W, T, L, n: W + T + L };
}
