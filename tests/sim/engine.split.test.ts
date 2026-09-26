import { defaultConfig, type Config } from '../../src/config/schema';
import { GM, PH } from '../../src/sim/types';
import { traced, type Trace } from './helpers/run';

/** Model 2: no takeaway, and parties split after circling (design §2.5, §2.6). */

const cfgWith = (f: (c: Config) => void) => { const c = defaultConfig(); f(c); return c; };

type SplitCheck = { ok: boolean; why: string };
const checks: SplitCheck[] = [];
const splitMs: number[] = [];

const R = traced(defaultConfig(), { seed: 1, reserveFraction: 0.5 }, (s, t) => {
  const w = s.world;
  if (t.ev === 'splitmode') {
    const G = w.parties[t.b];
    splitMs.push(t.ms);
    checks.push({ ok: t.ms === G.searchStartMs + 120_000, why: `splitmode at ${t.ms}, search start ${G.searchStartMs}` });
    checks.push({ ok: G.committedTable < 0 && G.mode === GM.FREE, why: 'split mode for a committed or non-free party' });
    checks.push({ ok: !G.origin.claimed, why: 'a claimed group entered split mode' });
  }
});
const w = R.w;

test('nobody leaves holding food: every served person sits, and nobody drops a tray without eating', () => {
  let served = 0;
  for (let p = 0; p < w.pop.personCount; p++) {
    const se = w.st.serviceEndMs[p];
    if (se >= 0) {
      served++;
      expect(w.sitStartMs[p]).toBeGreaterThanOrEqual(se);
    }
    if (w.dropEndMs[p] >= 0) expect(w.sitStartMs[p]).toBeGreaterThanOrEqual(0);
  }
  expect(served).toBeGreaterThan(1000);
  expect(R.traces.some((t) => t.ev === 'walkaway')).toBe(false);
  expect(R.sim.done && !R.sim.truncated).toBe(true);
  expect(w.exited).toBe(w.pop.personCount);
});

test('the split timer fires at the search start + 2 min, only for uncommitted free-flow parties', () => {
  expect(splitMs.length).toBeGreaterThan(0);
  for (const c of checks) expect(c.ok, c.why).toBe(true);
});

test('a partial commit seats the searcher, then food holders by service end, then others; the rest form a party in split mode', () => {
  const S = traced(defaultConfig(), { seed: 1, reserveFraction: 0.5 }, (s, t: Trace) => {
    const x = s.world;
    if (t.ev !== 'remainder') return;
    const G = x.parties[t.a], Rm = x.parties[t.b];
    expect(Rm.size).toBe(t.c);
    expect(Rm.splitMode).toBe(true);
    expect(Rm.origin).toBe(G.origin);
    expect(G.size).toBeGreaterThanOrEqual(Math.min(2, G.size + Rm.size));
    for (const p of Rm.people) expect(x.partyOf[p]).toBe(Rm.party);
    for (const p of G.people) expect(x.partyOf[p]).toBe(G.party);
    const fedG = G.people.filter((p) => x.hasFood[p] && p !== x.parties[t.a].searcher);
    const fedR = Rm.people.filter((p) => x.hasFood[p]);
    const hungryG = G.people.filter((p) => !x.hasFood[p]);
    if (fedR.length > 0) {
      expect(hungryG.length).toBe(0);
      const lastG = Math.max(...fedG.map((p) => x.st.serviceEndMs[p]));
      for (const p of fedR) expect(x.st.serviceEndMs[p]).toBeGreaterThanOrEqual(lastG);
    }
    const hungryR = Rm.people.filter((p) => !x.hasFood[p]);
    if (hungryG.length > 0 && hungryR.length > 0) expect(Math.min(...hungryR)).toBeGreaterThan(Math.max(...hungryG));
    for (const p of G.people) expect(x.seat[p]).toBeGreaterThanOrEqual(0);
  });
  const splits = S.traces.filter((t) => t.ev === 'remainder');
  expect(splits.length).toBeGreaterThan(0);
  const m = S.sim.metrics();
  const splitGroups = new Set(splits.map((t) => S.w.parties[t.a].g)).size;
  let fedGroups = 0;
  for (const G of S.w.groups) if (G.people.concat().length >= 0 && S.w.pop.size[G.g] > 0) {
    let any = false;
    for (let p = S.w.pop.firstPerson[G.g]; p < S.w.pop.firstPerson[G.g] + S.w.pop.size[G.g]; p++) if (S.w.st.serviceEndMs[p] >= 0) any = true;
    if (any) fedGroups++;
  }
  expect(m.groupsSplit).toBe(splitGroups);
  expect(m.groupsSplitPct).toBeCloseTo((100 * splitGroups) / fedGroups, 10);
});

