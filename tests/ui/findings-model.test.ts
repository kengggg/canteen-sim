import { readFileSync } from 'node:fs';
import type { Findings } from '../../src/batch/findings-data';
import { decodeEvidence, type Evidence } from '../../src/batch/precompute';
import { defaultConfig } from '../../src/config/schema';
import { findingsModel } from '../../src/ui/findings-model';

const load = <T>(name: string) => JSON.parse(readFileSync(new URL(`../../src/generated/${name}`, import.meta.url), 'utf8')) as T;
const m = findingsModel(decodeEvidence(load<Evidence>('evidence.json')), load<Findings>('findings.json'), defaultConfig());
const near = (x: number | null | undefined, y: number, tol: number) => expect(Math.abs((x ?? NaN) - y)).toBeLessThanOrEqual(tol);

// Model 2 figures (design docs/superpowers/specs/2026-09-26-model-v2-plates-design.md), pinned from the shipped data.

test('headline rows: levels, gaps (reservation minus free flow) and win counts from the evidence', () => {
  const [b, q, , , all] = m.head;
  near(b.leftPct, 16.599, 0.001);
  near(all.leftPct, 21.378, 0.001);
  near(all.left!.mean, 4.779, 0.001);
  near(all.left!.lo, 4.409, 0.001);
  near(all.left!.hi, 5.149, 0.001);
  expect(all.left!.W).toBe(30);
  near(b.leftPeople, 298.93, 0.01);
  near(all.leftPeople, 385.0, 0.01);
  near(b.plateMin, 0.5003, 0.0001);
  near(all.plateS!.mean, 6.277, 0.001);
  near(b.utilPct, 60.91, 0.01);
  near(all.util!.mean, -4.698, 0.001);
  near(all.util!.lo, -5.072, 0.001);
  near(all.util!.hi, -4.324, 0.001);
  near(all.thrGap!.mean, -81.93, 0.01);
  near(q.left!.mean, 2.963, 0.001);
  expect(q.plateS!.W).toBe(28);
  expect(b.left).toBeNull();
});

test('dose response: about two-thirds at 25%, a flat top from 75% to 100%', () => {
  near(m.shareAt25.left, 0.620, 0.001);
  near(m.shareAt25.util, 0.658, 0.001);
  near(m.shareAt25.thr, 0.622, 0.001);
  near(m.shareAt25.plate, 0.215, 0.001);
  near(m.topStep.left.mean, 0.294, 0.001);
  near(m.topStep.left.lo, -0.074, 0.001);
  near(m.topStep.plateS.mean, 1.593, 0.005);
  expect(m.lunches100BelowAt75).toBe(13);
});

test('leaving: most extra leaving is at the door, where reserved tables make the hall look full', () => {
  near(m.leave['1'].door, 0.1289, 0.0001);
  near(m.leave['0'].door, 0.0161, 0.0001);
  near(m.leave['1'].queue, 0.0849, 0.0001);
  near(m.leave['0'].queue, 0.1499, 0.0001);
  near(m.doorSeatingShare['1'], 0.9991, 0.0001);
  near(m.seatedE2s.gapS['1'].mean, -23.27, 0.01);
  near(m.queueWait.a100, 2.477, 0.001);
  const q = m.robust.find((r) => r.id === 'queuesOnly')!;
  near(q.left.adv, -0.096, 0.001);
  expect(q.left.lo).toBeLessThan(0);
  expect(q.left.hi).toBeGreaterThan(0);
});

test('seats at the busiest hour: evidence states plus the finer split', () => {
  near(m.reservedEmpty['1'], 0.26856, 0.0001);
  near(m.reservedEmpty['0.25'], 0.1716, 0.0001);
  near(m.seats['1'].free, 0.13585, 0.00001);
  near(m.seats['0'].free, 0.34026, 0.00001);
  near(m.seats['1'].waiting + m.seats['1'].beyondSize, 0.08491, 0.00002);
  near(m.seats['1'].beyondSize, 0.05617, 0.0001);
  near(m.baselineHeld, 0.05486, 0.00001);
  near(m.blockedWhileNeeded.a100 * 100, 25.21, 0.01);
});

test('claims, cohorts and group sizes', () => {
  near(m.claimsPerLunch['1'], 284.9, 0.01);
  near(m.claimShare['0.25'], 0.6545, 0.001);
  near(m.cohorts.Rfallback['0.25']!.level, 20.247, 0.001);
  near(m.cohorts.Rfallback['0.25']!.baseline, 27.187, 0.001);
  near(m.cohorts.N['0.75']!.level, 21.231, 0.001);
  expect(m.cohorts.N['1']).toBeUndefined();
  near(m.cohorts.Rclaimed['1']!.level, 3.966, 0.001);
  near(m.claimedDelayS[0], -0.197, 0.01);
  near(m.claimedDelayS[1], 2.118, 0.01);
  near(m.meanSize.claimed, 2.554, 0.01);
  expect(m.claimAllBeforeMin50).toBe(50);
  near(m.claimShare1210to1250at50[0], 0.132, 0.001);
  near(m.bySize[5].pct['1'], 44.60, 0.01);
  near(m.bySize[0].pct['1'], 13.32, 0.01);
});

test('limitations figures', () => {
  expect(m.allFourAt100).toBe(true);
  expect(m.chartIntervals).toBe(72);
  expect(m.comparisons).toBe(219);
  expect(m.lunch1.rank).toBe(5);
  near(m.lunch1.gap50, 3.109, 0.01);
  near(m.lunch1.meanGap50, 3.646, 0.01);
  expect(m.stallCapacityPerHour).toBe(1200);
});
