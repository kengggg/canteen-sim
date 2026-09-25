import {
  BoxGeometry, CircleGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshLambertMaterial, SphereGeometry,
} from 'three';
import type { StaticLayout, View } from '../sim/engine';
import { CLS } from '../sim/types';
import type { SceneTokens } from './theme';

export const BODY_R = 0.2;
const GOLDEN = 137.5 * (Math.PI / 180);

/** Geometries and materials shared by both scenes' people layers. */
export class PeopleKit {
  readonly body = new CylinderGeometry(BODY_R, BODY_R * 1.1, 1, 10);
  readonly head = new SphereGeometry(0.14, 12, 8);
  readonly tray = new BoxGeometry(0.46, 0.035, 0.32);
  readonly disc = new CircleGeometry(0.3, 16);
  readonly bodyMat = new MeshBasicMaterial();
  readonly ghostMat = new MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
  readonly headMat = new MeshLambertMaterial({ color: new Color('#e2cdb6') });
  readonly trayMat = new MeshLambertMaterial();
  readonly discMat = new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });

  constructor() {
    this.disc.rotateX(-Math.PI / 2);
  }

  applyTheme(t: SceneTokens): void {
    this.trayMat.color.copy(t.tray);
    this.discMat.color.copy(t.contact);
  }

  dispose(): void {
    for (const g of [this.body, this.head, this.tray, this.disc]) g.dispose();
    for (const m of [this.bodyMat, this.ghostMat, this.headMat, this.trayMat, this.discMat]) m.dispose();
  }
}

function dyn(geo: CylinderGeometry | SphereGeometry | BoxGeometry | CircleGeometry, mat: MeshBasicMaterial | MeshLambertMaterial, n: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, n));
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

/**
 * One canteen's people (spec §11.9): active people are compacted into the first `count` instances, with an
 * instance → person map for picking. Positions interpolate each segment by render time.
 */
export class PeopleLayer {
  readonly group = new Group();
  readonly bodies: InstancedMesh;
  readonly ghosts: InstancedMesh;
  readonly heads: InstancedMesh;
  readonly trays: InstancedMesh;
  readonly discs: InstancedMesh;
  /** Plan position (m) and seated flag per person, from the last update; NaN when inactive. */
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly seated: Uint8Array;
  private readonly m = new Matrix4();
  private readonly col = new Color();
  private readonly s: Float32Array;
  private readonly len: Float32Array;

  constructor(kit: PeopleKit, readonly capacity: number) {
    this.bodies = dyn(kit.body, kit.bodyMat, capacity);
    this.ghosts = dyn(kit.body, kit.ghostMat, capacity);
    this.heads = dyn(kit.head, kit.headMat, capacity);
    this.trays = dyn(kit.tray, kit.trayMat, capacity);
    this.discs = dyn(kit.disc, kit.discMat, capacity);
    for (const im of [this.bodies, this.ghosts]) {
      im.setColorAt(0, new Color());
      im.instanceColor!.setUsage(DynamicDrawUsage);
    }
    this.group.add(this.discs, this.bodies, this.ghosts, this.heads, this.trays);
    this.px = new Float32Array(capacity).fill(Number.NaN);
    this.py = new Float32Array(capacity).fill(Number.NaN);
    this.seated = new Uint8Array(capacity);
    this.s = new Float32Array(capacity);
    this.len = new Float32Array(capacity);
  }

