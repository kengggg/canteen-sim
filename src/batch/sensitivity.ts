import { validate } from '../config/validate';
import { pairMetrics } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import { runJob } from './runner';
import { type StudyPair, type Values } from './sensitivity-data';
import { scenarioConfig, STUDY_FRACTIONS, STUDY_N, type StudyScenario } from './sensitivity-plan';
import { batchSeeds, type Job } from './sweep';

export function studyJobs(scenario: StudyScenario, n = STUDY_N): Job[] {
  const cfg = scenarioConfig(scenario);
  const errors = validate(cfg).blocking;
  if (errors.length) throw new Error(`${scenario.id}: ${errors.map((e) => e.message).join(' ')}`);
  return batchSeeds(cfg.seed, n).flatMap((seed, seedIndex) => [0, ...STUDY_FRACTIONS].map((fraction) => ({ key: `-|${fraction}|${seedIndex}`, seedIndex, seed, fraction, value: null, cfg: { ...cfg, seed } })));
}

function values(m: RunMetrics, seatUse: number | null): Values {
  return { leftPct: m.leftPct, plateSeconds: m.plateMeanMin === null ? null : m.plateMeanMin * 60, seatUsePct: seatUse === null ? null : seatUse * 100, throughput: m.peakThroughputPerHour, doorLeftPct: m.leftDoorPct, queueLeftPct: m.leftQueuePct };
}

/** Keep only one seed's engine inputs in memory. The audit keeps exact metrics and hashes for both sides. */
export async function runStudyScenario(scenario: StudyScenario, n = STUDY_N, onRun?: (key: string, hash: number) => void): Promise<StudyPair[]> {
  const jobs = studyJobs(scenario, n);
  const pairs: StudyPair[] = [];
  for (let i = 0; i < jobs.length; i += 3) {
    const b = runJob(jobs[i]);
    onRun?.(b.key, b.hash);
    for (let j = 1; j <= 2; j++) {
      const a = runJob(jobs[i + j]);
      onRun?.(a.key, a.hash);
      const truncated = a.metrics.truncated || b.metrics.truncated;
      const pm = truncated ? null : pairMetrics(a.pair, b.pair, a.fraction);
      pairs.push({ seedIndex: a.seedIndex, seed: a.seed, fraction: STUDY_FRACTIONS[j - 1], hashA: a.hash, hashB: b.hash, truncated, a: values(a.metrics, pm?.p3Level ?? null), b: values(b.metrics, pm?.p3Baseline ?? null) });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return pairs;
}
