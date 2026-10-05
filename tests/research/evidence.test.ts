import { readFileSync } from 'node:fs';
import { researchSourceDigest } from '../../scripts/research-source';
import { summarizeResearch, type ResearchAudit, type ResearchStudy } from '../../src/research/visibility-data';
import { RESEARCH_VERSION, researchSeeds, visibilityConfig, visibilityPlanKey, VISIBILITY_CASES } from '../../src/research/visibility-plan';
import { MODEL_VERSION } from '../../src/sim/version';

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')) as T;
const audit = read<ResearchAudit>('docs/studies/visibility-roles-v1-audit.json');
const study = read<ResearchStudy>('src/generated/research.json');
const tidy = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(8)) : v));

test('the entire research grid has current provenance and reconstructs all summaries and contrasts', () => {
  expect(audit.version).toBe(RESEARCH_VERSION);
  expect(audit.model).toBe(MODEL_VERSION);
  expect(audit.sourceDigest, 'Run npm run research').toBe(researchSourceDigest());
  expect(audit.planKey).toBe(visibilityPlanKey());
  expect(audit.seeds).toEqual(researchSeeds());
  expect(audit.cases).toEqual(VISIBILITY_CASES.map((c) => ({ ...c, config: visibilityConfig(c) })));
  expect(audit.runs).toHaveLength(600);
  expect(audit.pairs).toHaveLength(480);
  expect(study.rows).toHaveLength(16);
  expect(study.contrasts).toHaveLength(28);
  expect(tidy(summarizeResearch(audit))).toEqual(study);
});

test('raw pair values agree with complete run outcomes and the baseline reuse contract', () => {
  const runs = new Map(audit.runs.map((r) => [r.id, r]));
  for (const p of audit.pairs) {
    for (const side of ['a', 'b'] as const) {
      const r = runs.get(side === 'a' ? p.runA : p.runB)!;
      expect(r.seed).toBe(p.seed);
      expect(r.seedIndex).toBe(p.seedIndex);
      expect(r.fraction).toBe(side === 'a' ? p.fraction : 0);
      expect(r.metrics.truncated).toBe(false);
      expect(r.metrics.leftPeople + r.metrics.seated).toBe(r.metrics.arrivals);
      expect(p[side].leftPct).toBe(r.metrics.leftPct);
      expect(p[side].doorLeftPct).toBe(r.metrics.leftDoorPct);
      expect(p[side].queueLeftPct).toBe(r.metrics.leftQueuePct);
      expect(p[side].plateSeconds).toBe(r.metrics.plateMeanMin! * 60);
      expect(p[side].throughput).toBe(r.metrics.peakThroughputPerHour);
      expect(p[side].leftPct).toBeCloseTo(p[side].doorLeftPct! + p[side].queueLeftPct!, 10);
      expect(r.diagnostics.claimedGroups + r.diagnostics.fallbackGroups).toBe(r.diagnostics.admittedReservingGroups);
    }
    const c = VISIBILITY_CASES.find((c) => c.id === p.id)!;
    expect(p.runB).toBe(`door${c.door}-food${c.foodSearcher}|0|${p.seedIndex}`);
  }
});

test('claimer contrasts use the same-seed difference of effects and retain its covariance', () => {
  const diffs = audit.seeds.map((_seed, i) => {
    const high = audit.pairs.find((p) => p.id === 'door3-claim20-food10' && p.fraction === 1 && p.seedIndex === i)!;
    const low = audit.pairs.find((p) => p.id === 'door3-claim10-food10' && p.fraction === 1 && p.seedIndex === i)!;
    // B is identical: the independent check reduces to the difference between the two reservation runs.
    return high.a.leftPct! - low.a.leftPct!;
  });
  const mean = diffs.reduce((s, v) => s + v, 0) / 30;
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / 29);
  const s = study.contrasts.find((c) => c.id === 'claimer-door3-food10' && c.fraction === 1)!.metrics.leftPct;
  expect(s.mean).toBeCloseTo(mean, 5);
  expect(s.sd).toBeCloseTo(sd, 6);
  expect(s.lo).toBeCloseTo(mean - 2.045 * sd / Math.sqrt(30), 5);
  expect(s.hi).toBeCloseTo(mean + 2.045 * sd / Math.sqrt(30), 5);
});

test('incomplete, truncated or differently versioned audits cannot produce a complete study', () => {
  expect(() => summarizeResearch({ ...audit, runs: audit.runs.slice(1) })).toThrow();
  expect(() => summarizeResearch({ ...audit, pairs: audit.pairs.slice(1) })).toThrow();
  expect(() => summarizeResearch({ ...audit, planKey: 'changed' })).toThrow();
  const bad = structuredClone(audit);
  bad.runs[0].metrics.truncated = true;
  expect(() => summarizeResearch(bad)).toThrow();
});
