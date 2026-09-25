import { defaultConfig } from '../../src/config/schema';
import { traced } from './helpers/run';

const R = traced(defaultConfig(), { seed: 1, reserveFraction: 0.5 });
const w = R.w;

test('patience expiry makes the whole group walk away at the deadline (or at the last pending ask)', () => {
  const walked = w.groups.filter((G) => G.walkedAway);
  expect(walked.length).toBeGreaterThan(0);
  let exact = 0;
  for (const G of walked) {
    const deadline = Math.max(G.searcherFoodMs, G.fallback ? G.claimEndMs : -1) + w.patienceMs;
    expect(G.walkAwayMs).toBeGreaterThanOrEqual(deadline);
    expect(G.walkAwayMs - deadline).toBeLessThanOrEqual(5000);
    if (G.walkAwayMs === deadline) exact++;
  }
  expect(exact).toBeGreaterThan(0);
  expect(w.walkAwayPeople).toBe(walked.reduce((s, G) => s + G.size, 0));
});

test('walk-away members without food finish buying, then return trays and exit', () => {
  let late = 0;
  for (const G of w.groups) {
    if (!G.walkedAway) continue;
    for (let m = G.first; m < G.first + G.size; m++) {
      expect(w.sitStartMs[m]).toBe(-1);
      expect(w.st.serviceEndMs[m]).toBeGreaterThanOrEqual(0);
      expect(w.dropEndMs[m]).toBeGreaterThanOrEqual(w.st.serviceEndMs[m]);
      expect(w.exitMs[m]).toBeGreaterThanOrEqual(w.dropEndMs[m]);
      if (w.st.serviceEndMs[m] > G.walkAwayMs) late++;
    }
  }
  expect(late).toBeGreaterThan(0);
  expect(R.sim.metrics().walkAwayServedAfterDecision).toBe(late);
});

test('a pending ask decides before a walk-away; a committed party never walks away', () => {
  let savedByAsk = 0;
  for (const G of w.groups) {
    if (G.commitMs >= 0) expect(G.walkedAway).toBe(false);
    if (G.commitMs >= 0 && G.searcherFoodMs >= 0 && !G.claimed) {
      const deadline = Math.max(G.searcherFoodMs, G.fallback ? G.claimEndMs : -1) + w.patienceMs;
      if (G.commitMs > deadline) {
        savedByAsk++;
        expect(G.commitMs - deadline).toBeLessThanOrEqual(5000);
      }
    }
  }
  expect(savedByAsk).toBeGreaterThan(0);
});

test('search.parallel and emptyTableDetour runs terminate and change the outcome', () => {
  const base = R.sim.runHash();
  for (const mod of [(c: ReturnType<typeof defaultConfig>) => { c.search.parallel = true; }, (c: ReturnType<typeof defaultConfig>) => { c.search.emptyTableDetour = 10; }]) {
    const c = defaultConfig();
    mod(c);
    const X = traced(c, { seed: 1, reserveFraction: 0.5 });
    expect(X.sim.done && !X.sim.truncated).toBe(true);
    expect(X.w.exited).toBe(X.w.pop.personCount);
    expect(X.sim.runHash()).not.toBe(base);
  }
});
