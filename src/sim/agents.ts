import { popcount, chooseJoin, chooseUnclaimed, fillOrder, joinAllowed, ownSeat, SEAT } from './seating';
import { Memory, claimTarget, exploreTarget, freeFlowTarget, observe, type TableTruth } from './search';
import { ASK_MS, EV, GM, K, PH, PLACE_MS, PU, RECHOOSE_MS, REFUSE_MS, SIT_MS, STAND_MS } from './types';
import type { GroupState, World } from './world';

/** Group and person behaviour (spec §5). Every function runs inside one event at w.now. */

const truthOf = (w: World): TableTruth => ({ occMask: w.occMask, heldMask: w.heldMask, claimed: w.claimedFlag });

export function install(w: World): void {
  w.onReach = onReach;
}

function members(G: GroupState): number[] {
  const out: number[] = [];
  for (let m = 0; m < G.size; m++) out.push(G.first + m);
  return out;
}

// ---------------------------------------------------------------- arrival and buying

export function groupArrive(w: World, g: number): void {
  const G = w.groups[g];
  const entrance = w.pc.G.entranceNode;
  w.arrived += G.size;
  for (const p of members(G)) {
    w.entranceMs[p] = w.now;
    w.arrivedEntranceSum += w.now;
    w.mv.placeAt(p, entrance);
  }
  if (!G.reserver) {
    for (const p of members(G)) goBuy(w, p);
    return;
  }
  G.mode = GM.RESERVE;
  G.claimer = G.first;
  G.mem = new Memory(w.pc);
  if (w.together) {
    for (const p of members(G)) w.provisional[p] = w.st.provisional(p);
    G.history = [entrance];
    for (const p of members(G)) {
      setClaiming(w, p, true);
      if (p === G.claimer) continue;
      w.setPhase(p, PH.CONVOY);
      w.histIdx[p] = 0;
      w.waitingLeader[p] = 1;
    }
  } else {
    w.provisional[G.claimer] = w.st.provisional(G.claimer);
    setClaiming(w, G.claimer, true);
    for (const p of members(G)) if (p !== G.claimer) goBuy(w, p);
  }
  w.setPhase(G.claimer, PH.CLAIMING);
  w.schedule(w.now + w.claimLimitMs, K.TIMER, w.pidOf(G.first), EV.CUTOFF, g);
  claimObserve(w, G.claimer, entrance);
}

function setClaiming(w: World, p: number, on: boolean): void {
  w.claimingNow += on ? 1 : -1;
}

/** Choose a stall (or, if all are full, walk to the best one's walkway stop) and walk there. */
export function goBuy(w: World, p: number): void {
  const G = w.groupOf(p);
  G.sumCache = null;
  const s = w.st.choose(p);
  if (s >= 0) {
    w.setPhase(p, PH.TO_STALL);
    w.setTrip(p, w.pc.G.stallNode[s], PU.STALL);
  } else {
    const best = w.st.bestIgnoringFull(p);
    w.fullStall[p] = best;
    w.setPhase(p, PH.TO_FULLSTOP);
    w.setTrip(p, w.pc.G.stallNode[best], PU.FULLSTOP);
  }
}

function rechoose(w: World, p: number): void {
  const G = w.groupOf(p);
  G.sumCache = null;
  const s = w.st.choose(p);
  if (s >= 0) {
    w.fullStall[p] = -1;
    w.setQueuing(p, false);
    w.setPhase(p, PH.TO_STALL);
    w.setTrip(p, w.pc.G.stallNode[s], PU.STALL);
    return;
  }
  w.setPhase(p, PH.FULL_WAIT);
  w.setQueuing(p, true);
  w.mv.stop(p);
  w.nodeWaitSince[p] = w.now;
  w.rechooseStamp[p]++;
  w.schedule(w.now + RECHOOSE_MS, K.TIMER, w.pidOf(p), EV.RECHOOSE, p, w.rechooseStamp[p]);
}

