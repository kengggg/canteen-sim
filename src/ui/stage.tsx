import { useEffect, useMemo, useRef } from 'preact/hooks';
import { orbitBy, panBy, zoomBy } from '../render/cameras';
import { CanteenRenderer, type Rect } from '../render/scene';
import { clock } from './format';
import { CANTEEN_A, CANTEEN_B, MSG } from './labels';
import { Legend } from './legend';
import { ASlider } from './slider';
import {
  applied, cameraMode, colorByGroup, controller, frameTick, hover, linked, playing, seatTints, themeGen, tick, webgl,
} from './store';
import { ViewControls } from './viewcontrols';

let renderer: CanteenRenderer | null = null;
export const getRenderer = () => renderer;

/** Followed group (spec §11.3): UI-only randomness, never the sim RNG. */
interface Followed { group: number; members: number[]; leftAt: [number, number] }
let followed: Followed | null = null;
let membersByGroup: number[][] = [];
export const getFollowed = () => (followed ? { group: followed.group, leftAt: followed.leftAt } : null);

function indexGroups(): void {
  const s = controller.A.static;
  membersByGroup = Array.from({ length: s.groupId.length }, () => []);
  for (let p = 0; p < s.count; p++) membersByGroup[s.personGroup[p]].push(p);
}

function pickFollowGroup(): void {
  const vA = controller.A.view(), vB = controller.B.view();
  const candidates: number[] = [];
  membersByGroup.forEach((m, g) => { if (m.length && vA.active[m[0]] && vB.active[m[0]]) candidates.push(g); });
  if (candidates.length === 0) { followed = null; return; }
  const g = candidates[Math.floor(Math.random() * candidates.length)];
  followed = { group: g, members: membersByGroup[g], leftAt: [-1, -1] };
}

function rectIn(el: HTMLElement | null, base: DOMRect): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
}

function viewportRects(): [Rect | null, Rect | null] {
  const base = renderer!.canvas.getBoundingClientRect();
  const boxes = document.querySelectorAll<HTMLElement>('.viewport');
  return [rectIn(boxes[0] ?? null, base), rectIn(boxes[1] ?? null, base)];
}

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    renderer = CanteenRenderer.create(canvas);
    if (!renderer) {
      webgl.value = 'none';
    } else {
      renderer.setup(controller.A.layout, controller.A.static);
      renderer.setPersonGroups(controller.A.static.personGroup);
    }
    indexGroups();
    let gen = controller.generation;
    let last = performance.now();
    let lastPanel = 0;
    let raf = 0;
    let pickTimer = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = t - last;
      last = t;
      controller.frame(dt);
      if (controller.playing !== playing.value) playing.value = controller.playing;
      if (controller.generation !== gen) {
        gen = controller.generation;
        followed = null;
        indexGroups();
        renderer?.setup(controller.A.layout, controller.A.static);
        renderer?.setPersonGroups(controller.A.static.personGroup);
        tick.value++;
      }
      if (renderer && webgl.value === 'ok') {
        const views = [controller.A.view(), controller.B.view()] as const;
        if (cameraMode.value === 'follow') {
          if (!followed && t - pickTimer > 500) {
            pickTimer = t;
            pickFollowGroup();
          }
          if (followed) {
            const f = followed;
            for (const side of [0, 1] as const) {
              // "Left" is judged on the engine's view; render positions can lag a frame behind a skip.
              const inside = f.members.some((p) => views[side].active[p] === 1);
              if (!inside) { if (f.leftAt[side] < 0) f.leftAt[side] = controller.tickNow; continue; }
              renderer.followGroup(side, f.members, dt / 1000);
            }
            if (f.leftAt[0] >= 0 && f.leftAt[1] >= 0) followed = null;
          }
        }
        renderer.frame([views[0], views[1]], controller.renderMs, t, viewportRects(), dt);
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
      renderer.applyTheme();
      webgl.value = 'ok';
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    // A tap or click outside the canteens dismisses the hover card (spec §11.7).
    const outside = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.viewport')) hover.value = null; };
    document.addEventListener('pointerdown', outside);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);

  // Keep renderer options in sync with the UI signals.
  useEffect(() => {
    if (!renderer) return;
    renderer.linked = linked.value;
    renderer.colorByGroup = colorByGroup.value;
    renderer.setSeatTints(seatTints.value);
    renderer.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (cameraMode.value !== 'follow') renderer.setMode(cameraMode.value);
    else { renderer.mode = 'follow'; followed = null; }
  }, [linked.value, colorByGroup.value, seatTints.value, cameraMode.value]);

  // Theme tokens change with data-theme (ours or the host's) or the system scheme; see App's observer.
  useEffect(() => {
    requestAnimationFrame(() => renderer?.applyTheme());
  }, [themeGen.value]);

  return (
    <section class="stage" aria-label="Canteens">
      <ViewControls />
      <canvas ref={canvasRef} class="stage-canvas" aria-hidden="true" />
      <Pane side={0} />
      <Pane side={1} />
    </section>
  );
}

