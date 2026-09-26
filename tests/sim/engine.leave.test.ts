import { defaultConfig, type Config } from '../../src/config/schema';
import { doorVerdict, fitTables } from '../../src/sim/agents';
import { LEFT, PH } from '../../src/sim/types';
import { traced } from './helpers/run';

/** Model 2: leaving before food — at the door and from a queue; reservers collect the object (design §2.1–2.4). */

const cfgWith = (f: (c: Config) => void) => { const c = defaultConfig(); f(c); return c; };

test('door verdict: the queue check, the seating check, both, or stay; exact boundaries', () => {
  const base = { minQueueMs: 600_000, waitLimitMs: 600_000, fitTables: 3, roomNeeded: 3 };
  expect(doorVerdict(base)).toBe(0);
  expect(doorVerdict({ ...base, minQueueMs: 600_001 })).toBe(LEFT.DOOR_QUEUE);
  expect(doorVerdict({ ...base, fitTables: 2 })).toBe(LEFT.DOOR_SEATING);
  expect(doorVerdict({ ...base, minQueueMs: 600_001, fitTables: 2 })).toBe(LEFT.DOOR_BOTH);
  expect(doorVerdict({ ...base, fitTables: 0, roomNeeded: 0 })).toBe(0);
});

test('tables that look like a fit: unclaimed, with at least n seats nobody sits on (held seats look empty)', () => {
  const occ = new Int32Array([0b000000, 0b000011, 0b111111, 0b000001]);
  const claimedBy = new Int32Array([-1, -1, -1, 7]);
  expect(fitTables(occ, claimedBy, 6, 6)).toBe(1);
  expect(fitTables(occ, claimedBy, 6, 4)).toBe(2);
  expect(fitTables(occ, claimedBy, 6, 1)).toBe(2);
  expect(fitTables(occ, claimedBy, 6, 0)).toBe(3);
});

type Door = { ok: boolean; why: string };
const doorChecks: Door[] = [];
const qleaveChecks: Door[] = [];
let stayed = 0, leftDoor = 0;
const D = traced(defaultConfig(), { seed: 1, reserveFraction: 0.5 }, (s, t) => {
  const w = s.world;
  if (t.ev === 'door') {
    const G = w.groups[t.a];
    let minQ = Infinity;
    for (let st = 0; st < w.st.S; st++) minQ = Math.min(minQ, w.st.queueLength[st] * w.serviceMeanMs);
    const want = doorVerdict({ minQueueMs: minQ, waitLimitMs: w.pop.waitLimitMs[G.g], fitTables: fitTables(w.occMask, w.claimedBy, w.k2, G.size), roomNeeded: w.pop.roomNeeded[G.g] });
    doorChecks.push({ ok: want === t.b, why: `group ${G.g}: traced ${t.b}, recomputed ${want}` });
    if (t.b === 0) stayed++;
    else leftDoor++;
  }
  if (t.ev === 'qleave') {
    const G = w.parties[t.a];
    qleaveChecks.push({ ok: !G.people.includes(t.b) && w.partyOf[t.b] === G.party, why: `leaver ${t.b} still in its party` });
  }
});
const w = D.w;

test('door decisions match the world at the moment of arrival; door leavers never queue and walk straight out', () => {
  for (const c of doorChecks) expect(c.ok, c.why).toBe(true);
  expect(stayed).toBeGreaterThan(0);
  expect(leftDoor).toBeGreaterThan(0);
  for (let p = 0; p < w.pop.personCount; p++) {
    const k = w.leftKind[p];
    if (k < LEFT.DOOR_QUEUE || k > LEFT.DOOR_BOTH) continue;
    expect(w.leftMs[p]).toBe(w.entranceMs[p]);
    expect(w.queueStartMs[p]).toBe(-1);
    expect(w.st.serviceStartMs[p]).toBe(-1);
    expect(w.exitMs[p]).toBeGreaterThan(w.entranceMs[p]);
  }
});

test('queue leavers leave once they have queued past the limit (or at the end of that step), unserved, with no tray and no seat', () => {
  let n = 0;
  for (const c of qleaveChecks) expect(c.ok, c.why).toBe(true);
  for (let p = 0; p < w.pop.personCount; p++) {
    if (w.leftKind[p] !== LEFT.QUEUE) continue;
    n++;
    const due = w.queueStartMs[p] + w.pop.waitLimitMs[w.pop.group[p]];
    expect(w.leftMs[p]).toBeGreaterThanOrEqual(due);
    expect(w.leftMs[p] - due).toBeLessThanOrEqual(10_000);
    expect(w.st.serviceStartMs[p]).toBe(-1);
    expect(w.dropEndMs[p]).toBe(-1);
    expect(w.seat[p]).toBe(-1);
    expect(w.exitMs[p]).toBeGreaterThan(w.leftMs[p]);
  }
  expect(n).toBeGreaterThan(0);
  const m = D.sim.metrics();
  expect(m.leftQueue).toBe(n);
  expect(m.leftPeople).toBe(m.leftQueue + m.leftDoorQueues + m.leftDoorSeating + m.leftDoorBoth);
  expect(m.arrivals).toBe(m.seated + m.leftPeople);
  expect(m.leftPct).toBeCloseTo((100 * m.leftPeople) / m.arrivals, 12);
});

