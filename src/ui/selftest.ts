import { PoolExecutor, SlicedExecutor, runBatch } from '../batch/executors';
import { runScenario, scenarios, type SelfTestResult } from '../batch/selftest';
import { reservationJobs } from '../batch/sweep';
import { toCsv } from '../batch/csv';
import { aggregate } from '../batch/runner';
import BatchWorker from '../batch/worker.ts?worker&inline';
import { MODEL_VERSION } from '../sim/version';
import type { FromWorker } from '../batch/worker';
import { workerCount } from './batchrun';
import { applied } from './store';

type Win = Window & { __selftest?: Record<string, SelfTestResult & { consistent: boolean; worker: boolean }>; __selftestDone?: boolean; __canteen?: unknown };

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

function inWorker(id: string): Promise<SelfTestResult | null> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = new BatchWorker();
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => { w.terminate(); resolve(null); }, 120_000);
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'selftest') { clearTimeout(timer); w.terminate(); resolve(e.data.result); }
    };
    w.onerror = () => { clearTimeout(timer); w.terminate(); resolve(null); };
    w.postMessage({ type: 'selftest', id });
  });
}

/** ?selftest=1 (spec §13.6): no renderer; each scenario three times on the main thread and three times in a worker. */
export async function runSelfTest(status: (s: string) => void): Promise<void> {
  const out: NonNullable<Win['__selftest']> = {};
  for (const s of scenarios()) {
    const results: SelfTestResult[] = [];
    for (let i = 0; i < 3; i++) {
      status(`${s.id}: main thread run ${i + 1}`);
      await pause();
      results.push(runScenario(s));
    }
    let worker = true;
    for (let i = 0; i < 3; i++) {
      status(`${s.id}: worker run ${i + 1}`);
      const r = await inWorker(s.id);
      if (r) results.push(r);
      else worker = false;
    }
    const first = JSON.stringify(results[0]);
    out[s.id] = { ...results[0], consistent: results.every((r) => JSON.stringify(r) === first), worker };
  }
  const w = window as Win;
  w.__selftest = out;
  w.__selftestDone = true;
  status('done');
}

/** Hooks for the browser tests (harmless in production). */
export function installTestHooks(): void {
  (window as Win).__canteen = {
    config: () => applied.value,
    async batch(n: number, mode: 'auto' | 'fallback' = 'auto') {
      const jobs = reservationJobs(applied.value, n);
      const fallback = new SlicedExecutor();
      const ex = mode === 'fallback' ? fallback : new PoolExecutor({ create: () => new BatchWorker() as unknown as never, size: workerCount(), fallback });
      const results = (await runBatch(jobs, ex, { cancelled: false }))!;
      const b = aggregate('reservation', jobs, results);
      const csv = toCsv(b, applied.value, { model: MODEL_VERSION, sha: 'test', exportedAt: '2026-09-24T00:00:00.000Z' });
      const lines = csv.split('\n').filter((l) => l && !l.startsWith('#'));
      return { hashes: results.map((r) => [r.key, r.hash]), usedFallback: ex instanceof PoolExecutor ? ex.usedFallback : true, csvFirstRow: lines[1] };
    },
  };
}
