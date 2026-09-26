import { defaultConfig } from '../../src/config/schema';
import { run, SEEDS, pairedCI } from './helpers';

test('small crowd (no spread in wait limits): nobody leaves and seats blocked while needed ≤ 1% in every run', () => {
  for (const seed of SEEDS) {
    for (const f of [1, 0]) {
      const c = defaultConfig();
      c.crowd.totalPeople = 100;
      c.leave.waitCV = 0;
      const r = run(c, seed, f).metrics();
      expect(r.leftPeople).toBe(0);
      expect(r.blockedWhileNeeded).toBeLessThanOrEqual(0.01);
    }
  }
});

test('no leaving: with a 60-minute wait limit, no spread and no seating check, nobody leaves at the defaults (A at 100% and B)', () => {
  for (const seed of SEEDS) {
    for (const f of [1, 0]) {
      const c = defaultConfig();
      c.leave = { waitMean: 3600, waitCV: 0, roomNeeded: 0 };
      expect(run(c, seed, f).metrics().leftPeople).toBe(0);
    }
  }
});

test('wait limit: more people leave at 5 minutes than at 15 in ≥ 25 of 30 seeds (B)', () => {
  let wins = 0;
  for (const seed of SEEDS) {
    const lo = defaultConfig(); lo.leave.waitMean = 300;
    const hi = defaultConfig(); hi.leave.waitMean = 900;
    if (run(lo, seed, 0).metrics().leftPeople > run(hi, seed, 0).metrics().leftPeople) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(25);
});

const sizes = [400, 1000, 1800, 2600];
const counts = new Map<string, number[]>();
test.each(sizes.flatMap((n) => [1, 0].map((f) => [n, f])))('crowd size %i people, fraction %d: left-without-eating counts over 30 seeds', (n, f) => {
  counts.set(`${n}:${f}`, SEEDS.map((seed) => {
    const c = defaultConfig();
    c.crowd.totalPeople = n;
    return run(c, seed, f).metrics().leftPeople;
  }));
});

test('crowd size: mean paired increase in left-without-eating count ≥ −2·SE for each consecutive size (A 100% and B)', () => {
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
