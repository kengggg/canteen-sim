import {
  Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Ray, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { StaticLayout, StaticPeople, View } from '../sim/engine';
import { applyOrbit, SmoothFollow, threeQuarter, topDown, type CameraMode, type Orbit } from './cameras';
import { LabelAtlas } from './labels';
import { OverlayKit, OverlayLayer } from './overlays';
import { PeopleKit, PeopleLayer } from './people';
import { pickPerson, pickTable } from './picking';
import { PropKit } from './props';
import { readTokens, type SceneTokens } from './theme';

export interface Rect { x: number; y: number; w: number; h: number }
export type Pick = { side: 0 | 1; kind: 'person'; person: number } | { side: 0 | 1; kind: 'table'; table: number };

interface Side {
  scene: Scene;
  camera: PerspectiveCamera;
  people: PeopleLayer;
  overlay: OverlayLayer;
  follow: SmoothFollow;
}

/**
 * One WebGLRenderer drawing two scenes into scissored viewports (spec §11.9). Rendering never touches the engines'
 * state; it reads `view()` only.
 */
export class CanteenRenderer {
  readonly renderer: WebGLRenderer;
  private sides: Side[] = [];
  private props: PropKit | null = null;
  private people = new PeopleKit();
  private overlays = new OverlayKit();
  private atlas: LabelAtlas | null = null;
  private tokens: SceneTokens;
  private layout: StaticLayout | null = null;
  private groupColors: Color[] = [];
  orbits: [Orbit, Orbit] | null = null;
  linked = true;
  mode: CameraMode = 'threeQuarter';
  colorByGroup = false;
  reducedMotion = false;
  lost = false;
  private slowSince = -1;
  private pixelRatio: number;

  private constructor(readonly canvas: HTMLCanvasElement, r: WebGLRenderer) {
    this.renderer = r;
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    r.setPixelRatio(this.pixelRatio);
    this.tokens = readTokens();
  }

  /** Returns null when WebGL is unavailable (spec §11.10). Never logs errors. */
  static create(canvas: HTMLCanvasElement): CanteenRenderer | null {
    try {
      const probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!probe) return null;
      const r = new WebGLRenderer({ canvas, context: probe as WebGL2RenderingContext, antialias: true, alpha: true });
      return new CanteenRenderer(canvas, r);
    } catch {
      return null;
    }
  }

  /** (Re)build both scenes for a layout and allocate dynamic meshes for `people.count` people (spec §11.2 Restart). */
  setup(L: StaticLayout, people: StaticPeople): void {
    const sameLayout = this.layout !== null && JSON.stringify(this.layout.tables) === JSON.stringify(L.tables) && this.layout.stalls.length === L.stalls.length;
    for (const s of this.sides) {
      s.people.dispose();
      s.overlay.dispose();
    }
    if (!sameLayout) {
      this.props?.dispose();
      this.atlas?.dispose();
      this.atlas = new LabelAtlas(PropKit.labelTexts(L), this.tokens.label);
      this.props = new PropKit(L, this.atlas);
      this.orbits = [threeQuarter(L), threeQuarter(L)];
    }
    this.layout = L;
    const dark = this.isDark();
    this.props!.applyTheme(this.tokens, dark);
    this.people.applyTheme(this.tokens);
    this.overlays.applyTheme(this.tokens);
    this.groupColors = Array.from({ length: people.groupId.length }, (_, g) => new Color().setHSL((g * 0.618034) % 1, 0.55, dark ? 0.6 : 0.45));
    this.sides = [0, 1].map(() => {
      const scene = new Scene();
      scene.background = this.tokens.clear.clone();
      scene.add(new HemisphereLight(0xffffff, 0x888888, 1.6));
      const sun = new DirectionalLight(0xffffff, 1.1);
      sun.position.set(L.W * 0.3, 40, L.H * 0.2);
      scene.add(sun);
      scene.add(this.props!.build());
      const p = new PeopleLayer(this.people, people.count);
      const o = new OverlayLayer(this.overlays, L);
      scene.add(p.group, o.group);
      return { scene, camera: new PerspectiveCamera(45, 1, 0.2, 400), people: p, overlay: o, follow: new SmoothFollow() };
    });
  }

  private isDark(): boolean {
    const bg = new Color(this.tokens.clear);
    return bg.r + bg.g + bg.b < 1.2;
  }

  /** Re-read tokens after a theme change: materials, instance colours and labels (spec §11.8). */
  applyTheme(): void {
    this.tokens = readTokens();
    const dark = this.isDark();
    this.props?.applyTheme(this.tokens, dark);
    this.people.applyTheme(this.tokens);
    this.overlays.applyTheme(this.tokens);
    this.atlas?.draw(this.tokens.label);
    for (const s of this.sides) (s.scene.background as Color).copy(this.tokens.clear);
    this.groupColors.forEach((c, g) => c.setHSL((g * 0.618034) % 1, 0.55, dark ? 0.6 : 0.45));
  }

  setMode(mode: CameraMode): void {
    if (!this.layout || !this.orbits) return;
    this.mode = mode;
    if (mode === 'threeQuarter') this.orbits = [threeQuarter(this.layout), threeQuarter(this.layout)];
    if (mode === 'topDown') this.orbits = [topDown(this.layout), topDown(this.layout)];
  }

  orbitFor(side: 0 | 1): Orbit {
    return this.orbits![this.linked ? 0 : side];
  }

  /** Follow-mode targets: the centroid of the followed group's members still inside each canteen. */
  followGroup(side: 0 | 1, members: number[] | null, dtS: number): boolean {
    const s = this.sides[side];
    if (!members) return false;
    let x = 0, z = 0, n = 0;
    for (const p of members) {
      const px = s.people.px[p], pz = s.people.py[p];
      if (px === px) { x += px; z += pz; n++; }
    }
    if (n === 0) return false;
    s.follow.step(dtS, x / n, z / n, this.reducedMotion);
    const o = this.orbitFor(side);
    o.tx = s.follow.x;
    o.tz = s.follow.z;
    return true;
  }

  /** Draw one frame. `rects` are the viewport rectangles in CSS px relative to the canvas. */
  frame(views: [View, View], renderMs: number, realMs: number, rects: [Rect | null, Rect | null], frameMs: number): void {
    if (this.lost || !this.layout) return;
    const r = this.renderer;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    if (this.canvas.width !== Math.round(cw * this.pixelRatio) || this.canvas.height !== Math.round(ch * this.pixelRatio)) r.setSize(cw, ch, false);
    this.adaptPixelRatio(frameMs, realMs);
    this.overlays.pulse(realMs, this.reducedMotion);
    // Transparent outside the viewports; each viewport paints its own background inside its scissor.
    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.setScissorTest(true);
    for (const side of [0, 1] as const) {
      const rect = rects[side];
      if (!rect || rect.w <= 0 || rect.h <= 0) continue;
      const s = this.sides[side];
      const colorOf = this.colorByGroup ? (p: number) => this.groupColors[this.groupOfPerson(p)] : null;
      s.people.update(views[side], this.layout, renderMs, this.tokens, colorOf);
      s.overlay.update(views[side], this.tokens);
      s.camera.aspect = rect.w / rect.h;
      applyOrbit(this.orbitFor(side), s.camera);
      const y = ch - rect.y - rect.h;
      r.setViewport(rect.x, y, rect.w, rect.h);
      r.setScissor(rect.x, y, rect.w, rect.h);
      r.render(s.scene, s.camera);
    }
    r.setScissorTest(false);
  }

  private personGroup: Int32Array | null = null;
  setPersonGroups(g: Int32Array): void {
    this.personGroup = g;
  }
  private groupOfPerson(p: number): number {
    return this.personGroup ? this.personGroup[p] : 0;
  }

  /** Drop the pixel ratio to 1 if frames stay above 33 ms for 2 s (spec §11.9). */
  private adaptPixelRatio(frameMs: number, realMs: number): void {
    if (this.pixelRatio <= 1) return;
    if (frameMs > 33) {
      if (this.slowSince < 0) this.slowSince = realMs;
      else if (realMs - this.slowSince > 2000) {
        this.pixelRatio = 1;
        this.renderer.setPixelRatio(1);
      }
    } else this.slowSince = -1;
  }

  setSeatTints(on: boolean): void {
    for (const s of this.sides) s.overlay.showTints = on;
  }

  /** Analytic picking (spec §11.7): people take precedence over tables. */
  pick(cssX: number, cssY: number, rects: [Rect | null, Rect | null]): Pick | null {
    for (const side of [0, 1] as const) {
      const rect = rects[side];
      if (!rect || cssX < rect.x || cssX > rect.x + rect.w || cssY < rect.y || cssY > rect.y + rect.h) continue;
      const s = this.sides[side];
      if (!s) return null;
      const ndc = new Vector2(((cssX - rect.x) / rect.w) * 2 - 1, -(((cssY - rect.y) / rect.h) * 2 - 1));
      const origin = new Vector3().setFromMatrixPosition(s.camera.matrixWorld);
      const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(s.camera).sub(origin).normalize();
      const ray = new Ray(origin, dir);
      const p = pickPerson(ray, s.people.px, s.people.py);
      if (p >= 0) return { side, kind: 'person', person: p };
      const t = pickTable(ray, this.layout!);
      if (t >= 0) return { side, kind: 'table', table: t };
      return null;
    }
    return null;
  }

  /** Plan position of a person in one canteen, from the last frame. */
  position(side: 0 | 1, p: number): [number, number] {
    const s = this.sides[side];
    return [s.people.px[p], s.people.py[p]];
  }

  dispose(): void {
    for (const s of this.sides) {
      s.people.dispose();
      s.overlay.dispose();
    }
    this.props?.dispose();
    this.atlas?.dispose();
    this.people.dispose();
    this.overlays.dispose();
    this.renderer.dispose();
  }
}
