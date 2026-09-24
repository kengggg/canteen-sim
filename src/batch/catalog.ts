import type { PairMetrics } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import type { Better } from './stats';

/** Metric catalogue (spec §7.2–7.4): what the batch view, sentences and CSV report. */
export interface MetricDef {
  id: string;
  label: string;
  unit: string;
  /** Display value = stored value × scale. */
  scale: number;
  better: Better | null;
  cls: 'primary' | 'secondary' | 'diagnostic';
  /** RunMetrics field, or a PairMetrics accessor (level / baseline). */
  run?: keyof RunMetrics;
  pair?: (pm: PairMetrics, side: 'level' | 'baseline') => number | null;
  help: string;
}

const r = (id: keyof RunMetrics, label: string, unit: string, better: Better | null, cls: MetricDef['cls'], help: string, scale = 1): MetricDef => ({ id, label, unit, scale, better, cls, run: id, help });

export const CATALOG: MetricDef[] = [
  r('walkAwayPct', 'Walk-aways', '%', 'lower', 'primary', 'People who gave up on a seat and left with takeaway, as a share of arrivals.'),
  r('entranceToSeatMeanMin', 'Entrance to seat (or giving up)', 'min', 'lower', 'primary', 'Mean time from the entrance to sitting down, or to giving up, over everyone who arrived.'),
  {
    id: 'peakUtilization', label: 'Peak seat utilization', unit: '%', scale: 100, better: 'higher', cls: 'primary',
    pair: (pm, side) => (side === 'level' ? pm.p3Level : pm.p3Baseline),
    help: 'Share of seat-time with someone sitting, over the busiest hour of the pair.',
  },
  r('peakThroughputPerHour', 'Peak throughput', 'people/h', 'higher', 'primary', 'Most people sitting down in any 60-minute window.'),
  r('entranceToSeatMedianMin', 'Entrance to seat, median', 'min', 'lower', 'secondary', 'Median of entrance-to-seat-or-give-up.'),
  r('entranceToSeatP90Min', 'Entrance to seat, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of entrance-to-seat-or-give-up.'),
  r('foodToSeatMeanMin', 'Food to seat (or giving up)', 'min', 'lower', 'secondary', 'Mean time from getting food to sitting down or giving up.'),
  r('foodToSeatMedianMin', 'Food to seat, median', 'min', 'lower', 'secondary', 'Median of food-to-seat-or-give-up.'),
  r('foodToSeatP90Min', 'Food to seat, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of food-to-seat-or-give-up.'),
  r('blockedWhileNeeded', 'Seats blocked while needed', '%', 'lower', 'secondary', 'Share of seats kept or unusable while someone with food could not find a table.', 100),
  r('seatSearchMeanMin', 'Seat search with food', 'min', 'lower', 'secondary', 'Per group: from the searcher getting food to committing or giving up (0 for claimed tables).'),
  r('seatSearchP90Min', 'Seat search with food, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of seat search time.'),
  r('queueWaitMeanMin', 'Queue wait', 'min', 'lower', 'secondary', 'Mean time from joining a queue to being served.'),
  r('queueWaitP90Min', 'Queue wait, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of queue wait.'),
  r('utilizationWhole', 'Seat utilization (whole lunch)', '%', 'higher', 'secondary', 'Share of seat-time with someone sitting, until one hour after the last arrival.', 100),
  r('shareOccupied', 'Seat time: seated', '%', null, 'diagnostic', 'Share of all seat-time spent occupied.', 100),
  r('shareHeld', 'Seat time: saved for a groupmate', '%', null, 'diagnostic', 'Share of seat-time held for a party member not yet sitting.', 100),
  r('shareClaimedEmpty', 'Seat time: reserved, group not all seated', '%', null, 'diagnostic', 'Share of seat-time at claimed tables before the group is complete.', 100),
  r('shareOpenToSmall', 'Seat time: reserved, open to small parties', '%', null, 'diagnostic', 'Share of seat-time open to solos and pairs at complete reserved tables.', 100),
  r('shareBlockedLeftover', 'Seat time: reserved, spare seats nobody can use', '%', null, 'diagnostic', 'Share of seat-time at complete reserved tables below the sharing threshold.', 100),
  r('seatEfficiencyOpenAvailable', 'Seat efficiency (open seats counted as available)', '%', null, 'diagnostic', 'occupied ÷ (occupied + held + claimedEmpty + blockedLeftover).', 100),
  r('seatEfficiencyOpenWaste', 'Seat efficiency (open seats counted as waste)', '%', null, 'diagnostic', 'occupied ÷ (occupied + held + claimedEmpty + blockedLeftover + openToSmall).', 100),
  r('turnedAwayClaimed', 'Turned away at claimed tables', 'asks', null, 'diagnostic', 'Asks refused at reserved tables.'),
  r('turnedAwayHeld', 'Turned away by held or occupied seats', 'asks', null, 'diagnostic', 'Asks refused because seats were taken or kept.'),
  r('fallbackReservers', 'Fallback reservers', 'groups', null, 'diagnostic', 'Reserving groups that found no empty table and ate free-flow.'),
  r('claimSearchMeanMin', 'Claim search time', 'min', null, 'diagnostic', 'Per reserving group: from entry to claiming a table or falling back.'),
  r('splitFeasibleGroups', 'Split-feasible walk-aways', 'groups', null, 'diagnostic', 'Walk-away groups for which enough free seats existed somewhere, just not together.'),
  r('splitFeasiblePeople', 'Split-feasible walk-away people', 'people', null, 'diagnostic', 'People in split-feasible walk-away groups.'),
  r('standingWithFoodPersonMin', 'Standing with food', 'person-min', null, 'diagnostic', 'Person-minutes spent standing still holding food.'),
  r('walkAwayServedAfterDecision', 'Walk-aways served after giving up', 'people', null, 'diagnostic', 'Walk-away people whose food came after their group gave up.'),
  r('visitMeanMin', 'Total visit of seated diners', 'min', null, 'diagnostic', 'Mean time inside for people who sat.'),
  r('stuckMinutes', 'Stuck searching', 'person-min', null, 'diagnostic', 'Person-minutes searchers with food spent exploring with no suitable table in mind.'),
  r('demandMinutes', 'Demand minutes', 'min', null, 'diagnostic', 'Minutes with at least one stuck searcher.'),
  r('events', 'Events', 'events', null, 'diagnostic', 'Events processed.'),
];

export const PRIMARY = CATALOG.filter((m) => m.cls === 'primary');
export const METRIC_BY_ID = new Map(CATALOG.map((m) => [m.id, m]));

/** Value of a metric for one side of a pair. */
export function metricValue(m: MetricDef, run: RunMetrics, pm: PairMetrics | null, side: 'level' | 'baseline'): number | null {
  if (m.pair) return pm ? m.pair(pm, side) : null;
  const v = run[m.run!];
  return typeof v === 'number' ? v : null;
}
