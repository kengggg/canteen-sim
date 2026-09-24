import { buildLayout, type LayoutParams } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const G = buildNavGraph(buildLayout(DEFAULT));

test('every seat, stall and door has a node', () => {
  expect([...G.seatNode].every((n) => n >= 0)).toBe(true);
  expect([...G.stallNode].every((n) => n >= 0)).toBe(true);
  expect(new Set([G.entranceNode, G.exitNode, G.trayNode]).size).toBe(3);
});

test('south seats of row r and north seats of row r+1 share access nodes', () => {
  const L = buildLayout(DEFAULT);
  const south = L.seats.find((s) => s.table === 0 && s.side === 1 && s.i === 0)!;
  const north = L.seats.find((s) => s.table === 10 && s.side === 0 && s.i === 0)!;
  expect(G.seatNode[south.id]).toBe(G.seatNode[north.id]);
});

test('inner-aisle seat-to-seat edges are exactly 600 mm with capacity 1 (spec §13.1)', () => {
  const seatish = (id: number) => G.nodes[id].roles.some((r) => r.kind === 'seat');
  const inner = G.edges.filter((e) => seatish(e.a) && seatish(e.b) && G.nodes[e.a].hLine >= 1 && G.nodes[e.a].hLine <= 9);
  expect(inner.length).toBeGreaterThan(0);
  expect(new Set(inner.map((e) => e.lengthMm))).toEqual(new Set([600]));
  expect(inner.every((e) => e.capacity === 1 && e.lanes === 1)).toBe(true);
});

test('no edge ≤ 50 mm and every capacity ≥ 1', () => {
  expect(Math.min(...G.edges.map((e) => e.lengthMm))).toBeGreaterThan(50);
  expect(G.edges.every((e) => e.capacity >= 1)).toBe(true);
});

test('stall 29 walkway stop joins the concourse by a 256 mm edge', () => {
  const n = G.stallNode[29];
  const lengths = G.nodeEdges[n].map((e) => G.edges[e].lengthMm).sort((a, b) => a - b);
  expect(lengths).toEqual([256, 2312]);
});

test('lane counts by line type', () => {
  const lanesAt = (y: number) => new Set(G.edges.filter((e) => G.nodes[e.a].y === y && G.nodes[e.b].y === y).map((e) => e.lanes));
  expect(lanesAt(7300)).toEqual(new Set([2])); // top walkway
  expect(lanesAt(10175)).toEqual(new Set([1])); // horizontal aisle
  expect(lanesAt(34250)).toEqual(new Set([5])); // concourse
});

test('routing nodes are 0..n-1 and include the two top-walkway terminals', () => {
  expect(G.routingIds.every((id, i) => id === i)).toBe(true);
  const terminals = G.nodes.filter((n) => n.routing && !n.intersection).map((n) => [n.x, n.y]);
  expect(terminals).toEqual([[1689, 7300], [38711, 7300]]);
  expect(G.nodes.length).toBeLessThan(65536);
});

test('links run routing node to routing node', () => {
  for (const l of G.links) {
    expect(G.nodes[l.a].routing && G.nodes[l.b].routing).toBe(true);
    expect(l.lengthMm).toBe(l.edges.reduce((s, e) => s + G.edges[e].lengthMm, 0));
  }
});
