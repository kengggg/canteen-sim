import fc from 'fast-check';
import { validate } from '../../../src/config/validate';
import { Sim } from '../../../src/sim/engine';
import { PH } from '../../../src/sim/types';
import { offeredLoad, seatLoad, smallConfigArb } from './arb';

/** fast-check over small random configs with invariant checks after every event (spec §13.3). */
export function invariantProperty(numRuns: number, seed?: number): void {
  fc.assert(
    fc.property(smallConfigArb, ({ cfg, fraction }) => {
      fc.pre(validate(cfg).blocking.length === 0);
      const s = new Sim(cfg, { reserveFraction: fraction, invariantEvery: 1 });
      s.advanceTo(Infinity);
      expect(s.done).toBe(true);
      if (offeredLoad(cfg) <= 0.8 && seatLoad(cfg) <= 0.8 && s.truncated) {
        // Ruling: lognormal eating tails can exceed the 4 h cap; a light-load truncation must leave only diners who are
        // still seated (no one stuck walking or queuing). Liveness of movement is checked after every event.
        // Model 2 (plan 5 ruling): nobody leaves holding food, so a seat-starved run can reach the cap with people still
        // circling; "light load" therefore also requires light seat load.
        const w = s.world;
        for (let p = 0; p < w.pop.personCount; p++) {
          const ph = w.phase[p];
          if (ph === PH.EXITED) continue;
          expect([PH.SITTING, PH.EATING, PH.STANDING]).toContain(ph);
        }
      }
      if (!s.truncated) expect(s.world.exited).toBe(s.world.pop.personCount);
    }),
    { numRuns, seed },
  );
}
