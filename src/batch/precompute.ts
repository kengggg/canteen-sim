import { defaultConfig, type Config } from '../config/schema';
import type { PairMetrics, CohortStats } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import { MODEL_VERSION } from '../sim/version';
import { runBatch, SyncExecutor } from './executors';
import { aggregate, type BatchResult, type RunResult } from './runner';
import { reservationJobs, type Job } from './sweep';

/** Compact, embeddable evidence for the default reservation sweep (spec §10.8). */
export interface Evidence {
  v: 2;
  model: number;
  n: number;
  settings: Config;
  /** Flattened RunMetrics paths (every field except per-stall counts), in column order. */
  cols: string[];
  runs: { k: string; i: number; s: number; f: number; h: number; m: (number | boolean | null)[] }[];
  pairs: { k: string; w: [number, number]; p3: [number, number]; sh: number[]; c: Record<string, (number | null)[]> }[];
}

const COHORT_FIELDS: (keyof CohortStats)[] = ['groups', 'people', 'walkAwayPct', 'entranceToSeatMeanMin', 'entranceToSeatMedianMin', 'entranceToSeatP90Min', 'foodToSeatMeanMin'];
const sig = (x: number | null) => (x === null ? null : Number(x.toPrecision(7)));
const OMIT = new Set(['stallServed']);

type Leaf = number | boolean | null;
function flatten(obj: unknown, prefix: string, out: [string, Leaf][]): void {
  if (obj === null || typeof obj !== 'object') {
    out.push([prefix, typeof obj === 'number' ? sig(obj) : (obj as Leaf)]);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!prefix && OMIT.has(k)) continue;
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function unflatten(cols: string[], vals: Leaf[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  cols.forEach((path, j) => {
    const keys = path.split('.');
    let o = root;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (o[k] === undefined) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k] as Record<string, unknown>;
    }
    o[keys[keys.length - 1]] = vals[j];
  });
  return root;
}

export function encodeEvidence(b: BatchResult, settings: Config): Evidence {
  const pmByKey = new Map<string, PairMetrics>();
  for (const p of b.pairs) {
    const run = b.runs.find((r) => r.seedIndex === p.seedIndex && r.fraction === p.fraction && r.value === p.value)!;
    pmByKey.set(run.key, p.pm);
  }
  const flat0: [string, Leaf][] = [];
  flatten(b.runs[0].metrics, '', flat0);
  const cols = flat0.map(([k]) => k);
  return {
    v: 2,
    model: MODEL_VERSION,
    n: b.n,
    settings,
    cols,
    runs: b.runs.map((r) => {
      const f: [string, Leaf][] = [];
      flatten(r.metrics, '', f);
      const byPath = new Map(f);
      return { k: r.key, i: r.seedIndex, s: r.seed, f: r.fraction, h: r.hash, m: cols.map((c) => byPath.get(c) ?? null) };
    }),
    pairs: [...pmByKey.entries()].map(([k, pm]) => ({
      k,
      w: [pm.peakWindowStartMin, pm.peakWindowLengthMin],
      p3: [sig(pm.p3Level)!, sig(pm.p3Baseline)!],
      sh: [...pm.sharesLevel, ...pm.sharesBaseline].map((x) => sig(x)!),
      c: Object.fromEntries(Object.entries(pm.cohorts).map(([name, cp]) => [name, [...COHORT_FIELDS.map((f) => sig(cp.level[f])), ...COHORT_FIELDS.map((f) => sig(cp.baseline[f]))]])),
    })),
  };
}

/** Rebuild a BatchResult (no per-run pair inputs; PairMetrics from the evidence) from embedded evidence. */
export function decodeEvidence(ev: Evidence): BatchResult {
  const jobs: Job[] = ev.runs.map((r) => ({ key: r.k, seedIndex: r.i, seed: r.s, fraction: r.f, value: null, cfg: ev.settings }));
  const runs: RunResult[] = ev.runs.map((r) => ({
    key: r.k, seedIndex: r.i, seed: r.s, fraction: r.f, value: null, hash: r.h, pair: null as never,
    // The metric columns hold 7 significant digits; the run's identity comes from its exact fields.
    metrics: { ...(unflatten(ev.cols, r.m) as unknown as RunMetrics), seed: r.s, reserveFraction: r.f },
    shareMinEmpty: ev.settings.reserve.shareMinEmpty,
  }));
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

/** First differing path between two evidence documents, or null when identical (spec §10.8 freshness check). */
export function evidenceDiff(a: unknown, b: unknown, path = ''): string | null {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path || '(root)';
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = evidenceDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    if (d !== null) return d;
  }
  return null;
}

/** Run the default reservation sweep in Node (spec §10.8). */
export async function precomputeEvidence(cfg: Config = defaultConfig(), n = 30): Promise<Evidence> {
  const jobs = reservationJobs(cfg, n);
  const results = (await runBatch(jobs, new SyncExecutor(), { cancelled: false }))!;
  return encodeEvidence(aggregate('reservation', jobs, results), cfg);
}
