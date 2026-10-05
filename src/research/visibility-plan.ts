import { defaultConfig } from '../config/schema';
import { batchSeeds } from '../batch/sweep';

export const RESEARCH_VERSION = 'visibility-roles-v1' as const;
export const RESEARCH_N = 30;
export const RESEARCH_SEED = 100001;
export const RESEARCH_FRACTIONS = [0.5, 1] as const;
export interface VisibilityCase { id: string; door: 0 | 3; claimer: 10 | 20; foodSearcher: 10 | 20 }
export const VISIBILITY_CASES: VisibilityCase[] = ([3, 0] as const).flatMap((door) =>
  ([10, 20] as const).flatMap((claimer) => ([10, 20] as const).map((foodSearcher) => ({
    id: `door${door}-claim${claimer}-food${foodSearcher}`, door, claimer, foodSearcher,
  }))));
export function visibilityConfig(c: VisibilityCase) {
  const cfg = defaultConfig();
  cfg.search.visibility = c.foodSearcher;
  cfg.leave.roomNeeded = c.door;
  return cfg;
}
export const researchSeeds = (n = RESEARCH_N) => batchSeeds(RESEARCH_SEED, n);
export const visibilityPlanKey = () => JSON.stringify({ version: RESEARCH_VERSION, n: RESEARCH_N, seeds: researchSeeds(), fractions: RESEARCH_FRACTIONS, cases: VISIBILITY_CASES, defaults: defaultConfig() });
