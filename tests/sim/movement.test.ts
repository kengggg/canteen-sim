import { getPrecomp } from '../../src/sim/precompute';
import type { LayoutParams } from '../../src/sim/layout';
import { MiniSim } from './helpers/minisim';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const P = getPrecomp(DEFAULT, 10_000);
const G = P.G;
const nodeAt = (x: number, y: number) => G.nodes.find((n) => n.x === x && n.y === y)!.id;
/** All nodes along horizontal line y between x0 and x1 inclusive, in walking order. */
function hPath(y: number, x0: number, x1: number): number[] {
  const ns = G.nodes.filter((n) => n.y === y && n.x >= Math.min(x0, x1) && n.x <= Math.max(x0, x1) && n.hLine >= 0).sort((a, b) => a.x - b.x).map((n) => n.id);
  return x0 <= x1 ? ns : ns.reverse();
}
const sim = (n = 64) => new MiniSim(G, n, P.edgeBetween);
const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);
const travel = (len: number, v: number) => Math.max(1, ceilDiv(len * 1000, v));

test('headway on the 256 mm edge from stall 29 stop: t+197, then t+659', () => {
  const s = sim();
  const from = G.stallNode[29];
  const to = nodeAt(7300, 34250);
  s.add(0, [from, to], 1000);
  s.add(1, [from, to], 1000);
  s.run();
  expect(s.arrivedAt[0][1]).toBe(1197);
  expect(s.arrivedAt[1][1]).toBe(1659);
});

test('a lone walker covers the 30 m aisle at 1.3 m/s (and a tray carrier at 1.0 m/s) within 1 ms per edge', () => {
  for (const [v, ideal] of [[1300, 30000 / 1.3], [1000, 30000]] as const) {
    const s = sim();
    const path = hPath(10175, 8600, 38600);
    s.add(0, path, 0, v);
    s.run();
    const t = s.arrivedAt[0][path.length - 1];
    expect(Math.abs(t - ideal)).toBeLessThanOrEqual(path.length - 1);
  }
});

test('FIFO order: an agent reaching a node never enters ahead of an earlier waiter', () => {
  const s = sim();
  const a = G.stallNode[29], b = nodeAt(7300, 34250);
  // Three agents want a→b; 0 occupies the edge, 1 waits, 2 arrives later at the same node and must not pass 1.
  s.add(0, [a, b], 0);
  s.add(1, [a, b], 10);
  s.add(2, [a, b], 100);
  s.run();
  expect(s.arrivedAt[1][1]).toBeLessThan(s.arrivedAt[2][1]);
});

