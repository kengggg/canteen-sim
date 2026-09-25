import { readFileSync } from 'node:fs';
import type { Findings } from '../../src/batch/findings-data';
import { decodeEvidence, type Evidence } from '../../src/batch/precompute';
import { defaultConfig } from '../../src/config/schema';
import { findingsModel } from '../../src/ui/findings-model';

const load = <T>(name: string) => JSON.parse(readFileSync(new URL(`../../src/generated/${name}`, import.meta.url), 'utf8')) as T;
const m = findingsModel(decodeEvidence(load<Evidence>('evidence.json')), load<Findings>('findings.json'), defaultConfig());
const near = (x: number | null | undefined, y: number, tol: number) => expect(Math.abs((x ?? NaN) - y)).toBeLessThanOrEqual(tol);

test('headline rows: levels, gaps (reservation minus free flow) and win counts from the evidence', () => {
  const [b, q, , , all] = m.head;
  near(b.walkPct, 2.693, 0.001);
  near(all.walkPct, 7.744, 0.001);
  near(all.walk!.mean, 5.051, 0.001);
  near(all.walk!.lo, 4.557, 0.001);
  near(all.walk!.hi, 5.546, 0.001);
  expect(all.walk!.W).toBe(30);
  near(b.walkPeople, 48.5, 0.05);
  near(all.walkPeople, 139.47, 0.01);
  near(b.e2sMin, 10.959, 0.001);
  near(all.e2sS!.mean, 16.22, 0.02);
  near(b.utilPct, 70.71, 0.01);
  near(all.util!.mean, -6.011, 0.001);
  near(all.util!.lo, -6.58, 0.01);
  near(all.util!.hi, -5.44, 0.01);
  near(all.thrGap!.mean, -84.33, 0.01);
  near(q.walk!.mean, 3.230, 0.001);
  expect(q.e2sS!.W).toBe(22);
  expect(b.walk).toBeNull();
});

test('dose response: two-thirds at 25%, a flat top from 75% to 100%', () => {
  near(m.shareAt25.walk, 0.639, 0.001);
  near(m.shareAt25.util, 0.669, 0.001);
  near(m.shareAt25.thr, 0.688, 0.001);
  near(m.shareAt25.e2s, 0.148, 0.002);
  near(m.topStep.walk.mean, 0.093, 0.001);
  near(m.topStep.walk.lo, -0.425, 0.001);
  near(m.topStep.e2sS.mean, 6.0, 0.05);
  expect(m.lunches100BelowAt75).toBe(12);
});

test('seats at the busiest hour: evidence states plus the finer split', () => {
  near(m.reservedEmpty['1'], 0.20454, 0.0001);
  near(m.reservedEmpty['0.25'], 0.15431, 0.0001);
  near(m.seats['1'].free, 0.08418, 0.00001);
  near(m.seats['0'].free, 0.20879, 0.00001);
  near(m.seats['1'].waiting + m.seats['1'].beyondSize, 0.10017, 0.00002);
  near(m.seats['1'].beyondSize, 0.06122, 0.0001);
  near(m.baselineHeld, 0.08474, 0.00001);
  near(m.blockedWhileNeeded.a100 * 100, 24.447, 0.01);
});

test('claims, cohorts and group sizes', () => {
  near(m.claimsPerLunch['1'], 238.13, 0.01);
  near(m.claimShare['0.25'], 0.576, 0.001);
  near(m.cohorts.Rfallback['0.25']!.level, 10.167, 0.001);
  near(m.cohorts.Rfallback['0.25']!.baseline, 4.581, 0.001);
  near(m.cohorts.N['0.75']!.level, 8.350, 0.001);
  expect(m.cohorts.N['1']).toBeUndefined();
  expect(m.cohorts.Rclaimed['1']!.level).toBe(0);
  near(m.claimedDelayS[0], 6.48, 0.01);
  near(m.claimedDelayS[1], 9.30, 0.01);
  near(m.meanSize.claimed, 2.59, 0.01);
  expect(m.claimAllBeforeMin50).toBe(50);
  near(m.claimShare1210to1250at50[0], 0.093, 0.001);
  near(m.bigGroupsWalkShare0, 0.922, 0.001);
  near(m.midGroupsWalkShare.a100, 0.273, 0.001);
  near(m.bigGroupsGroupShare, 0.10, 1e-9);
  expect(m.pairWalkAways).toEqual({ groups: 1, level: 0.5 });
  expect(m.anatomy.totalGroups).toBe(3332);
  near(m.anatomy.oneTable0, 0.898, 0.001);
});

test('limitations figures', () => {
  expect(m.allFourAt100).toBe(true);
  expect(m.chartIntervals).toBe(60);
  expect(m.comparisons).toBe(200);
  expect(m.lunch1.rank).toBe(4);
  near(m.lunch1.gap50, 2.61, 0.01);
  near(m.lunch1.meanGap50, 3.89, 0.01);
  near(m.servedAfterShare, 0.394, 0.002);
  expect(m.stallCapacityPerHour).toBe(1200);
});
