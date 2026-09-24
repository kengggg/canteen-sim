import { type Layout, LANE_MM } from './layout';

export const MERGE_MM = 50;

export type Role =
  | { kind: 'seat'; seat: number }
  | { kind: 'stall'; stall: number }
  | { kind: 'entrance' }
  | { kind: 'exit' }
  | { kind: 'tray' };

export interface NavNode {
  id: number;
  x: number;
  y: number;
  hLine: number; // horizontal line index; −1 for stops that lie only on the left walkway
  onLeftWalkway: boolean;
  intersection: boolean;
  routing: boolean;
  roles: Role[];
}
export interface Edge { id: number; a: number; b: number; lengthMm: number; lanes: number; capacity: number; link: number }
export interface Link { id: number; a: number; b: number; edges: number[]; lengthMm: number; lanes: number }
export interface NavGraph {
  nodes: NavNode[];
  edges: Edge[];
  links: Link[];
  nodeEdges: number[][];
  seatNode: Int32Array;
  stallNode: Int32Array;
  entranceNode: number;
  exitNode: number;
  trayNode: number;
  routingIds: number[];
}

interface Pt { pos: number; key: string | null; roles: Role[] }
interface Proto { x: number; y: number; hLine: number; onLeft: boolean; key: string | null; roles: Role[] }

export function lanesFor(widthMm: number): number {
  return Math.floor(widthMm / LANE_MM);
}

export function capacityFor(lengthMm: number): number {
  return Math.max(1, Math.floor(lengthMm / LANE_MM));
}

