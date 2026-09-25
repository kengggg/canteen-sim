import type { NavGraph } from './navgraph';

/**
 * Mesoscopic movement (spec §4.2): agents traverse edges; every entry happens in a kind-6 admission step.
 *
 * Edge-direction index: ed = edge·2 + (dir > 0 ? 0 : 1), where dir = +1 walks a → b.
 * Rulings: a head blocked only by the 1-lane rule does not block registered agents behind it; a formed batch with no
 * remaining waiting member is re-formed.
 */
export interface MoveHost {
  scheduleArrival(p: number, ms: number): void;
  requestAdmit(): void;
  onAdmit?(p: number, ms: number): void;
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);
const HEADWAY_MM = 600;

const OK = 0;
const RULE3 = 1;
const BLOCKED = 2;

export class Movement {
  now = 0;
  onEdgeCount = 0;

  // Per person.
  readonly node: Int32Array;
  readonly edge: Int32Array;
  readonly dir: Int8Array;
  readonly entryMs: Float64Array;
  readonly exitMs: Float64Array;
  readonly speed: Int32Array;
  readonly regLink: Int32Array;
  readonly regDir: Int8Array;
  readonly wantEd: Int32Array;
  readonly waitStart: Float64Array;
  readonly fresh: Uint8Array;
  readonly waiter: Uint8Array; // counted in `waiters` for its link and direction
  readonly batchLink: Int32Array;
  readonly batchEpochOf: Int32Array;
  readonly leader: Int32Array;

  // Per edge-direction.
  readonly fifo: number[][];
  readonly occ: Int32Array;
  readonly lastExit: Float64Array;
  readonly lastEntrant: Int32Array;
  private readonly dirtyFlag: Uint8Array;
  private dirtyList: number[] = [];

  // Per link (only 1-lane links use registration and batches).
  readonly regCount: Int32Array; // link·2 + dirBit
  readonly waiters: Int32Array; // link·2 + dirBit
  readonly batchState: Uint8Array; // 0 none, 1 formed (unused), 2 used since formation
  readonly batchDir: Int8Array;
  readonly batchEpoch: Int32Array;
  readonly batchWaiting: Int32Array;

  // Per node.
  readonly busyCount: Int32Array;

  private pendingFresh: number[] = [];
  private readonly edgeLink: Int32Array;
  private readonly linkOneLane: Uint8Array;

  constructor(private readonly G: NavGraph, personCount: number, private readonly host: MoveHost) {
    const P = personCount;
    this.node = new Int32Array(P).fill(-1);
    this.edge = new Int32Array(P).fill(-1);
    this.dir = new Int8Array(P);
    this.entryMs = new Float64Array(P);
    this.exitMs = new Float64Array(P);
    this.speed = new Int32Array(P);
    this.regLink = new Int32Array(P).fill(-1);
    this.regDir = new Int8Array(P);
    this.wantEd = new Int32Array(P).fill(-1);
    this.waitStart = new Float64Array(P);
    this.fresh = new Uint8Array(P);
    this.waiter = new Uint8Array(P);
    this.batchLink = new Int32Array(P).fill(-1);
    this.batchEpochOf = new Int32Array(P);
    this.leader = new Int32Array(P).fill(-1);
    const E = G.edges.length;
    this.fifo = Array.from({ length: 2 * E }, () => []);
    this.occ = new Int32Array(2 * E);
    this.lastExit = new Float64Array(2 * E).fill(-Infinity);
    this.lastEntrant = new Int32Array(2 * E).fill(-1);
    this.dirtyFlag = new Uint8Array(2 * E);
    const Lk = G.links.length;
    this.regCount = new Int32Array(2 * Lk);
    this.waiters = new Int32Array(2 * Lk);
    this.batchState = new Uint8Array(Lk);
    this.batchDir = new Int8Array(Lk);
    this.batchEpoch = new Int32Array(Lk);
    this.batchWaiting = new Int32Array(Lk);
    this.busyCount = new Int32Array(G.nodes.length);
    this.edgeLink = Int32Array.from(G.edges.map((e) => e.link));
    this.linkOneLane = Uint8Array.from(G.links.map((l) => (l.lanes === 1 ? 1 : 0)));
  }

  // ---------------------------------------------------------------- queries

  /** Direction of link L: +1, −1, or 0 when nobody is registered. */
  linkDir(L: number): number {
    if (this.regCount[2 * L] > 0) return 1;
    if (this.regCount[2 * L + 1] > 0) return -1;
    return 0;
  }

