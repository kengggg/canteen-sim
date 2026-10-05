import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evidenceDigest } from '../src/batch/findings-data';
import type { Evidence } from '../src/batch/precompute';
import { runStudyScenario } from '../src/batch/sensitivity';
import { leavingConclusion, summarizePairs, type SensitivityAudit, type SensitivityStudy, type StudyPair, type StudyStat } from '../src/batch/sensitivity-data';
import { STUDY_FRACTIONS, STUDY_N, STUDY_PLAN, studyPlanKey } from '../src/batch/sensitivity-plan';
import { batchSeeds } from '../src/batch/sweep';
import { defaultConfig } from '../src/config/schema';
import { MODEL_VERSION } from '../src/sim/version';
import { sensitivitySourceDigest } from './sensitivity-source';

const root = new URL('../', import.meta.url);
const sourceDigest = sensitivitySourceDigest();
const planKey = studyPlanKey();
const cache = new URL(`test-results/sensitivity/${sourceDigest}/`, root);
const evidence = JSON.parse(readFileSync(new URL('src/generated/evidence.json', root), 'utf8')) as Evidence;
if (evidence.model !== MODEL_VERSION) throw new Error('Update the base evidence before running sensitivity.');
mkdirSync(cache, { recursive: true });

function atomicWrite(url: URL, body: string): void {
  const temp = new URL(`${url.href}.tmp`);
  writeFileSync(temp, body);
  renameSync(temp, url);
}
interface Checkpoint { id: string; sourceDigest: string; planKey: string; pairs: StudyPair[] }
function checkpoint(id: string): Checkpoint | null {
  try {
    const c = JSON.parse(readFileSync(new URL(`${id}.json`, cache), 'utf8')) as Checkpoint;
    return c.id === id && c.sourceDigest === sourceDigest && c.planKey === planKey && c.pairs.length === STUDY_N * STUDY_FRACTIONS.length ? c : null;
  } catch { return null; }
}

