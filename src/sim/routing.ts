import type { NavGraph } from './navgraph';

export const INF = 0x3fffffff;

export interface Option { link: number; toward: number; next: number }
export interface Router {
  graph: NavGraph;
  routingCount: number;
  D: Int32Array; // routingCount × routingCount, integer mm
  dist(from: number, to: number): number;
  options(at: number, target: number): Option[];
}

/** Where a node sits: on link `link` at offsets `da`/`db` from its ends, or link = −1 for routing nodes. */
interface Seg { link: number; a: number; b: number; da: number; db: number }

type HeapItem = [dist: number, node: number];

function less(h: HeapItem[], i: number, j: number): boolean {
  return h[i][0] < h[j][0] || (h[i][0] === h[j][0] && h[i][1] < h[j][1]);
}
function push(h: HeapItem[], item: HeapItem): void {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(h, i, p)) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function pop(h: HeapItem[]): HeapItem {
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && less(h, l, m)) m = l;
      if (r < h.length && less(h, r, m)) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

export function buildRouter(G: NavGraph): Router {
  const n = G.routingIds.length;
  const D = new Int32Array(n * n).fill(INF);
  const adj: { to: number; len: number; link: number }[][] = Array.from({ length: n }, () => []);
  for (const l of G.links) {
    adj[l.a].push({ to: l.b, len: l.lengthMm, link: l.id });
    adj[l.b].push({ to: l.a, len: l.lengthMm, link: l.id });
  }
  for (const list of adj) list.sort((p, q) => p.to - q.to || p.link - q.link);

  for (let s = 0; s < n; s++) {
    const row = s * n;
    D[row + s] = 0;
    const heap: HeapItem[] = [[0, s]];
    while (heap.length > 0) {
      const [d, u] = pop(heap);
      if (d > D[row + u]) continue;
      for (const e of adj[u]) {
        const nd = d + e.len;
        if (nd < D[row + e.to]) {
          D[row + e.to] = nd;
          push(heap, [nd, e.to]);
        }
      }
    }
  }

  const seg: Seg[] = G.nodes.map((node) => ({ link: -1, a: node.id, b: node.id, da: 0, db: 0 }));
  for (const l of G.links) {
    let acc = 0;
    for (let q = 0; q < l.edges.length - 1; q++) {
      const e = G.edges[l.edges[q]];
      acc += e.lengthMm;
      seg[e.b] = { link: l.id, a: l.a, b: l.b, da: acc, db: l.lengthMm - acc };
    }
  }
  const along = (u: number, v: number) => Math.abs(G.nodes[u].x - G.nodes[v].x) + Math.abs(G.nodes[u].y - G.nodes[v].y);

  function dist(from: number, to: number): number {
    const sf = seg[from];
    const st = seg[to];
    if (sf.link !== -1 && sf.link === st.link) return along(from, to);
    const fe: [number, number][] = sf.link === -1 ? [[from, 0]] : [[sf.a, sf.da], [sf.b, sf.db]];
    const te: [number, number][] = st.link === -1 ? [[to, 0]] : [[st.a, st.da], [st.b, st.db]];
    let best = INF;
    for (const [e, de] of fe) {
      for (const [f, df] of te) {
        const v = de + D[e * n + f] + df;
        if (v < best) best = v;
      }
    }
    return best;
  }

  function options(at: number, target: number): Option[] {
    if (at === target) return [];
    const total = dist(at, target);
    const s = seg[at];
    const st = seg[target];
    const out: Option[] = [];
    if (s.link !== -1) {
      if (st.link === s.link) return [{ link: s.link, toward: st.da > s.da ? s.b : s.a, next: target }];
      if (s.da + dist(s.a, target) === total) out.push({ link: s.link, toward: s.a, next: s.a });
      if (s.db + dist(s.b, target) === total) out.push({ link: s.link, toward: s.b, next: s.b });
    } else {
      for (const e of adj[at]) {
        if (st.link === e.link) {
          const l = G.links[e.link];
          if ((l.a === at ? st.da : st.db) === total) out.push({ link: e.link, toward: e.to, next: target });
        } else if (e.len + dist(e.to, target) === total) {
          out.push({ link: e.link, toward: e.to, next: e.to });
        }
      }
    }
    return out.sort((p, q) => p.next - q.next || p.link - q.link);
  }

  return { graph: G, routingCount: n, D, dist, options };
}