export function onRechooseTimer(w: World, p: number, stamp: number): void {
  if (w.phase[p] !== PH.FULL_WAIT || stamp !== w.rechooseStamp[p]) return;
  rechoose(w, p);
}

function onReach(w: World, p: number): void {
  switch (w.purpose[p]) {
    case PU.STALL: {
      const s = w.st.chosen[p];
      w.mv.leave(p);
      w.setPhase(p, PH.QUEUE);
      w.setQueuing(p, true);
      w.st.now = w.now;
      w.st.atWalkway(p, s);
      return;
    }
    case PU.FULLSTOP:
      rechoose(w, p);
      return;
    case PU.CLAIM:
      claimCheck(w, p);
      return;
    case PU.EXPLORE:
    case PU.TABLE: {
      const G = w.groupOf(p);
      if (G.mode === GM.RESERVE && p === G.claimer) claimStep(w, p);
      else searchStep(w, p);
      return;
    }
    case PU.SEAT:
      sit(w, p);
      return;
    case PU.TRAY:
      trayArrive(w, p);
      return;
    case PU.EXIT:
      exit(w, p);
      return;
  }
}

// ---------------------------------------------------------------- movement events

/** Kind 3: p finished an edge. */
export function edgeArrive(w: World, p: number): void {
  const n = w.mv.arrive(p);
  const G = w.groupOf(p);
  if (w.phase[p] === PH.CONVOY) {
    followerArrive(w, p);
    return;
  }
  if (G.mode === GM.RESERVE && p === G.claimer) {
    if (w.together) {
      G.history.push(n);
      for (const f of members(G)) if (f !== p && w.phase[f] === PH.CONVOY && w.waitingLeader[f]) followerAdvance(w, f);
    }
    claimObserve(w, p, n);
    return;
  }
  if (w.searching[p]) {
    freeSearchAt(w, p, n);
    return;
  }
  w.onTrip(p);
}

function followerArrive(w: World, f: number): void {
  w.histIdx[f]++;
  followerAdvance(w, f);
}

/** A convoy follower walks the leader's node sequence; caught up, it waits deregistered (ruling 3). */
function followerAdvance(w: World, f: number): void {
  const G = w.groupOf(f);
  const i = w.histIdx[f];
  if (i + 1 >= G.history.length) {
    w.waitingLeader[f] = 1;
    w.mv.stop(f);
    return;
  }
  w.waitingLeader[f] = 0;
  const a = G.history[i], b = G.history[i + 1];
  const e = w.pc.edgeBetween(a, b);
  const dir = w.pc.G.edges[e].a === a ? 1 : -1;
  w.mv.candidate(f, e, dir, w.walk);
}

// ---------------------------------------------------------------- claim search (§5.4)

function claimObserve(w: World, p: number, n: number): void {
  const G = w.groupOf(p);
  const mem = G.mem!;
  if (w.pc.G.nodes[n].intersection) mem.visit(n, w.now);
  observe(mem, w.pc, n, w.now, truthOf(w));
  claimStep(w, p);
}

function stallFor(w: World, m: number): number {
  const c = w.st.chosen[m];
  if (c >= 0) return c;
  if (w.fullStall[m] >= 0) return w.fullStall[m];
  return w.provisional[m];
}

function sumDist(w: World, G: GroupState, a: number): number {
  if (!G.sumCache) G.sumCache = new Int32Array(w.N).fill(-1);
  let v = G.sumCache[a];
  if (v < 0) {
    v = 0;
    for (const m of members(G)) v += w.pc.R.dist(a, w.pc.G.stallNode[stallFor(w, m)]);
    G.sumCache[a] = v;
  }
  return v;
}

