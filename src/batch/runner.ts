import { createEngine } from '../sim/engine';
import { pairMetrics, type PairInput, type PairMetrics } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import { CATALOG, metricValue } from './catalog';
import { advantage, pairedStat, winCounts, type PairedStat } from './stats';
import type { Job } from './sweep';

export interface RunResult {
  key: string;
  seedIndex: number;
  seed: number;
  fraction: number;
  value: number | null;
  metrics: RunMetrics;
  hash: number;
  pair: PairInput;
  /** The run's effective reserve.shareMinEmpty (after any per-value clamp). */
  shareMinEmpty: number;
}

/** One engine run to done. */
export function runJob(job: Job): RunResult {
  const e = createEngine(job.cfg, { seed: job.seed, reserveFraction: job.fraction });
  e.advanceTo(Infinity);
  return { key: job.key, seedIndex: job.seedIndex, seed: job.seed, fraction: job.fraction, value: job.value, metrics: e.metrics(), hash: e.runHash(), pair: e.pairInput(), shareMinEmpty: job.cfg.reserve.shareMinEmpty };
}

export interface PairRecord { seedIndex: number; seed: number; fraction: number; value: number | null; pm: PairMetrics }

export interface MetricStat {
  fraction: number;
  value: number | null;
  metricId: string;
  /** Per seed index: the level (A) and baseline (B) values; null when missing or truncated. */
  a: (number | null)[];
  b: (number | null)[];
  adv: PairedStat;
  wins: { W: number; T: number; L: number; n: number } | null;
  meanA: number | null;
  meanB: number | null;
}

/** Paired statistics for one §7.5 breakdown cell (all lower-is-better: advantage = A − B). */
export interface BreakdownStat {
  fraction: number;
  value: number | null;
  metric: string;
  a: (number | null)[];
  b: (number | null)[];
  adv: PairedStat;
}
export type CohortName = 'R' | 'N' | 'Rclaimed' | 'Rfallback';
export const COHORT_METRICS = ['walkAwayPct', 'entranceToSeatMeanMin', 'entranceToSeatMedianMin', 'entranceToSeatP90Min', 'foodToSeatMeanMin'] as const;
export const SIZE_METRICS = ['walkAwayPct', 'entranceToSeatMeanMin', 'foodToSeatMeanMin'] as const;

export interface BatchResult {
  kind: 'reservation' | 'sensitivity';
  setting: string | null;
  n: number;
  levels: { fraction: number; value: number | null }[];
  runs: RunResult[];
  pairs: PairRecord[];
  stats: MetricStat[];
  cohortStats: (BreakdownStat & { cohort: CohortName })[];
  sizeStats: (BreakdownStat & { size: number })[];
  truncated: { fraction: number; value: number | null; count: number }[];
}

const mean = (xs: (number | null)[]) => {
  let s = 0, n = 0;
  for (const x of xs) if (x !== null) { s += x; n++; }
  return n === 0 ? null : s / n;
};

/** Pair every level run with its 0% baseline (same seed and sweep value); compute PairMetrics and statistics. */
export function aggregate(kind: BatchResult['kind'], jobs: Job[], results: RunResult[], setting: string | null = null, precomputed?: Map<string, PairMetrics>): BatchResult {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const n = Math.max(...jobs.map((j) => j.seedIndex)) + 1;
  const levelKeys = new Map<string, { fraction: number; value: number | null }>();
  for (const j of jobs) levelKeys.set(`${j.value}|${j.fraction}`, { fraction: j.fraction, value: j.value });
  const levels = [...levelKeys.values()].sort((x, y) => (x.value ?? 0) - (y.value ?? 0) || x.fraction - y.fraction);
  const find = (value: number | null, fraction: number, i: number) => byKey.get(`${value === null ? '-' : value}|${fraction}|${i}`);

  const pairs: PairRecord[] = [];
  const stats: MetricStat[] = [];
  const cohortStats: BatchResult['cohortStats'] = [];
  const sizeStats: BatchResult['sizeStats'] = [];
  const truncated: BatchResult['truncated'] = [];
  for (const lv of levels) {
    const lvRuns = Array.from({ length: n }, (_, i) => find(lv.value, lv.fraction, i));
    truncated.push({ ...lv, count: lvRuns.filter((r) => r?.metrics.truncated).length });
    if (lv.fraction === 0) continue;
    const pms: (PairMetrics | null)[] = [];
    for (let i = 0; i < n; i++) {
      const A = lvRuns[i], B = find(lv.value, 0, i);
      if (!A || !B) { pms.push(null); continue; }
      const pm = precomputed?.get(A.key) ?? pairMetrics(A.pair, B.pair, lv.fraction);
      pms.push(pm);
      pairs.push({ seedIndex: i, seed: A.seed, fraction: lv.fraction, value: lv.value, pm });
    }
    for (const m of CATALOG) {
      const a: (number | null)[] = [], b: (number | null)[] = [];
      for (let i = 0; i < n; i++) {
        const A = lvRuns[i], B = find(lv.value, 0, i);
        const bad = !A || !B || A.metrics.truncated || B.metrics.truncated;
        a.push(bad ? null : metricValue(m, A!.metrics, pms[i], 'level'));
        b.push(bad ? null : metricValue(m, B!.metrics, pms[i], 'baseline'));
      }
      const better = m.better;
      const diffs = better ? a.map((x, i) => advantage(x, b[i], better)) : [];
      stats.push({
        fraction: lv.fraction, value: lv.value, metricId: m.id, a, b,
        adv: pairedStat(diffs),
        wins: better ? winCounts(a.map((x, i) => [x, b[i]] as [number | null, number | null]), better) : null,
        meanA: mean(a), meanB: mean(b),
      });
    }
    // §7.5 breakdowns, with the same seed dropping.
    const badAt = (i: number) => {
      const A = lvRuns[i], B = find(lv.value, 0, i);
      return !A || !B || A.metrics.truncated || B.metrics.truncated || !pms[i];
    };
    const cell = (metric: string, get: (i: number, side: 'level' | 'baseline') => number | null): BreakdownStat => {
      const a: (number | null)[] = [], b: (number | null)[] = [];
      for (let i = 0; i < n; i++) {
        a.push(badAt(i) ? null : get(i, 'level'));
        b.push(badAt(i) ? null : get(i, 'baseline'));
      }
      return { fraction: lv.fraction, value: lv.value, metric, a, b, adv: pairedStat(a.map((x, i) => advantage(x, b[i], 'lower'))) };
    };
    for (const cohort of ['R', 'N', 'Rclaimed', 'Rfallback'] as CohortName[]) {
      for (const metric of COHORT_METRICS) cohortStats.push({ cohort, ...cell(metric, (i, side) => pms[i]!.cohorts[cohort][side][metric]) });
    }
    for (let size = 1; size <= 6; size++) {
      for (const metric of SIZE_METRICS) {
        sizeStats.push({ size, ...cell(metric, (i, side) => {
          const r = side === 'level' ? lvRuns[i]! : find(lv.value, 0, i)!;
          return r.metrics.bySize?.[size - 1]?.[metric] ?? null;
        }) });
      }
    }
  }
  return { kind, setting, n, levels, runs: results, pairs, stats, cohortStats, sizeStats, truncated };
}
