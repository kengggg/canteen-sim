import { buildLayout, type LayoutParams } from '../../src/sim/layout';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };

test('default hall dimensions and counts (spec §3.4)', () => {
  const L = buildLayout(DEFAULT);
  expect([L.W, L.H]).toEqual([39200, 35750]);
  expect(L.tables).toHaveLength(100);
  expect(L.seats).toHaveLength(600);
  expect([L.topStalls, L.leftStalls]).toEqual([18, 12]);
  expect(L.queueCapacity).toBe(12);
  expect([L.entranceX, L.exitX, L.trayX]).toEqual([27440, 33320, 10000]);
});

test('stall frontages ~2178 top and ~2313 left', () => {
  const L = buildLayout(DEFAULT);
  const top = new Set(L.stalls.filter((s) => s.band === 'top').map((s) => s.frontage));
  const left = new Set(L.stalls.filter((s) => s.band === 'left').map((s) => s.frontage));
  expect([...top].sort()).toEqual([2177, 2178]);
  expect([...left].sort()).toEqual([2312, 2313]);
});

test('seat positions and ids (spec §3.5)', () => {
  const L = buildLayout(DEFAULT);
  expect(L.seats.slice(0, 3).map((s) => s.x)).toEqual([9500, 10100, 10700]);
  const s = L.seats[4]; // table 0, south, i = 1
  expect([s.table, s.side, s.i, s.line]).toEqual([0, 1, 1, 1]);
  expect(L.seats.every((seat) => Number.isInteger(seat.x) && Number.isInteger(seat.y))).toBe(true);
});

test('walkway stops of stall 0 and stall 29', () => {
  const L = buildLayout(DEFAULT);
  expect([L.stalls[0].stopX, L.stalls[0].stopY]).toEqual([1689, 7300]);
  expect([L.stalls[29].stopX, L.stalls[29].stopY]).toEqual([7300, 33994]);
});

test('line positions', () => {
  const L = buildLayout(DEFAULT);
  expect(L.hLines.map((h) => h.y)).toEqual([7300, 10175, 12725, 15275, 17825, 20375, 22925, 25475, 28025, 30575, 34250]);
  expect(L.vLines[0].x).toBe(7300);
  expect(L.vLines[1].x).toBe(8600);
  expect(L.vLines[11].x).toBe(38600);
});

test('queue capacity uses integer math (5.6 m → 14, 9.2 m → 26)', () => {
  expect(buildLayout({ ...DEFAULT, queueDepthMm: 5600 }).queueCapacity).toBe(14);
  expect(buildLayout({ ...DEFAULT, queueDepthMm: 9200 }).queueCapacity).toBe(26);
});

test('queue position order folds back toward the counter (spec §3.6)', () => {
  const s = buildLayout(DEFAULT).stalls[0];
  expect(s.slots[0]).toEqual({ x: 300, y: 3300 }); // position 1 = service position
  expect(s.slots[5]).toEqual({ x: 300, y: 6300 });
  expect(s.slots[6]).toEqual({ x: 900, y: 6300 });
  expect(s.slots[11]).toEqual({ x: 900, y: 3300 });
});
