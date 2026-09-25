import { defaultConfig } from '../../src/config/schema';
import { PoolExecutor, SlicedExecutor, SyncExecutor, runBatch, type WorkerLike } from '../../src/batch/executors';
import { reservationJobs } from '../../src/batch/sweep';
import { handle, type FromWorker, type ToWorker } from '../../src/batch/worker';

const small = () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 200;
  return c;
};
const jobs = reservationJobs(small(), 2);
let reference: number[] = [];
beforeAll(async () => {
  reference = (await runBatch(jobs, new SyncExecutor(), { cancelled: false }))!.map((r) => r.hash);
});

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: FromWorker }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  terminated = false;
  runs = 0;
  constructor(private mode: 'ok' | 'silent' | 'crashOnSecondRun' = 'ok') {}
  postMessage(msg: ToWorker): void {
    if (this.terminated || this.mode === 'silent') return;
    if (msg.type === 'run' && this.mode === 'crashOnSecondRun' && ++this.runs === 2) {
      setTimeout(() => this.onerror?.(new Error('boom')), 0);
      return;
    }
    setTimeout(() => handle(msg, (m) => !this.terminated && this.onmessage?.({ data: m })), 0);
  }
  terminate(): void { this.terminated = true; }
}

test('sync executor results are in job order and reproducible', async () => {
  const again = (await runBatch(jobs, new SyncExecutor(), { cancelled: false }))!.map((r) => r.hash);
  expect(again).toEqual(reference);
});

test('sliced executor yields between slices and matches the sync hashes', async () => {
  let yields = 0;
  const ex = new SlicedExecutor({ sliceMs: 1, yieldFn: async () => { yields++; } });
  const r = (await runBatch(jobs, ex, { cancelled: false }))!;
  expect(r.map((x) => x.hash)).toEqual(reference);
  expect(yields).toBeGreaterThan(jobs.length);
});

test('a healthy worker pool matches the sync hashes', async () => {
  const pool = new PoolExecutor({ create: () => new FakeWorker(), size: 3, fallback: new SyncExecutor() });
  const r = (await runBatch(jobs, pool, { cancelled: false }))!;
  expect(pool.healthy).toBe(3);
  expect(pool.usedFallback).toBe(false);
  expect(r.map((x) => x.hash)).toEqual(reference);
});

test('ping timeout, a throwing factory, or an error mid-run fall back with identical hashes', async () => {
  const silent = new PoolExecutor({ create: () => new FakeWorker('silent'), size: 2, fallback: new SyncExecutor(), pingTimeoutMs: 20 });
  expect((await runBatch(jobs, silent, { cancelled: false }))!.map((x) => x.hash)).toEqual(reference);
  expect(silent.usedFallback).toBe(true);
  const throwing = new PoolExecutor({ create: () => { throw new Error('no workers'); }, size: 2, fallback: new SyncExecutor() });
  expect((await runBatch(jobs, throwing, { cancelled: false }))!.map((x) => x.hash)).toEqual(reference);
  const crashing = new PoolExecutor({ create: () => new FakeWorker('crashOnSecondRun'), size: 2, fallback: new SyncExecutor() });
  expect((await runBatch(jobs, crashing, { cancelled: false }))!.map((x) => x.hash)).toEqual(reference);
  expect(crashing.usedFallback).toBe(true);
});

test('cancel discards partial results and runs no further jobs', async () => {
  const ctl = { cancelled: false };
  let seen = 0;
  const r = await runBatch(jobs, new SyncExecutor(), ctl, (done) => { seen = done; if (done === 3) ctl.cancelled = true; });
  expect(r).toBeNull();
  expect(seen).toBe(3);
});
