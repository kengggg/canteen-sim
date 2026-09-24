import { defaultConfig } from '../../src/config/schema';
import { Sim } from '../../src/sim/engine';

type Tr = { ev: string; ms: number; a: number; b: number; c: number; snap?: unknown };

function runB(seed = 1, onTrace?: (s: Sim, t: Tr) => void) {
  const traces: Tr[] = [];
  let sim: Sim;
  sim = new Sim(defaultConfig(), {
    seed,
    reserveFraction: 0,
    trace: (ev, a, b, c) => {
      const t = { ev, ms: sim.world.now, a, b, c };
      traces.push(t);
      onTrace?.(sim, t);
    },
  } as never);
  sim.advanceTo(Infinity);
  return { sim, w: sim.world, traces };
}

const B = runB(1, (s, t) => {
  if (t.ev !== 'commit') return;
  // At commit, every member's seat is held on that table.
  const w = s.world;
  const G = w.groups[t.a];
  for (let m = G.first; m < G.first + G.size; m++) {
    const seat = w.seat[m];
    const tb = w.tableOfSeat(seat);
    t.snap = t.snap ?? [];
    (t.snap as boolean[]).push(tb === t.b && ((w.heldMask[tb] >>> (seat - tb * w.k2)) & 1) === 1);
  }
});

test('B at defaults runs to done: not truncated, everyone out', () => {
  expect(B.sim.done).toBe(true);
  expect(B.sim.truncated).toBe(false);
  expect(B.w.exited).toBe(B.w.pop.personCount);
  const r = B.sim.metrics();
  expect(r.arrivals).toBe(r.seated + r.walkAways);
});

test('everybody passes the tray return before exiting', () => {
  const w = B.w;
  for (let p = 0; p < w.pop.personCount; p++) {
    expect(w.dropEndMs[p]).toBeGreaterThanOrEqual(0);
    expect(w.dropEndMs[p]).toBeLessThanOrEqual(w.exitMs[p]);
  }
});

test('a party of n sits at one table, and groups stand up together', () => {
  const w = B.w;
  for (const G of w.groups) {
    if (G.walkedAway) continue;
    const tables = new Set<number>();
    const stands = new Set<number>();
    for (let m = G.first; m < G.first + G.size; m++) {
      expect(w.sitStartMs[m]).toBeGreaterThanOrEqual(0);
      tables.add(w.tableOfSeat(w.seat[m]));
      stands.add(w.standMs[m]);
    }
    expect(tables.size).toBe(1);
    expect(stands.size).toBe(1);
  }
});

test('the first member with food becomes the searcher (ties to the lowest id)', () => {
  const w = B.w;
  const searchers = B.traces.filter((t) => t.ev === 'searcher');
  expect(searchers.length).toBeGreaterThan(0);
  for (const t of searchers) {
    const G = w.groups[t.a];
    let first = -1;
    for (let m = G.first; m < G.first + G.size; m++) {
      const se = w.st.serviceEndMs[m];
      if (first < 0 || se < w.st.serviceEndMs[first]) first = m;
    }
    expect(t.b).toBe(first);
  }
});

test('all n seats are held from commit', () => {
  const commits = B.traces.filter((t) => t.ev === 'commit');
  expect(commits.length).toBeGreaterThan(0);
  for (const t of commits) expect((t.snap as boolean[]).every(Boolean)).toBe(true);
});

test('searchers ask at occupied tables, and a refused table is not retried for 180 s', () => {
  const asks = B.traces.filter((t) => t.ev === 'ask');
  const refusals = B.traces.filter((t) => t.ev === 'refuse');
  expect(asks.length).toBeGreaterThan(0);
  expect(refusals.length).toBeGreaterThan(0);
  for (const r of refusals) {
    const again = B.traces.find((t) => (t.ev === 'ask' || t.ev === 'commit') && t.a === r.a && t.b === r.b && t.ms > r.ms && t.ms < r.ms + 180_000);
    expect(again).toBeUndefined();
  }
});
