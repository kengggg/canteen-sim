import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial, type Texture } from 'three';

const ROW = 72; // px per row at 2× resolution
const FONT = `600 44px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
const PAD = 12;

interface Entry { x: number; y: number; w: number }

/**
 * One label atlas shared by both scenes (spec §11.8): every string drawn once with fillText at 2× resolution.
 * Sprites use clones of the atlas texture, which share its image, each with its own UV window.
 */
export class LabelAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly entries = new Map<string, Entry>();
  private readonly clones: Texture[] = [];
  private readonly W = 2048;
  private H = ROW;

  constructor(private readonly texts: string[], color: string) {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = FONT;
    let x = 0, y = 0;
    for (const t of new Set(texts)) {
      const w = Math.ceil(ctx.measureText(t).width) + 2 * PAD;
      if (x + w > this.W) { x = 0; y += ROW; }
      this.entries.set(t, { x, y, w });
      x += w;
    }
    this.H = 1 << Math.ceil(Math.log2(y + ROW));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.draw(color);
  }

  /** (Re)rasterise every label in `color` (on theme change). */
  draw(color: string): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    for (const [t, e] of this.entries) ctx.fillText(t, e.x + PAD, e.y + ROW / 2);
    this.texture.needsUpdate = true;
    for (const c of this.clones) c.needsUpdate = true;
  }

  /** A sprite showing `text`, `heightM` metres tall. */
  sprite(text: string, heightM: number): Sprite {
    const e = this.entries.get(text);
    if (!e) throw new Error(`label not in atlas: ${text}`);
    const tex = this.texture.clone();
    tex.repeat.set(e.w / this.W, ROW / this.H);
    tex.offset.set(e.x / this.W, 1 - (e.y + ROW) / this.H);
    tex.needsUpdate = true;
    this.clones.push(tex);
    const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set((heightM * e.w) / ROW, heightM, 1);
    return s;
  }

  dispose(): void {
    for (const c of this.clones) c.dispose();
    this.texture.dispose();
  }
}