function Pane({ side }: { side: 0 | 1 }) {
  void tick.value;
  const e = side === 0 ? controller.A : controller.B;
  const cfg = applied.value;
  const status = e.done ? (e.truncated ? MSG.truncated(clock(cfg.crowd.windowStart, e.nowMs)) : MSG.finished(clock(cfg.crowd.windowStart, e.nowMs))) : null;
  const leftAt = cameraMode.value === 'follow' && followed && followed.leftAt[side] >= 0 ? `Left at ${clock(cfg.crowd.windowStart, followed.leftAt[side])}` : null;
  const handlers = usePointerHandlers(side);
  return (
    <div class={`pane pane-${side === 0 ? 'a' : 'b'}`}>
      <header class="pane-head">
        <h2 class="pane-title">
          <span class="pane-key">{side === 0 ? 'A' : 'B'}</span>
          {side === 0 ? CANTEEN_A.slice(4) : CANTEEN_B.slice(4)}
        </h2>
        {side === 0 ? <ASlider /> : <p class="pane-sub muted">Everyone buys food first, then finds a seat.</p>}
      </header>
      <div class="viewport-wrap">
        <div
          class="viewport"
          role="img"
          aria-label={side === 0 ? 'Canteen A: 3D view of the reservation canteen' : 'Canteen B: 3D view of the free-flow canteen'}
          {...handlers}
        />
        {webgl.value === 'none' && <p class="viewport-msg">{MSG.noWebgl}</p>}
        {webgl.value === 'lost' && (
          <p class="viewport-msg">
            {MSG.contextLost} — <button type="button" class="linklike" onClick={() => renderer?.restoreContext()}>{MSG.restore}</button>
          </p>
        )}
        {status && <p class="viewport-status">{status}</p>}
        {leftAt && <p class="viewport-status viewport-status-2">{leftAt}</p>}
      </div>
      <Legend />
    </div>
  );
}

/** Pointer gestures for one viewport. Gesture state persists across renders (panels re-render every 250 ms). */
function usePointerHandlers(side: 0 | 1) {
  const state = useRef({ pts: new Map<number, { x: number; y: number }>(), moved: false });
  return useMemo(() => {
    const st = state.current;
    const L = () => controller.A.layout;
    const changed = () => renderer?.syncFrom(side);
    return {
      onPointerDown: (e: PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        st.moved = false;
      },
      onPointerMove: (e: PointerEvent) => {
        const r = renderer;
        if (!r || !r.orbits) return;
        const prev = st.pts.get(e.pointerId);
        if (!prev) {
          if (e.pointerType === 'mouse') doPick(e);
          return;
        }
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) st.moved = true;
        const o = r.orbitFor(side);
        if (st.pts.size >= 2) {
          const q = [...st.pts.entries()].find(([id]) => id !== e.pointerId)![1];
          const before = Math.hypot(prev.x - q.x, prev.y - q.y), after = Math.hypot(e.clientX - q.x, e.clientY - q.y);
          if (before > 0 && after > 0) zoomBy(o, before / after, L());
          panBy(o, dx / 2, dy / 2, L());
        } else if (e.shiftKey || e.buttons === 2) {
          panBy(o, dx, dy, L());
        } else {
          orbitBy(o, dx, dy);
        }
        changed();
        st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      },
      onPointerUp: (e: PointerEvent) => {
        st.pts.delete(e.pointerId);
        if (!st.moved) doPick(e);
      },
      onPointerCancel: (e: PointerEvent) => st.pts.delete(e.pointerId),
      onPointerLeave: (e: PointerEvent) => {
        // A touch tap ends with pointerleave; only a mouse leaving the view clears its hover card.
        if (e.pointerType === 'mouse' && st.pts.size === 0) hover.value = null;
      },
      onWheel: (e: WheelEvent) => {
        const r = renderer;
        if (!r || !r.orbits) return;
        e.preventDefault();
        zoomBy(r.orbitFor(side), Math.exp(e.deltaY * 0.0012), L());
        changed();
      },
      onContextMenu: (e: Event) => e.preventDefault(),
    };
  }, [side]);
}

function doPick(e: PointerEvent): void {
  const r = renderer;
  if (!r) return;
  const canvas = r.canvas.getBoundingClientRect();
  const p = r.pick(e.clientX - canvas.left, e.clientY - canvas.top, viewportRects());
  hover.value = p ? { ...p, x: e.clientX, y: e.clientY } : null;
}
