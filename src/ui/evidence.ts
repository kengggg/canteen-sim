import { decodeEvidence, type Evidence } from '../batch/precompute';
import type { BatchResult } from '../batch/runner';
import evidenceJson from '../generated/evidence.json';
import { defaultConfig, type Config } from '../config/schema';

/** The precomputed default evidence shipped with the page (spec §10.8), decoded on first use. */
export const EVIDENCE = evidenceJson as unknown as Evidence;
let decoded: BatchResult | null = null;

export function evidenceBatch(): BatchResult {
  decoded ??= decodeEvidence(EVIDENCE);
  return decoded;
}

/** Match the built-in sweep's settings independently of the one live seed and selected reservation level. */
export function hasDefaultSettings(cfg: Config): boolean {
  const base = defaultConfig();
  return JSON.stringify({ ...cfg, seed: base.seed, reserve: { ...cfg.reserve, percentA: base.reserve.percentA } }) === JSON.stringify(base);
}