  isWaiting(p: number): boolean {
    return this.wantEd[p] >= 0 && this.fresh[p] === 0;
  }

  /** Position of p in its FIFO (0 = head), or −1. */
  waitRank(p: number): number {
    const ed = this.wantEd[p];
    return ed < 0 ? -1 : this.fifo[ed].indexOf(p);
  }

  /** Diagnostic for the starvation bound: registered agents on p's wanted link plus earlier waiters for it. */
  linkLoadAhead(p: number): number {
    const ed = this.wantEd[p];
    if (ed < 0) return 0;
    const L = this.edgeLink[ed >> 1];
    let w = this.regCount[2 * L] + this.regCount[2 * L + 1];
    for (const e of this.G.links[L].edges) {
      for (const d of [0, 1]) {
        for (const q of this.fifo[2 * e + d]) {
          if (q === p || this.fresh[q]) continue;
          if (this.waitStart[q] < this.waitStart[p] || (this.waitStart[q] === this.waitStart[p] && q < p)) w++;
        }
      }
    }
    return w;
  }

  /** Liveness diagnostic: FIFO heads that could enter now (after a kind-6 step this must be 0). */
  admissibleHeads(): number {
    let n = 0;
    for (let ed = 0; ed < this.fifo.length; ed++) {
      const f = this.fifo[ed];
      if (f.length > 0 && this.check(f[0], ed) === OK) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- agent operations

  placeAt(p: number, node: number): void {
    this.node[p] = node;
    this.edge[p] = -1;
  }

  /** p, standing at its node, wants edge e in direction dir. Handles U-turn deregistration. */
  candidate(p: number, e: number, dir: number, speedMmS: number): void {
    this.withdraw(p);
    const L = this.edgeLink[e];
    if (this.regLink[p] >= 0 && (this.regLink[p] !== L || this.regDir[p] !== dir)) this.deregister(p);
    this.wantEd[p] = 2 * e + (dir > 0 ? 0 : 1);
    this.speed[p] = speedMmS;
    this.fresh[p] = 1;
    this.waitStart[p] = this.now;
    this.pendingFresh.push(p);
    this.host.requestAdmit();
  }

  /** Drop p's pending candidacy or FIFO place. */
  withdraw(p: number): void {
    const ed = this.wantEd[p];
    if (ed < 0) return;
    if (this.fresh[p]) {
      const i = this.pendingFresh.indexOf(p);
      if (i >= 0) this.pendingFresh.splice(i, 1);
      else this.removeFromFifo(p, ed);
    } else {
      this.removeFromFifo(p, ed);
    }
    const wasWaiter = this.waiter[p] === 1;
    this.clearWaiter(p, ed);
    this.wantEd[p] = -1;
    this.fresh[p] = 0;
    if (wasWaiter) {
      // Fewer opposite waiters (or a stale batch) can unblock heads anywhere on this link.
      this.markLinkDirty(this.edgeLink[ed >> 1]);
      this.host.requestAdmit();
    }
  }

  private markLinkDirty(L: number): void {
    for (const e of this.G.links[L].edges) {
      this.markDirty(2 * e);
      this.markDirty(2 * e + 1);
    }
  }

  /** p stops at its node to act or wait (spec §4.2 rule 3: leaves its link). */
  stop(p: number): void {
    this.withdraw(p);
    this.deregister(p);
  }

  /** p leaves the graph (queue area, exit). */
  leave(p: number): void {
    this.stop(p);
    this.node[p] = -1;
  }

  /** Kind 3: p reaches the far node of its edge. Returns that node. */
  arrive(p: number): number {
    const e = this.edge[p];
    const d = this.dir[p];
    const ed = 2 * e + (d > 0 ? 0 : 1);
    const edge = this.G.edges[e];
    this.occ[ed]--;
    this.onEdgeCount--;
    this.markDirty(ed);
    if (edge.lanes === 1 || edge.lanes >= 4) this.markDirty(ed ^ 1);
    const n = d > 0 ? edge.b : edge.a;
    this.node[p] = n;
    this.edge[p] = -1;
    if (this.regLink[p] >= 0 && this.G.nodes[n].routing) this.deregister(p);
    this.host.requestAdmit();
    return n;
  }

  /** Change the busy count of a (1-lane stop) node. */
  busy(node: number, delta: number): void {
    this.busyCount[node] += delta;
    if (this.busyCount[node] === 0) {
      for (const e of this.G.nodeEdges[node]) {
        this.markDirty(2 * e);
        this.markDirty(2 * e + 1);
      }
      this.host.requestAdmit();
    }
  }

  // ---------------------------------------------------------------- admission (kind 6)

  admitStep(): void {
    const fresh = this.pendingFresh;
    this.pendingFresh = [];
    fresh.sort((a, b) => a - b);
    for (const p of fresh) {
      const ed = this.wantEd[p];
      this.fifo[ed].push(p);
      this.markDirty(ed);
    }

    const dirty = this.dirtyList;
    this.dirtyList = [];
    for (const ed of dirty) this.dirtyFlag[ed] = 0;

    // Batch formation for 1-lane links with no direction and waiters. A (re)formed batch changes who may enter
    // anywhere on the link, so every FIFO of a touched 1-lane link is examined.
    const exam = new Set<number>(dirty);
    const links = new Set<number>();
    for (const ed of dirty) {
      const L = this.edgeLink[ed >> 1];
      if (this.linkOneLane[L]) links.add(L);
    }
    for (const L of links) {
      this.maybeFormBatch(L);
      for (const e of this.G.links[L].edges) {
        exam.add(2 * e);
        exam.add(2 * e + 1);
      }
    }

    // Examine FIFO heads in ascending (waitStart, personId).
    const heap: number[] = [];
    for (const ed of exam) if (this.fifo[ed].length > 0) this.heapPush(heap, ed);
    while (heap.length > 0) {
      const ed = this.heapPop(heap);
      const f = this.fifo[ed];
      const head = f[0];
      const r = this.check(head, ed);
      if (r === OK) {
        f.shift();
        this.admit(head, ed);
        if (f.length > 0) this.heapPush(heap, ed);
      } else if (r === RULE3) {
        // Ruling 1: registered agents behind are exempt from the link rule.
        for (let i = 1; i < f.length; i++) {
          const q = f[i];
          if (this.regLink[q] !== this.edgeLink[ed >> 1]) continue;
          if (this.check(q, ed) !== OK) break;
          f.splice(i, 1);
          i--;
          this.admit(q, ed);
        }
      }
    }

    // Fresh candidates that were not admitted become waiters.
    for (const p of fresh) {
      if (!this.fresh[p]) continue;
      this.fresh[p] = 0;
      const ed = this.wantEd[p];
      const L = this.edgeLink[ed >> 1];
      if (this.linkOneLane[L] && this.regLink[p] !== L) {
        this.waiter[p] = 1;
        this.waiters[2 * L + (ed & 1)]++;
      }
    }
  }

  private check(p: number, ed: number): number {
    const e = ed >> 1;
    const edge = this.G.edges[e];
    const d = ed & 1 ? -1 : 1;
    const L = edge.link;
    let r = OK;
    if (this.linkOneLane[L] && this.regLink[p] !== L) {
      const ld = this.linkDir(L);
      const opp = this.waiters[2 * L + (ed & 1 ? 0 : 1)];
      if ((ld !== 0 && ld !== d) || (opp > 0 && !this.inBatch(p, L))) r = RULE3;
    }
    // Capacity.
    const cap = edge.capacity;
    if (edge.lanes >= 4) {
      if (this.occ[2 * e] + this.occ[2 * e + 1] >= edge.lanes * cap) return BLOCKED;
    } else if (edge.lanes === 1) {
      if (this.occ[2 * e] + this.occ[2 * e + 1] >= cap) return BLOCKED;
    } else if (this.occ[ed] >= cap) {
      return BLOCKED;
    }
    // Busy nodes.
    const far = d > 0 ? edge.b : edge.a;
    if (this.busyCount[far] > 0) return BLOCKED;
    if (edge.lanes === 1 && this.busyCount[this.node[p]] > 0) return BLOCKED;
    return r;
  }

  private admit(p: number, ed: number): void {
    const e = ed >> 1;
    const edge = this.G.edges[e];
    const d = ed & 1 ? -1 : 1;
    const L = edge.link;
    this.clearWaiter(p, ed);
    this.fresh[p] = 0;
    this.wantEd[p] = -1;
    if (this.linkOneLane[L] && this.regLink[p] !== L) {
      this.regLink[p] = L;
      this.regDir[p] = d;
      this.regCount[2 * L + (d > 0 ? 0 : 1)]++;
      if (this.batchState[L] === 1) this.batchState[L] = 2;
    }
    const v = this.speed[p];
    let exit = this.now + Math.max(1, ceilDiv(edge.lengthMm * 1000, v));
    if (edge.lanes < 4) {
      const h = ceilDiv(HEADWAY_MM * 1000, v);
      if (this.lastExit[ed] + h > exit) exit = this.lastExit[ed] + h;
      const lead = this.lastEntrant[ed];
      this.leader[p] = lead >= 0 && this.edge[lead] === e && this.dir[lead] === d ? lead : -1;
      this.lastExit[ed] = exit;
      this.lastEntrant[ed] = p;
    } else {
      this.leader[p] = -1;
    }
    this.occ[ed]++;
    this.onEdgeCount++;
    this.node[p] = -1;
    this.edge[p] = e;
    this.dir[p] = d;
    this.entryMs[p] = this.now;
    this.exitMs[p] = exit;
    this.host.onAdmit?.(p, this.now);
    this.host.scheduleArrival(p, exit);
  }

  // ---------------------------------------------------------------- links and batches

  private inBatch(p: number, L: number): boolean {
    return this.batchState[L] !== 0 && this.batchLink[p] === L && this.batchEpochOf[p] === this.batchEpoch[L];
  }

  private maybeFormBatch(L: number): void {
    if (this.linkDir(L) !== 0) return;
    if (this.waiters[2 * L] + this.waiters[2 * L + 1] === 0) return;
    if (this.batchState[L] === 1 && this.batchWaiting[L] > 0) return;
    // d* = direction of the waiter with the smallest (waitStart, personId).
    let best = -1;
    let bestEd = -1;
    const edges = this.G.links[L].edges;
    for (const e of edges) {
      for (const bit of [0, 1]) {
        for (const q of this.fifo[2 * e + bit]) {
          if (!this.waiter[q]) continue;
          if (best < 0 || this.waitStart[q] < this.waitStart[best] || (this.waitStart[q] === this.waitStart[best] && q < best)) {
            best = q;
            bestEd = 2 * e + bit;
          }
        }
      }
    }
    if (best < 0) return;
    const bit = bestEd & 1;
    this.batchEpoch[L]++;
    this.batchState[L] = 1;
    this.batchDir[L] = bit ? -1 : 1;
    this.batchWaiting[L] = 0;
    for (const e of edges) {
      for (const q of this.fifo[2 * e + bit]) {
        if (!this.waiter[q]) continue;
        this.batchLink[q] = L;
        this.batchEpochOf[q] = this.batchEpoch[L];
        this.batchWaiting[L]++;
      }
    }
  }

  private deregister(p: number): void {
    const L = this.regLink[p];
    if (L < 0) return;
    this.regCount[2 * L + (this.regDir[p] > 0 ? 0 : 1)]--;
    this.regLink[p] = -1;
    if (this.linkDir(L) === 0) {
      if (this.batchState[L] === 2) this.batchState[L] = 0;
      this.markLinkDirty(L);
      this.host.requestAdmit();
    }
  }

  private clearWaiter(p: number, ed: number): void {
    if (!this.waiter[p]) return;
    this.waiter[p] = 0;
    const L = this.edgeLink[ed >> 1];
    this.waiters[2 * L + (ed & 1)]--;
    if (this.inBatch(p, L) && this.batchState[L] === 1) this.batchWaiting[L]--;
    this.batchLink[p] = -1;
  }

  private removeFromFifo(p: number, ed: number): void {
    const f = this.fifo[ed];
    const i = f.indexOf(p);
    if (i < 0) return;
    f.splice(i, 1);
    if (i === 0 && f.length > 0) {
      this.markDirty(ed);
      this.host.requestAdmit();
    }
  }

  private markDirty(ed: number): void {
    if (this.dirtyFlag[ed]) return;
    this.dirtyFlag[ed] = 1;
    this.dirtyList.push(ed);
  }

  // ---------------------------------------------------------------- head heap keyed by (waitStart, p) of the FIFO head

  private headLess(a: number, b: number): boolean {
    const pa = this.fifo[a][0], pb = this.fifo[b][0];
    const wa = this.waitStart[pa], wb = this.waitStart[pb];
    return wa < wb || (wa === wb && pa < pb);
  }

  private heapPush(h: number[], ed: number): void {
    h.push(ed);
    let i = h.length - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (!this.headLess(h[i], h[q])) break;
      const t = h[i]; h[i] = h[q]; h[q] = t;
      i = q;
    }
  }

  private heapPop(h: number[]): number {
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.headLess(h[l], h[m])) m = l;
        if (r < h.length && this.headLess(h[r], h[m])) m = r;
        if (m === i) break;
        const t = h[i]; h[i] = h[m]; h[m] = t;
        i = m;
      }
    }
    return top;
  }
}