test('nobody who left was ever served (A at 100% and B)', () => {
  for (const f of [1, 0]) {
    const R = traced(defaultConfig(), { seed: 2, reserveFraction: f });
    for (let p = 0; p < R.w.pop.personCount; p++) if (R.w.leftKind[p] !== 0) expect(R.w.st.serviceStartMs[p]).toBe(-1);
    expect(R.w.exited).toBe(R.w.pop.personCount);
  }
});

/** One stall with a short queue zone: long all-full waits, so reservers give up after claiming. */
const tight = cfgWith((c) => {
  c.layout.stallCount = 1;
  c.layout.queueDepth = 3.2;
  c.crowd.totalPeople = 400;
  c.leave.waitCV = 1.5;
});

test('reservers collect the object: the table stays claimed until the pick-up ends, 3 s after reaching it, then the collector exits', () => {
  const pick = new Map<number, number>();
  const phases: number[] = [];
  const R = traced(tight, { seed: 1, reserveFraction: 1 }, (s, t) => {
    const x = s.world;
    if (t.ev === 'collect') {
      expect(x.claimedBy[t.b]).toBe(t.a);
      phases.push(x.phase[t.c]);
    }
    if (t.ev === 'pickup') {
      expect(x.claimedBy[t.b]).toBe(t.a);
      pick.set(t.b, t.ms);
    }
    if (t.ev === 'unclaim' && pick.has(t.b)) {
      expect(t.ms).toBe(pick.get(t.b)! + 3000);
      pick.delete(t.b);
    }
  });
  const collects = R.traces.filter((t) => t.ev === 'collect');
  expect(collects.length).toBeGreaterThan(0);
  expect(pick.size).toBe(0);
  for (const t of collects) expect(R.w.exitMs[t.c]).toBeGreaterThan(t.ms);
  expect(R.sim.metrics().objectsCollected).toBe(collects.length);
  // Review Focus 3: some collectors gave up while waiting because every queue was full, or walking to a stall.
  expect(phases.some((ph) => ph === PH.FULL_WAIT || ph === PH.TO_STALL)).toBe(true);
  expect(R.sim.done && !R.sim.truncated).toBe(true);
  expect(R.w.exited).toBe(R.w.pop.personCount);
});

test('Review Focus 1: room needed above what the layout can ever show still terminates, and every door leaver exits', () => {
  const c = cfgWith((x) => {
    x.layout.cols = 3;
    x.layout.rows = 1;
    x.leave.roomNeeded = 20;
    x.crowd.totalPeople = 300;
  });
  const R = traced(c, { seed: 1, reserveFraction: 0.5 });
  expect(R.sim.done).toBe(true);
  expect(R.w.exited).toBe(R.w.pop.personCount);
  expect(R.sim.metrics().leftDoorSeating + R.sim.metrics().leftDoorBoth).toBeGreaterThan(0);
});

test('when the last queuer leaves a party that has finished eating, it stands up then (or when its linger ends)', () => {
  let found = 0;
  const expected = new Map<number, number>();
  const R = traced(tight, { seed: 3, reserveFraction: 0 }, (s, t) => {
    const x = s.world;
    if (t.ev !== 'qleave') return;
    const G = x.parties[t.a];
    if (G.size > 0 && G.eatDone > 0 && G.eatDone === G.size) expected.set(G.party, Math.max(t.ms, G.maxEatEndMs + x.lingerMs));
  });
  for (const [party, ms] of expected) {
    for (const p of R.w.parties[party].people) expect(R.w.standMs[p]).toBe(ms);
    found++;
  }
  expect(found).toBeGreaterThan(0);
});

test('with a 60-minute wait limit, no spread and no seating check, nobody leaves (A at 100% and B)', () => {
  const c = cfgWith((x) => {
    x.leave = { waitMean: 3600, waitCV: 0, roomNeeded: 0 };
  });
  for (const f of [1, 0]) expect(traced(c, { seed: 1, reserveFraction: f }).sim.metrics().leftPeople).toBe(0);
});

test('seat search time: a claimed group counts as 0 only if a member was served; groups that never had food are left out', () => {
  const R = traced(tight, { seed: 1, reserveFraction: 0.5 }); // 50%: free-flow searches too, so the zeros matter
  const w = R.w;
  const xs: number[] = [];
  let unfedClaimed = 0;
  for (const G of w.groups) {
    let fed = false;
    for (let p = w.pop.firstPerson[G.g]; p < w.pop.firstPerson[G.g] + w.pop.size[G.g]; p++) if (w.st.serviceEndMs[p] >= 0) fed = true;
    if (G.claimed) {
      if (fed) xs.push(0);
      else unfedClaimed++;
    } else if (G.searcherFoodMs >= 0 && G.lastCommitMs >= 0) xs.push(G.lastCommitMs - G.searcherFoodMs);
  }
  expect(unfedClaimed).toBeGreaterThan(0);
  expect(xs.some((x) => x > 0)).toBe(true);
  expect(R.sim.metrics().seatSearchMeanMin).toBeCloseTo(xs.reduce((a, b) => a + b, 0) / xs.length / 60_000, 12);
});