function claimStep(w: World, p: number): void {
  const G = w.groupOf(p);
  const mem = G.mem!;
  const n = w.mv.node[p];
  if (G.frozen) {
    const t = G.claimTargetTable;
    if (mem.occMask[t] !== 0 || mem.claimed[t]) {
      fallback(w, G);
      return;
    }
    if (n === G.claimTargetNode) claimCheck(w, p);
    else if (w.target[p] !== G.claimTargetNode) w.setTrip(p, G.claimTargetNode, PU.CLAIM);
    else w.onTrip(p);
    return;
  }
  const tgt = claimTarget(mem, w.pc, n, G.size, (a) => sumDist(w, G, a));
  if (tgt) {
    G.claimTargetTable = tgt.table;
    G.claimTargetNode = tgt.node;
    if (tgt.node === n) claimCheck(w, p);
    else if (w.target[p] !== tgt.node || w.purpose[p] !== PU.CLAIM) w.setTrip(p, tgt.node, PU.CLAIM);
    else w.onTrip(p);
    return;
  }
  G.claimTargetTable = -1;
  G.claimTargetNode = -1;
  const x = exploreTarget(mem, w.pc, n, w.now);
  if (w.target[p] !== x || w.purpose[p] !== PU.EXPLORE) w.setTrip(p, x, PU.EXPLORE);
  else w.onTrip(p);
}

function claimCheck(w: World, p: number): void {
  const G = w.groupOf(p);
  const t = G.claimTargetTable;
  const n = w.mv.node[p];
  if (w.occMask[t] === 0 && w.heldMask[t] === 0 && w.claimedBy[t] < 0) {
    claim(w, G, t, n);
    return;
  }
  G.mem!.learn(t, w.occMask[t], w.heldMask[t], w.claimedBy[t] >= 0, w.now);
  if (G.frozen) fallback(w, G);
  else claimStep(w, p);
}

function claim(w: World, G: GroupState, t: number, n: number): void {
  w.claimedBy[t] = G.g;
  w.claimedFlag[t] = 1;
  w.claimSince[t] = w.now;
  w.complete[t] = 0;
  w.recomputeTable(t);
  G.mode = GM.CLAIMED;
  G.claimed = true;
  G.claimTable = t;
  G.claimEndMs = w.now;
  G.mem = null;
  G.frozen = false;
  G.firstSide = w.pc.G.nodes[n].hLine === w.pc.L.tables[t].row ? 0 : 1;
  G.fill = fillOrder(w.k, G.firstSide);
  G.fillIdx = 0;
  w.trace?.('claim', G.g, t, n);
  const p = G.claimer;
  w.setPhase(p, PH.PLACING);
  w.mv.stop(p);
  w.actionBusy(n, 1);
  w.schedule(w.now + PLACE_MS, K.ACTION, w.pidOf(p), EV.PLACE_END, p);
  // Members already holding food are assigned now, in (service end, person id) order.
  const fed = members(G).filter((m) => w.hasFood[m] && w.seat[m] < 0);
  fed.sort((a, b) => w.st.serviceEndMs[a] - w.st.serviceEndMs[b] || a - b);
  for (const m of fed) {
    assignReserverSeat(w, G, m);
    if (w.phase[m] === PH.WAIT_FOOD) {
      w.setStandingFood(m, false);
      goSeat(w, m);
    }
  }
}

function assignReserverSeat(w: World, G: GroupState, p: number): void {
  const j = G.fill[G.fillIdx++];
  w.holdSeat(G.claimTable * w.k2 + j, p);
}

export function placeEnd(w: World, p: number): void {
  const G = w.groupOf(p);
  w.actionBusy(w.mv.node[p], -1);
  if (w.together) {
    for (const m of members(G)) {
      setClaiming(w, m, false);
      w.waitingLeader[m] = 0;
      goBuy(w, m);
    }
  } else {
    setClaiming(w, p, false);
    goBuy(w, p);
  }
}

export function onCutoff(w: World, g: number): void {
  const G = w.groups[g];
  if (G.mode !== GM.RESERVE) return;
  G.cutoffPassed = true;
  if (G.claimTargetTable >= 0) G.frozen = true;
  else fallback(w, G);
}

