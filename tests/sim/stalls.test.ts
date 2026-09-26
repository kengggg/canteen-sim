import { defaultConfig } from '../../src/config/schema';
import { toLayoutParams } from '../../src/config/validate';
import { EventQueue } from '../../src/sim/events';
import { getPrecomp } from '../../src/sim/precompute';
import { buildPopulation, lognormalMs } from '../../src/sim/population';
import { uniform } from '../../src/sim/rng';
import { Stalls, Q_WALKIN, Q_MOVEUP, LEAVE_NOW, LEAVE_DEFERRED, LEAVE_SERVED } from '../../src/sim/stalls';

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
    onDeferredLeave: (p) => log.push(`leave ${p} ${st.now}`),
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


describe('leaving a queue (design §2.3)', () => {
  /** Five people queue at stall 0; the head's service is long, so everyone else stands idle in a slot. */
  function queued() {
    const h = harness();
    const { st, pop, run } = h;
    const head = Array.from({ length: pop.personCount }, (_, i) => i).find((p) => pop.serviceMs[p] >= 60_000)!;
    const people = [head, ...[0, 1, 2, 3, 4, 5].filter((p) => p !== head).slice(0, 4)];
    people.forEach((p, i) => {
      st.now = i;
      st.chosen[p] = 0;
      st.queueLength[0]++;
      st.atWalkway(p, 0);
    });
    const settled = Math.max(...people.map((p) => st.walkInEndMs(p))) + 1;
    run(settled);
    expect(st.serviceStartMs[head]).toBeGreaterThanOrEqual(0);
    expect(st.serviceStartMs[head] + pop.serviceMs[head]).toBeGreaterThan(settled);
    return { ...h, people, head, settled };
  }
  const upMs = Math.floor((600 * 1000 + 1300 - 1) / 1300);

  test('someone idle in a slot leaves at once: the queue shortens and everyone behind moves up one place', () => {
    const { st, run, people, settled } = queued();
    const [, a, b, c, d] = people;
    const len = st.queueLength[0];
    st.now = settled;
    expect(st.requestLeave(b)).toBe(LEAVE_NOW);
    expect(st.leaveMs[b]).toBe(settled);
    expect(st.queueLength[0]).toBe(len - 1);
    expect(st.members[0]).toEqual([people[0], a, c, d]);
    run(settled + upMs);
    expect(st.physPos[c]).toBe(3);
    expect(st.physPos[d]).toBe(4);
    expect(st.physPos[a]).toBe(2);
  });

  test('someone walking in leaves at the end of the walk-in', () => {
    const { st, run, log, settled, pop } = queued();
    const e = 6;
    st.now = settled;
    st.chosen[e] = 0;
    st.queueLength[0]++;
    st.atWalkway(e, 0);
    const end = st.walkInEndMs(e);
    st.now = settled + 1;
    expect(st.requestLeave(e)).toBe(LEAVE_DEFERRED);
    run(end);
    expect(log).toContain(`leave ${e} ${end}`);
    expect(st.joinMs[e]).toBe(end);
    expect(st.leaveMs[e]).toBe(end);
    expect(st.members[0]).not.toContain(e);
    expect(pop.personCount).toBeGreaterThan(e);
  });

  test('a move-up that reaches the service position serves the person, cancelling the leave', () => {
    const { st, run, log, people, head, pop } = queued();
    const a = people[1];
    const endHead = st.serviceStartMs[head] + pop.serviceMs[head];
    run(endHead); // the harness ends the head's service here, and a starts moving up
    expect(st.state[a]).toBe(2); // MOVING_UP
    st.now = endHead + 1;
    expect(st.requestLeave(a)).toBe(LEAVE_DEFERRED);
    run(endHead + upMs);
    expect(st.serviceStartMs[a]).toBe(endHead + upMs);
    expect(log.some((x) => x.startsWith(`leave ${a} `))).toBe(false);
    expect(st.requestLeave(a)).toBe(LEAVE_SERVED);
  });

  test('once service has started, a leave request changes nothing', () => {
    const { st, people, head } = queued();
    const before = st.members[0].slice();
    expect(st.requestLeave(head)).toBe(LEAVE_SERVED);
    expect(st.members[0]).toEqual(before);
    expect(people[0]).toBe(head);
  });

  test("Little's law holds exactly with leavers counted until they leave", () => {
    const { st, run, people, settled } = queued();
    st.now = settled + 5000;
    run(st.now);
    st.requestLeave(people[2]);
    st.now = settled + 9000;
    run(st.now);
    st.requestLeave(people[4]);
    run();
    st.flush(st.now);
    let wait = 0, slot = 0;
    for (const p of people) {
      if (st.joinMs[p] < 0) continue;
      wait += (st.serviceStartMs[p] >= 0 ? st.serviceStartMs[p] : st.leaveMs[p]) - st.joinMs[p];
      slot += (st.serviceEndMs[p] >= 0 ? st.serviceEndMs[p] : st.leaveMs[p]) - st.joinMs[p];
    }
    expect(st.accWaiting[0]).toBe(wait);
    expect(st.accInSlot[0]).toBe(slot);
  });

  test('walkBack goes slot → corner → walkway stop at walking speed; releaseChoice uncounts a walker', () => {
    const { st, pc, people, settled } = queued();
    const c = people[3];
    st.now = settled;
    st.requestLeave(c);
    const t2 = st.walkBack(c);
    const slot = pc.L.stalls[0].slots[st.physPos[c] - 1];
    const stop = pc.G.nodes[pc.G.stallNode[0]];
    const cx = stop.x, cy = slot.y; // top band
    const leg = (mm: number) => Math.max(1, Math.floor((mm * 1000 + 1300 - 1) / 1300));
    const t1 = settled + leg(Math.abs(slot.x - cx) + Math.abs(slot.y - cy));
    expect(Array.from(st.px.slice(3 * c, 3 * c + 3))).toEqual([slot.x, cx, stop.x]);
    expect(Array.from(st.py.slice(3 * c, 3 * c + 3))).toEqual([slot.y, cy, stop.y]);
    expect(t2).toBe(t1 + leg(Math.abs(stop.x - cx) + Math.abs(stop.y - cy)));
    const w = 7;
    st.choose(w);
    const s = st.chosen[w], len = st.queueLength[s];
    st.releaseChoice(w);
    expect(st.queueLength[s]).toBe(len - 1);
    expect(st.chosen[w]).toBe(-1);
  });
});
