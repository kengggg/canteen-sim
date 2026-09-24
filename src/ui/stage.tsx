import { useEffect, useRef } from 'preact/hooks';
import { orbitBy, panBy, zoomBy } from '../render/cameras';
import { CanteenRenderer, type Rect } from '../render/scene';
import { PH } from '../sim/types';
import { clock } from './format';
import { CANTEEN_A, CANTEEN_B, MSG } from './labels';
import { Legend } from './legend';
import { ASlider } from './slider';
import { ViewControls } from './viewcontrols';
import {
  applied, cameraMode, colorByGroup, controller, frameTick, hover, linked, playing, seatTints, theme, tick, webgl,
} from './store';

let renderer: CanteenRenderer | null = null;
export const getRenderer = () => renderer;

/** Followed group (spec §11.3): UI-only randomness, never the sim RNG. */
let followed: { members: number[]; leftAt: [number, number] } | null = null;

function pickFollowGroup(): void {
  const vA = controller.A.view(), vB = controller.B.view();
  const s = controller.A.static;
  const candidates: number[] = [];
  for (let g = 0; g < s.groupId.length; g++) {
    const first = firstPersonOf(g);
    if (first >= 0 && vA.active[first] && vB.active[first]) candidates.push(g);
  }
  if (candidates.length === 0) { followed = null; return; }
  const g = candidates[Math.floor(Math.random() * candidates.length)];
  const members: number[] = [];
  for (let p = 0; p < s.count; p++) if (s.personGroup[p] === g) members.push(p);
  followed = { members, leftAt: [-1, -1] };
}

function firstPersonOf(g: number): number {
  const s = controller.A.static;
  for (let p = 0; p < s.count; p++) if (s.personGroup[p] === g) return p;
  return -1;
}

function rectIn(el: HTMLElement | null, base: DOMRect): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
}

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxA = useRef<HTMLDivElement>(null);
  const boxB = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    renderer = CanteenRenderer.create(canvas);
    if (!renderer) {
      webgl.value = 'none';
    } else {
      renderer.setup(controller.A.layout, controller.A.static);
      renderer.setPersonGroups(controller.A.static.personGroup);
    }
    let gen = controller.generation;
    let last = performance.now();
    let lastPanel = 0;
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = t - last;
      last = t;
      controller.frame(dt);
      if (controller.playing !== playing.value) playing.value = controller.playing;
      if (controller.generation !== gen) {
        gen = controller.generation;
        followed = null;
        renderer?.setup(controller.A.layout, controller.A.static);
        renderer?.setPersonGroups(controller.A.static.personGroup);
        tick.value++;
      }
      if (renderer && webgl.value === 'ok') {
        const base = canvas.getBoundingClientRect();
        const rects: [Rect | null, Rect | null] = [rectIn(boxA.current, base), rectIn(boxB.current, base)];
        if (cameraMode.value === 'follow') {
          if (!followed) pickFollowGroup();
          if (followed) {
            const okA = renderer.followGroup(0, followed.members, dt / 1000);
            const okB = linked.value ? true : renderer.followGroup(1, followed.members, dt / 1000);
            if (!okA && followed.leftAt[0] < 0) followed.leftAt[0] = controller.tickNow;
            if (!okA && !okB) followed = null;
          }
        }
        renderer.frame([controller.A.view(), controller.B.view()], controller.renderMs, t, rects, dt);
      }
      frameTick.value++;
      if (t - lastPanel > 250) {
        lastPanel = t;
        tick.value++;
      }
    };
    raf = requestAnimationFrame(loop);
    const lost = (e: Event) => { e.preventDefault(); if (renderer) renderer.lost = true; webgl.value = 'lost'; };
    const restored = () => {
      if (!renderer) return;
      renderer.lost = false;
      renderer.setup(controller.A.layout, controller.A.static);
      webgl.value = 'ok';
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, []);

  // Keep renderer options in sync with the UI signals.
  useEffect(() => {
    if (!renderer) return;
    if (renderer.linked && !linked.value && renderer.orbits) renderer.orbits[1] = { ...renderer.orbits[0] };
    renderer.linked = linked.value;
    renderer.colorByGroup = colorByGroup.value;
    renderer.setSeatTints(seatTints.value);
    renderer.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (cameraMode.value !== 'follow') renderer.setMode(cameraMode.value);
    else followed = null;
  }, [linked.value, colorByGroup.value, seatTints.value, cameraMode.value]);

  useEffect(() => {
    // Theme tokens change after data-theme or the system scheme changes.
    const apply = () => requestAnimationFrame(() => renderer?.applyTheme());
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme.value]);

  return (
    <section class="stage" aria-label="Canteens">
      <ViewControls />
      <canvas ref={canvasRef} class="stage-canvas" aria-hidden="true" />
      <Pane side={0} boxRef={boxA} />
      <Pane side={1} boxRef={boxB} />
    </section>
  );
}