function fallback(w: World, G: GroupState): void {
  G.mode = GM.FREE;
  G.fallback = true;
  w.fallbackGroups++;
  G.mem = null;
  G.frozen = false;
  G.claimTargetTable = -1;
  G.claimTargetNode = -1;
  G.claimEndMs = w.now;
  w.trace?.('fallback', G.g, 0, 0);
  if (w.together) {
    for (const m of members(G)) {
      setClaiming(w, m, false);
      w.waitingLeader[m] = 0;
      goBuy(w, m);
    }
  } else {
    setClaiming(w, G.claimer, false);
    goBuy(w, G.claimer);
  }
  let cand = -1;
  for (const m of members(G)) {
    if (!w.hasFood[m]) continue;
    if (cand < 0 || w.st.serviceEndMs[m] < w.st.serviceEndMs[cand]) cand = m;
  }
  if (cand >= 0) {
    makeSearcher(w, G, cand, Math.max(w.st.serviceEndMs[cand], w.now));
    if (w.phase[cand] === PH.WAIT_FOOD) startSearch(w, cand);
    if (w.parallel) {
      for (const m of members(G)) {
        if (m === cand || !w.hasFood[m]) continue;
        G.searchers.push(m);
        if (w.phase[m] === PH.WAIT_FOOD) startSearch(w, m);
      }
    }
  }
}

// ---------------------------------------------------------------- service and food

export function serviceEnd(w: World, p: number): void {
  w.st.now = w.now;
  w.st.serviceEnded(p);
  w.setQueuing(p, false);
  w.hasFood[p] = 1;
  const at = w.st.walkOut(p);
  w.setPhase(p, PH.WALK_OUT);
  w.schedule(at, K.MOVE, w.pidOf(p), EV.WALKOUT_ARRIVE, p);
  const G = w.groupOf(p);
  if (G.walkedAway) return;
  if (G.mode === GM.CLAIMED) {
    assignReserverSeat(w, G, p);
    return;
  }
  if (G.mode === GM.RESERVE || G.committedTable >= 0) return;
  if (G.searcher < 0) makeSearcher(w, G, p, w.now);
  else if (w.parallel) G.searchers.push(p);
}

function makeSearcher(w: World, G: GroupState, p: number, patienceFrom: number): void {
  G.searcher = p;
  G.searchers.push(p);
  G.searcherFoodMs = w.st.serviceEndMs[p];
  G.patienceStamp++;
  w.trace?.('searcher', G.g, p, 0);
  w.schedule(patienceFrom + w.patienceMs, K.TIMER, w.pidOf(G.first), EV.PATIENCE, G.g, G.patienceStamp);
}

/** Kind 3: back at the stall walkway stop holding food. */
export function walkOutArrive(w: World, p: number): void {
  const node = w.pc.G.stallNode[w.st.chosen[p]];
  w.mv.placeAt(p, node);
  const G = w.groupOf(p);
  if (G.walkedAway) goTray(w, p);
  else if (w.seat[p] >= 0) goSeat(w, p);
  else if (G.mode === GM.FREE && G.searchers.includes(p)) startSearch(w, p);
  else {
    w.setPhase(p, PH.WAIT_FOOD);
    w.setStandingFood(p, true);
    w.nodeWaitSince[p] = w.now;
    w.mv.stop(p);
  }
}

// ---------------------------------------------------------------- free-flow search (§5.3, §5.5)

function startSearch(w: World, p: number): void {
  const G = w.groupOf(p);
  if (!G.mem) G.mem = new Memory(w.pc);
  w.setStandingFood(p, false);
  w.setPhase(p, PH.SEARCHING);
  w.setSearching(p, true);
  freeSearchAt(w, p, w.mv.node[p]);
}

function freeSearchAt(w: World, p: number, n: number): void {
  const G = w.groupOf(p);
  const mem = G.mem!;
  if (w.pc.G.nodes[n].intersection) mem.visit(n, w.now);
  observe(mem, w.pc, n, w.now, truthOf(w));
  searchStep(w, p);
}

