import type { PerspectiveCamera } from 'three';
import type { StaticLayout } from '../sim/engine';

/** Orbit camera state: yaw/pitch in radians, distance and target in plan metres (x, y → world x, z). */
export interface Orbit { yaw: number; pitch: number; dist: number; tx: number; tz: number }

export type CameraMode = 'threeQuarter' | 'topDown' | 'follow';

export function threeQuarter(L: StaticLayout): Orbit {
  return { yaw: 0, pitch: 0.92, dist: Math.max(L.W, L.H) * 1.2, tx: L.W / 2, tz: L.H / 2 + 2 };
}

export function topDown(L: StaticLayout): Orbit {
  return { yaw: 0, pitch: 1.54, dist: Math.max(L.W, L.H) * 1.3, tx: L.W / 2, tz: L.H / 2 };
}

export function applyOrbit(o: Orbit, cam: PerspectiveCamera): void {
  const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  cam.position.set(o.tx + o.dist * cp * Math.sin(o.yaw), o.dist * sp, o.tz + o.dist * cp * Math.cos(o.yaw));
  cam.up.set(0, 1, 0);
  cam.lookAt(o.tx, 0, o.tz);
  cam.far = o.dist * 4 + 100;
  cam.near = 0.2;
  cam.updateProjectionMatrix();
}

export function orbitBy(o: Orbit, dxPx: number, dyPx: number): void {
  o.yaw -= dxPx * 0.006;
  o.pitch = Math.min(1.55, Math.max(0.12, o.pitch + dyPx * 0.005));
}

export function zoomBy(o: Orbit, factor: number, L: StaticLayout): void {
  o.dist = Math.min(Math.max(L.W, L.H) * 3, Math.max(4, o.dist * factor));
}

export function panBy(o: Orbit, dxPx: number, dyPx: number, L: StaticLayout): void {
  const k = o.dist * 0.0016;
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  o.tx = Math.min(L.W, Math.max(0, o.tx - (dxPx * c + dyPx * s) * k));
  o.tz = Math.min(L.H, Math.max(0, o.tz - (-dxPx * s + dyPx * c) * k));
}

/** Critically damped follow of a moving point (SmoothDamp with a 0.5 s time constant; spec §11.3). */
export class SmoothFollow {
  x = Number.NaN;
  z = Number.NaN;
  private vx = 0;
  private vz = 0;
  constructor(private readonly tau = 0.5) {}

  step(dtS: number, tx: number, tz: number, cut: boolean): void {
    if (cut || !Number.isFinite(this.x)) {
      this.x = tx; this.z = tz; this.vx = this.vz = 0;
      return;
    }
    const w = 2 / this.tau;
    const k = w * dtS;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const step = (x: number, v: number, t: number): [number, number] => {
      const ch = x - t;
      const tmp = (v + w * ch) * dtS;
      return [t + (ch + tmp) * e, (v - w * tmp) * e];
    };
    [this.x, this.vx] = step(this.x, this.vx, tx);
    [this.z, this.vz] = step(this.z, this.vz, tz);
  }
}
