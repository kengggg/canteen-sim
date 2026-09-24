import { defaultConfig, type Config } from '../config/schema';
import type { PairMetrics, CohortStats } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import { MODEL_VERSION } from '../sim/version';
import { CATALOG } from './catalog';
import { runBatch, SyncExecutor } from './executors';
import { aggregate, type BatchResult, type RunResult } from './runner';
import { reservationJobs, type Job } from './sweep';

/** Compact, embeddable evidence for the default reservation sweep (spec §10.8). */
export interface Evidence {
  v: 1;
  model: number;
  n: number;
  settings: Config;
  metrics: string[];
  runs: { k: string; i: number; s: number; f: number; h: number; t: 0 | 1; m: (number | null)[] }[];
  pairs: { k: string; w: [number, number]; p3: [number, number]; sh: number[]; c: Record<string, (number | null)[]> }[];
}

const COHORT_FIELDS: (keyof CohortStats)[] = ['groups', 'people', 'walkAwayPct', 'entranceToSeatMeanMin', 'entranceToSeatMedianMin', 'entranceToSeatP90Min', 'foodToSeatMeanMin'];
const RUN_METRICS = CATALOG.filter((m) => m.run);
const sig = (x: number | null) => (x === null ? null : Number(x.toPrecision(7)));

export function encodeEvidence(b: BatchResult, settings: Config): Evidence {
  const pmByKey = new Map<string, PairMetrics>();
  for (const p of b.pairs) {
    const run = b.runs.find((r) => r.seedIndex === p.seedIndex && r.fraction === p.fraction && r.value === p.value)!;
    pmByKey.set(run.key, p.pm);
  }
  return {
    v: 1,
    model: MODEL_VERSION,
    n: b.n,
    settings,
    metrics: RUN_METRICS.map((m) => m.id),
    runs: b.runs.map((r) => ({
      k: r.key, i: r.seedIndex, s: r.seed, f: r.fraction, h: r.hash, t: r.metrics.truncated ? 1 : 0,
      m: RUN_METRICS.map((m) => { const v = r.metrics[m.run!]; return typeof v === 'number' ? sig(v) : null; }),
    })),
    pairs: [...pmByKey.entries()].map(([k, pm]) => ({
      k,
      w: [pm.peakWindowStartMin, pm.peakWindowLengthMin],
      p3: [sig(pm.p3Level)!, sig(pm.p3Baseline)!],
      sh: [...pm.sharesLevel, ...pm.sharesBaseline].map((x) => sig(x)!),
      c: Object.fromEntries(Object.entries(pm.cohorts).map(([name, cp]) => [name, [...COHORT_FIELDS.map((f) => sig(cp.level[f])), ...COHORT_FIELDS.map((f) => sig(cp.baseline[f]))]])),
    })),
  };
}

/** Rebuild a BatchResult (catalogue metrics only, no per-run pair inputs) from embedded evidence. */
export function decodeEvidence(ev: Evidence): BatchResult {
  const jobs: Job[] = ev.runs.map((r) => ({ key: r.k, seedIndex: r.i, seed: r.s, fraction: r.f, value: null, cfg: ev.settings }));
  const runs: RunResult[] = ev.runs.map((r) => {
    const metrics = { truncated: r.t === 1 } as Record<string, unknown>;
    ev.metrics.forEach((id, j) => { metrics[id] = r.m[j]; });
    return { key: r.k, seedIndex: r.i, seed: r.s, fraction: r.f, value: null, metrics: metrics as unknown as RunMetrics, hash: r.h, pair: null as never };
  });
  const pms = new Map<string, PairMetrics>();
  for (const p of ev.pairs) {
    const cohort = (xs: (number | null)[]) => {
      const side = (off: number) => Object.fromEntries(COHORT_FIELDS.map((f, j) => [f, xs[off + j]])) as unknown as CohortStats;
      return { level: side(0), baseline: side(COHORT_FIELDS.length) };
    };
    pms.set(p.k, {
      peakWindowStartMin: p.w[0], peakWindowLengthMin: p.w[1], p3Level: p.p3[0], p3Baseline: p.p3[1],
      sharesLevel: p.sh.slice(0, 6), sharesBaseline: p.sh.slice(6),
      cohorts: { R: cohort(p.c.R), N: cohort(p.c.N), Rclaimed: cohort(p.c.Rclaimed), Rfallback: cohort(p.c.Rfallback) },
    });
  }
  return aggregate('reservation', jobs, runs, null, pms);
}

/** Run the default reservation sweep in Node (spec §10.8). */
export async function precomputeEvidence(cfg: Config = defaultConfig(), n = 30): Promise<Evidence> {
  const jobs = reservationJobs(cfg, n);
  const results = (await runBatch(jobs, new SyncExecutor(), { cancelled: false }))!;
  return encodeEvidence(aggregate('reservation', jobs, results), cfg);
}
