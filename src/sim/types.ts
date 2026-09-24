/** Event kinds (spec §8.5), in processing order within one ms. */
export const K = { ACTION: 1, SERVICE: 2, MOVE: 3, QUEUE: 4, ARRIVAL: 5, ADMIT: 6, TIMER: 7 } as const;

/** Event types (payload). */
export const EV = {
  SIT_END: 1,
  STAND_END: 2,
  PLACE_END: 3,
  ASK_END: 4,
  DROP_END: 5,
  SERVICE_END: 6,
  EDGE_ARRIVE: 7,
  WALKOUT_ARRIVE: 8,
  QUEUE: 9,
  GROUP_ARRIVE: 10,
  ADMIT: 11,
  PATIENCE: 12,
  CUTOFF: 13,
  RECHOOSE: 14,
  EAT_END: 15,
  STAND_START: 16,
} as const;

/** Person phases. */
export const PH = {
  OUT: 0,
  TO_STALL: 1,
  TO_FULLSTOP: 2,
  FULL_WAIT: 3,
  QUEUE: 4,
  SERVING: 5,
  WALK_OUT: 6,
  CLAIMING: 7,
  PLACING: 8,
  CONVOY: 9,
  SEARCHING: 10,
  ASKING: 11,
  WAIT_FOOD: 12,
  TO_SEAT: 13,
  SITTING: 14,
  EATING: 15,
  STANDING: 16,
  TO_TRAY: 17,
  TRAY_WAIT: 18,
  DROPPING: 19,
  TO_EXIT: 20,
  EXITED: 21,
} as const;

/** Trip purposes: what happens on reaching the trip target. */
export const PU = { NONE: 0, STALL: 1, FULLSTOP: 2, CLAIM: 3, EXPLORE: 4, TABLE: 5, SEAT: 6, TRAY: 7, EXIT: 8 } as const;

/** Group modes. */
export const GM = { FREE: 0, RESERVE: 1, CLAIMED: 2 } as const;

/** Person colour classes (spec §11.6), in precedence order. */
export const CLS = { CLAIMING: 0, QUEUING: 1, SEARCHING: 2, HOLDING: 3, EATING: 4, WALKED_AWAY: 5, WALKING: 6 } as const;

export const SIT_MS = 3000;
export const STAND_MS = 3000;
export const PLACE_MS = 3000;
export const ASK_MS = 5000;
export const REFUSE_MS = 180_000;
export const RECHOOSE_MS = 5000;
export const EXTRA_MS = 4 * 3_600_000;
