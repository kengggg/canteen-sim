import { defaultConfig } from '../../src/config/schema';
import { Sim } from '../../src/sim/engine';
import { checkInvariants } from '../../src/sim/invariants';

const small = () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  return c;
};

test('invariants hold after every event of a small run', () => {
  const s = new Sim(small(), { reserveFraction: 0.5, invariantEvery: 1 });
  expect(() => s.advanceTo(Infinity)).not.toThrow();
  expect(s.done && !s.truncated).toBe(true);
});

test('the engine runs the checks (compile-time flag on under Vitest) and they catch corruption', () => {
  const s = new Sim(small(), { reserveFraction: 0.5, invariantEvery: 1 });
  s.advanceTo(80 * 60_000);
  s.world.clock.totals[0]++;
  expect(() => checkInvariants(s.world)).toThrow(/state total/);
  expect(() => s.advanceTo(Infinity)).toThrow(/invariant/);
});
