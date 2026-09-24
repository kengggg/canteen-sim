import { defaultConfig } from '../../src/config/schema';
import { presetConfig } from '../../src/config/presets';
import { quantile } from '../../src/sim/metrics';
import { run, SEEDS, pairedCI } from './helpers';

/**
 * Mechanism test (spec §13.4, R18), on the paired MEAN (ruling): the median does not drop, because claims succeed
 * mostly early, at empty tables near the entrance, farther from the stalls than the tables the same groups find in B
 * off-peak; the search the claim avoids shows in the peak and in the tail.
 */
test('mechanism (Reservation-friendly): claimed groups’ mean food-to-seat is lower in A than for the same people in B', () => {
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
  const ci = pairedCI(dMean);
  console.log(`mechanism: mean A−B ${(ci.mean / 1000).toFixed(1)} s (95% CI ${(ci.lo / 1000).toFixed(1)} to ${(ci.hi / 1000).toFixed(1)}); median A−B ${(pairedCI(dMedian).mean / 1000).toFixed(1)} s`);
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
