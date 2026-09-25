import { getPrecomp } from '../../src/sim/precompute';
import type { LayoutParams } from '../../src/sim/layout';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };

test('visible tables match a brute-force radius filter (10 m and 5 m)', () => {
  for (const vis of [10_000, 5_000]) {
    const P = getPrecomp(DEFAULT, vis);
    for (const n of P.G.nodes) {
      const brute = P.L.tables.filter((t) => (t.cx - n.x) * (t.cx - n.x) + (t.cy - n.y) * (t.cy - n.y) <= vis * vis).map((t) => t.id);
      expect([...P.visibleTables[n.id]]).toEqual(brute);
    }
  }
});

test('node-to-table distance and access node match brute force', () => {
  const P = getPrecomp(DEFAULT, 10_000);
  const T = P.tableCount;
  for (let n = 0; n < P.nodeCount; n += 7) {
    for (let t = 0; t < T; t++) {
      let best = Infinity, arg = -1;
      for (const a of P.tableAccessNodes[t]) {
        const d = P.R.dist(n, a);
        if (d < best || (d === best && a < arg)) { best = d; arg = a; }
      }
      expect(P.nodeTableDist[n * T + t]).toBe(best);
      expect(P.nodeTableAccess[n * T + t]).toBe(arg);
    }
  }
});

test('edge lookup and link node sequences', () => {
  const P = getPrecomp(DEFAULT, 10_000);
  for (const e of P.G.edges) {
    expect(P.edgeBetween(e.a, e.b)).toBe(e.id);
    expect(P.edgeBetween(e.b, e.a)).toBe(e.id);
  }
  expect(P.edgeBetween(0, P.nodeCount - 1)).toBe(-1);
  for (const l of P.G.links) {
    const seq = P.linkNodes[l.id];
    expect(seq[0]).toBe(l.a);
    expect(seq[seq.length - 1]).toBe(l.b);
    expect(seq.length).toBe(l.edges.length + 1);
    for (let i = 1; i < seq.length - 1; i++) {
      expect(P.nodeLink[seq[i]]).toBe(l.id);
      expect(P.nodeLinkIdx[seq[i]]).toBe(i);
    }
  }
  for (const id of P.G.routingIds) expect(P.nodeLink[id]).toBe(-1);
});

test('1-lane stop flags: seat nodes on aisles yes; top walkway and concourse no', () => {
  const P = getPrecomp(DEFAULT, 10_000);
  for (const n of P.G.nodes) {
    const seat = n.roles.some((r) => r.kind === 'seat');
    if (!seat) { expect(P.oneLaneStop[n.id]).toBe(0); continue; }
    expect(P.oneLaneStop[n.id]).toBe(n.hLine >= 1 && n.hLine <= 9 ? 1 : 0);
  }
});

test('intersections are listed in id order; memoised by params', () => {
  const P = getPrecomp(DEFAULT, 10_000);
  const ids = P.G.nodes.filter((n) => n.intersection).map((n) => n.id);
  expect([...P.intersections]).toEqual(ids);
  expect(getPrecomp({ ...DEFAULT }, 10_000)).toBe(P);
  expect(getPrecomp(DEFAULT, 5_000)).not.toBe(P);
});
