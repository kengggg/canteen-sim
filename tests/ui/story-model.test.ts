import { defaultConfig } from '../../src/config/schema';
import { comparisonEstimate, storyConfig } from '../../src/ui/story-model';

test('the live 50% comparison uses its own paired evidence, including when its seed changes', () => {
  const cfg = defaultConfig();
  cfg.seed = 419;
  const estimate = comparisonEstimate(cfg)!;
  expect(estimate.n).toBe(30);
  expect(estimate.left.a).toBeCloseTo(20.245, 2);
  expect(estimate.left.b).toBeCloseTo(16.599, 2);
  expect(estimate.left.adv).toBeCloseTo(3.646, 2);
});

test('a different canteen or an uncomputed level never inherits a published default estimate', () => {
  const cfg = defaultConfig();
  cfg.reserve.percentA = 0.35;
  expect(comparisonEstimate(cfg)).toBeNull();
  cfg.reserve.percentA = 0.5;
  cfg.crowd.totalPeople = 900;
  expect(comparisonEstimate(cfg)).toBeNull();
});

test('the door experiment preserves the paired seed and uses the published inconclusive result', () => {
  const original = storyConfig('default', 123);
  const queues = storyConfig('queuesOnly', 123);
  expect({ ...queues, leave: original.leave }).toEqual(original);
  expect(original.seed).toBe(123);
  expect(original.reserve.percentA).toBe(1);
  const a = comparisonEstimate(original)!, b = comparisonEstimate(queues)!;
  expect(a.left.adv).toBeCloseTo(4.779, 2);
  expect(a.left.lo).toBeGreaterThan(0);
  expect(b.left.adv).toBeCloseTo(-0.096, 2);
  expect(b.left.lo).toBeLessThan(0);
  expect(b.left.hi).toBeGreaterThan(0);
  expect(b.plateSeconds).toBeCloseTo(10.237, 2);
  expect(b.seatUseLost).toBeCloseTo(0.781, 2);
});

test('new sensitivity evidence extends exact tested settings without interpolating other levels or combinations', () => {
  const cfg = storyConfig('queuesOnly', 1);
  cfg.reserve.percentA = 0.5;
  expect(comparisonEstimate(cfg)!.left.adv).toBeCloseTo(-0.102, 2);
  cfg.reserve.percentA = 1;
  cfg.stalls.serviceMean = 60;
  expect(comparisonEstimate(cfg)!.left.adv).toBeCloseTo(-0.08, 2);
  cfg.reserve.percentA = 0.75;
  expect(comparisonEstimate(cfg)).toBeNull();
  cfg.reserve.percentA = 1;
  cfg.search.visibility = 20;
  expect(comparisonEstimate(cfg)).toBeNull();
});
