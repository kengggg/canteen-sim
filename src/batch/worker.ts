import { runJob } from './runner';
import type { Job } from './sweep';

export type ToWorker = { type: 'ping' } | { type: 'run'; job: Job };
export type FromWorker = { type: 'pong' } | { type: 'result'; key: string; result: ReturnType<typeof runJob> } | { type: 'error'; key: string; message: string };

/** The worker's message handler, separate from the bootstrap so it can be tested without a Worker. */
export function handle(msg: ToWorker, post: (m: FromWorker) => void): void {
  if (msg.type === 'ping') {
    post({ type: 'pong' });
    return;
  }
  try {
    post({ type: 'result', key: msg.job.key, result: runJob(msg.job) });
  } catch (e) {
    post({ type: 'error', key: msg.job.key, message: e instanceof Error ? e.message : String(e) });
  }
}

// Bootstrap inside a dedicated worker only.
const g = globalThis as unknown as { WorkerGlobalScope?: unknown; postMessage?: (m: unknown) => void; onmessage?: unknown };
if (typeof g.WorkerGlobalScope !== 'undefined' && typeof g.postMessage === 'function') {
  g.onmessage = (e: { data: ToWorker }) => handle(e.data, (m) => g.postMessage!(m));
}
