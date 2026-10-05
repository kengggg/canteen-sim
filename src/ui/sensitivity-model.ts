import { evidenceDigest } from '../batch/findings-data';
import type { SensitivityStudy, StudyRow } from '../batch/sensitivity-data';
import { scenarioConfig, STUDY_FRACTIONS, STUDY_N, STUDY_PLAN, studyPlanKey, studySettingsKey, type StudyScenario } from '../batch/sensitivity-plan';
import type { Config } from '../config/schema';
import studyJson from '../generated/sensitivity.json';
import { MODEL_VERSION } from '../sim/version';
import { EVIDENCE } from './evidence';

export const SENSITIVITY = studyJson as SensitivityStudy;
export function studyIsCurrent(study: SensitivityStudy): boolean {
  return study.version === 1 && study.model === MODEL_VERSION && EVIDENCE.model === MODEL_VERSION && study.n === STUDY_N && study.planKey === studyPlanKey() && study.evidenceDigest === evidenceDigest(EVIDENCE) && study.rows.length === STUDY_PLAN.scenarios.length * STUDY_FRACTIONS.length;
}
export const sensitivityCurrent = studyIsCurrent(SENSITIVITY);
const bySettings = new Map(STUDY_PLAN.scenarios.map((s) => [studySettingsKey(scenarioConfig(s)), s.id]));

export function studyRow(id: string, fraction: number): StudyRow | null {
  if (!sensitivityCurrent) return null;
  const row = SENSITIVITY.rows.find((r) => r.id === id && r.fraction === fraction);
  return row && Object.values(row.metrics).every((m) => m.n === SENSITIVITY.n && m.missing === 0) ? row : null;
}

/** Match every setting; only the seed is independent of the multi-lunch estimate. */
export function studyRowForConfig(cfg: Config): StudyRow | null {
  const id = bySettings.get(studySettingsKey(cfg));
  return id ? studyRow(id, cfg.reserve.percentA) : null;
}

/** A deduplicated scenario can belong to several grids; always name both changed axes in an interaction grid. */
export function studyCaseLabel(family: string, scenario: StudyScenario): string {
  const c = scenarioConfig(scenario);
  const room = c.leave.roomNeeded === 0 ? 'ignore seating' : `${c.leave.roomNeeded} ${c.leave.roomNeeded === 1 ? 'table' : 'tables'} must look free`;
  const suffix = scenario.id === 'default' ? ' (default)' : '';
  switch (family) {
    case 'door': return `${room}${suffix}`;
    case 'crowd': return `${c.crowd.totalPeople} diners${suffix}`;
    case 'patience': return `${c.leave.waitMean / 60}-minute patience limit${suffix}`;
    case 'service': return `${c.stalls.serviceMean} seconds per serving${suffix}`;
    case 'split': return `Split after ${c.search.splitAfter / 60} minutes${suffix}`;
    case 'sharing': return c.reserve.shareMinEmpty === 6 ? 'Never share a reserved table' : `Share with ${c.reserve.shareMinEmpty} empty seats${suffix}`;
    case 'visibility': return `See tables within ${c.search.visibility} metres${suffix}`;
    case 'claimer': return `${c.reserve.claimMode === 'oneClaimer' ? 'One person claims' : 'The whole group claims together'}${suffix}`;
    case 'parallel': return `${c.search.parallel ? 'All groupmates with food search' : 'One searcher with food'}${suffix}`;
    case 'claimLimit': return `Claim search limit: ${c.reserve.claimSearchLimit} seconds${suffix}`;
    case 'rush': return `${Math.round(c.crowd.peakShare * 100)}% of diners in the rush${suffix}`;
    case 'doorCrowd': return `${c.crowd.totalPeople} diners; ${room}`;
    case 'doorPatience': return `${c.leave.waitMean / 60}-minute patience; ${room}`;
    case 'doorService': return `${c.stalls.serviceMean} seconds per serving; ${room}`;
    case 'splitParallel': return `Split after ${c.search.splitAfter / 60} minutes; ${c.search.parallel ? 'all search' : 'one searcher'}`;
    default: return scenario.label;
  }
}
