import type { Config } from './schema';
import { buildLayout, type LayoutParams, MIN_FRONTAGE_MM } from '../sim/layout';

export interface Issue { code: string; message: string; settings: string[] }
export interface Validation { blocking: Issue[]; warnings: Issue[] }

const snap = (metres: number, stepMm: number) => Math.round((metres * 1000) / stepMm) * stepMm;

export function toLayoutParams(c: Config): LayoutParams {
  return {
    cols: c.layout.cols,
    rows: c.layout.rows,
    seatsPerSide: c.layout.seatsPerSide,
    verticalAisleMm: snap(c.layout.verticalAisle, 50),
    horizontalAisleMm: snap(c.layout.horizontalAisle, 50),
    stallCount: c.layout.stallCount,
    queueDepthMm: snap(c.layout.queueDepth, 100),
  };
}

export function validate(c: Config): Validation {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];
  const p = toLayoutParams(c);
  const L = buildLayout(p);
  const k = p.seatsPerSide;

  if (L.stalls.some((s) => s.frontage < MIN_FRONTAGE_MM)) {
    blocking.push({ code: 'frontage', message: 'Stalls are narrower than 1.8 m. Use fewer stalls or a larger hall.', settings: ['layout.stallCount'] });
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
