/**
 * npm run bench (spec §13.9): A (100%) and B at defaults, timed separately — one warm-up run, then the median of 5.
 * The timed span is createEngine + advanceTo(end) with the layout cache warm.
 * Fails if events per run drift > 10% from tests/golden/bench.json or a median exceeds 3.0 s. `--update` rewrites the
 * golden file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { defaultConfig } from '../src/config/schema';
import { createEngine } from '../src/sim/engine';

const GOLDEN = new URL('../tests/golden/bench.json', import.meta.url);
const LIMIT_MS = 3000;

function once(fraction: number): { ms: number; events: number } {
  const t0 = performance.now();
  const e = createEngine(defaultConfig(), { reserveFraction: fraction });
  e.advanceTo(Infinity);
  const ms = performance.now() - t0;
  return { ms, events: e.metrics().events };
}

const result: Record<string, { medianMs: number; events: number; eventsPerSec: number }> = {};
for (const [name, f] of [['A100', 1], ['B', 0]] as const) {
  once(f);
  const runs = Array.from({ length: 5 }, () => once(f));
  const times = runs.map((r) => r.ms).sort((a, b) => a - b);
  const median = times[2];
  result[name] = { medianMs: Math.round(median), events: runs[0].events, eventsPerSec: Math.round(runs[0].events / (median / 1000)) };
  console.log(`${name}: median ${median.toFixed(0)} ms, ${runs[0].events} events, ${(runs[0].events / (median / 1000) / 1e6).toFixed(2)} M events/s`);
}

if (process.argv.includes('--update')) {
  writeFileSync(GOLDEN, JSON.stringify({ A100: { events: result.A100.events }, B: { events: result.B.events } }, null, 2) + '\n');
  console.log('golden updated');
} else {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let ok = true;
  for (const name of ['A100', 'B']) {
    const drift = Math.abs(result[name].events - golden[name].events) / golden[name].events;
    if (drift > 0.1) { console.error(`${name}: events drifted ${(drift * 100).toFixed(1)}% from golden`); ok = false; }
    if (result[name].medianMs > LIMIT_MS) { console.error(`${name}: median ${result[name].medianMs} ms > ${LIMIT_MS} ms`); ok = false; }
  }
  if (!ok) process.exit(1);
  console.log('bench OK');
}
