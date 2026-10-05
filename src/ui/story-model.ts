import { evidenceDigest, type Findings, type FindingStat } from '../batch/findings-data';
import { defaultConfig, type Config } from '../config/schema';
import findingsJson from '../generated/findings.json';
import { MODEL_VERSION } from '../sim/version';
import { EVIDENCE, evidenceBatch, hasDefaultSettings } from './evidence';
import { studyRowForConfig } from './sensitivity-model';

export type DoorRule = 'default' | 'queuesOnly';
const findings = findingsJson as Findings;
const current = EVIDENCE.model === MODEL_VERSION && findings.model === MODEL_VERSION && findings.evidenceDigest === evidenceDigest(EVIDENCE);

export interface ComparisonEstimate {
  n: number;
  left: Pick<FindingStat, 'a' | 'b' | 'adv'> & { lo: number | null; hi: number | null };
  plateSeconds: number;
  seatUseLost: number;
}

/** A named example, independent of edits to the live lunch. The two door rules change one input only. */
export function storyConfig(rule: DoorRule, seed: number): Config {
  const cfg = defaultConfig();
  cfg.seed = seed;
  cfg.reserve.percentA = 1;
  if (rule === 'queuesOnly') cfg.leave.roomNeeded = 0;
  return cfg;
}

/** Never interpolate missing levels or reuse default evidence for a different canteen. */
export function comparisonEstimate(cfg: Config): ComparisonEstimate | null {
  if (!current) return null;
  if (hasDefaultSettings(cfg)) {
    const at = (id: string) => evidenceBatch().stats.find((s) => s.metricId === id && s.fraction === cfg.reserve.percentA);
    const left = at('leftPct'), plate = at('plateMeanMin'), seats = at('peakUtilization');
    if (!left || !plate || !seats || left.meanA === null || left.meanB === null || left.adv.mean === null || plate.adv.mean === null || seats.adv.mean === null) return null;
    return {
      n: left.adv.nUsed,
      left: { a: left.meanA, b: left.meanB, adv: left.adv.mean, lo: left.adv.lo, hi: left.adv.hi },
      plateSeconds: plate.adv.mean * 60,
      seatUseLost: seats.adv.mean * 100,
    };
  }
  const study = studyRowForConfig(cfg);
  if (study) {
    const { leftPct: left, plateSeconds, seatUsePct } = study.metrics;
    if (left.a !== null && left.b !== null && left.delta !== null && plateSeconds.delta !== null && seatUsePct.delta !== null) {
      return { n: left.n, left: { a: left.a, b: left.b, adv: left.delta, lo: left.lo, hi: left.hi }, plateSeconds: plateSeconds.delta, seatUseLost: -seatUsePct.delta };
    }
  }
  // The published queues-only sensitivity comparison is 100% vs 0%, at otherwise default settings.
  const withDefaultDoor = { ...cfg, leave: { ...cfg.leave, roomNeeded: defaultConfig().leave.roomNeeded } };
  if (cfg.leave.roomNeeded !== 0 || cfg.reserve.percentA !== 1 || !hasDefaultSettings(withDefaultDoor)) return null;
  const row = findings.robustness.find((r) => r.id === 'queuesOnly');
  return row ? { n: findings.n, left: row.left, plateSeconds: row.plate.adv * 60, seatUseLost: row.peakUtilPct.adv } : null;
}
