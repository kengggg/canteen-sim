import { fmix32, hash4, uniform, STREAM } from '../../src/sim/rng';

test('fmix32 known values', () => {
  expect(fmix32(0)).toBe(0);
  expect(fmix32(1)).toBe(1364076727);
});

test('hash4 known values (pins the formula)', () => {
  expect(hash4(1, 1, 0, 0)).toBe(1626978197);
  expect(hash4(1, 6, 7, 0)).toBe(3749425112);
  expect(uniform(1, 1, 0)).toBe(0.3788103809347376);
});

test('stream ids match spec §8.2', () => {
  expect(STREAM).toEqual({ arrival: 1, size: 2, accept: 3, reserve: 4, object: 5, service: 6, eat: 7, stallNoise: 8, stallRank: 9, route: 10, batchSeed: 11 });
});

test('uniform stays strictly inside (0,1) at extreme seeds and keys', () => {
  for (const seed of [0, 1, 0xffffffff]) {
    for (const a of [0, 1, 0x7fffffff, 0xffffffff]) {
      const u = uniform(seed, STREAM.eat, a, 0xffffffff);
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(uniform(seed, STREAM.eat, a, 0xffffffff)).toBe(u);
    }
  }
});

test('service and eat percentiles are uncorrelated over 1e5 persons', () => {
  const n = 100_000;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let p = 0; p < n; p++) {
    const x = uniform(1, STREAM.service, p);
    const y = uniform(1, STREAM.eat, p);
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const corr = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
  expect(Math.abs(corr)).toBeLessThan(0.01);
});

test('100-bin chi-square passes at alpha = 0.001', () => {
  const n = 100_000;
  const bins = new Array(100).fill(0);
  for (let p = 0; p < n; p++) bins[Math.floor(uniform(7, STREAM.arrival, p) * 100)]++;
  const expected = n / 100;
  const chi2 = bins.reduce((s, o) => s + ((o - expected) * (o - expected)) / expected, 0);
  expect(chi2).toBeLessThan(148.23); // chi-square 0.999 quantile, df = 99
});
