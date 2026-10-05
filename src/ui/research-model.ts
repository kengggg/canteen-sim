import type { ResearchStudy } from '../research/visibility-data';
import { RESEARCH_N, RESEARCH_VERSION, visibilityPlanKey } from '../research/visibility-plan';
import studyJson from '../generated/research.json';
import { MODEL_VERSION } from '../sim/version';

export const RESEARCH = studyJson as ResearchStudy;
export function researchIsCurrent(study: ResearchStudy): boolean {
  return study.version === RESEARCH_VERSION && study.model === MODEL_VERSION && study.planKey === visibilityPlanKey()
    && study.n === RESEARCH_N && study.runs === 600 && study.rows.length === 16 && study.contrasts.length === 28
    && study.rows.every((r) => Object.values(r.metrics).every((m) => m.n === RESEARCH_N && m.missing === 0));
}
export const researchCurrent = researchIsCurrent(RESEARCH);
