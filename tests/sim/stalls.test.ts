import { defaultConfig } from '../../src/config/schema';
import { toLayoutParams } from '../../src/config/validate';
import { EventQueue } from '../../src/sim/events';
import { getPrecomp } from '../../src/sim/precompute';
import { buildPopulation, lognormalMs } from '../../src/sim/population';
import { uniform } from '../../src/sim/rng';
import { Stalls, Q_WALKIN, Q_MOVEUP } from '../../src/sim/stalls';

function harness(n = 1800) {
  const c = defaultConfig();
  c.crowd.totalPeople = n;
  const pc = getPrecomp(toLayoutParams(c), 10_000);
  const pop = buildPopulation(c, 1);
  const q = new EventQueue();
  const log: string[] = [];
  const st = new Stalls(pc, pop, c, 1, {
    scheduleQueue: (ms, stall, type, p) => q.push(ms, 4, stall, type, p, 0),
    scheduleServiceEnd: (p, ms) => q.push(ms, 2, p, 0, p, 0),
    onServiceStart: (p) => log.push(`start ${p} ${st.now}`),
  });
  const run = (until = Infinity) => {
    while (q.size > 0 && q.peekMs() <= until) {
      q.pop();
      st.now = q.ms;
      if (q.kind === 4) st.onQueueEvent(q.type, q.arg);
      else if (q.kind === 2) { log.push(`end ${q.arg} ${q.ms}`); st.serviceEnded(q.arg); }
    }
  };
  return { c, pc, pop, st, q, run, log };
}

test('queueLength counts walkers, a stall is never chosen at capacity, and choose returns -1 when all are full', () => {
  const { st, pc } = harness();
  const cap = pc.L.queueCapacity;
  const S = pc.L.stalls.length;
  let p = 0;
  for (; p < S * cap; p++) expect(st.choose(p)).toBeGreaterThanOrEqual(0);
  for (let s = 0; s < S; s++) expect(st.queueLength[s]).toBe(cap);
  expect(st.choose(p)).toBe(-1);
  expect(st.bestIgnoringFull(p)).toBeGreaterThanOrEqual(0);
});

test('utility: rank term, queue aversion and fixed Gumbel terms; ties go to the lower stall id', () => {
  const { st } = harness();
  expect(st.gumbel(5, 3)).toBe(st.gumbel(5, 3));
  const u0 = st.utility(5, 3);
  st.queueLength[3] = 10;
  expect(st.utility(5, 3)).toBeCloseTo(u0 - 1, 12);
  st.queueLength[3] = 0;
  const flat = Object.create(st) as Stalls;
  flat.utility = () => 1;
  expect(Stalls.prototype.choose.call(flat, 7)).toBe(0);
});

test('two people reaching the walkway stop in the same ms get different positions', () => {
  const { st, run } = harness();
  st.now = 1000;
  for (const p of [0, 1]) { st.choose(p); }
  const s = st.chosen[0];
  st.chosen[1] = s;
  st.atWalkway(0, s);
  st.atWalkway(1, s);
  expect(st.assigned[0]).toBe(1);
  expect(st.assigned[1]).toBe(2);
  run();
});

test('a walker whose positions emptied during its walk makes the missed move-ups on arrival', () => {
  const { st, run, log, pop } = harness();
  const s = 0;
  st.now = 0;
  st.chosen[0] = s; st.queueLength[s]++;
  st.atWalkway(0, s);
  const end0 = st.walkInEndMs(0) + pop.serviceMs[0];
  run(end0 - 10);
  // 1 reaches the stop 10 ms before 0 finishes: assigned position 2; position 1 empties during 1's walk.
  st.now = end0 - 10;
  st.chosen[1] = s; st.queueLength[s]++;
  st.atWalkway(1, s);
  expect(st.assigned[1]).toBe(2);
  const join1 = st.walkInEndMs(1);
  run();
  expect(log).toContain(`end 0 ${end0}`);
  const start1 = Number(log.find((l) => l.startsWith('start 1'))!.split(' ')[2]);
  expect(start1).toBe(join1 + 462);
});

test("Little's law identities hold exactly on a busy stream", () => {
  const { st, run } = harness();
  const s = 2;
  for (let p = 0; p < 200; p++) {
    const t = p * 20_000;
    st.now = t;
    run(t);
    st.now = t;
    if (st.queueLength[s] >= st.cap) continue;
    st.chosen[p] = s; st.queueLength[s]++;
    st.atWalkway(p, s);
  }
  run();
  st.flush(st.now);
  let sumWait = 0, sumSojourn = 0;
  for (let p = 0; p < 200; p++) {
    if (st.joinMs[p] < 0) continue;
    sumWait += st.serviceStartMs[p] - st.joinMs[p];
    sumSojourn += st.serviceEndMs[p] - st.joinMs[p];
  }
  expect(st.accWaiting[s]).toBe(sumWait);
  expect(st.accInSlot[s]).toBe(sumSojourn);
  expect(sumWait).toBeGreaterThan(0);
});

test('M/G/1: Poisson arrivals, rho = 0.7, lognormal CV 0.5 service: mean wait within 5% of Pollaczek-Khinchine', () => {
  const m = 90, cv = 0.5, rho = 0.7;
  const lambda = rho / m;
  const n = 1_000_000;
  let t = 0, free = 0, sumWait = 0;
  for (let i = 0; i < n; i++) {
    t += -Math.log(uniform(11, 1, i)) / lambda;
    const start = Math.max(t, free);
    sumWait += start - t;
    free = start + lognormalMs(m, cv, uniform(11, 6, i)) / 1000;
  }
  const expected = (lambda * m * m * (1 + cv * cv)) / (2 * (1 - rho));
  expect(Math.abs(sumWait / n / expected - 1)).toBeLessThan(0.05);
});

test('queue event types are distinct constants', () => {
  expect(Q_WALKIN).not.toBe(Q_MOVEUP);
});
