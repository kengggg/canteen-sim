import type { Ray } from 'three';
import type { StaticLayout } from '../sim/engine';
import { TABLE_TOP_Y } from './props';

export const PICK_R = 0.25;
export const PICK_H = 1.7;

/** Nearest person hit by an analytic ray–cylinder test (upright cylinders r 0.25 m, h 1.7 m; spec §11.7). */
export function pickPerson(ray: Ray, px: Float32Array, py: Float32Array): number {
  const o = ray.origin, d = ray.direction;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-12) return -1;
  let best = -1, bt = Infinity;
  for (let p = 0; p < px.length; p++) {
    const cx = px[p], cz = py[p];
    if (!(cx === cx)) continue;
    const ox = o.x - cx, oz = o.z - cz;
    const b = 2 * (d.x * ox + d.z * oz);
    const c = ox * ox + oz * oz - PICK_R * PICK_R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (t <= 0 || t >= bt) continue;
      const y = o.y + t * d.y;
      if (y >= 0 && y <= PICK_H) { bt = t; best = p; break; }
    }
  }
  return best;
}

/** Table under the ray: intersect the table-top plane, then find the table rectangle containing the point. */
export function pickTable(ray: Ray, L: StaticLayout): number {
  const o = ray.origin, d = ray.direction;
  if (Math.abs(d.y) < 1e-9) return -1;
  const t = (TABLE_TOP_Y - o.y) / d.y;
  if (t <= 0) return -1;
  const x = o.x + t * d.x, z = o.z + t * d.z;
  for (const tb of L.tables) if (x >= tb.x0 && x <= tb.x1 && z >= tb.y0 && z <= tb.y1) return tb.id;
  return -1;
}
