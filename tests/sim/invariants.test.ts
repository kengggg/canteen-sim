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

test('model 2 invariants catch corruption: fit counts, seats held for leavers, orphaned claims, shared queue positions', async () => {
  const { LEFT } = await import('../../src/sim/types');
  const fresh = () => {
    const s = new Sim(small(), { reserveFraction: 1, invariantEvery: 1_000_000_000 });
    s.advanceTo(75 * 60_000);
    expect(() => checkInvariants(s.world)).not.toThrow();
    return s.world;
  };
  let w = fresh();
  w.fitCount[w.k2]++;
  expect(() => checkInvariants(w)).toThrow(/fit count/);

  w = fresh();
  const held = w.seat.findIndex((s, p) => s >= 0 && w.sitStartMs[p] < 0);
  expect(held).toBeGreaterThanOrEqual(0);
  w.leftKind[held] = LEFT.QUEUE;
  expect(() => checkInvariants(w)).toThrow(/held for .* who left|left/);

  w = fresh();
  const t = w.claimedBy.findIndex((g) => g >= 0);
  expect(t).toBeGreaterThanOrEqual(0);
  const G = w.groups[w.claimedBy[t]];
  G.people = [];
  G.size = 0;
  expect(() => checkInvariants(w)).toThrow(/claimed/);

  w = fresh();
  const s = w.st.members.findIndex((m) => m.filter((q) => w.st.state[q] === 0).length >= 2);
  expect(s).toBeGreaterThanOrEqual(0);
  const idle = w.st.members[s].filter((q) => w.st.state[q] === 0);
  w.st.physPos[idle[1]] = w.st.physPos[idle[0]];
  expect(() => checkInvariants(w)).toThrow(/queue position/);
});
