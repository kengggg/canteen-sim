import { buildLayout, type Layout, type LayoutParams } from './layout';
import { buildNavGraph, type NavGraph } from './navgraph';
import { buildRouter, type Router } from './routing';

/** Layout-level precompute shared by every run with the same layout and visibility (spec §12.2 rule 3). */
export interface Precomp {
  L: Layout;
  G: NavGraph;
  R: Router;
  visMm: number;
  nodeCount: number;
  tableCount: number;
  /** Per node: ids of tables whose centre is within visibility (dx² + dy² ≤ vis²), ascending. */
  visibleTables: Int32Array[];
  /** nodeCount × tableCount: min dist from node to any access node of the table, and that access node. */
  nodeTableDist: Int32Array;
  nodeTableAccess: Int32Array;
  /** Edge id joining two adjacent nodes, or −1. */
  edgeBetween(a: number, b: number): number;
  /** Per link: its node sequence from link.a to link.b. */
  linkNodes: Int32Array[];
  /** For non-routing nodes: their link and index in linkNodes; −1 for routing nodes. */
  nodeLink: Int32Array;
  nodeLinkIdx: Int32Array;
  /** 1 for stop nodes whose line has one lane (actions there make the node busy). */
  oneLaneStop: Uint8Array;
  /** Intersection node ids, ascending. */
  intersections: Int32Array;
  /** Per table: the distinct access nodes of its seats, ascending. */
  tableAccessNodes: Int32Array[];
}

const cache = new Map<string, Precomp>();

export function getPrecomp(p: LayoutParams, visMm: number): Precomp {
  const key = JSON.stringify([p.cols, p.rows, p.seatsPerSide, p.verticalAisleMm, p.horizontalAisleMm, p.stallCount, p.queueDepthMm, visMm]);
  const hit = cache.get(key);
  if (hit) return hit;
  const pc = build(p, visMm);
  cache.set(key, pc);
  return pc;
}

function build(p: LayoutParams, visMm: number): Precomp {
  const L = buildLayout(p);
  const G = buildNavGraph(L);
  const R = buildRouter(G);
  const N = G.nodes.length;
  const T = L.tables.length;

  const vis2 = visMm * visMm;
  const visibleTables = G.nodes.map((n) => {
    const out: number[] = [];
    for (const t of L.tables) {
      const dx = t.cx - n.x, dy = t.cy - n.y;
      if (dx * dx + dy * dy <= vis2) out.push(t.id);
    }
    return Int32Array.from(out);
  });

  const tableAccessNodes = L.tables.map((t) => {
    const set = new Set<number>();
    for (let j = 0; j < 2 * p.seatsPerSide; j++) set.add(G.seatNode[t.id * 2 * p.seatsPerSide + j]);
    return Int32Array.from([...set].sort((a, b) => a - b));
  });

  const nodeTableDist = new Int32Array(N * T);
  const nodeTableAccess = new Int32Array(N * T);
  for (let n = 0; n < N; n++) {
    for (let t = 0; t < T; t++) {
      let best = 0x7fffffff, arg = -1;
      for (const a of tableAccessNodes[t]) {
        const d = R.dist(n, a);
        if (d < best) { best = d; arg = a; }
      }
      nodeTableDist[n * T + t] = best;
      nodeTableAccess[n * T + t] = arg;
    }
  }

  const edgeMap = new Map<number, number>();
  for (const e of G.edges) {
    edgeMap.set(e.a * N + e.b, e.id);
    edgeMap.set(e.b * N + e.a, e.id);
  }
  const edgeBetween = (a: number, b: number) => edgeMap.get(a * N + b) ?? -1;

  const nodeLink = new Int32Array(N).fill(-1);
  const nodeLinkIdx = new Int32Array(N).fill(-1);
  const linkNodes = G.links.map((l) => {
    const seq = Int32Array.from([l.a, ...l.edges.map((e) => G.edges[e].b)]);
    for (let i = 1; i < seq.length - 1; i++) {
      nodeLink[seq[i]] = l.id;
      nodeLinkIdx[seq[i]] = i;
    }
    return seq;
  });

  const oneLaneStop = new Uint8Array(N);
  for (const n of G.nodes) {
    if (n.roles.length === 0) continue;
    const inc = G.nodeEdges[n.id];
    if (inc.length > 0 && inc.every((e) => G.edges[e].lanes === 1)) oneLaneStop[n.id] = 1;
  }
  const intersections = Int32Array.from(G.nodes.filter((n) => n.intersection).map((n) => n.id));

  return {
    L, G, R, visMm, nodeCount: N, tableCount: T, visibleTables, nodeTableDist, nodeTableAccess,
    edgeBetween, linkNodes, nodeLink, nodeLinkIdx, oneLaneStop, intersections, tableAccessNodes,
  };
}
