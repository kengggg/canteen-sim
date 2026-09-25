import fc from 'fast-check';
import { buildLayout, type LayoutParams } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';
import { buildRouter, INF, type Router } from '../../src/sim/routing';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const G = buildNavGraph(buildLayout(DEFAULT));
const R = buildRouter(G);

/** Walk options[0] repeatedly and return the total length walked. */
function walk(r: Router, from: number, to: number): number {
  const g = r.graph;
  let at = from;
  let len = 0;
  for (let guard = 0; at !== to; guard++) {
    if (guard > 10_000) throw new Error('walk did not terminate');
    const o = r.options(at, to)[0];
    const l = g.links[o.link];
    const seq = [l.a, ...l.edges.map((e) => g.edges[e].b)];
    let i = seq.indexOf(at);
    const j = seq.indexOf(o.next);
    const step = j > i ? 1 : -1;
    while (i !== j) {
      const u = g.nodes[seq[i]], v = g.nodes[seq[i + step]];
      len += Math.abs(u.x - v.x) + Math.abs(u.y - v.y);
      i += step;
    }
    at = o.next;
  }
  return len;
}

test('from (vertical aisle 6, concourse) to stall 0: north and west both optimal (spec §13.1)', () => {
  const start = G.nodes.find((n) => n.intersection && n.x === 26600 && n.y === 34250)!;
  const tgt = G.stallNode[0];
  expect(R.dist(start.id, tgt)).toBe(51861);
  const next = R.options(start.id, tgt).map((o) => [G.nodes[o.next].x, G.nodes[o.next].y]);
  expect(next).toContainEqual([26600, 30575]); // north
  expect(next).toContainEqual([23600, 34250]); // west
});

test('both ends of a stop segment tie: S1 → N1 of table 0 gives two first moves', () => {
  const s1 = G.seatNode[4], n1 = G.seatNode[1];
  expect(R.dist(s1, n1)).toBe(5875);
  expect(R.options(s1, n1)).toHaveLength(2);
});

test('same-segment target goes directly', () => {
  const a = G.seatNode[0], b = G.seatNode[2]; // north seats 0 and 2 of table 0, same line
  expect(R.dist(a, b)).toBe(1200);
  expect(R.options(a, b)).toEqual([expect.objectContaining({ next: b })]);
});

test('every node is reachable from the entrance, and following options walks exactly dist', () => {
  for (const n of G.nodes) expect(R.dist(G.entranceNode, n.id)).toBeLessThan(INF);
  for (let s = 0; s < 600; s += 13) {
    const t = G.seatNode[s];
    expect(walk(R, G.entranceNode, t)).toBe(R.dist(G.entranceNode, t));
  }
  for (let st = 0; st < 30; st++) {
    const t = G.stallNode[st];
    expect(walk(R, G.seatNode[0], t)).toBe(R.dist(G.seatNode[0], t));
  }
});

test('distances are symmetric on the default and the maximum layout', () => {
  const max = buildRouter(buildNavGraph(buildLayout({ cols: 20, rows: 20, seatsPerSide: 4, verticalAisleMm: 3000, horizontalAisleMm: 3000, stallCount: 60, queueDepthMm: 10000 })));
  expect(max.graph.nodes.length).toBeLessThan(65536);
  for (const r of [R, max]) {
    fc.assert(fc.property(fc.nat(r.graph.nodes.length - 1), fc.nat(r.graph.nodes.length - 1), (a, b) => r.dist(a, b) === r.dist(b, a)), { numRuns: 300 });
  }
});

test('degenerate layouts build and connect: 1 row, 1 stall', () => {
  for (const p of [{ ...DEFAULT, rows: 1 }, { ...DEFAULT, stallCount: 1 }]) {
    const g = buildNavGraph(buildLayout(p));
    const r = buildRouter(g);
    expect([...g.seatNode].every((n) => n >= 0)).toBe(true);
    expect([...g.stallNode].every((n) => n >= 0)).toBe(true);
    for (const n of g.nodes) expect(r.dist(g.entranceNode, n.id)).toBeLessThan(INF);
  }
});

test('options come back sorted by next node id, then link id', () => {
  for (let at = 0; at < G.nodes.length; at += 5) {
    for (const t of [G.stallNode[0], G.stallNode[29], G.seatNode[300], G.exitNode]) {
      const o = R.options(at, t);
      for (let i = 1; i < o.length; i++) expect(o[i - 1].next < o[i].next || (o[i - 1].next === o[i].next && o[i - 1].link < o[i].link)).toBe(true);
    }
  }
});
