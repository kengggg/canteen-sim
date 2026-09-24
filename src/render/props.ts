import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry,
} from 'three';
import type { StaticLayout } from '../sim/engine';
import type { LabelAtlas } from './labels';
import { awningColor, type SceneTokens } from './theme';

export const TABLE_TOP_Y = 0.74;

/** Materials and geometries shared by both scenes; `build()` makes one scene's static props. */
export class PropKit {
  readonly m = {
    floor: new MeshLambertMaterial(),
    zone: new MeshLambertMaterial(),
    kitchen: new MeshLambertMaterial(),
    wall: new MeshLambertMaterial(),
    table: new MeshLambertMaterial(),
    chair: new MeshLambertMaterial(),
    counter: new MeshLambertMaterial(),
    tray: new MeshLambertMaterial(),
    door: new MeshBasicMaterial(),
  };
  readonly awnings: MeshLambertMaterial[];
  private readonly unit = new BoxGeometry(1, 1, 1);
  private readonly plane = new PlaneGeometry(1, 1);
  private readonly post = new CylinderGeometry(0.06, 0.08, 1, 8);

  constructor(private readonly L: StaticLayout, private readonly atlas: LabelAtlas) {
    this.awnings = L.stalls.map(() => new MeshLambertMaterial());
    this.plane.rotateX(-Math.PI / 2);
  }

  applyTheme(t: SceneTokens, dark: boolean): void {
    this.m.floor.color.copy(t.floor);
    this.m.zone.color.copy(t.zone);
    this.m.kitchen.color.copy(t.kitchen);
    this.m.wall.color.copy(t.wall);
    this.m.table.color.copy(t.table);
    this.m.chair.color.copy(t.chair);
    this.m.counter.color.copy(t.counter);
    this.m.tray.color.copy(t.tray);
    this.m.door.color.copy(t.door);
    this.awnings.forEach((a, i) => a.color.copy(awningColor(i, this.awnings.length, dark)));
  }

  /** Every string the props need in the label atlas. */
  static labelTexts(L: StaticLayout): string[] {
    return [...L.stalls.map((s) => String(s.id + 1)), 'TRAY RETURN', 'IN', 'OUT'];
  }

  private box(mat: MeshLambertMaterial | MeshBasicMaterial, x0: number, x1: number, y0: number, y1: number, h0: number, h1: number): Mesh {
    const m = new Mesh(this.unit, mat);
    m.scale.set(Math.max(0.01, x1 - x0), Math.max(0.01, h1 - h0), Math.max(0.01, y1 - y0));
    m.position.set((x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2);
    return m;
  }

  private floorRect(mat: MeshLambertMaterial | MeshBasicMaterial, x0: number, x1: number, y0: number, y1: number, h: number): Mesh {
    const m = new Mesh(this.plane, mat);
    m.scale.set(x1 - x0, 1, y1 - y0);
    m.position.set((x0 + x1) / 2, h, (y0 + y1) / 2);
    return m;
  }

  build(): Group {
    const L = this.L;
    const g = new Group();
    const band = L.stallBand;
    const Q = L.queueDepth;
    g.add(this.floorRect(this.m.floor, 0, L.W, 0, L.H, 0));
    g.add(this.floorRect(this.m.kitchen, 0, L.W, 0, band, 0.002));
    g.add(this.floorRect(this.m.kitchen, 0, band, band + Q, L.H, 0.002));
    g.add(this.floorRect(this.m.zone, 0, L.W, band, band + Q, 0.003));
    g.add(this.floorRect(this.m.zone, band, band + Q, band + Q, L.H, 0.003));

    // Low cut-away walls with door gaps on the bottom wall.
    const wt = 0.15, wh = 0.5;
    g.add(this.box(this.m.wall, -wt, L.W + wt, -wt, 0, 0, wh));
    g.add(this.box(this.m.wall, -wt, 0, 0, L.H, 0, wh));
    g.add(this.box(this.m.wall, L.W, L.W + wt, 0, L.H, 0, wh));
    const gaps = [[L.entranceX - 1, L.entranceX + 1], [L.exitX - 1, L.exitX + 1]].sort((a, b) => a[0] - b[0]);
    let x = -wt;
    for (const [a, b] of gaps) {
      g.add(this.box(this.m.wall, x, a, L.H, L.H + wt, 0, wh));
      x = b;
    }
    g.add(this.box(this.m.wall, x, L.W + wt, L.H, L.H + wt, 0, wh));
    for (const [xc, text] of [[L.entranceX, 'IN'], [L.exitX, 'OUT']] as const) {
      g.add(this.floorRect(this.m.door, xc - 1, xc + 1, L.H - 0.35, L.H, 0.004));
      const s = this.atlas.sprite(text, 0.9);
      s.position.set(xc, 1.4, L.H - 0.2);
      g.add(s);
    }

    // Tray return counter facing north at the bottom wall.
    const t0 = L.blockX + 0.5, t1 = L.blockX + 3.5;
    g.add(this.box(this.m.tray, t0, t1, L.H - 0.6, L.H, 0, 0.95));
    const tl = this.atlas.sprite('TRAY RETURN', 0.6);
    tl.position.set((t0 + t1) / 2, 1.6, L.H - 0.3);
    g.add(tl);

    // Stalls: counter, awning, number.
    L.stalls.forEach((s, i) => {
      const a = s.start + 0.05, b = s.start + s.frontage - 0.05;
      if (s.band === 'top') {
        g.add(this.box(this.m.counter, a, b, band - 0.6, band, 0, 1.0));
        g.add(this.box(this.awnings[i], a, b, band - 1.2, band + 0.15, 2.2, 2.32));
        const n = this.atlas.sprite(String(s.id + 1), 0.7);
        n.position.set((a + b) / 2, 2.9, band - 0.5);
        g.add(n);
      } else {
        g.add(this.box(this.m.counter, band - 0.6, band, a, b, 0, 1.0));
        g.add(this.box(this.awnings[i], band - 1.2, band + 0.15, a, b, 2.2, 2.32));
        const n = this.atlas.sprite(String(s.id + 1), 0.7);
        n.position.set(band - 0.5, 2.9, (a + b) / 2);
        g.add(n);
      }
    });

    // Tables (top + post) and chairs, instanced.
    const mat = new Matrix4();
    const tops = new InstancedMesh(this.unit, this.m.table, L.tables.length);
    const posts = new InstancedMesh(this.post, this.m.chair, L.tables.length);
    L.tables.forEach((t, i) => {
      mat.makeScale(t.x1 - t.x0, 0.05, t.y1 - t.y0).setPosition((t.x0 + t.x1) / 2, TABLE_TOP_Y, (t.y0 + t.y1) / 2);
      tops.setMatrixAt(i, mat);
      mat.makeScale(1, TABLE_TOP_Y, 1).setPosition((t.x0 + t.x1) / 2, TABLE_TOP_Y / 2, (t.y0 + t.y1) / 2);
      posts.setMatrixAt(i, mat);
    });
    const chairs = new InstancedMesh(this.unit, this.m.chair, L.seats.length);
    L.seats.forEach((s, i) => {
      mat.makeScale(0.42, 0.45, 0.4).setPosition(s.x, 0.225, s.y + (s.side === 0 ? -0.05 : 0.05));
      chairs.setMatrixAt(i, mat);
    });
    for (const im of [tops, posts, chairs]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    return g;
  }

  dispose(): void {
    this.unit.dispose();
    this.plane.dispose();
    this.post.dispose();
    for (const m of Object.values(this.m)) m.dispose();
    for (const a of this.awnings) a.dispose();
  }
}
