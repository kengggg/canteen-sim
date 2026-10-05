import { popcount, chooseJoin, chooseUnclaimed, fillOrder, joinAllowed, ownSeat } from './seating';
import { Memory, claimTarget, exploreTarget, freeFlowTarget, observe, splitTarget, type TableTruth } from './search';
import { LEAVE_NOW } from './stalls';
import { ASK_MS, EV, GM, K, LEFT, PH, PICKUP_MS, PLACE_MS, PU, RECHOOSE_MS, REFUSE_MS, SIT_MS, STAND_MS } from './types';
import type { GroupState, World } from './world';

/** Group and person behaviour (spec §5). Every function runs inside one event at w.now. */

const truthOf = (w: World): TableTruth => ({ occMask: w.occMask, heldMask: w.heldMask, claimed: w.claimedFlag });

export function install(w: World): void {
  w.onReach = onReach;
  w.onDeferredLeave = leaveQueue;
}

// ---------------------------------------------------------------- leaving before food (design §2.2–2.4)

/**
 * The door check (design §2.2): 1 when even the shortest queue looks longer than the group's wait limit, 2 when fewer
 * tables look like a fit than its room needed, 3 when both fail, 0 when the group stays.
 */
export function doorVerdict(a: { minQueueMs: number; waitLimitMs: number; fitTables: number; roomNeeded: number }): number {
  const queue = a.minQueueMs > a.waitLimitMs;
  const seating = a.roomNeeded > 0 && a.fitTables < a.roomNeeded;
  return queue ? (seating ? LEFT.DOOR_BOTH : LEFT.DOOR_QUEUE) : seating ? LEFT.DOOR_SEATING : LEFT.NONE;
}

/** Unclaimed tables with at least n seats nobody sits on (a full scan; the engine keeps World.fitCount instead). */
export function fitTables(occMask: Int32Array, claimedBy: Int32Array, k2: number, n: number): number {
  let c = 0;
  for (let t = 0; t < occMask.length; t++) if (claimedBy[t] < 0 && k2 - popcount(occMask[t]) >= n) c++;
  return c;
}

function doorCheck(w: World, G: GroupState): number {
  let minQ = Infinity;
  for (let s = 0; s < w.st.S; s++) {
    const q = w.st.queueLength[s] * w.serviceMeanMs;
    if (q < minQ) minQ = q;
  }
  return doorVerdict({ minQueueMs: minQ, waitLimitMs: w.pop.waitLimitMs[G.g], fitTables: w.fitTablesFor(G.size), roomNeeded: w.pop.roomNeeded[G.g] });
}

/** The whole group turns round at the entrance and walks to the exit. */
function leaveAtDoor(w: World, G: GroupState, kind: number): void {
  const out = members(G).slice();
  G.people = [];
  G.size = 0;
  for (const p of out) {
    w.leftKind[p] = kind;
    w.leftMs[p] = w.now;
    w.leftPeople++;
    w.leftDoor[kind - 1]++;
    w.setPhase(p, PH.TO_EXIT);
    w.setTrip(p, w.pc.G.exitNode, PU.EXIT);
  }
}

/** First arrival at a stall walkway stop: the queue clock starts and the wait-limit timer is set (design §2.3). */
function startQueueClock(w: World, p: number): void {
  if (w.queueStartMs[p] >= 0) return;
  w.queueStartMs[p] = w.now;
  w.schedule(w.now + w.pop.waitLimitMs[w.pop.group[p]], K.TIMER, w.pidOf(p), EV.QUEUE_LEAVE, p);
}

export function onQueueLeaveTimer(w: World, p: number): void {
  if (w.leftKind[p] !== 0 || w.st.serviceStartMs[p] >= 0) return;
  switch (w.phase[p]) {
    case PH.QUEUE:
      w.st.now = w.now;
      if (w.st.requestLeave(p) === LEAVE_NOW) leaveQueue(w, p);
      return;
    case PH.FULL_WAIT:
      memberLeaves(w, p);
      goOut(w, p);
      return;
    case PH.TO_STALL:
      w.st.releaseChoice(p);
      memberLeaves(w, p);
      goOut(w, p);
      return;
    case PH.TO_FULLSTOP:
      memberLeaves(w, p);
      goOut(w, p);
      return;
  }
}

/** p has left its slot (now, or at the end of a deferred walk-in or move-up): walk back to the walkway stop. */
function leaveQueue(w: World, p: number): void {
  memberLeaves(w, p);
  const at = w.st.walkBack(p);
  w.setPhase(p, PH.LEAVE_WALK);
  w.schedule(at, K.MOVE, w.pidOf(p), EV.LEAVE_ARRIVE, p);
}

