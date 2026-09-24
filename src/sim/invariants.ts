import { SEAT, seatStateOf, popcount } from './seating';
import { PH } from './types';
import type { World } from './world';

/** Spec §13.3 invariants. Throws on the first violation. */
export function checkInvariants(w: World): void {
  const fail = (msg: string) => { throw new Error(`invariant @${w.now}ms: ${msg}`); };
  const P = w.pop.personCount;
  const k2 = w.k2;

  // arrived = inside + exited.
  let inside = 0;
  for (let p = 0; p < P; p++) if (w.phase[p] !== PH.OUT && w.phase[p] !== PH.EXITED) inside++;
  if (w.arrived !== inside + w.exited) fail(`arrived ${w.arrived} ≠ inside ${inside} + exited ${w.exited}`);

  // Seats: one occupant each; occupied / held masks match the people.
  const seatedAt = new Int32Array(w.pc.L.seats.length).fill(-1);
  for (let p = 0; p < P; p++) {
    const ph = w.phase[p];
    const seated = ph === PH.SITTING || ph === PH.EATING || ph === PH.STANDING;
    const s = w.seat[p];
    if (seated) {
      if (seatedAt[s] >= 0) fail(`seat ${s} has two occupants`);
      seatedAt[s] = p;
      const t = w.tableOfSeat(s);
      if (!((w.occMask[t] >>> (s - t * k2)) & 1)) fail(`seated person ${p} not in occMask`);
      const owner = w.claimedBy[t];
      const G = w.groupOf(p);
      if (owner >= 0 && owner !== G.g && G.joinedTable !== t) fail(`person ${p} sits at table ${t} claimed by ${owner}`);
    } else if (s >= 0 && w.sitStartMs[p] < 0) {
      const t = w.tableOfSeat(s);
      if (!((w.heldMask[t] >>> (s - t * k2)) & 1)) fail(`assigned seat ${s} of ${p} not held`);
    }
  }
  const totals = new Int32Array(6);
  for (let t = 0; t < w.pc.tableCount; t++) {
    if (w.occMask[t] & w.heldMask[t]) fail(`table ${t} seat both held and occupied`);
    const claimed = w.claimedBy[t] >= 0;
    if (claimed !== (w.claimedFlag[t] === 1)) fail(`table ${t} claimed flag out of sync`);
    const fc = popcount(w.freeMaskOf(t));
    for (let j = 0; j < k2; j++) {
      const s = t * k2 + j;
      const occ = ((w.occMask[t] >>> j) & 1) === 1;
      if (occ !== (seatedAt[s] >= 0)) fail(`seat ${s} occupancy mismatch`);
      const want = seatStateOf({ occupied: occ, held: ((w.heldMask[t] >>> j) & 1) === 1, claimed, complete: w.complete[t] === 1, freeCount: fc, shareMinEmpty: w.cfg.reserve.shareMinEmpty });
      if (w.seatState[s] !== want) fail(`seat ${s} state ${w.seatState[s]} ≠ ${want}`);
      totals[want]++;
    }
  }
  for (let s = 0; s < 6; s++) if (totals[s] !== w.clock.totals[s]) fail(`state total ${s}: ${w.clock.totals[s]} ≠ ${totals[s]}`);
  if (totals[SEAT.FREE] + totals[SEAT.OPEN] + totals[SEAT.BLOCKED] + totals[SEAT.CLAIMED_EMPTY] + totals[SEAT.HELD] + totals[SEAT.OCCUPIED] !== w.pc.L.seats.length) fail('seat totals');

  // Lanes, link direction, busy nodes.
  const G = w.pc.G;
  const mv = w.mv;
  for (const e of G.edges) {
    const a = mv.occ[2 * e.id], b = mv.occ[2 * e.id + 1];
    if (a < 0 || b < 0) fail(`edge ${e.id} negative occupancy`);
    if (e.lanes >= 4 ? a + b > e.lanes * e.capacity : e.lanes === 1 ? a + b > e.capacity : a > e.capacity || b > e.capacity) fail(`edge ${e.id} over capacity`);
    if (e.lanes === 1 && a > 0 && b > 0) fail(`1-lane edge ${e.id} used in both directions`);
  }
  for (let L = 0; L < G.links.length; L++) if (mv.regCount[2 * L] > 0 && mv.regCount[2 * L + 1] > 0) fail(`link ${L} registered both ways`);
  for (let p = 0; p < P; p++) {
    const e = mv.edge[p];
    if (e >= 0 && G.edges[e].lanes === 1 && (mv.regLink[p] !== G.edges[e].link || mv.regDir[p] !== mv.dir[p])) fail(`person ${p} on 1-lane edge ${e} unregistered`);
  }
  for (let n = 0; n < G.nodes.length; n++) if (mv.busyCount[n] < 0) fail(`node ${n} busy count negative`);
  // Liveness (§4.2 rule 1): outside a pending kind-6 step, no FIFO head could enter now.
  if (!w.admitIsPending() && mv.admissibleHeads() > 0) fail('a FIFO head could enter but was not admitted');

  if (w.done && !w.truncated) {
    let seated = 0;
    for (let p = 0; p < P; p++) if (w.sitStartMs[p] >= 0) seated++;
    if (w.arrived !== seated + w.walkAwayPeople) fail(`arrivals ${w.arrived} ≠ seated ${seated} + walk-aways ${w.walkAwayPeople}`);
  }
}
