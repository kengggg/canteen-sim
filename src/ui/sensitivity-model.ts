import { msg as trText } from '../i18n';
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
  const room = c.leave.roomNeeded === 0 ? trText('ignore seating') : trText("{v0} {v1} must look free", { v0: (c.leave.roomNeeded), v1: (c.leave.roomNeeded === 1 ? 'table' : 'tables') });
  const suffix = scenario.id === 'default' ? trText(' (default)') : '';
  switch (family) {
    case 'door': return `${room}${suffix}`;
    case 'crowd': return trText("{v0} diners{v1}", { v0: (c.crowd.totalPeople), v1: (suffix) });
    case 'patience': return trText("{v0}-minute patience limit{v1}", { v0: (c.leave.waitMean / 60), v1: (suffix) });
    case 'service': return trText("{v0} seconds per serving{v1}", { v0: (c.stalls.serviceMean), v1: (suffix) });
    case 'split': return trText("Split after {v0} minutes{v1}", { v0: (c.search.splitAfter / 60), v1: (suffix) });
    case 'sharing': return c.reserve.shareMinEmpty === 6 ? 'Never share a reserved table' : trText("Share with {v0} empty seats{v1}", { v0: (c.reserve.shareMinEmpty), v1: (suffix) });
    case 'visibility': return trText("See tables within {v0} metres{v1}", { v0: (c.search.visibility), v1: (suffix) });
    case 'claimer': return `${c.reserve.claimMode === 'oneClaimer' ? trText('One person claims') : trText('The whole group claims together')}${suffix}`;
    case 'parallel': return `${c.search.parallel ? trText('All groupmates with food search') : trText('One searcher with food')}${suffix}`;
    case 'claimLimit': return trText("Claim search limit: {v0} seconds{v1}", { v0: (c.reserve.claimSearchLimit), v1: (suffix) });
    case 'rush': return trText("{v0}% of diners in the rush{v1}", { v0: (Math.round(c.crowd.peakShare * 100)), v1: (suffix) });
    case 'doorCrowd': return trText("{v0} diners; {v1}", { v0: (c.crowd.totalPeople), v1: (room) });
    case 'doorPatience': return trText("{v0}-minute patience; {v1}", { v0: (c.leave.waitMean / 60), v1: (room) });
    case 'doorService': return trText("{v0} seconds per serving; {v1}", { v0: (c.stalls.serviceMean), v1: (room) });
    case 'splitParallel': return trText("Split after {v0} minutes; {v1}", { v0: (c.search.splitAfter / 60), v1: (c.search.parallel ? 'all search' : 'one searcher') });
    default: return scenario.label;
  }
}
