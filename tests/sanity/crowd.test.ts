import { defaultConfig } from '../../src/config/schema';
import { run, SEEDS, pairedCI } from './helpers';

test('small crowd: 0 walk-aways and seats blocked while needed ≤ 1% in every run; max patience: 0 walk-aways', () => {
  for (const seed of SEEDS) {
    for (const f of [1, 0]) {
      const c = defaultConfig();
      c.crowd.totalPeople = 100;
      const r = run(c, seed, f).metrics();
      expect(r.walkAways).toBe(0);
      expect(r.blockedWhileNeeded).toBeLessThanOrEqual(0.01);
      c.search.patience = 30 * 60;
      expect(run(c, seed, f).metrics().walkAways).toBe(0);
    }
  }
});

const sizes = [400, 1000, 1800, 2600];
const counts = new Map<string, number[]>();
test.each(sizes.flatMap((n) => [1, 0].map((f) => [n, f])))('crowd size %i people, fraction %d: walk-away counts over 30 seeds', (n, f) => {
  counts.set(`${n}:${f}`, SEEDS.map((seed) => {
    const c = defaultConfig();
    c.crowd.totalPeople = n;
    return run(c, seed, f).metrics().walkAways;
  }));
});

test('crowd size: mean paired increase in walk-away count ≥ −2·SE for each consecutive size (A 100% and B)', () => {
  for (const f of [1, 0]) {
    for (let i = 1; i < sizes.length; i++) {
      const hi = counts.get(`${sizes[i]}:${f}`)!, lo = counts.get(`${sizes[i - 1]}:${f}`)!;
      const ci = pairedCI(SEEDS.map((_, j) => hi[j] - lo[j]));
      expect(ci.mean).toBeGreaterThanOrEqual(-2 * ci.se);
    }
  }
});

test('queue aversion: stall HHI higher at 0 than at 5 in ≥ 25 of 30 seeds (B)', () => {
  let wins = 0;
  const hhi = (served: number[]) => { const tot = served.reduce((a, b) => a + b, 0); return served.reduce((a, s) => a + (s / tot) * (s / tot), 0); };
  for (const seed of SEEDS) {
    const lo = defaultConfig(); lo.stalls.queueAversion = 0;
    const hi = defaultConfig(); hi.stalls.queueAversion = 5;
    if (hhi(run(lo, seed, 0).metrics().stallServed) > hhi(run(hi, seed, 0).metrics().stallServed)) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(25);
});
