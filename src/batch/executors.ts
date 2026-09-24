import { createEngine } from '../sim/engine';
import { runJob, type RunResult } from './runner';
import type { Job } from './sweep';
import type { FromWorker, ToWorker } from './worker';

export interface Control {
  cancelled: boolean;
  /** True while the page is hidden: the sliced executor pauses (spec §10.5). */
  hidden?: () => boolean;
}

export interface Executor {
  readonly kind: 'sync' | 'sliced' | 'workers';
  run(jobs: Job[], onResult: (r: RunResult) => void, ctl: Control): Promise<void>;
}

/** Runs jobs one after another on the calling thread (Node, tests, precompute). */
export class SyncExecutor implements Executor {
  readonly kind = 'sync';
  async run(jobs: Job[], onResult: (r: RunResult) => void, ctl: Control): Promise<void> {
    for (const j of jobs) {
      if (ctl.cancelled) return;
      onResult(runJob(j));
    }
  }
}

/** Yields a macrotask via MessageChannel (not throttled like setTimeout in background tabs). */
export function channelYield(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    // Browser and Node message ports both support the onmessage property; typed loosely for both libs.
    const port = ch.port1 as unknown as { onmessage: (() => void) | null; close(): void };
    port.onmessage = () => {
      port.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Main-thread fallback: slices of ≤ 12 ms of engine work, yielding between slices (spec §10.5). */
export class SlicedExecutor implements Executor {
  readonly kind = 'sliced';
  yields = 0;
  constructor(private readonly opts: { sliceMs?: number; yieldFn?: () => Promise<void>; now?: () => number } = {}) {}

  async run(jobs: Job[], onResult: (r: RunResult) => void, ctl: Control): Promise<void> {
    const slice = this.opts.sliceMs ?? 12;
    const yieldFn = this.opts.yieldFn ?? channelYield;
    const now = this.opts.now ?? (() => performance.now());
    for (const j of jobs) {
      const e = createEngine(j.cfg, { seed: j.seed, reserveFraction: j.fraction });
      while (!e.done) {
        if (ctl.cancelled) return;
        const t0 = now();
        while (!e.done && now() - t0 < slice) e.step(500);
        this.yields++;
        await yieldFn();
        while (ctl.hidden?.() && !ctl.cancelled) await yieldFn();
      }
      onResult({ key: j.key, seedIndex: j.seedIndex, seed: j.seed, fraction: j.fraction, value: j.value, metrics: e.metrics(), hash: e.runHash(), pair: e.pairInput() });
    }
  }
}

export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  terminate(): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror?: ((e: unknown) => void) | null;
}

export interface PoolOpts {
  create: () => WorkerLike;
  size: number;
  fallback: Executor;
  pingTimeoutMs?: number;
}

/**
 * Worker pool (spec §10.5). A worker is usable only if it answers ping with pong within 3 s and fires no error;
 * otherwise the batch uses the fallback. A later error re-queues that worker's in-flight job on the fallback.
 */
export class PoolExecutor implements Executor {
  readonly kind = 'workers';
  usedFallback = false;
  healthy = 0;
  constructor(private readonly opts: PoolOpts) {}

  private async healthCheck(): Promise<WorkerLike[]> {
    const timeout = this.opts.pingTimeoutMs ?? 3000;
    const checks: Promise<WorkerLike | null>[] = [];
    for (let i = 0; i < Math.max(1, this.opts.size); i++) {
      let w: WorkerLike;
      try {
        w = this.opts.create();
      } catch {
        checks.push(Promise.resolve(null));
        continue;
      }
      checks.push(new Promise((resolve) => {
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!ok) w.terminate();
          resolve(ok ? w : null);
        };
        const timer = setTimeout(() => done(false), timeout);
        w.onmessage = (e) => done(e.data.type === 'pong');
        w.onerror = () => done(false);
        try {
          w.postMessage({ type: 'ping' });
        } catch {
          done(false);
        }
      }));
    }
    return (await Promise.all(checks)).filter((w): w is WorkerLike => w !== null);
  }

  async run(jobs: Job[], onResult: (r: RunResult) => void, ctl: Control): Promise<void> {
    const workers = await this.healthCheck();
    this.healthy = workers.length;
    if (workers.length === 0) {
      this.usedFallback = true;
      return this.opts.fallback.run(jobs, onResult, ctl);
    }
    const queue = [...jobs];
    const retry: Job[] = [];
    let failure: string | null = null;
    await new Promise<void>((resolveAll) => {
      let live = workers.length;
      const finish = (w: WorkerLike) => {
        w.terminate();
        if (--live === 0) resolveAll();
      };
      for (const w of workers) {
        let current: Job | null = null;
        const next = () => {
          if (ctl.cancelled || failure !== null || queue.length === 0) {
            current = null;
            finish(w);
            return;
          }
          current = queue.shift()!;
          w.postMessage({ type: 'run', job: current });
        };
        const lost = () => {
          if (current) retry.push(current);
          current = null;
          w.onmessage = null;
          w.onerror = null;
          finish(w);
        };
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'result') {
            if (!ctl.cancelled) onResult(m.result);
            next();
          } else if (m.type === 'error') {
            failure = m.message;
            current = null;
            finish(w);
          }
        };
        w.onerror = lost;
        w.onmessageerror = lost;
        next();
      }
    });
    if (failure !== null) throw new Error(`Batch failed: ${failure}`);
    if (ctl.cancelled) return;
    const rest = [...retry, ...queue];
    if (rest.length > 0) {
      this.usedFallback = true;
      await this.opts.fallback.run(rest, onResult, ctl);
    }
  }
}

/** Run a batch; resolves to the results in job order, or null when cancelled (partial results are discarded). */
export async function runBatch(jobs: Job[], ex: Executor, ctl: Control, onProgress?: (done: number, total: number) => void): Promise<RunResult[] | null> {
  const got = new Map<string, RunResult>();
  await ex.run(jobs, (r) => {
    got.set(r.key, r);
    onProgress?.(got.size, jobs.length);
  }, ctl);
  if (ctl.cancelled) return null;
  return jobs.map((j) => {
    const r = got.get(j.key);
    if (!r) throw new Error(`Batch failed: no result for ${j.key}`);
    return r;
  });
}
