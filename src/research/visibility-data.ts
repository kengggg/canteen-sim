import { summarizePairs, STUDY_METRICS, type StudyPair, type StudyRow, type StudyMetric } from '../batch/sensitivity-data';
import { pairedStat, type PairedStat } from '../batch/stats';
import type { Config } from '../config/schema';
import type { RunMetrics } from '../sim/runmetrics';
import { MODEL_VERSION } from '../sim/version';
import { RESEARCH_FRACTIONS, RESEARCH_VERSION, VISIBILITY_CASES, visibilityPlanKey, type VisibilityCase } from './visibility-plan';

export interface ResearchDiagnostics {
  admittedReservingGroups: number;
  claimedGroups: number;
  fallbackGroups: number;
  claimSuccessPct: number | null;
  claimAttemptSeconds: number | null;
  /** Claimed-empty + held + blocked seat-hours over the fixed arrival window. */
  unavailableEmptySeatHours: number;
}
export interface ResearchRun {
  id: string;
  caseId: string;
  seedIndex: number;
  seed: number;
  fraction: number;
  hash: number;
  metrics: RunMetrics;
  diagnostics: ResearchDiagnostics;
}
export interface ResearchPair extends StudyPair { id: string; runA: string; runB: string }
export interface ResearchAudit {
  version: typeof RESEARCH_VERSION;
  model: number;
  sourceDigest: string;
  planKey: string;
  seeds: number[];
  cases: (VisibilityCase & { config: Config })[];
  runs: ResearchRun[];
  pairs: ResearchPair[];
}
export interface ResearchRow extends StudyRow {
  diagnostics: { a: ResearchDiagnostics; b: ResearchDiagnostics };
}
export interface ResearchContrast {
  id: string;
  label: string;
  fraction: number;
  terms: { id: string; weight: number }[];
  metrics: Record<StudyMetric, PairedStat>;
}
export interface ResearchStudy {
  version: typeof RESEARCH_VERSION;
  model: number;
  sourceDigest: string;
  planKey: string;
  n: number;
  runs: number;
  rows: ResearchRow[];
  contrasts: ResearchContrast[];
}

const caseId = (door: number, claimer: number, food: number) => `door${door}-claim${claimer}-food${food}`;
export function contrastDefinitions(): Omit<ResearchContrast, 'fraction' | 'metrics'>[] {
  const out: Omit<ResearchContrast, 'fraction' | 'metrics'>[] = [];
  for (const door of [3, 0]) {
    for (const fixed of [10, 20]) {
      out.push({ id: `claimer-door${door}-food${fixed}`, label: `Claimer 10→20 m; food ${fixed} m; door ${door}`, terms: [{ id: caseId(door, 20, fixed), weight: 1 }, { id: caseId(door, 10, fixed), weight: -1 }] });
      out.push({ id: `food-door${door}-claim${fixed}`, label: `Food search 10→20 m; claimer ${fixed} m; door ${door}`, terms: [{ id: caseId(door, fixed, 20), weight: 1 }, { id: caseId(door, fixed, 10), weight: -1 }] });
    }
    out.push({ id: `interaction-door${door}`, label: `Visibility interaction; door ${door}`, terms: [
      { id: caseId(door, 20, 20), weight: 1 }, { id: caseId(door, 10, 20), weight: -1 },
      { id: caseId(door, 20, 10), weight: -1 }, { id: caseId(door, 10, 10), weight: 1 },
    ] });
  }
  for (const claimer of [10, 20]) for (const food of [10, 20]) {
    out.push({ id: `door-claim${claimer}-food${food}`, label: `Door check on−off; claimer ${claimer} m; food ${food} m`, terms: [{ id: caseId(3, claimer, food), weight: 1 }, { id: caseId(0, claimer, food), weight: -1 }] });
  }
  return out;
}

export function summarizeResearch(audit: ResearchAudit): ResearchStudy {
  if (audit.version !== RESEARCH_VERSION || audit.model !== MODEL_VERSION || audit.planKey !== visibilityPlanKey()) throw new Error('Research plan/model mismatch');
  const n = audit.seeds.length;
  const runs = new Map(audit.runs.map((r) => [r.id, r]));
  if (runs.size !== 20 * n || audit.pairs.length !== 16 * n || audit.runs.some((r) => r.metrics.truncated)) throw new Error('Incomplete research audit');
  const meanDiagnostics = (ids: string[]): ResearchDiagnostics => Object.fromEntries(Object.keys(audit.runs[0].diagnostics).map((key) => {
    const vals = ids.map((id) => runs.get(id)!.diagnostics[key as keyof ResearchDiagnostics]);
    return [key, vals.some((v) => v === null) ? null : vals.reduce<number>((sum, v) => sum + v!, 0) / vals.length];
  })) as unknown as ResearchDiagnostics;
  const rows = VISIBILITY_CASES.flatMap((c) => RESEARCH_FRACTIONS.map((fraction) => {
    const pairs = audit.pairs.filter((p) => p.id === c.id && p.fraction === fraction);
    if (pairs.length !== n || pairs.some((p, i) => p.seedIndex !== i || p.seed !== audit.seeds[i] || runs.get(p.runA)?.hash !== p.hashA || runs.get(p.runB)?.hash !== p.hashB)) throw new Error(`Invalid pairs: ${c.id}`);
    const row = summarizePairs(c.id, pairs, fraction);
    if (Object.values(row.metrics).some((m) => m.missing > 0)) throw new Error('Missing research metric');
    return { ...row, diagnostics: { a: meanDiagnostics(pairs.map((p) => p.runA)), b: meanDiagnostics(pairs.map((p) => p.runB)) } };
  }));
  const contrasts = contrastDefinitions().flatMap((definition) => RESEARCH_FRACTIONS.map((fraction) => ({
    ...definition, fraction,
    metrics: Object.fromEntries(STUDY_METRICS.map((metric) => [metric, pairedStat(audit.seeds.map((_seed, i) => {
      const values = definition.terms.map((term) => {
        const p = audit.pairs.find((p) => p.id === term.id && p.fraction === fraction && p.seedIndex === i)!;
        return p.a[metric] === null || p.b[metric] === null ? null : term.weight * (p.a[metric]! - p.b[metric]!);
      });
      return values.some((v) => v === null) ? null : values.reduce<number>((s, v) => s + v!, 0);
    }))])) as Record<StudyMetric, PairedStat>,
  })));
  return { version: audit.version, model: audit.model, sourceDigest: audit.sourceDigest, planKey: audit.planKey, n, runs: runs.size, rows, contrasts };
}
