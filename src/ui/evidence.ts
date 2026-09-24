import { METRIC_BY_ID } from '../batch/catalog';
import { decodeEvidence, type Evidence } from '../batch/precompute';
import type { BatchResult } from '../batch/runner';
import { sentence } from '../batch/wording';
import evidenceJson from '../generated/evidence.json';

/** The precomputed default evidence shipped with the page (spec §10.8), decoded on first use. */
export const EVIDENCE = evidenceJson as unknown as Evidence;
let decoded: BatchResult | null = null;

export function evidenceBatch(): BatchResult {
  decoded ??= decodeEvidence(EVIDENCE);
  return decoded;
}

/** The P1 sentence at 100% vs 0% for the top-bar Evidence line. */
export function evidenceSentence(): string {
  const b = evidenceBatch();
  const s = b.stats.find((x) => x.metricId === 'walkAwayPct' && x.fraction === 1);
  return s ? sentence(METRIC_BY_ID.get('walkAwayPct')!, 1, s.adv, s.wins) : '';
}
