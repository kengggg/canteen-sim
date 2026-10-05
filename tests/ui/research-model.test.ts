import { RESEARCH, researchIsCurrent } from '../../src/ui/research-model';

test('research results are labelled with their own version and reject changed plans or incomplete outcomes', () => {
  expect(researchIsCurrent(RESEARCH)).toBe(true);
  expect(researchIsCurrent({ ...RESEARCH, model: 3 })).toBe(false);
  expect(researchIsCurrent({ ...RESEARCH, planKey: 'different' })).toBe(false);
  expect(researchIsCurrent({ ...RESEARCH, rows: RESEARCH.rows.slice(1) })).toBe(false);
  const bad = structuredClone(RESEARCH);
  bad.rows[0].metrics.leftPct.missing = 1;
  expect(researchIsCurrent(bad)).toBe(false);
});