function Pane({ side, boxRef }: { side: 0 | 1; boxRef: { current: HTMLDivElement | null } }) {
  void tick.value;
  const e = side === 0 ? controller.A : controller.B;
  const cfg = applied.value;
  const status = e.done ? (e.truncated ? MSG.truncated(clock(cfg.crowd.windowStart, e.nowMs)) : MSG.finished(clock(cfg.crowd.windowStart, e.nowMs))) : null;
  const leftAt = cameraMode.value === 'follow' && followed && followed.leftAt[side] >= 0 ? `Left at ${clock(cfg.crowd.windowStart, followed.leftAt[side])}` : null;
  return (
    <div class={`pane pane-${side === 0 ? 'a' : 'b'}`}>
      <header class="pane-head">
        <h2 class="pane-title">
          <span class="pane-key">{side === 0 ? 'A' : 'B'}</span>
          {side === 0 ? CANTEEN_A.slice(4) : CANTEEN_B.slice(4)}
        </h2>
        {side === 0 ? <ASlider /> : <p class="pane-sub muted">Everyone buys food first, then finds a seat.</p>}
      </header>
      <div
        ref={boxRef}
        class="viewport"
        role="img"
        aria-label={side === 0 ? 'Canteen A: 3D view of the reservation canteen' : 'Canteen B: 3D view of the free-flow canteen'}
        {...pointerHandlers(side)}
      >
        {webgl.value === 'none' && <p class="viewport-msg">{MSG.noWebgl}</p>}
        {webgl.value === 'lost' && (
          <p class="viewport-msg">
            {MSG.contextLost} — <button type="button" class="linklike" onClick={() => { try { renderer?.renderer.forceContextRestore(); } catch { /* the browser restores it when it can */ } }}>{MSG.restore}</button>
          </p>
        )}
        {status && <p class="viewport-status">{status}</p>}
        {leftAt && <p class="viewport-status">{leftAt}</p>}
      </div>
      <Legend />
    </div>
  );
}

function pointerHandlers(side: 0 | 1) {
  const pts = new Map<number, { x: number; y: number }>();
  let moved = false;
  const L = () => controller.A.layout;
  return {
    onPointerDown: (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
    },
    onPointerMove: (e: PointerEvent) => {
      const r = renderer;
      if (!r || !r.orbits) return;
      const prev = pts.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') doPick(e);
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      const o = r.orbitFor(side);
      if (pts.size >= 2) {
        const others = [...pts.entries()].filter(([id]) => id !== e.pointerId);
        const q = others[0][1];
        const before = Math.hypot(prev.x - q.x, prev.y - q.y), after = Math.hypot(e.clientX - q.x, e.clientY - q.y);
        if (before > 0) zoomBy(o, before / after, L());
        panBy(o, dx / 2, dy / 2, L());
      } else if (e.shiftKey || e.buttons === 2) {
        panBy(o, dx, dy, L());
      } else {
        orbitBy(o, dx, dy);
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (!moved) doPick(e);
    },
    onPointerCancel: (e: PointerEvent) => pts.delete(e.pointerId),
    onPointerLeave: () => { if (pts.size === 0) hover.value = null; },
    onWheel: (e: WheelEvent) => {
      const r = renderer;
      if (!r || !r.orbits) return;
      e.preventDefault();
      zoomBy(r.orbitFor(side), Math.exp(e.deltaY * 0.0012), L());
    },
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}

function doPick(e: PointerEvent): void {
  const r = renderer;
  if (!r) return;
  const canvas = r.canvas.getBoundingClientRect();
  const boxes = document.querySelectorAll<HTMLElement>('.viewport');
  const rects: [Rect | null, Rect | null] = [rectIn(boxes[0] ?? null, canvas), rectIn(boxes[1] ?? null, canvas)];
  const p = r.pick(e.clientX - canvas.left, e.clientY - canvas.top, rects);
  hover.value = p ? { ...p, x: e.clientX, y: e.clientY } : null;
}

export const PHASE_SEATED = new Set<number>([PH.SITTING, PH.EATING, PH.STANDING]);
