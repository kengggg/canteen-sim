import { quantile, SeatClock, peakThroughput, peakWindow, occupiedShareInWindow, meanOrNull } from '../../src/sim/metrics';
import { uniform } from '../../src/sim/rng';

test('nearest-rank quantiles on integer ms', () => {
  const xs = Array.from({ length: 30 }, (_, i) => (i + 1) * 1000);
  expect(quantile(xs, 50)).toBe(15000);
  expect(quantile(xs, 90)).toBe(27000);
  expect(quantile([7], 90)).toBe(7);
  expect(quantile([], 50)).toBeNull();
  expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
});

test('seat clock: minute bins identical whether time advances in one step or random pieces', () => {
  const run = (pieces: boolean) => {
    const c = new SeatClock(600, 10 * 60_000);
    let t = 0;
    for (let i = 0; i < 200; i++) {
      const to = t + 1 + Math.floor(uniform(5, 1, i) * 20_000);
      if (pieces) {
        const mid = t + Math.floor((to - t) * uniform(5, 2, i));
        c.advance(mid);
      }
      c.advance(to);
      c.move(0, 1 + (i % 5));
      if (i % 7 === 0) c.setStuck(c.stuck + 1);
      if (i % 11 === 0 && c.stuck > 0) c.setStuck(c.stuck - 1);
      t = to;
    }
    return c;
  };
  const a = run(false), b = run(true);
  expect([...a.bins]).toEqual([...b.bins]);
  expect([...a.accum]).toEqual([...b.accum]);
  expect(a.demandMs).toBe(b.demandMs);
  const total = a.accum.reduce((s, v) => s + v, 0);
  expect(total).toBe(600 * a.now);
});

test('peak throughput: most sit starts in any window [t, t + 60 min)', () => {
  expect(peakThroughput([])).toBe(0);
  expect(peakThroughput([0, 1, 2])).toBe(3);
  expect(peakThroughput([0, 3_599_999, 3_600_000])).toBe(2);
  expect(peakThroughput([0, 10, 3_600_005, 3_600_006, 3_600_007])).toBe(4);
});

test('peak window: earliest of ties, clipped to [0, end]', () => {
  const M = 200;
  const bins = (f: (m: number) => number) => { const b = new Float64Array(M * 6); for (let m = 0; m < M; m++) b[m * 6 + 5] = f(m); return b; };
  const flat = bins(() => 10);
  expect(peakWindow(flat, 120 * 60_000, flat, 90 * 60_000)).toEqual({ startMin: 0, lengthMin: 60 });
  const hump = bins((m) => (m >= 50 && m < 110 ? 100 : 1));
  expect(peakWindow(hump, 150 * 60_000, flat, 150 * 60_000).startMin).toBe(50);
  expect(peakWindow(flat, 30 * 60_000 + 1, flat, 20 * 60_000)).toEqual({ startMin: 0, lengthMin: 31 });
});

test('occupied share over a window uses seats × window length', () => {
  const b = new Float64Array(10 * 6);
  for (let m = 0; m < 10; m++) b[m * 6 + 5] = 600 * 60_000 * 0.5; // half of 600 seats occupied
  expect(occupiedShareInWindow(b, 600, { startMin: 2, lengthMin: 5 })).toBeCloseTo(0.5, 12);
});

test('empty populations give null', () => {
  expect(meanOrNull([])).toBeNull();
  expect(meanOrNull([1, 2, 3])).toBe(2);
});
