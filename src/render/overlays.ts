import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh,
  Matrix4, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, RingGeometry, TorusGeometry,
} from 'three';
import type { StaticLayout, View } from '../sim/engine';
import { TABLE_TOP_Y } from './props';
import type { SceneTokens } from './theme';

/** Materials and geometries shared by both scenes' overlays. */
export class OverlayKit {
  readonly tintGeo = new PlaneGeometry(0.5, 0.45);
  readonly ringGeo = new RingGeometry(1, 1.25, 40);
  readonly bottle = new CylinderGeometry(0.05, 0.06, 0.26, 10);
  readonly umbrella = new ConeGeometry(0.09, 0.5, 8);
  readonly lanyard = new TorusGeometry(0.1, 0.018, 6, 16);
  readonly card = new BoxGeometry(0.08, 0.01, 0.11);
  readonly tintMat = new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
  readonly ringMat = new MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false });
  readonly objMat = new MeshLambertMaterial();

  constructor() {
    this.tintGeo.rotateX(-Math.PI / 2);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.lanyard.rotateX(-Math.PI / 2);
  }

  applyTheme(t: SceneTokens): void {
    this.ringMat.color.copy(t.ring);
    this.objMat.color.copy(t.object);
  }

  /** Rings pulse at 1 Hz (spec §11.9). */
  pulse(realMs: number, reducedMotion: boolean): void {
    this.ringMat.opacity = reducedMotion ? 0.75 : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin((realMs / 1000) * 2 * Math.PI));
  }

  dispose(): void {
    for (const g of [this.tintGeo, this.ringGeo, this.bottle, this.umbrella, this.lanyard, this.card]) g.dispose();
    for (const m of [this.tintMat, this.ringMat, this.objMat]) m.dispose();
  }
}

function dyn(geo: PlaneGeometry | RingGeometry | CylinderGeometry | ConeGeometry | TorusGeometry | BoxGeometry, mat: MeshBasicMaterial | MeshLambertMaterial, n: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, n));
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

/** Seat tints (optional), rings under tables with kept seats, and reservation objects on claimed tables. */
export class OverlayLayer {
  readonly group = new Group();
  readonly tints: InstancedMesh;
  readonly rings: InstancedMesh;
  readonly objects: InstancedMesh[];
  private readonly m = new Matrix4();
  showTints = false;

  constructor(kit: OverlayKit, private readonly L: StaticLayout) {
    this.tints = dyn(kit.tintGeo, kit.tintMat, L.seats.length);
    this.tints.setColorAt(0, new Color());
    this.rings = dyn(kit.ringGeo, kit.ringMat, L.tables.length);
    this.objects = [dyn(kit.bottle, kit.objMat, L.tables.length), dyn(kit.umbrella, kit.objMat, L.tables.length), dyn(kit.lanyard, kit.objMat, L.tables.length)];
    this.group.add(this.tints, this.rings, ...this.objects);
  }

  update(v: View, t: SceneTokens): void {
    const L = this.L, m = this.m;
    let nt = 0;
    if (this.showTints) {
      for (const s of L.seats) {
        m.makeTranslation(s.x, 0.47, s.y + (s.side === 0 ? -0.05 : 0.05));
        this.tints.setMatrixAt(nt, m);
        this.tints.setColorAt(nt++, t.seat[v.seatState[s.id]]);
      }
      this.tints.instanceColor!.needsUpdate = true;
    }
    this.tints.count = nt;
    let nr = 0;
    const no = [0, 0, 0];
    for (const tb of L.tables) {
      const cx = (tb.x0 + tb.x1) / 2, cz = (tb.y0 + tb.y1) / 2;
      if (v.tableRing[tb.id]) {
        const r = Math.max(tb.x1 - tb.x0, tb.y1 - tb.y0) * 0.62;
        m.makeScale(r, 1, r * 0.62).setPosition(cx, 0.02, cz);
        this.rings.setMatrixAt(nr++, m);
      }
      if (v.tableClaimed[tb.id]) {
        const k = v.tableObject[tb.id] % 3;
        const h = k === 0 ? 0.13 : k === 1 ? 0.25 : 0.02;
        m.makeTranslation(cx, TABLE_TOP_Y + 0.025 + h, cz);
        this.objects[k].setMatrixAt(no[k]++, m);
      }
    }
    this.rings.count = nr;
    this.objects.forEach((o, i) => { o.count = no[i]; o.instanceMatrix.needsUpdate = true; });
    this.rings.instanceMatrix.needsUpdate = true;
    this.tints.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const im of [this.tints, this.rings, ...this.objects]) im.dispose();
  }
}