function searchStep(w: World, p: number): void {
  const G = w.groupOf(p);
  const mem = G.mem!;
  const n = w.mv.node[p];
  const o = { shareMaxParty: w.cfg.reserve.shareMaxParty, shareMinEmpty: w.cfg.reserve.shareMinEmpty, detourMm: w.detourMm };
  let tgt = null;
  if (w.parallel && G.searchers.length > 1) {
    const taken = (t: number) => {
      for (const [q, tt] of G.targetOf) if (q !== p && tt === t) return true;
      return false;
    };
    tgt = freeFlowTarget(mem, w.pc, n, G.size, o, w.now, taken) ?? freeFlowTarget(mem, w.pc, n, G.size, o, w.now);
  } else {
    tgt = freeFlowTarget(mem, w.pc, n, G.size, o, w.now);
  }
  if (tgt) {
    w.setStuck(p, false);
    G.targetOf.set(p, tgt.table);
    w.askTable[p] = tgt.table;
    if (tgt.node === n) {
      arrivalCheck(w, p, tgt.table);
      return;
    }
    if (w.target[p] !== tgt.node || w.purpose[p] !== PU.TABLE) w.setTrip(p, tgt.node, PU.TABLE);
    else w.onTrip(p);
    return;
  }
  G.targetOf.delete(p);
  w.setStuck(p, true);
  const x = exploreTarget(mem, w.pc, n, w.now);
  if (w.target[p] !== x || w.purpose[p] !== PU.EXPLORE) w.setTrip(p, x, PU.EXPLORE);
  else w.onTrip(p);
}

function arrivalCheck(w: World, p: number, t: number): void {
  const G = w.groupOf(p);
  const fc = popcount(w.freeMaskOf(t));
  if (w.claimedBy[t] < 0 && w.occMask[t] === 0) {
    if (fc >= G.size) {
      commit(w, G, p, t, false);
      return;
    }
    G.mem!.learn(t, w.occMask[t], w.heldMask[t], false, w.now);
    searchStep(w, p);
    return;
  }
  // Someone is seated (rule 2), or the table is claimed (rule 3): ask (5 s).
  const n = w.mv.node[p];
  w.setPhase(p, PH.ASKING);
  w.askTable[p] = t;
  w.askAtClaimed[p] = w.claimedBy[t] >= 0 ? 1 : 0;
  w.mv.stop(p);
  w.actionBusy(n, 1);
  G.pendingAsks++;
  w.trace?.('ask', G.g, t, 0);
  w.schedule(w.now + ASK_MS, K.ACTION, w.pidOf(p), EV.ASK_END, p);
}

export function askEnd(w: World, p: number): void {
  const G = w.groupOf(p);
  const n = w.mv.node[p];
  w.actionBusy(n, -1);
  G.pendingAsks--;
  const t = w.askTable[p];
  if (G.committedTable >= 0) {
    goSeat(w, p);
    return;
  }
  const fc = popcount(w.freeMaskOf(t));
  if (w.claimedBy[t] < 0) {
    if (fc >= G.size) {
      commit(w, G, p, t, false);
      return;
    }
    // Rule 3 → table now unclaimed: rule 1's test without a second ask (no refusal). Rule 2: turned away.
    if (w.askAtClaimed[p]) G.mem!.learn(t, w.occMask[t], w.heldMask[t], false, w.now);
    else refuse(w, G, t, false);
  } else {
    const allowed = joinAllowed({ complete: w.complete[t] === 1, n: G.size, shareMaxParty: w.cfg.reserve.shareMaxParty, freeCount: fc, shareMinEmpty: w.cfg.reserve.shareMinEmpty });
    if (allowed) {
      commit(w, G, p, t, true);
      return;
    }
    refuse(w, G, t, true);
  }
  if (G.walkPending) {
    if (G.pendingAsks === 0) walkAway(w, G);
    else w.setPhase(p, PH.SEARCHING);
    return;
  }
  w.setPhase(p, PH.SEARCHING);
  searchStep(w, p);
}

