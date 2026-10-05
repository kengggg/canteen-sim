import { scenarioConfig, STUDY_FRACTIONS, STUDY_PLAN } from '../../src/batch/sensitivity-plan';
import { SENSITIVITY, studyIsCurrent, studyRowForConfig } from '../../src/ui/sensitivity-model';
import { comparisonEstimate } from '../../src/ui/story-model';

test('all planned settings find their own complete evidence and preserve delta signs in the live summary', () => {
  for (const scenario of STUDY_PLAN.scenarios) for (const fraction of STUDY_FRACTIONS) {
    const cfg = scenarioConfig(scenario);
    cfg.reserve.percentA = fraction;
    cfg.seed = 99;
    const row = studyRowForConfig(cfg)!;
    expect(row.id).toBe(scenario.id);
    expect(row.fraction).toBe(fraction);
    const estimate = comparisonEstimate(cfg)!;
    expect(estimate.left.adv).toBeCloseTo(row.metrics.leftPct.delta!, 5);
    expect(estimate.plateSeconds).toBeCloseTo(row.metrics.plateSeconds.delta!, 5);
    expect(estimate.seatUseLost).toBeCloseTo(-row.metrics.seatUsePct.delta!, 5);
  }
});

test('stale model, baseline, plan and incomplete study are rejected', () => {
  expect(studyIsCurrent(SENSITIVITY)).toBe(true);
  expect(studyIsCurrent({ ...SENSITIVITY, model: -1 })).toBe(false);
  expect(studyIsCurrent({ ...SENSITIVITY, evidenceDigest: 0 })).toBe(false);
  expect(studyIsCurrent({ ...SENSITIVITY, planKey: 'different' })).toBe(false);
  expect(studyIsCurrent({ ...SENSITIVITY, rows: SENSITIVITY.rows.slice(1) })).toBe(false);
});
