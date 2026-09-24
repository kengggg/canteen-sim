import { signal } from '@preact/signals';
import { PoolExecutor, SlicedExecutor, runBatch, type Control } from '../batch/executors';
import { aggregate, type BatchResult } from '../batch/runner';
import type { Job } from '../batch/sweep';
import BatchWorker from '../batch/worker.ts?worker&inline';
import { MSG } from './labels';
import { controller, playing } from './store';

export interface BatchState {
  status: 'idle' | 'running' | 'done' | 'failed';
  done: number;
  total: number;
  startedAt: number;
  message: string | null;
  executor: string | null;
  result: BatchResult | null;
}

export const batch = signal<BatchState>({ status: 'idle', done: 0, total: 0, startedAt: 0, message: null, executor: null, result: null });
let ctl: Control | null = null;
/** Measured wall time of one default-size run, for estimates (the first run of a batch is the calibration run). */
export const perRunMs = signal<number | null>(null);

export function workerCount(): number {
  return Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
}

/** Run jobs with the worker pool, falling back to main-thread slices (spec §10.5). Live playback pauses. */
export async function startBatch(kind: BatchResult['kind'], jobs: Job[], setting: string | null): Promise<BatchResult | null> {
  cancelBatch();
  controller.playing = false;
  playing.value = false;
  const myCtl: Control = { cancelled: false, hidden: () => document.hidden };
  ctl = myCtl;
  const fallback = new SlicedExecutor();
  const pool = new PoolExecutor({ create: () => new BatchWorker() as unknown as never, size: workerCount(), fallback });
  const started = performance.now();
  batch.value = { status: 'running', done: 0, total: jobs.length, startedAt: started, message: null, executor: null, result: null };
  try {
    const results = await runBatch(jobs, pool, myCtl, (done, total) => {
      if (done === 1) perRunMs.value = (performance.now() - started) * Math.min(workerCount(), total);
      batch.value = { ...batch.value, done, total, executor: pool.usedFallback ? 'this tab' : `${pool.healthy} workers` };
    });
    if (!results || myCtl.cancelled) {
      batch.value = { ...batch.value, status: 'idle', result: null };
      return null;
    }
    const result = aggregate(kind, jobs, results, setting);
    batch.value = { ...batch.value, status: 'done', result, executor: pool.usedFallback ? 'this tab' : `${pool.healthy} workers` };
    return result;
  } catch (e) {
    batch.value = { ...batch.value, status: 'failed', message: MSG.batchFailed(e instanceof Error ? e.message.replace(/^Batch failed: /, '') : String(e)) };
    return null;
  }
}

/** Cancel discards the partial results (spec §10.5). */
export function cancelBatch(): void {
  if (ctl) ctl.cancelled = true;
  ctl = null;
  if (batch.value.status === 'running') batch.value = { ...batch.value, status: 'idle', result: null };
}
