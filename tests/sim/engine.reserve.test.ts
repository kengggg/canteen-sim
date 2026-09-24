import { defaultConfig } from '../../src/config/schema';
import { popcount } from '../../src/sim/seating';
import { PH } from '../../src/sim/types';
import { traced, type Trace } from './helpers/run';

const joins = new Set<string>();
const checks = { entryQueue: [] as boolean[], claimAssign: [] as boolean[], sitAtClaimed: [] as boolean[], joinRule: [] as boolean[], unclaim: [] as boolean[] };

const A = traced(defaultConfig(), { seed: 1, reserveFraction: 1 }, (s, t) => {
  const w = s.world;
  const G = w.groups[t.a];
  if (t.ev === 'arrive' && G.reserver) {
    for (let m = G.first; m < G.first + G.size; m++) {
      if (m === G.claimer) continue;
      checks.entryQueue.push(w.phase[m] === PH.TO_STALL || w.phase[m] === PH.TO_FULLSTOP);
    }
  }
  if (t.ev === 'claim') {
    const fed: number[] = [];
    for (let m = G.first; m < G.first + G.size; m++) if (w.hasFood[m]) fed.push(m);
    fed.sort((a, b) => w.st.serviceEndMs[a] - w.st.serviceEndMs[b] || a - b);
    fed.forEach((m, i) => {
      const seat = w.seat[m];
      const tb = w.tableOfSeat(seat);
      checks.claimAssign.push(tb === t.b && seat - tb * w.k2 === G.fill[i] && ((w.heldMask[tb] >>> G.fill[i]) & 1) === 1);
    });
    const onNorth = w.pc.G.nodes[t.c].hLine === w.pc.L.tables[t.b].row;
    checks.claimAssign.push((G.fill[0] < w.k) === onNorth);
  }
  if (t.ev === 'commit' && t.c === 1) {
    joins.add(`${t.a}:${t.b}`);
    const free = popcount(w.freeMaskOf(t.b)) + G.size;
    const r = w.cfg.reserve;
    checks.joinRule.push(w.complete[t.b] === 1 && G.size <= r.shareMaxParty && free >= Math.max(G.size, r.shareMinEmpty));
  }
  if (t.ev === 'sit') {
    const tb = w.tableOfSeat(t.b);
    const owner = w.claimedBy[tb];
    checks.sitAtClaimed.push(owner < 0 || owner === t.a || joins.has(`${t.a}:${tb}`));
  }
  if (t.ev === 'unclaim') {
    for (let j = 0; j < w.k2; j++) {
      if ((w.occMask[t.b] >>> j) & 1) checks.unclaim.push(w.seatGroup[t.b * w.k2 + j] !== t.a);
    }
  }
});

test('A at 100% terminates with everyone out', () => {
  expect(A.sim.done && !A.sim.truncated).toBe(true);
  expect(A.w.exited).toBe(A.w.pop.personCount);
  const r = A.sim.metrics();
  expect(r.claimedGroups).toBeGreaterThan(0);
  expect(r.fallbackReservers).toBeGreaterThan(0);
});

test('oneClaimer members choose stalls and walk there on entry', () => {
  expect(checks.entryQueue.length).toBeGreaterThan(100);
  expect(checks.entryQueue.every(Boolean)).toBe(true);
});

test('a claimed table blocks every seat to strangers (only its group or valid joiners sit)', () => {
  expect(checks.sitAtClaimed.length).toBeGreaterThan(100);
  expect(checks.sitAtClaimed.every(Boolean)).toBe(true);
});

test('members holding food at the claim are assigned then, in (service end, id) order, claimer side first, seats held', () => {
  expect(checks.claimAssign.length).toBeGreaterThan(0);
  expect(checks.claimAssign.every(Boolean)).toBe(true);
});

test('joiners obey the sharing rule at every join, and stay when the claiming group leaves', () => {
  expect(checks.joinRule.length).toBeGreaterThan(0);
  expect(checks.joinRule.every(Boolean)).toBe(true);
  expect(checks.unclaim.length).toBeGreaterThan(0);
  expect(checks.unclaim.every(Boolean)).toBe(true);
});

test('a group that claimed never walks away', () => {
  const claimed = A.w.groups.filter((G) => G.claimed);
  expect(claimed.length).toBeGreaterThan(0);
  expect(claimed.every((G) => !G.walkedAway)).toBe(true);
});

test('claim cutoff: a target chosen before the cutoff is still claimed after it', () => {
  const c = defaultConfig();
  c.reserve.claimSearchLimit = 5;
  const R = traced(c, { seed: 2, reserveFraction: 1 });
  const late = R.traces.filter((t) => t.ev === 'claim' && t.ms > R.w.groups[t.a].arrivalMs + 5000);
  expect(late.length).toBeGreaterThan(0);
  expect(R.traces.some((t) => t.ev === 'fallback' && t.b === 2)).toBe(true);
});

test('limit 0: only tables visible from the entrance at entry can be claimed', () => {
  const c = defaultConfig();
  c.reserve.claimSearchLimit = 0;
  const R = traced(c, { seed: 3, reserveFraction: 1 });
  const vis = new Set(R.w.pc.visibleTables[R.w.pc.G.entranceNode]);
  const claims = R.traces.filter((t) => t.ev === 'claim');
  expect(claims.length).toBeGreaterThan(0);
  for (const t of claims) expect(vis.has(t.b)).toBe(true);
  expect(R.traces.some((t) => t.ev === 'fallback' && t.b === 1 && t.ms === R.w.groups[t.a].arrivalMs)).toBe(true);
});

test('fallback discards memory and patience counts from the later of food and fallback', () => {
  const mems: boolean[] = [];
  const R = traced(defaultConfig(), { seed: 4, reserveFraction: 1 }, (s, t) => {
    if (t.ev === 'fallback') mems.push(s.world.groups[t.a].mem === null || s.world.groups[t.a].searchers.length > 0);
  });
  expect(mems.length).toBeGreaterThan(0);
  expect(mems.every(Boolean)).toBe(true);
  let equal = 0;
  for (const G of R.w.groups) {
    if (!G.fallback || !G.walkedAway) continue;
    const deadline = Math.max(G.searcherFoodMs, G.claimEndMs) + R.w.patienceMs;
    expect(G.walkAwayMs).toBeGreaterThanOrEqual(deadline);
    if (G.walkAwayMs === deadline) equal++;
  }
  expect(equal).toBeGreaterThan(0);
});

test('together: convoy followers walk exactly the leader node sequence', () => {
  const c = defaultConfig();
  c.reserve.claimMode = 'together';
  const R = traced(c, { seed: 1, reserveFraction: 1 });
  expect(R.sim.done && !R.sim.truncated).toBe(true);
  const lead = new Map<number, number[]>();
  const follow = new Map<number, number[]>();
  for (const t of R.traces as Trace[]) {
    if (t.ev === 'lead') (lead.get(t.a) ?? lead.set(t.a, []).get(t.a)!).push(t.b);
    if (t.ev === 'follow') (follow.get(t.b) ?? follow.set(t.b, []).get(t.b)!).push(t.c);
  }
  expect(follow.size).toBeGreaterThan(50);
  for (const [p, seq] of follow) {
    const L = lead.get(R.w.pop.group[p])!;
    expect(seq).toEqual(L.slice(0, seq.length));
  }
  expect(R.w.groups.filter((G) => G.claimed).every((G) => !G.walkedAway)).toBe(true);
});