test('no passing inside a 1-lane link: exit order equals entry order', () => {
  const s = sim();
  const path = hPath(10175, 8600, 11600); // one link between vertical aisles 0 and 1
  for (let p = 0; p < 6; p++) s.add(p, path, p * 50, p % 2 ? 1000 : 1300);
  s.run();
  const ends = [0, 1, 2, 3, 4, 5].map((p) => s.arrivedAt[p][path.length - 1]);
  for (let i = 1; i < 6; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
});

test('batch alternation: the earliest waiter picks the direction; later same-direction arrivals wait for the next batch', () => {
  const s = sim();
  const east = hPath(10175, 8600, 11600);
  const west = [...east].reverse();
  s.add(0, east, 0); // registers east
  s.add(1, west, 100); // waiter west (earliest waiter)
  s.add(2, east, 200); // waiter east, not in any batch yet
  s.add(3, west, 300); // waiter west
  s.add(4, east, 5000); // arrives while the west batch is running
  s.run();
  const start = (p: number) => s.arrivedAt[p][1] - 1; // proxy: first node after entry
  const endOf = (p: number, path: number[]) => s.arrivedAt[p][path.length - 1];
  // West batch {1, 3} runs before east waiters {2, 4}.
  expect(endOf(1, west)).toBeLessThan(start(2));
  expect(endOf(3, west)).toBeLessThan(start(2));
  expect(start(4)).toBeGreaterThan(endOf(3, west));
});

test('starvation bound on a single 1-lane link with continuous two-way arrivals', () => {
  const s = sim(400);
  const east = hPath(10175, 8600, 11600);
  const west = [...east].reverse();
  let p = 0;
  for (let t = 0; t < 300_000; t += 1500) s.add(p++, east, t);
  for (let t = 700; t < 300_000; t += 1700) s.add(p++, west, t);
  // Record w when each agent starts waiting.
  const wAt: number[] = [];
  const origAdmit = s.mv.admitStep.bind(s.mv);
  s.mv.admitStep = () => {
    origAdmit();
    for (let q = 0; q < p; q++) {
      if (wAt[q] === undefined && s.mv.isWaiting(q)) wAt[q] = s.mv.linkLoadAhead(q);
    }
  };
  s.run();
  const v = 1000;
  const edges = east.slice(1).map((n, i) => G.edges[P.edgeBetween(east[i], n)]);
  const TL = edges.reduce((a, e) => a + travel(e.lengthMm, v), 0);
  const cL = edges.reduce((a, e) => a + e.capacity, 0);
  const h = ceilDiv(600_000, v);
  for (let q = 0; q < p; q++) {
    expect(s.done[q]).toBe(true);
    if (wAt[q] === undefined) continue;
    const waited = s.admittedAtMs(q) - s.arrivedAt[q][0];
    expect(waited).toBeLessThanOrEqual((wAt[q] + 1) * (TL + cL * h));
  }
});

test('U-turn: a registered agent turning at a mid-link node is deregistered and admitted the other way once d empties', () => {
  const s = sim();
  const east = hPath(10175, 8600, 11600);
  const mid = east[2];
  // Agent 0 walks east to the middle, then turns back west.
  s.add(0, [...east.slice(0, 3), east[1], east[0]], 0);
  s.add(1, east, 200);
  s.run();
  expect(s.done[0] && s.done[1]).toBe(true);
  expect(s.paths[0][2]).toBe(mid);
});

test('ruling 1: a registered agent behind a rule-3-blocked non-registered head still enters', () => {
  const s = sim();
  const east = hPath(10175, 8600, 11600); // [v0, s0, s1, s2, v1]
  const west = [...east].reverse();
  s.add(0, east, 0); // registers east, runs ahead
  s.add(1, west, 300); // west waiter
  // Agent 2 appears at the mid-link node s1 (e.g. stood up) wanting east: blocked by rule 3 (west waiter, no batch).
  s.add(2, east.slice(2), 400);
  // Agent 3 is registered east (entered behind 0) and reaches s1 after agent 2 queued.
  s.add(3, east, 150);
  s.run();
  for (const q of [0, 1, 2, 3]) expect(s.done[q]).toBe(true);
});

test('busy node delays a passer by at most the remaining action time', () => {
  const s = sim();
  const east = hPath(10175, 8600, 11600);
  const seatNode = east[2];
  s.at(1000, () => s.mv.busy(seatNode, 1));
  s.at(4000, () => s.mv.busy(seatNode, -1));
  s.add(0, east, 1500);
  s.run();
  const alone = sim();
  alone.add(0, east, 1500);
  alone.run();
  const delay = s.arrivedAt[0][east.length - 1] - alone.arrivedAt[0][east.length - 1];
  expect(delay).toBeGreaterThan(0);
  expect(delay).toBeLessThanOrEqual(3000);
  // Nobody enters an edge whose far end is busy: the passer reaches the busy node only after the action ends.
  expect(s.arrivedAt[0][2]).toBeGreaterThanOrEqual(4000);
});

test('capacity: 2-lane edges hold cap per direction, >= 4 lanes hold lanes·cap in total', () => {
  // Top walkway (2 lanes): a 2312 mm-ish edge has cap 3 per direction; many agents entering at once.
  const s = sim(200);
  const path = hPath(34250, 13000, 26600); // concourse, 5 lanes
  for (let p = 0; p < 40; p++) s.add(p, path.slice(0, 2), 0);
  s.run(0);
  const e = G.edges[P.edgeBetween(path[0], path[1])];
  expect(s.mv.onEdgeCount).toBe(Math.min(40, e.lanes * e.capacity));
  s.run();
  const w = sim(200);
  const wp = hPath(7300, 20000, 30000); // top walkway, 2 lanes
  for (let p = 0; p < 20; p++) w.add(p, wp.slice(0, 2), 0);
  w.run(0);
  const we = G.edges[P.edgeBetween(wp[0], wp[1])];
  expect(w.mv.onEdgeCount).toBe(Math.min(20, we.capacity));
});

test('after a placement on a 1-lane aisle, two followers at adjacent mid-link nodes both turn back and leave within 2·(T_L + h)', () => {
  const s = sim();
  const east = hPath(10175, 8600, 11600); // [v0, s0, s1, s2, v1]
  const [v0, s0, s1, s2] = east;
  const hold = new Set<number>();
  s.onArrive = (p, node) => {
    if (p === 0 && node === s2) { s.mv.stop(p); s.mv.busy(s2, 1); return false; }
    if (p === 2 && node === s0) return false; // follower B waits at s0, still registered east
    if (hold.has(p) && node === v0) s.done[p] = true;
    return true;
  };
  // Link-direction invariant: everyone on a 1-lane edge is registered on its link in the direction of travel.
  let violations = 0;
  const admit = s.mv.admitStep.bind(s.mv);
  s.mv.admitStep = () => {
    admit();
    for (let p = 0; p < 3; p++) {
      const e = s.mv.edge[p];
      if (e < 0 || G.edges[e].lanes !== 1) continue;
      if (s.mv.regLink[p] !== G.edges[e].link || s.mv.regDir[p] !== s.mv.dir[p]) violations++;
    }
  };
  s.add(0, [v0, s0, s1, s2], 0); // claimer
  s.add(1, [v0, s0, s1, s2], 300); // follower A: waits at s1 for the busy s2
  s.add(2, [v0, s0, s1], 600); // follower B
  s.run(2500);
  const placeEnd = 2500 + 3000;
  s.at(placeEnd, () => {
    s.mv.busy(s2, -1);
    hold.add(1).add(2);
    s.reroute(0, [s2, s1, s0, v0]);
    s.reroute(1, [s1, s0, v0]);
    s.reroute(2, [s0, v0]);
  });
  s.run();
  const edges = east.slice(1).map((n, i) => G.edges[P.edgeBetween(east[i], n)]);
  const TL = edges.reduce((a, e) => a + travel(e.lengthMm, 1000), 0);
  const h = ceilDiv(600_000, 1000);
  for (const p of [1, 2]) {
    const last = s.arrivedAt[p][s.arrivedAt[p].length - 1];
    expect(s.paths[p][s.paths[p].length - 1]).toBe(v0);
    expect(last - placeEnd).toBeLessThanOrEqual(2 * (TL + h));
  }
  expect(s.mv.linkDir(G.edges[P.edgeBetween(v0, s0)].link)).toBe(0);
  expect(violations).toBe(0);
});