test('with splitAfter = 0 a party is willing to split from the start of its search', () => {
  const Z = traced(cfgWith((c) => { c.search.splitAfter = 0; }), { seed: 2, reserveFraction: 0.5 }, (s, t) => {
    if (t.ev === 'splitmode') expect(t.ms).toBe(s.world.parties[t.b].searchStartMs);
  });
  expect(Z.traces.filter((t) => t.ev === 'splitmode').length).toBeGreaterThan(0);
  expect(Z.w.exited).toBe(Z.w.pop.personCount);
});

test('parallel split: the remainder keeps its searchers, memory and pending asks', () => {
  const X = traced(cfgWith((c) => { c.search.parallel = true; c.search.splitAfter = 0; }), { seed: 3, reserveFraction: 0.5 }, (s, t) => {
    if (t.ev !== 'remainder') return;
    const x = s.world;
    for (const G of [x.parties[t.a], x.parties[t.b]]) {
      const asking = G.people.filter((p) => x.phase[p] === PH.ASKING).length;
      expect(G.pendingAsks).toBe(asking);
      for (const q of G.searchers) expect(x.partyOf[q]).toBe(G.party);
    }
  });
  expect(X.traces.filter((t) => t.ev === 'remainder').length).toBeGreaterThan(0);
  expect(X.sim.done && !X.sim.truncated).toBe(true);
  expect(X.w.exited).toBe(X.w.pop.personCount);
});

test('search.parallel and emptyTableDetour runs terminate and change the outcome', () => {
  const base = R.sim.runHash();
  for (const mod of [(c: Config) => { c.search.parallel = true; }, (c: Config) => { c.search.emptyTableDetour = 10; }]) {
    const X = traced(cfgWith(mod), { seed: 1, reserveFraction: 0.5 });
    expect(X.sim.done && !X.sim.truncated).toBe(true);
    expect(X.w.exited).toBe(X.w.pop.personCount);
    expect(X.sim.runHash()).not.toBe(base);
  }
});

test('plate metrics: P2 is the mean time from food to seat over everyone served; the plates-without-seat peak bounds live counts', () => {
  const m = R.sim.metrics();
  const xs: number[] = [];
  for (let p = 0; p < w.pop.personCount; p++) if (w.st.serviceEndMs[p] >= 0) xs.push(w.sitStartMs[p] - w.st.serviceEndMs[p]);
  expect(m.plateMeanMin).toBeCloseTo(xs.reduce((a, b) => a + b, 0) / xs.length / 60_000, 12);
  expect(m.arrivals).toBe(m.seated + m.leftPeople);
  expect(m.peakPlatesWithoutSeat).toBeGreaterThan(0);
  let maxLive = 0;
  traced(defaultConfig(), { seed: 1, reserveFraction: 0.5 }, (s) => { maxLive = Math.max(maxLive, s.live().platesWithoutSeat); });
  expect(maxLive).toBeGreaterThan(0);
  expect(maxLive).toBeLessThanOrEqual(m.peakPlatesWithoutSeat);
});
