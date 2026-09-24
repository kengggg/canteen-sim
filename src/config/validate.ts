import type { Config } from './schema';
import { buildLayout, type LayoutParams, MIN_FRONTAGE_MM } from '../sim/layout';

export interface Issue { code: string; message: string; settings: string[] }
export interface Validation { blocking: Issue[]; warnings: Issue[] }

/** Clamp to [lo, hi]; NaN and non-finite values fall back to the default. */
const clamp = (v: number, lo: number, hi: number, dflt: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const int = (v: number, lo: number, hi: number, dflt: number) => clamp(Math.round(v), lo, hi, dflt);
/** Metres → integer mm on a `stepMm` grid, clamped to the §9.1 range (in mm). */
const snap = (metres: number, stepMm: number, loMm: number, hiMm: number, dfltMm: number) =>
  int(Math.round((metres * 1000) / stepMm) * stepMm, loMm, hiMm, dfltMm);

/** Layout settings → integer layout parameters, rounded to their steps and clamped to the §9.1 ranges. */
export function toLayoutParams(c: Config): LayoutParams {
  return {
    cols: int(c.layout.cols, 1, 20, 10),
    rows: int(c.layout.rows, 1, 20, 10),
    seatsPerSide: int(c.layout.seatsPerSide, 2, 4, 3),
    verticalAisleMm: snap(c.layout.verticalAisle, 50, 600, 3000, 1200),
    horizontalAisleMm: snap(c.layout.horizontalAisle, 50, 600, 3000, 750),
    stallCount: int(c.layout.stallCount, 1, 60, 30),
    queueDepthMm: snap(c.layout.queueDepth, 100, 3200, 10000, 5000),
  };
}

export function validate(c: Config): Validation {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];
  const p = toLayoutParams(c);
  const L = buildLayout(p);
  const k = p.seatsPerSide;

  if (L.stalls.some((s) => s.frontage < MIN_FRONTAGE_MM)) {
    blocking.push({ code: 'frontage', message: 'Stalls are narrower than 1.8 m. Use fewer stalls or a larger hall.', settings: ['layout.stallCount', 'layout.cols', 'layout.rows', 'layout.seatsPerSide', 'layout.verticalAisle', 'layout.horizontalAisle', 'layout.queueDepth'] });
  }
  if (c.crowd.groupMix.every((w) => w === 0)) {
    blocking.push({ code: 'mixZero', message: 'The group mix needs at least one non-zero size.', settings: ['crowd.groupMix'] });
  }
  const tooBig = c.crowd.groupMix.map((w, i) => (w > 0 && i + 1 > 2 * k ? i + 1 : 0)).filter((s) => s > 0);
  if (tooBig.length > 0) {
    blocking.push({
      code: 'groupTooBig',
      message: `Groups of ${tooBig.join(' and ')} cannot sit at ${2 * k}-seat tables: set their share to 0% or use larger tables.`,
      settings: ['crowd.groupMix', 'layout.seatsPerSide'],
    });
  }
  if (L.entranceX - 1000 < 3000 + p.queueDepthMm + 3500) {
    blocking.push({ code: 'entranceTray', message: 'The entrance overlaps the tray return: add table columns.', settings: ['layout.cols'] });
  }
  if (L.exitX - 1000 < L.entranceX + 1000) {
    blocking.push({ code: 'doorsOverlap', message: 'The entrance and exit overlap: add table columns.', settings: ['layout.cols'] });
  }

  if (c.move.traySpeed > c.move.walkSpeed) {
    warnings.push({ code: 'traySpeed', message: 'Tray speed is faster than walking speed.', settings: ['move.traySpeed'] });
  }
  if (p.verticalAisleMm < 1200) {
    warnings.push({ code: 'verticalAisle', message: 'Vertical aisles no longer let two people pass (1 lane).', settings: ['layout.verticalAisle'] });
  }
  if (c.reserve.shareMinEmpty >= 2 * k) {
    warnings.push({ code: 'noSharing', message: 'No sharing: solos and pairs can never join a reserved table.', settings: ['reserve.shareMinEmpty'] });
  }
  const windowSec = (c.crowd.windowEnd - c.crowd.windowStart) * 60;
  const rho = (c.crowd.totalPeople * c.stalls.serviceMean) / (c.layout.stallCount * windowSec);
  if (rho > 0.9) {
    warnings.push({
      code: 'load',
      message: `Offered stall load ${Math.round(rho * 100) / 100} is above 0.9; queues may never clear.`,
      settings: ['crowd.totalPeople', 'stalls.serviceMean', 'layout.stallCount'],
    });
  }
  return { blocking, warnings };
}
