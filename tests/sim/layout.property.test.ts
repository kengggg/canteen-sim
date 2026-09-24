import fc from 'fast-check';
import { defaultConfig } from '../../src/config/schema';
import { validate, toLayoutParams } from '../../src/config/validate';
import { buildLayout } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';
import { buildRouter, INF } from '../../src/sim/routing';

const layoutArb = fc.record({
  cols: fc.integer({ min: 1, max: 20 }),
  rows: fc.integer({ min: 1, max: 20 }),
  seatsPerSide: fc.integer({ min: 2, max: 4 }),
  verticalAisle: fc.integer({ min: 12, max: 60 }).map((x) => x * 0.05),
  horizontalAisle: fc.integer({ min: 12, max: 60 }).map((x) => x * 0.05),
  stallCount: fc.integer({ min: 1, max: 60 }),
  queueDepth: fc.integer({ min: 32, max: 100 }).map((x) => x / 10),
});

test('every valid layout yields a well-formed, connected graph (spec §13.2)', () => {
  fc.assert(
    fc.property(layoutArb, (layout) => {
      const c = defaultConfig();
      c.layout = layout;
      c.crowd.groupMix = [25, 30, 20, 15, 0, 0]; // fits every table size
      fc.pre(validate(c).blocking.length === 0);
      const L = buildLayout(toLayoutParams(c));
      const G = buildNavGraph(L);
      const R = buildRouter(G);
      expect(G.nodes.length).toBeLessThan(65536);
      expect(G.edges.every((e) => e.lengthMm > 50 && e.capacity >= 1 && Number.isInteger(e.lengthMm))).toBe(true);
      expect(G.nodes.every((n) => Number.isInteger(n.x) && Number.isInteger(n.y))).toBe(true);
      for (const h of L.hLines) {
        for (const n of G.nodes) if (n.hLine === h.index) expect(n.x >= h.x0 && n.x <= h.x1).toBe(true);
      }
      expect([...G.seatNode].every((x) => x >= 0)).toBe(true);
      expect([...G.stallNode].every((x) => x >= 0)).toBe(true);
      expect(new Set([G.entranceNode, G.exitNode, G.trayNode]).size).toBe(3);
      for (const n of G.nodes) expect(R.dist(G.entranceNode, n.id)).toBeLessThan(INF);
    }),
    { numRuns: 150 },
  );
});
