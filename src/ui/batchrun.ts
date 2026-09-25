import { signal } from '@preact/signals';
import { PoolExecutor, SlicedExecutor, runBatch, type Control } from '../batch/executors';
import { aggregate, type BatchResult } from '../batch/runner';
import type { Job } from '../batch/sweep';
import BatchWorker from '../batch/worker.ts?worker&inline';
import { cloneConfig } from '../config/meta';
import type { Config } from '../config/schema';
import { MSG } from './labels';
import { appliedListeners, batchRunning, controller, playing } from './store';

export interface BatchState {
  status: 'idle' | 'running' | 'done' | 'failed';
  done: number;
  total: number;
  startedAt: number;
  message: string | null;
  executor: string | null;
  result: BatchResult | null;
  /** The applied config the batch ran with (spec §10.1); the CSV header and labels use it. */
  cfg: Config | null;
}

const IDLE: BatchState = { status: 'idle', done: 0, total: 0, startedAt: 0, message: null, executor: null, result: null, cfg: null };
export const batch = signal<BatchState>(IDLE);
let ctl: Control | null = null;
/** Measured wall time of one run (the first result of a batch is the calibration run), for estimates. */
export const perRunMs = signal<number | null>(null);

export function workerCount(): number {
  return Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
}

// Results for other settings are dropped when the live settings change (spec §10.8: other configs start empty).
appliedListeners.push((c) => {
  const b = batch.value;
  if (b.status !== 'running' && b.cfg && JSON.stringify(b.cfg) !== JSON.stringify(c)) batch.value = IDLE;
});

/** Run jobs with the worker pool, falling back to main-thread slices (spec §10.5). Live playback pauses. */
export async function startBatch(kind: BatchResult['kind'], jobs: Job[], setting: string | null, cfg: Config): Promise<BatchResult | null> {
  cancelBatch();
  controller.playing = false;
  playing.value = false;
  const myCtl: Control = { cancelled: false, hidden: () => document.hidden };
  ctl = myCtl;
  batchRunning.value = true;
  const mine = () => ctl === myCtl;
  const fallback = new SlicedExecutor();
  const pool = new PoolExecutor({ create: () => new BatchWorker() as unknown as never, size: workerCount(), fallback });
  const started = performance.now();
  const snapshot = cloneConfig(cfg);
  batch.value = { ...IDLE, status: 'running', total: jobs.length, startedAt: started, cfg: snapshot };
  const where = () => (pool.usedFallback ? 'this tab' : `${pool.healthy} workers`);
  try {
    const results = await runBatch(jobs, pool, myCtl, (done, total) => {
      if (!mine()) return;
      if (done === 1) perRunMs.value = performance.now() - started;
      batch.value = { ...batch.value, done, total, executor: where() };
    });
    if (!mine()) return null;
    ctl = null;
    batchRunning.value = false;
    if (!results || myCtl.cancelled) {
      batch.value = IDLE;
      return null;
    }
    const result = aggregate(kind, jobs, results, setting);
    batch.value = { ...batch.value, status: 'done', result, executor: where() };
    return result;
  } catch (e) {
    if (!mine()) return null;
    ctl = null;
    batchRunning.value = false;
    batch.value = { ...batch.value, status: 'failed', message: MSG.batchFailed(e instanceof Error ? e.message.replace(/^Batch failed: /, '') : String(e)) };
    return null;
  }
}

/** Cancel discards the partial results (spec §10.5). */
export function cancelBatch(): void {
  if (ctl) ctl.cancelled = true;
  ctl = null;
  batchRunning.value = false;
  if (batch.value.status === 'running') batch.value = IDLE;
}
