import { getPrecomp } from '../../src/sim/precompute';
import type { LayoutParams } from '../../src/sim/layout';
import { Memory, observe, freeFlowTarget, claimTarget, exploreTarget, suitable, type TableTruth } from '../../src/sim/search';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const P = getPrecomp(DEFAULT, 10_000);
const T = P.tableCount;
const truth = (): TableTruth => ({ occMask: new Int32Array(T), heldMask: new Int32Array(T), claimed: new Uint8Array(T) });
const opts = { shareMaxParty: 2, shareMinEmpty: 4, detourMm: 0 };

test('observation covers exactly the visible tables; held seats look empty from a distance', () => {
  const w = truth();
  const node = P.G.seatNode[0];
  const t = P.visibleTables[node][0];
  w.occMask[t] = 0b000011;
  w.heldMask[t] = 0b001100;
  const m = new Memory(P);
  observe(m, P, node, 1000, w);
  expect(m.list).toEqual([...P.visibleTables[node]]);
  expect(m.occMask[t]).toBe(0b000011);
  expect(m.heldMask[t]).toBe(0);
  expect(m.seated[t]).toBe(2);
  expect(m.observedMs[t]).toBe(1000);
});

test('suitability table of §5.5', () => {
  const m = new Memory(P);
  m.record(0, 0b000011, false, 0);
  expect(suitable(m, 0, 4, opts, 0)).toBe(true);
  expect(suitable(m, 0, 5, opts, 0)).toBe(false);
  m.record(1, 0b000001, true, 0);
  expect(suitable(m, 1, 2, opts, 0)).toBe(true);
  expect(suitable(m, 1, 3, opts, 0)).toBe(false); // above shareMaxParty
  m.record(2, 0b000111, true, 0);
  expect(suitable(m, 2, 1, opts, 0)).toBe(false); // 3 empty < shareMinEmpty
  m.record(3, 0, true, 0);
  expect(suitable(m, 3, 1, opts, 0)).toBe(false); // claimed but nobody seated
  m.refusedUntil[0] = 5000;
  expect(suitable(m, 0, 2, opts, 4999)).toBe(false);
  expect(suitable(m, 0, 2, opts, 5000)).toBe(true);
});

test('free-flow target is the nearest suitable table by distance to an empty seat node, ties by table then node id', () => {
  const m = new Memory(P);
  const cur = P.G.seatNode[0];
  for (const t of [0, 1, 10]) m.record(t, 0, false, 0);
  const tg = freeFlowTarget(m, P, cur, 2, opts, 0)!;
  expect(tg.table).toBe(0);
  expect(tg.node).toBe(cur);
  m.record(0, 0b111111, false, 0);
  const t2 = freeFlowTarget(m, P, cur, 2, opts, 0)!;
  let best = Infinity, bt = -1;
  for (const t of [1, 10]) for (let j = 0; j < 6; j++) { const d = P.R.dist(cur, P.G.seatNode[t * 6 + j]); if (d < best) { best = d; bt = t; } }
  expect(t2.table).toBe(bt);
  expect(t2.dist).toBe(best);
});

test('detour d > 0 prefers a completely empty table within d', () => {
  const m = new Memory(P);
  const cur = P.G.seatNode[0];
  m.record(0, 0b000001, false, 0); // nearest, partly occupied
  m.record(1, 0, false, 0); // completely empty, a little further
  expect(freeFlowTarget(m, P, cur, 2, opts, 0)!.table).toBe(0);
  expect(freeFlowTarget(m, P, cur, 2, { ...opts, detourMm: 40_000 }, 0)!.table).toBe(1);
  expect(freeFlowTarget(m, P, cur, 2, { ...opts, detourMm: 1 }, 0)!.table).toBe(0);
});

test('claim target minimises n·dist + Σ member walk, ties to the lower table id', () => {
  const m = new Memory(P);
  const cur = P.G.entranceNode;
  for (const t of [90, 99, 5]) m.record(t, 0, false, 0);
  m.record(91, 0b1, false, 0); // not completely empty
  const stall = P.G.stallNode[0];
  const sum = (a: number) => 2 * P.R.dist(a, stall);
  const tg = claimTarget(m, P, cur, 2, sum)!;
  const score = (t: number) => { const a = P.nodeTableAccess[cur * T + t]; return 2 * P.nodeTableDist[cur * T + t] + sum(a); };
  const best = [90, 99, 5].sort((a, b) => score(a) - score(b) || a - b)[0];
  expect(tg.table).toBe(best);
  expect(tg.node).toBe(P.nodeTableAccess[cur * T + best]);
});

test('explore: nearest intersection not visited in 60 s, else the least recently visited', () => {
  const m = new Memory(P);
  const cur = P.intersections[5];
  m.visit(cur, 0);
  const x1 = exploreTarget(m, P, cur, 0);
  let best = Infinity, bn = -1;
  for (const x of P.intersections) { if (x === cur) continue; const d = P.R.dist(cur, x); if (d < best) { best = d; bn = x; } }
  expect(x1).toBe(bn);
  for (const x of P.intersections) m.visit(x, 1000 + x);
  expect(exploreTarget(m, P, cur, 2000)).toBe(P.intersections[0]);
  expect(exploreTarget(m, P, cur, 1000 + P.intersections[0] + 60_000)).toBe(P.intersections[0]);
});

test('ruling 4: learned held seats stay taken until seen occupied', () => {
  const w = truth();
  const node = P.G.seatNode[0];
  const t = 0;
  const m = new Memory(P);
  m.learn(t, 0b000000, 0b001111, false, 0); // arrival check found 4 held seats
  expect(suitable(m, t, 4, opts, 0)).toBe(false);
  observe(m, P, node, 10, w); // from a distance everything looks empty
  expect(suitable(m, t, 4, opts, 10)).toBe(false);
  w.occMask[t] = 0b000011;
  observe(m, P, node, 20, w);
  expect(m.heldMask[t]).toBe(0b001100);
});
