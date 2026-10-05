import { cloneConfig, getSetting, setSetting } from '../config/meta';
import { defaultConfig, type Config } from '../config/schema';

/** Exploratory study fixed before its first run. Values are stress tests, not measured population ranges. */
export const STUDY_VERSION = 1;
export const STUDY_N = 30;
export const STUDY_FRACTIONS = [0.5, 1] as const;
export type StudyFraction = (typeof STUDY_FRACTIONS)[number];
export type SettingValue = number | boolean | string | number[];
export type Change = [string, SettingValue];
export interface StudyScenario { id: string; label: string; changes: Change[] }
export interface StudyFamily { id: string; label: string; explanation: string; scenarios: string[] }

export function scenarioConfig(scenario: StudyScenario): Config {
  const cfg = defaultConfig();
  for (const [key, value] of scenario.changes) setSetting(cfg, key, Array.isArray(value) ? [...value] : value);
  return cfg;
}

function makePlan(): { scenarios: StudyScenario[]; families: StudyFamily[] } {
  const scenarios: StudyScenario[] = [{ id: 'default', label: 'Default canteen', changes: [] }];
  const families: StudyFamily[] = [];
  const baseline = defaultConfig();
  const add = (id: string, label: string, changes: Change[]): string => {
    const effective = changes.filter(([key, value]) => JSON.stringify(getSetting(baseline, key)) !== JSON.stringify(value));
    const key = JSON.stringify(effective.slice().sort(([a], [b]) => a.localeCompare(b)));
    const existing = scenarios.find((s) => JSON.stringify(s.changes.slice().sort(([a], [b]) => a.localeCompare(b))) === key);
    if (existing) return existing.id;
    scenarios.push({ id, label, changes: effective });
    return id;
  };
  const factor = (id: string, label: string, explanation: string, setting: string, values: [SettingValue, string][]) => {
    families.push({ id, label, explanation, scenarios: values.map(([value, text], i) => add(`${id}-${i}`, text, [[setting, value]])) });
  };
  factor('door', 'Judging the seating at the door', 'How many tables must look free to a group of average patience? Zero means groups judge only queues. Reserved tables still look fully taken in every other case.', 'leave.roomNeeded', [[0, 'Ignore seating at the door'], [1, '1 table must look free'], [3, '3 tables must look free (default)'], [6, '6 tables must look free']]);
  factor('crowd', 'Number of diners', 'Change the crowd while keeping the arrival pattern and the 600-seat layout fixed.', 'crowd.totalPeople', [[1200, '1,200 diners'], [1800, '1,800 diners (default)'], [2600, '2,600 diners']]);
  factor('patience', 'Willingness to wait', 'The average patience limit affects both the decision at the door and giving up in a queue. It is not a measured waiting time.', 'leave.waitMean', [[300, '5-minute patience limit'], [600, '10-minute patience limit (default)'], [900, '15-minute patience limit']]);
  factor('service', 'Stall service speed', 'Keep 30 stalls and change the average time needed to serve one person.', 'stalls.serviceMean', [[60, '60 seconds per person'], [90, '90 seconds per person (default)'], [120, '120 seconds per person']]);
  factor('split', 'Willingness to split a group', 'How long people with food search before accepting seats at different tables.', 'search.splitAfter', [[0, 'Split immediately if needed'], [120, 'Split after 2 minutes (default)'], [300, 'Split after 5 minutes']]);
  factor('sharing', 'Sharing a reserved table', 'A reserved table can accept parties of up to two after its owners are seated. Change the empty-seat threshold; six disables sharing.', 'reserve.shareMinEmpty', [[2, 'Share with 2 empty seats'], [4, 'Share with 4 empty seats (default)'], [6, 'Never share a reserved table']]);
  factor('visibility', 'How far people see tables', 'Change the search distance for both table claimers and people carrying food. Occlusion is still not modelled.', 'search.visibility', [[5, 'See tables within 5 metres'], [10, 'See tables within 10 metres (default)'], [20, 'See tables within 20 metres']]);
  factor('groups', 'Group sizes', 'These are hypothetical mixes of groups of sizes 1 to 6, not proportions of people.', 'crowd.groupMix', [[[45, 35, 10, 5, 3, 2], 'Mostly solos and pairs'], [[25, 30, 20, 15, 5, 5], 'Default group mix'], [[5, 10, 15, 25, 20, 25], 'Mostly larger groups']]);
  factor('claimer', 'Who looks for a reserved table', 'Change whether one member or the whole group searches before buying food.', 'reserve.claimMode', [['oneClaimer', 'One person claims (default)'], ['together', 'The whole group claims together']]);
  factor('parallel', 'Who searches with food', 'Change whether groupmates wait at their stalls or search at the same time.', 'search.parallel', [[false, 'One searcher with food (default)'], [true, 'All groupmates with food search']]);
  factor('claimLimit', 'Time spent trying to reserve', 'Change how long a claimer keeps choosing tables before falling back to buying food first.', 'reserve.claimSearchLimit', [[0, 'No time to choose new claim targets'], [60, 'Try reserving for 60 seconds (default)'], [120, 'Try reserving for 120 seconds']]);
  factor('rush', 'Concentration of arrivals', 'Change the share of arrivals in the rush while keeping the total at 1,800 and the rush spread fixed.', 'crowd.peakShare', [[0.4, '40% of diners in the rush'], [0.6, '60% of diners in the rush (default)'], [0.8, '80% of diners in the rush']]);

  for (const [id, label, setting, values, unit] of [
    ['doorCrowd', 'Door rule × crowd size', 'crowd.totalPeople', [1200, 1800, 2600], 'diners'],
    ['doorPatience', 'Door rule × patience', 'leave.waitMean', [300, 600, 900], 'seconds of patience'],
    ['doorService', 'Door rule × service speed', 'stalls.serviceMean', [60, 90, 120], 'seconds per serving'],
  ] as const) {
    const ids: string[] = [];
    for (const value of values) for (const room of id === 'doorCrowd' ? [0, 1, 3, 6] : [0, 3]) {
      ids.push(add(`${id}-${value}-${room}`, `${value} ${unit}; ${room === 0 ? 'ignore seating' : `${room} tables must look free`}`, [[setting, value], ['leave.roomNeeded', room]]));
    }
    families.push({ id, label, explanation: 'Change both assumptions together to check whether their effects depend on each other. Every row still compares the same simulated crowd under reservation and free flow.', scenarios: ids });
  }
  families.push({ id: 'splitParallel', label: 'Splitting groups × searching together', explanation: 'Test whether allowing everyone to search changes the effect of keeping a group together longer.', scenarios: [0, 120, 300].flatMap((split) => [false, true].map((parallel) => add(`splitParallel-${split}-${parallel}`, `Split after ${split / 60} minutes; ${parallel ? 'all search' : 'one searcher'}`, [['search.splitAfter', split], ['search.parallel', parallel]]))) });
  return { scenarios, families };
}

export const STUDY_PLAN = makePlan();
/** Also covers defaults: a settings or plan edit invalidates embedded results. No seed/fraction interpolation. */
export const studyPlanKey = () => JSON.stringify({ version: STUDY_VERSION, n: STUDY_N, fractions: STUDY_FRACTIONS, default: defaultConfig(), ...STUDY_PLAN });
export function studySettingsKey(cfg: Config): string {
  const c = cloneConfig(cfg);
  c.seed = defaultConfig().seed;
  c.reserve.percentA = defaultConfig().reserve.percentA;
  return JSON.stringify(c);
}
