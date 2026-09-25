import { dexp, dlog, dnormcdf, dnorminv } from '../../src/sim/dmath';
import golden from '../golden/dmath.json';

test('dexp matches Math.exp to 1e-13 relative over [-700, 700]', () => {
  let worst = 0;
  for (let i = 0; i <= 20000; i++) {
    const x = -700 + (1400 * i) / 20000;
    const ref = Math.exp(x);
    worst = Math.max(worst, Math.abs(dexp(x) - ref) / ref);
  }
  expect(worst).toBeLessThan(1e-13);
  expect(dexp(0)).toBe(1);
});

test('dlog matches Math.log to 1e-13 relative over [1e-300, 1e300]', () => {
  let worst = 0;
  for (let i = 1; i < 20000; i++) {
    const x = Math.pow(10, -300 + (600 * i) / 20000);
    const ref = Math.log(x);
    if (ref !== 0) worst = Math.max(worst, Math.abs(dlog(x) - ref) / Math.abs(ref));
  }
  expect(worst).toBeLessThan(1e-13);
  expect(dlog(1)).toBe(0);
  expect(dlog(0)).toBe(-Infinity);
});

test('dnormcdf within 1e-12 absolute of reference', () => {
  for (const [z, ref] of golden.cdf) expect(Math.abs(dnormcdf(z) - ref)).toBeLessThan(1e-12);
});

test('dnorminv within 1.2e-9 relative of reference, and 0 at 0.5', () => {
  for (const [p, ref] of golden.inv) expect(Math.abs(dnorminv(p) - ref) / Math.abs(ref)).toBeLessThan(1.2e-9);
  expect(dnorminv(0.5)).toBe(0);
});

test('dnorminv is finite at the extreme uniforms and rejects 0 and 1', () => {
  const lo = 0.5 / 4294967296;
  const hi = 1 - lo;
  expect(Number.isFinite(dnorminv(lo))).toBe(true);
  expect(Number.isFinite(dnorminv(hi))).toBe(true);
  expect(dnorminv(lo)).toBeLessThan(-6);
  expect(() => dnorminv(0)).toThrow(RangeError);
  expect(() => dnorminv(1)).toThrow(RangeError);
});

test('Gumbel form -dlog(-dlog(u)) is finite for every extreme u', () => {
  for (const u of [0.5 / 4294967296, 0.5, 1 - 0.5 / 4294967296]) {
    expect(Number.isFinite(-dlog(-dlog(u)))).toBe(true);
  }
});
