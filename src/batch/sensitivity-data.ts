import { pairedStat } from './stats';
import type { StudyFraction } from './sensitivity-plan';

/** All changes use A minus B. Lower is preferable for left/plate; higher for seat use/throughput. */
export const STUDY_METRICS = ['leftPct', 'plateSeconds', 'seatUsePct', 'throughput', 'doorLeftPct', 'queueLeftPct'] as const;
export type StudyMetric = (typeof STUDY_METRICS)[number];
export type Values = Record<StudyMetric, number | null>;
export interface StudyPair {
  seedIndex: number;
  seed: number;
  fraction: StudyFraction;
  hashA: number;
  hashB: number;
  truncated: boolean;
  a: Values;
  b: Values;
}
export interface StudyStat {
  a: number | null;
  b: number | null;
  delta: number | null;
  lo: number | null;
  hi: number | null;
  n: number;
  missing: number;
  allEqual: boolean;
}
export interface StudyRow {
  id: string;
  fraction: StudyFraction;
  metrics: Record<StudyMetric, StudyStat>;
}
export interface SensitivityStudy {
  version: 1;
  model: number;
  n: number;
  seeds: number[];
  planKey: string;
  sourceDigest: string;
  evidenceDigest: number;
  scenarios: number;
  runs: number;
  rows: StudyRow[];
}
export interface SensitivityAudit { sourceDigest: string; planKey: string; scenarios: { id: string; pairs: StudyPair[] }[] }

export function summarizePairs(id: string, pairs: StudyPair[], fraction: StudyFraction): StudyRow {
  const selected = pairs.filter((p) => p.fraction === fraction);
  const metrics = Object.fromEntries(STUDY_METRICS.map((metric) => {
    const complete = selected.filter((p) => !p.truncated && p.a[metric] !== null && p.b[metric] !== null);
    const diffs = selected.map((p) => p.truncated || p.a[metric] === null || p.b[metric] === null ? null : p.a[metric]! - p.b[metric]!);
    const stat = pairedStat(diffs);
    const mean = (side: 'a' | 'b') => complete.length ? complete.reduce((s, p) => s + p[side][metric]!, 0) / complete.length : null;
    return [metric, { a: mean('a'), b: mean('b'), delta: stat.mean, lo: stat.lo, hi: stat.hi, n: stat.nUsed, missing: selected.length - stat.nUsed, allEqual: stat.allEqual }];
  })) as Record<StudyMetric, StudyStat>;
  return { id, fraction, metrics };
}

export function leavingConclusion(s: StudyStat): string {
  if (s.missing > 0 || s.delta === null) return 'Incomplete comparison';
  if (s.lo === null || s.hi === null) return s.allEqual && s.delta === 0 ? 'No difference in these lunches' : 'No interval available';
  if (s.lo > 0) return 'More leave with reservation';
  if (s.hi < 0) return 'Fewer leave with reservation';
  return 'No clear difference in leaving';
}
