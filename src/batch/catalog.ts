import type { PairMetrics } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import type { Better } from './stats';

/** Metric catalogue (spec §7.2–7.4): what the batch view, sentences and CSV report. */
export interface MetricDef {
  id: string;
  label: string;
  /** How the metric reads inside a result sentence (defaults to the label, lower-cased). */
  phrase?: string;
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
  { ...r('leftPct', 'Left without eating', '%', 'lower', 'primary', 'People who left before getting food, at the door or from a queue, as a share of arrivals.'), phrase: 'the share of people who left without eating' },
  { ...r('plateMeanMin', 'Time carrying a plate', 'min', 'lower', 'primary', 'Mean time from getting food to sitting down, over everyone who got food. Plates cannot be taken away, so everyone served sits.'), phrase: 'the mean time carrying a plate' },
  {
    id: 'peakUtilization', label: 'Peak seat utilization', phrase: 'peak seat utilization', unit: '%', scale: 100, better: 'higher', cls: 'primary',
    pair: (pm, side) => (side === 'level' ? pm.p3Level : pm.p3Baseline),
    help: 'Share of seat-time with someone sitting, over the busiest hour of the pair.',
  },
  r('peakThroughputPerHour', 'Peak throughput', 'people/h', 'higher', 'primary', 'Most people sitting down in any 60-minute window.'),
  r('plateMedianMin', 'Time carrying a plate, median', 'min', 'lower', 'secondary', 'Median time from getting food to sitting down.'),
  r('plateP90Min', 'Time carrying a plate, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of the time from getting food to sitting down.'),
  r('entranceToSeatMeanMin', 'Entrance to seat', 'min', 'lower', 'secondary', 'Mean time from the entrance to sitting down, over people who sat.'),
  r('entranceToSeatMedianMin', 'Entrance to seat, median', 'min', 'lower', 'secondary', 'Median entrance-to-seat time of people who sat.'),
  r('entranceToSeatP90Min', 'Entrance to seat, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of the entrance-to-seat time of people who sat.'),
  r('peakPlatesWithoutSeat', 'Most people holding a plate with no seat', 'people', 'lower', 'secondary', 'The most people at one moment who had food and no seat found or kept for them.'),
  r('groupsSplit', 'Groups that split', 'groups', 'lower', 'secondary', 'Groups that gave up on one table after circling and sat at more than one.'),
  r('groupsSplitPct', 'Groups that split (share)', '%', 'lower', 'secondary', 'Groups that split, as a share of groups with at least one member served.'),
  r('blockedWhileNeeded', 'Seats blocked while needed', '%', 'lower', 'secondary', 'Share of seats kept or unusable while someone with food could not find a table.', 100),
  r('seatSearchMeanMin', 'Seat search with food', 'min', 'lower', 'secondary', 'Per group: from the first searcher getting food to the commit that seats its last member (0 for claimed tables).'),
  r('seatSearchP90Min', 'Seat search with food, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of seat search time.'),
  r('queueWaitMeanMin', 'Queue wait', 'min', 'lower', 'secondary', 'Mean time from joining a queue to being served.'),
  r('queueWaitP90Min', 'Queue wait, 90th percentile', 'min', 'lower', 'secondary', '90th percentile of queue wait.'),
  r('utilizationWhole', 'Seat utilization (whole lunch)', '%', 'higher', 'secondary', 'Share of seat-time with someone sitting, until one hour after the last arrival.', 100),
  r('leftDoorPct', 'Left at the door', '%', null, 'diagnostic', 'People whose group turned round at the entrance, as a share of arrivals.'),
  r('leftDoorQueues', 'Left at the door: queues too long', 'people', null, 'diagnostic', 'Door leavers for whom even the shortest queue looked too long (and the seating looked fine).'),
  r('leftDoorSeating', 'Left at the door: no room in sight', 'people', null, 'diagnostic', 'Door leavers for whom too few tables looked free (and the queues looked fine).'),
  r('leftDoorBoth', 'Left at the door: queues and seating', 'people', null, 'diagnostic', 'Door leavers for whom both the queues and the seating looked too bad.'),
  r('leftQueuePct', 'Left from a queue', '%', null, 'diagnostic', 'People who gave up after queuing past their group’s wait limit, as a share of arrivals.'),
  r('objectsCollected', 'Objects collected', 'objects', null, 'diagnostic', 'Reserving groups whose last member gave up and walked back for the bottle, umbrella or lanyard.'),
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
  r('standingWithFoodPersonMin', 'Standing with food', 'person-min', null, 'diagnostic', 'Person-minutes spent standing still holding food.'),
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