function refuse(w: World, G: GroupState, t: number, atClaimed: boolean): void {
  G.mem!.learn(t, w.occMask[t], w.heldMask[t], w.claimedBy[t] >= 0, w.now);
  G.mem!.refusedUntil[t] = w.now + REFUSE_MS;
  if (atClaimed) w.turnedAwayClaimed++;
  else w.turnedAwayHeld++;
  w.trace?.('refuse', G.g, t, atClaimed ? 1 : 0);
}

function commit(w: World, G: GroupState, p: number, t: number, join: boolean): void {
  const n = w.mv.node[p];
  const free = w.freeMaskOf(t);
  let here = 0;
  for (let j = 0; j < w.k2; j++) if (w.pc.G.seatNode[t * w.k2 + j] === n) here |= 1 << j;
  const set = join ? chooseJoin(w.k, free, w.occMask[t] | w.heldMask[t], G.size, here) : chooseUnclaimed(w.k, free, G.size, here);
  const own = ownSeat(set, here);
  G.committedTable = t;
  G.commitMs = w.now;
  G.walkPending = false;
  G.patienceStamp++;
  const rest = set.filter((j) => j !== own);
  let ri = 0;
  for (const m of members(G)) w.holdSeat(t * w.k2 + (m === p ? own : rest[ri++]), m);
  for (const s of G.searchers) {
    w.setSearching(s, false);
    w.setStuck(s, false);
  }
  G.searchers = [];
  G.targetOf.clear();
  G.mem = null;
  w.trace?.('commit', G.g, t, join ? 1 : 0);
  for (const m of members(G)) {
    if (m === p) goSeat(w, m);
    else if (w.phase[m] === PH.WAIT_FOOD) {
      w.setStandingFood(m, false);
      goSeat(w, m);
    } else if (w.phase[m] === PH.SEARCHING) goSeat(w, m);
  }
}

// ---------------------------------------------------------------- walk-aways (§5.7)

export function onPatience(w: World, g: number, stamp: number): void {
  const G = w.groups[g];
  if (stamp !== G.patienceStamp || G.committedTable >= 0 || G.walkedAway || G.mode !== GM.FREE) return;
  if (G.pendingAsks > 0) G.walkPending = true;
  else walkAway(w, G);
}

function walkAway(w: World, G: GroupState): void {
  G.walkedAway = true;
  G.walkAwayMs = w.now;
  G.walkPending = false;
  w.walkAwayPeople += G.size;
  G.splitFeasible = w.clock.totals[SEAT.FREE] >= G.size;
  for (const s of G.searchers) {
    w.setSearching(s, false);
    w.setStuck(s, false);
  }
  G.searchers = [];
  G.targetOf.clear();
  G.mem = null;
  w.trace?.('walkaway', G.g, 0, 0);
  for (const m of members(G)) {
    w.outcomeSumMs += w.now - w.entranceMs[m];
    w.outcomeEntranceSum += w.entranceMs[m];
    w.outcomeCount++;
    if (!w.hasFood[m] || w.phase[m] === PH.WALK_OUT) continue;
    w.setStandingFood(m, false);
    goTray(w, m);
  }
}

// ---------------------------------------------------------------- seats, eating, trays, exit

function goSeat(w: World, p: number): void {
  w.setPhase(p, PH.TO_SEAT);
  w.setTrip(p, w.pc.G.seatNode[w.seat[p]], PU.SEAT);
}

