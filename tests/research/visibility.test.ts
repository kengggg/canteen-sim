import { Sim } from '../../src/sim/engine';
import { batchSeeds } from '../../src/batch/sweep';
import { runVisibility } from '../../src/research/visibility';
import { RESEARCH_VERSION, researchSeeds, visibilityConfig, VISIBILITY_CASES } from '../../src/research/visibility-plan';

test('the new seed block is disjoint and the complete factorial has eight unique cells', () => {
  expect(new Set(VISIBILITY_CASES.map((c) => c.id)).size).toBe(8);
  expect(researchSeeds()).toHaveLength(30);
  const original = new Set(batchSeeds(1, 30));
  expect(researchSeeds().every((seed) => !original.has(seed))).toBe(true);
});

test('equal role ranges reproduce Model 2 exactly, including entrance-only claim search', () => {
  for (const c of VISIBILITY_CASES.filter((c) => c.claimer === c.foodSearcher)) for (const limit of [0, 60]) {
    const cfg = visibilityConfig(c);
    cfg.reserve.claimSearchLimit = limit;
    const original = new Sim(cfg, { reserveFraction: 1 });
    const variant = new Sim(cfg, { reserveFraction: 1, researchVisibility: { version: RESEARCH_VERSION, claimer: c.claimer, foodSearcher: c.foodSearcher } });
    original.advanceTo(Infinity);
    variant.advanceTo(Infinity);
    expect(variant.metrics()).toEqual(original.metrics());
    expect(variant.runHash()).toBe(original.runHash());
    expect(variant.truncated).toBe(false);
  }
});

test('claimer visibility cannot affect free flow or mutate the shared Model 2 precompute', () => {
  for (const door of [0, 3]) for (const food of [10, 20]) {
    const cells = VISIBILITY_CASES.filter((c) => c.door === door && c.foodSearcher === food);
    const low = runVisibility(cells[0], 0, 0, researchSeeds(1)[0]);
    const high = runVisibility(cells[1], 0, 0, researchSeeds(1)[0]);
    expect(high.run.hash).toBe(low.run.hash);
    expect(high.run.metrics).toEqual(low.run.metrics);
    expect(high.run.diagnostics.claimSuccessPct).toBeNull();
    const baseline = new Sim(visibilityConfig(cells[0]), { seed: researchSeeds(1)[0], reserveFraction: 0 });
    baseline.advanceTo(Infinity);
    expect(baseline.runHash()).toBe(low.run.hash);
  }
});

test('role visibility changes reservation behaviour while conserving admitted group outcomes', () => {
  const a = runVisibility(VISIBILITY_CASES[0], 1, 0, researchSeeds(1)[0]);
  const c = VISIBILITY_CASES.find((c) => c.door === 3 && c.claimer === 20 && c.foodSearcher === 10)!;
  const b = runVisibility(c, 1, 0, researchSeeds(1)[0]);
  expect(a.run.hash).not.toBe(b.run.hash);
  for (const r of [a, b]) {
    const d = r.run.diagnostics;
    expect(d.claimedGroups + d.fallbackGroups).toBe(d.admittedReservingGroups);
    expect(r.run.metrics.seated + r.run.metrics.leftPeople).toBe(r.run.metrics.arrivals);
  }
});
