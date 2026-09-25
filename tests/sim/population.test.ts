import { defaultConfig } from '../../src/config/schema';
import { uniform, STREAM } from '../../src/sim/rng';
import { arrivalCdf, arrivalMsFor, groupSizeFor, lognormalMs, buildPopulation, POOL_GROUPS } from '../../src/sim/population';

test('arrival CDF is monotone and reaches 1 at T (defaults, peakShare 0 and 1)', () => {
  for (const s of [0.6, 0, 1]) {
    const c = defaultConfig();
    c.crowd.peakShare = s;
    const { T, F } = arrivalCdf(c);
    expect(T).toBe(150 * 60_000);
    let prev = -1;
    for (let t = 0; t <= T; t += 60_000) {
      const v = F(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(F(0)).toBeGreaterThanOrEqual(0);
    expect(Math.abs(F(T) - 1)).toBeLessThan(1e-15);
  }
});

test('arrival ms is the smallest t with F(t) >= u, for 1e4 draws', () => {
  const c = defaultConfig();
  const { T, F } = arrivalCdf(c);
  for (let i = 0; i < 10_000; i++) {
    const u = uniform(1, STREAM.arrival, i);
    const t = arrivalMsFor(F, T, u);
    expect(Number.isInteger(t)).toBe(true);
    expect(t >= 0 && t <= T).toBe(true);
    expect(u <= F(t)).toBe(true);
    if (t > 0) expect(F(t - 1) < u).toBe(true);
  }
});

test('group size inverse CDF follows the mix and skips zero weights', () => {
  const mix = [25, 30, 20, 15, 5, 5];
  const counts = [0, 0, 0, 0, 0, 0];
  const n = 100_000;
  for (let i = 0; i < n; i++) counts[groupSizeFor(mix, uniform(3, STREAM.size, i)) - 1]++;
  counts.forEach((c, i) => expect(Math.abs((100 * c) / n - mix[i])).toBeLessThan(1));
  for (let i = 0; i < 10_000; i++) expect(groupSizeFor([0, 50, 0, 50, 0, 0], uniform(3, STREAM.size, i)) % 2).toBe(0);
});

test('lognormal durations: cv = 0 is exact; mean and CV match', () => {
  for (const u of [1e-9, 0.3, 0.5, 0.999]) expect(lognormalMs(90, 0, u)).toBe(90_000);
  const n = 100_000;
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const x = lognormalMs(90, 0.5, uniform(1, STREAM.service, i));
    s += x; s2 += x * x;
  }
  const mean = s / n;
  const cv = Math.sqrt(s2 / n - mean * mean) / mean;
  expect(Math.abs(mean / 90_000 - 1)).toBeLessThan(0.01);
  expect(Math.abs(cv / 0.5 - 1)).toBeLessThan(0.03);
});

test('acceptance gives [N, N+5] arrivals, and crowds nest with identical draws', () => {
  const at = (N: number) => {
    const c = defaultConfig();
    c.crowd.totalPeople = N;
    return buildPopulation(c, 1);
  };
  for (const [small, big] of [[800, 2600], [1000, 1050]]) {
    const a = at(small), b = at(big);
    expect(a.personCount).toBeGreaterThanOrEqual(small);
    expect(a.personCount).toBeLessThanOrEqual(small + 5);
    const idx = new Map<number, number>();
    for (let g = 0; g < b.groupCount; g++) idx.set(b.groupId[g], g);
    for (let g = 0; g < a.groupCount; g++) {
      const j = idx.get(a.groupId[g]);
      expect(j).toBeDefined();
      expect([a.size[g], a.arrivalMs[g], a.reserveDraw[g], a.objectType[g]]).toEqual([b.size[j!], b.arrivalMs[j!], b.reserveDraw[j!], b.objectType[j!]]);
      for (let m = 0; m < a.size[g]; m++) {
        const pa = a.firstPerson[g] + m, pb = b.firstPerson[j!] + m;
        expect([a.personId[pa], a.serviceMs[pa], a.eatMs[pa]]).toEqual([b.personId[pb], b.serviceMs[pb], b.eatMs[pb]]);
      }
    }
  }
});

test('person ids are 6·groupId + member in ascending dense order; reservers nest', () => {
  const pop = buildPopulation(defaultConfig(), 1);
  for (let p = 0; p < pop.personCount; p++) {
    const g = pop.group[p];
    expect(pop.personId[p]).toBe(6 * pop.groupId[g] + pop.member[p]);
    if (p > 0) expect(pop.personId[p]).toBeGreaterThan(pop.personId[p - 1]);
  }
  for (let g = 1; g < pop.groupCount; g++) expect(pop.groupId[g]).toBeGreaterThan(pop.groupId[g - 1]);
  expect(pop.groupId[pop.groupCount - 1]).toBeLessThan(POOL_GROUPS);
  for (const [p1, p2] of [[0.25, 0.5], [0.5, 1]]) {
    for (let g = 0; g < pop.groupCount; g++) if (pop.reserveDraw[g] < p1) expect(pop.reserveDraw[g] < p2).toBe(true);
  }
});

test('reference arrival ms for groupIds 0-9 at seed 1 are pinned', () => {
  const { T, F } = arrivalCdf(defaultConfig());
  const got = Array.from({ length: 10 }, (_, g) => arrivalMsFor(F, T, uniform(1, STREAM.arrival, g)));
  expect(got).toEqual(PINNED);
});

const PINNED = [4098500, 4587477, 3504393, 5841797, 3343868, 3943773, 5437900, 5207194, 3500063, 5742489];
