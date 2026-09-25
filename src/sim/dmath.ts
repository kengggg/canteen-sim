// Deterministic math: only + − × ÷, integer ops and Math.sqrt/round (spec §8.5).
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;
const TWO_OVER_SQRT_PI = 1.1283791670955126;

/** e^x. Range reduction x = k·ln2 + r, Taylor series for e^r, exact ×2 / ×0.5 scaling. */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.1) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 20; n++) {
    term = (term * r) / n;
    sum += term;
  }
  let result = sum;
  if (k > 0) for (let i = 0; i < k; i++) result *= 2;
  else for (let i = 0; i < -k; i++) result *= 0.5;
  return result;
}

/** ln x. Scale to m ∈ [√½, √2) by exact ×2 / ×0.5, then 2·atanh((m−1)/(m+1)). */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let m = x;
  let e = 0;
  while (m >= SQRT2) { m *= 0.5; e++; }
  while (m < SQRT1_2) { m *= 2; e--; }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = s;
  for (let n = 3; n <= 41; n += 2) {
    term *= s2;
    sum += term / n;
  }
  return e * LN2_HI + (e * LN2_LO + 2 * sum);
}

/** erf via the all-positive series erf(x) = 2/√π · e^{−x²} · Σ 2ⁿx^{2n+1}/(1·3···(2n+1)); |x| > 6 → ±1. */
function derf(x: number): number {
  const ax = x < 0 ? -x : x;
  if (ax > 6) return x < 0 ? -1 : 1;
  const x2 = ax * ax;
  let term = ax;
  let sum = ax;
  for (let n = 1; n <= 400; n++) {
    term = (term * 2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  const v = TWO_OVER_SQRT_PI * dexp(-x2) * sum;
  return x < 0 ? -v : v;
}

/** Standard normal CDF Φ(z), absolute error < 1e-12. */
export function dnormcdf(z: number): number {
  return 0.5 * (1 + derf(z * SQRT1_2));
}

const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

function tail(q: number): number {
  return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
    ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
}

/** Inverse standard normal CDF (Acklam), relative error < 1.2e-9. */
export function dnorminv(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('dnorminv: p must be in (0, 1)');
  if (p < P_LOW) return tail(Math.sqrt(-2 * dlog(p)));
  if (p > 1 - P_LOW) return -tail(Math.sqrt(-2 * dlog(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}
