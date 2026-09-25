export type ClaimMode = 'oneClaimer' | 'together';

/** Internal units: fractions 0–1, durations in seconds, clock times in minutes since midnight, lengths in metres. */
export interface Config {
  seed: number;
  crowd: {
    totalPeople: number;
    windowStart: number;
    windowEnd: number;
    peakTime: number;
    peakShare: number;
    peakSpread: number;
    groupMix: [number, number, number, number, number, number];
  };
  reserve: { percentA: number; claimMode: ClaimMode; claimSearchLimit: number; shareMinEmpty: number; shareMaxParty: number };
  stalls: { serviceMean: number; serviceCV: number; popularitySkew: number; queueAversion: number };
  eat: { mean: number; cv: number; linger: number };
  move: { walkSpeed: number; traySpeed: number };
  search: { visibility: number; patience: number; parallel: boolean; emptyTableDetour: number };
  tray: { dropTime: number; slots: number };
  layout: {
    cols: number;
    rows: number;
    seatsPerSide: number;
    verticalAisle: number;
    horizontalAisle: number;
    stallCount: number;
    queueDepth: number;
  };
}

export function defaultConfig(): Config {
  return {
    seed: 1,
    crowd: { totalPeople: 1800, windowStart: 660, windowEnd: 810, peakTime: 735, peakShare: 0.6, peakSpread: 900, groupMix: [25, 30, 20, 15, 5, 5] },
    reserve: { percentA: 0.5, claimMode: 'oneClaimer', claimSearchLimit: 60, shareMinEmpty: 4, shareMaxParty: 2 },
    stalls: { serviceMean: 90, serviceCV: 0.5, popularitySkew: 0.6, queueAversion: 1.0 },
    eat: { mean: 1080, cv: 0.3, linger: 0 },
    move: { walkSpeed: 1.3, traySpeed: 1.0 },
    search: { visibility: 10, patience: 300, parallel: false, emptyTableDetour: 0 },
    tray: { dropTime: 5, slots: 3 },
    layout: { cols: 10, rows: 10, seatsPerSide: 3, verticalAisle: 1.2, horizontalAisle: 0.75, stallCount: 30, queueDepth: 5.0 },
  };
}
