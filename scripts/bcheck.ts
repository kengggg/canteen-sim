/**
 * npm run bcheck — the B-only check of design §5 (docs/superpowers/specs/2026-09-26-model-v2-plates-design.md):
 * default settings, seeds 1–30, nobody reserving. It prints canteen B's figures only (never an A-vs-B comparison) and
 * fails if the mean share leaving without eating is above 20%, the mean time carrying a plate above 10 minutes, or
 * any run is truncated.
 */
import { defaultConfig } from '../src/config/schema';
import { createEngine } from '../src/sim/engine';

const P1_MAX = 20;
const P2_MAX = 10;
let p1 = 0, p2 = 0, truncated = 0;
const n = 30;
for (let seed = 1; seed <= n; seed++) {
  const e = createEngine(defaultConfig(), { seed, reserveFraction: 0 });
  e.advanceTo(Infinity);
  const m = e.metrics();
  if (m.truncated) truncated++;
  p1 += m.leftPct ?? 0;
  p2 += m.plateMeanMin ?? 0;
}
p1 /= n;
p2 /= n;
const pass = p1 <= P1_MAX && p2 <= P2_MAX && truncated === 0;
console.log(`B-only check (defaults, seeds 1–${n}, 0% reserving):`);
console.log(`  left without eating: mean ${p1.toFixed(2)}% (limit ${P1_MAX}%)`);
console.log(`  time carrying a plate: mean ${p2.toFixed(2)} min (limit ${P2_MAX} min)`);
console.log(`  truncated runs: ${truncated} (limit 0)`);
console.log(pass ? 'PASS' : 'FAIL');
if (!pass) process.exit(1);
