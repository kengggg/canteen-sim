import { defaultConfig } from '../../src/config/schema';
import { presetConfig } from '../../src/config/presets';
import { Sim } from '../../src/sim/engine';
import { uniform } from '../../src/sim/rng';
import { EV, PH } from '../../src/sim/types';
import { traced } from './helpers/run';

test('liveness: after every admission step no FIFO head could have entered (together mode, 0.6 m aisles; Crush)', () => {
  const cases: [ReturnType<typeof defaultConfig>, number][] = [];
  const t = defaultConfig();
  t.reserve.claimMode = 'together';
  t.layout.verticalAisle = 0.6;
  cases.push([t, 1], [presetConfig('crush'), 1], [presetConfig('crush'), 0]);
  for (const [cfg, f] of cases) {
    const s = new Sim(cfg, { seed: 3, reserveFraction: f });
    const w = s.world;
    const orig = w.mv.admitStep.bind(w.mv);
    let worst = 0;
    w.mv.admitStep = () => { orig(); worst = Math.max(worst, w.mv.admissibleHeads()); };
    s.advanceTo(Infinity);
    expect(worst).toBe(0);
    expect(s.truncated).toBe(false);
  }
}, 120_000);

test('fractional advanceTo chunks give the same hash, series and metrics as a whole run', () => {
  const c = defaultConfig();
  const whole = new Sim(c, { reserveFraction: 0.5 });
  whole.advanceTo(Infinity);
  const frac = new Sim(c, { reserveFraction: 0.5 });
  for (let i = 1; !frac.done; i++) frac.advanceTo(i * 16.6667 * 30 + uniform(3, 1, i));
  expect(frac.runHash()).toBe(whole.runHash());
  expect([...frac.series().states]).toEqual([...whole.series().states]);
  expect(frac.metrics()).toEqual(whole.metrics());
}, 60_000);

test('claim limit 0: with no empty table in view the claimer falls back at once, before taking a step', () => {
  const c = defaultConfig();
  c.reserve.claimSearchLimit = 0;
  const onEdge: boolean[] = [];
  traced(c, { seed: 3, reserveFraction: 1 }, (s, tr) => {
    if (tr.ev !== 'fallback' || tr.b !== 1) return;
    const G = s.world.groups[tr.a];
    if (tr.ms === G.arrivalMs) onEdge.push(s.world.mv.edge[G.claimer] >= 0 || s.world.mv.wantEd[G.claimer] >= 0 && s.world.phase[G.claimer] === PH.CLAIMING);
  });
  expect(onEdge.length).toBeGreaterThan(50);
  expect(onEdge.filter(Boolean)).toHaveLength(0);
});

test('all-full re-choose runs every 5,000 ms after arriving at the walkway stop', () => {
  const c = defaultConfig();
  c.layout.stallCount = 4;
  c.crowd.totalPeople = 600;
  const times = new Map<number, number[]>();
  const s = new Sim(c, { seed: 1, reserveFraction: 0 });
  const w = s.world;
  const q = w.q;
  const pop = q.pop.bind(q);
  q.pop = () => {
    const ok = pop();
    if (ok && q.type === EV.RECHOOSE) (times.get(q.arg) ?? times.set(q.arg, []).get(q.arg)!).push(q.ms);
    return ok;
  };
  s.advanceTo(Infinity);
  let checked = 0;
  for (const ts of times.values()) for (let i = 1; i < ts.length; i++) { expect(ts[i] - ts[i - 1]).toBe(5000); checked++; }
  expect(checked).toBeGreaterThan(10);
  expect(s.truncated).toBe(false);
});

test('zero settings terminate, and CV 0 durations equal the means exactly', () => {
  const c = defaultConfig();
  c.reserve.claimSearchLimit = 0;
  c.eat.linger = 0;
  c.stalls.serviceCV = 0;
  c.eat.cv = 0;
  for (const share of [0, 1]) {
    c.crowd.peakShare = share;
    for (const f of [1, 0]) {
      const s = new Sim(c, { seed: 2, reserveFraction: f });
      s.advanceTo(Infinity);
      expect(s.truncated).toBe(false);
      expect(new Set(s.world.pop.serviceMs)).toEqual(new Set([90_000]));
      expect(new Set(s.world.pop.eatMs)).toEqual(new Set([1_080_000]));
    }
  }
}, 120_000);
