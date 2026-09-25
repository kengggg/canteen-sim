import { num } from './format';

/** Text helpers for the Findings panel (spec §11.13): formatting and the few judgement words, each backed by a check. */

export const MINUS = '−';
const DASH = '–';

/** Signed number: "+5.1", "−6.0", and "0.0" without a sign. */
export function sgn(x: number, d = 1): string {
  const s = num(Math.abs(x), d);
  return Number(s) === 0 ? s : `${x < 0 ? MINUS : '+'}${s}`;
}

/** Number with a typographic minus for negatives, no plus sign. */
export const neg = (x: number, d = 1) => (Number(num(x, d)) < 0 ? `${MINUS}${num(-x, d)}` : num(x, d));

/** A share (0–1) as a whole percentage, or with `d` decimals. */
export const pc = (share: number, d = 0) => `${num(share * 100, d)}%`;

/** "a–b", or just "a" when both round to the same text. Compares the formatted numbers, so "67" and "67" merge. */
export function range(lo: number, hi: number, d = 0, k = 1, unit = ''): string {
  const a = num(Math.min(lo, hi) * k, d), b = num(Math.max(lo, hi) * k, d);
  return a === b ? `${a}${unit}` : `${a}${DASH}${b}${unit}`;
}

/** "a, b and c". */
export const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A 95% range in brackets with signs on both ends: " [−0.4, +0.6]"; empty when there is no interval. */
export function bracket(lo: number | null, hi: number | null, d: number, signed = false): string {
  if (lo === null || hi === null) return '';
  const f = signed ? sgn : neg;
  return ` [${f(Math.min(lo, hi), d)}, ${f(Math.max(lo, hi), d)}]`;
}

/** True when a 95% range includes zero (the data cannot tell the change from none). */
export const straddlesZero = (lo: number | null, hi: number | null) => lo !== null && hi !== null && lo <= 0 && hi >= 0;

/** "about two-thirds" only when every share lies between 0.6 and 0.72; otherwise the shares speak for themselves. */
export function aboutTwoThirds(shares: number[]): boolean {
  return shares.every((s) => s >= 0.6 && s <= 0.72);
}

/** "more than tenfold" for ratios of 10 or more, else "about N-fold" (N whole). */
export function fold(ratio: number): string {
  return ratio >= 10 ? 'more than tenfold' : `about ${Math.round(ratio)}-fold`;
}

/** "most" when the smallest share is at least a half, "nearly all" when it is at least 0.95, else "part". */
export function howMuch(minShare: number): string {
  return minShare >= 0.95 ? 'nearly all' : minShare >= 0.5 ? 'most' : 'part';
}

/**
 * The contiguous run of indices around the minimum where `values` stay below `limit`, or null when even the minimum
 * is not below it.
 */
export function runBelow(values: number[], limit: number): [number, number] | null {
  let at = 0;
  values.forEach((v, i) => { if (v < values[at]) at = i; });
  if (!(values[at] < limit)) return null;
  let lo = at, hi = at;
  while (lo > 0 && values[lo - 1] < limit) lo--;
  while (hi < values.length - 1 && values[hi + 1] < limit) hi++;
  return [lo, hi];
}
