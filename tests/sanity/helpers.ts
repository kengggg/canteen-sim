import type { Config } from '../../src/config/schema';
import { Sim } from '../../src/sim/engine';

export const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

export function run(cfg: Config, seed: number, fraction: number): Sim {
  const s = new Sim(cfg, { seed, reserveFraction: fraction });
  s.advanceTo(Infinity);
  return s;
}

/** Paired 95% t-interval with the spec §10.3 table for df ≤ 29. */
const T_TABLE = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];
export function pairedCI(d: number[]): { mean: number; lo: number; hi: number; se: number } {
  const n = d.length;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const t = T_TABLE[n - 2];
  return { mean, lo: mean - t * se, hi: mean + t * se, se };
}