/** Kind 3: a queue leaver is back at the walkway stop. */
export function leaveArrive(w: World, p: number): void {
  w.mv.placeAt(p, w.pc.G.stallNode[w.st.chosen[p]]);
  goOut(w, p);
}

/** A leaver walks to the exit, or first back to its group's object. */
function goOut(w: World, p: number): void {
  if (w.collecting[p]) {
    w.setPhase(p, PH.TO_OBJECT);
    w.setTrip(p, w.originOf(p).claimNode, PU.OBJECT);
  } else {
    w.setPhase(p, PH.TO_EXIT);
    w.setTrip(p, w.pc.G.exitNode, PU.EXIT);
  }
}

/** p gives up in a queue: it leaves its party alone; the rest carry on (design §2.3, §2.4). */
function memberLeaves(w: World, p: number): void {
  const G = w.groupOf(p);
  w.leftKind[p] = LEFT.QUEUE;
  w.leftMs[p] = w.now;
  w.leftPeople++;
  w.leftQueue++;
  w.setQueuing(p, false);
  const s = w.seat[p];
  if (s >= 0) {
    const t = w.tableOfSeat(s);
    w.heldMask[t] &= ~(1 << (s - t * w.k2));
    w.seatGroup[s] = -1;
    w.seatPerson[s] = -1;
    w.seat[p] = -1;
    w.recomputeTable(t);
  }
  G.people = G.people.filter((x) => x !== p);
  G.size = G.people.length;
  if (G.size > 0) G.first = G.people[0];
  G.sumCache = null;
  w.trace?.('qleave', G.party, p, 0);
  if (G.mode === GM.CLAIMED) {
    const t = G.claimTable;
    if (G.size === 0) {
      w.collecting[p] = 1;
      w.trace?.('collect', G.g, t, p);
    } else if (G.sitStarted === G.size && w.complete[t] === 0) {
      w.complete[t] = 1;
      w.recomputeTable(t);
    }
  }
  if (G.size > 0 && G.eatDone > 0 && G.eatDone === G.size) {
    w.schedule(Math.max(w.now, G.maxEatEndMs + w.lingerMs), K.TIMER, w.pidOf(G.people[0]), EV.STAND_START, G.party);
  }
  if (G.mode === GM.FREE && G.committedTable < 0) {
    for (const q of G.searchers.slice()) {
      if (G.committedTable >= 0) break;
      if (w.groupOf(q) !== G || !w.searching[q] || w.phase[q] !== PH.SEARCHING || w.mv.edge[q] >= 0 || w.mv.node[q] < 0) continue;
      searchStep(w, q);
    }
  }
}

function startPickup(w: World, p: number): void {
  const G = w.originOf(p);
  w.mv.stop(p);
  w.setPhase(p, PH.COLLECTING);
  w.actionBusy(w.mv.node[p], 1);
  w.trace?.('pickup', G.g, G.claimTable, p);
  w.schedule(w.now + PICKUP_MS, K.ACTION, w.pidOf(p), EV.PICKUP_END, p);
}

/** Kind 1: the object is picked up; the table becomes ordinary and the collector walks out. */
export function pickupEnd(w: World, p: number): void {
  const G = w.originOf(p);
  const t = G.claimTable;
  w.actionBusy(w.mv.node[p], -1);
  w.claimedBy[t] = -1;
  w.claimedFlag[t] = 0;
  w.complete[t] = 0;
  w.claimSince[t] = -1;
  w.recomputeTable(t);
  w.objectsCollected++;
  w.collecting[p] = 0;
  w.trace?.('unclaim', G.g, t, 0);
  w.setPhase(p, PH.TO_EXIT);
  w.setTrip(p, w.pc.G.exitNode, PU.EXIT);
}

/** The party's active members (a live array: callers that remove members iterate over a copy). */
function members(G: GroupState): number[] {
  return G.people;
}

// ---------------------------------------------------------------- arrival and buying