export function buildNavGraph(L: Layout): NavGraph {
  // 1. Points per line. Intersections are keyed "h{i}v{j}" and shared by both lines.
  const hPts: Pt[][] = L.hLines.map(() => []);
  const vPts: Pt[][] = L.vLines.map(() => []);
  for (const h of L.hLines) {
    for (const v of L.vLines) {
      if (v.x >= h.x0 && v.x <= h.x1 && h.y >= v.y0 && h.y <= v.y1) {
        const key = `h${h.index}v${v.index}`;
        hPts[h.index].push({ pos: v.x, key, roles: [] });
        vPts[v.index].push({ pos: h.y, key, roles: [] });
      }
    }
  }
  for (const s of L.seats) hPts[s.line].push({ pos: s.x, key: null, roles: [{ kind: 'seat', seat: s.id }] });
  for (const st of L.stalls) {
    if (st.band === 'top') hPts[0].push({ pos: st.stopX, key: null, roles: [{ kind: 'stall', stall: st.id }] });
    else vPts[0].push({ pos: st.stopY, key: null, roles: [{ kind: 'stall', stall: st.id }] });
  }
  const concourse = L.params.rows;
  hPts[concourse].push({ pos: L.entranceX, key: null, roles: [{ kind: 'entrance' }] });
  hPts[concourse].push({ pos: L.exitX, key: null, roles: [{ kind: 'exit' }] });
  hPts[concourse].push({ pos: L.trayX, key: null, roles: [{ kind: 'tray' }] });

  // 2. Merge clusters (≤ 50 mm apart, transitively) along each line.
  const protos: Proto[] = [];
  const byKey = new Map<string, number>();
  const protoFor = (key: string | null, x: number, y: number, hLine: number, onLeft: boolean): number => {
    if (key !== null) {
      const existing = byKey.get(key);
      if (existing !== undefined) return existing;
    }
    protos.push({ x, y, hLine, onLeft, key, roles: [] });
    const idx = protos.length - 1;
    if (key !== null) byKey.set(key, idx);
    return idx;
  };
  const mergeLine = (pts: Pt[], toXY: (pos: number) => [number, number], hLine: number, onLeft: boolean): number[] => {
    const sorted = [...pts].sort((p, q) => p.pos - q.pos || (p.key === null ? 1 : 0) - (q.key === null ? 1 : 0));
    const clusters: Pt[][] = [];
    for (const p of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && p.pos - last[last.length - 1].pos <= MERGE_MM) last.push(p);
      else clusters.push([p]);
    }
    return clusters.map((c) => {
      const inter = c.find((p) => p.key !== null);
      const [x, y] = toXY(inter ? inter.pos : c[0].pos);
      const idx = protoFor(inter ? inter.key : null, x, y, hLine, onLeft);
      for (const p of c) protos[idx].roles.push(...p.roles);
      return idx;
    });
  };
  const lineSeq: number[][] = [];
  for (const h of L.hLines) lineSeq.push(mergeLine(hPts[h.index], (pos) => [pos, h.y], h.index, false));
  for (const v of L.vLines) {
    const isLeft = v.kind === 'leftWalkway';
    const seq = mergeLine(vPts[v.index], (pos) => [v.x, pos], -1, isLeft);
    if (isLeft) for (const i of seq) protos[i].onLeft = true;
    lineSeq.push(seq);
  }

  // 3. Routing nodes = intersections + terminals (outermost stops beyond the last intersection).
  const isInter = protos.map((p) => p.key !== null);
  const isRouting = [...isInter];
  for (const seq of lineSeq) {
    const first = seq.findIndex((i) => isInter[i]);
    let last = -1;
    for (let q = seq.length - 1; q >= 0; q--) {
      if (isInter[seq[q]]) { last = q; break; }
    }
    if (first > 0) isRouting[seq[0]] = true;
    if (last >= 0 && last < seq.length - 1) isRouting[seq[seq.length - 1]] = true;
  }

  // 4. Node ids (spec §4.1).
  const group = (i: number) => (isRouting[i] ? 0 : protos[i].hLine >= 0 ? 1 : 2);
  const order = protos.map((_, i) => i).sort((i, j) => {
    const gi = group(i), gj = group(j);
    if (gi !== gj) return gi - gj;
    if (gi === 2) return protos[i].y - protos[j].y;
    return protos[i].hLine - protos[j].hLine || protos[i].x - protos[j].x;
  });
  const idOf = new Int32Array(protos.length);
  order.forEach((pi, id) => { idOf[pi] = id; });
  const nodes: NavNode[] = order.map((pi, id) => ({
    id, x: protos[pi].x, y: protos[pi].y, hLine: protos[pi].hLine, onLeftWalkway: protos[pi].onLeft,
    intersection: isInter[pi], routing: isRouting[pi], roles: protos[pi].roles,
  }));

  // 5. Edges and links along each line (h lines first, then v lines, same order as lineSeq).
  const edges: Edge[] = [];
  const links: Link[] = [];
  const nodeEdges: number[][] = nodes.map(() => []);
  const widths = [...L.hLines.map((h) => h.widthMm), ...L.vLines.map((v) => v.widthMm)];
  lineSeq.forEach((seq, li) => {
    const lanes = lanesFor(widths[li]);
    let link: Link | null = null;
    for (let q = 0; q + 1 < seq.length; q++) {
      const a = idOf[seq[q]];
      const b = idOf[seq[q + 1]];
      const len = Math.abs(nodes[b].x - nodes[a].x) + Math.abs(nodes[b].y - nodes[a].y);
      if (link === null) {
        link = { id: links.length, a, b, edges: [], lengthMm: 0, lanes };
        links.push(link);
      }
      const e: Edge = { id: edges.length, a, b, lengthMm: len, lanes, capacity: capacityFor(len), link: link.id };
      edges.push(e);
      nodeEdges[a].push(e.id);
      nodeEdges[b].push(e.id);
      link.edges.push(e.id);
      link.b = b;
      link.lengthMm += len;
      if (nodes[b].routing) link = null;
    }
  });

  // 6. Role lookups.
  const seatNode = new Int32Array(L.seats.length).fill(-1);
  const stallNode = new Int32Array(L.stalls.length).fill(-1);
  let entranceNode = -1;
  let exitNode = -1;
  let trayNode = -1;
  for (const n of nodes) {
    for (const r of n.roles) {
      if (r.kind === 'seat') seatNode[r.seat] = n.id;
      else if (r.kind === 'stall') stallNode[r.stall] = n.id;
      else if (r.kind === 'entrance') entranceNode = n.id;
      else if (r.kind === 'exit') exitNode = n.id;
      else trayNode = n.id;
    }
  }
  const routingIds = nodes.filter((n) => n.routing).map((n) => n.id);
  return { nodes, edges, links, nodeEdges, seatNode, stallNode, entranceNode, exitNode, trayNode, routingIds };
}
