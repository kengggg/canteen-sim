import { META, cloneConfig, setSetting } from '../config/meta';
import type { Config } from '../config/schema';
import { validate } from '../config/validate';
import { hash4, STREAM } from '../sim/rng';

export { getSetting } from '../config/meta';

export const RESERVATION_LEVELS = [0, 0.25, 0.5, 0.75, 1];
export const SEED_COUNTS = [30, 60, 120];

/** A job is one engine run. `value` is the sweep value (sensitivity) or null. */
export interface Job {
  key: string;
  seedIndex: number;
  seed: number;
  fraction: number;
  value: number | null;
  cfg: Config;
}

/** seed_1 = seed (the live lunch); seed_i = h(seed, 11, i, 0) for i ≥ 2 (spec §10.1). */
export function batchSeeds(seed: number, n: number): number[] {
  const out = [seed >>> 0];
  for (let i = 2; i <= n; i++) out.push(hash4(seed, STREAM.batchSeed, i, 0));
  return out;
}

const EXCLUDED = new Set(['seed', 'reserve.percentA', 'crowd.groupMix', 'crowd.windowStart']);
/** Scalar numeric settings a sensitivity sweep may vary. */
export const SWEEPABLE = META.filter((m) => (m.type === 'int' || m.type === 'number' || m.type === 'time') && !EXCLUDED.has(m.id));

const jobKey = (value: number | null, fraction: number, i: number) => `${value === null ? '-' : value}|${fraction}|${i}`;

export function reservationJobs(cfg: Config, n: number): Job[] {
  const seeds = batchSeeds(cfg.seed, n);
  const jobs: Job[] = [];
  for (const f of RESERVATION_LEVELS) {
    seeds.forEach((seed, i) => {
      const c = cloneConfig(cfg);
      c.seed = seed;
      jobs.push({ key: jobKey(null, f, i), seedIndex: i, seed, fraction: f, value: null, cfg: c });
    });
  }
  return jobs;
}

/** Sensitivity sweep (spec §10.2): for each value, 0 vs the current percentA (1.0 if 0), on the same seeds. */
export function sensitivityJobs(cfg: Config, n: number, setting: string, values: number[]): { jobs: Job[]; level: number; warnings: string[] } | { error: string } {
  if (!SWEEPABLE.some((m) => m.id === setting)) return { error: `${setting} cannot be swept.` };
  if (values.length < 3 || values.length > 6) return { error: 'Pick 3 to 6 values.' };
  const level = cfg.reserve.percentA > 0 ? cfg.reserve.percentA : 1;
  const seeds = batchSeeds(cfg.seed, n);
  const jobs: Job[] = [];
  const warnings: string[] = [];
  for (const v of values) {
    const c = cloneConfig(cfg);
    setSetting(c, setting, v);
    if (setting === 'layout.seatsPerSide') {
      const k2 = 2 * Math.round(v);
      if (c.reserve.shareMinEmpty > k2) c.reserve.shareMinEmpty = k2;
      if (c.reserve.shareMinEmpty >= k2) warnings.push(`At ${v} seats per side sharing is disabled (shareMinEmpty = ${k2}).`);
    }
    const blocked = validate(c).blocking;
    if (blocked.length > 0) return { error: `The value ${v} for ${setting} cannot run: ${blocked.map((b) => b.message).join(' ')}` };
    for (const f of [0, level]) {
      seeds.forEach((seed, i) => {
        const cc = cloneConfig(c);
        cc.seed = seed;
        jobs.push({ key: jobKey(v, f, i), seedIndex: i, seed, fraction: f, value: v, cfg: cc });
      });
    }
  }
  return { jobs, level, warnings };
}