export function groupArrive(w: World, g: number): void {
  const G = w.groups[g];
  const entrance = w.pc.G.entranceNode;
  w.arrived += G.size;
  for (const p of members(G)) {
    w.entranceMs[p] = w.now;
    w.mv.placeAt(p, entrance);
  }
  const kind = doorCheck(w, G);
  w.trace?.('door', g, kind, 0);
  if (kind !== LEFT.NONE) {
    leaveAtDoor(w, G, kind);
    return;
  }
  if (!G.reserver) {
    for (const p of members(G)) goBuy(w, p);
    w.trace?.('arrive', g, 0, 0);
    return;
  }
  G.mode = GM.RESERVE;
  G.claimer = G.people[0];
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
  if (w.claimLimitMs === 0) {
    // Limit 0 (spec §5.4 point 8): only tables seen at the entrance at the entry ms; none empty → fall back at once,
    // before the claimer takes a step.
    const mem = G.mem!;
    if (w.pc.G.nodes[entrance].intersection) mem.visit(entrance, w.now);
    observe(mem, w.claimObservation, entrance, w.now, truthOf(w));
    const tgt = claimTarget(mem, w.pc, entrance, G.size, (a) => sumDist(w, G, a));
    if (!tgt) {
      fallback(w, G, 1);
      w.trace?.('arrive', g, 0, 0);
      return;
    }
  }
  w.schedule(w.now + w.claimLimitMs, K.TIMER, w.pidOf(G.people[0]), EV.CUTOFF, G.party);
  claimObserve(w, G.claimer, entrance);
  w.trace?.('arrive', g, 0, 0);
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
      startQueueClock(w, p);
      w.mv.leave(p);
      w.setPhase(p, PH.QUEUE);
      w.setQueuing(p, true);
      w.st.now = w.now;
      w.st.atWalkway(p, s);
      return;
    }
    case PU.FULLSTOP:
      startQueueClock(w, p);
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
    case PU.OBJECT:
      startPickup(w, p);
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
      w.trace?.('lead', G.g, n, 0);
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
  w.trace?.('follow', w.pop.group[f], f, w.mv.node[f]);
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
  observe(mem, w.claimObservation, n, w.now, truthOf(w));
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
      fallback(w, G, 2);
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
  if (G.frozen) fallback(w, G, 3);
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
  G.claimNode = n;
  G.claimEndMs = w.now;
  G.mem = null;
  G.frozen = false;
  G.firstSide = w.pc.G.nodes[n].hLine === w.pc.L.tables[t].row ? 0 : 1;
  G.fill = fillOrder(w.k, G.firstSide);
  G.fillIdx = 0;
  const p = G.claimer;
  w.setPhase(p, PH.PLACING);
  w.mv.stop(p);
  w.actionBusy(n, 1);
  w.schedule(w.now + PLACE_MS, K.ACTION, w.pidOf(p), EV.PLACE_END, p);
  // Members already holding food are assigned now, in (service end, person id) order.
  const fed = members(G).filter((m) => w.hasFood[m] && w.seat[m] < 0);
  fed.sort((a, b) => w.st.serviceEndMs[a] - w.st.serviceEndMs[b] || a - b);
  for (const m of fed) assignReserverSeat(w, G, m);
  w.trace?.('claim', G.g, t, n);
  for (const m of fed) {
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
  w.trace?.('placeEnd', G.g, G.claimTable, w.mv.node[p]);
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

export function onCutoff(w: World, party: number): void {
  const G = w.parties[party];
  if (G.mode !== GM.RESERVE) return;
  G.cutoffPassed = true;
  if (G.claimTargetTable >= 0) G.frozen = true;
  else fallback(w, G, 1);
}

/** Reasons: 1 no target at the cutoff, 2 frozen target seen taken, 3 frozen target taken on arrival. */
function fallback(w: World, G: GroupState, reason: number): void {
  G.mode = GM.FREE;
  G.fallback = true;
  w.fallbackGroups++;
  G.mem = null;
  G.frozen = false;
  G.claimTargetTable = -1;
  G.claimTargetNode = -1;
  G.claimEndMs = w.now;
  w.trace?.('fallback', G.g, reason, 0);
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
  w.servedCount++;
  w.pendingSeSum += w.now;
  const at = w.st.walkOut(p);
  w.setPhase(p, PH.WALK_OUT);
  w.schedule(at, K.MOVE, w.pidOf(p), EV.WALKOUT_ARRIVE, p);
  const G = w.groupOf(p);
  if (G.mode === GM.CLAIMED) assignReserverSeat(w, G, p);
  else if (G.mode === GM.FREE && G.committedTable < 0) {
    if (G.searcher < 0) makeSearcher(w, G, p, w.now);
    else if (w.parallel) G.searchers.push(p);
  }
  if (w.seat[p] < 0) {
    w.plateNoSeat[p] = 1;
    w.platesNoSeat++;
    if (w.platesNoSeat > w.platesNoSeatMax) w.platesNoSeatMax = w.platesNoSeat;
  }
}

/** p becomes G's searcher; the split clock starts at `from` (design §2.6). */
function makeSearcher(w: World, G: GroupState, p: number, from: number): void {
  G.searcher = p;
  G.searchers.push(p);
  G.searcherFoodMs = w.st.serviceEndMs[p];
  if (G.origin.searcherFoodMs < 0) G.origin.searcherFoodMs = G.searcherFoodMs;
  G.searchStartMs = from;
  w.trace?.('searcher', G.party, p, 0);
  if (G.splitMode) return;
  if (w.splitAfterMs === 0) {
    enterSplitMode(w, G);
    return;
  }
  G.splitStamp++;
  w.schedule(from + w.splitAfterMs, K.TIMER, w.pidOf(G.people[0]), EV.SPLIT, G.party, G.splitStamp);
}

export function onSplitTimer(w: World, party: number, stamp: number): void {
  const G = w.parties[party];
  if (stamp !== G.splitStamp || G.splitMode || G.committedTable >= 0 || G.mode !== GM.FREE) return;
  enterSplitMode(w, G);
}

/** The party now accepts a table that seats only some of it; searchers standing at a node re-target at once. */
function enterSplitMode(w: World, G: GroupState): void {
  G.splitMode = true;
  w.trace?.('splitmode', G.g, G.party, 0);
  for (const s of G.searchers.slice()) {
    if (G.committedTable >= 0) break;
    if (w.groupOf(s) !== G || !w.searching[s] || w.phase[s] !== PH.SEARCHING || w.mv.edge[s] >= 0 || w.mv.node[s] < 0) continue;
    searchStep(w, s);
  }
}

/** Kind 3: back at the stall walkway stop holding food. */
export function walkOutArrive(w: World, p: number): void {
  const node = w.pc.G.stallNode[w.st.chosen[p]];
  w.mv.placeAt(p, node);
  const G = w.groupOf(p);
  if (w.seat[p] >= 0) goSeat(w, p);
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
  observe(mem, w.foodObservation, n, w.now, truthOf(w));
  searchStep(w, p);
}

function searchStep(w: World, p: number): void {
  const G = w.groupOf(p);
  const mem = G.mem!;
  const n = w.mv.node[p];
  const o = { shareMaxParty: w.cfg.reserve.shareMaxParty, shareMinEmpty: w.cfg.reserve.shareMinEmpty, detourMm: w.detourMm };
  const find = (ex?: (t: number) => boolean) => (G.splitMode ? splitTarget(mem, w.pc, n, G.size, o, w.now, ex) : freeFlowTarget(mem, w.pc, n, G.size, o, w.now, ex));
  let tgt = null;
  if (w.parallel && G.searchers.length > 1) {
    const taken = (t: number) => {
      for (const [q, tt] of G.targetOf) if (q !== p && tt === t) return true;
      return false;
    };
    tgt = find(taken) ?? find();
  } else {
    tgt = find();
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

/** Seats a party needs at one unclaimed table: all of it, or in split mode min(n, 2) (design §2.6). */
function seatsNeeded(G: GroupState): number {
  return G.splitMode ? Math.min(G.size, 2) : G.size;
}

function arrivalCheck(w: World, p: number, t: number): void {
  const G = w.groupOf(p);
  const fc = popcount(w.freeMaskOf(t));
  if (w.claimedBy[t] < 0 && w.occMask[t] === 0) {
    if (fc >= seatsNeeded(G)) {
      commit(w, G, p, t, false, Math.min(G.size, fc));
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
  w.trace?.('ask', G.party, t, 0);
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
    if (fc >= seatsNeeded(G)) {
      commit(w, G, p, t, false, Math.min(G.size, fc));
      return;
    }
    // Rule 3 → table now unclaimed: rule 1's test without a second ask (no refusal). Rule 2: turned away.
    if (w.askAtClaimed[p]) G.mem!.learn(t, w.occMask[t], w.heldMask[t], false, w.now);
    else refuse(w, G, t, false);
  } else {
    const m = G.splitMode ? Math.min(G.size, w.cfg.reserve.shareMaxParty) : G.size;
    const allowed = joinAllowed({ complete: w.complete[t] === 1, n: m, shareMaxParty: w.cfg.reserve.shareMaxParty, freeCount: fc, shareMinEmpty: w.cfg.reserve.shareMinEmpty });
    if (allowed) {
      commit(w, G, p, t, true, m);
      return;
    }
    refuse(w, G, t, true);
  }
  w.setPhase(p, PH.SEARCHING);
  searchStep(w, p);
}

function refuse(w: World, G: GroupState, t: number, atClaimed: boolean): void {
  G.mem!.learn(t, w.occMask[t], w.heldMask[t], w.claimedBy[t] >= 0, w.now);
  G.mem!.refusedUntil[t] = w.now + REFUSE_MS;
  if (atClaimed) w.turnedAwayClaimed++;
  else w.turnedAwayHeld++;
  w.trace?.('refuse', G.party, t, atClaimed ? 1 : 0);
}

/** Commit m seats at table t for p's party; with m < party size the party splits first (design §2.6). */
function commit(w: World, G: GroupState, p: number, t: number, join: boolean, m: number): void {
  const n = w.mv.node[p];
  const free = w.freeMaskOf(t);
  let here = 0;
  for (let j = 0; j < w.k2; j++) if (w.pc.G.seatNode[t * w.k2 + j] === n) here |= 1 << j;
  const rem = m < G.size ? splitOff(w, G, p, m, t) : null;
  const set = join ? chooseJoin(w.k, free, w.occMask[t] | w.heldMask[t], m, here) : chooseUnclaimed(w.k, free, m, here);
  const own = ownSeat(set, here);
  G.committedTable = t;
  if (join) G.joinedTable = t;
  G.commitMs = w.now;
  G.origin.lastCommitMs = w.now;
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
  w.trace?.('commit', G.party, t, join ? 1 : 0);
  for (const m of members(G)) {
    if (m === p) goSeat(w, m);
    else if (w.phase[m] === PH.WAIT_FOOD) {
      w.setStandingFood(m, false);
      goSeat(w, m);
    } else if (w.phase[m] === PH.SEARCHING) goSeat(w, m);
  }
  if (rem) startRemainder(w, G, rem);
}

/**
 * Split p's party at a partial commit of m seats: the searcher, then members holding food (by service end, then
 * index), then members without food (by index) stay; the others become a new party already in split mode.
 */
function splitOff(w: World, G: GroupState, p: number, m: number, t: number): GroupState {
  const se = w.st.serviceEndMs;
  const fed = G.people.filter((x) => x !== p && w.hasFood[x]).sort((a, b) => se[a] - se[b] || a - b);
  const hungry = G.people.filter((x) => x !== p && !w.hasFood[x]);
  const keep = new Set([p, ...fed, ...hungry].slice(0, m));
  const rem = G.people.filter((x) => !keep.has(x));
  G.origin.splits++;
  w.trace?.('split', G.party, t, m);
  const R = w.addParty(G, rem);
  R.splitMode = true;
  const moving = G.searchers.filter((s) => w.partyOf[s] === R.party);
  if (moving.length > 0) {
    G.searchers = G.searchers.filter((s) => w.partyOf[s] === G.party);
    R.searchers = moving;
    R.searcher = moving[0];
    R.mem = G.mem;
    for (const s of moving) {
      const tt = G.targetOf.get(s);
      if (tt !== undefined) {
        R.targetOf.set(s, tt);
        G.targetOf.delete(s);
      }
    }
    const asks = moving.filter((s) => w.phase[s] === PH.ASKING).length;
    R.pendingAsks = asks;
    G.pendingAsks -= asks;
    R.searcherFoodMs = se[moving[0]];
    for (const s of moving) if (se[s] < R.searcherFoodMs) R.searcherFoodMs = se[s];
    R.searchStartMs = w.now;
  }
  return R;
}

/** After the committing part holds its seats: give the remainder a searcher if one of it already holds food. */
function startRemainder(w: World, G: GroupState, R: GroupState): void {
  w.trace?.('remainder', G.party, R.party, R.size);
  if (R.searchers.length > 0) return;
  const se = w.st.serviceEndMs;
  let cand = -1;
  for (const x of R.people) if (w.hasFood[x] && (cand < 0 || se[x] < se[cand])) cand = x;
  if (cand < 0) return;
  makeSearcher(w, R, cand, w.now);
  if (w.phase[cand] === PH.WAIT_FOOD) startSearch(w, cand);
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
  w.seatedE2sSum += w.now - w.entranceMs[p];
  w.seatedPlateSum += w.now - w.st.serviceEndMs[p];
  w.pendingSeSum -= w.st.serviceEndMs[p];
  G.sitStarted++;
  if (G.claimed && G.claimTable === t && G.sitStarted === G.size) w.complete[t] = 1;
  w.recomputeTable(t);
  w.trace?.('sit', G.party, s, 0);
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
  G.maxEatEndMs = w.now;
  if (G.eatDone === G.size) w.schedule(w.now + w.lingerMs, K.TIMER, w.pidOf(G.people[0]), EV.STAND_START, G.party);
}

export function standStart(w: World, party: number): void {
  const G = w.parties[party];
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
    w.recomputeTable(t);
    w.trace?.('unclaim', G.g, t, 0);
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
