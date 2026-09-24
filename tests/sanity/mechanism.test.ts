import { defaultConfig } from '../../src/config/schema';
import { presetConfig } from '../../src/config/presets';
import { quantile } from '../../src/sim/metrics';
import { run, SEEDS, pairedCI } from './helpers';

function claimedDiffs(): { mean: number[]; median: number[] } {
  const dMean: number[] = [];
  const dMedian: number[] = [];
  for (const seed of SEEDS) {
    const c = presetConfig('reservationFriendly');
    const A = run(c, seed, 1).pairInput(), B = run(c, seed, 0).pairInput();
    const a: number[] = [], b: number[] = [];
    for (let p = 0; p < A.personGroup.length; p++) {
      if (!A.groupClaimed[A.personGroup[p]]) continue;
      if (A.f2sMs[p] >= 0) a.push(A.f2sMs[p]);
      if (B.f2sMs[p] >= 0) b.push(B.f2sMs[p]);
    }
    const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    dMean.push(mean(a) - mean(b));
    a.sort((x, y) => x - y);
    b.sort((x, y) => x - y);
    dMedian.push(quantile(a, 50)! - quantile(b, 50)!);
  }
  return { mean: dMean, median: dMedian };
}
let diffs: { mean: number[]; median: number[] } | null = null;
const getDiffs = () => (diffs ??= claimedDiffs());

/**
 * Spec §13.4 mechanism test, as specified (median). It does NOT hold in this model — see the spec's implementation
 * finding — so it is kept as a documented expected failure until the owner decides. If the model ever changes so that
 * it passes, this test turns red and the finding must be revisited.
 */
test.fails('mechanism (Reservation-friendly, as specified): claimed groups’ median food-to-seat is lower in A than for the same people in B', () => {
  const ci = pairedCI(getDiffs().median);
  console.log(`mechanism median A−B ${(ci.mean / 1000).toFixed(1)} s (95% CI ${(ci.lo / 1000).toFixed(1)} to ${(ci.hi / 1000).toFixed(1)})`);
  expect(ci.hi).toBeLessThan(0);
});

/** Supplementary mechanism check on the mean: the search a claim avoids. */
test('mechanism (Reservation-friendly, supplementary): claimed groups’ mean food-to-seat is lower in A than for the same people in B', () => {
  const ci = pairedCI(getDiffs().mean);
  console.log(`mechanism mean A−B ${(ci.mean / 1000).toFixed(1)} s (95% CI ${(ci.lo / 1000).toFixed(1)} to ${(ci.hi / 1000).toFixed(1)})`);
  expect(ci.hi).toBeLessThan(0);
});

test('common random numbers: A and B mean queue waits correlate ≥ 0.5 over seeds 1–30 at p = 0.25', () => {
  const a: number[] = [], b: number[] = [];
  for (const seed of SEEDS) {
    a.push(run(defaultConfig(), seed, 0.25).metrics().queueWaitMeanMin!);
    b.push(run(defaultConfig(), seed, 0).metrics().queueWaitMeanMin!);
  }
  const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  expect(sab / Math.sqrt(saa * sbb)).toBeGreaterThanOrEqual(0.5);
});