function sit(w: World, p: number): void {
  const s = w.seat[p];
  const t = w.tableOfSeat(s);
  const n = w.mv.node[p];
  const G = w.groupOf(p);
  w.mv.stop(p);
  w.setPhase(p, PH.SITTING);
  w.actionBusy(n, 1);
  w.occMask[t] |= 1 << (s - t * w.k2);
  w.heldMask[t] &= ~(1 << (s - t * w.k2));
  w.sitStartMs[p] = w.now;
  w.clock.sitStart();
  w.sitTimes.push(w.now);
  while (w.now - w.sitTimes[w.sitWinLeft] >= 3_600_000) w.sitWinLeft++;
  w.sitWinMax = Math.max(w.sitWinMax, w.sitTimes.length - w.sitWinLeft);
  w.outcomeSumMs += w.now - w.entranceMs[p];
  w.outcomeEntranceSum += w.entranceMs[p];
  w.outcomeCount++;
  G.sitStarted++;
  if (G.claimed && G.claimTable === t && G.sitStarted === G.size) w.complete[t] = 1;
  w.recomputeTable(t);
  w.schedule(w.now + SIT_MS, K.ACTION, w.pidOf(p), EV.SIT_END, p);
}

export function sitEnd(w: World, p: number): void {
  w.actionBusy(w.mv.node[p], -1);
  w.setPhase(p, PH.EATING);
  w.schedule(w.now + w.pop.eatMs[p], K.TIMER, w.pidOf(p), EV.EAT_END, p);
}

export function eatEnd(w: World, p: number): void {
  const G = w.groupOf(p);
  G.eatDone++;
  if (G.eatDone === G.size) w.schedule(w.now + w.lingerMs, K.TIMER, w.pidOf(G.first), EV.STAND_START, G.g);
}

export function standStart(w: World, g: number): void {
  const G = w.groups[g];
  G.standLeft = G.size;
  for (const p of members(G)) {
    w.setPhase(p, PH.STANDING);
    w.standMs[p] = w.now;
    w.actionBusy(w.mv.node[p], 1);
    w.schedule(w.now + STAND_MS, K.ACTION, w.pidOf(p), EV.STAND_END, p);
  }
}

export function standEnd(w: World, p: number): void {
  const G = w.groupOf(p);
  const s = w.seat[p];
  const t = w.tableOfSeat(s);
  w.actionBusy(w.mv.node[p], -1);
  w.occMask[t] &= ~(1 << (s - t * w.k2));
  w.seatGroup[s] = -1;
  w.seatPerson[s] = -1;
  G.standLeft--;
  if (G.claimed && G.standLeft === 0 && w.claimedBy[t] === G.g) {
    w.claimedBy[t] = -1;
    w.claimedFlag[t] = 0;
    w.complete[t] = 0;
    w.claimSince[t] = -1;
  }
  w.recomputeTable(t);
  w.usedTray[p] = 1;
  goTray(w, p);
}

function goTray(w: World, p: number): void {
  w.setPhase(p, PH.TO_TRAY);
  w.setTrip(p, w.pc.G.trayNode, PU.TRAY);
}

function trayArrive(w: World, p: number): void {
  w.mv.stop(p);
  if (w.trayBusy < w.traySlots) startDrop(w, p);
  else {
    w.trayFifo.push(p);
    w.setPhase(p, PH.TRAY_WAIT);
    w.nodeWaitSince[p] = w.now;
    if (w.hasFood[p]) w.setStandingFood(p, true);
  }
}

function startDrop(w: World, p: number): void {
  w.trayBusy++;
  w.setStandingFood(p, false);
  w.setPhase(p, PH.DROPPING);
  w.schedule(w.now + w.dropMs, K.ACTION, w.pidOf(p), EV.DROP_END, p);
}

export function dropEnd(w: World, p: number): void {
  w.trayBusy--;
  w.hasFood[p] = 0;
  w.usedTray[p] = 0;
  w.dropEndMs[p] = w.now;
  const next = w.trayFifo.shift();
  if (next !== undefined) startDrop(w, next);
  w.setPhase(p, PH.TO_EXIT);
  w.setTrip(p, w.pc.G.exitNode, PU.EXIT);
}

function exit(w: World, p: number): void {
  w.mv.leave(p);
  w.setPhase(p, PH.EXITED);
  w.exitMs[p] = w.now;
  w.exited++;
  if (w.exited === w.pop.personCount) w.done = true;
}
