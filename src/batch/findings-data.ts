import { Fnv } from '../sim/hash';
import type { Evidence } from './precompute';

/**
 * Figures for the Findings panel (spec §10.9) that the shipped evidence cannot provide. `npm run findings` computes
 * them from fresh runs of the default reservation sweep (and of 100% vs 0% under other settings) and writes
 * src/generated/findings.json. Everything the evidence can provide is computed from the evidence in the app instead.
 *
 * Level keys are String(fraction): '0', '0.25', '0.5', '0.75', '1'. Minute m means 11:00 + m (the window start).
 */
export type LevelKey = '0' | '0.25' | '0.5' | '0.75' | '1';
export type ReserveLevelKey = Exclude<LevelKey, '0'>;
export const LEVEL_KEYS: LevelKey[] = ['0', '0.25', '0.5', '0.75', '1'];
export const RESERVE_LEVEL_KEYS: ReserveLevelKey[] = ['0.25', '0.5', '0.75', '1'];

/** 100% against 0% on one primary metric, as aggregate() reports it (advantage > 0 = free flow better). */
export interface FindingStat {
  /** Mean at 100% reserving. */
  a: number;
  /** Mean at 0% reserving. */
  b: number;
  adv: number;
  lo: number;
  hi: number;
  W: number;
  T: number;
  L: number;
}

/** Reserving groups at one level: `bins` are totals over all lunches; `rush` counts are per lunch. */
export interface ClaimLevel {
  /** Reserving groups by the arrival minute of their first member: bin i covers [i·binMin, (i+1)·binMin), totals over all lunches. */
  bins: { reserving: number; claimed: number }[];
  /** Claims and fallbacks per lunch by arrival period; the rush is arrivals from minute 60 to 120 (12:00–13:00). */
  rush: { claimsBefore: number; claimsRush: number; claimsAfter: number; fallbacksRush: number };
  /** Median seconds from entry to claiming a table, or to falling back. */
  claimSearchMedianS: { claimed: number; fallback: number };
  /** Median arrival minute of groups that claimed and of groups that fell back. */
  medianArrivalMin: { claimed: number; fallback: number };
  /** Share of fallbacks with no empty table to head for when the claim limit passed (fallback reason 1). */
  fallbackNoTargetShare: number;
  /** Left-without-eating % of the people in fallback groups. */
  fallbackLeftPct: number;
  /** The same, if each fallback person had the leaving rate of non-reservers arriving in the same bin; null at 100%. */
  fallbackLeftPctAtNonReserverRates: number | null;
  /** Reserving groups per lunch that turned round at the door before trying to claim. */
  doorLeftPerLunch: number;
}

/** Busiest-hour seat-time shares (fractions of all seat-time in the pair's peak window) split finer than the §7.1 states. */
export interface PeakSplit {
  /** claimedEmpty seats beyond the claiming group's size (6 − n per claimed, incomplete table). */
  claimedEmptyBeyondSize: number;
  /** claimedEmpty seats kept for members not yet assigned a seat. */
  claimedEmptyWaiting: number;
  /** blockedLeftover at tables of claiming groups of 3–5 with no joiners. */
  blockedNoJoiners: number;
  /** blockedLeftover at solo- or pair-claimed tables closed after strangers joined (plus any other cause). */
  blockedAfterJoiners: number;
  /** In the 0% run of the same pair: held seats kept for members who have no food yet. */
  baselineHeldNoFood: number;
}

/** People who left without eating at one level, by where and why (totals over all lunches, design §6.3). */
export interface LeaverAnatomy {
  arrivals: number;
  /** Turned round at the door: even the shortest queue looked too long; too few tables looked free; both. */
  doorQueues: number;
  doorSeating: number;
  doorBoth: number;
  /** Gave up in a queue after waiting past the group's limit. */
  queue: number;
  /** By 10-minute arrival bin (bin i starts at minute 10i): arrivals, door leavers and queue leavers. */
  bins: { arrivals: number; door: number; queue: number }[];
}

/**
 * Change against the same person at 0% in the same lunch (seconds), split along the trip. The parts and totals are the
 * mean over lunches of each lunch's per-person mean; the fallbackClaimer* figures are pooled over all people in all lunches.
 */
export interface TimeSplit {
  /** Entrance to joining a queue. */
  toQueueS: number;
  /** Joining a queue to service end (queue wait plus service; service time is identical per person). */
  queueAndServiceS: number;
  /** Service end to sitting down: the time carrying a plate. */
  afterServiceS: number;
  totalS: number;
  /** Share of the all-people change contributed by claimers of groups that fell back. */
  fallbackClaimerShare: number;
  /** Mean change for one such claimer. */
  fallbackClaimerPersonS: number;
  /** Such claimers as a share of all people. */
  fallbackClaimerPeopleShare: number;
}

export interface RobustRow {
  id: string;
  label: string;
  /** Human-readable setting changes against the defaults, e.g. 'crowd.totalPeople 1800 → 800'. */
  changes: string[];
  /** P1: left without eating, %. */
  left: FindingStat;
  /** P2: time carrying a plate, minutes. */
  plate: FindingStat;
  /** Peak utilization in % (P3 × 100). */
  peakUtilPct: FindingStat;
  peakThroughput: FindingStat;
  /** Mean change (min) in entrance-to-seat for people seated in both runs, 100% minus 0%, pooled over all lunches. */
  seatedE2sDeltaMin: number;
}

export interface Findings {
  v: 2;
  model: number;
  /** evidenceDigest() of the evidence these figures were computed against. */
  evidenceDigest: number;
  /** Lunches per level. */
  n: number;
  /** Mean number of completely empty tables (nobody seated, no seat held, no claim) at each minute 0…200. */
  emptyTables: { stepMin: 1; byLevel: Record<LevelKey, number[]> };
  claims: { binMin: 10; byLevel: Record<ReserveLevelKey, ClaimLevel> };
  peakSeats: Record<ReserveLevelKey, PeakSplit>;
  leavers: Record<LevelKey, LeaverAnatomy>;
  /** Mean number of people holding food with no seat found or kept for them, at each minute 0…200. */
  platesWithoutSeat: { stepMin: 1; byLevel: Record<LevelKey, number[]> };
  time: {
    /** Mean seconds per person at 0%: entrance → queue, queue join → service end, service end → outcome, and queue wait alone. */
    baseline: { toQueueS: number; queueAndServiceS: number; afterServiceS: number; queueWaitS: number };
    byLevel: Record<ReserveLevelKey, TimeSplit>;
    /** Highest share of stall-time spent serving in any whole-minute 30-minute window at 0%, mean over lunches. */
    stallBusyPeakPct: number;
  };
  robustness: RobustRow[];
}

/** Digest of the evidence runs (keys and hashes in order): findings computed against other evidence are stale. */
export function evidenceDigest(ev: Pick<Evidence, 'runs'>): number {
  const h = new Fnv();
  for (const r of ev.runs) {
    for (let i = 0; i < r.k.length; i++) h.byte(r.k.charCodeAt(i));
    h.int(r.h);
  }
  return h.h;
}
