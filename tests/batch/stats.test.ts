import { tCrit, pairedStat, advantage, winCounts, T_TABLE } from '../../src/batch/stats';

test('t critical values: table for df ≤ 29, Cornish–Fisher above', () => {
  expect(T_TABLE).toHaveLength(29);
  expect(tCrit(1)).toBe(12.706);
  expect(tCrit(9)).toBe(2.262);
  expect(tCrit(29)).toBe(2.045);
  const z = 1.959964;
  const cf = (df: number) => z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
  expect(tCrit(39)).toBeCloseTo(cf(39), 12);
  expect(tCrit(39)).toBeCloseTo(2.0227, 3);
  expect(tCrit(119)).toBeCloseTo(1.9801, 3);
});

test('hand-computed paired-t interval, n = 10 (table df)', () => {
  const s = pairedStat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(s.nUsed).toBe(10);
  expect(s.mean).toBeCloseTo(5.5, 12);
  expect(s.sd).toBeCloseTo(Math.sqrt(82.5 / 9), 12);
  expect(s.halfWidth).toBeCloseTo(2.262 * Math.sqrt(82.5 / 9) / Math.sqrt(10), 12);
  expect(s.lo).toBeCloseTo(5.5 - 2.16570, 4);
  expect(s.hi).toBeCloseTo(5.5 + 2.16570, 4);
});

test('hand-computed paired-t interval, n = 40 (expansion df)', () => {
  const d = Array.from({ length: 40 }, (_, i) => (i % 5) - 1);
  const s = pairedStat(d);
  const mean = d.reduce((a, b) => a + b) / 40;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / 39);
  expect(s.halfWidth).toBeCloseTo(tCrit(39) * sd / Math.sqrt(40), 12);
});

test('flags: all zero, all equal, mostly ties, too few; nulls dropped', () => {
  expect(pairedStat(new Array(12).fill(0))).toMatchObject({ allZero: true, halfWidth: null });
  expect(pairedStat(new Array(12).fill(2))).toMatchObject({ allEqual: true, allZero: false, halfWidth: null, mean: 2 });
  const mostly = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5];
  expect(pairedStat(mostly).mostlyTies).toBe(true);
  expect(pairedStat([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6]).mostlyTies).toBe(false);
  const few = pairedStat([1, 2, 3, null, 4, 5, 6, 7, 8, null, 9]);
  expect(few.n).toBe(11);
  expect(few.nUsed).toBe(9);
  expect(few.tooFew).toBe(true);
  expect(few.halfWidth).toBeNull();
  expect(pairedStat([]).mean).toBeNull();
});

test('free-flow advantage sign: positive means free flow did better', () => {
  expect(advantage(10, 4, 'lower')).toBe(6);
  expect(advantage(0.7, 0.8, 'higher')).toBeCloseTo(0.1, 12);
  expect(advantage(null, 4, 'lower')).toBeNull();
});

test('win / tie / loss counts with exact ties', () => {
  const pairs: [number | null, number | null][] = [[5, 3], [3, 3], [2, 4], [6, 1], [null, 2]];
  expect(winCounts(pairs, 'lower')).toEqual({ W: 2, T: 1, L: 1, n: 4 });
  expect(winCounts(pairs, 'higher')).toEqual({ W: 1, T: 1, L: 2, n: 4 });
});
