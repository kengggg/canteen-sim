import { defaultConfig, type Config } from '../../src/config/schema';
import { Sim, pairMetrics } from '../../src/sim/engine';
import { uniform } from '../../src/sim/rng';

const small = (): Config => {
  const c = defaultConfig();
  c.crowd.totalPeople = 400;
  c.crowd.windowEnd = c.crowd.windowStart + 60;
  c.crowd.peakTime = c.crowd.windowStart + 30;
  return c;
};

test('chunk independence: random advanceTo chunks and step(k) loops give identical hashes and series', () => {
  const c = defaultConfig();
  const whole = new Sim(c, { reserveFraction: 0.5 });
  whole.advanceTo(Infinity);
  const chunked = new Sim(c, { reserveFraction: 0.5 });
  let t = 0;
  for (let i = 0; !chunked.done; i++) {
    t += 1 + Math.floor(uniform(77, 1, i) * 600_000);
    chunked.advanceTo(t);
  }
  const stepped = new Sim(c, { reserveFraction: 0.5 });
  for (let i = 0; !stepped.done; i++) stepped.step(1 + Math.floor(uniform(78, 1, i) * 5000));
  expect(chunked.runHash()).toBe(whole.runHash());
  expect(stepped.runHash()).toBe(whole.runHash());
  expect([...chunked.series().states]).toEqual([...whole.series().states]);
  expect([...stepped.series().sits]).toEqual([...whole.series().sits]);
  expect(chunked.metrics()).toEqual(whole.metrics());
}, 60_000);

test('A ≡ B at 0%: per-tick state hashes match, each alone and interleaved', () => {
  const c = small();
  c.reserve.percentA = 0;
  const alone = (frac?: number) => {
    const s = new Sim(c, frac === undefined ? {} : { reserveFraction: frac });
    const hs: number[] = [];
    for (let t = 0; !s.done; t += 200) { s.advanceTo(t); hs.push(s.stateHash()); }
    return { hs, run: s.runHash() };
  };
  const a = alone(), b = alone(0);
  expect(a.hs).toEqual(b.hs);
  expect(a.run).toBe(b.run);
  const A = new Sim(c), B = new Sim(c, { reserveFraction: 0 });
  for (let t = 0, i = 0; !(A.done && B.done); t += 200, i++) {
    A.advanceTo(t);
    B.advanceTo(t);
    expect(A.stateHash()).toBe(B.stateHash());
    expect(A.stateHash()).toBe(a.hs[i]);
  }
  expect(A.runHash()).toBe(a.run);
}, 120_000);

test('at 100% every person has identical inputs in A and B', () => {
  const c = defaultConfig();
  const A = new Sim(c, { reserveFraction: 1 }), B = new Sim(c, { reserveFraction: 0 });
  const a = A.world, b = B.world;
  expect([...a.pop.personId]).toEqual([...b.pop.personId]);
  expect([...a.pop.arrivalMs]).toEqual([...b.pop.arrivalMs]);
  expect([...a.pop.size]).toEqual([...b.pop.size]);
  expect([...a.pop.servicePct]).toEqual([...b.pop.servicePct]);
  expect([...a.pop.eatPct]).toEqual([...b.pop.eatPct]);
  for (let p = 0; p < a.pop.personCount; p += 17) for (let s = 0; s < a.st.S; s++) expect(a.st.gumbel(p, s)).toBe(b.st.gumbel(p, s));
});

test('view() arrays have the documented lengths and consistent segments; live() matches metrics at done', () => {
  const s = new Sim(defaultConfig(), { reserveFraction: 0.5 });
  const P = s.static.count;
  for (const t of [30, 60, 75, 90, 120].map((m) => m * 60_000)) {
    s.advanceTo(t);
    const v = s.view();
    expect(v.active.length).toBe(P);
    expect(v.seatState.length).toBe(600);
    expect(v.tableRing.length).toBe(100);
    for (let p = 0; p < P; p++) {
      if (!v.active[p]) continue;
      expect(Number.isFinite(v.t0[p]) && Number.isFinite(v.t1[p]) && v.t0[p] <= v.t1[p]).toBe(true);
      for (const x of [v.x0[p], v.x1[p]]) expect(x >= 0 && x <= s.layout.W).toBe(true);
      for (const y of [v.y0[p], v.y1[p]]) expect(y >= 0 && y <= s.layout.H).toBe(true);
    }
    const l = s.live();
    expect(l.seatsByState.reduce((a, b) => a + b, 0)).toBe(600);
  }
  s.advanceTo(Infinity);
  const l = s.live(), r = s.metrics();
  expect(l.walkAwayPct).toBeCloseTo(r.walkAwayPct!, 10);
  expect(l.entranceToSeatMeanMin).toBeCloseTo(r.entranceToSeatMeanMin!, 8);
  expect(l.peakThroughputPerHour).toBe(r.peakThroughputPerHour);
  expect(s.progress()).toBe(1);
}, 60_000);

test('pairMetrics: shared peak window, P3 in [0, 1], and reserver cohorts', () => {
  const c = defaultConfig();
  const A = new Sim(c, { reserveFraction: 1 }), B = new Sim(c, { reserveFraction: 0 });
  A.advanceTo(Infinity);
  B.advanceTo(Infinity);
  const pm = pairMetrics(A.pairInput(), B.pairInput(), 1);
  expect(pm.peakWindowLengthMin).toBe(60);
  expect(pm.peakWindowStartMin).toBeGreaterThanOrEqual(0);
  for (const v of [pm.p3Level, pm.p3Baseline]) expect(v > 0 && v <= 1).toBe(true);
  expect(pm.cohorts.R.level.groups).toBe(A.world.groups.length);
  expect(pm.cohorts.N.level.people).toBe(0);
  expect(pm.cohorts.N.level.walkAwayPct).toBeNull();
  expect(pm.cohorts.Rclaimed.level.groups + pm.cohorts.Rfallback.level.groups).toBe(pm.cohorts.R.level.groups);
  expect(pm.cohorts.Rclaimed.baseline.groups).toBe(pm.cohorts.Rclaimed.level.groups);
  const sum = pm.sharesLevel.reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1, 9);
}, 60_000);