  update(v: View, L: StaticLayout, renderMs: number, t: SceneTokens, colorOf: ((p: number) => Color) | null): void {
    const P = this.capacity;
    const px = this.px, py = this.py;
    const s = this.s; // distance along the current segment (for leader clamping)
    const len = this.len;
    // Pass 1: raw positions.
    for (let p = 0; p < P; p++) {
      this.seated[p] = 0;
      len[p] = 0;
      if (!v.active[p]) { px[p] = py[p] = Number.NaN; continue; }
      if (v.seat[p] >= 0) {
        const seat = L.seats[v.seat[p]];
        px[p] = seat.x;
        py[p] = seat.y;
        this.seated[p] = 1;
        continue;
      }
      const x0 = v.x0[p], y0 = v.y0[p], x1 = v.x1[p], y1 = v.y1[p];
      const dx = x1 - x0, dy = y1 - y0;
      const l = Math.hypot(dx, dy);
      len[p] = l;
      const span = v.t1[p] - v.t0[p];
      const f = span > 0 ? Math.min(1, Math.max(0, (renderMs - v.t0[p]) / span)) : 1;
      s[p] = f * l;
      px[p] = x0 + f * dx;
      py[p] = y0 + f * dy;
      const wk = v.waitKind[p];
      if (wk === 1 && v.waitToward[p] >= 0) {
        const to = L.nodes[v.waitToward[p]];
        const ux = to.x - x0, uy = to.y - y0;
        const ul = Math.hypot(ux, uy) || 1;
        const back = 0.6 * (v.waitRank[p] + 1);
        px[p] = x0 - (ux / ul) * back;
        py[p] = y0 - (uy / ul) * back;
      } else if (wk === 2) {
        const j = Math.max(0, v.waitRank[p]);
        const r = 0.5 * Math.ceil(Math.sqrt(j));
        px[p] = x0 + r * Math.cos(j * GOLDEN);
        py[p] = y0 + r * Math.sin(j * GOLDEN);
      } else if (wk === 3) {
        const j = Math.max(0, v.waitRank[p]);
        px[p] = j < 4 ? x0 : x0 - 0.6 * (j - 3);
        py[p] = y0 - 0.6 * Math.min(j + 1, 4);
      }
    }
    // Pass 2: followers stay ≥ 0.6 m behind their lane leader; lane offset on 2–3 lane edges.
    for (let p = 0; p < P; p++) {
      if (!v.active[p] || this.seated[p] || v.waitKind[p] !== 0 || len[p] === 0) continue;
      const q = v.leader[p];
      const ux = (v.x1[p] - v.x0[p]) / len[p], uy = (v.y1[p] - v.y0[p]) / len[p];
      if (q >= 0 && v.active[q] && v.x0[q] === v.x0[p] && v.y0[q] === v.y0[p] && v.x1[q] === v.x1[p] && v.y1[q] === v.y1[p]) {
        const lim = Math.max(0, s[q] - 0.6);
        if (s[p] > lim) {
          s[p] = lim;
          px[p] = v.x0[p] + ux * lim;
          py[p] = v.y0[p] + uy * lim;
        }
      }
      const off = v.laneOffset[p];
      if (off) {
        px[p] += -uy * off;
        py[p] += ux * off;
      }
    }
    // Pass 3: instances.
    let nb = 0, ng = 0, nh = 0, nt = 0;
    const m = this.m;
    for (let p = 0; p < P; p++) {
      if (!v.active[p]) continue;
      const x = px[p], z = py[p];
      const sit = this.seated[p] === 1;
      const bodyH = sit ? 0.8 : 1.2;
      const base = sit ? 0.35 : 0.1;
      m.makeScale(1, bodyH, 1).setPosition(x, base + bodyH / 2, z);
      const ghost = v.cls[p] === CLS.WALKED_AWAY;
      const target = ghost ? this.ghosts : this.bodies;
      const i = ghost ? ng++ : nb++;
      target.setMatrixAt(i, m);
      target.setColorAt(i, colorOf ? colorOf(p) : this.col.copy(t.cls[v.cls[p]]));
      m.makeTranslation(x, base + bodyH + 0.17, z);
      this.heads.setMatrixAt(nh, m);
      m.makeTranslation(x, 0.012, z);
      this.discs.setMatrixAt(nh++, m);
      if (v.tray[p] && !sit) {
        m.makeTranslation(x, 1.02, z);
        this.trays.setMatrixAt(nt++, m);
      }
    }
    this.bodies.count = nb;
    this.ghosts.count = ng;
    this.heads.count = nh;
    this.discs.count = nh;
    this.trays.count = nt;
    for (const im of [this.bodies, this.ghosts, this.heads, this.discs, this.trays]) im.instanceMatrix.needsUpdate = true;
    this.bodies.instanceColor!.needsUpdate = true;
    this.ghosts.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    for (const im of [this.bodies, this.ghosts, this.heads, this.trays, this.discs]) im.dispose();
  }
}