const scenarioId = process.argv.find((a) => a.startsWith('--scenario='))?.slice('--scenario='.length);
if (scenarioId) {
  const scenario = STUDY_PLAN.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const expected = new Map(evidence.runs.map((r) => [r.k, r.h]));
  const pairs = await runStudyScenario(scenario, STUDY_N, scenario.id === 'default' ? (key, hash) => {
    if (expected.get(key) !== hash) throw new Error(`Default run ${key} disagrees with the shipped evidence.`);
  } : undefined);
  if (sensitivitySourceDigest() !== sourceDigest) throw new Error('Study source changed during execution. Rerun.');
  atomicWrite(new URL(`${scenario.id}.json`, cache), JSON.stringify({ id: scenario.id, sourceDigest, planKey, pairs } satisfies Checkpoint));
} else {
  const check = process.argv.includes('--check');
  const resume = process.argv.includes('--resume') && !check;
  const nWorkers = Number(process.env.CANTEEN_STUDY_WORKERS ?? 4);
  if (!Number.isInteger(nWorkers) || nWorkers < 1 || nWorkers > 4) throw new Error('CANTEEN_STUDY_WORKERS must be 1–4.');
  const started = performance.now();
  console.log(`${STUDY_PLAN.scenarios.length} scenarios × ${STUDY_N} lunches × 3 reservation levels; ${nWorkers} local workers. Ranges: docs/sensitivity-study-plan.md`);
  let next = 0, finished = 0;
  async function worker(): Promise<void> {
    while (next < STUDY_PLAN.scenarios.length) {
      const scenario = STUDY_PLAN.scenarios[next++];
      const cached = resume && checkpoint(scenario.id);
      if (!cached) await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/vite-node/vite-node.mjs', root)), fileURLToPath(import.meta.url), `--scenario=${scenario.id}`], { stdio: ['ignore', 'ignore', 'inherit'] });
        child.on('error', reject);
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${scenario.id} failed (exit ${code})`)));
      });
      console.log(`[${((performance.now() - started) / 1000).toFixed(0)} s] ${++finished}/${STUDY_PLAN.scenarios.length}: ${scenario.id}${cached ? ' (resumed)' : ''}`);
    }
  }
  await Promise.all(Array.from({ length: nWorkers }, worker));
  if (sensitivitySourceDigest() !== sourceDigest) throw new Error('Study source changed during execution. Rerun.');
  const checkpoints = STUDY_PLAN.scenarios.map((s) => {
    const c = checkpoint(s.id);
    if (!c) throw new Error(`Missing or invalid checkpoint: ${s.id}`);
    return c;
  });
  const audit: SensitivityAudit = { sourceDigest, planKey, scenarios: checkpoints.map(({ id, pairs }) => ({ id, pairs })) };
  const study: SensitivityStudy = {
    version: 1, model: MODEL_VERSION, n: STUDY_N, seeds: batchSeeds(defaultConfig().seed, STUDY_N), planKey, sourceDigest, evidenceDigest: evidenceDigest(evidence),
    scenarios: checkpoints.length, runs: checkpoints.length * STUDY_N * 3,
    rows: checkpoints.flatMap((c) => STUDY_FRACTIONS.map((f) => summarizePairs(c.id, c.pairs, f))),
  };
  if (study.rows.some((r) => Object.values(r.metrics).some((s) => s.missing > 0))) throw new Error('Study has missing/truncated pairs. Inspect checkpoints; no complete-study artifact was published.');
  const tidy = (value: unknown): string => JSON.stringify(value, (_key, v) => typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(8)) : v);
  const stat = (s: StudyStat, digits = 2) => {
    const intervalDigits = [s.lo, s.hi].some((v) => v !== null && v !== 0 && Math.abs(v) < 0.005) ? Math.max(digits, 3) : digits;
    return `${s.delta?.toFixed(digits) ?? 'missing'}${s.lo !== null && s.hi !== null ? ` [${s.lo.toFixed(intervalDigits)}, ${s.hi.toFixed(intervalDigits)}]` : ' [no interval]'}`;
  };
  const base = study.rows.find((r) => r.id === 'default' && r.fraction === 1)!;
  const off = study.rows.find((r) => r.id === 'door-0' && r.fraction === 1)!;
  const at100 = (id: string) => study.rows.find((r) => r.id === id && r.fraction === 1)!.metrics;
  const report = [
    '# Model 2 sensitivity results', '',
    'Generated by `npm run sensitivity`. Exploratory, uncalibrated model results; no real canteen observations. [Plan and limitations](../sensitivity-study-plan.md). [Research protocol](../research-protocol.md). No real pilot is planned.', '',
    `Model ${study.model}; ${study.scenarios} distinct settings; ${study.n} paired lunches per setting at both 50% and 100% reservation versus 0%; ${study.runs.toLocaleString('en-US')} complete runs. All planned rows are included. No missing or truncated pairs.`, '',
    `At defaults, 100% reservation changes leaving by ${stat(base.metrics.leftPct)} percentage points. With the seating check off and other settings unchanged: ${stat(off.metrics.leftPct)}. ${leavingConclusion(off.metrics.leftPct)}.`, '',
    '## What this suggests checking next', '',
    `- **Separate the two visibility roles.** At 100% reservation, the leaving gap is ${stat(at100('visibility-0').leftPct)} pp at 5 metres, versus ${stat(at100('visibility-2').leftPct)} pp at 20 metres; the default is 10 metres. This setting affects both claimers and people with food, so these results do not isolate which search process explains the change. The tested distances are assumptions, not a measured real-world range. A separately versioned [role experiment](visibility-roles-v1.md) investigates this mechanism.`,
    `- **The measures can disagree.** With 60-second service and the default door rule, reservation changes leaving by ${stat(at100('service-0').leftPct)} pp but plate-carrying time by ${stat(at100('service-0').plateSeconds)} seconds. A claim that free flow always wins every measure would overstate this study.`,
    `- **Combinations matter.** With 60-second service and the seating check off, the leaving gap is ${stat(at100('doorService-60-0').leftPct)} pp, while the plate-time change is ${stat(at100('doorService-60-0').plateSeconds)} seconds. The small apparent leaving advantage is exploratory and should not be promoted into a policy conclusion.`,
    '- **Keep the conclusion conditional.** These results identify model rules to investigate. They do not establish a best real canteen policy or justify retuning defaults to a preferred answer.', '',
    'Every change below is reservation minus free flow. Positive leaving or plate time is worse; positive seat use or throughput is better. Brackets are pointwise 95% paired intervals over simulated lunches, not model-validity ranges. The many intervals are unadjusted; an interval spanning zero does not prove equivalence. A constant sample difference has no interval under the existing statistics convention. The default setting appears only once here, even when reused in several study families.', '',
    '| Setting | Reserving | Leaving, pp | Plate time, s | Seat use, pp | Throughput, people/h |',
    '|---|---:|---:|---:|---:|---:|',
    ...study.rows.map((r) => `| ${STUDY_PLAN.scenarios.find((s) => s.id === r.id)!.label} (${r.id}) | ${r.fraction * 100}% | ${stat(r.metrics.leftPct)} | ${stat(r.metrics.plateSeconds)} | ${stat(r.metrics.seatUsePct)} | ${stat(r.metrics.throughput, 1)} |`), '',
    '## Reproduce and inspect', '',
    '- Exact setting changes: `src/batch/sensitivity-plan.ts`; the full plan and defaults are also in the JSON artifacts.',
    '- Exact per-pair values, seeds and A/B hashes: `docs/studies/model-2-sensitivity-audit.json`. Door and queue leaving are retained separately.',
    '- Compact app data: `src/generated/sensitivity.json`. Missing counts and retained sample sizes are explicit for every metric.',
    '- `npm run sensitivity -- --check` reruns the full study and checks both JSON artifacts and this report. `--resume` reuses checkpoints only for the identical source/plan, and is never used by `--check`.',
    '- `npm run test:sanity` additionally reruns the first seed of every study setting, alongside the existing sanity checks.', '',
    `Source SHA-256: \`${sourceDigest}\`. Base evidence digest: \`${study.evidenceDigest}\`.`, '',
    'This project is simulation research only. Sensitivity cannot decide which assumptions describe real diners. Preserve the baseline, state the remaining unknowns, and investigate alternative rules as separate experiments. See the research protocol for scope and reproducibility.', '',
  ].join('\n');
  mkdirSync(new URL('docs/studies/', root), { recursive: true });
  const outputs: [string, string][] = [['src/generated/sensitivity.json', tidy(study) + '\n'], ['docs/studies/model-2-sensitivity-audit.json', JSON.stringify(audit) + '\n'], ['docs/studies/model-2-sensitivity.md', report]];
  for (const [path, body] of outputs) {
    if (check) {
      if (readFileSync(new URL(path, root), 'utf8') !== body) throw new Error(`${path} is stale. Run npm run sensitivity.`);
    } else atomicWrite(new URL(path, root), body);
  }
  console.log(`${check ? 'Verified' : 'Wrote'} all study artifacts in ${((performance.now() - started) / 1000).toFixed(1)} seconds.`);
}
